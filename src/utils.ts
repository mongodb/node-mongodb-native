import * as crypto from 'crypto';
import type { SrvRecord } from 'dns';
import * as os from 'os';
import { URL } from 'url';

import { Document, ObjectId, resolveBSONOptions } from './bson';
import type { Connection } from './cmap/connection';
import { MAX_SUPPORTED_WIRE_VERSION } from './cmap/wire_protocol/constants';
import type { Collection } from './collection';
import { LEGACY_HELLO_COMMAND } from './constants';
import type { AbstractCursor } from './cursor/abstract_cursor';
import type { FindCursor } from './cursor/find_cursor';
import type { Db } from './db';
import {
  AnyError,
  MongoCompatibilityError,
  MongoInvalidArgumentError,
  MongoNotConnectedError,
  MongoParseError,
  MongoRuntimeError
} from './error';
import type { Explain } from './explain';
import type { MongoClient } from './mongo_client';
import type { CommandOperationOptions, OperationParent } from './operations/command';
import type { IndexDirection, IndexSpecification } from './operations/indexes';
import type { Hint, OperationOptions } from './operations/operation';
import { PromiseProvider } from './promise_provider';
import { ReadConcern } from './read_concern';
import { ReadPreference } from './read_preference';
import { ServerType } from './sdam/common';
import type { Server } from './sdam/server';
import type { Topology } from './sdam/topology';
import type { ClientSession } from './sessions';
import { W, WriteConcern, WriteConcernOptions } from './write_concern';

/**
 * MongoDB Driver style callback
 * @public
 */
export type Callback<T = any> = (error?: AnyError, result?: T) => void;

export const MAX_JS_INT = Number.MAX_SAFE_INTEGER + 1;

export type AnyOptions = Document;

/**
 * Throws if collectionName is not a valid mongodb collection namespace.
 * @internal
 */
export function checkCollectionName(collectionName: string): void {
  if ('string' !== typeof collectionName) {
    throw new MongoInvalidArgumentError('Collection name must be a String');
  }

  if (!collectionName || collectionName.indexOf('..') !== -1) {
    throw new MongoInvalidArgumentError('Collection names cannot be empty');
  }

  if (
    collectionName.indexOf('$') !== -1 &&
    collectionName.match(/((^\$cmd)|(oplog\.\$main))/) == null
  ) {
    // TODO(NODE-3483): Use MongoNamespace static method
    throw new MongoInvalidArgumentError("Collection names must not contain '$'");
  }

  if (collectionName.match(/^\.|\.$/) != null) {
    // TODO(NODE-3483): Use MongoNamespace static method
    throw new MongoInvalidArgumentError("Collection names must not start or end with '.'");
  }

  // Validate that we are not passing 0x00 in the collection name
  if (collectionName.indexOf('\x00') !== -1) {
    // TODO(NODE-3483): Use MongoNamespace static method
    throw new MongoInvalidArgumentError('Collection names cannot contain a null character');
  }
}

/**
 * Ensure Hint field is in a shape we expect:
 * - object of index names mapping to 1 or -1
 * - just an index name
 * @internal
 */
export function normalizeHintField(hint?: Hint): Hint | undefined {
  let finalHint = undefined;

  if (typeof hint === 'string') {
    finalHint = hint;
  } else if (Array.isArray(hint)) {
    finalHint = {};

    hint.forEach(param => {
      finalHint[param] = 1;
    });
  } else if (hint != null && typeof hint === 'object') {
    finalHint = {} as Document;
    for (const name in hint) {
      finalHint[name] = hint[name];
    }
  }

  return finalHint;
}

interface IndexOptions {
  name: string;
  keys?: string[];
  fieldHash: Document;
}

/**
 * Create an index specifier based on
 * @internal
 */
export function parseIndexOptions(indexSpec: IndexSpecification): IndexOptions {
  const fieldHash: { [key: string]: IndexDirection } = {};
  const indexes = [];
  let keys;

  // Get all the fields accordingly
  if ('string' === typeof indexSpec) {
    // 'type'
    indexes.push(indexSpec + '_' + 1);
    fieldHash[indexSpec] = 1;
  } else if (Array.isArray(indexSpec)) {
    indexSpec.forEach((f: any) => {
      if ('string' === typeof f) {
        // [{location:'2d'}, 'type']
        indexes.push(f + '_' + 1);
        fieldHash[f] = 1;
      } else if (Array.isArray(f)) {
        // [['location', '2d'],['type', 1]]
        indexes.push(f[0] + '_' + (f[1] || 1));
        fieldHash[f[0]] = f[1] || 1;
      } else if (isObject(f)) {
        // [{location:'2d'}, {type:1}]
        keys = Object.keys(f);
        keys.forEach(k => {
          indexes.push(k + '_' + (f as AnyOptions)[k]);
          fieldHash[k] = (f as AnyOptions)[k];
        });
      } else {
        // undefined (ignore)
      }
    });
  } else if (isObject(indexSpec)) {
    // {location:'2d', type:1}
    keys = Object.keys(indexSpec);
    Object.entries(indexSpec).forEach(([key, value]) => {
      indexes.push(key + '_' + value);
      fieldHash[key] = value;
    });
  }

  return {
    name: indexes.join('_'),
    keys: keys,
    fieldHash: fieldHash
  };
}

