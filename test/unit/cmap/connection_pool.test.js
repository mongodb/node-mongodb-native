'use strict';

const Promise = require('bluebird');
const loadSpecTests = require('../../spec').loadSpecTests;
const ConnectionPool = require('../../../lib/cmap/connection_pool').ConnectionPool;
const Connection = require('../../../lib/cmap/connection').Connection;
const EventEmitter = require('events').EventEmitter;
const mock = require('mongodb-mock-server');
const BSON = require('bson');

const chai = require('chai');
chai.use(require('../../functional/spec-runner/matcher').default);
const expect = chai.expect;

class MockConnection extends Connection {
  constructor(stream, options) {
    super(stream, options);

    this.id = options.id;
    this.generation = options.generation;
    this.readyToUse = false;
    this.lastMadeAvailable = undefined;
  }

  timeIdle() {
    return this.readyToUse ? Date.now() - this.lastMadeAvailable : 0;
  }

  makeReadyToUse() {
    this.readyToUse = true;
    this.lastMadeAvailable = Date.now();
  }
}

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
  checkOut: Promise.promisify(ConnectionPool.prototype.checkOut),
  checkIn: Promise.promisify(ConnectionPool.prototype.checkIn),
  clear: Promise.promisify(ConnectionPool.prototype.clear),
  close: Promise.promisify(ConnectionPool.prototype.close)
};

function closePool(pool) {
  return new Promise(resolve => {
    ALL_POOL_EVENTS.forEach(ev => pool.removeAllListeners(ev));
    pool.close(resolve);
  });
}

describe('Connection Pool', function() {
  let server;
  after(() => mock.cleanup());
  before(() => {
    mock.createServer().then(s => (server = s));
  });

  describe('spec tests', function() {
    const threads = new Map();
    const connections = new Map();
    const poolEvents = [];
    const poolEventsEventEmitter = new EventEmitter();
    let pool = undefined;

    function createPool(options) {
      options = Object.assign(
        {},
        options,
        { connectionType: MockConnection, bson: new BSON() },
        server.address()
      );

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

    const OPERATION_FUNCTIONS = {
      checkOut: function(op) {
        return PROMISIFIED_POOL_FUNCTIONS.checkOut.call(pool).then(connection => {
          if (op.label != null) {
            connections.set(op.label, connection);
          }
        });
      },
      checkIn: function(op) {
        const connection = connections.get(op.connection);
        const force = op.force;

        if (!connection) {
          throw new Error(`Attempted to release non-existient connection ${op.connection}`);
        }

        return PROMISIFIED_POOL_FUNCTIONS.checkIn.call(pool, connection, force);
      },
      clear: function() {
        return PROMISIFIED_POOL_FUNCTIONS.clear.call(pool);
      },
      close: function() {
        return PROMISIFIED_POOL_FUNCTIONS.close.call(pool);
      },
      wait: function(options) {
        const ms = options.ms;
        return new Promise(r => setTimeout(r, ms));
      },
      start: function(options) {
        const target = options.target;
        const thread = getThread(target);
        thread.start();
      },
      waitForThread: function(options) {
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
      waitForEvent: function(options) {
        const event = options.event;
        const count = options.count;
        return new Promise(resolve => {
          function run() {
            if (poolEvents.filter(ev => ev.type === event).length >= count) {
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
        if (doc.ismaster) {
          request.reply(mock.DEFAULT_ISMASTER_36);
        }
      });
    });

    afterEach(() => {
      const p = pool ? closePool(pool) : Promise.resolve();
      return p.then(() => {
        pool = undefined;
        threads.clear();
        connections.clear();
        poolEvents.length = 0;
        poolEventsEventEmitter.removeAllListeners();
      });
    });

    loadSpecTests('connection-monitoring-and-pooling').forEach(test => {
      it(test.description, function() {
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
            const actualEvents = poolEvents.filter(ev => ignoreEvents.indexOf(ev.type) < 0);

            if (expectedError) {
              if (!actualError) {
                expect(actualError).to.matchMongoSpec(expectedError);
              } else {
                const ae = Object.assign({}, actualError, { message: actualError.message });
                expect(ae).to.matchMongoSpec(expectedError);
              }
            } else if (actualError) {
              throw actualError;
            }

            expectedEvents.forEach((expected, index) => {
              const actual = actualEvents[index];
              expect(actual).to.matchMongoSpec(expected);
            });
          });
      });
    });
  });
});
