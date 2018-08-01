'use strict';

const applyWriteConcern = require('../utils').applyWriteConcern;
const checkCollectionName = require('../utils').checkCollectionName;
const Code = require('mongodb-core').BSON.Code;
const createIndexDb = require('./db_ops').createIndex;
const decorateCommand = require('../utils').decorateCommand;
const decorateWithCollation = require('../utils').decorateWithCollation;
const decorateWithReadConcern = require('../utils').decorateWithReadConcern;
const ensureIndexDb = require('./db_ops').ensureIndex;
const evaluate = require('./db_ops').evaluate;
const executeCommand = require('./db_ops').executeCommand;
const executeDbAdminCommand = require('./db_ops').executeDbAdminCommand;
const formattedOrderClause = require('../utils').formattedOrderClause;
const resolveReadPreference = require('../utils').resolveReadPreference;
const handleCallback = require('../utils').handleCallback;
const indexInformationDb = require('./db_ops').indexInformation;
const isObject = require('../utils').isObject;
const Long = require('mongodb-core').BSON.Long;
const MongoError = require('mongodb-core').MongoError;
const ReadPreference = require('mongodb-core').ReadPreference;
const toError = require('../utils').toError;

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
 * Perform a bulkWrite operation. See Collection.prototype.bulkWrite for more information.
 *
 * @method
 * @param {Collection} a Collection instance.
 * @param {object[]} operations Bulk operations to perform.
 * @param {object} [options] Optional settings. See Collection.prototype.bulkWrite for a list of options.
 * @param {Collection~bulkWriteOpCallback} [callback] The command result callback
 */
function bulkWrite(coll, operations, options, callback) {
  // Add ignoreUndfined
  if (coll.s.options.ignoreUndefined) {
    options = Object.assign({}, options);
    options.ignoreUndefined = coll.s.options.ignoreUndefined;
  }

  // Create the bulk operation
  const bulk =
    options.ordered === true || options.ordered == null
      ? coll.initializeOrderedBulkOp(options)
      : coll.initializeUnorderedBulkOp(options);

  // Do we have a collation
  let collation = false;

  // for each op go through and add to the bulk
  try {
    for (let i = 0; i < operations.length; i++) {
      // Get the operation type
      const key = Object.keys(operations[i])[0];
      // Check if we have a collation
      if (operations[i][key].collation) {
        collation = true;
      }

      // Pass to the raw bulk
      bulk.raw(operations[i]);
    }
  } catch (err) {
    return callback(err, null);
  }

  // Final options for write concern
  const finalOptions = applyWriteConcern(
    Object.assign({}, options),
    { db: coll.s.db, collection: coll },
    options
  );

  const writeCon = finalOptions.writeConcern ? finalOptions.writeConcern : {};
  const capabilities = coll.s.topology.capabilities();

  // Did the user pass in a collation, check if our write server supports it
  if (collation && capabilities && !capabilities.commandsTakeCollation) {
    return callback(new MongoError('server/primary/mongos does not support collation'));
  }

  // Execute the bulk
  bulk.execute(writeCon, finalOptions, (err, r) => {
    // We have connection level error
    if (!r && err) {
      return callback(err, null);
    }

    r.insertedCount = r.nInserted;
    r.matchedCount = r.nMatched;
    r.modifiedCount = r.nModified || 0;
    r.deletedCount = r.nRemoved;
    r.upsertedCount = r.getUpsertedIds().length;
    r.upsertedIds = {};
    r.insertedIds = {};

    // Update the n
    r.n = r.insertedCount;

    // Inserted documents
    const inserted = r.getInsertedIds();
    // Map inserted ids
    for (let i = 0; i < inserted.length; i++) {
      r.insertedIds[inserted[i].index] = inserted[i]._id;
    }

    // Upserted documents
    const upserted = r.getUpsertedIds();
    // Map upserted ids
    for (let i = 0; i < upserted.length; i++) {
      r.upsertedIds[upserted[i].index] = upserted[i]._id;
    }

    // Return the results
    callback(null, r);
  });
}

