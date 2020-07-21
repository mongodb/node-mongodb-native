'use strict';

const applyWriteConcern = require('../utils').applyWriteConcern;
const Code = require('../core').BSON.Code;
const createIndexDb = require('./db_ops').createIndex;
const decorateWithCollation = require('../utils').decorateWithCollation;
const decorateWithReadConcern = require('../utils').decorateWithReadConcern;
const ensureIndexDb = require('./db_ops').ensureIndex;
const evaluate = require('./db_ops').evaluate;
const executeCommand = require('./db_ops').executeCommand;
const handleCallback = require('../utils').handleCallback;
const indexInformationDb = require('./db_ops').indexInformation;
const Long = require('../core').BSON.Long;
const MongoError = require('../core').MongoError;
const ReadPreference = require('../core').ReadPreference;
const insertDocuments = require('./common_functions').insertDocuments;
const updateDocuments = require('./common_functions').updateDocuments;

/**
 * Group function helper
 * @ignore
 */
// var groupFunction = function () {
//   var c = db[ns].find(condition);
//   var map = new Map();
//   var reduce_function = reduce;
//
//   while (c.hasNext()) {
//     var obj = c.next();
//     var key = {};
//
//     for (var i = 0, len = keys.length; i < len; ++i) {
//       var k = keys[i];
//       key[k] = obj[k];
//     }
//
//     var aggObj = map.get(key);
//
//     if (aggObj == null) {
//       var newObj = Object.extend({}, key);
//       aggObj = Object.extend(newObj, initial);
//       map.put(key, aggObj);
//     }
//
//     reduce_function(obj, aggObj);
//   }
//
//   return { "result": map.values() };
// }.toString();
const groupFunction =
  'function () {\nvar c = db[ns].find(condition);\nvar map = new Map();\nvar reduce_function = reduce;\n\nwhile (c.hasNext()) {\nvar obj = c.next();\nvar key = {};\n\nfor (var i = 0, len = keys.length; i < len; ++i) {\nvar k = keys[i];\nkey[k] = obj[k];\n}\n\nvar aggObj = map.get(key);\n\nif (aggObj == null) {\nvar newObj = Object.extend({}, key);\naggObj = Object.extend(newObj, initial);\nmap.put(key, aggObj);\n}\n\nreduce_function(obj, aggObj);\n}\n\nreturn { "result": map.values() };\n}';

/**
 * Create an index on the db and collection.
 *
 * @method
 * @param {Collection} a Collection instance.
 * @param {(string|object)} fieldOrSpec Defines the index.
 * @param {object} [options] Optional settings. See Collection.prototype.createIndex for a list of options.
 * @param {Collection~resultCallback} [callback] The command result callback
 */
function createIndex(coll, fieldOrSpec, options, callback) {
  createIndexDb(coll.s.db, coll.collectionName, fieldOrSpec, options, callback);
}

/**
 * Create multiple indexes in the collection. This method is only supported for
 * MongoDB 2.6 or higher. Earlier version of MongoDB will throw a command not supported
 * error. Index specifications are defined at http://docs.mongodb.org/manual/reference/command/createIndexes/.
 *
 * @method
 * @param {Collection} a Collection instance.
 * @param {array} indexSpecs An array of index specifications to be created
 * @param {Object} [options] Optional settings. See Collection.prototype.createIndexes for a list of options.
 * @param {Collection~resultCallback} [callback] The command result callback
 */
function createIndexes(coll, indexSpecs, options, callback) {
  const capabilities = coll.s.topology.capabilities();

  // Ensure we generate the correct name if the parameter is not set
  for (let i = 0; i < indexSpecs.length; i++) {
    if (indexSpecs[i].name == null) {
      const keys = [];

      // Did the user pass in a collation, check if our write server supports it
      if (indexSpecs[i].collation && capabilities && !capabilities.commandsTakeCollation) {
        return callback(new MongoError('server/primary/mongos does not support collation'));
      }

      for (let name in indexSpecs[i].key) {
        keys.push(`${name}_${indexSpecs[i].key[name]}`);
      }

      // Set the name
      indexSpecs[i].name = keys.join('_');
    }
  }

  options = Object.assign({}, options, { readPreference: ReadPreference.PRIMARY });

  // Execute the index
  executeCommand(
    coll.s.db,
    {
      createIndexes: coll.collectionName,
      indexes: indexSpecs
    },
    options,
    callback
  );
}

