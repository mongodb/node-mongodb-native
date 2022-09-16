import { expect } from 'chai';
import * as sinon from 'sinon';
import { setTimeout } from 'timers';

import { LEGACY_HELLO_COMMAND } from '../../../src/constants';
import { ServerType } from '../../../src/sdam/common';
import { ServerHeartbeatFailedEvent, ServerHeartbeatStartedEvent } from '../../../src/sdam/events';
import { Monitor, MonitorInterval } from '../../../src/sdam/monitor';
import { ServerDescription } from '../../../src/sdam/server_description';
import { Topology } from '../../../src/sdam/topology';
import { isHello } from '../../../src/utils';
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

        topology.close(done as any);
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

      topology.close(done);
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
          expect(docs[0]).to.have.property(LEGACY_HELLO_COMMAND, true);
          expect(docs[0]).to.have.property('helloOk', true);
          expect(docs[1]).to.have.property('hello', true);
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

    describe('#wake', function () {
      context('when the time until next call is negative', () => {
        // somehow we missed the execution, due to an unreliable clock

        it('should execute immediately and schedule the next execution on the interval if this is the first wake', () => {
          let fakeClockHasTicked = false;
          executor = new MonitorInterval(fnSpy, {
            minHeartbeatFrequencyMS: 10,
            heartbeatFrequencyMS: 30,
            clock: () => {
              if (fakeClockHasTicked) {
                return 81;
              }
              fakeClockHasTicked = true;
              return 50;
            }
          });

          // tick the environment clock by a smaller amount than the interval
          clock.tick(2);
          // sanity check to make sure we haven't called execute yet
          expect(fnSpy.callCount).to.equal(0);
          executor.wake();
          // expect immediate execution since expected next call time was 50 + 30 = 80, but the clock shows 81
          expect(fnSpy.calledOnce).to.be.true;
          // move forward by more than minInterval but less than full interval to ensure we're scheduling correctly
          clock.tick(29);
          expect(fnSpy.calledOnce).to.be.true;
          // move forward by the full interval to make sure the scheduled call executes
          clock.tick(1);
          expect(fnSpy.calledTwice).to.be.true;
        });

        it('should execute immediately and schedule the next execution on the interval if this is a repeated wake and the current execution is not rescheduled', () => {
          let fakeClockTickCount = 0;
          executor = new MonitorInterval(fnSpy, {
            minHeartbeatFrequencyMS: 10,
            heartbeatFrequencyMS: 30,
            clock: () => {
              if (fakeClockTickCount === 0) {
                // on init, return arbitrary starting time
                fakeClockTickCount++;
                return 50;
              }
              if (fakeClockTickCount === 1) {
                // expected execution time is 80
                // on first wake return a time so less than minInterval is left and no need to reschedule
                fakeClockTickCount++;
                return 71;
              }
              return 81;
            }
          });

          // tick the clock by a small amount before and after the wake to make sure no unexpected async things are happening
          clock.tick(11);
          executor.wake();
          clock.tick(5);
          expect(fnSpy.callCount).to.equal(0);
          // call our second wake that gets the overdue timer, so expect immediate execution
          executor.wake();
          expect(fnSpy.calledOnce).to.be.true;
          // move forward by more than minInterval but less than full interval to ensure we're scheduling correctly
          clock.tick(29);
          expect(fnSpy.calledOnce).to.be.true;
          // move forward by the full interval to make sure the scheduled call executes
          clock.tick(1);
          expect(fnSpy.calledTwice).to.be.true;
        });

        it('should execute immediately and schedule the next execution on the interval if this is a repeated wake even if the current execution is rescheduled', () => {
          let fakeClockTickCount = 0;
          executor = new MonitorInterval(fnSpy, {
            minHeartbeatFrequencyMS: 10,
            heartbeatFrequencyMS: 30,
            clock: () => {
              if (fakeClockTickCount === 0) {
                // on init, return arbitrary starting time
                fakeClockTickCount++;
                return 50;
              }
              if (fakeClockTickCount === 1) {
                // expected execution time is 80
                // on first wake return a time so that more than minInterval is left
                fakeClockTickCount++;
                return 61;
              }
              return 81;
            }
          });

          // tick the clock by a small amount before and after the wake to make sure no unexpected async things are happening
          clock.tick(2);
          executor.wake();
          clock.tick(9);
          expect(fnSpy.callCount).to.equal(0);
          // call our second wake that gets the overdue timer, so expect immediate execution
          executor.wake();
          expect(fnSpy.calledOnce).to.be.true;
          // move forward by more than minInterval but less than full interval to ensure we're scheduling correctly
          clock.tick(29);
          expect(fnSpy.calledOnce).to.be.true;
          // move forward by the full interval to make sure the scheduled call executes
          clock.tick(1);
          expect(fnSpy.calledTwice).to.be.true;
        });
      });

      context('when the time until next call is less than the minInterval', () => {
        // we can't make it go any faster, so we should let the scheduled execution run

        it('should execute on the interval if this is the first wake', () => {
          executor = new MonitorInterval(fnSpy, {
            minHeartbeatFrequencyMS: 10,
            heartbeatFrequencyMS: 30
          });
          // tick the environment clock so that less than minInterval is left
          clock.tick(21);
          executor.wake();
          // move forward to just before exepected execution time
          clock.tick(8);
          expect(fnSpy.callCount).to.equal(0);
          // move forward to the full interval to make sure the scheduled call executes
          clock.tick(1);
          expect(fnSpy.calledOnce).to.be.true;
          // check to make sure the next execution runs as expected
          clock.tick(29);
          expect(fnSpy.calledOnce).to.be.true;
          clock.tick(1);
          expect(fnSpy.calledTwice).to.be.true;
        });

        it('should execute on the original interval if this is a repeated wake and the current execution is not rescheduled', () => {
          executor = new MonitorInterval(fnSpy, {
            minHeartbeatFrequencyMS: 10,
            heartbeatFrequencyMS: 30
          });
          // tick the environment clock so that less than minInterval is left
          clock.tick(21);
          executor.wake();
          // tick the environment clock some more so that the next wake is called at a different time
          clock.tick(2);
          executor.wake();
          // tick to just before the expected execution time
          clock.tick(6);
          expect(fnSpy.callCount).to.equal(0);
          // tick up to 20 for the expected execution
          clock.tick(1);
          expect(fnSpy.calledOnce).to.be.true;
          // check to make sure the next execution runs as expected
          clock.tick(29);
          expect(fnSpy.calledOnce).to.be.true;
          clock.tick(1);
          expect(fnSpy.calledTwice).to.be.true;
        });

        it('should execute on the minInterval from the first wake if this is a repeated wake and the current execution is rescheduled', () => {
          executor = new MonitorInterval(fnSpy, {
            minHeartbeatFrequencyMS: 10,
            heartbeatFrequencyMS: 30
          });
          // tick the environment clock so that more than minInterval is left
          clock.tick(13);
          executor.wake();
          // the first wake should move up the execution to occur at 23 ticks from the start
          // we tick 8 to get to 21, so that less than minInterval is left on the original interval expected execution
          clock.tick(8);
          executor.wake();
          // now we tick to just before the rescheduled execution time
          clock.tick(1);
          expect(fnSpy.callCount).to.equal(0);
          // tick up to 23 for the expected execution
          clock.tick(1);
          expect(fnSpy.calledOnce).to.be.true;
          // check to make sure the next execution runs as expected
          clock.tick(29);
          expect(fnSpy.calledOnce).to.be.true;
          clock.tick(1);
          expect(fnSpy.calledTwice).to.be.true;
        });
      });

      context('when the time until next call is more than the minInterval', () => {
        // expedite the execution to minInterval

        it('should execute on the minInterval if this is the first wake', () => {
          executor = new MonitorInterval(fnSpy, {
            minHeartbeatFrequencyMS: 10,
            heartbeatFrequencyMS: 30
          });
          // tick the environment clock so that more than minInterval is left
          clock.tick(3);
          executor.wake();
          // the first wake should move up the execution to occur at 13 ticks from the start
          // we tick to just before the rescheduled execution time
          clock.tick(9);
          expect(fnSpy.callCount).to.equal(0);
          // tick up to 13 for the expected execution
          clock.tick(1);
          expect(fnSpy.calledOnce).to.be.true;
          // check to make sure the next execution runs as expected
          clock.tick(29);
          expect(fnSpy.calledOnce).to.be.true;
          clock.tick(1);
          expect(fnSpy.calledTwice).to.be.true;
        });

        it('should execute on the minInterval from the first wake if this is a repeated wake', () => {
          // NOTE: under regular circumstances, if the second wake is early enough to warrant a reschedule
          // then the first wake must have already warranted a reschedule
          executor = new MonitorInterval(fnSpy, {
            minHeartbeatFrequencyMS: 10,
            heartbeatFrequencyMS: 30
          });
          // tick the environment clock so that more than minInterval is left
          clock.tick(3);
          executor.wake();
          // the first wake should move up the execution to occur at 13 ticks from the start
          // we tick a bit more so that more than minInterval is still left and call our repeated wake
          clock.tick(2);
          executor.wake();
          // tick up to just before the expected execution
          clock.tick(7);
          expect(fnSpy.callCount).to.equal(0);
          // now go up to 13
          clock.tick(1);
          expect(fnSpy.calledOnce).to.be.true;
          // check to make sure the next execution runs as expected
          clock.tick(29);
          expect(fnSpy.calledOnce).to.be.true;
          clock.tick(1);
          expect(fnSpy.calledTwice).to.be.true;
        });
      });
    });
  });
});
