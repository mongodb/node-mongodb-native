'use strict';
import ReadPreference = require('../read_preference');
import { BSON } from '../deps';
const { Code, Long } = BSON;
import { MongoError } from '../error';
import { insertDocuments, updateDocuments } from './common_functions';
import {
  applyWriteConcern,
  decorateWithCollation,
  decorateWithReadConcern,
  handleCallback,
  toError
} from '../utils';
import {
  createIndex as createIndexDb,
  ensureIndex as ensureIndexDb,
  evaluate,
  executeCommand,
  indexInformation as indexInformationDb
} from './db_ops';

/**
 * Group function helper
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

// Check the update operation to ensure it has atomic operators.
function checkForAtomicOperators(update: any): any {
  if (Array.isArray(update)) {
    return update.reduce((err?: any, u?: any) => err || checkForAtomicOperators(u), null);
  }

  const keys = Object.keys(update);

  // same errors as the server would give for update doc lacking atomic operators
  if (keys.length === 0) {
    return toError('The update operation document must contain at least one atomic operator.');
  }

  if (keys[0][0] !== '$') {
    return toError('the update operation document must contain atomic operators.');
  }
}

/**
 * Create an index on the db and collection.
 *
 * @function
 * @param {Collection} coll Collection instance.
 * @param {(string|object)} fieldOrSpec Defines the index.
 * @param {object} [options] Optional settings. See Collection.prototype.createIndex for a list of options.
 * @param {Collection~resultCallback} [callback] The command result callback
 */
function createIndex(coll: any, fieldOrSpec: any, options?: object, callback?: Function) {
  createIndexDb(coll.s.db, coll.collectionName, fieldOrSpec, options, callback);
}

/**
 * Create multiple indexes in the collection. This method is only supported for
 * MongoDB 2.6 or higher. Earlier version of MongoDB will throw a command not supported
 * error. Index specifications are defined at http://docs.mongodb.org/manual/reference/command/createIndexes/.
 *
 * @function
 * @param {Collection} coll Collection instance.
 * @param {Array} indexSpecs An array of index specifications to be created
 * @param {object} [options] Optional settings. See Collection.prototype.createIndexes for a list of options.
 * @param {Collection~resultCallback} [callback] The command result callback
 */