/**
 * Ensure that an index exists. If the index does not exist, this function creates it.
 *
 * @method
 * @param {Collection} a Collection instance.
 * @param {(string|object)} fieldOrSpec Defines the index.
 * @param {object} [options] Optional settings. See Collection.prototype.ensureIndex for a list of options.
 * @param {Collection~resultCallback} [callback] The command result callback
 */
function ensureIndex(coll, fieldOrSpec, options, callback) {
  ensureIndexDb(coll.s.db, coll.collectionName, fieldOrSpec, options, callback);
}

/**
 * Run a group command across a collection.
 *
 * @method
 * @param {Collection} a Collection instance.
 * @param {(object|array|function|code)} keys An object, array or function expressing the keys to group by.
 * @param {object} condition An optional condition that must be true for a row to be considered.
 * @param {object} initial Initial value of the aggregation counter object.
 * @param {(function|Code)} reduce The reduce function aggregates (reduces) the objects iterated
 * @param {(function|Code)} finalize An optional function to be run on each item in the result set just before the item is returned.
 * @param {boolean} command Specify if you wish to run using the internal group command or using eval, default is true.
 * @param {object} [options] Optional settings. See Collection.prototype.group for a list of options.
 * @param {Collection~resultCallback} [callback] The command result callback
 * @deprecated MongoDB 3.6 or higher will no longer support the group command. We recommend rewriting using the aggregation framework.
 */
function group(coll, keys, condition, initial, reduce, finalize, command, options, callback) {
  // Execute using the command
  if (command) {
    const reduceFunction = reduce && reduce._bsontype === 'Code' ? reduce : new Code(reduce);

    const selector = {
      group: {
        ns: coll.collectionName,
        $reduce: reduceFunction,
        cond: condition,
        initial: initial,
        out: 'inline'
      }
    };

    // if finalize is defined
    if (finalize != null) selector.group['finalize'] = finalize;
    // Set up group selector
    if ('function' === typeof keys || (keys && keys._bsontype === 'Code')) {
      selector.group.$keyf = keys && keys._bsontype === 'Code' ? keys : new Code(keys);
    } else {
      const hash = {};
      keys.forEach(key => {
        hash[key] = 1;
      });
      selector.group.key = hash;
    }

    options = Object.assign({}, options);
    // Ensure we have the right read preference inheritance
    options.readPreference = ReadPreference.resolve(coll, options);

    // Do we have a readConcern specified
    decorateWithReadConcern(selector, coll, options);

    // Have we specified collation
    try {
      decorateWithCollation(selector, coll, options);
    } catch (err) {
      return callback(err, null);
    }

    // Execute command
    executeCommand(coll.s.db, selector, options, (err, result) => {
      if (err) return handleCallback(callback, err, null);
      handleCallback(callback, null, result.retval);
    });
  } else {
    // Create execution scope
    const scope = reduce != null && reduce._bsontype === 'Code' ? reduce.scope : {};

    scope.ns = coll.collectionName;
    scope.keys = keys;
    scope.condition = condition;
    scope.initial = initial;

    // Pass in the function text to execute within mongodb.
    const groupfn = groupFunction.replace(/ reduce;/, reduce.toString() + ';');

    evaluate(coll.s.db, new Code(groupfn, scope), null, options, (err, results) => {
      if (err) return handleCallback(callback, err, null);
      handleCallback(callback, null, results.result || results);
    });
  }
}

/**
 * Retrieve all the indexes on the collection.
 *
 * @method
 * @param {Collection} a Collection instance.
 * @param {Object} [options] Optional settings. See Collection.prototype.indexes for a list of options.
 * @param {Collection~resultCallback} [callback] The command result callback
 */
function indexes(coll, options, callback) {
  options = Object.assign({}, { full: true }, options);
  indexInformationDb(coll.s.db, coll.collectionName, options, callback);
}