// Check the update operation to ensure it has atomic operators.
function checkForAtomicOperators(update) {
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
 * Count the number of documents in the collection that match the query.
 *
 * @method
 * @param {Collection} a Collection instance.
 * @param {object} query The query for the count.
 * @param {object} [options] Optional settings. See Collection.prototype.count for a list of options.
 * @param {Collection~countCallback} [callback] The command result callback
 */
function count(coll, query, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = Object.assign({}, options);
  options.collectionName = coll.s.name;

  options.readPreference = resolveReadPreference(options, {
    db: coll.s.db,
    collection: coll
  });

  const cmd = buildCountCommand(coll, query, options);

  executeCommand(coll.s.db, cmd, options, (err, result) => {
    if (err) return handleCallback(callback, err);
    handleCallback(callback, null, result.n);
  });
}

function countDocuments(coll, query, options, callback) {
  const skip = options.skip;
  const limit = options.limit;
  options = Object.assign({}, options);

  const pipeline = [{ $match: query }];

  // Add skip and limit if defined
  if (typeof skip === 'number') {
    pipeline.push({ $skip: skip });
  }

  if (typeof limit === 'number') {
    pipeline.push({ $limit: limit });
  }

  pipeline.push({ $group: { _id: null, n: { $sum: 1 } } });

  delete options.limit;
  delete options.skip;

  coll.aggregate(pipeline, options).toArray((err, docs) => {
    if (err) return handleCallback(callback, err);
    handleCallback(callback, null, docs.length ? docs[0].n : 0);
  });
}

/**
 * Build the count command.
 *
 * @method
 * @param {collectionOrCursor} an instance of a collection or cursor
 * @param {object} query The query for the count.
 * @param {object} [options] Optional settings. See Collection.prototype.count and Cursor.prototype.count for a list of options.
 */
function buildCountCommand(collectionOrCursor, query, options) {
  const skip = options.skip;
  const limit = options.limit;
  let hint = options.hint;
  const maxTimeMS = options.maxTimeMS;
  query = query || {};

  // Final query
  const cmd = {
    count: options.collectionName,
    query: query
  };

  // check if collectionOrCursor is a cursor by using cursor.s.numberOfRetries
  if (collectionOrCursor.s.numberOfRetries) {
    if (collectionOrCursor.s.options.hint) {
      hint = collectionOrCursor.s.options.hint;
    } else if (collectionOrCursor.s.cmd.hint) {
      hint = collectionOrCursor.s.cmd.hint;
    }
    decorateWithCollation(cmd, collectionOrCursor, collectionOrCursor.s.cmd);
  } else {
    decorateWithCollation(cmd, collectionOrCursor, options);
  }

  // Add limit, skip and maxTimeMS if defined
  if (typeof skip === 'number') cmd.skip = skip;
  if (typeof limit === 'number') cmd.limit = limit;
  if (typeof maxTimeMS === 'number') cmd.maxTimeMS = maxTimeMS;
  if (hint) cmd.hint = hint;

  // Do we have a readConcern specified
  decorateWithReadConcern(cmd, collectionOrCursor);

  return cmd;
}

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
  createIndexDb(coll.s.db, coll.s.name, fieldOrSpec, options, callback);
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
      createIndexes: coll.s.name,
      indexes: indexSpecs
    },
    options,
    callback
  );
}

function deleteCallback(err, r, callback) {
  if (callback == null) return;
  if (err && callback) return callback(err);
  if (r == null) return callback(null, { result: { ok: 1 } });
  r.deletedCount = r.result.n;
  if (callback) callback(null, r);
}

/**
 * Delete multiple documents from the collection.
 *
 * @method
 * @param {Collection} a Collection instance.
 * @param {object} filter The Filter used to select the documents to remove
 * @param {object} [options] Optional settings. See Collection.prototype.deleteMany for a list of options.
 * @param {Collection~deleteWriteOpCallback} [callback] The command result callback
 */
function deleteMany(coll, filter, options, callback) {
  options.single = false;

  removeDocuments(coll, filter, options, (err, r) => deleteCallback(err, r, callback));
}

/**
 * Delete a single document from the collection.
 *
 * @method
 * @param {Collection} a Collection instance.
 * @param {object} filter The Filter used to select the document to remove
 * @param {object} [options] Optional settings. See Collection.prototype.deleteOne for a list of options.
 * @param {Collection~deleteWriteOpCallback} [callback] The command result callback
 */
function deleteOne(coll, filter, options, callback) {
  options.single = true;
  removeDocuments(coll, filter, options, (err, r) => deleteCallback(err, r, callback));
}

/**
 * Return a list of distinct values for the given key across a collection.
 *
 * @method
 * @param {Collection} a Collection instance.
 * @param {string} key Field of the document to find distinct values for.
 * @param {object} query The query for filtering the set of documents to which we apply the distinct filter.
 * @param {object} [options] Optional settings. See Collection.prototype.distinct for a list of options.
 * @param {Collection~resultCallback} [callback] The command result callback
 */
