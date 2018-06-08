'use strict';

const applyWriteConcern = require('../utils').applyWriteConcern;
const Code = require('mongodb-core').BSON.Code;
const decorateCommand = require('../utils').decorateCommand;
const formattedOrderClause = require('../utils').formattedOrderClause;
const getReadPreference = require('../utils').getReadPreference;
const handleCallback = require('../utils').handleCallback;
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

function count(coll, query, options, callback) {
  const skip = options.skip;
  const limit = options.limit;
  const hint = options.hint;
  const maxTimeMS = options.maxTimeMS;
  query = query || {};

  // Final query
  const cmd = {
    count: coll.s.name,
    query: query
  };

  // Add limit, skip and maxTimeMS if defined
  if (typeof skip === 'number') cmd.skip = skip;
  if (typeof limit === 'number') cmd.limit = limit;
  if (typeof maxTimeMS === 'number') cmd.maxTimeMS = maxTimeMS;
  if (hint) cmd.hint = hint;

  options = Object.assign({}, options);

  // Ensure we have the right read preference inheritance
  options = getReadPreference(coll, options, coll.s.db);

  // Do we have a readConcern specified
  decorateWithReadConcern(cmd, coll, options);

  // Have we specified collation
  decorateWithCollation(cmd, coll, options);

  // Execute command
  if (typeof options === 'function') (callback = options), (options = {});
  options = Object.assign({}, options);

  coll.s.db.command(cmd, options, (err, result) => {
    if (err) return handleCallback(callback, err);
    handleCallback(callback, null, result.n);
  });
}

function createIndex(coll, fieldOrSpec, options, callback) {
  coll.s.db.createIndex(coll.s.name, fieldOrSpec, options, callback);
}

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
  coll.s.db.command(
    {
      createIndexes: coll.s.name,
      indexes: indexSpecs
    },
    options,
    callback
  );
}

function decorateWithCollation(command, coll, options) {
  // Do we support collation 3.4 and higher
  const capabilities = coll.s.topology.capabilities();
  // Do we support write concerns 3.4 and higher
  if (capabilities && capabilities.commandsTakeCollation) {
    if (options.collation && typeof options.collation === 'object') {
      command.collation = options.collation;
    }
  }
}

function decorateWithReadConcern(command, coll, options) {
  let readConcern = Object.assign({}, command.readConcern || {});
  if (coll.s.readConcern) {
    Object.assign(readConcern, coll.s.readConcern);
  }

  if (
    options.session &&
    options.session.supports.causalConsistency &&
    options.session.operationTime
  ) {
    Object.assign(readConcern, { afterClusterTime: options.session.operationTime });
  }

  if (Object.keys(readConcern).length > 0) {
    Object.assign(command, { readConcern: readConcern });
  }
}

function deleteMany(coll, filter, options, callback) {
  options.single = false;

  removeDocuments(coll, filter, options, (err, r) => {
    if (callback == null) return;
    if (err && callback) return callback(err);
    if (r == null) return callback(null, { result: { ok: 1 } });
    r.deletedCount = r.result.n;
    if (callback) callback(null, r);
  });
}

function deleteOne(coll, filter, options, callback) {
  options.single = true;
  removeDocuments(coll, filter, options, (err, r) => {
    if (callback == null) return;
    if (err && callback) return callback(err);
    if (r == null) return callback(null, { result: { ok: 1 } });
    r.deletedCount = r.result.n;
    if (callback) callback(null, r);
  });
}

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
  options = getReadPreference(coll, options, coll.s.db, coll);

  // Add maxTimeMS if defined
  if (typeof maxTimeMS === 'number') cmd.maxTimeMS = maxTimeMS;

  // Do we have a readConcern specified
  decorateWithReadConcern(cmd, coll, options);

  // Have we specified collation
  decorateWithCollation(cmd, coll, options);

  // Execute the command
  coll.s.db.command(cmd, options, (err, result) => {
    if (err) return handleCallback(callback, err);
    handleCallback(callback, null, result.values);
  });
}

function dropIndex(coll, indexName, options, callback) {
  // Delete index command
  const cmd = { dropIndexes: coll.s.name, index: indexName };

  // Decorate command with writeConcern if supported
  applyWriteConcern(cmd, { db: coll.s.db, collection: coll }, options);

  // Execute command
  coll.s.db.command(cmd, options, (err, result) => {
    if (typeof callback !== 'function') return;
    if (err) return handleCallback(callback, err, null);
    handleCallback(callback, null, result);
  });
}

