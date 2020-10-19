import * as os from 'os';
import * as crypto from 'crypto';
import { PromiseProvider } from './promise_provider';
import { MongoError, AnyError } from './error';
import { WriteConcern, WriteConcernOptions, W, writeConcernKeys } from './write_concern';
import type { Server } from './sdam/server';
import type { Topology } from './sdam/topology';
import type { EventEmitter } from 'events';
import type { Db } from './db';
import type { Collection } from './collection';
import type { OperationOptions, OperationBase, Hint } from './operations/operation';
import type { ClientSession } from './sessions';
import type { ReadConcern } from './read_concern';
import type { Connection } from './cmap/connection';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { Document } from './bson';
import type { IndexSpecification, IndexDirection } from './operations/indexes';

/** @public MongoDB Driver style callback */
export type Callback<T = any> = (error?: AnyError, result?: T) => void;
/** @public */
export type CallbackWithType<E = AnyError, T0 = any> = (error?: E, result?: T0) => void;

export const MAX_JS_INT = Number.MAX_SAFE_INTEGER + 1;

export type AnyOptions = Document;

/**
 * Add a readonly enumerable property.
 * @internal
 */
export function getSingleProperty(
  obj: AnyOptions,
  name: string | number | symbol,
  value: unknown
): void {
  Object.defineProperty(obj, name, {
    enumerable: true,
    get() {
      return value;
    }
  });
}

/**
 * Throws if collectionName is not a valid mongodb collection namespace.
 * @internal
 */
