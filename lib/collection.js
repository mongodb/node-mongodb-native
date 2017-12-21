'use strict';

var checkCollectionName = require('./utils').checkCollectionName,
  ObjectID = require('mongodb-core').BSON.ObjectID,
  Long = require('mongodb-core').BSON.Long,
  Code = require('mongodb-core').BSON.Code,
  f = require('util').format,
  AggregationCursor = require('./aggregation_cursor'),
  MongoError = require('mongodb-core').MongoError,
  shallowClone = require('./utils').shallowClone,
  isObject = require('./utils').isObject,
  toError = require('./utils').toError,
  normalizeHintField = require('./utils').normalizeHintField,
  handleCallback = require('./utils').handleCallback,
  decorateCommand = require('./utils').decorateCommand,
  formattedOrderClause = require('./utils').formattedOrderClause,
  ReadPreference = require('mongodb-core').ReadPreference,
  CommandCursor = require('./command_cursor'),
  Define = require('./metadata'),
  Cursor = require('./cursor'),
  unordered = require('./bulk/unordered'),
  ordered = require('./bulk/ordered'),
  ChangeStream = require('./change_stream'),
  executeOperation = require('./utils').executeOperation;

/**
 * @fileOverview The **Collection** class is an internal class that embodies a MongoDB collection
 * allowing for insert/update/remove/find and other command operation on that MongoDB collection.
 *
 * **COLLECTION Cannot directly be instantiated**
 * @example
 * const MongoClient = require('mongodb').MongoClient;
 * const test = require('assert');
 * // Connection url
 * const url = 'mongodb://localhost:27017';
 * // Database Name
 * const dbName = 'test';
 * // Connect using MongoClient
 * MongoClient.connect(url, function(err, client) {
 *   // Create a collection we want to drop later
 *   const col = client.db(dbName).collection('createIndexExample1');
 *   // Show that duplicate records got dropped
 *   col.find({}).toArray(function(err, items) {
 *     test.equal(null, err);
 *     test.equal(4, items.length);
 *     client.close();
 *   });
 * });
 */

var mergeKeys = ['readPreference', 'ignoreUndefined'];

/**
 * Create a new Collection instance (INTERNAL TYPE, do not instantiate directly)
 * @class
 * @property {string} collectionName Get the collection name.
 * @property {string} namespace Get the full collection namespace.
 * @property {object} writeConcern The current write concern values.
 * @property {object} readConcern The current read concern values.
 * @property {object} hint Get current index hint for collection.
 * @return {Collection} a Collection instance.
 */
var Collection = function(db, topology, dbName, name, pkFactory, options) {
  checkCollectionName(name);

  // Unpack variables
  var internalHint = null;
  var slaveOk = options == null || options.slaveOk == null ? db.slaveOk : options.slaveOk;
  var serializeFunctions =
    options == null || options.serializeFunctions == null
      ? db.s.options.serializeFunctions
      : options.serializeFunctions;
  var raw = options == null || options.raw == null ? db.s.options.raw : options.raw;
  var promoteLongs =
    options == null || options.promoteLongs == null
      ? db.s.options.promoteLongs
      : options.promoteLongs;
  var promoteValues =
    options == null || options.promoteValues == null
      ? db.s.options.promoteValues
      : options.promoteValues;
  var promoteBuffers =
    options == null || options.promoteBuffers == null
      ? db.s.options.promoteBuffers
      : options.promoteBuffers;
  var readPreference = null;
  var collectionHint = null;
  var namespace = f('%s.%s', dbName, name);

  // Get the promiseLibrary
  var promiseLibrary = options.promiseLibrary || Promise;

  // Assign the right collection level readPreference
  if (options && options.readPreference) {
    readPreference = options.readPreference;
  } else if (db.options.readPreference) {
    readPreference = db.options.readPreference;
  }

  // Set custom primary key factory if provided
  pkFactory = pkFactory == null ? ObjectID : pkFactory;

  // Internal state
  this.s = {
    // Set custom primary key factory if provided
    pkFactory: pkFactory,
    // Db
    db: db,
    // Topology
    topology: topology,
    // dbName
    dbName: dbName,
    // Options
    options: options,
    // Namespace
    namespace: namespace,
    // Read preference
    readPreference: readPreference,
    // SlaveOK
    slaveOk: slaveOk,
    // Serialize functions
    serializeFunctions: serializeFunctions,
    // Raw
    raw: raw,
    // promoteLongs
    promoteLongs: promoteLongs,
    // promoteValues
    promoteValues: promoteValues,
    // promoteBuffers
    promoteBuffers: promoteBuffers,
    // internalHint
    internalHint: internalHint,
    // collectionHint
    collectionHint: collectionHint,
    // Name
    name: name,
    // Promise library
    promiseLibrary: promiseLibrary,
    // Read Concern
    readConcern: options.readConcern
  };
};

var define = (Collection.define = new Define('Collection', Collection, false));

Object.defineProperty(Collection.prototype, 'collectionName', {
  enumerable: true,
  get: function() {
    return this.s.name;
  }
});

Object.defineProperty(Collection.prototype, 'namespace', {
  enumerable: true,
  get: function() {
    return this.s.namespace;
  }
});

Object.defineProperty(Collection.prototype, 'readConcern', {
  enumerable: true,
  get: function() {
    return this.s.readConcern || { level: 'local' };
  }
});

Object.defineProperty(Collection.prototype, 'writeConcern', {
  enumerable: true,
  get: function() {
    var ops = {};
    if (this.s.options.w != null) ops.w = this.s.options.w;
    if (this.s.options.j != null) ops.j = this.s.options.j;
    if (this.s.options.fsync != null) ops.fsync = this.s.options.fsync;
    if (this.s.options.wtimeout != null) ops.wtimeout = this.s.options.wtimeout;
    return ops;
  }
});

/**
 * @ignore
 */
Object.defineProperty(Collection.prototype, 'hint', {
  enumerable: true,
  get: function() {
    return this.s.collectionHint;
  },
  set: function(v) {
    this.s.collectionHint = normalizeHintField(v);
  }
});

/**
 * Creates a cursor for a query that can be used to iterate over results from MongoDB
 * @method
 * @param {object} [query={}] The cursor query object.
 * @param {object} [options=null] Optional settings.
 * @param {number} [options.limit=0] Sets the limit of documents returned in the query.
 * @param {(array|object)} [options.sort=null] Set to sort the documents coming back from the query. Array of indexes, [['a', 1]] etc.
 * @param {object} [options.projection=null] The fields to return in the query. Object of fields to include or exclude (not both), {'a':1}
 * @param {object} [options.fields=null] **Deprecated** Use `options.projection` instead
 * @param {number} [options.skip=0] Set to skip N documents ahead in your query (useful for pagination).
 * @param {Object} [options.hint=null] Tell the query to use specific indexes in the query. Object of indexes to use, {'_id':1}
 * @param {boolean} [options.explain=false] Explain the query instead of returning the data.
 * @param {boolean} [options.snapshot=false] Snapshot query.
 * @param {boolean} [options.timeout=false] Specify if the cursor can timeout.
 * @param {boolean} [options.tailable=false] Specify if the cursor is tailable.
 * @param {number} [options.batchSize=0] Set the batchSize for the getMoreCommand when iterating over the query results.
 * @param {boolean} [options.returnKey=false] Only return the index key.
 * @param {number} [options.maxScan=null] Limit the number of items to scan.
 * @param {number} [options.min=null] Set index bounds.
 * @param {number} [options.max=null] Set index bounds.
 * @param {boolean} [options.showDiskLoc=false] Show disk location of results.
 * @param {string} [options.comment=null] You can put a $comment field on a query to make looking in the profiler logs simpler.
 * @param {boolean} [options.raw=false] Return document results as raw BSON buffers.
 * @param {boolean} [options.promoteLongs=true] Promotes Long values to number if they fit inside the 53 bits resolution.
 * @param {boolean} [options.promoteValues=true] Promotes BSON values to native types where possible, set to false to only receive wrapper types.
 * @param {boolean} [options.promoteBuffers=false] Promotes Binary BSON values to native Node Buffers.
 * @param {(ReadPreference|string)} [options.readPreference=null] The preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
 * @param {boolean} [options.partial=false] Specify if the cursor should return partial results when querying against a sharded system
 * @param {number} [options.maxTimeMS=null] Number of miliseconds to wait before aborting the query.
 * @param {object} [options.collation=null] Specify collation (MongoDB 3.4 or higher) settings for update operation (see 3.4 documentation for available fields).
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @throws {MongoError}
 * @return {Cursor}
 */
Collection.prototype.find = function(query, options, callback) {
  let selector = query;
  // figuring out arguments
  if (typeof callback !== 'function') {
    if (typeof options === 'function') {
      callback = options;
      options = undefined;
    } else if (options == null) {
      callback = typeof selector === 'function' ? selector : undefined;
      selector = typeof selector === 'object' ? selector : undefined;
    }
  }

  // Ensure selector is not null
  selector = selector == null ? {} : selector;
  // Validate correctness off the selector
  var object = selector;
  if (Buffer.isBuffer(object)) {
    var object_size = object[0] | (object[1] << 8) | (object[2] << 16) | (object[3] << 24);
    if (object_size !== object.length) {
      var error = new Error(
        'query selector raw message size does not match message header size [' +
          object.length +
          '] != [' +
          object_size +
          ']'
      );
      error.name = 'MongoError';
      throw error;
    }
  }

  // Check special case where we are using an objectId
  if (selector != null && selector._bsontype === 'ObjectID') {
    selector = { _id: selector };
  }

  if (!options) options = {};

  let projection = options.projection || options.fields;

  if (projection && !Buffer.isBuffer(projection) && Array.isArray(projection)) {
    projection = projection.length
      ? projection.reduce((result, field) => {
          result[field] = 1;
          return result;
        }, {})
      : { _id: 1 };
  }

  var newOptions = {};

  // Make a shallow copy of the collection options
  for (var key in this.s.options) {
    if (mergeKeys.indexOf(key) !== -1) {
      newOptions[key] = this.s.options[key];
    }
  }

  // Make a shallow copy of options
  for (var optKey in options) {
    newOptions[optKey] = options[optKey];
  }

  // Unpack options
  newOptions.skip = options.skip ? options.skip : 0;
  newOptions.limit = options.limit ? options.limit : 0;
  newOptions.raw = typeof options.raw === 'boolean' ? options.raw : this.s.raw;
  newOptions.hint = options.hint != null ? normalizeHintField(options.hint) : this.s.collectionHint;
  newOptions.timeout = typeof options.timeout === 'undefined' ? undefined : options.timeout;
  // // If we have overridden slaveOk otherwise use the default db setting
  newOptions.slaveOk = options.slaveOk != null ? options.slaveOk : this.s.db.slaveOk;

  // Add read preference if needed
  newOptions = getReadPreference(this, newOptions, this.s.db);

  // Set slave ok to true if read preference different from primary
  if (
    newOptions.readPreference != null &&
    (newOptions.readPreference !== 'primary' || newOptions.readPreference.mode !== 'primary')
  ) {
    newOptions.slaveOk = true;
  }

  // Ensure the query is an object
  if (selector != null && typeof selector !== 'object') {
    throw MongoError.create({ message: 'query selector must be an object', driver: true });
  }

  // Build the find command
  var findCommand = {
    find: this.s.namespace,
    limit: newOptions.limit,
    skip: newOptions.skip,
    query: selector
  };

  // Ensure we use the right await data option
  if (typeof newOptions.awaitdata === 'boolean') {
    newOptions.awaitData = newOptions.awaitdata;
  }

  // Translate to new command option noCursorTimeout
  if (typeof newOptions.timeout === 'boolean') newOptions.noCursorTimeout = newOptions.timeout;

  // Merge in options to command
  for (var name in newOptions) {
    if (newOptions[name] != null && name !== 'session') {
      findCommand[name] = newOptions[name];
    }
  }

  if (projection) findCommand.fields = projection;

  // Add db object to the new options
  newOptions.db = this.s.db;

  // Add the promise library
  newOptions.promiseLibrary = this.s.promiseLibrary;

  // Set raw if available at collection level
  if (newOptions.raw == null && typeof this.s.raw === 'boolean') newOptions.raw = this.s.raw;
  // Set promoteLongs if available at collection level
  if (newOptions.promoteLongs == null && typeof this.s.promoteLongs === 'boolean')
    newOptions.promoteLongs = this.s.promoteLongs;
  if (newOptions.promoteValues == null && typeof this.s.promoteValues === 'boolean')
    newOptions.promoteValues = this.s.promoteValues;
  if (newOptions.promoteBuffers == null && typeof this.s.promoteBuffers === 'boolean')
    newOptions.promoteBuffers = this.s.promoteBuffers;

  // Sort options
  if (findCommand.sort) {
    findCommand.sort = formattedOrderClause(findCommand.sort);
  }

  // Set the readConcern
  decorateWithReadConcern(findCommand, this, options);

  // Decorate find command with collation options
  decorateWithCollation(findCommand, this, options);

  // Create the cursor
  if (typeof callback === 'function')
    return handleCallback(
      callback,
      null,
      this.s.topology.cursor(this.s.namespace, findCommand, newOptions)
    );
  return this.s.topology.cursor(this.s.namespace, findCommand, newOptions);
};

