'use strict';

const util = require('util');
const { loadSpecTests } = require('../../spec');
const { ConnectionPool } = require('../../../src/cmap/connection_pool');
const { WaitQueueTimeoutError } = require('../../../src/cmap/errors');
const { EventEmitter } = require('events');
const mock = require('../../tools/mock');
const cmapEvents = require('../../../src/cmap/connection_pool_events');
const sinon = require('sinon');
const { expect } = require('chai');
const { ns } = require('../../../src/utils');

const ALL_POOL_EVENTS = new Set([
  'connectionPoolCreated',
  'connectionPoolClosed',
  'connectionCreated',
  'connectionReady',
  'connectionClosed',
  'connectionCheckOutStarted',
  'connectionCheckOutFailed',
  'connectionCheckedOut',
  'connectionCheckedIn',
  'connectionPoolCleared'
]);

const PROMISIFIED_POOL_FUNCTIONS = {
  checkOut: util.promisify(ConnectionPool.prototype.checkOut),
  close: util.promisify(ConnectionPool.prototype.close)
};

function closePool(pool) {
  return new Promise(resolve => {
    ALL_POOL_EVENTS.forEach(ev => pool.removeAllListeners(ev));
    pool.close(resolve);
  });
}

describe('Connection Pool', function () {
  let server;
  after(() => mock.cleanup());
  before(() => mock.createServer().then(s => (server = s)));

  it('should destroy connections which have been closed', function (done) {
    server.setMessageHandler(request => {
      const doc = request.document;
      if (doc.ismaster || doc.hello) {
        request.reply(mock.DEFAULT_ISMASTER_36);
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
      if (doc.ismaster || doc.hello) {
        request.reply(mock.DEFAULT_ISMASTER_36);
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
      if (doc.ismaster || doc.hello) {
        request.reply(mock.DEFAULT_ISMASTER_36);
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
        if (doc.ismaster || doc.hello) {
          request.reply(mock.DEFAULT_ISMASTER_36);
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

        conn.command(ns('$admin.cmd'), { ismaster: 1 }, undefined, (cmdErr, ismaster) => {
          expect(cmdErr).to.not.exist;
          cb(undefined, ismaster);
        });
      }, callback);
    });

    it('should allow user interaction with an error', function (done) {
      server.setMessageHandler(request => {
        const doc = request.document;
        if (doc.ismaster || doc.hello) {
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
        if (doc.ismaster || doc.hello) {
          request.reply(mock.DEFAULT_ISMASTER_36);
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
        if (doc.ismaster || doc.hello) {
          request.reply(mock.DEFAULT_ISMASTER_36);
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

  describe.skip('#closeConnections', function () {
    context('when the server id matches', function () {
      let pool;

      beforeEach(() => {
        pool = new ConnectionPool({
          minPoolSize: 1,
          hostAddress: server.hostAddress()
        });
      });

      afterEach(done => {
        pool.close(done);
      });

      it('closes the matching connections', function (done) {
        const hello = mock.DEFAULT_HELLO_50;
        server.setMessageHandler(request => {
          const doc = request.document;
          if (doc.ismaster) {
            request.reply(hello);
          }
        });
        pool.on(ConnectionPool.CONNECTION_CLOSED, event => {
          console.log('event', event);
          done();
        });

        const connection = pool.checkOut();
        pool.checkIn(connection);
        pool.closeConnections(hello.serverId);
      });
    });

    context('when the server id does not match', function () {
      let pool;

      beforeEach(() => {
        pool = new ConnectionPool({
          minPoolSize: 3,
          hostAddress: server.hostAddress()
        });
      });

      afterEach(done => {
        pool.close(done);
      });

      it('does not close any connections', function (done) {
        const hello = mock.DEFAULT_HELLO_50;
        server.setMessageHandler(request => {
          const doc = request.document;
          if (doc.ismaster) {
            request.reply(hello);
          }
        });
        pool.closeConnections(hello.serverId);
        process.nextTick(() => {
          done();
        });
      });
    });
  });

  describe('spec tests', function () {
    const threads = new Map();
    const connections = new Map();
    const orphans = new Set();
    const poolEvents = [];
    const poolEventsEventEmitter = new EventEmitter();
    let pool = undefined;

    function createPool(options) {
      options = Object.assign({}, options, { hostAddress: server.hostAddress() });
      pool = new ConnectionPool(options);
      ALL_POOL_EVENTS.forEach(ev => {
        pool.on(ev, x => {
          poolEvents.push(x);
          poolEventsEventEmitter.emit('poolEvent');
        });
      });
    }

    function getThread(name) {
      let thread = threads.get(name);
      if (!thread) {
        thread = new Thread();
        threads.set(name, thread);
      }

      return thread;
    }

    function eventType(event) {
      const eventName = event.constructor.name;
      return eventName.substring(0, eventName.lastIndexOf('Event'));
    }

    const OPERATION_FUNCTIONS = {
      checkOut: function (op) {
        return PROMISIFIED_POOL_FUNCTIONS.checkOut.call(pool).then(connection => {
          if (op.label != null) {
            connections.set(op.label, connection);
          } else {
            orphans.add(connection);
          }
        });
      },
      checkIn: function (op) {
        const connection = connections.get(op.connection);
        connections.delete(op.connection);

        if (!connection) {
          throw new Error(`Attempted to release non-existient connection ${op.connection}`);
        }

        return pool.checkIn(connection);
      },
      clear: function () {
        return pool.clear();
      },
      close: function () {
        return PROMISIFIED_POOL_FUNCTIONS.close.call(pool);
      },
      wait: function (options) {
        const ms = options.ms;
        return new Promise(r => setTimeout(r, ms));
      },
      start: function (options) {
        const target = options.target;
        const thread = getThread(target);
        thread.start();
      },
      waitForThread: function (options) {
        const name = options.name;
        const target = options.target;
        const suppressError = options.suppressError;

        const threadObj = threads.get(target);

        if (!threadObj) {
          throw new Error(`Attempted to run op ${name} on non-existent thread ${target}`);
        }

        return threadObj.finish().catch(e => {
          if (!suppressError) {
            throw e;
          }
        });
      },
      waitForEvent: function (options) {
        const event = options.event;
        const count = options.count;
        return new Promise(resolve => {
          function run() {
            if (poolEvents.filter(ev => eventType(ev) === event).length >= count) {
              return resolve();
            }

            poolEventsEventEmitter.once('poolEvent', run);
          }
          run();
        });
      }
    };

    class Thread {
      constructor() {
        this._killed = false;
        this._error = undefined;
        this._promise = new Promise(resolve => {
          this.start = () => setTimeout(resolve);
        });
      }

      run(op) {
        if (this._killed || this._error) {
          return;
        }

        this._promise = this._promise
          .then(() => this._runOperation(op))
          .catch(e => (this._error = e));
      }

      _runOperation(op) {
        const operationFn = OPERATION_FUNCTIONS[op.name];
        if (!operationFn) {
          throw new Error(`Invalid command ${op.name}`);
        }

        return Promise.resolve()
          .then(() => operationFn(op, this))
          .then(() => new Promise(r => setTimeout(r)));
      }

      finish() {
        this._killed = true;
        return this._promise.then(() => {
          if (this._error) {
            throw this._error;
          }
        });
      }
    }

    before(() => {
      // we aren't testing errors yet, so it's fine for the mock server to just accept
      // and establish valid connections
      server.setMessageHandler(request => {
        const doc = request.document;
        if (doc.ismaster || doc.hello) {
          request.reply(mock.DEFAULT_ISMASTER_36);
        }
      });
    });

    afterEach(() => {
      const p = pool ? closePool(pool) : Promise.resolve();
      return p
        .then(() => {
          const connectionsToDestroy = Array.from(orphans).concat(Array.from(connections.values()));
          const promises = connectionsToDestroy.map(conn => {
            return new Promise((resolve, reject) =>
              conn.destroy({ force: true }, err => {
                if (err) return reject(err);
                resolve();
              })
            );
          });
          return Promise.all(promises);
        })
        .then(() => {
          pool = undefined;
          threads.clear();
          connections.clear();
          orphans.clear();
          poolEvents.length = 0;
          poolEventsEventEmitter.removeAllListeners();
        });
    });

    loadSpecTests('connection-monitoring-and-pooling').forEach(test => {
      it(test.description, function () {
        const operations = test.operations;
        const expectedEvents = test.events || [];
        const ignoreEvents = test.ignore || [];
        const expectedError = test.error;
        const poolOptions = test.poolOptions || {};

        let actualError;

        const MAIN_THREAD_KEY = Symbol('Main Thread');
        const mainThread = new Thread();
        threads.set(MAIN_THREAD_KEY, mainThread);
        mainThread.start();

        createPool(poolOptions);

        let basePromise = Promise.resolve();

        for (let idx in operations) {
          const op = operations[idx];

          const threadKey = op.thread || MAIN_THREAD_KEY;
          const thread = getThread(threadKey);

          basePromise = basePromise.then(() => {
            if (!thread) {
              throw new Error(`Invalid thread ${threadKey}`);
            }

            return Promise.resolve()
              .then(() => thread.run(op))
              .then(() => new Promise(r => setTimeout(r)));
          });
        }

        return basePromise
          .then(() => mainThread.finish())
          .catch(e => (actualError = e))
          .then(() => {
            const actualEvents = poolEvents.filter(ev => ignoreEvents.indexOf(eventType(ev)) < 0);

            if (expectedError) {
              expect(actualError).to.exist;
              expect(actualError).property('message').to.equal(expectedError.message);
            } else if (actualError) {
              throw actualError;
            }

            expectedEvents.forEach((expected, index) => {
              const actual = actualEvents[index];
              if (expected.type) {
                expect(actual.constructor.name).to.equal(`${expected.type}Event`);
                delete expected.type;
              }

              expect(actual).to.matchMongoSpec(expected);
            });
          });
      });
    });
  });
});
