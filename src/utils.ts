import * as os from 'os';
import * as crypto from 'crypto';
import { PromiseProvider } from './promise_provider';
import { MongoError, AnyError } from './error';
import { WriteConcern } from './write_concern';

const MAX_JS_INT = Number.MAX_SAFE_INTEGER + 1;

export type Callback<T = any> = (error?: AnyError, result?: T) => void;
export type Callback2<T0 = any, T1 = any> = (error?: AnyError, result0?: T0, result1?: T1) => void;
export type CallbackWithType<E = AnyError, T0 = any> = (error?: E, result?: T0) => void;

// Set simple property
function getSingleProperty(obj: any, name: any, value: any) {
  Object.defineProperty(obj, name, {
    enumerable: true,
    get() {
      return value;
    }
  });
}

function formatSortValue(sortDirection: any) {
  const value = ('' + sortDirection).toLowerCase();

  switch (value) {
    case 'ascending':
    case 'asc':
    case '1':
      return 1;
    case 'descending':
    case 'desc':
    case '-1':
      return -1;
    default:
      throw new Error(
        'Illegal sort clause, must be of the form ' +
          "[['field1', '(ascending|descending)'], " +
          "['field2', '(ascending|descending)']]"
      );
  }
}

function formattedOrderClause(sortValue: any) {
  let orderBy: any = {};
  if (sortValue == null) return null;
  if (Array.isArray(sortValue)) {
    if (sortValue.length === 0) {
      return null;
    }

    for (let i = 0; i < sortValue.length; i++) {
      if (sortValue[i].constructor === String) {
        orderBy[sortValue[i]] = 1;
      } else {
        orderBy[sortValue[i][0]] = formatSortValue(sortValue[i][1]);
      }
    }
  } else if (sortValue != null && typeof sortValue === 'object') {
    orderBy = sortValue;
  } else if (typeof sortValue === 'string') {
    orderBy[sortValue] = 1;
  } else {
    throw new Error(
      'Illegal sort clause, must be of the form ' +
        "[['field1', '(ascending|descending)'], ['field2', '(ascending|descending)']]"
    );
  }

  return orderBy;
}

function checkCollectionName(collectionName: any) {
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
 * @param {any} hint
 */
function normalizeHintField(hint: any) {
  let finalHint: any = null;

  if (typeof hint === 'string') {
    finalHint = hint;
  } else if (Array.isArray(hint)) {
    finalHint = {};

    hint.forEach(function (param: any) {
      finalHint[param] = 1;
    });
  } else if (hint != null && typeof hint === 'object') {
    finalHint = {};
    for (const name in hint) {
      finalHint[name] = hint[name];
    }
  }

  return finalHint;
}

/**
 * Create index name based on field spec
 *
 * @param {any} fieldOrSpec
 */
function parseIndexOptions(fieldOrSpec: any) {
  const fieldHash: any = {};
  const indexes = [];
  let keys;

  // Get all the fields accordingly
  if ('string' === typeof fieldOrSpec) {
    // 'type'
    indexes.push(fieldOrSpec + '_' + 1);
    fieldHash[fieldOrSpec] = 1;
  } else if (Array.isArray(fieldOrSpec)) {
    fieldOrSpec.forEach(function (f: any) {
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
        keys.forEach(function (k: any) {
          indexes.push(k + '_' + f[k]);
          fieldHash[k] = f[k];
        });
      } else {
        // undefined (ignore)
      }
    });
  } else if (isObject(fieldOrSpec)) {
    // {location:'2d', type:1}
    keys = Object.keys(fieldOrSpec);
    keys.forEach(function (key: any) {
      indexes.push(key + '_' + fieldOrSpec[key]);
      fieldHash[key] = fieldOrSpec[key];
    });
  }

  return {
    name: indexes.join('_'),
    keys: keys,
    fieldHash: fieldHash
  };
}

function isObject(arg: any) {
  return '[object Object]' === Object.prototype.toString.call(arg);
}