define.classMethod('find', { callback: false, promise: false, returns: [Cursor] });

/**
 * Inserts a single document into MongoDB. If documents passed in do not contain the **_id** field,
 * one will be added to each of the documents missing it by the driver, mutating the document. This behavior
 * can be overridden by setting the **forceServerObjectId** flag.
 *
 * @method
 * @param {object} doc Document to insert.
 * @param {object} [options=null] Optional settings.
 * @param {(number|string)} [options.w=null] The write concern.
 * @param {number} [options.wtimeout=null] The write concern timeout.
 * @param {boolean} [options.j=false] Specify a journal write concern.
 * @param {boolean} [options.serializeFunctions=false] Serialize functions on any object.
 * @param {boolean} [options.forceServerObjectId=false] Force server to assign _id values instead of driver.
 * @param {boolean} [options.bypassDocumentValidation=false] Allow driver to bypass schema validation in MongoDB 3.2 or higher.
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Collection~insertOneWriteOpCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 */
Collection.prototype.insertOne = function(doc, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = options || {};

  // Add ignoreUndfined
  if (this.s.options.ignoreUndefined) {
    options = shallowClone(options);
    options.ignoreUndefined = this.s.options.ignoreUndefined;
  }

  return executeOperation(this.s.topology, insertOne, [this, doc, options, callback]);
};

var insertOne = function(self, doc, options, callback) {
  if (Array.isArray(doc)) {
    return callback(
      MongoError.create({ message: 'doc parameter must be an object', driver: true })
    );
  }

  insertDocuments(self, [doc], options, function(err, r) {
    if (callback == null) return;
    if (err && callback) return callback(err);
    // Workaround for pre 2.6 servers
    if (r == null) return callback(null, { result: { ok: 1 } });
    // Add values to top level to ensure crud spec compatibility
    r.insertedCount = r.result.n;
    r.insertedId = doc._id;
    if (callback) callback(null, r);
  });
};

var mapInserManyResults = function(docs, r) {
  var finalResult = {
    result: { ok: 1, n: r.insertedCount },
    ops: docs,
    insertedCount: r.insertedCount,
    insertedIds: r.insertedIds
  };

  if (r.getLastOp()) {
    finalResult.result.opTime = r.getLastOp();
  }

  return finalResult;
};

define.classMethod('insertOne', { callback: true, promise: true });

/**
 * Inserts an array of documents into MongoDB. If documents passed in do not contain the **_id** field,
 * one will be added to each of the documents missing it by the driver, mutating the document. This behavior
 * can be overridden by setting the **forceServerObjectId** flag.
 *
 * @method
 * @param {object[]} docs Documents to insert.
 * @param {object} [options=null] Optional settings.
 * @param {(number|string)} [options.w=null] The write concern.
 * @param {number} [options.wtimeout=null] The write concern timeout.
 * @param {boolean} [options.j=false] Specify a journal write concern.
 * @param {boolean} [options.serializeFunctions=false] Serialize functions on any object.
 * @param {boolean} [options.forceServerObjectId=false] Force server to assign _id values instead of driver.
 * @param {boolean} [options.bypassDocumentValidation=false] Allow driver to bypass schema validation in MongoDB 3.2 or higher.
 * @param {boolean} [options.ordered=true] If true, when an insert fails, don't execute the remaining writes. If false, continue with remaining inserts when one fails.
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Collection~insertWriteOpCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 */
Collection.prototype.insertMany = function(docs, options, callback) {
  var self = this;
  if (typeof options === 'function') (callback = options), (options = {});
  options = options ? shallowClone(options) : { ordered: true };
  if (!Array.isArray(docs) && typeof callback === 'function') {
    return callback(
      MongoError.create({ message: 'docs parameter must be an array of documents', driver: true })
    );
  } else if (!Array.isArray(docs)) {
    return new this.s.promiseLibrary(function(resolve, reject) {
      reject(
        MongoError.create({ message: 'docs parameter must be an array of documents', driver: true })
      );
    });
  }

  // If keep going set unordered
  options['serializeFunctions'] = options['serializeFunctions'] || self.s.serializeFunctions;

  // Set up the force server object id
  var forceServerObjectId =
    typeof options.forceServerObjectId === 'boolean'
      ? options.forceServerObjectId
      : self.s.db.options.forceServerObjectId;

  // Do we want to force the server to assign the _id key
  if (forceServerObjectId !== true) {
    // Add _id if not specified
    for (var i = 0; i < docs.length; i++) {
      if (docs[i]._id == null) docs[i]._id = self.s.pkFactory.createPk();
    }
  }

  // Generate the bulk write operations
  var operations = [
    {
      insertMany: docs
    }
  ];

  return executeOperation(this.s.topology, bulkWrite, [this, operations, options, callback], {
    resultMutator: result => mapInserManyResults(docs, result)
  });
};

define.classMethod('insertMany', { callback: true, promise: true });

/**
 * @typedef {Object} Collection~BulkWriteOpResult
 * @property {number} insertedCount Number of documents inserted.
 * @property {number} matchedCount Number of documents matched for update.
 * @property {number} modifiedCount Number of documents modified.
 * @property {number} deletedCount Number of documents deleted.
 * @property {number} upsertedCount Number of documents upserted.
 * @property {object} insertedIds Inserted document generated Id's, hash key is the index of the originating operation
 * @property {object} upsertedIds Upserted document generated Id's, hash key is the index of the originating operation
 * @property {object} result The command result object.
 */

/**
 * The callback format for inserts
 * @callback Collection~bulkWriteOpCallback
 * @param {BulkWriteError} error An error instance representing the error during the execution.
 * @param {Collection~BulkWriteOpResult} result The result object if the command was executed successfully.
 */

/**
 * Perform a bulkWrite operation without a fluent API
 *
 * Legal operation types are
 *
 *  { insertOne: { document: { a: 1 } } }
 *
 *  { updateOne: { filter: {a:2}, update: {$set: {a:2}}, upsert:true } }
 *
 *  { updateMany: { filter: {a:2}, update: {$set: {a:2}}, upsert:true } }
 *
 *  { deleteOne: { filter: {c:1} } }
 *
 *  { deleteMany: { filter: {c:1} } }
 *
 *  { replaceOne: { filter: {c:3}, replacement: {c:4}, upsert:true}}
 *
 * If documents passed in do not contain the **_id** field,
 * one will be added to each of the documents missing it by the driver, mutating the document. This behavior
 * can be overridden by setting the **forceServerObjectId** flag.
 *
 * @method
 * @param {object[]} operations Bulk operations to perform.
 * @param {object} [options=null] Optional settings.
 * @param {(number|string)} [options.w=null] The write concern.
 * @param {number} [options.wtimeout=null] The write concern timeout.
 * @param {boolean} [options.j=false] Specify a journal write concern.
 * @param {boolean} [options.serializeFunctions=false] Serialize functions on any object.
 * @param {boolean} [options.ordered=true] Execute write operation in ordered or unordered fashion.
 * @param {boolean} [options.bypassDocumentValidation=false] Allow driver to bypass schema validation in MongoDB 3.2 or higher.
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Collection~bulkWriteOpCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 */
Collection.prototype.bulkWrite = function(operations, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = options || { ordered: true };

  if (!Array.isArray(operations)) {
    throw MongoError.create({ message: 'operations must be an array of documents', driver: true });
  }

  return executeOperation(this.s.topology, bulkWrite, [this, operations, options, callback]);
};

