import { expect } from 'chai';
import { EventEmitter } from 'events';
import * as util from 'util';

import { Connection } from '../../../src';
import { ConnectionPool } from '../../../src/cmap/connection_pool';
import { isHello } from '../../../src/utils';
import { loadSpecTests } from '../../spec';
import * as mock from '../../tools/mongodb-mock/index';

const asyncTimeout = util.promisify(setTimeout);

type cmapOperation =
  | { name: 'start' | 'waitForThread'; target: string }
  | { name: 'wait'; ms: number }
  | { name: 'waitForEvent'; event: string; count: number }
  | { name: 'checkOut'; thread: string; label: string }
  | { name: 'checkIn'; connection: string }
  | { name: 'clear' | 'close' | 'ready' };

type cmapPoolOptions = {
  maxPoolSize?: number;
  minPoolSize?: number;
  maxIdleTimeMS?: number;
  waitQueueTimeoutMS?: number;
};

type cmapEvent = {
  type: string;
  address?: 42;
  connectionId?: number;
  options?: 42 | cmapPoolOptions;
  reason: string;
};

const knownTestKeys = [
  'name',
  'version',
  'style',
  'description',
  'poolOptions',
  'operations',
  'error',
  'events',
  'ignore'
];
type cmapTest = {
  name?: string; // filename path added by the spec loader
  version: number;
  style: 'unit';
  description: string;
  poolOptions?: cmapPoolOptions;
  operations: cmapOperation[];
  error?: {
    type: string;
    message: string;
    address?: number;
  };
  events?: cmapEvent[];
  ignore?: string[];
};

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

const compareInputToSpec = (input, expected) => {
  if (expected === 42) {
    expect(input).to.be.ok; // not null or undefined
    return;
  }

  if (Array.isArray(expected)) {
    expect(input).to.be.an('array');
    expected.forEach((expectedValue, index) => {
      compareInputToSpec(input[index], expectedValue);
    });
    return;
  }

  if (expected && typeof expected === 'object') {
    for (const [expectedPropName, expectedValue] of Object.entries(expected)) {
      expect(input).to.have.property(expectedPropName);
      compareInputToSpec(input[expectedPropName], expectedValue);
    }
    return;
  }

  expect(input).to.equal(expected);
};

describe('Connection Monitoring and Pooling Spec Tests', function () {
  let hostAddress;
  after(() => mock.cleanup());
  before(async () => {
    const server = await mock.createServer();
    // we aren't testing errors yet, so it's fine for the mock server to just accept
    // and establish valid connections
    server.setMessageHandler(request => {
      const doc = request.document;
      if (isHello(doc)) {
        request.reply(mock.HELLO);
      }
    });
    hostAddress = server.hostAddress();
  });

  const threads: Map<any, Thread> = new Map();
  const connections: Map<string, Connection> = new Map();
  const orphans: Set<Connection> = new Set();
  const poolEvents = [];
  const poolEventsEventEmitter = new EventEmitter();
  let pool: ConnectionPool;

  function createPool(options) {
    options = Object.assign({}, options, { hostAddress });
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
    checkOut: async function (op) {
      const connection: Connection = await PROMISIFIED_POOL_FUNCTIONS.checkOut.call(pool);
      if (op.label != null) {
        connections.set(op.label, connection);
      } else {
        orphans.add(connection);
      }
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
    wait: async function (options) {
      const ms = options.ms;
      return asyncTimeout(ms);
    },
    start: function (options) {
      const target = options.target;
      const thread = getThread(target);
      thread.start();
    },
    waitForThread: async function (options): Promise<void> {
      const name = options.name;
      const target = options.target;

      const threadObj = threads.get(target);

      if (!threadObj) {
        throw new Error(`Attempted to run op ${name} on non-existent thread ${target}`);
      }

      await threadObj.finish();
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
    _promise: Promise<void>;
    _error: Error;
    _killed = false;

    // concurrent execution context
    constructor() {
      this._promise = new Promise(resolve => {
        this.start = () => resolve();
      });
    }

    start: () => void;

    queue(op: cmapOperation) {
      if (this._killed || this._error) {
        return;
      }

      this._promise = this._promise
        .then(() => this._runOperation(op))
        .catch(e => (this._error = e));
    }

    async _runOperation(op: cmapOperation) {
      const operationFn = OPERATION_FUNCTIONS[op.name];
      if (!operationFn) {
        throw new Error(`Invalid command ${op.name}`);
      }

      await operationFn(op, this);
      await asyncTimeout();
    }

    async finish() {
      this._killed = true;
      await this._promise;
      if (this._error) {
        throw this._error;
      }
    }
  }

  afterEach(async () => {
    if (pool) {
      await closePool(pool);
    }
    const connectionsToDestroy = Array.from(orphans).concat(Array.from(connections.values()));
    const promises = connectionsToDestroy.map(conn => {
      return new Promise<void>((resolve, reject) =>
        conn.destroy({ force: true }, err => {
          if (err) return reject(err);
          resolve();
        })
      );
    });
    await Promise.all(promises);
    pool = undefined;
    threads.clear();
    connections.clear();
    orphans.clear();
    poolEvents.length = 0;
    poolEventsEventEmitter.removeAllListeners();
  });

  const suites: cmapTest[] = loadSpecTests('connection-monitoring-and-pooling');

  for (const test of suites) {
    it(test.description, async function () {
      expect(knownTestKeys).to.include.members(Object.keys(test));

      const poolOptions = test.poolOptions || {};
      const operations = test.operations;
      const expectedError = test.error;
      const expectedEvents = test.events || [];
      const ignoreEvents = test.ignore || [];

      let actualError;

      const MAIN_THREAD_KEY = Symbol('Main Thread');
      const mainThread = new Thread();
      threads.set(MAIN_THREAD_KEY, mainThread);
      mainThread.start();

      createPool(poolOptions);

      for (const idx in operations) {
        const op = operations[idx];

        const threadKey = op.name === 'checkOut' ? op.thread || MAIN_THREAD_KEY : MAIN_THREAD_KEY;
        const thread = getThread(threadKey);

        if (!thread) {
          throw new Error(`Invalid thread ${String(threadKey)}`);
        }

        thread.queue(op);
      }

      await mainThread.finish().catch(e => {
        actualError = e;
      });

      if (expectedError) {
        expect(actualError).to.exist;
        const { type: errorType, ...errorPropsToCheck } = expectedError;
        expect(actualError).to.have.property('name', `Mongo${errorType}`);
        compareInputToSpec(actualError, errorPropsToCheck);
      } else {
        expect(actualError).to.not.exist;
      }

      const actualEvents = poolEvents.filter(ev => !ignoreEvents.includes(eventType(ev)));

      expect(actualEvents).to.have.lengthOf(expectedEvents.length);
      for (const expected of expectedEvents) {
        const actual = actualEvents.shift();
        const { type: eventType, ...eventPropsToCheck } = expected;
        expect(actual.constructor.name).to.equal(`${eventType}Event`);
        compareInputToSpec(actual, eventPropsToCheck);
      }
    });
  }
});
