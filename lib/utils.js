'use strict';
const MongoError = require('./core/error').MongoError;
const ReadPreference = require('./core/topologies/read_preference');
const WriteConcern = require('./write_concern');

var shallowClone = function(obj) {
  var copy = {};
  for (var name in obj) copy[name] = obj[name];
  return copy;
};

// Figure out the read preference
var translateReadPreference = function(options) {
  var r = null;
  if (options.readPreference) {
    r = options.readPreference;
  } else {
    return options;
  }

  if (typeof r === 'string') {
    options.readPreference = new ReadPreference(r);
  } else if (r && !(r instanceof ReadPreference) && typeof r === 'object') {
    const mode = r.mode || r.preference;
    if (mode && typeof mode === 'string') {
      options.readPreference = new ReadPreference(mode, r.tags, {
        maxStalenessSeconds: r.maxStalenessSeconds
      });
    }
  } else if (!(r instanceof ReadPreference)) {
    throw new TypeError('Invalid read preference: ' + r);
  }

  return options;
};

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
 * @ignore
 * @api private
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
 * @ignore
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
 * @ignore
 * @api private
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
 * @param {function} operation The operation to execute
 * @param {array} args Arguments to apply the provided operation
 * @param {object} [options] Options that modify the behavior of the method
 */
const executeLegacyOperation = (topology, operation, args, options) => {
  if (topology == null) {
    throw new TypeError('This method requires a valid topology instance');
  }

  if (!Array.isArray(args)) {
    throw new TypeError('This method requires an array of arguments to apply');
  }

  options = options || {};
  const Promise = topology.s.promiseLibrary;
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
 * @param {Object} target the target command we will be applying the write concern to
 * @param {Object} sources sources where we can inherit default write concerns from
 * @param {Object} [options] optional settings passed into a command for write concern overrides
 * @returns {Object} the (now) decorated target
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
 * Resolves a read preference based on well-defined inheritance rules. This method will not only
 * determine the read preference (if there is one), but will also ensure the returned value is a
 * properly constructed instance of `ReadPreference`.
 *
 * @param {Collection|Db|MongoClient} parent The parent of the operation on which to determine the read
 * preference, used for determining the inherited read preference.
 * @param {Object} options The options passed into the method, potentially containing a read preference
 * @returns {(ReadPreference|null)} The resolved read preference
 */
function resolveReadPreference(parent, options) {
  options = options || {};
  const session = options.session;

  const inheritedReadPreference = parent.readPreference;

  let readPreference;
  if (options.readPreference) {
    readPreference = ReadPreference.fromOptions(options);
  } else if (session && session.inTransaction() && session.transaction.options.readPreference) {
    // The transaction’s read preference MUST override all other user configurable read preferences.
    readPreference = session.transaction.options.readPreference;
  } else if (inheritedReadPreference != null) {
    readPreference = inheritedReadPreference;
  } else {
    throw new Error('No readPreference was provided or inherited.');
  }

  return typeof readPreference === 'string' ? new ReadPreference(readPreference) : readPreference;
}

/**
 * Checks if a given value is a Promise
 *
 * @param {*} maybePromise
 * @return true if the provided value is a Promise
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
 * @return {string} warning message
 * @ignore
 * @api private
 */
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
 * @param {function} [config.msgHandler] optional custom message handler to generate warnings
 * @param {function} fn the target function of deprecation
 * @return {function} modified function that warns once per deprecated option, and executes original function
 * @ignore
 * @api private
 */
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
      if (options.hasOwnProperty(deprecatedOption) && !optionsWarned.has(deprecatedOption)) {
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

const SUPPORTS = {};
// Test asyncIterator support
try {
  require('./async/async_iterator');
  SUPPORTS.ASYNC_ITERATOR = true;
} catch (e) {
  SUPPORTS.ASYNC_ITERATOR = false;
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
 * @param {Object} parent an instance of parent with promiseLibrary.
 * @param {object} parent.s an object containing promiseLibrary.
 * @param {function} parent.s.promiseLibrary an object containing promiseLibrary.
 * @param {[Function]} callback an optional callback.
 * @param {Function} fn A function that takes a callback
 * @returns {Promise|void} Returns nothing if a callback is supplied, else returns a Promise.
 */
function maybePromise(parent, callback, fn) {
  const PromiseLibrary = (parent && parent.s && parent.s.promiseLibrary) || Promise;

  let result;
  if (typeof callback !== 'function') {
    result = new PromiseLibrary((resolve, reject) => {
      callback = (err, res) => {
        if (err) return reject(err);
        resolve(res);
      };
    });
  }

  fn(function(err, res) {
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

function now() {
  const hrtime = process.hrtime();
  return Math.floor(hrtime[0] * 1000 + hrtime[1] / 1000000);
}

function calculateDurationInMs(started) {
  if (typeof started !== 'number') {
    throw TypeError('numeric value required to calculate duration');
  }

  const elapsed = now() - started;
  return elapsed < 0 ? 0 : elapsed;
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
  shallowClone,
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
  translateReadPreference,
  executeLegacyOperation,
  applyRetryableWrites,
  applyWriteConcern,
  isPromiseLike,
  decorateWithCollation,
  decorateWithReadConcern,
  deprecateOptions,
  SUPPORTS,
  MongoDBNamespace,
  resolveReadPreference,
  emitDeprecationWarning,
  makeCounter,
  maybePromise,
  now,
  calculateDurationInMs,
  makeInterruptableAsyncInterval
};