function distinct(coll, key, query, options, callback) {
  // maxTimeMS option
  const maxTimeMS = options.maxTimeMS;

  // Distinct command
  const cmd = {
    distinct: coll.s.name,
    key: key,
    query: query
  };

  options = Object.assign({}, options);
  // Ensure we have the right read preference inheritance
  options.readPreference = resolveReadPreference(options, { db: coll.s.db, collection: coll });

  // Add maxTimeMS if defined
  if (typeof maxTimeMS === 'number') cmd.maxTimeMS = maxTimeMS;

  // Do we have a readConcern specified
  decorateWithReadConcern(cmd, coll, options);

  // Have we specified collation
  decorateWithCollation(cmd, coll, options);

  // Execute the command
  executeCommand(coll.s.db, cmd, options, (err, result) => {
    if (err) return handleCallback(callback, err);
    handleCallback(callback, null, result.values);
  });
}

/**
 * Drop an index from this collection.
 *
 * @method
 * @param {Collection} a Collection instance.
 * @param {string} indexName Name of the index to drop.
 * @param {object} [options] Optional settings. See Collection.prototype.dropIndex for a list of options.
 * @param {Collection~resultCallback} [callback] The command result callback
 */
function dropIndex(coll, indexName, options, callback) {
  // Delete index command
  const cmd = { dropIndexes: coll.s.name, index: indexName };

  // Decorate command with writeConcern if supported
  applyWriteConcern(cmd, { db: coll.s.db, collection: coll }, options);

  // Execute command
  executeCommand(coll.s.db, cmd, options, (err, result) => {
    if (typeof callback !== 'function') return;
    if (err) return handleCallback(callback, err, null);
    handleCallback(callback, null, result);
  });
}

/**
 * Drop all indexes from this collection.
 *
 * @method
 * @param {Collection} a Collection instance.
 * @param {Object} [options] Optional settings. See Collection.prototype.dropIndexes for a list of options.
 * @param {Collection~resultCallback} [callback] The command result callback
 */
function dropIndexes(coll, options, callback) {
  dropIndex(coll, '*', options, err => {
    if (err) return handleCallback(callback, err, false);
    handleCallback(callback, null, true);
  });
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
  ensureIndexDb(coll.s.db, coll.s.name, fieldOrSpec, options, callback);
}

/**
 * Find and update a document.
 *
 * @method
 * @param {Collection} a Collection instance.
 * @param {object} query Query object to locate the object to modify.
 * @param {array} sort If multiple docs match, choose the first one in the specified sort order as the object to manipulate.
 * @param {object} doc The fields/vals to be updated.
 * @param {object} [options] Optional settings. See Collection.prototype.findAndModify for a list of options.
 * @param {Collection~findAndModifyCallback} [callback] The command result callback
 * @deprecated use findOneAndUpdate, findOneAndReplace or findOneAndDelete instead
 */
function findAndModify(coll, query, sort, doc, options, callback) {
  // Create findAndModify command object
  const queryObject = {
    findAndModify: coll.s.name,
    query: query
  };

  sort = formattedOrderClause(sort);
  if (sort) {
    queryObject.sort = sort;
  }

  queryObject.new = options.new ? true : false;
  queryObject.remove = options.remove ? true : false;
  queryObject.upsert = options.upsert ? true : false;

  const projection = options.projection || options.fields;

  if (projection) {
    queryObject.fields = projection;
  }

  if (options.arrayFilters) {
    queryObject.arrayFilters = options.arrayFilters;
    delete options.arrayFilters;
  }

  if (doc && !options.remove) {
    queryObject.update = doc;
  }

  if (options.maxTimeMS) queryObject.maxTimeMS = options.maxTimeMS;

  // Either use override on the function, or go back to default on either the collection
  // level or db
  options.serializeFunctions = options.serializeFunctions || coll.s.serializeFunctions;

  // No check on the documents
  options.checkKeys = false;

  // Get the write concern settings
  const finalOptions = applyWriteConcern(options, { db: coll.s.db, collection: coll }, options);

  // Decorate the findAndModify command with the write Concern
  if (finalOptions.writeConcern) {
    queryObject.writeConcern = finalOptions.writeConcern;
  }

  // Have we specified bypassDocumentValidation
  if (finalOptions.bypassDocumentValidation === true) {
    queryObject.bypassDocumentValidation = finalOptions.bypassDocumentValidation;
  }

  finalOptions.readPreference = ReadPreference.primary;

  // Have we specified collation
  decorateWithCollation(queryObject, coll, finalOptions);

  // Execute the command
  executeCommand(coll.s.db, queryObject, finalOptions, (err, result) => {
    if (err) return handleCallback(callback, err, null);

    return handleCallback(callback, null, result);
  });
}

/**
 * Find and remove a document.
 *
 * @method
 * @param {Collection} a Collection instance.
 * @param {object} query Query object to locate the object to modify.
 * @param {array} sort If multiple docs match, choose the first one in the specified sort order as the object to manipulate.
 * @param {object} [options] Optional settings. See Collection.prototype.findAndRemove for a list of options.
 * @param {Collection~resultCallback} [callback] The command result callback
 * @deprecated use findOneAndDelete instead
 */