function dropIndexes(coll, options, callback) {
  coll.dropIndex('*', options, err => {
    if (err) return handleCallback(callback, err, false);
    handleCallback(callback, null, true);
  });
}

function ensureIndex(coll, fieldOrSpec, options, callback) {
  coll.s.db.ensureIndex(coll.s.name, fieldOrSpec, options, callback);
}

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
  if (options['serializeFunctions'] != null) {
    options['serializeFunctions'] = options['serializeFunctions'];
  } else {
    options['serializeFunctions'] = coll.s.serializeFunctions;
  }

  // No check on the documents
  options.checkKeys = false;

  // Get the write concern settings
  const finalOptions = applyWriteConcern(options, { db: coll.s.db, collection: coll }, options);

  // Decorate the findAndModify command with the write Concern
  if (finalOptions.writeConcern) {
    queryObject.writeConcern = finalOptions.writeConcern;
  }

  // Have we specified bypassDocumentValidation
  if (typeof finalOptions.bypassDocumentValidation === 'boolean') {
    queryObject.bypassDocumentValidation = finalOptions.bypassDocumentValidation;
  }

  // Have we specified collation
  decorateWithCollation(queryObject, coll, finalOptions);

  // Execute the command
  coll.s.db.command(queryObject, finalOptions, (err, result) => {
    if (err) return handleCallback(callback, err, null);

    if (result && result.value && typeof coll.s.options.map === 'function') {
      result.value = coll.s.options.map(result.value);
    }

    return handleCallback(callback, null, result);
  });
}

function findAndRemove(coll, query, sort, options, callback) {
  // Add the remove option
  options['remove'] = true;
  // Execute the callback
  coll.findAndModify(query, sort, null, options, callback);
}

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

function findOneAndDelete(coll, filter, options, callback) {
  // Final options
  const finalOptions = Object.assign({}, options);
  finalOptions['fields'] = options.projection;
  finalOptions['remove'] = true;
  // Execute find and Modify
  coll.findAndModify(filter, options.sort, null, finalOptions, callback);
}

function findOneAndReplace(coll, filter, replacement, options, callback) {
  // Final options
  const finalOptions = Object.assign({}, options);
  finalOptions['fields'] = options.projection;
  finalOptions['update'] = true;
  finalOptions['new'] = options.returnOriginal !== void 0 ? !options.returnOriginal : false;
  finalOptions['upsert'] = options.upsert !== void 0 ? !!options.upsert : false;

  // Execute findAndModify
  coll.findAndModify(filter, options.sort, replacement, finalOptions, callback);
}

function findOneAndUpdate(coll, filter, update, options, callback) {
  // Final options
  const finalOptions = Object.assign({}, options);
  finalOptions['fields'] = options.projection;
  finalOptions['update'] = true;
  finalOptions['new'] =
    typeof options.returnOriginal === 'boolean' ? !options.returnOriginal : false;
  finalOptions['upsert'] = typeof options.upsert === 'boolean' ? options.upsert : false;

  // Execute findAndModify
  coll.findAndModify(filter, options.sort, update, finalOptions, callback);
}

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
  options = getReadPreference(coll, options, coll.s.db, coll);

  // Do we have a readConcern specified
  decorateWithReadConcern(commandObject, coll, options);

  // Execute the command
  coll.s.db.command(commandObject, options, function(err, res) {
    if (err) return handleCallback(callback, err);
    if (res.err || res.errmsg) handleCallback(callback, toError(res));
    // should we only be returning res.results here? Not sure if the user
    // should see the other return information
    handleCallback(callback, null, res);
  });
}

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
      keys.forEach(function(key) {
        hash[key] = 1;
      });
      selector.group.key = hash;
    }

    options = Object.assign({}, options);
    // Ensure we have the right read preference inheritance
    options = getReadPreference(coll, options, coll.s.db, coll);

    // Do we have a readConcern specified
    decorateWithReadConcern(selector, coll, options);

    // Have we specified collation
    decorateWithCollation(selector, coll, options);

    // Execute command
    coll.s.db.command(selector, options, function(err, result) {
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

    coll.s.db.eval(new Code(groupfn, scope), null, options, function(err, results) {
      if (err) return handleCallback(callback, err, null);
      handleCallback(callback, null, results.result || results);
    });
  }
}

