'use strict';

const PromiseProvider = require('./promise_provider');
const os = require('os');
const crypto = require('crypto');
const { MongoError } = require('./error');
const WriteConcern = require('./write_concern');

// Set simple property
var getSingleProperty = function(obj, name, value) {
  Object.defineProperty(obj, name, {
    enumerable: true,
    get: function() {
      return value;
    }
  });
};

var formatSortValue = (exports.formatSortValue = function(sortDirection) {
  var value = ('' + sortDirection).toLowerCase();

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
});

var formattedOrderClause = (exports.formattedOrderClause = function(sortValue) {
  var orderBy = {};
  if (sortValue == null) return null;
  if (Array.isArray(sortValue)) {
    if (sortValue.length === 0) {
      return null;
    }

    for (var i = 0; i < sortValue.length; i++) {
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
});

var checkCollectionName = function checkCollectionName(collectionName) {
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
};

var handleCallback = function(callback, err, value1, value2) {
  try {
    if (callback == null) return;

    if (callback) {
      return value2 ? callback(err, value1, value2) : callback(err, value1);
    }
  } catch (err) {
    process.nextTick(function() {
      throw err;
    });
    return false;
  }

  return true;
};

/**
 * Wrap a Mongo error document in an Error instance
 *
 * @param {any} error
 */
var toError = function(error) {
  if (error instanceof Error) return error;

  var msg = error.err || error.errmsg || error.errMessage || error;
  var e = MongoError.create({ message: msg, driver: true });

  // Get all object keys
  var keys = typeof error === 'object' ? Object.keys(error) : [];

  for (var i = 0; i < keys.length; i++) {
    try {
      e[keys[i]] = error[keys[i]];
    } catch (err) {
      // continue
    }
  }

  return e;
};

/**
 * @param {any} hint
 */
var normalizeHintField = function normalizeHintField(hint) {
  var finalHint = null;

  if (typeof hint === 'string') {
    finalHint = hint;
  } else if (Array.isArray(hint)) {
    finalHint = {};

    hint.forEach(function(param) {
      finalHint[param] = 1;
    });
  } else if (hint != null && typeof hint === 'object') {
    finalHint = {};
    for (var name in hint) {
      finalHint[name] = hint[name];
    }
  }

  return finalHint;
};

/**
 * Create index name based on field spec
 *
 * @param {any} fieldOrSpec
 */
var parseIndexOptions = function(fieldOrSpec) {
  var fieldHash = {};
  var indexes = [];
  var keys;

  // Get all the fields accordingly
  if ('string' === typeof fieldOrSpec) {
    // 'type'
    indexes.push(fieldOrSpec + '_' + 1);
    fieldHash[fieldOrSpec] = 1;
  } else if (Array.isArray(fieldOrSpec)) {
    fieldOrSpec.forEach(function(f) {
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
        keys.forEach(function(k) {
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
    keys.forEach(function(key) {
      indexes.push(key + '_' + fieldOrSpec[key]);
      fieldHash[key] = fieldOrSpec[key];
    });
  }

  return {
    name: indexes.join('_'),
    keys: keys,
    fieldHash: fieldHash
  };
};

var isObject = (exports.isObject = function(arg) {
  return '[object Object]' === Object.prototype.toString.call(arg);
});

var debugOptions = function(debugFields, options) {
  var finaloptions = {};
  debugFields.forEach(function(n) {
    finaloptions[n] = options[n];
  });

  return finaloptions;
};

var decorateCommand = function(command, options, exclude) {
  for (var name in options) {
    if (exclude.indexOf(name) === -1) command[name] = options[name];
  }

  return command;
};

var mergeOptions = function(target, source) {
  for (var name in source) {
    target[name] = source[name];
  }

  return target;
};

// Merge options with translation
var translateOptions = function(target, source) {
  var translations = {
    // SSL translation options
    sslCA: 'ca',
    sslCRL: 'crl',
    sslValidate: 'rejectUnauthorized',
    sslKey: 'key',
    sslCert: 'cert',
    sslPass: 'passphrase',
    // SocketTimeout translation options
    socketTimeoutMS: 'socketTimeout',
    connectTimeoutMS: 'connectionTimeout',
    // Replicaset options
    replicaSet: 'setName',
    rs_name: 'setName',
    secondaryAcceptableLatencyMS: 'acceptableLatency',
    connectWithNoPrimary: 'secondaryOnlyConnectionAllowed',
    // Mongos options
    acceptableLatencyMS: 'localThresholdMS'
  };

  for (var name in source) {
    if (translations[name]) {
      target[translations[name]] = source[name];
    } else {
      target[name] = source[name];
    }
  }

  return target;
};

var filterOptions = function(options, names) {
  var filterOptions = {};

  for (var name in options) {
    if (names.indexOf(name) !== -1) filterOptions[name] = options[name];
  }

  // Filtered options
  return filterOptions;
};

// Write concern keys
var writeConcernKeys = ['w', 'j', 'wtimeout', 'fsync'];

// Merge the write concern options
var mergeOptionsAndWriteConcern = function(targetOptions, sourceOptions, keys, mergeWriteConcern) {
  // Mix in any allowed options
  for (var i = 0; i < keys.length; i++) {
    if (!targetOptions[keys[i]] && sourceOptions[keys[i]] !== undefined) {
      targetOptions[keys[i]] = sourceOptions[keys[i]];
    }
  }

  // No merging of write concern
  if (!mergeWriteConcern) return targetOptions;

  // Found no write Concern options
  var found = false;
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
};

/**
 * Executes the given operation with provided arguments.
 *
 * This method reduces large amounts of duplication in the entire codebase by providing
 * a single point for determining whether callbacks or promises should be used. Additionally
 * it allows for a single point of entry to provide features such as implicit sessions, which
 * are required by the Driver Sessions specification in the event that a ClientSession is
 * not provided
 *
 * @param {object} topology The topology to execute this operation on
 * @param {Function} operation The operation to execute
 * @param {Array} args Arguments to apply the provided operation
 * @param {object} [options] Options that modify the behavior of the method
 */
const executeLegacyOperation = (topology, operation, args, options) => {
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
  let session, opOptions, owner;
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

  const makeExecuteCallback = (resolve, reject) =>
    function executeCallback(err, result) {
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
      result => callback(null, result),
      err => callback(err, null)
    );
    args.push(handler);

    try {
      return operation.apply(null, args);
    } catch (e) {
      handler(e);
      throw e;
    }
  }

  // Return a Promise
  if (args[args.length - 1] != null) {
    throw new TypeError('final argument to `executeLegacyOperation` must be a callback');
  }

  return new Promise(function(resolve, reject) {
    const handler = makeExecuteCallback(resolve, reject);
    args[args.length - 1] = handler;

    try {
      return operation.apply(null, args);
    } catch (e) {
      handler(e);
    }
  });
};

/**
 * Applies retryWrites: true to a command if retryWrites is set on the command's database.
 *
 * @param {object} target The target command to which we will apply retryWrites.
 * @param {object} db The database from which we can inherit a retryWrites value.
 */
function applyRetryableWrites(target, db) {
  if (db && db.s.options.retryWrites) {
    target.retryWrites = true;
  }

  return target;
}

/**
 * Applies a write concern to a command based on well defined inheritance rules, optionally
 * detecting support for the write concern in the first place.
 *
 * @param {object} target the target command we will be applying the write concern to
 * @param {object} sources sources where we can inherit default write concerns from
 * @param {object} [options] optional settings passed into a command for write concern overrides
 * @returns {object} the (now) decorated target
 */
function applyWriteConcern(target, sources, options) {
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
function isPromiseLike(maybePromise) {
  return maybePromise && typeof maybePromise.then === 'function';
}

/**
 * Applies collation to a given command.
 *
 * @param {object} [command] the command on which to apply collation
 * @param {(Cursor|Collection)} [target] target of command
 * @param {object} [options] options containing collation settings
 */
function decorateWithCollation(command, target, options) {
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
 * @param {object} command the command on which to apply the read concern
 * @param {Collection} coll the parent collection of the operation calling this method
 * @param {any} options
 */
function decorateWithReadConcern(command, coll, options) {
  if (options && options.session && options.session.inTransaction()) {
    return;
  }
  let readConcern = Object.assign({}, command.readConcern || {});
  if (coll.s.readConcern) {
    Object.assign(readConcern, coll.s.readConcern);
  }

  if (Object.keys(readConcern).length > 0) {
    Object.assign(command, { readConcern: readConcern });
  }
}

const emitProcessWarning = msg => process.emitWarning(msg, 'DeprecationWarning');
const emitConsoleWarning = msg => console.error(msg);
const emitDeprecationWarning = process.emitWarning ? emitProcessWarning : emitConsoleWarning;

/**
 * Default message handler for generating deprecation warnings.
 *
 * @param {string} name function name
 * @param {string} option option name
 * @returns {string} warning message */
function defaultMsgHandler(name, option) {
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
 * @returns {Function} modified function that warns once per deprecated option, and executes original function */
function deprecateOptions(config, fn) {
  if (process.noDeprecation === true) {
    return fn;
  }

  const msgHandler = config.msgHandler ? config.msgHandler : defaultMsgHandler;

  const optionsWarned = new Set();
  function deprecated() {
    const options = arguments[config.optionsIndex];

    // ensure options is a valid, non-empty object, otherwise short-circuit
    if (!isObject(options) || Object.keys(options).length === 0) {
      return fn.apply(this, arguments);
    }

    config.deprecatedOptions.forEach(deprecatedOption => {
      if (
        Object.prototype.hasOwnProperty.call(options, deprecatedOption) &&
        !optionsWarned.has(deprecatedOption)
      ) {
        optionsWarned.add(deprecatedOption);
        const msg = msgHandler(config.name, deprecatedOption);
        emitDeprecationWarning(msg);
        if (this && this.getLogger) {
          const logger = this.getLogger();
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
  constructor(db, collection) {
    this.db = db;
    this.collection = collection;
  }

  toString() {
    return this.collection ? `${this.db}.${this.collection}` : this.db;
  }

  withCollection(collection) {
    return new MongoDBNamespace(this.db, collection);
  }

  static fromString(namespace) {
    if (!namespace) {
      throw new Error(`Cannot parse namespace from "${namespace}"`);
    }

    const index = namespace.indexOf('.');
    return new MongoDBNamespace(namespace.substring(0, index), namespace.substring(index + 1));
  }
}

function* makeCounter(seed) {
  let count = seed || 0;
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
 * @returns {Promise|void} Returns nothing if a callback is supplied, else returns a Promise.
 */
function maybePromise(callback, wrapper) {
  const Promise = PromiseProvider.get();

  let result;
  if (typeof callback !== 'function') {
    result = new Promise((resolve, reject) => {
      callback = (err, res) => {
        if (err) return reject(err);
        resolve(res);
      };
    });
  }

  wrapper(function(err, res) {
    if (err != null) {
      try {
        callback(err);
      } catch (error) {
        return process.nextTick(() => {
          throw error;
        });
      }
      return;
    }

    callback(err, res);
  });

  return result;
}

function databaseNamespace(ns) {
  return ns.split('.')[0];
}

function collectionNamespace(ns) {
  return ns
    .split('.')
    .slice(1)
    .join('.');
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
 * Returns the duration calculated from two high resolution timers in milliseconds
 *
 * @param {object} started A high resolution timestamp created from `process.hrtime()`
 * @returns {number} The duration in milliseconds
 */
const calculateDurationInMs = started => {
  const hrtime = process.hrtime(started);
  return (hrtime[0] * 1e9 + hrtime[1]) / 1e6;
};

/**
 * Relays events for a given listener and emitter
 *
 * @param {EventEmitter} listener the EventEmitter to listen to the events from
 * @param {EventEmitter} emitter the EventEmitter to relay the events to
 * @param {any} events
 */
function relayEvents(listener, emitter, events) {
  events.forEach(eventName => listener.on(eventName, event => emitter.emit(eventName, event)));
}

/**
 * A helper function for determining `maxWireVersion` between legacy and new topology
 * instances
 *
 * @private
 * @param {(Topology|Server)} topologyOrServer
 */
function maxWireVersion(topologyOrServer) {
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
function collationNotSupported(server, cmd) {
  return cmd && cmd.collation && maxWireVersion(server) < 5;
}

/**
 * Applies the function `eachFn` to each item in `arr`, in parallel.
 *
 * @param {Array} arr an array of items to asynchronusly iterate over
 * @param {Function} eachFn A function to call on each item of the array. The callback signature is `(item, callback)`, where the callback indicates iteration is complete.
 * @param {Function} callback The callback called after every item has been iterated
 */
function eachAsync(arr, eachFn, callback) {
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

  function eachCallback(err) {
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

function eachAsyncSeries(arr, eachFn, callback) {
  arr = arr || [];

  let idx = 0;
  let awaiting = arr.length;
  if (awaiting === 0) {
    callback();
    return;
  }

  function eachCallback(err) {
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

function arrayStrictEqual(arr, arr2) {
  if (!Array.isArray(arr) || !Array.isArray(arr2)) {
    return false;
  }

  return arr.length === arr2.length && arr.every((elt, idx) => elt === arr2[idx]);
}

function tagsStrictEqual(tags, tags2) {
  const tagsKeys = Object.keys(tags);
  const tags2Keys = Object.keys(tags2);
  return tagsKeys.length === tags2Keys.length && tagsKeys.every(key => tags2[key] === tags[key]);
}

function errorStrictEqual(lhs, rhs) {
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

function makeStateMachine(stateTable) {
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

function makeClientMetadata(options) {
  options = options || {};

  const metadata = {
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
 * @param {object} options an object of options
 * @param {string[]} list deprecated option keys
 */
function emitDeprecatedOptionWarning(options, list) {
  list.forEach(option => {
    if (options && typeof options[option] !== 'undefined') {
      emitDeprecationWarning(`option [${option}] is deprecated`);
    }
  });
}

function now() {
  const hrtime = process.hrtime();
  return Math.floor(hrtime[0] * 1000 + hrtime[1] / 1000000);
}

/**
 * Creates an interval timer which is able to be woken up sooner than
 * the interval. The timer will also debounce multiple calls to wake
 * ensuring that the function is only ever called once within a minimum
 * interval window.
 *
 * @param {function} fn An async function to run on an interval, must accept a `callback` as its only parameter
 * @param {object} [options] Optional settings
 * @param {number} [options.interval] The interval at which to run the provided function
 * @param {number} [options.minInterval] The minimum time which must pass between invocations of the provided function
 * @param {boolean} [options.immediate] Execute the function immediately when the interval is started
 */
function makeInterruptableAsyncInterval(fn, options) {
  let timerId;
  let lastCallTime;
  let lastWakeTime;
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
      timerId = null;
    }

    lastCallTime = 0;
    lastWakeTime = 0;
  }

  function reschedule(ms) {
    if (stopped) return;
    clearTimeout(timerId);
    timerId = setTimeout(executeAndReschedule, ms || interval);
  }

  function executeAndReschedule() {
    lastWakeTime = 0;
    lastCallTime = now();
    fn(err => {
      if (err) throw err;
      reschedule(interval);
    });
  }

  if (immediate) {
    executeAndReschedule();
  } else {
    lastCallTime = now();
    reschedule();
  }

  return { wake, stop };
}

module.exports = {
  filterOptions,
  mergeOptions,
  translateOptions,
  getSingleProperty,
  checkCollectionName,
  toError,
  formattedOrderClause,
  parseIndexOptions,
  normalizeHintField,
  handleCallback,
  decorateCommand,
  isObject,
  debugOptions,
  MAX_JS_INT: Number.MAX_SAFE_INTEGER + 1,
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
  calculateDurationInMs,
  relayEvents,
  collationNotSupported,
  maxWireVersion,
  eachAsync,
  eachAsyncSeries,
  arrayStrictEqual,
  tagsStrictEqual,
  errorStrictEqual,
  makeStateMachine,
  makeClientMetadata,
  noop,
  now,
  makeInterruptableAsyncInterval
};