function findAndRemove(coll, query, sort, options, callback) {
  // Add the remove option
  options.remove = true;
  // Execute the callback
  findAndModify(coll, query, sort, null, options, callback);
}

/**
 * Fetch the first document that matches the query.
 *
 * @method
 * @param {Collection} a Collection instance.
 * @param {object} query Query for find Operation
 * @param {object} [options] Optional settings. See Collection.prototype.findOne for a list of options.
 * @param {Collection~resultCallback} [callback] The command result callback
 */
function findOne(coll, query, options, callback) {
  const cursor = coll
    .find(query, options)
    .limit(-1)
    .batchSize(1);

  // Return the item
  cursor.next((err, item) => {
    if (err != null) return handleCallback(callback, toError(err), null);
    handleCallback(callback, null, item);
  });
}

/**
 * Find a document and delete it in one atomic operation. This requires a write lock for the duration of the operation.
 *
 * @method
 * @param {Collection} a Collection instance.
 * @param {object} filter Document selection filter.
 * @param {object} [options] Optional settings. See Collection.prototype.findOneAndDelete for a list of options.
 * @param {Collection~findAndModifyCallback} [callback] The collection result callback
 */
function findOneAndDelete(coll, filter, options, callback) {
  // Final options
  const finalOptions = Object.assign({}, options);
  finalOptions.fields = options.projection;
  finalOptions.remove = true;
  // Execute find and Modify
  findAndModify(coll, filter, options.sort, null, finalOptions, callback);
}

/**
 * Find a document and replace it in one atomic operation. This requires a write lock for the duration of the operation.
 *
 * @method
 * @param {Collection} a Collection instance.
 * @param {object} filter Document selection filter.
 * @param {object} replacement Document replacing the matching document.
 * @param {object} [options] Optional settings. See Collection.prototype.findOneAndReplace for a list of options.
 * @param {Collection~findAndModifyCallback} [callback] The collection result callback
 */
function findOneAndReplace(coll, filter, replacement, options, callback) {
  // Final options
  const finalOptions = Object.assign({}, options);
  finalOptions.fields = options.projection;
  finalOptions.update = true;
  finalOptions.new = options.returnOriginal !== void 0 ? !options.returnOriginal : false;
  finalOptions.upsert = options.upsert !== void 0 ? !!options.upsert : false;

  // Execute findAndModify
  findAndModify(coll, filter, options.sort, replacement, finalOptions, callback);
}

/**
 * Find a document and update it in one atomic operation. This requires a write lock for the duration of the operation.
 *
 * @method
 * @param {Collection} a Collection instance.
 * @param {object} filter Document selection filter.
 * @param {object} update Update operations to be performed on the document
 * @param {object} [options] Optional settings. See Collection.prototype.findOneAndUpdate for a list of options.
 * @param {Collection~findAndModifyCallback} [callback] The collection result callback
 */
function findOneAndUpdate(coll, filter, update, options, callback) {
  // Final options
  const finalOptions = Object.assign({}, options);
  finalOptions.fields = options.projection;
  finalOptions.update = true;
  finalOptions.new = typeof options.returnOriginal === 'boolean' ? !options.returnOriginal : false;
  finalOptions.upsert = typeof options.upsert === 'boolean' ? options.upsert : false;

  // Execute findAndModify
  findAndModify(coll, filter, options.sort, update, finalOptions, callback);
}

/**
 * Execute a geo search using a geo haystack index on a collection.
 *
 * @method
 * @param {Collection} a Collection instance.
 * @param {number} x Point to search on the x axis, ensure the indexes are ordered in the same order.
 * @param {number} y Point to search on the y axis, ensure the indexes are ordered in the same order.
 * @param {object} [options] Optional settings. See Collection.prototype.geoHaystackSearch for a list of options.
 * @param {Collection~resultCallback} [callback] The command result callback
 */
function geoHaystackSearch(coll, x, y, options, callback) {
  // Build command object
  let commandObject = {
    geoSearch: coll.s.name,
    near: [x, y]
  };

  // Remove read preference from hash if it exists
  commandObject = decorateCommand(commandObject, options, { readPreference: true, session: true });

  options = Object.assign({}, options);
  // Ensure we have the right read preference inheritance
  options.readPreference = resolveReadPreference(options, { db: coll.s.db, collection: coll });

  // Do we have a readConcern specified
  decorateWithReadConcern(commandObject, coll, options);

  // Execute the command
  executeCommand(coll.s.db, commandObject, options, (err, res) => {
    if (err) return handleCallback(callback, err);
    if (res.err || res.errmsg) handleCallback(callback, toError(res));
    // should we only be returning res.results here? Not sure if the user
    // should see the other return information
    handleCallback(callback, null, res);
  });
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
        ns: coll.s.name,
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
    options.readPreference = resolveReadPreference(options, { db: coll.s.db, collection: coll });

    // Do we have a readConcern specified
    decorateWithReadConcern(selector, coll, options);

    // Have we specified collation
    decorateWithCollation(selector, coll, options);

    // Execute command
    executeCommand(coll.s.db, selector, options, (err, result) => {
      if (err) return handleCallback(callback, err, null);
      handleCallback(callback, null, result.retval);
    });
  } else {
    // Create execution scope
    const scope = reduce != null && reduce._bsontype === 'Code' ? reduce.scope : {};

    scope.ns = coll.s.name;
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
  indexInformationDb(coll.s.db, coll.s.name, options, callback);
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
  indexInformationDb(coll.s.db, coll.s.name, options, callback);
}