function indexes(coll, options, callback) {
  options = Object.assign({}, { full: true }, options);
  coll.s.db.indexInformation(coll.s.name, options, callback);
}

function indexExists(db, indexes, options, callback) {
  db.indexInformation(options, (err, indexInformation) => {
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

function indexInformation(coll, options, callback) {
  coll.s.db.indexInformation(coll.s.name, options, callback);
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
  finalOptions['serializeFunctions'] = options['serializeFunctions'] || coll.s.serializeFunctions;

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

function isCapped(coll, options, callback) {
  coll.options(options, (err, document) => {
    if (err) return handleCallback(callback, err);
    handleCallback(callback, null, document && document.capped);
  });
}

function mapReduce(coll, map, reduce, options, callback) {
  const mapCommandHash = {
    mapreduce: coll.s.name,
    map: map,
    reduce: reduce
  };

  // Exclusion list
  const exclusionList = ['readPreference', 'session'];

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
  options = getReadPreference(coll, options, coll.s.db, coll);

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
  if (typeof options.bypassDocumentValidation === 'boolean') {
    mapCommandHash.bypassDocumentValidation = options.bypassDocumentValidation;
  }

  // Have we specified collation
  decorateWithCollation(mapCommandHash, coll, options);

  // Execute command
  coll.s.db.command(mapCommandHash, options, function(err, result) {
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

function options(coll, opts, callback) {
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
  coll.s.db.command(commandObject, options, (err, result) => {
    if (err) return handleCallback(callback, err, null);
    if (result == null)
      return handleCallback(
        callback,
        new Error('no result returned for parallelCollectionScan'),
        null
      );

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

  const unmap = typeof coll.s.options.unmap === 'function' ? coll.s.options.unmap : false;

  // no need to modify the docs if server sets the ObjectId
  // and unmap collection option is unset
  if (forceServerObjectId === true && !unmap) {
    return docs;
  }

  return docs.map(doc => {
    if (forceServerObjectId !== true && doc._id == null) {
      doc._id = coll.s.pkFactory.createPk();
    }

    return unmap ? unmap(doc) : doc;
  });
}

function reIndex(coll, options, callback) {
  // Reindex
  const cmd = { reIndex: coll.s.name };

  // Execute the command
  coll.s.db.command(cmd, options, (err, result) => {
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
  if (options.single) op.limit = 1;

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

function stats(coll, options, callback) {
  // Build command object
  const commandObject = {
    collStats: coll.s.name
  };

  // Check if we have the scale value
  if (options['scale'] != null) commandObject['scale'] = options['scale'];

  options = Object.assign({}, options);
  // Ensure we have the right read preference inheritance
  options = getReadPreference(coll, options, coll.s.db, coll);

  // Execute the command
  coll.s.db.command(commandObject, options, callback);
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
  finalOptions['serializeFunctions'] = options['serializeFunctions'] || coll.s.serializeFunctions;

  // Execute the operation
  const op = { q: selector, u: document };
  op.upsert = options.upsert !== void 0 ? !!options.upsert : false;
  op.multi = options.multi !== void 0 ? !!options.multi : false;

  if (finalOptions.arrayFilters) {
    op.arrayFilters = finalOptions.arrayFilters;
    delete finalOptions.arrayFilters;
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

function updateMany(coll, filter, update, options, callback) {
  // Set single document update
  options.multi = true;
  // Execute update
  updateDocuments(coll, filter, update, options, (err, r) => {
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
    if (callback) callback(null, r);
  });
}

function updateOne(coll, filter, update, options, callback) {
  // Set single document update
  options.multi = false;
  // Execute update
  updateDocuments(coll, filter, update, options, (err, r) => {
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
    if (callback) callback(null, r);
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
  let i = keys.length;
  let key;
  const new_scope = {};

  while (i--) {
    key = keys[i];
    if ('function' === typeof scope[key]) {
      new_scope[key] = new Code(String(scope[key]));
    } else {
      new_scope[key] = processScope(scope[key]);
    }
  }

  return new_scope;
}

module.exports = {
  bulkWrite,
  count,
  createIndex,
  createIndexes,
  decorateWithCollation,
  decorateWithReadConcern,
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
  parallelCollectionScan,
  prepareDocs,
  reIndex,
  replaceOne,
  removeDocuments,
  save,
  stats,
  updateDocuments,
  updateMany,
  updateOne,
  options
};
