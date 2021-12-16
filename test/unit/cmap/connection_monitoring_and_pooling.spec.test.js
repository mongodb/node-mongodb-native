'use strict';

const util = require('util');
const { loadSpecTests } = require('../../spec');
const { ConnectionPool } = require('../../../src/cmap/connection_pool');
const { EventEmitter } = require('events');
const mock = require('../../tools/mongodb-mock/index');
const { expect } = require('chai');
const { isHello } = require('../../../src/utils');

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

describe('Connection Monitoring and Pooling', function () {
  let server;
  after(() => mock.cleanup());
  before(() => mock.createServer().then(s => (server = s)));

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
        if (isHello(doc)) {
          request.reply(mock.HELLO);
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