function insertDocuments(coll, docs, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = options || {};
  // Ensure we are operating on an array op docs
  docs = Array.isArray(docs) ? docs : [docs];

  // Get the write concern options
  const finalOptions = applyWriteConcern(
    Object.assign({}, options),
    { db: coll.s.db, collection: coll },
    options
  );

  // If keep going set unordered
  if (finalOptions.keepGoing === true) finalOptions.ordered = false;
  finalOptions.serializeFunctions = options.serializeFunctions || coll.s.serializeFunctions;

  docs = prepareDocs(coll, docs, options);

  // File inserts
  coll.s.topology.insert(coll.s.namespace, docs, finalOptions, (err, result) => {
    if (callback == null) return;
    if (err) return handleCallback(callback, err);
    if (result == null) return handleCallback(callback, null, null);
    if (result.result.code) return handleCallback(callback, toError(result.result));
    if (result.result.writeErrors)
      return handleCallback(callback, toError(result.result.writeErrors[0]));
    // Add docs to the list
    result.ops = docs;
    // Return the results
    handleCallback(callback, null, result);
  });
}

/**
 * Insert a single document into the collection. See Collection.prototype.insertOne for more information.
 *
 * @method
 * @param {Collection} a Collection instance.
 * @param {object} doc Document to insert.
 * @param {object} [options] Optional settings. See Collection.prototype.insertOne for a list of options.
 * @param {Collection~insertOneWriteOpCallback} [callback] The command result callback
 */
function insertOne(coll, doc, options, callback) {
  if (Array.isArray(doc)) {
    return callback(
      MongoError.create({ message: 'doc parameter must be an object', driver: true })
    );
  }

  insertDocuments(coll, [doc], options, (err, r) => {
    if (callback == null) return;
    if (err && callback) return callback(err);
    // Workaround for pre 2.6 servers
    if (r == null) return callback(null, { result: { ok: 1 } });
    // Add values to top level to ensure crud spec compatibility
    r.insertedCount = r.result.n;
    r.insertedId = doc._id;
    if (callback) callback(null, r);
  });
}

/**
 * Determine whether the collection is a capped collection.
 *
 * @method
 * @param {Collection} a Collection instance.
 * @param {Object} [options] Optional settings. See Collection.prototype.isCapped for a list of options.
 * @param {Collection~resultCallback} [callback] The results callback
 */
function isCapped(coll, options, callback) {
  optionsOp(coll, options, (err, document) => {
    if (err) return handleCallback(callback, err);
    handleCallback(callback, null, !!(document && document.capped));
  });
}

/**
 * Run Map Reduce across a collection. Be aware that the inline option for out will return an array of results not a collection.
 *
 * @method
 * @param {Collection} a Collection instance.
 * @param {(function|string)} map The mapping function.
 * @param {(function|string)} reduce The reduce function.
 * @param {object} [options] Optional settings. See Collection.prototype.mapReduce for a list of options.
 * @param {Collection~resultCallback} [callback] The command result callback
 */