/**
 * Checks if arg is an Object:
 * - **NOTE**: the check is based on the `[Symbol.toStringTag]() === 'Object'`
 * @internal
 */
// eslint-disable-next-line @typescript-eslint/ban-types
export function isObject(arg: unknown): arg is object {
  return '[object Object]' === Object.prototype.toString.call(arg);
}

/** @internal */
export function mergeOptions<T, S>(target: T, source: S): T & S {
  return { ...target, ...source };
}

/** @internal */
export function filterOptions(options: AnyOptions, names: string[]): AnyOptions {
  const filterOptions: AnyOptions = {};

  for (const name in options) {
    if (names.includes(name)) {
      filterOptions[name] = options[name];
    }
  }

  // Filtered options
  return filterOptions;
}

interface HasRetryableWrites {
  retryWrites?: boolean;
}
/**
 * Applies retryWrites: true to a command if retryWrites is set on the command's database.
 * @internal
 *
 * @param target - The target command to which we will apply retryWrites.
 * @param db - The database from which we can inherit a retryWrites value.
 */
export function applyRetryableWrites<T extends HasRetryableWrites>(target: T, db?: Db): T {
  if (db && db.s.options?.retryWrites) {
    target.retryWrites = true;
  }

  return target;
}

interface HasWriteConcern {
  writeConcern?: WriteConcernOptions | WriteConcern | W;
}
/**
 * Applies a write concern to a command based on well defined inheritance rules, optionally
 * detecting support for the write concern in the first place.
 * @internal
 *
 * @param target - the target command we will be applying the write concern to
 * @param sources - sources where we can inherit default write concerns from
 * @param options - optional settings passed into a command for write concern overrides
 */
export function applyWriteConcern<T extends HasWriteConcern>(
  target: T,
  sources: { db?: Db; collection?: Collection },
  options?: OperationOptions & WriteConcernOptions
): T {
  options = options ?? {};
  const db = sources.db;
  const coll = sources.collection;

  if (options.session && options.session.inTransaction()) {
    // writeConcern is not allowed within a multi-statement transaction
    if (target.writeConcern) {
      delete target.writeConcern;
    }

    return target;
  }

  const writeConcern = WriteConcern.fromOptions(options);
  if (writeConcern) {
    return Object.assign(target, { writeConcern });
  }

  if (coll && coll.writeConcern) {
    return Object.assign(target, { writeConcern: Object.assign({}, coll.writeConcern) });
  }

  if (db && db.writeConcern) {
    return Object.assign(target, { writeConcern: Object.assign({}, db.writeConcern) });
  }

  return target;
}

/**
 * Checks if a given value is a Promise
 *
 * @typeParam T - The result type of maybePromise
 * @param maybePromise - An object that could be a promise
 * @returns true if the provided value is a Promise
 */
export function isPromiseLike<T = any>(
  maybePromise?: PromiseLike<T> | void
): maybePromise is Promise<T> {
  return !!maybePromise && typeof maybePromise.then === 'function';
}

/**
 * Applies collation to a given command.
 * @internal
 *
 * @param command - the command on which to apply collation
 * @param target - target of command
 * @param options - options containing collation settings
 */
export function decorateWithCollation(
  command: Document,
  target: MongoClient | Db | Collection,
  options: AnyOptions
): void {
  const capabilities = getTopology(target).capabilities;
  if (options.collation && typeof options.collation === 'object') {
    if (capabilities && capabilities.commandsTakeCollation) {
      command.collation = options.collation;
    } else {
      throw new MongoCompatibilityError(`Current topology does not support collation`);
    }
  }
}

/**
 * Applies a read concern to a given command.
 * @internal
 *
 * @param command - the command on which to apply the read concern
 * @param coll - the parent collection of the operation calling this method
 */
export function decorateWithReadConcern(
  command: Document,
  coll: { s: { readConcern?: ReadConcern } },
  options?: OperationOptions
): void {
  if (options && options.session && options.session.inTransaction()) {
    return;
  }
  const readConcern = Object.assign({}, command.readConcern || {});
  if (coll.s.readConcern) {
    Object.assign(readConcern, coll.s.readConcern);
  }

  if (Object.keys(readConcern).length > 0) {
    Object.assign(command, { readConcern: readConcern });
  }
}

/**
 * Applies an explain to a given command.
 * @internal
 *
 * @param command - the command on which to apply the explain
 * @param options - the options containing the explain verbosity
 */