function createIndexes(coll: any, indexSpecs: any[], options?: object, callback?: Function) {
  const capabilities = coll.s.topology.capabilities();

  // Ensure we generate the correct name if the parameter is not set
  for (let i = 0; i < indexSpecs.length; i++) {
    if (indexSpecs[i].name == null) {
      const keys = [];

      // Did the user pass in a collation, check if our write server supports it
      if (indexSpecs[i].collation && capabilities && !capabilities.commandsTakeCollation) {
        return callback!(new MongoError('server/primary/mongos does not support collation'));
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
 * @function
 * @param {Collection} coll Collection instance.
 * @param {(string|object)} fieldOrSpec Defines the index.
 * @param {object} [options] Optional settings. See Collection.prototype.ensureIndex for a list of options.
 * @param {Collection~resultCallback} [callback] The command result callback
 */
function ensureIndex(coll: any, fieldOrSpec: any, options?: object, callback?: Function) {
  ensureIndexDb(coll.s.db, coll.collectionName, fieldOrSpec, options, callback);
}

/**
 * Run a group command across a collection.
 *
 * @function
 * @param {Collection} coll Collection instance.
 * @param {(object|Array|Function|code)} keys An object, array or function expressing the keys to group by.
 * @param {object} condition An optional condition that must be true for a row to be considered.
 * @param {object} initial Initial value of the aggregation counter object.
 * @param {(Function|Code)} reduce The reduce function aggregates (reduces) the objects iterated
 * @param {(Function|Code)} finalize An optional function to be run on each item in the result set just before the item is returned.
 * @param {boolean} command Specify if you wish to run using the internal group command or using eval, default is true.
 * @param {any} [options] Optional settings. See Collection.prototype.group for a list of options.
 * @param {Collection~resultCallback} [callback] The command result callback
 * @deprecated MongoDB 3.6 or higher will no longer support the group command. We recommend rewriting using the aggregation framework.
 */
function group(
  coll: any,
  keys: any,
  condition: object,
  initial: object,
  reduce: any,
  finalize: any,
  command: boolean,
  options?: any,
  callback?: Function
) {
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
    } as any;

    // if finalize is defined
    if (finalize != null) selector.group['finalize'] = finalize;
    // Set up group selector
    if ('function' === typeof keys || (keys && keys._bsontype === 'Code')) {
      selector.group.$keyf = keys && keys._bsontype === 'Code' ? keys : new Code(keys);
    } else {
      const hash: any = {};
      keys.forEach((key: any) => {
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
      return callback!(err, null);
    }

    // Execute command
    executeCommand(coll.s.db, selector, options, (err?: any, result?: any) => {
      if (err) return handleCallback(callback!, err, null);
      handleCallback(callback!, null, result.retval);
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

    evaluate(coll.s.db, new Code(groupfn, scope), null, options, (err?: any, results?: any) => {
      if (err) return handleCallback(callback!, err, null);
      handleCallback(callback!, null, results.result || results);
    });
  }
}

/**
 * Retrieve all the indexes on the collection.
 *
 * @function
 * @param {Collection} coll Collection instance.
 * @param {object} [options] Optional settings. See Collection.prototype.indexes for a list of options.
 * @param {Collection~resultCallback} [callback] The command result callback
 */
function indexes(coll: any, options?: object, callback?: Function) {
  options = Object.assign({}, { full: true }, options);
  indexInformationDb(coll.s.db, coll.collectionName, options, callback);
}

/**
 * Check if one or more indexes exist on the collection. This fails on the first index that doesn't exist.
 *
 * @function
 * @param {Collection} coll Collection instance.
 * @param {(string|Array)} indexes One or more index names to check.
 * @param {object} [options] Optional settings. See Collection.prototype.indexExists for a list of options.
 * @param {Collection~resultCallback} [callback] The command result callback
 */
function indexExists(coll: any, indexes: any, options?: object, callback?: Function) {
  indexInformation(coll, options, (err?: any, indexInformation?: any) => {
    // If we have an error return
    if (err != null) return handleCallback(callback!, err, null);
    // Let's check for the index names
    if (!Array.isArray(indexes))
      return handleCallback(callback!, null, indexInformation[indexes] != null);
    // Check in list of indexes
    for (let i = 0; i < indexes.length; i++) {
      if (indexInformation[indexes[i]] == null) {
        return handleCallback(callback!, null, false);
      }
    }

    // All keys found return true
    return handleCallback(callback!, null, true);
  });
}

/**
 * Retrieve this collection's index info.
 *
 * @function
 * @param {Collection} coll Collection instance.
 * @param {object} [options] Optional settings. See Collection.prototype.indexInformation for a list of options.
 * @param {Collection~resultCallback} [callback] The command result callback
 */
function indexInformation(coll: any, options?: object, callback?: Function) {
  indexInformationDb(coll.s.db, coll.collectionName, options, callback);
}

/**
 * Return N parallel cursors for a collection to allow parallel reading of the entire collection. There are
 * no ordering guarantees for returned results.
 *
 * @function
 * @param {Collection} coll Collection instance.
 * @param {any} [options] Optional settings. See Collection.prototype.parallelCollectionScan for a list of options.
 * @param {Collection~parallelCollectionScanCallback} [callback] The command result callback
 */
function parallelCollectionScan(coll: any, options?: any, callback?: Function) {
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
  executeCommand(coll.s.db, commandObject, options, (err?: any, result?: any) => {
    if (err) return handleCallback(callback!, err, null);
    if (result == null)
      return handleCallback(
        callback!,
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

    handleCallback(callback!, null, cursors);
  });
}

/**
 * Save a document.
 *
 * @function
 * @param {Collection} coll Collection instance.
 * @param {any} doc Document to save
 * @param {any} [options] Optional settings. See Collection.prototype.save for a list of options.
 * @param {Collection~writeOpCallback} [callback] The command result callback
 * @deprecated use insertOne, insertMany, updateOne or updateMany
 */
function save(coll: any, doc: any, options?: any, callback?: Function) {
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
  insertDocuments(coll, [doc], finalOptions, (err?: any, result?: any) => {
    if (callback == null) return;
    if (doc == null) return handleCallback(callback, null, null);
    if (err) return handleCallback(callback, err, null);
    handleCallback(callback, null, result);
  });
}

export {
  checkForAtomicOperators,
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