/**
 * Check if one or more indexes exist on the collection. This fails on the first index that doesn't exist.
 *
 * @method
 * @param {Collection} a Collection instance.
 * @param {(string|array)} indexes One or more index names to check.
 * @param {Object} [options] Optional settings. See Collection.prototype.indexExists for a list of options.
 * @param {Collection~resultCallback} [callback] The command result callback
 */
function indexExists(coll, indexes, options, callback) {
  indexInformation(coll, options, (err, indexInformation) => {
    // If we have an error return
    if (err != null) return handleCallback(callback, err, null);
    // Let's check for the index names
    if (!Array.isArray(indexes))
      return handleCallback(callback, null, indexInformation[indexes] != null);
    // Check in list of indexes
    for (let i = 0; i < indexes.length; i++) {
      if (indexInformation[indexes[i]] == null) {
        return handleCallback(callback, null, false);
      }
    }

    // All keys found return true
    return handleCallback(callback, null, true);
  });
}

/**
 * Retrieve this collection's index info.
 *
 * @method
 * @param {Collection} a Collection instance.
 * @param {object} [options] Optional settings. See Collection.prototype.indexInformation for a list of options.
 * @param {Collection~resultCallback} [callback] The command result callback
 */
function indexInformation(coll, options, callback) {
  indexInformationDb(coll.s.db, coll.collectionName, options, callback);
}

/**
 * Return N parallel cursors for a collection to allow parallel reading of the entire collection. There are
 * no ordering guarantees for returned results.
 *
 * @method
 * @param {Collection} a Collection instance.
 * @param {object} [options] Optional settings. See Collection.prototype.parallelCollectionScan for a list of options.
 * @param {Collection~parallelCollectionScanCallback} [callback] The command result callback
 */
function parallelCollectionScan(coll, options, callback) {
  // Create command object
  const commandObject = {
    parallelCollectionScan: coll.collectionName,
    numCursors: options.numCursors
  };

  // Do we have a readConcern specified
  decorateWithReadConcern(commandObject, coll, options);

  // Store the raw value
  const raw = options.raw;
  delete options['raw'];

  // Execute the command
  executeCommand(coll.s.db, commandObject, options, (err, result) => {
    if (err) return handleCallback(callback, err, null);
    if (result == null)
      return handleCallback(
        callback,
        new Error('no result returned for parallelCollectionScan'),
        null
      );

    options = Object.assign({ explicitlyIgnoreSession: true }, options);

    const cursors = [];
    // Add the raw back to the option
    if (raw) options.raw = raw;
    // Create command cursors for each item
    for (let i = 0; i < result.cursors.length; i++) {
      const rawId = result.cursors[i].cursor.id;
      // Convert cursorId to Long if needed
      const cursorId = typeof rawId === 'number' ? Long.fromNumber(rawId) : rawId;
      // Add a command cursor
      cursors.push(coll.s.topology.cursor(coll.namespace, cursorId, options));
    }

    handleCallback(callback, null, cursors);
  });
}

/**
 * Save a document.
 *
 * @method
 * @param {Collection} a Collection instance.
 * @param {object} doc Document to save
 * @param {object} [options] Optional settings. See Collection.prototype.save for a list of options.
 * @param {Collection~writeOpCallback} [callback] The command result callback
 * @deprecated use insertOne, insertMany, updateOne or updateMany
 */
function save(coll, doc, options, callback) {
  // Get the write concern options
  const finalOptions = applyWriteConcern(
    Object.assign({}, options),
    { db: coll.s.db, collection: coll },
    options
  );
  // Establish if we need to perform an insert or update
  if (doc._id != null) {
    finalOptions.upsert = true;
    return updateDocuments(coll, { _id: doc._id }, doc, finalOptions, callback);
  }

  // Insert the document
  insertDocuments(coll, [doc], finalOptions, (err, result) => {
    if (callback == null) return;
    if (doc == null) return handleCallback(callback, null, null);
    if (err) return handleCallback(callback, err, null);
    handleCallback(callback, null, result);
  });
}

module.exports = {
  createIndex,
  createIndexes,
  ensureIndex,
  group,
  indexes,
  indexExists,
  indexInformation,
  parallelCollectionScan,
  save
};