export function decorateWithExplain(command: Document, explain: Explain): Document {
  if (command.explain) {
    return command;
  }

  return { explain: command, verbosity: explain.verbosity };
}

/**
 * @internal
 */
export type TopologyProvider =
  | MongoClient
  | ClientSession
  | FindCursor
  | AbstractCursor
  | Collection<any>
  | Db;

/**
 * A helper function to get the topology from a given provider. Throws
 * if the topology cannot be found.
 * @throws MongoNotConnectedError
 * @internal
 */
export function getTopology(provider: TopologyProvider): Topology {
  // MongoClient or ClientSession or AbstractCursor
  if (`topology` in provider && provider.topology) {
    return provider.topology;
  } else if ('s' in provider && 'client' in provider.s && provider.s.client.topology) {
    return provider.s.client.topology;
  } else if ('s' in provider && 'db' in provider.s && provider.s.db.s.client.topology) {
    return provider.s.db.s.client.topology;
  }

  throw new MongoNotConnectedError('MongoClient must be connected to perform this operation');
}

/**
 * Default message handler for generating deprecation warnings.
 * @internal
 *
 * @param name - function name
 * @param option - option name
 * @returns warning message
 */
export function defaultMsgHandler(name: string, option: string): string {
  return `${name} option [${option}] is deprecated and will be removed in a later version.`;
}

export interface DeprecateOptionsConfig {
  /** function name */
  name: string;
  /** options to deprecate */
  deprecatedOptions: string[];
  /** index of options object in function arguments array */
  optionsIndex: number;
  /** optional custom message handler to generate warnings */
  msgHandler?(name: string, option: string): string;
}

/**
 * Deprecates a given function's options.
 * @internal
 *
 * @param this - the bound class if this is a method
 * @param config - configuration for deprecation
 * @param fn - the target function of deprecation
 * @returns modified function that warns once per deprecated option, and executes original function
 */
export function deprecateOptions(
  this: unknown,
  config: DeprecateOptionsConfig,
  fn: (...args: any[]) => any
): any {
  if ((process as any).noDeprecation === true) {
    return fn;
  }

  const msgHandler = config.msgHandler ? config.msgHandler : defaultMsgHandler;

  const optionsWarned = new Set();
  function deprecated(this: any, ...args: any[]) {
    const options = args[config.optionsIndex] as AnyOptions;

    // ensure options is a valid, non-empty object, otherwise short-circuit
    if (!isObject(options) || Object.keys(options).length === 0) {
      return fn.bind(this)(...args); // call the function, no change
    }

    // interrupt the function call with a warning
    for (const deprecatedOption of config.deprecatedOptions) {
      if (deprecatedOption in options && !optionsWarned.has(deprecatedOption)) {
        optionsWarned.add(deprecatedOption);
        const msg = msgHandler(config.name, deprecatedOption);
        emitWarning(msg);
        if (this && 'getLogger' in this) {
          const logger = this.getLogger();
          if (logger) {
            logger.warn(msg);
          }
        }
      }
    }

    return fn.bind(this)(...args);
  }

  // These lines copied from https://github.com/nodejs/node/blob/25e5ae41688676a5fd29b2e2e7602168eee4ceb5/lib/internal/util.js#L73-L80
  // The wrapper will keep the same prototype as fn to maintain prototype chain
  Object.setPrototypeOf(deprecated, fn);
  if (fn.prototype) {
    // Setting this (rather than using Object.setPrototype, as above) ensures
    // that calling the unwrapped constructor gives an instanceof the wrapped
    // constructor.
    deprecated.prototype = fn.prototype;
  }

  return deprecated;
}

/** @internal */
export function ns(ns: string): MongoDBNamespace {
  return MongoDBNamespace.fromString(ns);
}

/** @public */
export class MongoDBNamespace {
  db: string;
  collection?: string;
  /**
   * Create a namespace object
   *
   * @param db - database name
   * @param collection - collection name
   */
  constructor(db: string, collection?: string) {
    this.db = db;
    this.collection = collection;
  }

  toString(): string {
    return this.collection ? `${this.db}.${this.collection}` : this.db;
  }

  withCollection(collection: string): MongoDBNamespace {
    return new MongoDBNamespace(this.db, collection);
  }

  static fromString(namespace?: string): MongoDBNamespace {
    if (!namespace) {
      // TODO(NODE-3483): Replace with MongoNamespaceError
      throw new MongoRuntimeError(`Cannot parse namespace from "${namespace}"`);
    }

    const [db, ...collection] = namespace.split('.');
    return new MongoDBNamespace(db, collection.join('.'));
  }
}

/** @internal */
export function* makeCounter(seed = 0): Generator<number> {
  let count = seed;
  while (true) {
    const newCount = count;
    count += 1;
    yield newCount;
  }
}