function mapReduce(coll, map, reduce, options, callback) {
  const mapCommandHash = {
    mapreduce: coll.s.name,
    map: map,
    reduce: reduce
  };

  // Exclusion list
  const exclusionList = ['readPreference', 'session', 'bypassDocumentValidation'];

  // Add any other options passed in
  for (let n in options) {
    if ('scope' === n) {
      mapCommandHash[n] = processScope(options[n]);
    } else {
      // Only include if not in exclusion list
      if (exclusionList.indexOf(n) === -1) {
        mapCommandHash[n] = options[n];
      }
    }
  }

  options = Object.assign({}, options);

  // Ensure we have the right read preference inheritance
  options.readPreference = resolveReadPreference(options, { db: coll.s.db, collection: coll });

  // If we have a read preference and inline is not set as output fail hard
  if (
    options.readPreference !== false &&
    options.readPreference !== 'primary' &&
    options['out'] &&
    (options['out'].inline !== 1 && options['out'] !== 'inline')
  ) {
    // Force readPreference to primary
    options.readPreference = 'primary';
    // Decorate command with writeConcern if supported
    applyWriteConcern(mapCommandHash, { db: coll.s.db, collection: coll }, options);
  } else {
    decorateWithReadConcern(mapCommandHash, coll, options);
  }

  // Is bypassDocumentValidation specified
  if (options.bypassDocumentValidation === true) {
    mapCommandHash.bypassDocumentValidation = options.bypassDocumentValidation;
  }

  // Have we specified collation
  decorateWithCollation(mapCommandHash, coll, options);

  // Execute command
  executeCommand(coll.s.db, mapCommandHash, options, (err, result) => {
    if (err) return handleCallback(callback, err);
    // Check if we have an error
    if (1 !== result.ok || result.err || result.errmsg) {
      return handleCallback(callback, toError(result));
    }

    // Create statistics value
    const stats = {};
    if (result.timeMillis) stats['processtime'] = result.timeMillis;
    if (result.counts) stats['counts'] = result.counts;
    if (result.timing) stats['timing'] = result.timing;

    // invoked with inline?
    if (result.results) {
      // If we wish for no verbosity
      if (options['verbose'] == null || !options['verbose']) {
        return handleCallback(callback, null, result.results);
      }

      return handleCallback(callback, null, { results: result.results, stats: stats });
    }

    // The returned collection
    let collection = null;

    // If we have an object it's a different db
    if (result.result != null && typeof result.result === 'object') {
      const doc = result.result;
      // Return a collection from another db
      const Db = require('../db');
      collection = new Db(doc.db, coll.s.db.s.topology, coll.s.db.s.options).collection(
        doc.collection
      );
    } else {
      // Create a collection object that wraps the result collection
      collection = coll.s.db.collection(result.result);
    }

    // If we wish for no verbosity
    if (options['verbose'] == null || !options['verbose']) {
      return handleCallback(callback, err, collection);
    }

    // Return stats as third set of values
    handleCallback(callback, err, { collection: collection, stats: stats });
  });
}

/**
 * Return the options of the collection.
 *
 * @method
 * @param {Collection} a Collection instance.
 * @param {Object} [options] Optional settings. See Collection.prototype.options for a list of options.
 * @param {Collection~resultCallback} [callback] The results callback
 */
function optionsOp(coll, opts, callback) {
  coll.s.db.listCollections({ name: coll.s.name }, opts).toArray((err, collections) => {
    if (err) return handleCallback(callback, err);
    if (collections.length === 0) {
      return handleCallback(
        callback,
        MongoError.create({ message: `collection ${coll.s.namespace} not found`, driver: true })
      );
    }

    handleCallback(callback, err, collections[0].options || null);
  });
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
    parallelCollectionScan: coll.s.name,
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
      cursors.push(coll.s.topology.cursor(coll.s.namespace, cursorId, options));
    }

    handleCallback(callback, null, cursors);
  });
}

// modifies documents before being inserted or updated
function prepareDocs(coll, docs, options) {
  const forceServerObjectId =
    typeof options.forceServerObjectId === 'boolean'
      ? options.forceServerObjectId
      : coll.s.db.options.forceServerObjectId;

  // no need to modify the docs if server sets the ObjectId
  if (forceServerObjectId === true) {
    return docs;
  }

  return docs.map(doc => {
    if (forceServerObjectId !== true && doc._id == null) {
      doc._id = coll.s.pkFactory.createPk();
    }

    return doc;
  });
}

/**
 * Functions that are passed as scope args must
 * be converted to Code instances.
 * @ignore
 */
function processScope(scope) {
  if (!isObject(scope) || scope._bsontype === 'ObjectID') {
    return scope;
  }

  const keys = Object.keys(scope);
  let key;
  const new_scope = {};

  for (let i = keys.length - 1; i >= 0; i--) {
    key = keys[i];
    if ('function' === typeof scope[key]) {
      new_scope[key] = new Code(String(scope[key]));
    } else {
      new_scope[key] = processScope(scope[key]);
    }
  }

  return new_scope;
}

/**
 * Reindex all indexes on the collection.
 *
 * @method
 * @param {Collection} a Collection instance.
 * @param {Object} [options] Optional settings. See Collection.prototype.reIndex for a list of options.
 * @param {Collection~resultCallback} [callback] The command result callback
 */
function reIndex(coll, options, callback) {
  // Reindex
  const cmd = { reIndex: coll.s.name };

  // Execute the command
  executeCommand(coll.s.db, cmd, options, (err, result) => {
    if (callback == null) return;
    if (err) return handleCallback(callback, err, null);
    handleCallback(callback, null, result.ok ? true : false);
  });
}

