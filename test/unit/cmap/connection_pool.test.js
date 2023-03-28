'use strict';

const { ConnectionPool } = require('../../mongodb');
const { WaitQueueTimeoutError } = require('../../mongodb');
const mock = require('../../tools/mongodb-mock/index');
const sinon = require('sinon');
const { expect } = require('chai');
const { setImmediate } = require('timers');
const { ns, isHello } = require('../../mongodb');
const { LEGACY_HELLO_COMMAND } = require('../../mongodb');
const { createTimerSandbox } = require('../timer_sandbox');

describe('Connection Pool', function () {
  let server;
  after(() => mock.cleanup());
  before(() => mock.createServer().then(s => (server = s)));

  it('should destroy connections which have been closed', function (done) {
    server.setMessageHandler(request => {
      const doc = request.document;
      if (isHello(doc)) {
        request.reply(mock.HELLO);
      } else {
        // destroy on any other command
        request.connection.destroy();
      }
    });

    const pool = new ConnectionPool(server, { maxPoolSize: 1, hostAddress: server.hostAddress() });
    pool.ready();

    const events = [];
    pool.on('connectionClosed', event => events.push(event));

    pool.checkOut((err, conn) => {
      expect(err).to.not.exist;

      conn.command(ns('admin.$cmd'), { ping: 1 }, undefined, (err, result) => {
        expect(err).to.exist;
        expect(result).to.not.exist;

        pool.checkIn(conn);

        expect(events).to.have.length(1);
        const closeEvent = events[0];
        expect(closeEvent).have.property('reason').equal('error');
      });
    });

    pool.withConnection(
      undefined,
      (err, conn, cb) => {
        expect(err).to.not.exist;
        cb();
      },
      () => {
        pool.close(done);
      }
    );
  });

  it('should propagate socket timeouts to connections', function (done) {
    server.setMessageHandler(request => {
      const doc = request.document;
      if (isHello(doc)) {
        request.reply(mock.HELLO);
      } else {
        // blackhole other requests
      }
    });

    const pool = new ConnectionPool(server, {
      maxPoolSize: 1,
      socketTimeoutMS: 200,
      hostAddress: server.hostAddress()
    });

    pool.ready();

    pool.withConnection(
      (err, conn, cb) => {
        expect(err).to.not.exist;
        conn.command(ns('admin.$cmd'), { ping: 1 }, undefined, (err, result) => {
          expect(err).to.exist;
          expect(result).to.not.exist;
          expect(err).to.match(/timed out/);
          cb();
        });
      },
      () => pool.close(done)
    );
  });

  it('should clear timed out wait queue members if no connections are available', function (done) {
    server.setMessageHandler(request => {
      const doc = request.document;
      if (isHello(doc)) {
        request.reply(mock.HELLO);
      }
    });

    const pool = new ConnectionPool(server, {
      maxPoolSize: 1,
      waitQueueTimeoutMS: 200,
      hostAddress: server.hostAddress()
    });

    pool.ready();

    pool.checkOut((err, conn) => {
      expect(err).to.not.exist;
      expect(conn).to.exist;

      pool.checkOut(err => {
        expect(err).to.exist.and.be.instanceOf(WaitQueueTimeoutError);

        // We can only process the wait queue with `checkIn` and `checkOut`, so we
        // force the pool here to think there are no available connections, even though
        // we are checking the connection back in. This simulates a slow leak where
        // incoming requests outpace the ability of the queue to fully process cancelled
        // wait queue members
        sinon.stub(pool, 'availableConnectionCount').get(() => 0);
        pool.checkIn(conn);

        setImmediate(() => expect(pool).property('waitQueueSize').to.equal(0));
        done();
      });
    });
  });

  describe('minPoolSize population', function () {
    let clock, timerSandbox;
    beforeEach(() => {
      timerSandbox = createTimerSandbox();
      clock = sinon.useFakeTimers();
    });

    afterEach(() => {
      if (clock) {
        timerSandbox.restore();
        clock.restore();
        clock = undefined;
      }
    });

    it('should respect the minPoolSizeCheckFrequencyMS option', function () {
      const pool = new ConnectionPool(server, {
        minPoolSize: 2,
        minPoolSizeCheckFrequencyMS: 42,
        hostAddress: server.hostAddress()
      });
      const ensureSpy = sinon.spy(pool, 'ensureMinPoolSize');

      // return a fake connection that won't get identified as perished
      const createConnStub = sinon
        .stub(pool, 'createConnection')
        .yields(null, { destroy: () => null, generation: 0 });

      pool.ready();

      // expect ensureMinPoolSize to execute immediately
      expect(ensureSpy).to.have.been.calledOnce;
      expect(createConnStub).to.have.been.calledOnce;

      // check that the successful connection return schedules another run
      clock.tick(42);
      expect(ensureSpy).to.have.been.calledTwice;
      expect(createConnStub).to.have.been.calledTwice;

      // check that the 2nd successful connection return schedules another run
      // but don't expect to get a new connection since we are at minPoolSize
      clock.tick(42);
      expect(ensureSpy).to.have.been.calledThrice;
      expect(createConnStub).to.have.been.calledTwice;

      // check that the next scheduled check runs even after we're at minPoolSize
      clock.tick(42);
      expect(ensureSpy).to.have.callCount(4);
      expect(createConnStub).to.have.been.calledTwice;
    });

    it('should default minPoolSizeCheckFrequencyMS to 100ms', function () {
      const pool = new ConnectionPool(server, {
        minPoolSize: 2,
        hostAddress: server.hostAddress()
      });
      const ensureSpy = sinon.spy(pool, 'ensureMinPoolSize');

      // return a fake connection that won't get identified as perished
      const createConnStub = sinon
        .stub(pool, 'createConnection')
        .yields(null, { destroy: () => null, generation: 0 });

      pool.ready();

      // expect ensureMinPoolSize to execute immediately
      expect(ensureSpy).to.have.been.calledOnce;
      expect(createConnStub).to.have.been.calledOnce;

      // check that the successful connection return schedules another run
      clock.tick(100);
      expect(ensureSpy).to.have.been.calledTwice;
      expect(createConnStub).to.have.been.calledTwice;

      // check that the 2nd successful connection return schedules another run
      // but don't expect to get a new connection since we are at minPoolSize
      clock.tick(100);
      expect(ensureSpy).to.have.been.calledThrice;
      expect(createConnStub).to.have.been.calledTwice;

      // check that the next scheduled check runs even after we're at minPoolSize
      clock.tick(100);
      expect(ensureSpy).to.have.callCount(4);
      expect(createConnStub).to.have.been.calledTwice;
    });
  });

  describe('withConnection', function () {
    it('should manage a connection for a successful operation', function (done) {
      server.setMessageHandler(request => {
        const doc = request.document;
        if (isHello(doc)) {
          request.reply(mock.HELLO);
        }
      });

      const pool = new ConnectionPool(server, { hostAddress: server.hostAddress() });
      pool.ready();

      const callback = (err, result) => {
        expect(err).to.not.exist;
        expect(result).to.exist;
        pool.close(done);
      };

      pool.withConnection((err, conn, cb) => {
        expect(err).to.not.exist;

        conn.command(
          ns('$admin.cmd'),
          { [LEGACY_HELLO_COMMAND]: 1 },
          undefined,
          (cmdErr, hello) => {
            expect(cmdErr).to.not.exist;
            cb(undefined, hello);
          }
        );
      }, callback);
    });

    it('should allow user interaction with an error', function (done) {
      server.setMessageHandler(request => {
        const doc = request.document;
        if (isHello(doc)) {
          request.connection.destroy();
        }
      });

      const pool = new ConnectionPool(server, {
        waitQueueTimeoutMS: 200,
        hostAddress: server.hostAddress()
      });

      pool.ready();

      const callback = err => {
        expect(err).to.exist;
        expect(err).to.match(/closed/);
        pool.close(done);
      };

      pool.withConnection(
        undefined,
        (err, conn, cb) => {
          expect(err).to.exist;
          expect(err).to.match(/closed/);
          cb(err);
        },
        callback
      );
    });

    it('should return an error to the original callback', function (done) {
      server.setMessageHandler(request => {
        const doc = request.document;
        if (isHello(doc)) {
          request.reply(mock.HELLO);
        }
      });

      const pool = new ConnectionPool(server, { hostAddress: server.hostAddress() });
      pool.ready();

      const callback = (err, result) => {
        expect(err).to.exist;
        expect(result).to.not.exist;
        expect(err).to.match(/my great error/);
        pool.close(done);
      };

      pool.withConnection(
        undefined,
        (err, conn, cb) => {
          expect(err).to.not.exist;
          cb(new Error('my great error'));
        },
        callback
      );
    });
  });
});
