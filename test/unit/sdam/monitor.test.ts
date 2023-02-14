import { expect } from 'chai';
import * as sinon from 'sinon';
import { setTimeout } from 'timers';

import {
  isHello,
  LEGACY_HELLO_COMMAND,
  Monitor,
  MonitorInterval,
  ServerDescription,
  ServerHeartbeatFailedEvent,
  ServerHeartbeatStartedEvent,
  ServerType,
  Topology
} from '../../mongodb';
import * as mock from '../../tools/mongodb-mock/index';
import { createTimerSandbox } from '../timer_sandbox';

class MockServer {
  s: any;
  description: ServerDescription;
  constructor(options) {
    this.s = { pool: { generation: 1 } };
    this.description = new ServerDescription(`${options.host}:${options.port}`);
    this.description.type = ServerType.Unknown;
  }
}

describe('monitoring', function () {
  let mockServer;

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
    const topology = new Topology(mockServer.hostAddress(), { heartbeatFrequencyMS: 250 } as any);
    topology.connect(err => {
      expect(err).to.not.exist;

      setTimeout(() => {
        expect(topology).property('description').property('servers').to.have.length(1);

        const serverDescription = Array.from(topology.description.servers.values())[0];
        expect(serverDescription).property('roundTripTime').to.be.greaterThan(0);

        topology.close({}, done as any);
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

    const topology = new Topology(mockServer.hostAddress(), {});
    topology.connect(err => {
      expect(err).to.not.exist;
      expect(topology).property('description').property('servers').to.have.length(1);

      const serverDescription = Array.from(topology.description.servers.values())[0];
      expect(serverDescription).property('roundTripTime').to.be.greaterThan(0);

      topology.close({}, done);
    });
  }).skipReason = 'TODO(NODE-3600): Unskip flaky tests';

  describe('Monitor', function () {
    let monitor;

    beforeEach(() => {
      monitor = null;
    });

    afterEach(() => {
      if (monitor) {
        monitor.close();
      }
    });

    it('should connect and issue an initial server check', function (done) {
      mockServer.setMessageHandler(request => {
        const doc = request.document;
        if (isHello(doc)) {
          request.reply(Object.assign({}, mock.HELLO));
        }
      });

      const server = new MockServer(mockServer.address());
      monitor = new Monitor(server as any, {} as any);

      monitor.on('serverHeartbeatFailed', () => done(new Error('unexpected heartbeat failure')));
      monitor.on('serverHeartbeatSucceeded', () => {
        expect(monitor.connection.isMonitoringConnection).to.be.true;
        done();
      });
      monitor.connect();
    });

    it('should ignore attempts to connect when not already closed', function (done) {
      mockServer.setMessageHandler(request => {
        const doc = request.document;
        if (isHello(doc)) {
          request.reply(Object.assign({}, mock.HELLO));
        }
      });

      const server = new MockServer(mockServer.address());
      monitor = new Monitor(server as any, {} as any);

      monitor.on('serverHeartbeatFailed', () => done(new Error('unexpected heartbeat failure')));
      monitor.on('serverHeartbeatSucceeded', () => done());
      monitor.connect();
      monitor.connect();
    });

    it('should not initiate another check if one is in progress', function (done) {
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
      monitor.on('close', () => {
        expect(startedEvents).to.have.length(2);
        done();
      });

      monitor.connect();
      monitor.once('serverHeartbeatSucceeded', () => {
        monitor.requestCheck();
        monitor.requestCheck();
        monitor.requestCheck();
        monitor.requestCheck();
        monitor.requestCheck();

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

    it('should not close the monitor on a failed heartbeat', function (done) {
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
          monitor.close();
        }
      });

      monitor.on('close', () => {
        expect(events).to.have.length(2);
        done();
      });

      monitor.connect();
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
});