export function checkCollectionName(collectionName: string): void {
  if ('string' !== typeof collectionName) {
    throw new MongoError('collection name must be a String');
  }

  if (!collectionName || collectionName.indexOf('..') !== -1) {
    throw new MongoError('collection names cannot be empty');
  }

  if (
    collectionName.indexOf('$') !== -1 &&
    collectionName.match(/((^\$cmd)|(oplog\.\$main))/) == null
  ) {
    throw new MongoError("collection names must not contain '$'");
  }

  if (collectionName.match(/^\.|\.$/) != null) {
    throw new MongoError("collection names must not start or end with '.'");
  }

  // Validate that we are not passing 0x00 in the collection name
  if (collectionName.indexOf('\x00') !== -1) {
    throw new MongoError('collection names cannot contain a null character');
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
    keys.forEach(key => {
      indexes.push(key + '_' + indexSpec[key]);
      fieldHash[key] = indexSpec[key];
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
export function debugOptions(debugFields: string[], options?: AnyOptions): Document {
  const finalOptions: AnyOptions = {};
  if (!options) return finalOptions;
  debugFields.forEach(n => {
    finalOptions[n] = options[n];
  });

  return finalOptions;
}

/** @internal */
export function decorateCommand(command: Document, options: Document, exclude: string[]): Document {
  for (const name in options) {
    if (!exclude.includes(name)) {
      command[name] = options[name];
    }
  }

  return command;
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

/** @internal */
export function mergeOptionsAndWriteConcern(
  targetOptions: AnyOptions,
  sourceOptions: AnyOptions,
  keys: string[],
  mergeWriteConcern: boolean
): AnyOptions {
  // Mix in any allowed options
  for (let i = 0; i < keys.length; i++) {
    if (!targetOptions[keys[i]] && sourceOptions[keys[i]] !== undefined) {
      targetOptions[keys[i]] = sourceOptions[keys[i]];
    }
  }

  // No merging of write concern
  if (!mergeWriteConcern) return targetOptions;

  // Found no write Concern options
  let found = false;
  for (let i = 0; i < writeConcernKeys.length; i++) {
    if (targetOptions[writeConcernKeys[i]]) {
      found = true;
      break;
    }
  }

  if (!found) {
    for (let i = 0; i < writeConcernKeys.length; i++) {
      if (sourceOptions[writeConcernKeys[i]]) {
        targetOptions[writeConcernKeys[i]] = sourceOptions[writeConcernKeys[i]];
      }
    }
  }

  return targetOptions;
}

/**
 * Executes the given operation with provided arguments.
 *
 * @remarks
 * This method reduces large amounts of duplication in the entire codebase by providing
 * a single point for determining whether callbacks or promises should be used. Additionally
 * it allows for a single point of entry to provide features such as implicit sessions, which
 * are required by the Driver Sessions specification in the event that a ClientSession is
 * not provided
 *
 * @internal
 *
 * @param topology - The topology to execute this operation on
 * @param operation - The operation to execute
 * @param args - Arguments to apply the provided operation
 * @param options - Options that modify the behavior of the method
 */
export function executeLegacyOperation<T extends OperationBase>(
  topology: Topology,
  operation: (...args: any[]) => void | Promise<Document>,
  args: any[],
  options?: AnyOptions
): void | Promise<any> {
  const Promise = PromiseProvider.get();

  if (topology == null) {
    throw new TypeError('This method requires a valid topology instance');
  }

  if (!Array.isArray(args)) {
    throw new TypeError('This method requires an array of arguments to apply');
  }

  options = options || {};

  let callback = args[args.length - 1];

  // The driver sessions spec mandates that we implicitly create sessions for operations
  // that are not explicitly provided with a session.
  let session: ClientSession;
  let opOptions: any;
  let owner: any;
  if (!options.skipSessions && topology.hasSessionSupport()) {
    opOptions = args[args.length - 2];
    if (opOptions == null || opOptions.session == null) {
      owner = Symbol();
      session = topology.startSession({ owner });
      const optionsIndex = args.length - 2;
      args[optionsIndex] = Object.assign({}, args[optionsIndex], { session: session });
    } else if (opOptions.session && opOptions.session.hasEnded) {
      throw new MongoError('Use of expired sessions is not permitted');
    }
  }

  function makeExecuteCallback(
    resolve: (value?: Document) => void,
    reject: (reason?: AnyError) => void
  ) {
    return function (err?: AnyError, result?: any) {
      if (session && session.owner === owner && !options?.returnsCursor) {
        session.endSession(() => {
          delete opOptions.session;
          if (err) return reject(err);
          resolve(result);
        });
      } else {
        if (err) return reject(err);
        resolve(result);
      }
    };
  }

  // Execute using callback
  if (typeof callback === 'function') {
    callback = args.pop();
    const handler = makeExecuteCallback(
      result => callback(undefined, result),
      err => callback(err, null)
    );
    args.push(handler);

    try {
      return operation(...args);
    } catch (e) {
      handler(e);
      throw e;
    }
  }

  // Return a Promise
  if (args[args.length - 1] != null) {
    throw new TypeError('final argument to `executeLegacyOperation` must be a callback');
  }

  return new Promise<any>((resolve, reject) => {
    const handler = makeExecuteCallback(resolve, reject);
    args[args.length - 1] = handler;

    try {
      return operation(...args);
    } catch (e) {
      handler(e);
    }
  });
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
  options = options || {};
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
  target: { s: { topology: Topology } } | { topology: Topology },
  options: AnyOptions
): void {
  const topology =
    ('s' in target && target.s.topology) || ('topology' in target && target.topology);

  if (!topology) {
    throw new TypeError('parameter "target" is missing a topology');
  }

  const capabilities = topology.capabilities();
  if (options.collation && typeof options.collation === 'object') {
    if (capabilities && capabilities.commandsTakeCollation) {
      command.collation = options.collation;
    } else {
      throw new MongoError(`Current topology does not support collation`);
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

/** @internal */
export function emitDeprecationWarning(msg: string): void {
  return process.emitWarning(msg, 'DeprecationWarning');
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
        emitDeprecationWarning(msg);
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
      throw new Error(`Cannot parse namespace from "${namespace}"`);
    }

    const index = namespace.indexOf('.');
    return new MongoDBNamespace(namespace.substring(0, index), namespace.substring(index + 1));
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
    result = new Promise((resolve, reject) => {
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

/** @internal */
export function collectionNamespace(ns: string): string {
  return ns.split('.').slice(1).join('.');
}

/** @internal Synchronously Generate a UUIDv4 */
export function uuidV4(): Buffer {
  const result = crypto.randomBytes(16);
  result[6] = (result[6] & 0x0f) | 0x40;
  result[8] = (result[8] & 0x3f) | 0x80;
  return result;
}

/**
 * Relays events for a given listener and emitter
 * @internal
 *
 * @param listener - the EventEmitter to listen to the events from
 * @param emitter - the EventEmitter to relay the events to
 * @param events - list of events to relay
 */
export function relayEvents(listener: EventEmitter, emitter: EventEmitter, events: string[]): void {
  events.forEach(eventName => listener.on(eventName, event => emitter.emit(eventName, event)));
}

/**
 * A helper function for determining `maxWireVersion` between legacy and new topology instances
 * @internal
 */
export function maxWireVersion(topologyOrServer?: Connection | Topology | Server): number {
  if (topologyOrServer) {
    if (topologyOrServer.ismaster) {
      return topologyOrServer.ismaster.maxWireVersion;
    }

    if ('lastIsMaster' in topologyOrServer && typeof topologyOrServer.lastIsMaster === 'function') {
      const lastIsMaster = topologyOrServer.lastIsMaster();
      if (lastIsMaster) {
        return lastIsMaster.maxWireVersion;
      }
    }

    if (
      topologyOrServer.description &&
      'maxWireVersion' in topologyOrServer.description &&
      'undefined' !== typeof topologyOrServer.description.maxWireVersion
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

/** @internal */
export function makeStateMachine(stateTable: StateTable): StateTransitionFunction {
  return function stateTransition(target, newState) {
    const legalStates = stateTable[target.s.state];
    if (legalStates && legalStates.indexOf(newState) < 0) {
      throw new TypeError(
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
  appname?: string;
}

const NODE_DRIVER_VERSION = JSON.parse(
  readFileSync(resolve(__dirname, '..', 'package.json'), { encoding: 'utf-8' })
).version;

export function makeClientMetadata(options: ClientMetadataOptions): ClientMetadata {
  options = options || {};

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
    platform: `'Node.js ${process.version}, ${os.endianness} (unified)`
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

  if (options.appname) {
    // MongoDB requires the appname not exceed a byte length of 128
    const buffer = Buffer.from(options.appname);
    metadata.application = {
      name: buffer.length > 128 ? buffer.slice(0, 128).toString('utf8') : options.appname
    };
  }

  return metadata;
}

/**
 * Loops over deprecated keys, will emit warning if key matched in options.
 * @internal
 *
 * @param options - an object of options
 * @param list - deprecated option keys
 */
export function emitDeprecatedOptionWarning(options: AnyOptions | undefined, list: string[]): void {
  if (!options) return;
  list.forEach(option => {
    if (typeof options[option] !== 'undefined') {
      emitDeprecationWarning(`option [${option}] is deprecated`);
    }
  });
}

/** @internal */
export function now(): number {
  const hrtime = process.hrtime();
  return Math.floor(hrtime[0] * 1000 + hrtime[1] / 1000000);
}

/** @internal */
export function calculateDurationInMs(started: number): number {
  if (typeof started !== 'number') {
    throw TypeError('numeric value required to calculate duration');
  }

  const elapsed = now() - started;
  return elapsed < 0 ? 0 : elapsed;
}

export interface InterruptableAsyncIntervalOptions {
  /** The interval to execute a method on */
  interval: number;
  /** A minimum interval that must elapse before the method is called */
  minInterval: number;
  /** Whether the method should be called immediately when the interval is started  */
  immediate: boolean;

  /* @internal only used for testing unreliable timer environments */
  clock: () => number;
}

/** @internal */
export interface InterruptableAsyncInterval {
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
export function makeInterruptableAsyncInterval(
  fn: (callback: Callback) => void,
  options?: Partial<InterruptableAsyncIntervalOptions>
): InterruptableAsyncInterval {
  let timerId: NodeJS.Timeout | undefined;
  let lastCallTime: number;
  let lastWakeTime: number;
  let stopped = false;

  options = options || {};
  const interval = options.interval || 1000;
  const minInterval = options.minInterval || 500;
  const immediate = typeof options.immediate === 'boolean' ? options.immediate : false;
  const clock = typeof options.clock === 'function' ? options.clock : now;

  function wake() {
    const currentTime = clock();
    const timeSinceLastWake = currentTime - lastWakeTime;
    const timeSinceLastCall = currentTime - lastCallTime;
    const timeUntilNextCall = interval - timeSinceLastCall;
    lastWakeTime = currentTime;

    // For the streaming protocol: there is nothing obviously stopping this
    // interval from being woken up again while we are waiting "infinitely"
    // for `fn` to be called again`. Since the function effectively
    // never completes, the `timeUntilNextCall` will continue to grow
    // negatively unbounded, so it will never trigger a reschedule here.

    // debounce multiple calls to wake within the `minInterval`
    if (timeSinceLastWake < minInterval) {
      return;
    }

    // reschedule a call as soon as possible, ensuring the call never happens
    // faster than the `minInterval`
    if (timeUntilNextCall > minInterval) {
      reschedule(minInterval);
    }

    // This is possible in virtualized environments like AWS Lambda where our
    // clock is unreliable. In these cases the timer is "running" but never
    // actually completes, so we want to execute immediately and then attempt
    // to reschedule.
    if (timeUntilNextCall < 0) {
      executeAndReschedule();
    }
  }

  function stop() {
    stopped = true;
    if (timerId) {
      clearTimeout(timerId);
      timerId = undefined;
    }

    lastCallTime = 0;
    lastWakeTime = 0;
  }

  function reschedule(ms?: number) {
    if (stopped) return;
    if (timerId) {
      clearTimeout(timerId);
    }

    timerId = setTimeout(executeAndReschedule, ms || interval);
  }

  function executeAndReschedule() {
    lastWakeTime = 0;
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
