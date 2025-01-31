import { expect } from 'chai';
import { EventEmitter } from 'events';
import { clearTimeout, setTimeout } from 'timers';
import { inspect } from 'util';

import {
  addContainerMetadata,
  CMAP_EVENTS,
  type Connection,
  ConnectionPool,
  type ConnectionPoolOptions,
  type HostAddress,
  makeClientMetadata,
  type MongoClient,
  type Server,
  shuffle,
  TimeoutContext
} from '../mongodb';
import { isAnyRequirementSatisfied } from './unified-spec-runner/unified-utils';
import { type FailPoint, sleep } from './utils';

type CmapOperation =
  | { name: 'start' | 'waitForThread'; target: string }
  | { name: 'wait'; ms: number }
  | { name: 'waitForEvent'; event: string; count: number; timeout?: number }
  | { name: 'checkOut'; thread: string; label: string }
  | { name: 'checkIn'; connection: string }
  | { name: 'clear'; interruptInUseConnections?: boolean }
  | { name: 'close' | 'ready' };

const CMAP_POOL_OPTION_NAMES: Array<keyof CmapPoolOptions> = [
  'appName',
  'backgroundThreadIntervalMS',
  'maxPoolSize',
  'minPoolSize',
  'maxConnecting',
  'maxIdleTimeMS',
  'waitQueueTimeoutMS'
];