function removeDocuments(coll, selector, options, callback) {
  if (typeof options === 'function') {
    (callback = options), (options = {});
  } else if (typeof selector === 'function') {
    callback = selector;
    options = {};
    selector = {};
  }

  // Create an empty options object if the provided one is null
  options = options || {};

  // Get the write concern options
  const finalOptions = applyWriteConcern(
    Object.assign({}, options),
    { db: coll.s.db, collection: coll },
    options
  );

  // If selector is null set empty
  if (selector == null) selector = {};

  // Build the op
  const op = { q: selector, limit: 0 };
  if (options.single) {
    op.limit = 1;
  } else if (finalOptions.retryWrites) {
    finalOptions.retryWrites = false;
  }

  // Have we specified collation
  decorateWithCollation(finalOptions, coll, options);

  // Execute the remove
  coll.s.topology.remove(coll.s.namespace, [op], finalOptions, (err, result) => {
    if (callback == null) return;
    if (err) return handleCallback(callback, err, null);
    if (result == null) return handleCallback(callback, null, null);
    if (result.result.code) return handleCallback(callback, toError(result.result));
    if (result.result.writeErrors)
      return handleCallback(callback, toError(result.result.writeErrors[0]));
    // Return the results
    handleCallback(callback, null, result);
  });
}

/**
 * Rename the collection.
 *
 * @method
 * @param {Collection} a Collection instance.
 * @param {string} newName New name of of the collection.
 * @param {object} [options] Optional settings. See Collection.prototype.rename for a list of options.
 * @param {Collection~collectionResultCallback} [callback] The results callback
 */
function rename(coll, newName, options, callback) {
  const Collection = require('../collection');
  // Check the collection name
  checkCollectionName(newName);
  // Build the command
  const renameCollection = `${coll.s.dbName}.${coll.s.name}`;
  const toCollection = `${coll.s.dbName}.${newName}`;
  const dropTarget = typeof options.dropTarget === 'boolean' ? options.dropTarget : false;
  const cmd = { renameCollection: renameCollection, to: toCollection, dropTarget: dropTarget };

  // Decorate command with writeConcern if supported
  applyWriteConcern(cmd, { db: coll.s.db, collection: coll }, options);

  // Execute against admin
  executeDbAdminCommand(coll.s.db.admin().s.db, cmd, options, (err, doc) => {
    if (err) return handleCallback(callback, err, null);
    // We have an error
    if (doc.errmsg) return handleCallback(callback, toError(doc), null);
    try {
      return handleCallback(
        callback,
        null,
        new Collection(
          coll.s.db,
          coll.s.topology,
          coll.s.dbName,
          newName,
          coll.s.pkFactory,
          coll.s.options
        )
      );
    } catch (err) {
      return handleCallback(callback, toError(err), null);
    }
  });
}

/**
 * Replace a document in the collection.
 *
 * @method
 * @param {Collection} a Collection instance.
 * @param {object} filter The Filter used to select the document to update
 * @param {object} doc The Document that replaces the matching document
 * @param {object} [options] Optional settings. See Collection.prototype.replaceOne for a list of options.
 * @param {Collection~updateWriteOpCallback} [callback] The command result callback
 */
