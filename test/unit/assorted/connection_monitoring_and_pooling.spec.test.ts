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

function getEventType(event) {
  const eventName = event.constructor.name;
  return eventName.substring(0, eventName.lastIndexOf('Event'));
}

class Thread {
  _promise: Promise<void>;
  _error: Error;
  _killed = false;

  _knownCommands: any;

  // concurrent execution context
  constructor(operations) {
    this._promise = new Promise(resolve => {
      this.start = () => resolve();
    });

    this._knownCommands = operations;
  }

  start: () => void;

  queue(op: cmapOperation) {
    if (this._killed || this._error) {
      return;
    }

    this._promise = this._promise.then(() => this._runOperation(op)).catch(e => (this._error = e));
  }

  async _runOperation(op: cmapOperation) {
    const operationFn = this._knownCommands[op.name];
    if (!operationFn) {
      throw new Error(`Invalid command ${op.name}`);
    }

    await operationFn(op);
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

const getTestOpDefinitions = (threadContext: ThreadContext) => ({
  checkOut: async function (op) {
    const connection: Connection = await util
      .promisify(ConnectionPool.prototype.checkOut)
      .call(threadContext.pool);
    if (op.label != null) {
      threadContext.connections.set(op.label, connection);
    } else {
      threadContext.orphans.add(connection);
    }
  },
  checkIn: function (op) {
    const connection = threadContext.connections.get(op.connection);
    threadContext.connections.delete(op.connection);

    if (!connection) {
      throw new Error(`Attempted to release non-existient connection ${op.connection}`);
    }

    return threadContext.pool.checkIn(connection);
  },
  clear: function () {
    return threadContext.pool.clear();
  },
  close: function () {
    return util.promisify(ConnectionPool.prototype.close).call(threadContext.pool);
  },
  wait: async function (options) {
    const ms = options.ms;
    return asyncTimeout(ms);
  },
  start: function (options) {
    const target = options.target;
    const thread = threadContext.getThread(target);
    thread.start();
  },
  waitForThread: async function (options): Promise<void> {
    const name = options.name;
    const target = options.target;

    const threadObj = threadContext.threads.get(target);

    if (!threadObj) {
      throw new Error(`Attempted to run op ${name} on non-existent thread ${target}`);
    }

    await threadObj.finish();
  },
  waitForEvent: function (options): Promise<void> {
    const event = options.event;
    const count = options.count;
    return new Promise(resolve => {
      function run() {
        if (threadContext.poolEvents.filter(ev => getEventType(ev) === event).length >= count) {
          return resolve();
        }

        threadContext.poolEventsEventEmitter.once('poolEvent', run);
      }
      run();
    });
  }
});

class ThreadContext {
  pool: ConnectionPool;
  threads: Map<any, Thread>;
  connections: Map<string, Connection>;
  orphans: Set<Connection>;
  poolEvents = [];
  poolEventsEventEmitter = new EventEmitter();
  hostAddress;
  supportedOperations;

  constructor(hostAddress) {
    this.threads = new Map();
    this.connections = new Map();
    this.orphans = new Set();
    this.poolEvents = [];
    this.poolEventsEventEmitter = new EventEmitter();
    this.hostAddress = hostAddress;
    this.supportedOperations = getTestOpDefinitions(this);
  }

  getThread(name) {
    let thread = this.threads.get(name);
    if (!thread) {
      thread = new Thread(this.supportedOperations);
      this.threads.set(name, thread);
    }

    return thread;
  }

  createPool(options) {
    this.pool = new ConnectionPool({ ...options, hostAddress: this.hostAddress });
    ALL_POOL_EVENTS.forEach(ev => {
      this.pool.on(ev, x => {
        this.poolEvents.push(x);
        this.poolEventsEventEmitter.emit('poolEvent');
      });
    });
  }

  closePool() {
    return new Promise(resolve => {
      ALL_POOL_EVENTS.forEach(ev => this.pool.removeAllListeners(ev));
      this.pool.close(resolve);
    });
  }

  async tearDown() {
    if (this.pool) {
      await this.closePool();
    }
    const connectionsToDestroy = Array.from(this.orphans).concat(
      Array.from(this.connections.values())
    );
    const promises = connectionsToDestroy.map(conn => {
      return new Promise<void>((resolve, reject) =>
        conn.destroy({ force: true }, err => {
          if (err) return reject(err);
          resolve();
        })
      );
    });
    await Promise.all(promises);
    this.poolEventsEventEmitter.removeAllListeners();
  }
}

describe('Connection Monitoring and Pooling Spec Tests', function () {
  let hostAddress, threadContext;
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

  beforeEach(() => {
    threadContext = new ThreadContext(hostAddress);
  });

  afterEach(async () => {
    await threadContext.tearDown();
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
      const mainThread = threadContext.getThread(MAIN_THREAD_KEY);
      mainThread.start();

      threadContext.createPool(poolOptions);

      for (const idx in operations) {
        const op = operations[idx];

        const threadKey = op.name === 'checkOut' ? op.thread || MAIN_THREAD_KEY : MAIN_THREAD_KEY;
        const thread = threadContext.getThread(threadKey);

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

      const actualEvents = threadContext.poolEvents.filter(
        ev => !ignoreEvents.includes(getEventType(ev))
      );

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
