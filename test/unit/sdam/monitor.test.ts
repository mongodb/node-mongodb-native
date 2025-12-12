import { once } from 'node:events';
import * as net from 'node:net';
import * as process from 'node:process';

import { Long, ObjectId } from 'bson';
import { expect } from 'chai';
import { satisfies } from 'semver';
import * as sinon from 'sinon';
import { setTimeout } from 'timers';
import { setTimeout as setTimeoutPromise } from 'timers/promises';

import { LEGACY_HELLO_COMMAND } from '../../../src/constants';
import { MongoClient } from '../../../src/mongo_client';
import { ServerType } from '../../../src/sdam/common';
import {
  type ServerHeartbeatFailedEvent,
  type ServerHeartbeatStartedEvent,
  ServerHeartbeatSucceededEvent
} from '../../../src/sdam/events';
import { Monitor, MonitorInterval, RTTSampler } from '../../../src/sdam/monitor';
import { ServerDescription } from '../../../src/sdam/server_description';
import { isHello } from '../../../src/utils';
import * as mock from '../../tools/mongodb-mock/index';
import { topologyWithPlaceholderClient } from '../../tools/utils';
import { createTimerSandbox } from '../timer_sandbox';

class MockServer {
  pool: any;
  description: ServerDescription;
  topology: any;
  constructor(options) {
    this.pool = { generation: 1 };
    this.description = new ServerDescription(`${options.host}:${options.port}`);
    this.description.type = ServerType.Unknown;
    this.topology = {
      s: { topologyId: 1 },
      client: {
        mongoLogger: {
          debug: function (_v: any, _x: any) {
            return;
          }
        },
        options: {}
      }
    };
  }
}