function replaceOne(coll, filter, doc, options, callback) {
  // Set single document update
  options.multi = false;

  // Execute update
  updateDocuments(coll, filter, doc, options, (err, r) => {
    if (callback == null) return;
    if (err && callback) return callback(err);
    if (r == null) return callback(null, { result: { ok: 1 } });

    r.modifiedCount = r.result.nModified != null ? r.result.nModified : r.result.n;
    r.upsertedId =
      Array.isArray(r.result.upserted) && r.result.upserted.length > 0
        ? r.result.upserted[0] // FIXME(major): should be `r.result.upserted[0]._id`
        : null;
    r.upsertedCount =
      Array.isArray(r.result.upserted) && r.result.upserted.length ? r.result.upserted.length : 0;
    r.matchedCount =
      Array.isArray(r.result.upserted) && r.result.upserted.length > 0 ? 0 : r.result.n;
    r.ops = [doc];
    if (callback) callback(null, r);
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

/**
 * Get all the collection statistics.
 *
 * @method
 * @param {Collection} a Collection instance.
 * @param {object} [options] Optional settings. See Collection.prototype.stats for a list of options.
 * @param {Collection~resultCallback} [callback] The collection result callback
 */
function stats(coll, options, callback) {
  // Build command object
  const commandObject = {
    collStats: coll.s.name
  };

  // Check if we have the scale value
  if (options['scale'] != null) commandObject['scale'] = options['scale'];

  options = Object.assign({}, options);
  // Ensure we have the right read preference inheritance
  options.readPreference = resolveReadPreference(options, { db: coll.s.db, collection: coll });

  // Execute the command
  executeCommand(coll.s.db, commandObject, options, callback);
}

function updateCallback(err, r, callback) {
  if (callback == null) return;
  if (err) return callback(err);
  if (r == null) return callback(null, { result: { ok: 1 } });
  r.modifiedCount = r.result.nModified != null ? r.result.nModified : r.result.n;
  r.upsertedId =
    Array.isArray(r.result.upserted) && r.result.upserted.length > 0
      ? r.result.upserted[0] // FIXME(major): should be `r.result.upserted[0]._id`
      : null;
  r.upsertedCount =
    Array.isArray(r.result.upserted) && r.result.upserted.length ? r.result.upserted.length : 0;
  r.matchedCount =
    Array.isArray(r.result.upserted) && r.result.upserted.length > 0 ? 0 : r.result.n;
  callback(null, r);
}

function updateDocuments(coll, selector, document, options, callback) {
  if ('function' === typeof options) (callback = options), (options = null);
  if (options == null) options = {};
  if (!('function' === typeof callback)) callback = null;

  // If we are not providing a selector or document throw
  if (selector == null || typeof selector !== 'object')
    return callback(toError('selector must be a valid JavaScript object'));
  if (document == null || typeof document !== 'object')
    return callback(toError('document must be a valid JavaScript object'));

  // Get the write concern options
  const finalOptions = applyWriteConcern(
    Object.assign({}, options),
    { db: coll.s.db, collection: coll },
    options
  );

  // Do we return the actual result document
  // Either use override on the function, or go back to default on either the collection
  // level or db
  finalOptions.serializeFunctions = options.serializeFunctions || coll.s.serializeFunctions;

  // Execute the operation
  const op = { q: selector, u: document };
  op.upsert = options.upsert !== void 0 ? !!options.upsert : false;
  op.multi = options.multi !== void 0 ? !!options.multi : false;

  if (finalOptions.arrayFilters) {
    op.arrayFilters = finalOptions.arrayFilters;
    delete finalOptions.arrayFilters;
  }

  if (finalOptions.retryWrites && op.multi) {
    finalOptions.retryWrites = false;
  }

  // Have we specified collation
  decorateWithCollation(finalOptions, coll, options);

  // Update options
  coll.s.topology.update(coll.s.namespace, [op], finalOptions, (err, result) => {
    if (callback == null) return;
    if (err) return handleCallback(callback, err, null);
    if (result == null) return handleCallback(callback, null, null);
    if (result.result.code) return handleCallback(callback, toError(result.result));
    if (result.result.writeErrors)
      return handleCallback(callback, toError(result.result.writeErrors[0]));
    // Return the results
    handleCallback(callback, null, result);
  });
}

/**
 * Update multiple documents in the collection.
 *
 * @method
 * @param {Collection} a Collection instance.
 * @param {object} filter The Filter used to select the documents to update
 * @param {object} update The update operations to be applied to the document
 * @param {object} [options] Optional settings. See Collection.prototype.updateMany for a list of options.
 * @param {Collection~updateWriteOpCallback} [callback] The command result callback
 */
function updateMany(coll, filter, update, options, callback) {
  // Set single document update
  options.multi = true;
  // Execute update
  updateDocuments(coll, filter, update, options, (err, r) => updateCallback(err, r, callback));
}

/**
 * Update a single document in the collection.
 *
 * @method
 * @param {Collection} a Collection instance.
 * @param {object} filter The Filter used to select the document to update
 * @param {object} update The update operations to be applied to the document
 * @param {object} [options] Optional settings. See Collection.prototype.updateOne for a list of options.
 * @param {Collection~updateWriteOpCallback} [callback] The command result callback
 */
function updateOne(coll, filter, update, options, callback) {
  // Set single document update
  options.multi = false;
  // Execute update
  updateDocuments(coll, filter, update, options, (err, r) => updateCallback(err, r, callback));
}

module.exports = {
  bulkWrite,
  checkForAtomicOperators,
  count,
  countDocuments,
  buildCountCommand,
  createIndex,
  createIndexes,
  deleteMany,
  deleteOne,
  distinct,
  dropIndex,
  dropIndexes,
  ensureIndex,
  findAndModify,
  findAndRemove,
  findOne,
  findOneAndDelete,
  findOneAndReplace,
  findOneAndUpdate,
  geoHaystackSearch,
  group,
  indexes,
  indexExists,
  indexInformation,
  insertOne,
  isCapped,
  mapReduce,
  optionsOp,
  parallelCollectionScan,
  prepareDocs,
  reIndex,
  removeDocuments,
  rename,
  replaceOne,
  save,
  stats,
  updateDocuments,
  updateMany,
  updateOne
};
