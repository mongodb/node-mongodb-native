import { expect } from 'chai';
import { EventEmitter } from 'events';
import { promisify } from 'util';

import { Connection, HostAddress } from '../../src';
import { ConnectionPool, ConnectionPoolOptions } from '../../src/cmap/connection_pool';
import { FailPoint, sleep } from './utils';

type CmapOperation =
  | { name: 'start' | 'waitForThread'; target: string }
  | { name: 'wait'; ms: number }
  | { name: 'waitForEvent'; event: string; count: number }
  | { name: 'checkOut'; thread: string; label: string }
  | { name: 'checkIn'; connection: string }
  | { name: 'clear' | 'close' | 'ready' };

type CmapPoolOptions = {
  maxPoolSize?: number;
  minPoolSize?: number;
  maxIdleTimeMS?: number;
  waitQueueTimeoutMS?: number;
};

type CmapEvent = {
  type: string;
  address?: 42;
  connectionId?: number;
  options?: 42 | CmapPoolOptions;
  reason: string;
};

const CMAP_TEST_KEYS: Array<keyof CmapTest> = [
  'name',
  'version',
  'style',
  'description',
  'poolOptions',
  'operations',
  'error',
  'events',
  'ignore',
  'runOn',
  'failPoint'
];
export type CmapTest = {
  name?: string; // filename path added by the spec loader
  version: number;
  style: 'unit' | 'integration';
  description: string;
  poolOptions?: CmapPoolOptions;
  operations: CmapOperation[];
  error?: {
    type: string;
    message: string;
    address?: number;
  };
  events?: CmapEvent[];
  ignore?: string[];
  // integration specific params
  runOn?: {
    minServerVersion?: string;
    maxServerVersion?: string;
  }[];
  failPoint?: FailPoint;
};

const ALL_POOL_EVENTS = new Set([
  ConnectionPool.CONNECTION_POOL_CREATED,
  ConnectionPool.CONNECTION_POOL_CLOSED,
  ConnectionPool.CONNECTION_POOL_CLEARED,
  ConnectionPool.CONNECTION_CREATED,
  ConnectionPool.CONNECTION_READY,
  ConnectionPool.CONNECTION_CLOSED,
  ConnectionPool.CONNECTION_CHECK_OUT_STARTED,
  ConnectionPool.CONNECTION_CHECK_OUT_FAILED,
  ConnectionPool.CONNECTION_CHECKED_OUT,
  ConnectionPool.CONNECTION_CHECKED_IN
]);

function getEventType(event) {
  const eventName = event.constructor.name;
  return eventName.substring(0, eventName.lastIndexOf('Event'));
}

/**
 * In the cmap spec and runner definition,
 * a "thread" refers to a concurrent execution context
 */
class Thread {
  #promise: Promise<void>;
  #error: Error;
  #killed = false;

  #knownCommands: any;

  start: () => void;

  // concurrent execution context
  constructor(operations) {
    this.#promise = new Promise(resolve => {
      this.start = () => resolve();
    });

    this.#knownCommands = operations;
  }

  private async _runOperation(op: CmapOperation): Promise<void> {
    const operationFn = this.#knownCommands[op.name];
    if (!operationFn) {
      throw new Error(`Invalid command ${op.name}`);
    }

    await operationFn(op);
    await sleep();
  }

  queue(op: CmapOperation) {
    if (this.#killed || this.#error) {
      return;
    }

    this.#promise = this.#promise.then(() => this._runOperation(op)).catch(e => (this.#error = e));
  }

  async finish() {
    this.#killed = true;
    await this.#promise;
    if (this.#error) {
      throw this.#error;
    }
  }
}

/**
 * Implements the spec test match function, see:
 * [CMAP Spec Test README](https://github.com/mongodb/specifications/tree/master/source/connection-monitoring-and-pooling/tests#spec-test-match-function)
 */
const compareInputToSpec = (input, expected) => {
  // the spec uses 42 and "42" as special keywords to express that the value does not matter
  // however, "42" does not appear in the spec tests, so only the numeric value is checked here
  if (expected === 42) {
    expect(input).to.be.ok; // not null or undefined
    return;
  }

  if (Array.isArray(expected)) {
    expect(input).to.be.an('array');
    for (const [index, expectedValue] of input.entries()) {
      compareInputToSpec(input[index], expectedValue);
    }
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
    const connection: Connection = await promisify(ConnectionPool.prototype.checkOut).call(
      threadContext.pool
    );
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
  close: async function () {
    return await promisify(ConnectionPool.prototype.close).call(threadContext.pool);
  },
  ready: function () {
    // This is a no-op until pool pausing is implemented
    return;
  },
  wait: async function (options) {
    const ms = options.ms;
    return sleep(ms);
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

export class ThreadContext {
  pool: ConnectionPool;
  threads: Map<any, Thread> = new Map();
  connections: Map<string, Connection> = new Map();
  orphans: Set<Connection> = new Set();
  poolEvents = [];
  poolEventsEventEmitter = new EventEmitter();

  #poolOptions: Partial<ConnectionPoolOptions>;
  #hostAddress: HostAddress;
  #supportedOperations: ReturnType<typeof getTestOpDefinitions>;

  /**
   *
   * @param hostAddress - The address of the server to connect to
   * @param poolOptions - Allows the test to pass in extra options to the pool not specified by the spec test definition, such as the environment-dependent "loadBalanced"
   */
  constructor(hostAddress: HostAddress, poolOptions: Partial<ConnectionPoolOptions> = {}) {
    this.#poolOptions = poolOptions;
    this.#hostAddress = hostAddress;
    this.#supportedOperations = getTestOpDefinitions(this);
  }

  get isLoadBalanced() {
    return !!this.#poolOptions.loadBalanced;
  }

  getThread(name) {
    let thread = this.threads.get(name);
    if (!thread) {
      thread = new Thread(this.#supportedOperations);
      this.threads.set(name, thread);
    }

    return thread;
  }

  createPool(options) {
    this.pool = new ConnectionPool({
      ...this.#poolOptions,
      ...options,
      hostAddress: this.#hostAddress
    });
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

export async function runCmapTest(test: CmapTest, threadContext: ThreadContext) {
  expect(CMAP_TEST_KEYS).to.include.members(Object.keys(test));

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
  // yield control back to the event loop so that the ConnectionPoolCreatedEvent
  // has a chance to be fired before any synchronously-emitted events from
  // the queued operations
  await sleep();

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
    const { type: errorType, message: errorMessage, ...errorPropsToCheck } = expectedError;
    expect(actualError).to.have.property('name', `Mongo${errorType}`);
    if (errorMessage) {
      if (
        errorMessage === 'Timed out while checking out a connection from connection pool' &&
        threadContext.isLoadBalanced
      ) {
        expect(actualError.message).to.match(
          /^Timed out while checking out a connection from connection pool:/
        );
      } else {
        expect(actualError).to.have.property('message', errorMessage);
      }
    }
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
}