describe('monitoring', function () {
  let mockServer;

  beforeEach(function () {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const test = this.currentTest!;

    const failingTests = [
      'should connect and issue an initial server check',
      'should ignore attempts to connect when not already closed',
      'should not initiate another check if one is in progress',
      'should not close the monitor on a failed heartbeat',
      'should upgrade to hello from legacy hello when initial handshake contains helloOk',
      'correctly returns the mean of the heartbeat durations'
    ];
    test.skipReason =
      satisfies(process.version, '>=18.0.0') && failingTests.includes(test.title)
        ? 'TODO(NODE-5666): fix failing unit tests on Node18'
        : undefined;

    if (test.skipReason) this.skip();
  });

  after(() => mock.cleanup());

  beforeEach(function () {
    return mock.createServer().then(server => (mockServer = server));
  });

  // TODO(NODE-3819): Unskip flaky tests.
  it.skip('should record roundTripTime', function (done) {
    mockServer.setMessageHandler(request => {
      const doc = request.document;
      if (isHello(doc)) {
        request.reply(Object.assign({}, mock.HELLO));
      } else if (doc.endSessions) {
        request.reply({ ok: 1 });
      }
    });

    // set `heartbeatFrequencyMS` to 250ms to force a quick monitoring check, and wait 500ms to validate below
    const topology = topologyWithPlaceholderClient(mockServer.hostAddress(), {
      heartbeatFrequencyMS: 250
    });
    topology.connect(err => {
      expect(err).to.not.exist;

      setTimeout(() => {
        expect(topology).property('description').property('servers').to.have.length(1);

        const serverDescription = Array.from(topology.description.servers.values())[0];
        expect(serverDescription).property('roundTripTime').to.be.greaterThan(0);

        topology.close();
        done();
      }, 500);
    });
  }).skipReason = 'TODO(NODE-3819): Unskip flaky tests';

  // TODO(NODE-3600): Unskip flaky test
  it.skip('should recover on error during initial connect', function (done) {
    // This test should take ~1s because initial server selection fails and an immediate check
    // is requested. If the behavior of the immediate check is broken, the test will take ~10s
    // to complete. We want to ensure validation of the immediate check behavior, and therefore
    // hardcode the test timeout to 2s.
    this.timeout(2000);

    let acceptConnections = false;
    mockServer.setMessageHandler(request => {
      if (!acceptConnections) {
        request.connection.destroy();
        return;
      }

      const doc = request.document;
      if (isHello(doc)) {
        request.reply(Object.assign({}, mock.HELLO));
      } else if (doc.endSessions) {
        request.reply({ ok: 1 });
      }
    });

    setTimeout(() => {
      acceptConnections = true;
    }, 250);

    const topology = topologyWithPlaceholderClient(mockServer.hostAddress(), {});
    topology.connect(err => {
      expect(err).to.not.exist;
      expect(topology).property('description').property('servers').to.have.length(1);

      const serverDescription = Array.from(topology.description.servers.values())[0];
      expect(serverDescription).property('roundTripTime').to.be.greaterThan(0);

      topology.close({}, done);
    });
  }).skipReason = 'TODO(NODE-3600): Unskip flaky tests';

  describe('Monitor', function () {
    let monitor: Monitor | null;

    beforeEach(() => {
      monitor = null;
    });

    afterEach(() => {
      if (monitor) {
        monitor.close();
      }
    });

    it('should connect and issue an initial server check', async function () {
      mockServer.setMessageHandler(request => {
        const doc = request.document;
        if (isHello(doc)) {
          request.reply(Object.assign({}, mock.HELLO));
        }
      });

      const server = new MockServer(mockServer.address());
      monitor = new Monitor(server as any, {} as any);

      const heartbeatFailed = once(monitor, 'serverHeartbeatFailed');
      const heartbeatSucceeded = once(monitor, 'serverHeartbeatSucceeded');
      monitor.connect();

      const res = await Promise.race([heartbeatFailed, heartbeatSucceeded]);

      expect(res[0]).to.be.instanceOf(ServerHeartbeatSucceededEvent);
      expect(monitor.connection).to.have.property('id', '<monitor>');
    });

    it('should ignore attempts to connect when not already closed', async function () {
      mockServer.setMessageHandler(request => {
        const doc = request.document;
        if (isHello(doc)) {
          request.reply(Object.assign({}, mock.HELLO));
        }
      });

      const server = new MockServer(mockServer.address());
      monitor = new Monitor(server as any, {} as any);

      const heartbeatFailed = once(monitor, 'serverHeartbeatFailed');
      const heartbeatSucceeded = once(monitor, 'serverHeartbeatSucceeded');
      monitor.connect();

      const res = await Promise.race([heartbeatFailed, heartbeatSucceeded]);

      expect(res[0]).to.be.instanceOf(ServerHeartbeatSucceededEvent);
      monitor.connect();
    });

    it('should not initiate another check if one is in progress', async function () {
      mockServer.setMessageHandler(request => {
        const doc = request.document;
        if (isHello(doc)) {
          setTimeout(() => request.reply(Object.assign({}, mock.HELLO)), 250);
        }
      });

      const server = new MockServer(mockServer.address());
      monitor = new Monitor(server as any, {} as any);

      const startedEvents: ServerHeartbeatStartedEvent[] = [];
      monitor.on('serverHeartbeatStarted', event => startedEvents.push(event));
      const monitorClose = once(monitor, 'close');

      monitor.connect();
      await once(monitor, 'serverHeartbeatSucceeded');
      monitor.requestCheck();
      monitor.requestCheck();
      monitor.requestCheck();
      monitor.requestCheck();
      monitor.requestCheck();

      const minHeartbeatFrequencyMS = 500;
      await setTimeoutPromise(minHeartbeatFrequencyMS);

      await once(monitor, 'serverHeartbeatSucceeded');
      monitor.close();

      await monitorClose;
      expect(startedEvents).to.have.length(2);
    });

    it('should not close the monitor on a failed heartbeat', async function () {
      let helloCount = 0;
      mockServer.setMessageHandler(request => {
        const doc = request.document;
        if (isHello(doc)) {
          helloCount++;
          if (helloCount === 2) {
            request.reply({ ok: 0, errmsg: 'forced from mock server' });
            return;
          }

          if (helloCount === 3) {
            request.connection.destroy();
            return;
          }

          request.reply(mock.HELLO);
        }
      });

      const server = new MockServer(mockServer.address());
      server.description = new ServerDescription(server.description.hostAddress);
      monitor = new Monitor(
        server as any,
        {
          heartbeatFrequencyMS: 250,
          minHeartbeatFrequencyMS: 50
        } as any
      );

      const events: ServerHeartbeatFailedEvent[] = [];
      monitor.on('serverHeartbeatFailed', event => events.push(event));

      let successCount = 0;
      monitor.on('serverHeartbeatSucceeded', () => {
        if (successCount++ === 2) {
          monitor?.close();
        }
      });

      monitor.connect();
      await once(monitor, 'close');
      expect(events).to.have.length(2);
    });

    it('should upgrade to hello from legacy hello when initial handshake contains helloOk', function (done) {
      const docs: any[] = [];
      mockServer.setMessageHandler(request => {
        const doc = request.document;
        docs.push(doc);
        if (docs.length === 2) {
          expect(docs[0]).to.have.property(LEGACY_HELLO_COMMAND, 1);
          expect(docs[0]).to.have.property('helloOk', true);
          expect(docs[1]).to.have.property('hello', 1);
          done();
        } else if (isHello(doc)) {
          setTimeout(() => request.reply(Object.assign({ helloOk: true }, mock.HELLO)), 250);
        }
      });

      const server = new MockServer(mockServer.address());
      monitor = new Monitor(server as any, {} as any);

      monitor.connect();
      monitor.once('serverHeartbeatSucceeded', () => {
        const minHeartbeatFrequencyMS = 500;
        setTimeout(() => {
          // wait for minHeartbeatFrequencyMS, then request a check and verify another check occurred
          monitor.once('serverHeartbeatSucceeded', () => {
            monitor.close();
          });

          monitor.requestCheck();
        }, minHeartbeatFrequencyMS);
      });
    });

    describe('roundTripTime', function () {
      const table = [
        {
          serverMonitoringMode: 'stream',
          topologyVersion: {
            processId: new ObjectId(),
            counter: new Long(0, 0)
          }
        },
        { serverMonitoringMode: 'poll', topologyVersion: undefined }
      ];
      for (const { serverMonitoringMode, topologyVersion } of table) {
        context(`when serverMonitoringMode = ${serverMonitoringMode}`, () => {
          context('when more than one heartbeatSucceededEvent has been captured', () => {
            let heartbeatDurationMS = 100;
            it('correctly returns the mean of the heartbeat durations', async () => {
              mockServer.setMessageHandler(request => {
                setTimeout(
                  () => request.reply(Object.assign({ helloOk: true }, mock.HELLO)),
                  heartbeatDurationMS
                );
                heartbeatDurationMS += 100;
              });
              const server = new MockServer(mockServer.address());
              if (topologyVersion) server.description.topologyVersion = topologyVersion;
              monitor = new Monitor(server as any, { serverMonitoringMode } as any);
              monitor.connect();

              for (let i = 0; i < 5; i++) {
                await once(monitor, 'serverHeartbeatSucceeded');
                monitor.requestCheck();
              }

              const avgRtt = monitor.roundTripTime;
              // expected avgRtt = (100 + 200 + 300 + 400 + 500)/5 = 300ms
              // avgRtt will strictly be greater than 300ms since setTimeout sets a minimum
              // delay from the time of scheduling to the time of callback execution
              expect(avgRtt).to.be.within(300, 350);

              monitor.close();
            });
          });
        });
      }
    });
  });

  describe('class MonitorInterval', function () {
    let timerSandbox, clock, executor, fnSpy;

    beforeEach(function () {
      timerSandbox = createTimerSandbox();
      clock = sinon.useFakeTimers();
      fnSpy = sinon.spy(cb => {
        cb();
      });
    });

    afterEach(function () {
      if (executor) {
        executor.stop();
      }
      clock.restore();
      timerSandbox.restore();
    });

    context('#constructor()', function () {
      context('when the immediate option is provided', function () {
        it('executes the function immediately and schedules the next execution on the interval', function () {
          executor = new MonitorInterval(fnSpy, {
            immediate: true,
            minHeartbeatFrequencyMS: 10,
            heartbeatFrequencyMS: 30
          });
          // expect immediate invocation
          expect(fnSpy.calledOnce).to.be.true;
          // advance clock by less than the scheduled interval to ensure we don't execute early
          clock.tick(29);
          expect(fnSpy.calledOnce).to.be.true;
          // advance clock to the interval
          clock.tick(1);
          expect(fnSpy.calledTwice).to.be.true;
        });
      });

      context('when the immediate option is not provided', function () {
        it('executes the function on the provided interval', function () {
          executor = new MonitorInterval(fnSpy, {
            minHeartbeatFrequencyMS: 10,
            heartbeatFrequencyMS: 30
          });
          // advance clock by less than the scheduled interval to ensure we don't execute early
          clock.tick(29);
          expect(fnSpy.callCount).to.equal(0);
          // advance clock to the interval
          clock.tick(1);
          expect(fnSpy.calledOnce).to.be.true;
          // advance clock by the interval
          clock.tick(30);
          expect(fnSpy.calledTwice).to.be.true;
        });
      });
    });

    describe('#wake()', function () {
      context('when fn()  has not executed yet', function () {
        beforeEach(function () {
          executor = new MonitorInterval(fnSpy, {
            minHeartbeatFrequencyMS: 10,
            heartbeatFrequencyMS: 30
          });

          // tick less than heartbeatFrequencyMS
          clock.tick(5);

          executor.wake();
        });
        it('executes immediately', function () {
          expect(fnSpy.calledOnce).to.be.true;
        });
        it('schedules fn() for heartbeatFrequencyMS away', function () {
          // advance the clock almost heartbeatFrequencyMS away
          clock.tick(29);
          expect(fnSpy.calledOnce).to.be.true;

          // advance it to heartbeatFrequencyMS
          clock.tick(1);
          expect(fnSpy.calledTwice).to.be.true;
        });
      });

      context('when fn() is in progress', function () {
        beforeEach(function () {
          // create an asynchronous spy
          fnSpy = sinon.spy(cb => setTimeout(cb, 5));

          executor = new MonitorInterval(fnSpy, {
            minHeartbeatFrequencyMS: 10,
            heartbeatFrequencyMS: 30
          });

          // advance to point of execution
          clock.tick(30);
        });
        it('does not trigger another call to fn()', function () {
          executor.wake();
          executor.wake();
          executor.wake();
          executor.wake();

          expect(fnSpy.calledOnce).to.be.true;
        });
      });

      context('when it has been >=minHeartbeatFrequencyMS since fn() last completed', function () {
        beforeEach(function () {
          executor = new MonitorInterval(fnSpy, {
            minHeartbeatFrequencyMS: 10,
            heartbeatFrequencyMS: 30
          });

          // call fn() once
          clock.tick(30);
          expect(fnSpy.calledOnce).to.be.true;

          fnSpy.callCount = 0;

          // advance further than minHeartbeatFrequency
          clock.tick(20);

          executor.wake();
        });
        it('executes fn() immediately', function () {
          expect(fnSpy.calledOnce).to.be.true;
        });
        it('schedules fn() for heartbeatFrequencyMS away', function () {
          clock.tick(29);
          expect(fnSpy.calledOnce).to.be.true;
          clock.tick(1);
          expect(fnSpy.calledTwice).to.be.true;
        });
      });

      context(
        'when it has been < minHeartbeatFrequencyMS and >= 0 since fn() last completed',
        function () {
          beforeEach(function () {
            executor = new MonitorInterval(fnSpy, {
              minHeartbeatFrequencyMS: 10,
              heartbeatFrequencyMS: 30
            });

            // call fn() once
            clock.tick(30);
            expect(fnSpy.calledOnce).to.be.true;

            fnSpy.callCount = 0;

            // advance less than minHeartbeatFrequency
            clock.tick(5);

            executor.wake();
          });

          it('reschedules fn() to minHeartbeatFrequencyMS after the last call', function () {
            expect(fnSpy.callCount).to.equal(0);
            clock.tick(5);
            expect(fnSpy.calledOnce).to.be.true;
          });

          context('when wake() is called more than once', function () {
            it('schedules fn() minHeartbeatFrequencyMS after the last call to fn()', function () {
              executor.wake();
              executor.wake();
              executor.wake();

              expect(fnSpy.callCount).to.equal(0);
              clock.tick(5);
              expect(fnSpy.calledOnce).to.be.true;
            });
          });
        }
      );

      context('when it has been <0 since fn() has last executed', function () {
        beforeEach(function () {
          executor = new MonitorInterval(fnSpy, {
            minHeartbeatFrequencyMS: 10,
            heartbeatFrequencyMS: 30
          });

          // negative ticks aren't supported, so manually set execution time
          executor.lastExecutionEnded = Infinity;
          executor.wake();
        });

        it('executes fn() immediately', function () {
          expect(fnSpy.calledOnce).to.be.true;
        });

        it('reschedules fn() to minHeartbeatFrequency away', function () {
          fnSpy.callCount = 0;

          clock.tick(29);
          expect(fnSpy.callCount).to.equal(0);

          clock.tick(1);
          expect(fnSpy.calledOnce).to.be.true;
        });
      });
    });

    describe('#stop()', function () {
      context('when fn() is executing', function () {
        beforeEach(function () {
          // create an asynchronous spy
          fnSpy = sinon.spy(cb => setTimeout(cb, 5));

          executor = new MonitorInterval(fnSpy, {
            minHeartbeatFrequencyMS: 10,
            heartbeatFrequencyMS: 30
          });

          // advance to point of execution
          clock.tick(30);

          executor.stop();
        });
        it('does not reschedule fn() after fn() finishes executing', function () {
          // exhaust the spy fn
          clock.tick(5);

          expect(fnSpy.calledOnce).to.be.true;

          // advance heartbeatFrequencyMS
          clock.tick(30);
          expect(fnSpy.calledOnce).to.be.true;
        });
      });
      context('when fn() is not executing', function () {
        beforeEach(function () {
          executor = new MonitorInterval(fnSpy, {
            minHeartbeatFrequencyMS: 10,
            heartbeatFrequencyMS: 30
          });

          executor.stop();

          // advance heartbeatFrequencyMS
          clock.tick(30);
        });
        it('clears any scheduled executions of fn()', function () {
          expect(fnSpy.callCount).to.equal(0);
        });
      });
    });

    context('when fn() returns an error', function () {
      let uncaughtErrors = [];
      beforeEach(function () {
        uncaughtErrors = [];
        process.on('uncaughtException', e => uncaughtErrors.push(e));

        fnSpy = sinon.spy(cb => cb(new Error('ahh')));

        executor = new MonitorInterval(fnSpy, {
          minHeartbeatFrequencyMS: 10,
          heartbeatFrequencyMS: 30
        });

        clock.tick(30);
      });

      afterEach(() => process.removeAllListeners());

      it('no error is thrown by the MonitorInterval', function () {
        expect(uncaughtErrors).to.have.lengthOf(0);
      });
      it('reschedules another call to fn() for heartbeatFrequencyMS in the future', function () {
        clock.tick(30);
        expect(fnSpy.calledTwice).to.be.true;
      });
    });
  });

  describe('Heartbeat duration', function () {
    let client: MongoClient;
    let serverHeartbeatFailed;
    let sockets;

    beforeEach(async function () {
      sockets = [];
      // Artificially make creating a connection take 200ms
      sinon.stub(net, 'createConnection').callsFake(function () {
        const socket = new net.Socket();
        sockets.push(socket);
        setTimeout(() => socket.emit('connect'), 80);
        socket.on('data', () => socket.destroy(new Error('I am not real!')));
        return socket;
      });

      client = new MongoClient(`mongodb://localhost:1`, { serverSelectionTimeoutMS: 200 });
      client.on('serverHeartbeatFailed', ev => (serverHeartbeatFailed = ev));
    });

    afterEach(function () {
      sinon.restore();
      for (const socket of sockets ?? []) socket.destroy();
      sockets = undefined;
    });

    it('includes only the time to perform handshake', async function () {
      const maybeError = await client.connect().catch(e => e);
      expect(maybeError).to.be.instanceOf(Error);
      expect(serverHeartbeatFailed).to.have.property('duration').that.is.lessThan(20); // way less than 80ms
    });
  });

  describe('class RTTSampler', () => {
    describe('constructor', () => {
      it('Constructs a Float64 array of length windowSize', () => {
        const sampler = new RTTSampler(10);
        // @ts-expect-error Accessing internal state
        expect(sampler.rttSamples).to.have.length(10);
      });
    });

    describe('addSample', () => {
      context('when length < windowSize', () => {
        it('increments the length', () => {
          const sampler = new RTTSampler(10);
          expect(sampler).to.have.property('length', 0);

          sampler.addSample(1);

          expect(sampler).to.have.property('length', 1);
        });
      });
      context('when length === windowSize', () => {
        let sampler: RTTSampler;
        const size = 10;

        beforeEach(() => {
          sampler = new RTTSampler(size);
          for (let i = 1; i <= size; i++) {
            sampler.addSample(i);
          }
        });

        it('does not increment the length', () => {
          sampler.addSample(size + 1);
          expect(sampler).to.have.property('length', size);
        });

        it('overwrites the oldest element', () => {
          sampler.addSample(size + 1);
          // @ts-expect-error Accessing internal state
          for (const el of sampler.rttSamples) {
            if (el === 1) expect.fail('Did not overwrite oldest element');
          }
        });

        it('appends the new element to the end of the window', () => {
          sampler.addSample(size + 1);
          expect(sampler.last).to.equal(size + 1);
        });
      });
    });

    describe('min()', () => {
      context('when length < 2', () => {
        it('returns 0', () => {
          const sampler = new RTTSampler(10);
          // length 0
          expect(sampler.min()).to.equal(0);

          sampler.addSample(1);
          // length 1
          expect(sampler.min()).to.equal(0);
        });
      });

      context('when 2 <= length < windowSize', () => {
        let sampler: RTTSampler;
        beforeEach(() => {
          sampler = new RTTSampler(10);
          for (let i = 1; i <= 3; i++) {
            sampler.addSample(i);
          }
        });

        it('correctly computes the minimum', () => {
          expect(sampler.min()).to.equal(1);
        });
      });

      context('when length == windowSize', () => {
        let sampler: RTTSampler;
        const size = 10;

        beforeEach(() => {
          sampler = new RTTSampler(size);
          for (let i = 1; i <= size * 2; i++) {
            sampler.addSample(i);
          }
        });

        it('correctly computes the minimum', () => {
          expect(sampler.min()).to.equal(size + 1);
        });
      });
    });

    describe('average()', () => {
      it('correctly computes the mean', () => {
        const sampler = new RTTSampler(10);
        let sum = 0;

        for (let i = 1; i <= 10; i++) {
          sum += i;
          sampler.addSample(i);
        }

        expect(sampler.average()).to.equal(sum / 10);
      });
    });

    describe('last', () => {
      context('when length == 0', () => {
        it('returns null', () => {
          const sampler = new RTTSampler(10);
          expect(sampler.last).to.be.null;
        });
      });

      context('when length > 0', () => {
        it('returns the most recently inserted element', () => {
          const sampler = new RTTSampler(10);
          for (let i = 0; i < 11; i++) {
            sampler.addSample(i);
          }
          expect(sampler.last).to.equal(10);
        });
      });
    });

    describe('clear', () => {
      let sampler: RTTSampler;

      beforeEach(() => {
        sampler = new RTTSampler(10);
        for (let i = 0; i < 20; i++) {
          sampler.addSample(i);
        }
        expect(sampler).to.have.property('length', 10);
      });

      it('sets length to 0', () => {
        sampler.clear();
        expect(sampler).to.have.property('length', 0);
      });
    });
  });
});
