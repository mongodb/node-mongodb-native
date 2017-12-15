'use strict';

var MongoError = require('mongodb-core').MongoError,
  ReadPreference = require('mongodb-core').ReadPreference;

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
    if (exclude[name] == null) command[name] = options[name];
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
 * @param {function]} [options.resultMutator] Allows for the result of the operation to be changed for custom return types
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
  let resultMutator = options.resultMutator;
  let callback = args[args.length - 1];

  // The driver sessions spec mandates that we implicitly create sessions for operations
  // that are not explicitly provided with a session.
  let session, opOptions;
  if (!options.skipSessions && topology.hasSessionSupport()) {
    opOptions = args[args.length - 2];
    if (opOptions == null || opOptions.session == null) {
      session = topology.startSession();
      Object.assign(args[args.length - 2], { session: session });
    } else if (opOptions.session && opOptions.session.hasEnded) {
      throw new MongoError('Use of expired sessions is not permitted');
    }
  }

  // Execute using callback
  if (typeof callback === 'function') {
    callback = args.pop();
    args.push((err, result) => {
      if (session && !options.returnsCursor) {
        session.endSession(() => {
          delete opOptions.session;
          if (err) return callback(err, null);
          return resultMutator ? callback(null, resultMutator(result)) : callback(null, result);
        });
      } else {
        if (err) return callback(err, null);
        return resultMutator ? callback(null, resultMutator(result)) : callback(null, result);
      }
    });

    return operation.apply(null, args);
  }

  // Return a Promise
  if (args[args.length - 1] != null) {
    throw new TypeError('final argument to `executeOperation` must be a callback');
  }

  return new Promise(function(resolve, reject) {
    args[args.length - 1] = (err, r) => {
      if (session && !options.returnsCursor) {
        session.endSession(() => {
          delete opOptions.session;
          if (err) return reject(err);
          if (resultMutator) return resolve(resultMutator(r));
          resolve(r);
        });
      } else {
        if (err) return reject(err);
        if (resultMutator) return resolve(resultMutator(r));
        resolve(r);
      }
    };

    operation.apply(null, args);
  });
};

exports.filterOptions = filterOptions;
exports.mergeOptions = mergeOptions;
exports.translateOptions = translateOptions;
exports.shallowClone = shallowClone;
exports.getSingleProperty = getSingleProperty;
exports.checkCollectionName = checkCollectionName;
exports.toError = toError;
exports.formattedOrderClause = formattedOrderClause;
exports.parseIndexOptions = parseIndexOptions;
exports.normalizeHintField = normalizeHintField;
exports.handleCallback = handleCallback;
exports.decorateCommand = decorateCommand;
exports.isObject = isObject;
exports.debugOptions = debugOptions;
exports.MAX_JS_INT = 0x20000000000000;
exports.mergeOptionsAndWriteConcern = mergeOptionsAndWriteConcern;
exports.translateReadPreference = translateReadPreference;
exports.executeOperation = executeOperation;
