'use strict';

const { ConnectionPool } = require('../../../src/cmap/connection_pool');
const { WaitQueueTimeoutError } = require('../../../src/cmap/errors');
const mock = require('../../tools/mongodb-mock/index');
const cmapEvents = require('../../../src/cmap/connection_pool_events');
const sinon = require('sinon');
const { expect } = require('chai');
const { ns, isHello } = require('../../../src/utils');
const { LEGACY_HELLO_COMMAND } = require('../../../src/constants');

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

    const pool = new ConnectionPool({ maxPoolSize: 1, hostAddress: server.hostAddress() });

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

    const pool = new ConnectionPool({
      maxPoolSize: 1,
      socketTimeoutMS: 200,
      hostAddress: server.hostAddress()
    });

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

    const pool = new ConnectionPool({
      maxPoolSize: 1,
      waitQueueTimeoutMS: 200,
      hostAddress: server.hostAddress()
    });

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

  describe('withConnection', function () {
    it('should manage a connection for a successful operation', function (done) {
      server.setMessageHandler(request => {
        const doc = request.document;
        if (isHello(doc)) {
          request.reply(mock.HELLO);
        }
      });

      const pool = new ConnectionPool({ hostAddress: server.hostAddress() });
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

      const pool = new ConnectionPool({
        waitQueueTimeoutMS: 200,
        hostAddress: server.hostAddress()
      });

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

      const pool = new ConnectionPool({ hostAddress: server.hostAddress() });
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

    it('should still manage a connection if no callback is provided', function (done) {
      server.setMessageHandler(request => {
        const doc = request.document;
        if (isHello(doc)) {
          request.reply(mock.HELLO);
        }
      });

      const pool = new ConnectionPool({ maxPoolSize: 1, hostAddress: server.hostAddress() });

      const events = [];
      pool.on('connectionCheckedOut', event => events.push(event));
      pool.on('connectionCheckedIn', event => {
        events.push(event);

        expect(events).to.have.length(2);
        expect(events[0]).to.be.instanceOf(cmapEvents.ConnectionCheckedOutEvent);
        expect(events[1]).to.be.instanceOf(cmapEvents.ConnectionCheckedInEvent);
        pool.close(done);
      });

      pool.withConnection(undefined, (err, conn, cb) => {
        expect(err).to.not.exist;
        cb();
      });
    });
  });
});