var bulkWrite = function(self, operations, options, callback) {
  // Add ignoreUndfined
  if (self.s.options.ignoreUndefined) {
    options = shallowClone(options);
    options.ignoreUndefined = self.s.options.ignoreUndefined;
  }

  // Create the bulk operation
  var bulk =
    options.ordered === true || options.ordered == null
      ? self.initializeOrderedBulkOp(options)
      : self.initializeUnorderedBulkOp(options);

  // Do we have a collation
  var collation = false;

  // for each op go through and add to the bulk
  try {
    for (var i = 0; i < operations.length; i++) {
      // Get the operation type
      var key = Object.keys(operations[i])[0];
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
  var finalOptions = writeConcern(shallowClone(options), self.s.db, self, options);
  var writeCon = finalOptions.writeConcern ? finalOptions.writeConcern : {};
  var capabilities = self.s.topology.capabilities();

  // Did the user pass in a collation, check if our write server supports it
  if (collation && capabilities && !capabilities.commandsTakeCollation) {
    return callback(new MongoError(f('server/primary/mongos does not support collation')));
  }

  // Execute the bulk
  bulk.execute(writeCon, finalOptions, function(err, r) {
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
    var inserted = r.getInsertedIds();
    // Map inserted ids
    for (var i = 0; i < inserted.length; i++) {
      r.insertedIds[inserted[i].index] = inserted[i]._id;
    }

    // Upserted documents
    var upserted = r.getUpsertedIds();
    // Map upserted ids
    for (i = 0; i < upserted.length; i++) {
      r.upsertedIds[upserted[i].index] = upserted[i]._id;
    }

    // Return the results
    callback(null, r);
  });
};

var insertDocuments = function(self, docs, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = options || {};
  // Ensure we are operating on an array op docs
  docs = Array.isArray(docs) ? docs : [docs];

  // Get the write concern options
  var finalOptions = writeConcern(shallowClone(options), self.s.db, self, options);

  // If keep going set unordered
  if (finalOptions.keepGoing === true) finalOptions.ordered = false;
  finalOptions['serializeFunctions'] = options['serializeFunctions'] || self.s.serializeFunctions;

  // Set up the force server object id
  var forceServerObjectId =
    typeof options.forceServerObjectId === 'boolean'
      ? options.forceServerObjectId
      : self.s.db.options.forceServerObjectId;

  // Add _id if not specified
  if (forceServerObjectId !== true) {
    for (var i = 0; i < docs.length; i++) {
      if (docs[i]._id === void 0) docs[i]._id = self.s.pkFactory.createPk();
    }
  }

  // File inserts
  self.s.topology.insert(self.s.namespace, docs, finalOptions, function(err, result) {
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
};

define.classMethod('bulkWrite', { callback: true, promise: true });

/**
 * @typedef {Object} Collection~WriteOpResult
 * @property {object[]} ops All the documents inserted using insertOne/insertMany/replaceOne. Documents contain the _id field if forceServerObjectId == false for insertOne/insertMany
 * @property {object} connection The connection object used for the operation.
 * @property {object} result The command result object.
 */

/**
 * The callback format for inserts
 * @callback Collection~writeOpCallback
 * @param {MongoError} error An error instance representing the error during the execution.
 * @param {Collection~WriteOpResult} result The result object if the command was executed successfully.
 */

/**
 * @typedef {Object} Collection~insertWriteOpResult
 * @property {Number} insertedCount The total amount of documents inserted.
 * @property {object[]} ops All the documents inserted using insertOne/insertMany/replaceOne. Documents contain the _id field if forceServerObjectId == false for insertOne/insertMany
 * @property {Object.<Number, ObjectId>} insertedIds Map of the index of the inserted document to the id of the inserted document.
 * @property {object} connection The connection object used for the operation.
 * @property {object} result The raw command result object returned from MongoDB (content might vary by server version).
 * @property {Number} result.ok Is 1 if the command executed correctly.
 * @property {Number} result.n The total count of documents inserted.
 */

/**
 * @typedef {Object} Collection~insertOneWriteOpResult
 * @property {Number} insertedCount The total amount of documents inserted.
 * @property {object[]} ops All the documents inserted using insertOne/insertMany/replaceOne. Documents contain the _id field if forceServerObjectId == false for insertOne/insertMany
 * @property {ObjectId} insertedId The driver generated ObjectId for the insert operation.
 * @property {object} connection The connection object used for the operation.
 * @property {object} result The raw command result object returned from MongoDB (content might vary by server version).
 * @property {Number} result.ok Is 1 if the command executed correctly.
 * @property {Number} result.n The total count of documents inserted.
 */

/**
 * The callback format for inserts
 * @callback Collection~insertWriteOpCallback
 * @param {MongoError} error An error instance representing the error during the execution.
 * @param {Collection~insertWriteOpResult} result The result object if the command was executed successfully.
 */

/**
 * The callback format for inserts
 * @callback Collection~insertOneWriteOpCallback
 * @param {MongoError} error An error instance representing the error during the execution.
 * @param {Collection~insertOneWriteOpResult} result The result object if the command was executed successfully.
 */

/**
 * Inserts a single document or a an array of documents into MongoDB. If documents passed in do not contain the **_id** field,
 * one will be added to each of the documents missing it by the driver, mutating the document. This behavior
 * can be overridden by setting the **forceServerObjectId** flag.
 *
 * @method
 * @param {(object|object[])} docs Documents to insert.
 * @param {object} [options=null] Optional settings.
 * @param {(number|string)} [options.w=null] The write concern.
 * @param {number} [options.wtimeout=null] The write concern timeout.
 * @param {boolean} [options.j=false] Specify a journal write concern.
 * @param {boolean} [options.serializeFunctions=false] Serialize functions on any object.
 * @param {boolean} [options.forceServerObjectId=false] Force server to assign _id values instead of driver.
 * @param {boolean} [options.bypassDocumentValidation=false] Allow driver to bypass schema validation in MongoDB 3.2 or higher.
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Collection~insertWriteOpCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 * @deprecated Use insertOne, insertMany or bulkWrite
 */
Collection.prototype.insert = function(docs, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = options || { ordered: false };
  docs = !Array.isArray(docs) ? [docs] : docs;

  if (options.keepGoing === true) {
    options.ordered = false;
  }

  return this.insertMany(docs, options, callback);
};

define.classMethod('insert', { callback: true, promise: true });

/**
 * @typedef {Object} Collection~updateWriteOpResult
 * @property {Object} result The raw result returned from MongoDB, field will vary depending on server version.
 * @property {Number} result.ok Is 1 if the command executed correctly.
 * @property {Number} result.n The total count of documents scanned.
 * @property {Number} result.nModified The total count of documents modified.
 * @property {Object} connection The connection object used for the operation.
 * @property {Number} matchedCount The number of documents that matched the filter.
 * @property {Number} modifiedCount The number of documents that were modified.
 * @property {Number} upsertedCount The number of documents upserted.
 * @property {Object} upsertedId The upserted id.
 * @property {ObjectId} upsertedId._id The upserted _id returned from the server.
 */

/**
 * The callback format for inserts
 * @callback Collection~updateWriteOpCallback
 * @param {MongoError} error An error instance representing the error during the execution.
 * @param {Collection~updateWriteOpResult} result The result object if the command was executed successfully.
 */

/**
 * Update a single document on MongoDB
 * @method
 * @param {object} filter The Filter used to select the document to update
 * @param {object} update The update operations to be applied to the document
 * @param {object} [options=null] Optional settings.
 * @param {boolean} [options.upsert=false] Update operation is an upsert.
 * @param {(number|string)} [options.w=null] The write concern.
 * @param {number} [options.wtimeout=null] The write concern timeout.
 * @param {boolean} [options.j=false] Specify a journal write concern.
 * @param {boolean} [options.bypassDocumentValidation=false] Allow driver to bypass schema validation in MongoDB 3.2 or higher.
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Collection~updateWriteOpCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 */
Collection.prototype.updateOne = function(filter, update, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = options || {};

  var err = checkForAtomicOperators(update);
  if (err) {
    if (typeof callback === 'function') return callback(err);
    return this.s.promiseLibrary.reject(err);
  }

  options = shallowClone(options);

  // Add ignoreUndfined
  if (this.s.options.ignoreUndefined) {
    options = shallowClone(options);
    options.ignoreUndefined = this.s.options.ignoreUndefined;
  }

  return executeOperation(this.s.topology, updateOne, [this, filter, update, options, callback]);
};

var checkForAtomicOperators = function(update) {
  var keys = Object.keys(update);

  // same errors as the server would give for update doc lacking atomic operators
  if (keys.length === 0) {
    return toError('The update operation document must contain at least one atomic operator.');
  }

  if (keys[0][0] !== '$') {
    return toError('the update operation document must contain atomic operators.');
  }
};

var updateOne = function(self, filter, update, options, callback) {
  // Set single document update
  options.multi = false;
  // Execute update
  updateDocuments(self, filter, update, options, function(err, r) {
    if (callback == null) return;
    if (err && callback) return callback(err);
    if (r == null) return callback(null, { result: { ok: 1 } });
    r.modifiedCount = r.result.nModified != null ? r.result.nModified : r.result.n;
    r.upsertedId =
      Array.isArray(r.result.upserted) && r.result.upserted.length > 0
        ? r.result.upserted[0]
        : null;
    r.upsertedCount =
      Array.isArray(r.result.upserted) && r.result.upserted.length ? r.result.upserted.length : 0;
    r.matchedCount =
      Array.isArray(r.result.upserted) && r.result.upserted.length > 0 ? 0 : r.result.n;
    if (callback) callback(null, r);
  });
};

define.classMethod('updateOne', { callback: true, promise: true });

/**
 * Replace a document on MongoDB
 * @method
 * @param {object} filter The Filter used to select the document to update
 * @param {object} doc The Document that replaces the matching document
 * @param {object} [options=null] Optional settings.
 * @param {boolean} [options.upsert=false] Update operation is an upsert.
 * @param {(number|string)} [options.w=null] The write concern.
 * @param {number} [options.wtimeout=null] The write concern timeout.
 * @param {boolean} [options.j=false] Specify a journal write concern.
 * @param {boolean} [options.bypassDocumentValidation=false] Allow driver to bypass schema validation in MongoDB 3.2 or higher.
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Collection~updateWriteOpCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 */
Collection.prototype.replaceOne = function(filter, doc, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = shallowClone(options);

  // Add ignoreUndfined
  if (this.s.options.ignoreUndefined) {
    options = shallowClone(options);
    options.ignoreUndefined = this.s.options.ignoreUndefined;
  }

  return executeOperation(this.s.topology, replaceOne, [this, filter, doc, options, callback]);
};

var replaceOne = function(self, filter, doc, options, callback) {
  // Set single document update
  options.multi = false;

  // Execute update
  updateDocuments(self, filter, doc, options, function(err, r) {
    if (callback == null) return;
    if (err && callback) return callback(err);
    if (r == null) return callback(null, { result: { ok: 1 } });

    r.modifiedCount = r.result.nModified != null ? r.result.nModified : r.result.n;
    r.upsertedId =
      Array.isArray(r.result.upserted) && r.result.upserted.length > 0
        ? r.result.upserted[0]
        : null;
    r.upsertedCount =
      Array.isArray(r.result.upserted) && r.result.upserted.length ? r.result.upserted.length : 0;
    r.matchedCount =
      Array.isArray(r.result.upserted) && r.result.upserted.length > 0 ? 0 : r.result.n;
    r.ops = [doc];
    if (callback) callback(null, r);
  });
};

define.classMethod('replaceOne', { callback: true, promise: true });

/**
 * Update multiple documents on MongoDB
 * @method
 * @param {object} filter The Filter used to select the document to update
 * @param {object} update The update operations to be applied to the document
 * @param {object} [options=null] Optional settings.
 * @param {boolean} [options.upsert=false] Update operation is an upsert.
 * @param {(number|string)} [options.w=null] The write concern.
 * @param {number} [options.wtimeout=null] The write concern timeout.
 * @param {boolean} [options.j=false] Specify a journal write concern.
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Collection~updateWriteOpCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 */
Collection.prototype.updateMany = function(filter, update, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = options || {};

  var err = checkForAtomicOperators(update);
  if (err) {
    if (typeof callback === 'function') return callback(err);
    return this.s.promiseLibrary.reject(err);
  }

  options = shallowClone(options);

  // Add ignoreUndfined
  if (this.s.options.ignoreUndefined) {
    options = shallowClone(options);
    options.ignoreUndefined = this.s.options.ignoreUndefined;
  }

  return executeOperation(this.s.topology, updateMany, [this, filter, update, options, callback]);
};

var updateMany = function(self, filter, update, options, callback) {
  // Set single document update
  options.multi = true;
  // Execute update
  updateDocuments(self, filter, update, options, function(err, r) {
    if (callback == null) return;
    if (err && callback) return callback(err);
    if (r == null) return callback(null, { result: { ok: 1 } });
    r.modifiedCount = r.result.nModified != null ? r.result.nModified : r.result.n;
    r.upsertedId =
      Array.isArray(r.result.upserted) && r.result.upserted.length > 0
        ? r.result.upserted[0]
        : null;
    r.upsertedCount =
      Array.isArray(r.result.upserted) && r.result.upserted.length ? r.result.upserted.length : 0;
    r.matchedCount =
      Array.isArray(r.result.upserted) && r.result.upserted.length > 0 ? 0 : r.result.n;
    if (callback) callback(null, r);
  });
};

define.classMethod('updateMany', { callback: true, promise: true });

var updateDocuments = function(self, selector, document, options, callback) {
  if ('function' === typeof options) (callback = options), (options = null);
  if (options == null) options = {};
  if (!('function' === typeof callback)) callback = null;

  // If we are not providing a selector or document throw
  if (selector == null || typeof selector !== 'object')
    return callback(toError('selector must be a valid JavaScript object'));
  if (document == null || typeof document !== 'object')
    return callback(toError('document must be a valid JavaScript object'));

  // Get the write concern options
  var finalOptions = writeConcern(shallowClone(options), self.s.db, self, options);

  // Do we return the actual result document
  // Either use override on the function, or go back to default on either the collection
  // level or db
  finalOptions['serializeFunctions'] = options['serializeFunctions'] || self.s.serializeFunctions;

  // Execute the operation
  var op = { q: selector, u: document };
  op.upsert = options.upsert !== void 0 ? !!options.upsert : false;
  op.multi = options.multi !== void 0 ? !!options.multi : false;

  if (finalOptions.arrayFilters) {
    op.arrayFilters = finalOptions.arrayFilters;
    delete finalOptions.arrayFilters;
  }

  // Have we specified collation
  decorateWithCollation(finalOptions, self, options);

  // Update options
  self.s.topology.update(self.s.namespace, [op], finalOptions, function(err, result) {
    if (callback == null) return;
    if (err) return handleCallback(callback, err, null);
    if (result == null) return handleCallback(callback, null, null);
    if (result.result.code) return handleCallback(callback, toError(result.result));
    if (result.result.writeErrors)
      return handleCallback(callback, toError(result.result.writeErrors[0]));
    // Return the results
    handleCallback(callback, null, result);
  });
};

/**
 * Updates documents.
 * @method
 * @param {object} selector The selector for the update operation.
 * @param {object} document The update document.
 * @param {object} [options=null] Optional settings.
 * @param {(number|string)} [options.w=null] The write concern.
 * @param {number} [options.wtimeout=null] The write concern timeout.
 * @param {boolean} [options.j=false] Specify a journal write concern.
 * @param {boolean} [options.upsert=false] Update operation is an upsert.
 * @param {boolean} [options.multi=false] Update one/all documents with operation.
 * @param {boolean} [options.bypassDocumentValidation=false] Allow driver to bypass schema validation in MongoDB 3.2 or higher.
 * @param {object} [options.collation=null] Specify collation (MongoDB 3.4 or higher) settings for update operation (see 3.4 documentation for available fields).
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Collection~writeOpCallback} [callback] The command result callback
 * @throws {MongoError}
 * @return {Promise} returns Promise if no callback passed
 * @deprecated use updateOne, updateMany or bulkWrite
 */
Collection.prototype.update = function(selector, document, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = options || {};

  // Add ignoreUndfined
  if (this.s.options.ignoreUndefined) {
    options = shallowClone(options);
    options.ignoreUndefined = this.s.options.ignoreUndefined;
  }

  return executeOperation(this.s.topology, updateDocuments, [
    this,
    selector,
    document,
    options,
    callback
  ]);
};

define.classMethod('update', { callback: true, promise: true });

/**
 * @typedef {Object} Collection~deleteWriteOpResult
 * @property {Object} result The raw result returned from MongoDB, field will vary depending on server version.
 * @property {Number} result.ok Is 1 if the command executed correctly.
 * @property {Number} result.n The total count of documents deleted.
 * @property {Object} connection The connection object used for the operation.
 * @property {Number} deletedCount The number of documents deleted.
 */

/**
 * The callback format for inserts
 * @callback Collection~deleteWriteOpCallback
 * @param {MongoError} error An error instance representing the error during the execution.
 * @param {Collection~deleteWriteOpResult} result The result object if the command was executed successfully.
 */

/**
 * Delete a document on MongoDB
 * @method
 * @param {object} filter The Filter used to select the document to remove
 * @param {object} [options=null] Optional settings.
 * @param {(number|string)} [options.w=null] The write concern.
 * @param {number} [options.wtimeout=null] The write concern timeout.
 * @param {boolean} [options.j=false] Specify a journal write concern.
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Collection~deleteWriteOpCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 */
Collection.prototype.deleteOne = function(filter, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = shallowClone(options);

  // Add ignoreUndfined
  if (this.s.options.ignoreUndefined) {
    options = shallowClone(options);
    options.ignoreUndefined = this.s.options.ignoreUndefined;
  }

  return executeOperation(this.s.topology, deleteOne, [this, filter, options, callback]);
};

var deleteOne = function(self, filter, options, callback) {
  options.single = true;
  removeDocuments(self, filter, options, function(err, r) {
    if (callback == null) return;
    if (err && callback) return callback(err);
    if (r == null) return callback(null, { result: { ok: 1 } });
    r.deletedCount = r.result.n;
    if (callback) callback(null, r);
  });
};

define.classMethod('deleteOne', { callback: true, promise: true });

Collection.prototype.removeOne = Collection.prototype.deleteOne;

define.classMethod('removeOne', { callback: true, promise: true });

/**
 * Delete multiple documents on MongoDB
 * @method
 * @param {object} filter The Filter used to select the documents to remove
 * @param {object} [options=null] Optional settings.
 * @param {(number|string)} [options.w=null] The write concern.
 * @param {number} [options.wtimeout=null] The write concern timeout.
 * @param {boolean} [options.j=false] Specify a journal write concern.
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Collection~deleteWriteOpCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 */
Collection.prototype.deleteMany = function(filter, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = shallowClone(options);

  // Add ignoreUndfined
  if (this.s.options.ignoreUndefined) {
    options = shallowClone(options);
    options.ignoreUndefined = this.s.options.ignoreUndefined;
  }

  return executeOperation(this.s.topology, deleteMany, [this, filter, options, callback]);
};

var deleteMany = function(self, filter, options, callback) {
  options.single = false;

  removeDocuments(self, filter, options, function(err, r) {
    if (callback == null) return;
    if (err && callback) return callback(err);
    if (r == null) return callback(null, { result: { ok: 1 } });
    r.deletedCount = r.result.n;
    if (callback) callback(null, r);
  });
};

var removeDocuments = function(self, selector, options, callback) {
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
  var finalOptions = writeConcern(shallowClone(options), self.s.db, self, options);

  // If selector is null set empty
  if (selector == null) selector = {};

  // Build the op
  var op = { q: selector, limit: 0 };
  if (options.single) op.limit = 1;

  // Have we specified collation
  decorateWithCollation(finalOptions, self, options);

  // Execute the remove
  self.s.topology.remove(self.s.namespace, [op], finalOptions, function(err, result) {
    if (callback == null) return;
    if (err) return handleCallback(callback, err, null);
    if (result == null) return handleCallback(callback, null, null);
    if (result.result.code) return handleCallback(callback, toError(result.result));
    if (result.result.writeErrors)
      return handleCallback(callback, toError(result.result.writeErrors[0]));
    // Return the results
    handleCallback(callback, null, result);
  });
};

define.classMethod('deleteMany', { callback: true, promise: true });

Collection.prototype.removeMany = Collection.prototype.deleteMany;

define.classMethod('removeMany', { callback: true, promise: true });

/**
 * Remove documents.
 * @method
 * @param {object} selector The selector for the update operation.
 * @param {object} [options=null] Optional settings.
 * @param {(number|string)} [options.w=null] The write concern.
 * @param {number} [options.wtimeout=null] The write concern timeout.
 * @param {boolean} [options.j=false] Specify a journal write concern.
 * @param {boolean} [options.single=false] Removes the first document found.
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Collection~writeOpCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 * @deprecated use deleteOne, deleteMany or bulkWrite
 */
Collection.prototype.remove = function(selector, options, callback) {
  // Add ignoreUndfined
  if (this.s.options.ignoreUndefined) {
    options = shallowClone(options);
    options.ignoreUndefined = this.s.options.ignoreUndefined;
  }

  return executeOperation(this.s.topology, removeDocuments, [this, selector, options, callback]);
};

define.classMethod('remove', { callback: true, promise: true });

/**
 * Save a document. Simple full document replacement function. Not recommended for efficiency, use atomic
 * operators and update instead for more efficient operations.
 * @method
 * @param {object} doc Document to save
 * @param {object} [options=null] Optional settings.
 * @param {(number|string)} [options.w=null] The write concern.
 * @param {number} [options.wtimeout=null] The write concern timeout.
 * @param {boolean} [options.j=false] Specify a journal write concern.
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Collection~writeOpCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 * @deprecated use insertOne, insertMany, updateOne or updateMany
 */
Collection.prototype.save = function(doc, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = options || {};

  // Add ignoreUndfined
  if (this.s.options.ignoreUndefined) {
    options = shallowClone(options);
    options.ignoreUndefined = this.s.options.ignoreUndefined;
  }

  return executeOperation(this.s.topology, save, [this, doc, options, callback]);
};

var save = function(self, doc, options, callback) {
  // Get the write concern options
  var finalOptions = writeConcern(shallowClone(options), self.s.db, self, options);
  // Establish if we need to perform an insert or update
  if (doc._id != null) {
    finalOptions.upsert = true;
    return updateDocuments(self, { _id: doc._id }, doc, finalOptions, callback);
  }

  // Insert the document
  insertDocuments(self, [doc], finalOptions, function(err, r) {
    if (callback == null) return;
    if (doc == null) return handleCallback(callback, null, null);
    if (err) return handleCallback(callback, err, null);
    handleCallback(callback, null, r);
  });
};

define.classMethod('save', { callback: true, promise: true });

/**
 * The callback format for results
 * @callback Collection~resultCallback
 * @param {MongoError} error An error instance representing the error during the execution.
 * @param {object} result The result object if the command was executed successfully.
 */

/**
 * Fetches the first document that matches the query
 * @method
 * @param {object} query Query for find Operation
 * @param {object} [options=null] Optional settings.
 * @param {number} [options.limit=0] Sets the limit of documents returned in the query.
 * @param {(array|object)} [options.sort=null] Set to sort the documents coming back from the query. Array of indexes, [['a', 1]] etc.
 * @param {object} [options.projection=null] The fields to return in the query. Object of fields to include or exclude (not both), {'a':1}
 * @param {object} [options.fields=null] **Deprecated** Use `options.projection` instead
 * @param {number} [options.skip=0] Set to skip N documents ahead in your query (useful for pagination).
 * @param {Object} [options.hint=null] Tell the query to use specific indexes in the query. Object of indexes to use, {'_id':1}
 * @param {boolean} [options.explain=false] Explain the query instead of returning the data.
 * @param {boolean} [options.snapshot=false] Snapshot query.
 * @param {boolean} [options.timeout=false] Specify if the cursor can timeout.
 * @param {boolean} [options.tailable=false] Specify if the cursor is tailable.
 * @param {number} [options.batchSize=0] Set the batchSize for the getMoreCommand when iterating over the query results.
 * @param {boolean} [options.returnKey=false] Only return the index key.
 * @param {number} [options.maxScan=null] Limit the number of items to scan.
 * @param {number} [options.min=null] Set index bounds.
 * @param {number} [options.max=null] Set index bounds.
 * @param {boolean} [options.showDiskLoc=false] Show disk location of results.
 * @param {string} [options.comment=null] You can put a $comment field on a query to make looking in the profiler logs simpler.
 * @param {boolean} [options.raw=false] Return document results as raw BSON buffers.
 * @param {boolean} [options.promoteLongs=true] Promotes Long values to number if they fit inside the 53 bits resolution.
 * @param {boolean} [options.promoteValues=true] Promotes BSON values to native types where possible, set to false to only receive wrapper types.
 * @param {boolean} [options.promoteBuffers=false] Promotes Binary BSON values to native Node Buffers.
 * @param {(ReadPreference|string)} [options.readPreference=null] The preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
 * @param {boolean} [options.partial=false] Specify if the cursor should return partial results when querying against a sharded system
 * @param {number} [options.maxTimeMS=null] Number of miliseconds to wait before aborting the query.
 * @param {object} [options.collation=null] Specify collation (MongoDB 3.4 or higher) settings for update operation (see 3.4 documentation for available fields).
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Collection~resultCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 */
Collection.prototype.findOne = function(query, options, callback) {
  if (typeof query === 'function') (callback = query), (query = {}), (options = {});
  if (typeof options === 'function') (callback = options), (options = {});
  query = query || {};
  options = options || {};

  return executeOperation(this.s.topology, findOne, [this, query, options, callback]);
};

var findOne = function(self, query, options, callback) {
  const cursor = self
    .find(query, options)
    .limit(-1)
    .batchSize(1);

  // Return the item
  cursor.next(function(err, item) {
    if (err != null) return handleCallback(callback, toError(err), null);
    handleCallback(callback, null, item);
  });
};

define.classMethod('findOne', { callback: true, promise: true });

/**
 * The callback format for the collection method, must be used if strict is specified
 * @callback Collection~collectionResultCallback
 * @param {MongoError} error An error instance representing the error during the execution.
 * @param {Collection} collection The collection instance.
 */

/**
 * Rename the collection.
 *
 * @method
 * @param {string} newName New name of of the collection.
 * @param {object} [options=null] Optional settings.
 * @param {boolean} [options.dropTarget=false] Drop the target name collection if it previously exists.
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Collection~collectionResultCallback} [callback] The results callback
 * @return {Promise} returns Promise if no callback passed
 */
Collection.prototype.rename = function(newName, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = Object.assign({}, options, { readPreference: ReadPreference.PRIMARY });

  return executeOperation(this.s.topology, rename, [this, newName, options, callback]);
};

var rename = function(self, newName, options, callback) {
  // Check the collection name
  checkCollectionName(newName);
  // Build the command
  var renameCollection = f('%s.%s', self.s.dbName, self.s.name);
  var toCollection = f('%s.%s', self.s.dbName, newName);
  var dropTarget = typeof options.dropTarget === 'boolean' ? options.dropTarget : false;
  var cmd = { renameCollection: renameCollection, to: toCollection, dropTarget: dropTarget };

  // Decorate command with writeConcern if supported
  decorateWithWriteConcern(cmd, self, options);

  // Execute against admin
  self.s.db.admin().command(cmd, options, function(err, doc) {
    if (err) return handleCallback(callback, err, null);
    // We have an error
    if (doc.errmsg) return handleCallback(callback, toError(doc), null);
    try {
      return handleCallback(
        callback,
        null,
        new Collection(
          self.s.db,
          self.s.topology,
          self.s.dbName,
          newName,
          self.s.pkFactory,
          self.s.options
        )
      );
    } catch (err) {
      return handleCallback(callback, toError(err), null);
    }
  });
};

define.classMethod('rename', { callback: true, promise: true });

/**
 * Drop the collection from the database, removing it permanently. New accesses will create a new collection.
 *
 * @method
 * @param {object} [options=null] Optional settings.
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Collection~resultCallback} [callback] The results callback
 * @return {Promise} returns Promise if no callback passed
 */
Collection.prototype.drop = function(options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = options || {};

  return executeOperation(this.s.topology, this.s.db.dropCollection.bind(this.s.db), [
    this.s.name,
    options,
    callback
  ]);
};

define.classMethod('drop', { callback: true, promise: true });

/**
 * Returns the options of the collection.
 *
 * @method
 * @param {Object} [options] Optional settings
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Collection~resultCallback} [callback] The results callback
 * @return {Promise} returns Promise if no callback passed
 */
Collection.prototype.options = function(opts, callback) {
  if (typeof opts === 'function') (callback = opts), (opts = {});
  opts = opts || {};

  return executeOperation(this.s.topology, options, [this, opts, callback]);
};

var options = function(self, opts, callback) {
  self.s.db.listCollections({ name: self.s.name }, opts).toArray(function(err, collections) {
    if (err) return handleCallback(callback, err);
    if (collections.length === 0) {
      return handleCallback(
        callback,
        MongoError.create({ message: f('collection %s not found', self.s.namespace), driver: true })
      );
    }

    handleCallback(callback, err, collections[0].options || null);
  });
};

define.classMethod('options', { callback: true, promise: true });

/**
 * Returns if the collection is a capped collection
 *
 * @method
 * @param {Object} [options] Optional settings
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Collection~resultCallback} [callback] The results callback
 * @return {Promise} returns Promise if no callback passed
 */
Collection.prototype.isCapped = function(options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = options || {};

  return executeOperation(this.s.topology, isCapped, [this, options, callback]);
};

var isCapped = function(self, options, callback) {
  self.options(options, function(err, document) {
    if (err) return handleCallback(callback, err);
    handleCallback(callback, null, document && document.capped);
  });
};

define.classMethod('isCapped', { callback: true, promise: true });

/**
 * Creates an index on the db and collection collection.
 * @method
 * @param {(string|object)} fieldOrSpec Defines the index.
 * @param {object} [options=null] Optional settings.
 * @param {(number|string)} [options.w=null] The write concern.
 * @param {number} [options.wtimeout=null] The write concern timeout.
 * @param {boolean} [options.j=false] Specify a journal write concern.
 * @param {boolean} [options.unique=false] Creates an unique index.
 * @param {boolean} [options.sparse=false] Creates a sparse index.
 * @param {boolean} [options.background=false] Creates the index in the background, yielding whenever possible.
 * @param {boolean} [options.dropDups=false] A unique index cannot be created on a key that has pre-existing duplicate values. If you would like to create the index anyway, keeping the first document the database indexes and deleting all subsequent documents that have duplicate value
 * @param {number} [options.min=null] For geospatial indexes set the lower bound for the co-ordinates.
 * @param {number} [options.max=null] For geospatial indexes set the high bound for the co-ordinates.
 * @param {number} [options.v=null] Specify the format version of the indexes.
 * @param {number} [options.expireAfterSeconds=null] Allows you to expire data on indexes applied to a data (MongoDB 2.2 or higher)
 * @param {string} [options.name=null] Override the autogenerated index name (useful if the resulting name is larger than 128 bytes)
 * @param {object} [options.partialFilterExpression=null] Creates a partial index based on the given filter object (MongoDB 3.2 or higher)
 * @param {object} [options.collation=null] Specify collation (MongoDB 3.4 or higher) settings for update operation (see 3.4 documentation for available fields).
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Collection~resultCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 */
Collection.prototype.createIndex = function(fieldOrSpec, options, callback) {
  var args = Array.prototype.slice.call(arguments, 1);
  callback = typeof args[args.length - 1] === 'function' ? args.pop() : undefined;

  options = args.length ? args.shift() || {} : {};
  options = typeof callback === 'function' ? options : callback;
  options = options == null ? {} : options;

  return executeOperation(this.s.topology, createIndex, [this, fieldOrSpec, options, callback]);
};

var createIndex = function(self, fieldOrSpec, options, callback) {
  self.s.db.createIndex(self.s.name, fieldOrSpec, options, callback);
};

define.classMethod('createIndex', { callback: true, promise: true });

/**
 * Creates multiple indexes in the collection, this method is only supported for
 * MongoDB 2.6 or higher. Earlier version of MongoDB will throw a command not supported
 * error. Index specifications are defined at http://docs.mongodb.org/manual/reference/command/createIndexes/.
 * @method
 * @param {array} indexSpecs An array of index specifications to be created
 * @param {Object} [options] Optional settings
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Collection~resultCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 */
Collection.prototype.createIndexes = function(indexSpecs, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});

  options = options ? shallowClone(options) : {};
  if (typeof options.maxTimeMS !== 'number') delete options.maxTimeMS;

  return executeOperation(this.s.topology, createIndexes, [this, indexSpecs, options, callback]);
};

var createIndexes = function(self, indexSpecs, options, callback) {
  var capabilities = self.s.topology.capabilities();

  // Ensure we generate the correct name if the parameter is not set
  for (var i = 0; i < indexSpecs.length; i++) {
    if (indexSpecs[i].name == null) {
      var keys = [];

      // Did the user pass in a collation, check if our write server supports it
      if (indexSpecs[i].collation && capabilities && !capabilities.commandsTakeCollation) {
        return callback(new MongoError(f('server/primary/mongos does not support collation')));
      }

      for (var name in indexSpecs[i].key) {
        keys.push(f('%s_%s', name, indexSpecs[i].key[name]));
      }

      // Set the name
      indexSpecs[i].name = keys.join('_');
    }
  }

  options = Object.assign({}, options, { readPreference: ReadPreference.PRIMARY });

  // Execute the index
  self.s.db.command(
    {
      createIndexes: self.s.name,
      indexes: indexSpecs
    },
    options,
    callback
  );
};

define.classMethod('createIndexes', { callback: true, promise: true });

/**
 * Drops an index from this collection.
 * @method
 * @param {string} indexName Name of the index to drop.
 * @param {object} [options=null] Optional settings.
 * @param {(number|string)} [options.w=null] The write concern.
 * @param {number} [options.wtimeout=null] The write concern timeout.
 * @param {boolean} [options.j=false] Specify a journal write concern.
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {number} [options.maxTimeMS] Number of miliseconds to wait before aborting the query.
 * @param {Collection~resultCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 */
Collection.prototype.dropIndex = function(indexName, options, callback) {
  var args = Array.prototype.slice.call(arguments, 1);
  callback = typeof args[args.length - 1] === 'function' ? args.pop() : undefined;

  options = args.length ? args.shift() || {} : {};
  // Run only against primary
  options.readPreference = ReadPreference.PRIMARY;

  return executeOperation(this.s.topology, dropIndex, [this, indexName, options, callback]);
};

var dropIndex = function(self, indexName, options, callback) {
  // Delete index command
  var cmd = { dropIndexes: self.s.name, index: indexName };

  // Decorate command with writeConcern if supported
  decorateWithWriteConcern(cmd, self, options);

  // Execute command
  self.s.db.command(cmd, options, function(err, result) {
    if (typeof callback !== 'function') return;
    if (err) return handleCallback(callback, err, null);
    handleCallback(callback, null, result);
  });
};

define.classMethod('dropIndex', { callback: true, promise: true });

/**
 * Drops all indexes from this collection.
 * @method
 * @param {Object} [options] Optional settings
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {number} [options.maxTimeMS] Number of miliseconds to wait before aborting the query.
 * @param {Collection~resultCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 */
Collection.prototype.dropIndexes = function(options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = options ? shallowClone(options) : {};

  if (typeof options.maxTimeMS !== 'number') delete options.maxTimeMS;

  return executeOperation(this.s.topology, dropIndexes, [this, options, callback]);
};

var dropIndexes = function(self, options, callback) {
  self.dropIndex('*', options, function(err) {
    if (err) return handleCallback(callback, err, false);
    handleCallback(callback, null, true);
  });
};

define.classMethod('dropIndexes', { callback: true, promise: true });

/**
 * Drops all indexes from this collection.
 * @method
 * @deprecated use dropIndexes
 * @param {Collection~resultCallback} callback The command result callback
 * @return {Promise} returns Promise if no [callback] passed
 */
Collection.prototype.dropAllIndexes = Collection.prototype.dropIndexes;

define.classMethod('dropAllIndexes', { callback: true, promise: true });

/**
 * Reindex all indexes on the collection
 * Warning: reIndex is a blocking operation (indexes are rebuilt in the foreground) and will be slow for large collections.
 * @method
 * @param {Object} [options] Optional settings
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Collection~resultCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 */
Collection.prototype.reIndex = function(options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = options || {};

  return executeOperation(this.s.topology, reIndex, [this, options, callback]);
};

var reIndex = function(self, options, callback) {
  // Reindex
  var cmd = { reIndex: self.s.name };

  // Execute the command
  self.s.db.command(cmd, options, function(err, result) {
    if (callback == null) return;
    if (err) return handleCallback(callback, err, null);
    handleCallback(callback, null, result.ok ? true : false);
  });
};

define.classMethod('reIndex', { callback: true, promise: true });

/**
 * Get the list of all indexes information for the collection.
 *
 * @method
 * @param {object} [options=null] Optional settings.
 * @param {number} [options.batchSize=null] The batchSize for the returned command cursor or if pre 2.8 the systems batch collection
 * @param {(ReadPreference|string)} [options.readPreference=null] The preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @return {CommandCursor}
 */
Collection.prototype.listIndexes = function(options) {
  options = options || {};
  // Clone the options
  options = shallowClone(options);
  // Determine the read preference in the options.
  options = getReadPreference(this, options, this.s.db, this);
  // Set the CommandCursor constructor
  options.cursorFactory = CommandCursor;
  // Set the promiseLibrary
  options.promiseLibrary = this.s.promiseLibrary;

  if (!this.s.topology.capabilities()) {
    throw new MongoError('cannot connect to server');
  }

  // We have a list collections command
  if (this.s.topology.capabilities().hasListIndexesCommand) {
    // Cursor options
    var cursor = options.batchSize ? { batchSize: options.batchSize } : {};
    // Build the command
    var command = { listIndexes: this.s.name, cursor: cursor };
    // Execute the cursor
    cursor = this.s.topology.cursor(f('%s.$cmd', this.s.dbName), command, options);
    // Do we have a readPreference, apply it
    if (options.readPreference) cursor.setReadPreference(options.readPreference);
    // Return the cursor
    return cursor;
  }

  // Get the namespace
  var ns = f('%s.system.indexes', this.s.dbName);
  // Get the query
  cursor = this.s.topology.cursor(ns, { find: ns, query: { ns: this.s.namespace } }, options);
  // Do we have a readPreference, apply it
  if (options.readPreference) cursor.setReadPreference(options.readPreference);
  // Set the passed in batch size if one was provided
  if (options.batchSize) cursor = cursor.batchSize(options.batchSize);
  // Return the cursor
  return cursor;
};

define.classMethod('listIndexes', { callback: false, promise: false, returns: [CommandCursor] });

/**
 * Ensures that an index exists, if it does not it creates it
 * @method
 * @deprecated use createIndexes instead
 * @param {(string|object)} fieldOrSpec Defines the index.
 * @param {object} [options=null] Optional settings.
 * @param {(number|string)} [options.w=null] The write concern.
 * @param {number} [options.wtimeout=null] The write concern timeout.
 * @param {boolean} [options.j=false] Specify a journal write concern.
 * @param {boolean} [options.unique=false] Creates an unique index.
 * @param {boolean} [options.sparse=false] Creates a sparse index.
 * @param {boolean} [options.background=false] Creates the index in the background, yielding whenever possible.
 * @param {boolean} [options.dropDups=false] A unique index cannot be created on a key that has pre-existing duplicate values. If you would like to create the index anyway, keeping the first document the database indexes and deleting all subsequent documents that have duplicate value
 * @param {number} [options.min=null] For geospatial indexes set the lower bound for the co-ordinates.
 * @param {number} [options.max=null] For geospatial indexes set the high bound for the co-ordinates.
 * @param {number} [options.v=null] Specify the format version of the indexes.
 * @param {number} [options.expireAfterSeconds=null] Allows you to expire data on indexes applied to a data (MongoDB 2.2 or higher)
 * @param {number} [options.name=null] Override the autogenerated index name (useful if the resulting name is larger than 128 bytes)
 * @param {object} [options.collation=null] Specify collation (MongoDB 3.4 or higher) settings for update operation (see 3.4 documentation for available fields).
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Collection~resultCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 */
Collection.prototype.ensureIndex = function(fieldOrSpec, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = options || {};

  return executeOperation(this.s.topology, ensureIndex, [this, fieldOrSpec, options, callback]);
};

var ensureIndex = function(self, fieldOrSpec, options, callback) {
  self.s.db.ensureIndex(self.s.name, fieldOrSpec, options, callback);
};

define.classMethod('ensureIndex', { callback: true, promise: true });

/**
 * Checks if one or more indexes exist on the collection, fails on first non-existing index
 * @method
 * @param {(string|array)} indexes One or more index names to check.
 * @param {Object} [options] Optional settings
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Collection~resultCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 */
Collection.prototype.indexExists = function(indexes, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = options || {};

  return executeOperation(this.s.topology, indexExists, [this, indexes, options, callback]);
};

var indexExists = function(self, indexes, options, callback) {
  self.indexInformation(options, function(err, indexInformation) {
    // If we have an error return
    if (err != null) return handleCallback(callback, err, null);
    // Let's check for the index names
    if (!Array.isArray(indexes))
      return handleCallback(callback, null, indexInformation[indexes] != null);
    // Check in list of indexes
    for (var i = 0; i < indexes.length; i++) {
      if (indexInformation[indexes[i]] == null) {
        return handleCallback(callback, null, false);
      }
    }

    // All keys found return true
    return handleCallback(callback, null, true);
  });
};

define.classMethod('indexExists', { callback: true, promise: true });

/**
 * Retrieves this collections index info.
 * @method
 * @param {object} [options=null] Optional settings.
 * @param {boolean} [options.full=false] Returns the full raw index information.
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Collection~resultCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 */
Collection.prototype.indexInformation = function(options, callback) {
  var args = Array.prototype.slice.call(arguments, 0);
  callback = typeof args[args.length - 1] === 'function' ? args.pop() : undefined;
  options = args.length ? args.shift() || {} : {};

  return executeOperation(this.s.topology, indexInformation, [this, options, callback]);
};

var indexInformation = function(self, options, callback) {
  self.s.db.indexInformation(self.s.name, options, callback);
};

define.classMethod('indexInformation', { callback: true, promise: true });

/**
 * The callback format for results
 * @callback Collection~countCallback
 * @param {MongoError} error An error instance representing the error during the execution.
 * @param {number} result The count of documents that matched the query.
 */

/**
 * Count number of matching documents in the db to a query.
 * @method
 * @param {object} query The query for the count.
 * @param {object} [options=null] Optional settings.
 * @param {boolean} [options.limit=null] The limit of documents to count.
 * @param {boolean} [options.skip=null] The number of documents to skip for the count.
 * @param {string} [options.hint=null] An index name hint for the query.
 * @param {(ReadPreference|string)} [options.readPreference=null] The preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
 * @param {number} [options.maxTimeMS=null] Number of miliseconds to wait before aborting the query.
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Collection~countCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 */
Collection.prototype.count = function(query, options, callback) {
  var args = Array.prototype.slice.call(arguments, 0);
  callback = typeof args[args.length - 1] === 'function' ? args.pop() : undefined;
  query = args.length ? args.shift() || {} : {};
  options = args.length ? args.shift() || {} : {};

  return executeOperation(this.s.topology, count, [this, query, options, callback]);
};

var count = function(self, query, options, callback) {
  var skip = options.skip;
  var limit = options.limit;
  var hint = options.hint;
  var maxTimeMS = options.maxTimeMS;

  // Final query
  var cmd = {
    count: self.s.name,
    query: query
  };

  // Add limit, skip and maxTimeMS if defined
  if (typeof skip === 'number') cmd.skip = skip;
  if (typeof limit === 'number') cmd.limit = limit;
  if (typeof maxTimeMS === 'number') cmd.maxTimeMS = maxTimeMS;
  if (hint) cmd.hint = hint;

  options = shallowClone(options);

  // Ensure we have the right read preference inheritance
  options = getReadPreference(self, options, self.s.db);

  // Do we have a readConcern specified
  decorateWithReadConcern(cmd, self, options);

  // Have we specified collation
  decorateWithCollation(cmd, self, options);

  // Execute command
  self.s.db.command(cmd, options, function(err, result) {
    if (err) return handleCallback(callback, err);
    handleCallback(callback, null, result.n);
  });
};

define.classMethod('count', { callback: true, promise: true });

/**
 * The distinct command returns returns a list of distinct values for the given key across a collection.
 * @method
 * @param {string} key Field of the document to find distinct values for.
 * @param {object} query The query for filtering the set of documents to which we apply the distinct filter.
 * @param {object} [options=null] Optional settings.
 * @param {(ReadPreference|string)} [options.readPreference=null] The preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
 * @param {number} [options.maxTimeMS=null] Number of miliseconds to wait before aborting the query.
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Collection~resultCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 */
Collection.prototype.distinct = function(key, query, options, callback) {
  var args = Array.prototype.slice.call(arguments, 1);
  callback = typeof args[args.length - 1] === 'function' ? args.pop() : undefined;
  var queryOption = args.length ? args.shift() || {} : {};
  var optionsOption = args.length ? args.shift() || {} : {};

  return executeOperation(this.s.topology, distinct, [
    this,
    key,
    queryOption,
    optionsOption,
    callback
  ]);
};

var distinct = function(self, key, query, options, callback) {
  // maxTimeMS option
  var maxTimeMS = options.maxTimeMS;

  // Distinct command
  var cmd = {
    distinct: self.s.name,
    key: key,
    query: query
  };

  options = shallowClone(options);
  // Ensure we have the right read preference inheritance
  options = getReadPreference(self, options, self.s.db, self);

  // Add maxTimeMS if defined
  if (typeof maxTimeMS === 'number') cmd.maxTimeMS = maxTimeMS;

  // Do we have a readConcern specified
  decorateWithReadConcern(cmd, self, options);

  // Have we specified collation
  decorateWithCollation(cmd, self, options);

  // Execute the command
  self.s.db.command(cmd, options, function(err, result) {
    if (err) return handleCallback(callback, err);
    handleCallback(callback, null, result.values);
  });
};

define.classMethod('distinct', { callback: true, promise: true });

/**
 * Retrieve all the indexes on the collection.
 * @method
 * @param {Object} [options] Optional settings
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Collection~resultCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 */
Collection.prototype.indexes = function(options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = options || {};

  return executeOperation(this.s.topology, indexes, [this, options, callback]);
};

var indexes = function(self, options, callback) {
  options = Object.assign({}, { full: true }, options);
  self.s.db.indexInformation(self.s.name, options, callback);
};

define.classMethod('indexes', { callback: true, promise: true });

/**
 * Get all the collection statistics.
 *
 * @method
 * @param {object} [options=null] Optional settings.
 * @param {number} [options.scale=null] Divide the returned sizes by scale value.
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Collection~resultCallback} [callback] The collection result callback
 * @return {Promise} returns Promise if no callback passed
 */
Collection.prototype.stats = function(options, callback) {
  var args = Array.prototype.slice.call(arguments, 0);
  callback = typeof args[args.length - 1] === 'function' ? args.pop() : undefined;
  options = args.length ? args.shift() || {} : {};

  return executeOperation(this.s.topology, stats, [this, options, callback]);
};

var stats = function(self, options, callback) {
  // Build command object
  var commandObject = {
    collStats: self.s.name
  };

  // Check if we have the scale value
  if (options['scale'] != null) commandObject['scale'] = options['scale'];

  options = shallowClone(options);
  // Ensure we have the right read preference inheritance
  options = getReadPreference(self, options, self.s.db, self);

  // Execute the command
  self.s.db.command(commandObject, options, callback);
};

define.classMethod('stats', { callback: true, promise: true });

/**
 * @typedef {Object} Collection~findAndModifyWriteOpResult
 * @property {object} value Document returned from findAndModify command.
 * @property {object} lastErrorObject The raw lastErrorObject returned from the command.
 * @property {Number} ok Is 1 if the command executed correctly.
 */

/**
 * The callback format for inserts
 * @callback Collection~findAndModifyCallback
 * @param {MongoError} error An error instance representing the error during the execution.
 * @param {Collection~findAndModifyWriteOpResult} result The result object if the command was executed successfully.
 */

/**
 * Find a document and delete it in one atomic operation, requires a write lock for the duration of the operation.
 *
 * @method
 * @param {object} filter Document selection filter.
 * @param {object} [options=null] Optional settings.
 * @param {object} [options.projection=null] Limits the fields to return for all matching documents.
 * @param {object} [options.sort=null] Determines which document the operation modifies if the query selects multiple documents.
 * @param {number} [options.maxTimeMS=null] The maximum amount of time to allow the query to run.
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Collection~findAndModifyCallback} [callback] The collection result callback
 * @return {Promise} returns Promise if no callback passed
 */
Collection.prototype.findOneAndDelete = function(filter, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = options || {};

  // Basic validation
  if (filter == null || typeof filter !== 'object')
    throw toError('filter parameter must be an object');

  return executeOperation(this.s.topology, findOneAndDelete, [this, filter, options, callback]);
};

var findOneAndDelete = function(self, filter, options, callback) {
  // Final options
  var finalOptions = shallowClone(options);
  finalOptions['fields'] = options.projection;
  finalOptions['remove'] = true;
  // Execute find and Modify
  self.findAndModify(filter, options.sort, null, finalOptions, callback);
};

define.classMethod('findOneAndDelete', { callback: true, promise: true });

/**
 * Find a document and replace it in one atomic operation, requires a write lock for the duration of the operation.
 *
 * @method
 * @param {object} filter Document selection filter.
 * @param {object} replacement Document replacing the matching document.
 * @param {object} [options=null] Optional settings.
 * @param {object} [options.projection=null] Limits the fields to return for all matching documents.
 * @param {object} [options.sort=null] Determines which document the operation modifies if the query selects multiple documents.
 * @param {number} [options.maxTimeMS=null] The maximum amount of time to allow the query to run.
 * @param {boolean} [options.upsert=false] Upsert the document if it does not exist.
 * @param {boolean} [options.returnOriginal=true] When false, returns the updated document rather than the original. The default is true.
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Collection~findAndModifyCallback} [callback] The collection result callback
 * @return {Promise} returns Promise if no callback passed
 */
Collection.prototype.findOneAndReplace = function(filter, replacement, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = options || {};

  // Basic validation
  if (filter == null || typeof filter !== 'object')
    throw toError('filter parameter must be an object');
  if (replacement == null || typeof replacement !== 'object')
    throw toError('replacement parameter must be an object');

  return executeOperation(this.s.topology, findOneAndReplace, [
    this,
    filter,
    replacement,
    options,
    callback
  ]);
};

var findOneAndReplace = function(self, filter, replacement, options, callback) {
  // Final options
  var finalOptions = shallowClone(options);
  finalOptions['fields'] = options.projection;
  finalOptions['update'] = true;
  finalOptions['new'] = options.returnOriginal !== void 0 ? !options.returnOriginal : false;
  finalOptions['upsert'] = options.upsert !== void 0 ? !!options.upsert : false;

  // Execute findAndModify
  self.findAndModify(filter, options.sort, replacement, finalOptions, callback);
};

define.classMethod('findOneAndReplace', { callback: true, promise: true });

/**
 * Find a document and update it in one atomic operation, requires a write lock for the duration of the operation.
 *
 * @method
 * @param {object} filter Document selection filter.
 * @param {object} update Update operations to be performed on the document
 * @param {object} [options=null] Optional settings.
 * @param {object} [options.projection=null] Limits the fields to return for all matching documents.
 * @param {object} [options.sort=null] Determines which document the operation modifies if the query selects multiple documents.
 * @param {number} [options.maxTimeMS=null] The maximum amount of time to allow the query to run.
 * @param {boolean} [options.upsert=false] Upsert the document if it does not exist.
 * @param {boolean} [options.returnOriginal=true] When false, returns the updated document rather than the original. The default is true.
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Collection~findAndModifyCallback} [callback] The collection result callback
 * @return {Promise} returns Promise if no callback passed
 */
Collection.prototype.findOneAndUpdate = function(filter, update, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = options || {};

  // Basic validation
  if (filter == null || typeof filter !== 'object')
    throw toError('filter parameter must be an object');
  if (update == null || typeof update !== 'object')
    throw toError('update parameter must be an object');

  return executeOperation(this.s.topology, findOneAndUpdate, [
    this,
    filter,
    update,
    options,
    callback
  ]);
};

var findOneAndUpdate = function(self, filter, update, options, callback) {
  // Final options
  var finalOptions = shallowClone(options);
  finalOptions['fields'] = options.projection;
  finalOptions['update'] = true;
  finalOptions['new'] =
    typeof options.returnOriginal === 'boolean' ? !options.returnOriginal : false;
  finalOptions['upsert'] = typeof options.upsert === 'boolean' ? options.upsert : false;

  // Execute findAndModify
  self.findAndModify(filter, options.sort, update, finalOptions, callback);
};

define.classMethod('findOneAndUpdate', { callback: true, promise: true });

/**
 * Find and update a document.
 * @method
 * @param {object} query Query object to locate the object to modify.
 * @param {array} sort If multiple docs match, choose the first one in the specified sort order as the object to manipulate.
 * @param {object} doc The fields/vals to be updated.
 * @param {object} [options=null] Optional settings.
 * @param {(number|string)} [options.w=null] The write concern.
 * @param {number} [options.wtimeout=null] The write concern timeout.
 * @param {boolean} [options.j=false] Specify a journal write concern.
 * @param {boolean} [options.remove=false] Set to true to remove the object before returning.
 * @param {boolean} [options.upsert=false] Perform an upsert operation.
 * @param {boolean} [options.new=false] Set to true if you want to return the modified object rather than the original. Ignored for remove.
 * @param {object} [options.projection=null] Object containing the field projection for the result returned from the operation.
 * @param {object} [options.fields=null] **Deprecated** Use `options.projection` instead
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Collection~findAndModifyCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 * @deprecated use findOneAndUpdate, findOneAndReplace or findOneAndDelete instead
 */
Collection.prototype.findAndModify = function(query, sort, doc, options, callback) {
  var args = Array.prototype.slice.call(arguments, 1);
  callback = typeof args[args.length - 1] === 'function' ? args.pop() : undefined;
  sort = args.length ? args.shift() || [] : [];
  doc = args.length ? args.shift() : null;
  options = args.length ? args.shift() || {} : {};

  // Clone options
  options = shallowClone(options);
  // Force read preference primary
  options.readPreference = ReadPreference.PRIMARY;

  return executeOperation(this.s.topology, findAndModify, [
    this,
    query,
    sort,
    doc,
    options,
    callback
  ]);
};

var findAndModify = function(self, query, sort, doc, options, callback) {
  // Create findAndModify command object
  var queryObject = {
    findandmodify: self.s.name,
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
    options['serializeFunctions'] = self.s.serializeFunctions;
  }

  // No check on the documents
  options.checkKeys = false;

  // Get the write concern settings
  var finalOptions = writeConcern(options, self.s.db, self, options);

  // Decorate the findAndModify command with the write Concern
  if (finalOptions.writeConcern) {
    queryObject.writeConcern = finalOptions.writeConcern;
  }

  // Have we specified bypassDocumentValidation
  if (typeof finalOptions.bypassDocumentValidation === 'boolean') {
    queryObject.bypassDocumentValidation = finalOptions.bypassDocumentValidation;
  }

  // Have we specified collation
  decorateWithCollation(queryObject, self, finalOptions);

  // Execute the command
  self.s.db.command(queryObject, finalOptions, function(err, result) {
    if (err) return handleCallback(callback, err, null);
    return handleCallback(callback, null, result);
  });
};

define.classMethod('findAndModify', { callback: true, promise: true });

/**
 * Find and remove a document.
 * @method
 * @param {object} query Query object to locate the object to modify.
 * @param {array} sort If multiple docs match, choose the first one in the specified sort order as the object to manipulate.
 * @param {object} [options=null] Optional settings.
 * @param {(number|string)} [options.w=null] The write concern.
 * @param {number} [options.wtimeout=null] The write concern timeout.
 * @param {boolean} [options.j=false] Specify a journal write concern.
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Collection~resultCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 * @deprecated use findOneAndDelete instead
 */
Collection.prototype.findAndRemove = function(query, sort, options, callback) {
  var args = Array.prototype.slice.call(arguments, 1);
  callback = typeof args[args.length - 1] === 'function' ? args.pop() : undefined;
  sort = args.length ? args.shift() || [] : [];
  options = args.length ? args.shift() || {} : {};

  return executeOperation(this.s.topology, findAndRemove, [this, query, sort, options, callback]);
};

var findAndRemove = function(self, query, sort, options, callback) {
  // Add the remove option
  options['remove'] = true;
  // Execute the callback
  self.findAndModify(query, sort, null, options, callback);
};

define.classMethod('findAndRemove', { callback: true, promise: true });

function decorateWithWriteConcern(command, self, options) {
  // Do we support collation 3.4 and higher
  var capabilities = self.s.topology.capabilities();
  // Do we support write concerns 3.4 and higher
  if (capabilities && capabilities.commandsTakeWriteConcern) {
    // Get the write concern settings
    var finalOptions = writeConcern(shallowClone(options), self.s.db, self, options);
    // Add the write concern to the command
    if (finalOptions.writeConcern) {
      command.writeConcern = finalOptions.writeConcern;
    }
  }
}

function decorateWithCollation(command, self, options) {
  // Do we support collation 3.4 and higher
  var capabilities = self.s.topology.capabilities();
  // Do we support write concerns 3.4 and higher
  if (capabilities && capabilities.commandsTakeCollation) {
    if (options.collation && typeof options.collation === 'object') {
      command.collation = options.collation;
    }
  }
}

function decorateWithReadConcern(command, self, options) {
  let readConcern = Object.assign({}, command.readConcern || {});
  if (self.s.readConcern) {
    Object.assign(readConcern, self.s.readConcern);
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

/**
 * Execute an aggregation framework pipeline against the collection, needs MongoDB >= 2.2
 * @method
 * @param {object} pipeline Array containing all the aggregation framework commands for the execution.
 * @param {object} [options=null] Optional settings.
 * @param {(ReadPreference|string)} [options.readPreference=null] The preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
 * @param {object} [options.cursor=null] Return the query as cursor, on 2.6 > it returns as a real cursor on pre 2.6 it returns as an emulated cursor.
 * @param {number} [options.cursor.batchSize=null] The batchSize for the cursor
 * @param {boolean} [options.explain=false] Explain returns the aggregation execution plan (requires mongodb 2.6 >).
 * @param {boolean} [options.allowDiskUse=false] allowDiskUse lets the server know if it can use disk to store temporary results for the aggregation (requires mongodb 2.6 >).
 * @param {number} [options.maxTimeMS=null] maxTimeMS specifies a cumulative time limit in milliseconds for processing operations on the cursor. MongoDB interrupts the operation at the earliest following interrupt point.
 * @param {boolean} [options.bypassDocumentValidation=false] Allow driver to bypass schema validation in MongoDB 3.2 or higher.
 * @param {boolean} [options.raw=false] Return document results as raw BSON buffers.
 * @param {boolean} [options.promoteLongs=true] Promotes Long values to number if they fit inside the 53 bits resolution.
 * @param {boolean} [options.promoteValues=true] Promotes BSON values to native types where possible, set to false to only receive wrapper types.
 * @param {boolean} [options.promoteBuffers=false] Promotes Binary BSON values to native Node Buffers.
 * @param {object} [options.collation=null] Specify collation (MongoDB 3.4 or higher) settings for update operation (see 3.4 documentation for available fields).
 * @param {string} [options.comment] Add a comment to an aggregation command
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Collection~resultCallback} callback The command result callback
 * @return {(null|AggregationCursor)}
 */
Collection.prototype.aggregate = function(pipeline, options, callback) {
  var self = this;

  if (Array.isArray(pipeline)) {
    // Set up callback if one is provided
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }

    // If we have no options or callback we are doing
    // a cursor based aggregation
    if (options == null && callback == null) {
      options = {};
    }
  } else {
    // Aggregation pipeline passed as arguments on the method
    var args = Array.prototype.slice.call(arguments, 0);
    // Get the callback
    callback = args.pop();
    // Get the possible options object
    var opts = args[args.length - 1];
    // If it contains any of the admissible options pop it of the args
    options =
      opts &&
      (opts.readPreference ||
        opts.explain ||
        opts.cursor ||
        opts.out ||
        opts.maxTimeMS ||
        opts.hint ||
        opts.allowDiskUse)
        ? args.pop()
        : {};
    // Left over arguments is the pipeline
    pipeline = args;
  }

  // Ignore readConcern option
  var ignoreReadConcern = false;

  // Build the command
  var command = { aggregate: this.s.name, pipeline: pipeline };

  // If out was specified
  if (typeof options.out === 'string') {
    pipeline.push({ $out: options.out });
    // Ignore read concern
    ignoreReadConcern = true;
  } else if (pipeline.length > 0 && pipeline[pipeline.length - 1]['$out']) {
    ignoreReadConcern = true;
  }

  // Decorate command with writeConcern if out has been specified
  if (pipeline.length > 0 && pipeline[pipeline.length - 1]['$out']) {
    decorateWithWriteConcern(command, self, options);
  }

  // Have we specified collation
  decorateWithCollation(command, self, options);

  // If we have bypassDocumentValidation set
  if (typeof options.bypassDocumentValidation === 'boolean') {
    command.bypassDocumentValidation = options.bypassDocumentValidation;
  }

  // Do we have a readConcern specified
  if (!ignoreReadConcern) {
    decorateWithReadConcern(command, self, options);
  }

  // If we have allowDiskUse defined
  if (options.allowDiskUse) command.allowDiskUse = options.allowDiskUse;
  if (typeof options.maxTimeMS === 'number') command.maxTimeMS = options.maxTimeMS;

  // If we are giving a hint
  if (options.hint) command.hint = options.hint;

  options = shallowClone(options);
  // Ensure we have the right read preference inheritance
  options = getReadPreference(this, options, this.s.db, this);

  // If explain has been specified add it
  if (options.explain) {
    if (command.readConcern || command.writeConcern) {
      throw toError('"explain" cannot be used on an aggregate call with readConcern/writeConcern');
    }
    command.explain = options.explain;
  }

  if (typeof options.comment === 'string') command.comment = options.comment;

  // Validate that cursor options is valid
  if (options.cursor != null && typeof options.cursor !== 'object') {
    throw toError('cursor options must be an object');
  }

  options.cursor = options.cursor || { batchSize: 1000 };
  command.cursor = options.cursor;

  // promiseLibrary
  options.promiseLibrary = this.s.promiseLibrary;

  // Set the AggregationCursor constructor
  options.cursorFactory = AggregationCursor;
  if (typeof callback !== 'function') {
    if (!this.s.topology.capabilities()) {
      throw new MongoError('cannot connect to server');
    }

    // Allow disk usage command
    if (typeof options.allowDiskUse === 'boolean') command.allowDiskUse = options.allowDiskUse;
    if (typeof options.maxTimeMS === 'number') command.maxTimeMS = options.maxTimeMS;

    // Execute the cursor
    return this.s.topology.cursor(this.s.namespace, command, options);
  }

  return handleCallback(callback, null, this.s.topology.cursor(this.s.namespace, command, options));
};

define.classMethod('aggregate', { callback: true, promise: false });

/**
 * Create a new Change Stream, watching for new changes (insertions, updates, replacements, deletions, and invalidations) in this collection.
 * @method
 * @since 3.0.0
 * @param {Array} [pipeline=null] An array of {@link https://docs.mongodb.com/manual/reference/operator/aggregation-pipeline/|aggregation pipeline stages} through which to pass change stream documents. This allows for filtering (using $match) and manipulating the change stream documents.
 * @param {object} [options=null] Optional settings
 * @param {string} [options.fullDocument=none] Allowed values: ‘none’, ‘lookup’. When set to ‘lookup’, the change stream will include both a delta describing the changes to the document, as well as a copy of the entire document that was changed from some time after the change occurred.
 * @param {object} [options.resumeAfter=null] Specifies the logical starting point for the new change stream. This should be the _id field from a previously returned change stream document.
 * @param {number} [options.maxAwaitTimeMS] The maximum amount of time for the server to wait on new documents to satisfy a change stream query
 * @param {number} [options.batchSize=null] The number of documents to return per batch. See {@link https://docs.mongodb.com/manual/reference/command/aggregate|aggregation documentation}.
 * @param {object} [options.collation=null] Specify collation settings for operation. See {@link https://docs.mongodb.com/manual/reference/command/aggregate|aggregation documentation}.
 * @param {ReadPreference} [options.readPreference=null] The read preference. Defaults to the read preference of the database or collection. See {@link https://docs.mongodb.com/manual/reference/read-preference|read preference documentation}.
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @return {ChangeStream} a ChangeStream instance.
 */
Collection.prototype.watch = function(pipeline, options) {
  pipeline = pipeline || [];
  options = options || {};

  // Allow optionally not specifying a pipeline
  if (!Array.isArray(pipeline)) {
    options = pipeline;
    pipeline = [];
  }

  return new ChangeStream(this, pipeline, options);
};

define.classMethod('watch', { callback: false, promise: false });

/**
 * The callback format for results
 * @callback Collection~parallelCollectionScanCallback
 * @param {MongoError} error An error instance representing the error during the execution.
 * @param {Cursor[]} cursors A list of cursors returned allowing for parallel reading of collection.
 */

/**
 * Return N number of parallel cursors for a collection allowing parallel reading of entire collection. There are
 * no ordering guarantees for returned results.
 * @method
 * @param {object} [options=null] Optional settings.
 * @param {(ReadPreference|string)} [options.readPreference=null] The preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
 * @param {number} [options.batchSize=null] Set the batchSize for the getMoreCommand when iterating over the query results.
 * @param {number} [options.numCursors=1] The maximum number of parallel command cursors to return (the number of returned cursors will be in the range 1:numCursors)
 * @param {boolean} [options.raw=false] Return all BSON documents as Raw Buffer documents.
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Collection~parallelCollectionScanCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 */
Collection.prototype.parallelCollectionScan = function(options, callback) {
  if (typeof options === 'function') (callback = options), (options = { numCursors: 1 });
  // Set number of cursors to 1
  options.numCursors = options.numCursors || 1;
  options.batchSize = options.batchSize || 1000;

  options = shallowClone(options);
  // Ensure we have the right read preference inheritance
  options = getReadPreference(this, options, this.s.db, this);

  // Add a promiseLibrary
  options.promiseLibrary = this.s.promiseLibrary;

  return executeOperation(this.s.topology, parallelCollectionScan, [this, options, callback], {
    returnsCursor: true
  });
};

var parallelCollectionScan = function(self, options, callback) {
  // Create command object
  var commandObject = {
    parallelCollectionScan: self.s.name,
    numCursors: options.numCursors
  };

  // Do we have a readConcern specified
  decorateWithReadConcern(commandObject, self, options);

  // Store the raw value
  var raw = options.raw;
  delete options['raw'];

  // Execute the command
  self.s.db.command(commandObject, options, function(err, result) {
    if (err) return handleCallback(callback, err, null);
    if (result == null)
      return handleCallback(
        callback,
        new Error('no result returned for parallelCollectionScan'),
        null
      );

    var cursors = [];
    // Add the raw back to the option
    if (raw) options.raw = raw;
    // Create command cursors for each item
    for (var i = 0; i < result.cursors.length; i++) {
      var rawId = result.cursors[i].cursor.id;
      // Convert cursorId to Long if needed
      var cursorId = typeof rawId === 'number' ? Long.fromNumber(rawId) : rawId;
      // Add a command cursor
      cursors.push(self.s.topology.cursor(self.s.namespace, cursorId, options));
    }

    handleCallback(callback, null, cursors);
  });
};

define.classMethod('parallelCollectionScan', { callback: true, promise: true });

/**
 * Execute a geo search using a geo haystack index on a collection.
 *
 * @method
 * @param {number} x Point to search on the x axis, ensure the indexes are ordered in the same order.
 * @param {number} y Point to search on the y axis, ensure the indexes are ordered in the same order.
 * @param {object} [options=null] Optional settings.
 * @param {(ReadPreference|string)} [options.readPreference=null] The preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
 * @param {number} [options.maxDistance=null] Include results up to maxDistance from the point.
 * @param {object} [options.search=null] Filter the results by a query.
 * @param {number} [options.limit=false] Max number of results to return.
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Collection~resultCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 */
Collection.prototype.geoHaystackSearch = function(x, y, options, callback) {
  var args = Array.prototype.slice.call(arguments, 2);
  callback = typeof args[args.length - 1] === 'function' ? args.pop() : undefined;
  options = args.length ? args.shift() || {} : {};

  return executeOperation(this.s.topology, geoHaystackSearch, [this, x, y, options, callback]);
};

var geoHaystackSearch = function(self, x, y, options, callback) {
  // Build command object
  var commandObject = {
    geoSearch: self.s.name,
    near: [x, y]
  };

  // Remove read preference from hash if it exists
  commandObject = decorateCommand(commandObject, options, { readPreference: true, session: true });

  options = shallowClone(options);
  // Ensure we have the right read preference inheritance
  options = getReadPreference(self, options, self.s.db, self);

  // Do we have a readConcern specified
  decorateWithReadConcern(commandObject, self, options);

  // Execute the command
  self.s.db.command(commandObject, options, function(err, res) {
    if (err) return handleCallback(callback, err);
    if (res.err || res.errmsg) handleCallback(callback, toError(res));
    // should we only be returning res.results here? Not sure if the user
    // should see the other return information
    handleCallback(callback, null, res);
  });
};

define.classMethod('geoHaystackSearch', { callback: true, promise: true });

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
var groupFunction =
  'function () {\nvar c = db[ns].find(condition);\nvar map = new Map();\nvar reduce_function = reduce;\n\nwhile (c.hasNext()) {\nvar obj = c.next();\nvar key = {};\n\nfor (var i = 0, len = keys.length; i < len; ++i) {\nvar k = keys[i];\nkey[k] = obj[k];\n}\n\nvar aggObj = map.get(key);\n\nif (aggObj == null) {\nvar newObj = Object.extend({}, key);\naggObj = Object.extend(newObj, initial);\nmap.put(key, aggObj);\n}\n\nreduce_function(obj, aggObj);\n}\n\nreturn { "result": map.values() };\n}';

/**
 * Run a group command across a collection
 *
 * @method
 * @param {(object|array|function|code)} keys An object, array or function expressing the keys to group by.
 * @param {object} condition An optional condition that must be true for a row to be considered.
 * @param {object} initial Initial value of the aggregation counter object.
 * @param {(function|Code)} reduce The reduce function aggregates (reduces) the objects iterated
 * @param {(function|Code)} finalize An optional function to be run on each item in the result set just before the item is returned.
 * @param {boolean} command Specify if you wish to run using the internal group command or using eval, default is true.
 * @param {object} [options=null] Optional settings.
 * @param {(ReadPreference|string)} [options.readPreference=null] The preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Collection~resultCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 * @deprecated MongoDB 3.6 or higher will no longer support the group command. We recommend rewriting using the aggregation framework.
 */
Collection.prototype.group = function(
  keys,
  condition,
  initial,
  reduce,
  finalize,
  command,
  options,
  callback
) {
  var args = Array.prototype.slice.call(arguments, 3);
  callback = typeof args[args.length - 1] === 'function' ? args.pop() : undefined;
  reduce = args.length ? args.shift() : null;
  finalize = args.length ? args.shift() : null;
  command = args.length ? args.shift() : null;
  options = args.length ? args.shift() || {} : {};

  // Make sure we are backward compatible
  if (!(typeof finalize === 'function')) {
    command = finalize;
    finalize = null;
  }

  if (
    !Array.isArray(keys) &&
    keys instanceof Object &&
    typeof keys !== 'function' &&
    !(keys._bsontype === 'Code')
  ) {
    keys = Object.keys(keys);
  }

  if (typeof reduce === 'function') {
    reduce = reduce.toString();
  }

  if (typeof finalize === 'function') {
    finalize = finalize.toString();
  }

  // Set up the command as default
  command = command == null ? true : command;

  return executeOperation(this.s.topology, group, [
    this,
    keys,
    condition,
    initial,
    reduce,
    finalize,
    command,
    options,
    callback
  ]);
};

var group = function(self, keys, condition, initial, reduce, finalize, command, options, callback) {
  // Execute using the command
  if (command) {
    var reduceFunction = reduce && reduce._bsontype === 'Code' ? reduce : new Code(reduce);

    var selector = {
      group: {
        ns: self.s.name,
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
      var hash = {};
      keys.forEach(function(key) {
        hash[key] = 1;
      });
      selector.group.key = hash;
    }

    options = shallowClone(options);
    // Ensure we have the right read preference inheritance
    options = getReadPreference(self, options, self.s.db, self);

    // Do we have a readConcern specified
    decorateWithReadConcern(selector, self, options);

    // Have we specified collation
    decorateWithCollation(selector, self, options);

    // Execute command
    self.s.db.command(selector, options, function(err, result) {
      if (err) return handleCallback(callback, err, null);
      handleCallback(callback, null, result.retval);
    });
  } else {
    // Create execution scope
    var scope = reduce != null && reduce._bsontype === 'Code' ? reduce.scope : {};

    scope.ns = self.s.name;
    scope.keys = keys;
    scope.condition = condition;
    scope.initial = initial;

    // Pass in the function text to execute within mongodb.
    var groupfn = groupFunction.replace(/ reduce;/, reduce.toString() + ';');

    self.s.db.eval(new Code(groupfn, scope), null, options, function(err, results) {
      if (err) return handleCallback(callback, err, null);
      handleCallback(callback, null, results.result || results);
    });
  }
};

define.classMethod('group', { callback: true, promise: true });

/**
 * Functions that are passed as scope args must
 * be converted to Code instances.
 * @ignore
 */
function processScope(scope) {
  if (!isObject(scope) || scope._bsontype === 'ObjectID') {
    return scope;
  }

  var keys = Object.keys(scope);
  var i = keys.length;
  var key;
  var new_scope = {};

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

/**
 * Run Map Reduce across a collection. Be aware that the inline option for out will return an array of results not a collection.
 *
 * @method
 * @param {(function|string)} map The mapping function.
 * @param {(function|string)} reduce The reduce function.
 * @param {object} [options=null] Optional settings.
 * @param {(ReadPreference|string)} [options.readPreference=null] The preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
 * @param {object} [options.out=null] Sets the output target for the map reduce job. *{inline:1} | {replace:'collectionName'} | {merge:'collectionName'} | {reduce:'collectionName'}*
 * @param {object} [options.query=null] Query filter object.
 * @param {object} [options.sort=null] Sorts the input objects using this key. Useful for optimization, like sorting by the emit key for fewer reduces.
 * @param {number} [options.limit=null] Number of objects to return from collection.
 * @param {boolean} [options.keeptemp=false] Keep temporary data.
 * @param {(function|string)} [options.finalize=null] Finalize function.
 * @param {object} [options.scope=null] Can pass in variables that can be access from map/reduce/finalize.
 * @param {boolean} [options.jsMode=false] It is possible to make the execution stay in JS. Provided in MongoDB > 2.0.X.
 * @param {boolean} [options.verbose=false] Provide statistics on job execution time.
 * @param {boolean} [options.bypassDocumentValidation=false] Allow driver to bypass schema validation in MongoDB 3.2 or higher.
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Collection~resultCallback} [callback] The command result callback
 * @throws {MongoError}
 * @return {Promise} returns Promise if no callback passed
 */
Collection.prototype.mapReduce = function(map, reduce, options, callback) {
  if ('function' === typeof options) (callback = options), (options = {});
  // Out must allways be defined (make sure we don't break weirdly on pre 1.8+ servers)
  if (null == options.out) {
    throw new Error(
      'the out option parameter must be defined, see mongodb docs for possible values'
    );
  }

  if ('function' === typeof map) {
    map = map.toString();
  }

  if ('function' === typeof reduce) {
    reduce = reduce.toString();
  }

  if ('function' === typeof options.finalize) {
    options.finalize = options.finalize.toString();
  }

  return executeOperation(this.s.topology, mapReduce, [this, map, reduce, options, callback]);
};

var mapReduce = function(self, map, reduce, options, callback) {
  var mapCommandHash = {
    mapreduce: self.s.name,
    map: map,
    reduce: reduce
  };

  // Exclusion list
  var exclusionList = ['readPreference', 'session'];

  // Add any other options passed in
  for (var n in options) {
    if ('scope' === n) {
      mapCommandHash[n] = processScope(options[n]);
    } else {
      // Only include if not in exclusion list
      if (exclusionList.indexOf(n) === -1) {
        mapCommandHash[n] = options[n];
      }
    }
  }

  options = shallowClone(options);

  // Ensure we have the right read preference inheritance
  options = getReadPreference(self, options, self.s.db, self);

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
    decorateWithWriteConcern(mapCommandHash, self, options);
  } else {
    decorateWithReadConcern(mapCommandHash, self, options);
  }

  // Is bypassDocumentValidation specified
  if (typeof options.bypassDocumentValidation === 'boolean') {
    mapCommandHash.bypassDocumentValidation = options.bypassDocumentValidation;
  }

  // Have we specified collation
  decorateWithCollation(mapCommandHash, self, options);

  // Execute command
  self.s.db.command(mapCommandHash, options, function(err, result) {
    if (err) return handleCallback(callback, err);
    // Check if we have an error
    if (1 !== result.ok || result.err || result.errmsg) {
      return handleCallback(callback, toError(result));
    }

    // Create statistics value
    var stats = {};
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
    var collection = null;

    // If we have an object it's a different db
    if (result.result != null && typeof result.result === 'object') {
      var doc = result.result;
      // Return a collection from another db
      collection = new require('./db')(
        doc.db,
        self.s.db.s.topology,
        self.s.db.s.options
      ).collection(doc.collection);
    } else {
      // Create a collection object that wraps the result collection
      collection = self.s.db.collection(result.result);
    }

    // If we wish for no verbosity
    if (options['verbose'] == null || !options['verbose']) {
      return handleCallback(callback, err, collection);
    }

    // Return stats as third set of values
    handleCallback(callback, err, { collection: collection, stats: stats });
  });
};

define.classMethod('mapReduce', { callback: true, promise: true });

/**
 * Initiate a Out of order batch write operation. All operations will be buffered into insert/update/remove commands executed out of order.
 *
 * @method
 * @param {object} [options=null] Optional settings.
 * @param {(number|string)} [options.w=null] The write concern.
 * @param {number} [options.wtimeout=null] The write concern timeout.
 * @param {boolean} [options.j=false] Specify a journal write concern.
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @return {UnorderedBulkOperation}
 */
Collection.prototype.initializeUnorderedBulkOp = function(options) {
  options = options || {};
  options.promiseLibrary = this.s.promiseLibrary;
  return unordered(this.s.topology, this, options);
};

define.classMethod('initializeUnorderedBulkOp', {
  callback: false,
  promise: false,
  returns: [ordered.UnorderedBulkOperation]
});

/**
 * Initiate an In order bulk write operation, operations will be serially executed in the order they are added, creating a new operation for each switch in types.
 *
 * @method
 * @param {object} [options=null] Optional settings.
 * @param {(number|string)} [options.w=null] The write concern.
 * @param {number} [options.wtimeout=null] The write concern timeout.
 * @param {boolean} [options.j=false] Specify a journal write concern.
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {OrderedBulkOperation} callback The command result callback
 * @return {null}
 */
Collection.prototype.initializeOrderedBulkOp = function(options) {
  options = options || {};
  options.promiseLibrary = this.s.promiseLibrary;
  return ordered(this.s.topology, this, options);
};

define.classMethod('initializeOrderedBulkOp', {
  callback: false,
  promise: false,
  returns: [ordered.OrderedBulkOperation]
});

// Get write concern
var writeConcern = function(target, db, col, options) {
  if (options.w != null || options.j != null || options.fsync != null) {
    var opts = {};
    if (options.w != null) opts.w = options.w;
    if (options.wtimeout != null) opts.wtimeout = options.wtimeout;
    if (options.j != null) opts.j = options.j;
    if (options.fsync != null) opts.fsync = options.fsync;
    target.writeConcern = opts;
  } else if (
    col.writeConcern.w != null ||
    col.writeConcern.j != null ||
    col.writeConcern.fsync != null
  ) {
    target.writeConcern = col.writeConcern;
  } else if (
    db.writeConcern.w != null ||
    db.writeConcern.j != null ||
    db.writeConcern.fsync != null
  ) {
    target.writeConcern = db.writeConcern;
  }

  // NOTE: there is probably a much better place for this
  if (db.s.options.retryWrites) target.retryWrites = true;

  return target;
};

// Figure out the read preference
var getReadPreference = function(self, options, db) {
  let r = null;
  if (options.readPreference) {
    r = options.readPreference;
  } else if (self.s.readPreference) {
    r = self.s.readPreference;
  } else if (db.s.readPreference) {
    r = db.s.readPreference;
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

module.exports = Collection;