/**
 * Helper function for either accepting a callback, or returning a promise
 * @internal
 *
 * @param callback - The last function argument in exposed method, controls if a Promise is returned
 * @param wrapper - A function that wraps the callback
 * @returns Returns void if a callback is supplied, else returns a Promise.
 */
export function maybePromise<T>(
  callback: Callback<T> | undefined,
  wrapper: (fn: Callback<T>) => void
): Promise<T> | void {
  const Promise = PromiseProvider.get();
  let result: Promise<T> | void;
  if (typeof callback !== 'function') {
    result = new Promise<any>((resolve, reject) => {
      callback = (err, res) => {
        if (err) return reject(err);
        resolve(res);
      };
    });
  }

  wrapper((err, res) => {
    if (err != null) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        callback!(err);
      } catch (error) {
        process.nextTick(() => {
          throw error;
        });
      }

      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    callback!(err, res);
  });

  return result;
}

/** @internal */
export function databaseNamespace(ns: string): string {
  return ns.split('.')[0];
}

/**
 * Synchronously Generate a UUIDv4
 * @internal
 */
export function uuidV4(): Buffer {
  const result = crypto.randomBytes(16);
  result[6] = (result[6] & 0x0f) | 0x40;
  result[8] = (result[8] & 0x3f) | 0x80;
  return result;
}

/**
 * A helper function for determining `maxWireVersion` between legacy and new topology instances
 * @internal
 */
export function maxWireVersion(topologyOrServer?: Connection | Topology | Server): number {
  if (topologyOrServer) {
    if (topologyOrServer.loadBalanced) {
      // Since we do not have a monitor, we assume the load balanced server is always
      // pointed at the latest mongodb version. There is a risk that for on-prem
      // deployments that don't upgrade immediately that this could alert to the
      // application that a feature is avaiable that is actually not.
      return MAX_SUPPORTED_WIRE_VERSION;
    }
    if (topologyOrServer.hello) {
      return topologyOrServer.hello.maxWireVersion;
    }

    if ('lastHello' in topologyOrServer && typeof topologyOrServer.lastHello === 'function') {
      const lastHello = topologyOrServer.lastHello();
      if (lastHello) {
        return lastHello.maxWireVersion;
      }
    }

    if (
      topologyOrServer.description &&
      'maxWireVersion' in topologyOrServer.description &&
      topologyOrServer.description.maxWireVersion != null
    ) {
      return topologyOrServer.description.maxWireVersion;
    }
  }

  return 0;
}

/**
 * Checks that collation is supported by server.
 * @internal
 *
 * @param server - to check against
 * @param cmd - object where collation may be specified
 */
export function collationNotSupported(server: Server, cmd: Document): boolean {
  return cmd && cmd.collation && maxWireVersion(server) < 5;
}

/**
 * Applies the function `eachFn` to each item in `arr`, in parallel.
 * @internal
 *
 * @param arr - An array of items to asynchronously iterate over
 * @param eachFn - A function to call on each item of the array. The callback signature is `(item, callback)`, where the callback indicates iteration is complete.
 * @param callback - The callback called after every item has been iterated
 */
export function eachAsync<T = Document>(
  arr: T[],
  eachFn: (item: T, callback: (err?: AnyError) => void) => void,
  callback: Callback
): void {
  arr = arr || [];

  let idx = 0;
  let awaiting = 0;
  for (idx = 0; idx < arr.length; ++idx) {
    awaiting++;
    eachFn(arr[idx], eachCallback);
  }

  if (awaiting === 0) {
    callback();
    return;
  }

  function eachCallback(err?: AnyError) {
    awaiting--;
    if (err) {
      callback(err);
      return;
    }

    if (idx === arr.length && awaiting <= 0) {
      callback();
    }
  }
}

/** @internal */
export function eachAsyncSeries<T = any>(
  arr: T[],
  eachFn: (item: T, callback: (err?: AnyError) => void) => void,
  callback: Callback
): void {
  arr = arr || [];

  let idx = 0;
  let awaiting = arr.length;
  if (awaiting === 0) {
    callback();
    return;
  }

  function eachCallback(err?: AnyError) {
    idx++;
    awaiting--;
    if (err) {
      callback(err);
      return;
    }

    if (idx === arr.length && awaiting <= 0) {
      callback();
      return;
    }

    eachFn(arr[idx], eachCallback);
  }

  eachFn(arr[idx], eachCallback);
}

/** @internal */
export function arrayStrictEqual(arr: unknown[], arr2: unknown[]): boolean {
  if (!Array.isArray(arr) || !Array.isArray(arr2)) {
    return false;
  }

  return arr.length === arr2.length && arr.every((elt, idx) => elt === arr2[idx]);
}