function debugOptions(debugFields: any, options: any) {
  const finalOptions: any = {};
  debugFields.forEach(function (n: any) {
    finalOptions[n] = options[n];
  });

  return finalOptions;
}

function decorateCommand(command: any, options: any, exclude: any) {
  for (const name in options) {
    if (exclude.indexOf(name) === -1) command[name] = options[name];
  }

  return command;
}

function mergeOptions(target: any, source: any) {
  for (const name in source) {
    target[name] = source[name];
  }

  return target;
}

function filterOptions(options: any, names: any) {
  const filterOptions: any = {};

  for (const name in options) {
    if (names.indexOf(name) !== -1) filterOptions[name] = options[name];
  }

  // Filtered options
  return filterOptions;
}

// Write concern keys
const writeConcernKeys = ['w', 'j', 'wtimeout', 'fsync'];

// Merge the write concern options
function mergeOptionsAndWriteConcern(
  targetOptions: any,
  sourceOptions: any,
  keys: any,
  mergeWriteConcern: any
) {
  // Mix in any allowed options
  for (var i = 0; i < keys.length; i++) {
    if (!targetOptions[keys[i]] && sourceOptions[keys[i]] !== undefined) {
      targetOptions[keys[i]] = sourceOptions[keys[i]];
    }
  }

  // No merging of write concern
  if (!mergeWriteConcern) return targetOptions;

  // Found no write Concern options
  let found = false;
  for (i = 0; i < writeConcernKeys.length; i++) {
    if (targetOptions[writeConcernKeys[i]]) {
      found = true;
      break;
    }
  }

  if (!found) {
    for (i = 0; i < writeConcernKeys.length; i++) {
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
 * This method reduces large amounts of duplication in the entire codebase by providing
 * a single point for determining whether callbacks or promises should be used. Additionally
 * it allows for a single point of entry to provide features such as implicit sessions, which
 * are required by the Driver Sessions specification in the event that a ClientSession is
 * not provided
 *
 * @param {any} topology The topology to execute this operation on
 * @param {Function} operation The operation to execute
 * @param {any[]} args Arguments to apply the provided operation
 * @param {any} [options] Options that modify the behavior of the method
 */
const executeLegacyOperation = (topology: any, operation: Function, args: any, options?: any) => {
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
  let session: any, opOptions: any, owner: any;
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

  const makeExecuteCallback = (resolve: any, reject: any) =>
    function executeCallback(err?: any, result?: any) {
      if (session && session.owner === owner && !options.returnsCursor) {
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

  // Execute using callback
  if (typeof callback === 'function') {
    callback = args.pop();
    const handler = makeExecuteCallback(
      (result: any) => callback(undefined, result),
      (err: any) => callback(err, null)
    );
    args.push(handler);

    try {
      return operation.apply(undefined, args);
    } catch (e) {
      handler(e);
      throw e;
    }
  }

  // Return a Promise
  if (args[args.length - 1] != null) {
    throw new TypeError('final argument to `executeLegacyOperation` must be a callback');
  }

  return new Promise(function (resolve: any, reject: any) {
    const handler = makeExecuteCallback(resolve, reject);
    args[args.length - 1] = handler;

    try {
      return operation.apply(undefined, args);
    } catch (e) {
      handler(e);
    }
  });
};

/**
 * Applies retryWrites: true to a command if retryWrites is set on the command's database.
 *
 * @param {any} target The target command to which we will apply retryWrites.
 * @param {any} db The database from which we can inherit a retryWrites value.
 */
function applyRetryableWrites(target: any, db: any) {
  if (db && db.s.options.retryWrites) {
    target.retryWrites = true;
  }

  return target;
}

/**
 * Applies a write concern to a command based on well defined inheritance rules, optionally
 * detecting support for the write concern in the first place.
 *
 * @param {any} target the target command we will be applying the write concern to
 * @param {any} sources sources where we can inherit default write concerns from
 * @param {any} [options] optional settings passed into a command for write concern overrides
 * @returns {any} the (now) decorated target
 */
function applyWriteConcern(target: any, sources: any, options?: any): any {
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
 * @param {any} maybePromise
 * @returns true if the provided value is a Promise
 */
function isPromiseLike(maybePromise: any): maybePromise is Promise<any> {
  return maybePromise && typeof maybePromise.then === 'function';
}

/**
 * Applies collation to a given command.
 *
 * @param {any} [command] the command on which to apply collation
 * @param {(Cursor|Collection)} [target] target of command
 * @param {any} [options] options containing collation settings
 */
function decorateWithCollation(command?: any, target?: any, options?: any) {
  const topology = (target.s && target.s.topology) || target.topology;

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
 *
 * @param {any} command the command on which to apply the read concern
 * @param {Collection} coll the parent collection of the operation calling this method
 * @param {any} [options]
 */
function decorateWithReadConcern(command: any, coll: any, options?: any) {
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

const emitDeprecationWarning = (msg: any) => process.emitWarning(msg, 'DeprecationWarning');

/**
 * Default message handler for generating deprecation warnings.
 *
 * @param {string} name function name
 * @param {string} option option name
 * @returns {string} warning message */
function defaultMsgHandler(name: string, option: string): string {
  return `${name} option [${option}] is deprecated and will be removed in a later version.`;
}

/**
 * Deprecates a given function's options.
 *
 * @param {object} config configuration for deprecation
 * @param {string} config.name function name
 * @param {Array} config.deprecatedOptions options to deprecate
 * @param {number} config.optionsIndex index of options object in function arguments array
 * @param {Function} [config.msgHandler] optional custom message handler to generate warnings
 * @param {Function} fn the target function of deprecation
 * @returns {any} modified function that warns once per deprecated option, and executes original function */
function deprecateOptions(config: any, fn: Function): any {
  if ((process as any).noDeprecation === true) {
    return fn;
  }

  const msgHandler = config.msgHandler ? config.msgHandler : defaultMsgHandler;

  const optionsWarned = new Set();
  function deprecated(this: any) {
    const options = arguments[config.optionsIndex];

    // ensure options is a valid, non-empty object, otherwise short-circuit
    if (!isObject(options) || Object.keys(options).length === 0) {
      return fn.apply(this, arguments);
    }

    const self = this;
    config.deprecatedOptions.forEach(function (deprecatedOption: any) {
      if (
        Object.prototype.hasOwnProperty.call(options, deprecatedOption) &&
        !optionsWarned.has(deprecatedOption)
      ) {
        optionsWarned.add(deprecatedOption);
        const msg = msgHandler(config.name, deprecatedOption);
        emitDeprecationWarning(msg);
        if (self && self.getLogger) {
          const logger = self.getLogger();
          if (logger) {
            logger.warn(msg);
          }
        }
      }
    });

    return fn.apply(this, arguments);
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

class MongoDBNamespace {
  db: string;
  collection?: string;
  /**
   * Create a namespace object
   *
   * @param {string} db The database name
   * @param {string} [collection] An optional collection name
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

function* makeCounter(seed = 0) {
  let count = seed;
  while (true) {
    const newCount = count;
    count += 1;
    yield newCount;
  }
}

/**
 * Helper function for either accepting a callback, or returning a promise
 *
 * @param {?Function} callback The last function argument in exposed method, controls if a Promise is returned
 * @param {Function} wrapper A function that wraps the callback
 * @returns {any|void} Returns nothing if a callback is supplied, else returns a Promise.
 */
function maybePromise<T>(
  callback: Callback<T> | undefined,
  wrapper: (cb: Callback<T>) => void
): Promise<T> | void {
  const Promise = PromiseProvider.get();

  let result: Promise<T> | void;
  if (typeof callback !== 'function') {
    result = new Promise((resolve, reject) => {
      callback = (err, res) => (err ? reject(err) : resolve(res));
    });
  }

  wrapper((err, res) => {
    if (err != null) {
      try {
        callback!(err);
      } catch (error) {
        return process.nextTick(() => {
          throw error;
        });
      }
      return;
    }

    callback!(err, res);
  });

  return result;
}

function databaseNamespace(ns: string) {
  return ns.split('.')[0];
}

function collectionNamespace(ns: string) {
  return ns.split('.').slice(1).join('.');
}

/**
 * Generate a UUIDv4
 */
const uuidV4 = () => {
  const result = crypto.randomBytes(16);
  result[6] = (result[6] & 0x0f) | 0x40;
  result[8] = (result[8] & 0x3f) | 0x80;
  return result;
};

/**
 * Relays events for a given listener and emitter
 *
 * @param {EventEmitter} listener the EventEmitter to listen to the events from
 * @param {EventEmitter} emitter the EventEmitter to relay the events to
 * @param {any} events
 */
function relayEvents(listener: any, emitter: any, events: any) {
  events.forEach((eventName: any) =>
    listener.on(eventName, (event: any) => emitter.emit(eventName, event))
  );
}

/**
 * A helper function for determining `maxWireVersion` between legacy and new topology
 * instances
 *
 * @private
 * @param {(Topology|Server)} topologyOrServer
 */
function maxWireVersion(topologyOrServer?: any) {
  if (topologyOrServer) {
    if (topologyOrServer.ismaster) {
      return topologyOrServer.ismaster.maxWireVersion;
    }

    if (typeof topologyOrServer.lastIsMaster === 'function') {
      const lastIsMaster = topologyOrServer.lastIsMaster();
      if (lastIsMaster) {
        return lastIsMaster.maxWireVersion;
      }
    }

    if (topologyOrServer.description) {
      return topologyOrServer.description.maxWireVersion;
    }
  }

  return 0;
}

/*
 * Checks that collation is supported by server.
 *
 * @param {Server} [server] to check against
 * @param {object} [cmd] object where collation may be specified
 * @param {function} [callback] callback function
 * @return true if server does not support collation
 */
function collationNotSupported(server: any, cmd: any) {
  return cmd && cmd.collation && maxWireVersion(server) < 5;
}

/**
 * Applies the function `eachFn` to each item in `arr`, in parallel.
 *
 * @param {Array} arr an array of items to asynchronously iterate over
 * @param {Function} eachFn A function to call on each item of the array. The callback signature is `(item, callback)`, where the callback indicates iteration is complete.
 * @param {Function} callback The callback called after every item has been iterated
 */
function eachAsync<T, E = any>(
  arr: T[],
  eachFn: (item: T, callback: Callback<CallbackWithType<E>>) => void,
  callback: CallbackWithType<E>
) {
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

  function eachCallback(err: any) {
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

function eachAsyncSeries(arr: any, eachFn: any, callback: Callback) {
  arr = arr || [];

  let idx = 0;
  let awaiting = arr.length;
  if (awaiting === 0) {
    callback();
    return;
  }

  function eachCallback(err: any) {
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

function arrayStrictEqual(arr: any, arr2: any) {
  if (!Array.isArray(arr) || !Array.isArray(arr2)) {
    return false;
  }

  return arr.length === arr2.length && arr.every((elt: any, idx: any) => elt === arr2[idx]);
}

function errorStrictEqual(lhs: any, rhs: any) {
  if (lhs === rhs) {
    return true;
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

function makeStateMachine(stateTable: any) {
  return function stateTransition(target: any, newState: any) {
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

export interface ClientMetadataOptions {
  driverInfo?: {
    name?: string;
    version?: string;
    platform?: string;
  };
  appname?: string;
}

function makeClientMetadata(options: ClientMetadataOptions): ClientMetadata {
  options = options || {};

  const metadata: ClientMetadata = {
    driver: {
      name: 'nodejs',
      version: require('../package.json').version
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

const noop = () => {};

/**
 * Loops over deprecated keys, will emit warning if key matched in options.
 *
 * @param {any} options an object of options
 * @param {string[]} list deprecated option keys
 */
function emitDeprecatedOptionWarning(options: any, list: any) {
  list.forEach((option: any) => {
    if (options && typeof options[option] !== 'undefined') {
      emitDeprecationWarning(`option [${option}] is deprecated`);
    }
  });
}

function now() {
  const hrtime = process.hrtime();
  return Math.floor(hrtime[0] * 1000 + hrtime[1] / 1000000);
}

function calculateDurationInMs(started: number) {
  if (typeof started !== 'number') {
    throw TypeError('numeric value required to calculate duration');
  }

  const elapsed = now() - started;
  return elapsed < 0 ? 0 : elapsed;
}

export interface InterruptableAsyncIntervalOptions {
  /** The interval to execute a method on */
  interval: number;
  /** A minumum interval that must elapse before the method is called */
  minInterval: number;
  /** Whether the method should be called immediately when the interval is started  */
  immediate: boolean;
}

export interface InterruptableAsyncInterval {
  wake(): void;
  stop(): void;
}

/**
 * Creates an interval timer which is able to be woken up sooner than
 * the interval. The timer will also debounce multiple calls to wake
 * ensuring that the function is only ever called once within a minimum
 * interval window.
 *
 * @param {Function} fn An async function to run on an interval, must accept a `callback` as its only parameter
 * @param {object} [options] Optional settings
 * @param {number} [options.interval] The interval at which to run the provided function
 * @param {number} [options.minInterval] The minimum time which must pass between invocations of the provided function
 * @param {boolean} [options.immediate] Execute the function immediately when the interval is started
 */
function makeInterruptableAsyncInterval(
  fn: Function,
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

  function wake() {
    const currentTime = now();
    const timeSinceLastWake = currentTime - lastWakeTime;
    const timeSinceLastCall = currentTime - lastCallTime;
    const timeUntilNextCall = Math.max(interval - timeSinceLastCall, 0);
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

  function reschedule(ms: any) {
    if (stopped) return;
    if (timerId) {
      clearTimeout(timerId);
    }

    timerId = setTimeout(executeAndReschedule, ms || interval);
  }

  function executeAndReschedule() {
    lastWakeTime = 0;
    lastCallTime = now();

    fn((err: any) => {
      if (err) throw err;
      reschedule(interval);
    });
  }

  if (immediate) {
    executeAndReschedule();
  } else {
    lastCallTime = now();
    reschedule(undefined);
  }

  return { wake, stop };
}

function hasAtomicOperators(doc: any): boolean {
  if (Array.isArray(doc)) {
    return doc.reduce((err, u) => err || hasAtomicOperators(u), null);
  }

  const keys = Object.keys(doc);
  return keys.length > 0 && keys[0][0] === '$';
}

export {
  filterOptions,
  mergeOptions,
  getSingleProperty,
  checkCollectionName,
  formatSortValue,
  formattedOrderClause,
  parseIndexOptions,
  normalizeHintField,
  decorateCommand,
  isObject,
  debugOptions,
  MAX_JS_INT,
  mergeOptionsAndWriteConcern,
  executeLegacyOperation,
  applyRetryableWrites,
  applyWriteConcern,
  isPromiseLike,
  decorateWithCollation,
  decorateWithReadConcern,
  deprecateOptions,
  MongoDBNamespace,
  emitDeprecationWarning,
  emitDeprecatedOptionWarning,
  makeCounter,
  maybePromise,
  databaseNamespace,
  collectionNamespace,
  uuidV4,
  relayEvents,
  collationNotSupported,
  maxWireVersion,
  eachAsync,
  eachAsyncSeries,
  arrayStrictEqual,
  errorStrictEqual,
  makeStateMachine,
  makeClientMetadata,
  noop,
  now,
  calculateDurationInMs,
  makeInterruptableAsyncInterval,
  hasAtomicOperators
};
