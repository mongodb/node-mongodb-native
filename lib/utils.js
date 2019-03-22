'use strict';

const MongoError = require('mongodb-core').MongoError;
const ReadPreference = require('mongodb-core').ReadPreference;

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

  // Validate that we are not passing 0x00 in the colletion name
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
const executeOperation = (topology, operation, args, options) => {
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
    throw new TypeError('final argument to `executeOperation` must be a callback');
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

  if (options.w != null || options.j != null || options.fsync != null) {
    const writeConcern = {};
    if (options.w != null) writeConcern.w = options.w;
    if (options.wtimeout != null) writeConcern.wtimeout = options.wtimeout;
    if (options.j != null) writeConcern.j = options.j;
    if (options.fsync != null) writeConcern.fsync = options.fsync;
    return Object.assign(target, { writeConcern });
  }

  if (
    coll &&
    (coll.writeConcern.w != null || coll.writeConcern.j != null || coll.writeConcern.fsync != null)
  ) {
    return Object.assign(target, { writeConcern: Object.assign({}, coll.writeConcern) });
  }

  if (
    db &&
    (db.writeConcern.w != null || db.writeConcern.j != null || db.writeConcern.fsync != null)
  ) {
    return Object.assign(target, { writeConcern: Object.assign({}, db.writeConcern) });
  }

  return target;
}

/**
 * Resolves a read preference based on well-defined inheritance rules. This method will not only
 * determine the read preference (if there is one), but will also ensure the returned value is a
 * properly constructed instance of `ReadPreference`.
 *
 * @param {Object} options The options passed into the method, potentially containing a read preference
 * @param {Object} sources Sources from which we can inherit a read preference
 * @returns {(ReadPreference|null)} The resolved read preference
 */
function resolveReadPreference(options, sources) {
  options = options || {};
  sources = sources || {};

  const db = sources.db;
  const coll = sources.collection;
  const defaultReadPreference = sources.default;
  const session = options.session;

  let readPreference;
  if (options.readPreference) {
    readPreference = options.readPreference;
  } else if (session && session.inTransaction() && session.transaction.options.readPreference) {
    // The transaction’s read preference MUST override all other user configurable read preferences.
    readPreference = session.transaction.options.readPreference;
  } else {
    if (coll && coll.s.readPreference) {
      readPreference = coll.s.readPreference;
    } else if (db && db.s.readPreference) {
      readPreference = db.s.readPreference;
    } else if (defaultReadPreference) {
      readPreference = defaultReadPreference;
    }
  }

  // do we even have a read preference?
  if (readPreference == null) {
    return null;
  }

  // now attempt to convert the read preference if necessary
  if (typeof readPreference === 'string') {
    readPreference = new ReadPreference(readPreference);
  } else if (
    readPreference &&
    !(readPreference instanceof ReadPreference) &&
    typeof readPreference === 'object'
  ) {
    const mode = readPreference.mode || readPreference.preference;
    if (mode && typeof mode === 'string') {
      readPreference = new ReadPreference(mode, readPreference.tags, {
        maxStalenessSeconds: readPreference.maxStalenessSeconds
      });
    }
  } else if (!(readPreference instanceof ReadPreference)) {
    throw new TypeError('Invalid read preference: ' + readPreference);
  }

  return readPreference;
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
  const topology = target.s && target.s.topology;

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
  executeOperation,
  applyRetryableWrites,
  applyWriteConcern,
  resolveReadPreference,
  isPromiseLike,
  decorateWithCollation,
  decorateWithReadConcern,
  deprecateOptions,
  SUPPORTS
};