/** @internal */
export function errorStrictEqual(lhs?: AnyError, rhs?: AnyError): boolean {
  if (lhs === rhs) {
    return true;
  }

  if (!lhs || !rhs) {
    return lhs === rhs;
  }

  if ((lhs == null && rhs != null) || (lhs != null && rhs == null)) {
    return false;
  }

  if (lhs.constructor.name !== rhs.constructor.name) {
    return false;
  }

  if (lhs.message !== rhs.message) {
    return false;
  }

  return true;
}

interface StateTable {
  [key: string]: string[];
}
interface ObjectWithState {
  s: { state: string };
  emit(event: 'stateChanged', state: string, newState: string): void;
}
interface StateTransitionFunction {
  (target: ObjectWithState, newState: string): void;
}

/** @public */
export type EventEmitterWithState = {
  /** @internal */
  stateChanged(previous: string, current: string): void;
};

/** @internal */
export function makeStateMachine(stateTable: StateTable): StateTransitionFunction {
  return function stateTransition(target, newState) {
    const legalStates = stateTable[target.s.state];
    if (legalStates && legalStates.indexOf(newState) < 0) {
      throw new MongoRuntimeError(
        `illegal state transition from [${target.s.state}] => [${newState}], allowed: [${legalStates}]`
      );
    }

    target.emit('stateChanged', target.s.state, newState);
    target.s.state = newState;
  };
}

/** @public */
export interface ClientMetadata {
  driver: {
    name: string;
    version: string;
  };
  os: {
    type: string;
    name: NodeJS.Platform;
    architecture: string;
    version: string;
  };
  platform: string;
  version?: string;
  application?: {
    name: string;
  };
}

/** @public */
export interface ClientMetadataOptions {
  driverInfo?: {
    name?: string;
    version?: string;
    platform?: string;
  };
  appName?: string;
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const NODE_DRIVER_VERSION = require('../package.json').version;

export function makeClientMetadata(options?: ClientMetadataOptions): ClientMetadata {
  options = options ?? {};

  const metadata: ClientMetadata = {
    driver: {
      name: 'nodejs',
      version: NODE_DRIVER_VERSION
    },
    os: {
      type: os.type(),
      name: process.platform,
      architecture: process.arch,
      version: os.release()
    },
    platform: `Node.js ${process.version}, ${os.endianness()} (unified)`
  };

  // support optionally provided wrapping driver info
  if (options.driverInfo) {
    if (options.driverInfo.name) {
      metadata.driver.name = `${metadata.driver.name}|${options.driverInfo.name}`;
    }

    if (options.driverInfo.version) {
      metadata.version = `${metadata.driver.version}|${options.driverInfo.version}`;
    }

    if (options.driverInfo.platform) {
      metadata.platform = `${metadata.platform}|${options.driverInfo.platform}`;
    }
  }

  if (options.appName) {
    // MongoDB requires the appName not exceed a byte length of 128
    const buffer = Buffer.from(options.appName);
    metadata.application = {
      name: buffer.byteLength > 128 ? buffer.slice(0, 128).toString('utf8') : options.appName
    };
  }

  return metadata;
}

/** @internal */
export function now(): number {
  const hrtime = process.hrtime();
  return Math.floor(hrtime[0] * 1000 + hrtime[1] / 1000000);
}

/** @internal */
export function calculateDurationInMs(started: number): number {
  if (typeof started !== 'number') {
    throw new MongoInvalidArgumentError('Numeric value required to calculate duration');
  }

  const elapsed = now() - started;
  return elapsed < 0 ? 0 : elapsed;
}

export interface InterruptibleAsyncIntervalOptions {
  /** The interval to execute a method on */
  interval: number;
  /** A minimum interval that must elapse before the method is called */
  minInterval: number;
  /** Whether the method should be called immediately when the interval is started  */
  immediate: boolean;