type CmapPoolOptions = {
  appName?: string;
  backgroundThreadIntervalMS?: number;
  maxPoolSize?: number;
  minPoolSize?: number;
  maxConnecting?: number;
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

const ALL_POOL_EVENTS = new Set(CMAP_EVENTS);

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

  queue(op: CmapOperation, thread?: Thread) {
    if (this.#killed || this.#error) {
      return;
    }

    const functionToQueue = () => (!thread ? this._runOperation(op) : thread.queue(op));

    this.#promise = this.#promise.then(functionToQueue).catch(e => (this.#error = e));
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
const compareInputToSpec = (input, expected, message) => {
  // the spec uses 42 and "42" as special keywords to express that the value does not matter
  // however, "42" does not appear in the spec tests, so only the numeric value is checked here
  if (expected === 42) {
    expect(input, message).not.to.be.undefined;
    expect(input, message).not.to.be.null;
    return;
  }

  if (Array.isArray(expected)) {
    expect(input, message).to.be.an('array');
    for (const [index, expectedValue] of input.entries()) {
      compareInputToSpec(input[index], expectedValue, `${message} at index ${index}`);
    }
    return;
  }

  const expectedEntries: [string, unknown][] = Object.entries(expected).map(([k, v]) => {
    // Node uses `durationMS` instead of `duration` on CMAP events.
    if (k === 'duration') return ['durationMS', v];
    return [k, v];
  });

  if (expected && typeof expected === 'object') {
    for (const [expectedPropName, expectedValue] of expectedEntries) {
      expect(input, message).to.have.property(expectedPropName);
      compareInputToSpec(
        input[expectedPropName],
        expectedValue,
        `${message} property ${expectedPropName}`
      );
    }
    return;
  }

  expect(input, message).to.equal(expected);
};

const getTestOpDefinitions = (threadContext: ThreadContext) => ({
  checkOut: async function (op) {
    const timeoutContext = TimeoutContext.create({
      serverSelectionTimeoutMS: 0,
      waitQueueTimeoutMS: threadContext.pool.options.waitQueueTimeoutMS
    });
    const connection: Connection = await ConnectionPool.prototype.checkOut.call(
      threadContext.pool,
      { timeoutContext }
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
  clear: function ({ interruptInUseConnections }: { interruptInUseConnections: boolean }) {
    return threadContext.pool.clear({ interruptInUseConnections });
  },
  close: function () {
    return ConnectionPool.prototype.close.call(threadContext.pool);
  },
  ready: function () {
    return threadContext.pool.ready();
  },
  wait: function (options) {
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
    const timeout = options.timeout ?? 15000;
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Timed out while waiting for event ${event}`));
      }, timeout);

      function run() {
        if (threadContext.poolEvents.filter(ev => getEventType(ev) === event).length >= count) {
          clearTimeout(timeoutId);
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
  poolEvents: any[] = [];
  poolEventsEventEmitter = new EventEmitter();

  #poolOptions: Partial<ConnectionPoolOptions>;
  #hostAddress: HostAddress;
  #server: Server;
  #originalServerPool: ConnectionPool;
  #supportedOperations: ReturnType<typeof getTestOpDefinitions>;
  #injectPoolStats = false;

  /**
   *
   * @param hostAddress - The address of the server to connect to
   * @param poolOptions - Allows the test to pass in extra options to the pool not specified by the spec test definition, such as the environment-dependent "loadBalanced"
   */
  constructor(
    server: Server,
    hostAddress: HostAddress,
    poolOptions: Partial<ConnectionPoolOptions> = {},
    contextOptions: { injectPoolStats: boolean }
  ) {
    this.poolEventsEventEmitter.on('error', () => null);
    this.#poolOptions = poolOptions;
    this.#hostAddress = hostAddress;
    this.#server = server;
    this.#supportedOperations = getTestOpDefinitions(this);
    this.#injectPoolStats = contextOptions.injectPoolStats;
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
    this.pool = new ConnectionPool(this.#server, {
      ...this.#poolOptions,
      ...options,
      hostAddress: this.#hostAddress,
      serverApi: process.env.MONGODB_API_VERSION
        ? { version: process.env.MONGODB_API_VERSION }
        : undefined
    });
    this.#originalServerPool = this.#server.pool;
    this.#server.pool = this.pool;
    ALL_POOL_EVENTS.forEach(eventName => {
      this.pool.on(eventName, event => {
        if (this.#injectPoolStats) {
          event.totalConnectionCount = this.pool.totalConnectionCount;
          event.availableConnectionCount = this.pool.availableConnectionCount;
          event.pendingConnectionCount = this.pool.pendingConnectionCount;
          event.currentCheckedOutCount = this.pool.currentCheckedOutCount;
        }
        this.poolEvents.push(event);
        this.poolEventsEventEmitter.emit('poolEvent');
      });
    });
  }

  closePool() {
    this.#server.pool = this.#originalServerPool;
    ALL_POOL_EVENTS.forEach(ev => this.pool.removeAllListeners(ev));
    this.pool.close();
  }

  async tearDown() {
    if (this.pool) {
      this.closePool();
    }
    const connectionsToDestroy = Array.from(this.orphans).concat(
      Array.from(this.connections.values())
    );
    for (const conn of connectionsToDestroy) {
      conn.destroy();
    }
    this.poolEventsEventEmitter.removeAllListeners();
  }
}

async function runCmapTest(test: CmapTest, threadContext: ThreadContext) {
  expect(CMAP_TEST_KEYS).to.include.members(Object.keys(test));

  const poolOptions = test.poolOptions || {};
  expect(CMAP_POOL_OPTION_NAMES).to.include.members(Object.keys(poolOptions));

  let minPoolSizeCheckFrequencyMS;
  if (poolOptions.backgroundThreadIntervalMS) {
    if (poolOptions.backgroundThreadIntervalMS !== -1) {
      minPoolSizeCheckFrequencyMS = poolOptions.backgroundThreadIntervalMS;
    }
    delete poolOptions.backgroundThreadIntervalMS;
  }

  const metadata = makeClientMetadata({ appName: poolOptions.appName, driverInfo: {} });
  const extendedMetadata = addContainerMetadata(metadata);
  delete poolOptions.appName;

  const operations = test.operations;
  const expectedError = test.error;
  const expectedEvents = test.events;
  const ignoreEvents = test.ignore || [];

  const MAIN_THREAD_KEY = Symbol('Main Thread');
  const mainThread = threadContext.getThread(MAIN_THREAD_KEY);
  mainThread.start();

  threadContext.createPool({
    ...poolOptions,
    metadata,
    extendedMetadata,
    minPoolSizeCheckFrequencyMS
  });
  // yield control back to the event loop so that the ConnectionPoolCreatedEvent
  // has a chance to be fired before any synchronously-emitted events from
  // the queued operations
  await sleep();

  for (const idx in operations) {
    const op = operations[idx];

    const threadKey = op.name === 'checkOut' ? op.thread || MAIN_THREAD_KEY : MAIN_THREAD_KEY;
    if (threadKey === MAIN_THREAD_KEY) {
      mainThread.queue(op);
    } else {
      const thread = threadContext.getThread(threadKey);
      mainThread.queue(op, thread);
    }
  }

  const actualError = await mainThread.finish().catch(e => e);

  if (expectedError) {
    expect(actualError).to.exist;
    const { type: errorType, message: errorMessage, ...errorPropsToCheck } = expectedError;
    expect(
      actualError,
      `${actualError.name} does not match "Mongo${errorType}", ${actualError.message} ${actualError.stack}`
    ).to.have.property('name', `Mongo${errorType}`);
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
    compareInputToSpec(actualError, errorPropsToCheck, `failed while checking ${errorType}`);
  } else {
    expect(actualError, inspect(actualError)).to.not.exist;
  }

  const actualEvents = threadContext.poolEvents.filter(
    ev => !ignoreEvents.includes(getEventType(ev))
  );

  expect(actualEvents).to.have.lengthOf(expectedEvents.length);

  for (const expected of expectedEvents) {
    const actual = actualEvents.shift();
    const { type: eventType, ...eventPropsToCheck } = expected;
    expect(actual.constructor.name).to.equal(`${eventType}Event`);
    compareInputToSpec(actual, eventPropsToCheck, `failed while checking ${eventType} event`);
  }
}

export type SkipDescription = {
  description: string;
  skipIfCondition: 'loadBalanced' | 'always';
  skipReason: string;
};

export function runCmapTestSuite(
  tests: CmapTest[],
  options?: { testsToSkip?: SkipDescription[]; injectPoolStats?: boolean }
) {
  for (const test of tests) {
    describe(test.name, function () {
      let hostAddress: HostAddress,
        server: Server,
        threadContext: ThreadContext,
        client: MongoClient;

      beforeEach(async function () {
        let utilClient: MongoClient;

        const skipDescription = options?.testsToSkip?.find(
          ({ description }) => description === test.description
        );
        if (skipDescription) {
          const alwaysSkip = skipDescription.skipIfCondition === 'always';
          const matchesLoadBalanceSkip =
            skipDescription.skipIfCondition === 'loadBalanced' && this.configuration.isLoadBalanced;

          if (alwaysSkip || matchesLoadBalanceSkip) {
            this.currentTest.skipReason = skipDescription.skipReason;
            this.skip();
          }
        }

        if (this.configuration.isLoadBalanced) {
          // The util client can always point at the single mongos LB frontend.
          utilClient = this.configuration.newClient(this.configuration.singleMongosLoadBalancerUri);
        } else {
          utilClient = this.configuration.newClient();
        }

        await utilClient.connect();

        const allRequirements = test.runOn || [];

        const someRequirementMet =
          !allRequirements.length ||
          (await isAnyRequirementSatisfied(this.currentTest.ctx, allRequirements, utilClient));

        if (!someRequirementMet) {
          await utilClient.close();
          this.skip();
          // NOTE: the rest of the code below won't execute after the skip is invoked
        }

        try {
          const serverDescriptionMap = utilClient.topology?.s.description.servers;
          const hosts = shuffle(serverDescriptionMap.keys());
          const selectedHostUri = hosts[0];
          hostAddress = serverDescriptionMap.get(selectedHostUri).hostAddress;

          client = this.configuration.newClient(
            `mongodb://${hostAddress}/${
              this.configuration.isLoadBalanced ? '?loadBalanced=true' : '?directConnection=true'
            }`
          );
          await client.connect();
          if (test.failPoint) {
            await client.db('admin').command(test.failPoint);
          }

          const serverMap = client.topology?.s.servers;
          server = serverMap?.get(selectedHostUri);
          if (!server) {
            throw new Error('Failed to retrieve server for test');
          }

          threadContext = new ThreadContext(
            server,
            hostAddress,
            this.configuration.isLoadBalanced ? { loadBalanced: true } : {},
            { injectPoolStats: !!options?.injectPoolStats }
          );
        } finally {
          await utilClient.close();
        }
      });

      afterEach(async function () {
        await threadContext?.tearDown();
        if (!client) {
          return;
        }
        if (test.failPoint) {
          await client
            .db('admin')
            .command({ configureFailPoint: test.failPoint.configureFailPoint, mode: 'off' });
        }
        await client.close();
      });

      it(test.description, async function () {
        await runCmapTest(test, threadContext);
      });
    });
  }
}