  /**
   * Only used for testing unreliable timer environments
   * @internal
   */
  clock: () => number;
}

/** @internal */
export interface InterruptibleAsyncInterval {
  wake(): void;
  stop(): void;
}

/**
 * Creates an interval timer which is able to be woken up sooner than
 * the interval. The timer will also debounce multiple calls to wake
 * ensuring that the function is only ever called once within a minimum
 * interval window.
 * @internal
 *
 * @param fn - An async function to run on an interval, must accept a `callback` as its only parameter
 */
export function makeInterruptibleAsyncInterval(
  fn: (callback: Callback) => void,
  options?: Partial<InterruptibleAsyncIntervalOptions>
): InterruptibleAsyncInterval {
  let timerId: NodeJS.Timeout | undefined;
  let lastCallTime: number;
  let cannotBeExpedited = false;
  let stopped = false;

  options = options ?? {};
  const interval = options.interval || 1000;
  const minInterval = options.minInterval || 500;
  const immediate = typeof options.immediate === 'boolean' ? options.immediate : false;
  const clock = typeof options.clock === 'function' ? options.clock : now;

  function wake() {
    const currentTime = clock();
    const nextScheduledCallTime = lastCallTime + interval;
    const timeUntilNextCall = nextScheduledCallTime - currentTime;

    // For the streaming protocol: there is nothing obviously stopping this
    // interval from being woken up again while we are waiting "infinitely"
    // for `fn` to be called again`. Since the function effectively
    // never completes, the `timeUntilNextCall` will continue to grow
    // negatively unbounded, so it will never trigger a reschedule here.

    // This is possible in virtualized environments like AWS Lambda where our
    // clock is unreliable. In these cases the timer is "running" but never
    // actually completes, so we want to execute immediately and then attempt
    // to reschedule.
    if (timeUntilNextCall < 0) {
      executeAndReschedule();
      return;
    }

    // debounce multiple calls to wake within the `minInterval`
    if (cannotBeExpedited) {
      return;
    }

    // reschedule a call as soon as possible, ensuring the call never happens
    // faster than the `minInterval`
    if (timeUntilNextCall > minInterval) {
      reschedule(minInterval);
      cannotBeExpedited = true;
    }
  }

  function stop() {
    stopped = true;
    if (timerId) {
      clearTimeout(timerId);
      timerId = undefined;
    }

    lastCallTime = 0;
    cannotBeExpedited = false;
  }

  function reschedule(ms?: number) {
    if (stopped) return;
    if (timerId) {
      clearTimeout(timerId);
    }

    timerId = setTimeout(executeAndReschedule, ms || interval);
  }

  function executeAndReschedule() {
    cannotBeExpedited = false;
    lastCallTime = clock();

    fn(err => {
      if (err) throw err;
      reschedule(interval);
    });
  }

  if (immediate) {
    executeAndReschedule();
  } else {
    lastCallTime = clock();
    reschedule(undefined);
  }

  return { wake, stop };
}

/** @internal */
export function hasAtomicOperators(doc: Document | Document[]): boolean {
  if (Array.isArray(doc)) {
    for (const document of doc) {
      if (hasAtomicOperators(document)) {
        return true;
      }
    }
    return false;
  }

  const keys = Object.keys(doc);
  return keys.length > 0 && keys[0][0] === '$';
}

/**
 * Merge inherited properties from parent into options, prioritizing values from options,
 * then values from parent.
 * @internal
 */
export function resolveOptions<T extends CommandOperationOptions>(
  parent: OperationParent | undefined,
  options?: T
): T {
  const result: T = Object.assign({}, options, resolveBSONOptions(options, parent));

  // Users cannot pass a readConcern/writeConcern to operations in a transaction
  const session = options?.session;
  if (!session?.inTransaction()) {
    const readConcern = ReadConcern.fromOptions(options) ?? parent?.readConcern;
    if (readConcern) {
      result.readConcern = readConcern;
    }

    const writeConcern = WriteConcern.fromOptions(options) ?? parent?.writeConcern;
    if (writeConcern) {
      result.writeConcern = writeConcern;
    }
  }

  const readPreference = ReadPreference.fromOptions(options) ?? parent?.readPreference;
  if (readPreference) {
    result.readPreference = readPreference;
  }

  return result;
}

export function isSuperset(set: Set<any> | any[], subset: Set<any> | any[]): boolean {
  set = Array.isArray(set) ? new Set(set) : set;
  subset = Array.isArray(subset) ? new Set(subset) : subset;
  for (const elem of subset) {
    if (!set.has(elem)) {
      return false;
    }
  }
  return true;
}

/**
 * Checks if the document is a Hello request
 * @internal
 */
export function isHello(doc: Document): boolean {
  return doc[LEGACY_HELLO_COMMAND] || doc.hello ? true : false;
}

/** Returns the items that are uniquely in setA */
export function setDifference<T>(setA: Iterable<T>, setB: Iterable<T>): Set<T> {
  const difference = new Set<T>(setA);
  for (const elem of setB) {
    difference.delete(elem);
  }
  return difference;
}

export function isRecord<T extends readonly string[]>(
  value: unknown,
  requiredKeys: T
): value is Record<T[number], any>;
export function isRecord(value: unknown): value is Record<string, any>;
export function isRecord(
  value: unknown,
  requiredKeys: string[] | undefined = undefined
): value is Record<string, any> {
  const toString = Object.prototype.toString;
  const hasOwnProperty = Object.prototype.hasOwnProperty;
  const isObject = (v: unknown) => toString.call(v) === '[object Object]';
  if (!isObject(value)) {
    return false;
  }

  const ctor = (value as any).constructor;
  if (ctor && ctor.prototype) {
    if (!isObject(ctor.prototype)) {
      return false;
    }

    // Check to see if some method exists from the Object exists
    if (!hasOwnProperty.call(ctor.prototype, 'isPrototypeOf')) {
      return false;
    }
  }

  if (requiredKeys) {
    const keys = Object.keys(value as Record<string, any>);
    return isSuperset(keys, requiredKeys);
  }

  return true;
}

/**
 * Make a deep copy of an object
 *
 * NOTE: This is not meant to be the perfect implementation of a deep copy,
 * but instead something that is good enough for the purposes of
 * command monitoring.
 */
export function deepCopy<T>(value: T): T {
  if (value == null) {
    return value;
  } else if (Array.isArray(value)) {
    return value.map(item => deepCopy(item)) as unknown as T;
  } else if (isRecord(value)) {
    const res = {} as any;
    for (const key in value) {
      res[key] = deepCopy(value[key]);
    }
    return res;
  }

  const ctor = (value as any).constructor;
  if (ctor) {
    switch (ctor.name.toLowerCase()) {
      case 'date':
        return new ctor(Number(value));
      case 'map':
        return new Map(value as any) as unknown as T;
      case 'set':
        return new Set(value as any) as unknown as T;
      case 'buffer':
        return Buffer.from(value as unknown as Buffer) as unknown as T;
    }
  }

  return value;
}

/** @internal */
const kBuffers = Symbol('buffers');
/** @internal */
const kLength = Symbol('length');

/**
 * A pool of Buffers which allow you to read them as if they were one
 * @internal
 */
export class BufferPool {
  [kBuffers]: Buffer[];
  [kLength]: number;

  constructor() {
    this[kBuffers] = [];
    this[kLength] = 0;
  }

  get length(): number {
    return this[kLength];
  }

  /** Adds a buffer to the internal buffer pool list */
  append(buffer: Buffer): void {
    this[kBuffers].push(buffer);
    this[kLength] += buffer.length;
  }

  /** Returns the requested number of bytes without consuming them */
  peek(size: number): Buffer {
    return this.read(size, false);
  }

  /** Reads the requested number of bytes, optionally consuming them */
  read(size: number, consume = true): Buffer {
    if (typeof size !== 'number' || size < 0) {
      throw new MongoInvalidArgumentError('Argument "size" must be a non-negative number');
    }

    if (size > this[kLength]) {
      return Buffer.alloc(0);
    }

    let result: Buffer;

    // read the whole buffer
    if (size === this.length) {
      result = Buffer.concat(this[kBuffers]);

      if (consume) {
        this[kBuffers] = [];
        this[kLength] = 0;
      }
    }

    // size is within first buffer, no need to concat
    else if (size <= this[kBuffers][0].length) {
      result = this[kBuffers][0].slice(0, size);
      if (consume) {
        this[kBuffers][0] = this[kBuffers][0].slice(size);
        this[kLength] -= size;
      }
    }

    // size is beyond first buffer, need to track and copy
    else {
      result = Buffer.allocUnsafe(size);

      let idx;
      let offset = 0;
      let bytesToCopy = size;
      for (idx = 0; idx < this[kBuffers].length; ++idx) {
        let bytesCopied;
        if (bytesToCopy > this[kBuffers][idx].length) {
          bytesCopied = this[kBuffers][idx].copy(result, offset, 0);
          offset += bytesCopied;
        } else {
          bytesCopied = this[kBuffers][idx].copy(result, offset, 0, bytesToCopy);
          if (consume) {
            this[kBuffers][idx] = this[kBuffers][idx].slice(bytesCopied);
          }
          offset += bytesCopied;
          break;
        }

        bytesToCopy -= bytesCopied;
      }

      // compact the internal buffer array
      if (consume) {
        this[kBuffers] = this[kBuffers].slice(idx);
        this[kLength] -= size;
      }
    }

    return result;
  }
}

/** @public */
export class HostAddress {
  host;
  port;
  // Driver only works with unix socket path to connect
  // SDAM operates only on tcp addresses
  socketPath;
  isIPv6;

  constructor(hostString: string) {
    const escapedHost = hostString.split(' ').join('%20'); // escape spaces, for socket path hosts
    const { hostname, port } = new URL(`mongodb://${escapedHost}`);

    if (hostname.endsWith('.sock')) {
      // heuristically determine if we're working with a domain socket
      this.socketPath = decodeURIComponent(hostname);
    } else if (typeof hostname === 'string') {
      this.isIPv6 = false;

      let normalized = decodeURIComponent(hostname).toLowerCase();
      if (normalized.startsWith('[') && normalized.endsWith(']')) {
        this.isIPv6 = true;
        normalized = normalized.substring(1, hostname.length - 1);
      }

      this.host = normalized.toLowerCase();

      if (typeof port === 'number') {
        this.port = port;
      } else if (typeof port === 'string' && port !== '') {
        this.port = Number.parseInt(port, 10);
      } else {
        this.port = 27017;
      }

      if (this.port === 0) {
        throw new MongoParseError('Invalid port (zero) with hostname');
      }
    } else {
      throw new MongoInvalidArgumentError('Either socketPath or host must be defined.');
    }
    Object.freeze(this);
  }

  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return this.inspect();
  }

  inspect(): string {
    return `new HostAddress('${this.toString(true)}')`;
  }

  /**
   * @param ipv6Brackets - optionally request ipv6 bracket notation required for connection strings
   */
  toString(ipv6Brackets = false): string {
    if (typeof this.host === 'string') {
      if (this.isIPv6 && ipv6Brackets) {
        return `[${this.host}]:${this.port}`;
      }
      return `${this.host}:${this.port}`;
    }
    return `${this.socketPath}`;
  }

  static fromString(s: string): HostAddress {
    return new HostAddress(s);
  }

  static fromHostPort(host: string, port: number): HostAddress {
    if (host.includes(':')) {
      host = `[${host}]`; // IPv6 address
    }
    return HostAddress.fromString(`${host}:${port}`);
  }

  static fromSrvRecord({ name, port }: SrvRecord): HostAddress {
    return HostAddress.fromHostPort(name, port);
  }
}

export const DEFAULT_PK_FACTORY = {
  // We prefer not to rely on ObjectId having a createPk method
  createPk(): ObjectId {
    return new ObjectId();
  }
};

/**
 * When the driver used emitWarning the code will be equal to this.
 * @public
 *
 * @example
 * ```js
 * process.on('warning', (warning) => {
 *  if (warning.code === MONGODB_WARNING_CODE) console.error('Ah an important warning! :)')
 * })
 * ```
 */
export const MONGODB_WARNING_CODE = 'MONGODB DRIVER' as const;

/** @internal */
export function emitWarning(message: string): void {
  return process.emitWarning(message, { code: MONGODB_WARNING_CODE } as any);
}

const emittedWarnings = new Set();
/**
 * Will emit a warning once for the duration of the application.
 * Uses the message to identify if it has already been emitted
 * so using string interpolation can cause multiple emits
 * @internal
 */
export function emitWarningOnce(message: string): void {
  if (!emittedWarnings.has(message)) {
    emittedWarnings.add(message);
    return emitWarning(message);
  }
}

/**
 * Takes a JS object and joins the values into a string separated by ', '
 */
export function enumToString(en: Record<string, unknown>): string {
  return Object.values(en).join(', ');
}

/**
 * Determine if a server supports retryable writes.
 *
 * @internal
 */
export function supportsRetryableWrites(server?: Server): boolean {
  if (!server) {
    return false;
  }

  if (server.loadBalanced) {
    // Loadbalanced topologies will always support retry writes
    return true;
  }

  if (server.description.logicalSessionTimeoutMinutes != null) {
    // that supports sessions
    if (server.description.type !== ServerType.Standalone) {
      // and that is not a standalone
      return true;
    }
  }

  return false;
}

export function parsePackageVersion({ version }: { version: string }): {
  major: number;
  minor: number;
  patch: number;
} {
  const [major, minor, patch] = version.split('.').map((n: string) => Number.parseInt(n, 10));
  return { major, minor, patch };
}

/**
 * Fisher–Yates Shuffle
 *
 * Reference: https://bost.ocks.org/mike/shuffle/
 * @param sequence - items to be shuffled
 * @param limit - Defaults to `0`. If nonzero shuffle will slice the randomized array e.g, `.slice(0, limit)` otherwise will return the entire randomized array.
 */
export function shuffle<T>(sequence: Iterable<T>, limit = 0): Array<T> {
  const items = Array.from(sequence); // shallow copy in order to never shuffle the input

  if (limit > items.length) {
    throw new MongoRuntimeError('Limit must be less than the number of items');
  }

  let remainingItemsToShuffle = items.length;
  const lowerBound = limit % items.length === 0 ? 1 : items.length - limit;
  while (remainingItemsToShuffle > lowerBound) {
    // Pick a remaining element
    const randomIndex = Math.floor(Math.random() * remainingItemsToShuffle);
    remainingItemsToShuffle -= 1;

    // And swap it with the current element
    const swapHold = items[remainingItemsToShuffle];
    items[remainingItemsToShuffle] = items[randomIndex];
    items[randomIndex] = swapHold;
  }

  return limit % items.length === 0 ? items : items.slice(lowerBound);
}

// TODO: this should be codified in command construction
// @see https://github.com/mongodb/specifications/blob/master/source/read-write-concern/read-write-concern.rst#read-concern
export function commandSupportsReadConcern(command: Document, options?: Document): boolean {
  if (command.aggregate || command.count || command.distinct || command.find || command.geoNear) {
    return true;
  }

  if (
    command.mapReduce &&
    options &&
    options.out &&
    (options.out.inline === 1 || options.out === 'inline')
  ) {
    return true;
  }

  return false;
}
