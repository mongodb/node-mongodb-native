'use strict';

const deprecate = require('util').deprecate;
const deprecateOptions = require('./utils').deprecateOptions;
const checkCollectionName = require('./utils').checkCollectionName;
const ObjectID = require('mongodb-core').BSON.ObjectID;
const AggregationCursor = require('./aggregation_cursor');
const MongoError = require('mongodb-core').MongoError;
const toError = require('./utils').toError;
const normalizeHintField = require('./utils').normalizeHintField;
const ReadPreference = require('mongodb-core').ReadPreference;
const CommandCursor = require('./command_cursor');
const unordered = require('./bulk/unordered');
const ordered = require('./bulk/ordered');
const ChangeStream = require('./change_stream');
const executeOperation = require('./utils').executeOperation;
const applyWriteConcern = require('./utils').applyWriteConcern;
const resolveReadPreference = require('./utils').resolveReadPreference;
const validate = require('./options_validator').validate;
const applyDefaults = require('./options_validator').applyDefaults;

// Operations
const aggregate = require('./operations/collection_ops').aggregate;
const bulkWrite = require('./operations/collection_ops').bulkWrite;
const checkForAtomicOperators = require('./operations/collection_ops').checkForAtomicOperators;
const count = require('./operations/collection_ops').count;
const countDocuments = require('./operations/collection_ops').countDocuments;
const createIndex = require('./operations/collection_ops').createIndex;
const createIndexes = require('./operations/collection_ops').createIndexes;
const deleteMany = require('./operations/collection_ops').deleteMany;
const deleteOne = require('./operations/collection_ops').deleteOne;
const distinct = require('./operations/collection_ops').distinct;
const dropCollection = require('./operations/db_ops').dropCollection;
const dropIndex = require('./operations/collection_ops').dropIndex;
const dropIndexes = require('./operations/collection_ops').dropIndexes;
const ensureIndex = require('./operations/collection_ops').ensureIndex;
const find = require('./operations/collection_ops').find;
const findAndModify = require('./operations/collection_ops').findAndModify;
const findAndRemove = require('./operations/collection_ops').findAndRemove;
const findOne = require('./operations/collection_ops').findOne;
const findOneAndDelete = require('./operations/collection_ops').findOneAndDelete;
const findOneAndReplace = require('./operations/collection_ops').findOneAndReplace;
const findOneAndUpdate = require('./operations/collection_ops').findOneAndUpdate;
const geoHaystackSearch = require('./operations/collection_ops').geoHaystackSearch;
const group = require('./operations/collection_ops').group;
const indexes = require('./operations/collection_ops').indexes;
const indexExists = require('./operations/collection_ops').indexExists;
const indexInformation = require('./operations/collection_ops').indexInformation;
const insertOne = require('./operations/collection_ops').insertOne;
const isCapped = require('./operations/collection_ops').isCapped;
const listIndexes = require('./operations/collection_ops').listIndexes;
const mapReduce = require('./operations/collection_ops').mapReduce;
const optionsOp = require('./operations/collection_ops').optionsOp;
const parallelCollectionScan = require('./operations/collection_ops').parallelCollectionScan;
const prepareDocs = require('./operations/collection_ops').prepareDocs;
const reIndex = require('./operations/collection_ops').reIndex;
const removeDocuments = require('./operations/collection_ops').removeDocuments;
const rename = require('./operations/collection_ops').rename;
const replaceOne = require('./operations/collection_ops').replaceOne;
const save = require('./operations/collection_ops').save;
const stats = require('./operations/collection_ops').stats;
const updateDocuments = require('./operations/collection_ops').updateDocuments;
const updateMany = require('./operations/collection_ops').updateMany;
const updateOne = require('./operations/collection_ops').updateOne;

// Schemas
const aggregateSchema = require('./schemas/collection_schemas').aggregateSchema;
const bulkWriteSchema = require('./schemas/collection_schemas').bulkWriteSchema;
const countDocumentsSchema = require('./schemas/collection_schemas').countDocumentsSchema;
const createIndexSchema = require('./schemas/collection_schemas').createIndexSchema;
const createIndexesSchema = require('./schemas/collection_schemas').createIndexesSchema;
const deleteManySchema = require('./schemas/collection_schemas').deleteManySchema;
const deleteOneSchema = require('./schemas/collection_schemas').deleteOneSchema;
const distinctSchema = require('./schemas/collection_schemas').distinctSchema;
const dropSchema = require('./schemas/collection_schemas').dropSchema;
const dropIndexSchema = require('./schemas/collection_schemas').dropIndexSchema;
const dropIndexesSchema = require('./schemas/collection_schemas').dropIndexesSchema;
const estimatedDocumentCountSchema = require('./schemas/collection_schemas')
  .estimatedDocumentCountSchema;
const findSchema = require('./schemas/collection_schemas').findSchema;
const findAndModifySchema = require('./schemas/collection_schemas').findAndModifySchema;
const findAndRemoveSchema = require('./schemas/collection_schemas').findAndRemoveSchema;
const findOneSchema = require('./schemas/collection_schemas').findOneSchema;
const findOneAndDeleteSchema = require('./schemas/collection_schemas').findOneAndDeleteSchema;
const findOneAndReplaceSchema = require('./schemas/collection_schemas').findOneAndReplaceSchema;
const findOneAndUpdateSchema = require('./schemas/collection_schemas').findOneAndUpdateSchema;
const geoHaystackSearchSchema = require('./schemas/collection_schemas').geoHaystackSearchSchema;
const indexesSchema = require('./schemas/collection_schemas').indexesSchema;
const indexExistsSchema = require('./schemas/collection_schemas').indexExistsSchema;
const indexInformationSchema = require('./schemas/collection_schemas').indexInformationSchema;
const initializeOrderedBulkOpSchema = require('./schemas/collection_schemas')
  .initializeOrderedBulkOpSchema;
const initializeUnorderedBulkOpSchema = require('./schemas/collection_schemas')
  .initializeUnorderedBulkOpSchema;
const insertManySchema = require('./schemas/collection_schemas').insertManySchema;
const insertOneSchema = require('./schemas/collection_schemas').insertOneSchema;
const isCappedSchema = require('./schemas/collection_schemas').isCappedSchema;
const listIndexesSchema = require('./schemas/collection_schemas').listIndexesSchema;
const mapReduceSchema = require('./schemas/collection_schemas').mapReduceSchema;
const optionsSchema = require('./schemas/collection_schemas').optionsSchema;
const parallelCollectionScanSchema = require('./schemas/collection_schemas')
  .parallelCollectionScanSchema;
const reIndexSchema = require('./schemas/collection_schemas').reIndexSchema;
const renameSchema = require('./schemas/collection_schemas').renameSchema;
const replaceOneSchema = require('./schemas/collection_schemas').replaceOneSchema;
const statsSchema = require('./schemas/collection_schemas').statsSchema;
const updateManySchema = require('./schemas/collection_schemas').updateManySchema;
const updateOneSchema = require('./schemas/collection_schemas').updateOneSchema;
const watchSchema = require('./schemas/collection_schemas').watchSchema;

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
function Collection(db, topology, dbName, name, pkFactory, options) {
  checkCollectionName(name);

  // Unpack variables
  const internalHint = null;
  const slaveOk = options == null || options.slaveOk == null ? db.slaveOk : options.slaveOk;
  const serializeFunctions =
    options == null || options.serializeFunctions == null
      ? db.s.options.serializeFunctions
      : options.serializeFunctions;
  const raw = options == null || options.raw == null ? db.s.options.raw : options.raw;
  const promoteLongs =
    options == null || options.promoteLongs == null
      ? db.s.options.promoteLongs
      : options.promoteLongs;
  const promoteValues =
    options == null || options.promoteValues == null
      ? db.s.options.promoteValues
      : options.promoteValues;
  const promoteBuffers =
    options == null || options.promoteBuffers == null
      ? db.s.options.promoteBuffers
      : options.promoteBuffers;
  let readPreference = null;
  const collectionHint = null;
  const namespace = `${dbName}.${name}`;

  // Get the promiseLibrary
  const promiseLibrary = options.promiseLibrary || Promise;

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
    readConcern: options.readConcern,
    // Write Concern
    writeConcern: options.writeConcern
  };
}

Object.defineProperty(Collection.prototype, 'optionsValidationLevel', {
  enumerable: true,
  get: function() {
    if (this.s && this.s.options && this.s.options.optionsValidationLevel) {
      return this.s.options.optionsValidationLevel;
    }
    return this.s.db.optionsValidationLevel;
  }
});

Object.defineProperty(Collection.prototype, 'dbName', {
  enumerable: true,
  get: function() {
    return this.s.dbName;
  }
});

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
    let ops = {};
    if (this.s.writeConcern) {
      return this.s.writeConcern;
    }

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

const DEPRECATED_FIND_OPTIONS = ['maxScan', 'fields', 'snapshot'];

/**
 * Creates a cursor for a query that can be used to iterate over results from MongoDB
 * @method
 * @param {object} [query={}] The cursor query object.
 * @param {object} [options] Optional settings.
 * @param {number} [options.limit=0] Sets the limit of documents returned in the query.
 * @param {(array|object)} [options.sort] Set to sort the documents coming back from the query. Array of indexes, [['a', 1]] etc.
 * @param {object} [options.projection] The fields to return in the query. Object of fields to include or exclude (not both), {'a':1}
 * @param {object} [options.fields] **Deprecated** Use `options.projection` instead
 * @param {number} [options.skip=0] Set to skip N documents ahead in your query (useful for pagination).
 * @param {string|object} [options.hint] Tell the query to use specific indexes in the query. Object of indexes to use, {'_id':1}
 * @param {boolean} [options.explain] Explain the query instead of returning the data.
 * @param {boolean} [options.snapshot] DEPRECATED: Snapshot query.
 * @param {boolean} [options.timeout] Specify if the cursor can timeout.
 * @param {boolean} [options.tailable] Specify if the cursor is tailable.
 * @param {number} [options.batchSize] Set the batchSize for the getMoreCommand when iterating over the query results.
 * @param {boolean} [options.returnKey] Only return the index key.
 * @param {number} [options.maxScan] DEPRECATED: Limit the number of items to scan.
 * @param {number} [options.min] Set index bounds.
 * @param {number} [options.max] Set index bounds.
 * @param {boolean} [options.showDiskLoc=false] DEPRECATED. Show disk location of results.
 * @param {boolean} [options.showRecordId] Return the record identifier for each document.
 * @param {string} [options.comment] You can put a $comment field on a query to make looking in the profiler logs simpler.
 * @param {boolean} [options.raw=false] Return document results as raw BSON buffers.
 * @param {boolean} [options.promoteLongs=true] Promotes Long values to number if they fit inside the 53 bits resolution.
 * @param {boolean} [options.promoteValues=true] Promotes BSON values to native types where possible, set to false to only receive wrapper types.
 * @param {boolean} [options.promoteBuffers=false] Promotes Binary BSON values to native Node Buffers.
 * @param {(ReadPreference|string)} [options.readPreference] The preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
 * @param {boolean} [options.partial] Specify if the cursor should return partial results when querying against a sharded system
 * @param {number} [options.maxTimeMS] Number of miliseconds to wait before aborting the query.
 * @param {object} [options.collation] Specify collation (MongoDB 3.4 or higher) settings for update operation (see 3.4 documentation for available fields).
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {boolean} [options.awaitData] Sets the cursor to block and await data for a while rather than returning no data
 * @param {object} [options.readConcern] Specify a read concern for the operation. (only MongoDB 3.2 or higher supported)
 * @throws {MongoError}
 * @return {Cursor}
 */
Collection.prototype.find = deprecateOptions(
  {
    name: 'collection.find',
    deprecatedOptions: DEPRECATED_FIND_OPTIONS,
    optionsIndex: 1
  },
  function(query, options, callback) {
    if (typeof callback === 'object') {
      // TODO(MAJOR): throw in the future
      console.warn('Third parameter to `find()` must be a callback or undefined');
    }

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
    const object = selector;
    if (Buffer.isBuffer(object)) {
      const object_size = object[0] | (object[1] << 8) | (object[2] << 16) | (object[3] << 24);
      if (object_size !== object.length) {
        const error = new Error(
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

    validate(findSchema, options, { optionsValidationLevel: this.optionsValidationLevel });

    const finalOptions = applyDefaults(
      findSchema,
      options,
      {
        raw: this.s.raw,
        promoteLongs: this.s.promoteLongs,
        promoteValues: this.s.promoteValues,
        promoteBuffers: this.s.promoteBuffers,
        slaveOk: this.s.db.slaveOk
      },
      {
        readPreference: resolveReadPreference(options, { db: this.s.db, collection: this }),
        hint:
          options && options.hint != null
            ? normalizeHintField(options.hint)
            : this.s.collectionHint,
        noCursorTimeout: options ? options.timeout : null,
        promiseLibrary: this.s.promiseLibrary,
        ignoreUndefined: this.s.options.ignoreUndefined,
        optionsValidationLevel: this.optionsValidationLevel
      }
    );

    return find(this, selector, finalOptions, callback);
  }
);

/**
 * Inserts a single document into MongoDB. If documents passed in do not contain the **_id** field,
 * one will be added to each of the documents missing it by the driver, mutating the document. This behavior
 * can be overridden by setting the **forceServerObjectId** flag.
 *
 * @method
 * @param {object} doc Document to insert.
 * @param {object} [options] Optional settings.
 * @param {(number|string)} [options.w] The write concern.
 * @param {number} [options.wtimeout] The write concern timeout.
 * @param {boolean} [options.j] Specify a journal write concern.
 * @param {boolean} [options.serializeFunctions=false] Serialize functions on any object.
 * @param {boolean} [options.forceServerObjectId=false] Force server to assign _id values instead of driver.
 * @param {boolean} [options.bypassDocumentValidation] Allow driver to bypass schema validation in MongoDB 3.2 or higher.
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Collection~insertOneWriteOpCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 */
Collection.prototype.insertOne = function(doc, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});

  validate(insertOneSchema, options, { optionsValidationLevel: this.optionsValidationLevel });

  options = applyDefaults(
    insertOneSchema,
    options,
    {},
    { ignoreUndefined: this.s.options.ignoreUndefined }
  );

  return executeOperation(this.s.topology, insertOne, [this, doc, options, callback]);
};

function mapInsertManyResults(docs, r) {
  const finalResult = {
    result: { ok: 1, n: r.insertedCount },
    ops: docs,
    insertedCount: r.insertedCount,
    insertedIds: r.insertedIds
  };

  if (r.getLastOp()) {
    finalResult.result.opTime = r.getLastOp();
  }

  return finalResult;
}

/**
 * Inserts an array of documents into MongoDB. If documents passed in do not contain the **_id** field,
 * one will be added to each of the documents missing it by the driver, mutating the document. This behavior
 * can be overridden by setting the **forceServerObjectId** flag.
 *
 * @method
 * @param {object[]} docs Documents to insert.
 * @param {object} [options] Optional settings.
 * @param {(number|string)} [options.w] The write concern.
 * @param {number} [options.wtimeout] The write concern timeout.
 * @param {boolean} [options.j] Specify a journal write concern.
 * @param {boolean} [options.serializeFunctions=false] Serialize functions on any object.
 * @param {boolean} [options.forceServerObjectId=false] Force server to assign _id values instead of driver.
 * @param {boolean} [options.bypassDocumentValidation] Allow driver to bypass schema validation in MongoDB 3.2 or higher.
 * @param {boolean} [options.ordered=true] If true, when an insert fails, don't execute the remaining writes. If false, continue with remaining inserts when one fails.
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Collection~insertWriteOpCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 */
Collection.prototype.insertMany = function(docs, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = options ? Object.assign({}, options) : { ordered: true };

  validate(insertManySchema, options, { optionsValidationLevel: this.optionsValidationLevel });

  options = applyDefaults(
    insertManySchema,
    options,
    { serializeFunctions: this.s.serializeFunctions },
    { ignoreUndefined: this.s.options.ignoreUndefined }
  );

  if (!Array.isArray(docs) && typeof callback === 'function') {
    return callback(
      MongoError.create({ message: 'docs parameter must be an array of documents', driver: true })
    );
  } else if (!Array.isArray(docs)) {
    return new this.s.promiseLibrary((resolve, reject) => {
      reject(
        MongoError.create({ message: 'docs parameter must be an array of documents', driver: true })
      );
    });
  }

  docs = prepareDocs(this, docs, options);

  // Generate the bulk write operations
  const operations = [
    {
      insertMany: docs
    }
  ];

  return executeOperation(this.s.topology, bulkWrite, [this, operations, options, callback], {
    resultMutator: result => mapInsertManyResults(docs, result)
  });
};

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
 * @param {object} [options] Optional settings.
 * @param {(number|string)} [options.w] The write concern.
 * @param {number} [options.wtimeout] The write concern timeout.
 * @param {boolean} [options.j] Specify a journal write concern.
 * @param {boolean} [options.serializeFunctions=false] Serialize functions on any object.
 * @param {boolean} [options.ordered=true] Execute write operation in ordered or unordered fashion.
 * @param {boolean} [options.bypassDocumentValidation] Allow driver to bypass schema validation in MongoDB 3.2 or higher.
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Collection~bulkWriteOpCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 */
Collection.prototype.bulkWrite = function(operations, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});

  if (!Array.isArray(operations)) {
    throw MongoError.create({ message: 'operations must be an array of documents', driver: true });
  }

  validate(bulkWriteSchema, options, { optionsValidationLevel: this.optionsValidationLevel });

  options = applyDefaults(
    bulkWriteSchema,
    options,
    {},
    { ignoreUndefined: this.s.options.ignoreUndefined }
  );

  return executeOperation(this.s.topology, bulkWrite, [this, operations, options, callback]);
};

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
 * @param {object} [options] Optional settings.
 * @param {(number|string)} [options.w] The write concern.
 * @param {number} [options.wtimeout] The write concern timeout.
 * @param {boolean} [options.j] Specify a journal write concern.
 * @param {boolean} [options.serializeFunctions=false] Serialize functions on any object.
 * @param {boolean} [options.forceServerObjectId=false] Force server to assign _id values instead of driver.
 * @param {boolean} [options.bypassDocumentValidation] Allow driver to bypass schema validation in MongoDB 3.2 or higher.
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Collection~insertWriteOpCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 * @deprecated Use insertOne, insertMany or bulkWrite
 */
Collection.prototype.insert = deprecate(function(docs, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = options || { ordered: false };
  docs = !Array.isArray(docs) ? [docs] : docs;

  if (options.keepGoing === true) {
    options.ordered = false;
  }

  return this.insertMany(docs, options, callback);
}, 'collection.insert is deprecated. Use insertOne, insertMany or bulkWrite instead.');

/**
 * @typedef {Object} Collection~updateWriteOpResult
 * @property {Object} result The raw result returned from MongoDB. Will vary depending on server version.
 * @property {Number} result.ok Is 1 if the command executed correctly.
 * @property {Number} result.n The total count of documents scanned.
 * @property {Number} result.nModified The total count of documents modified.
 * @property {Object} connection The connection object used for the operation.
 * @property {Number} matchedCount The number of documents that matched the filter.
 * @property {Number} modifiedCount The number of documents that were modified.
 * @property {Number} upsertedCount The number of documents upserted.
 * @property {Object} upsertedId The upserted id.
 * @property {ObjectId} upsertedId._id The upserted _id returned from the server.
 * @property {Object} message
 * @property {Array} ops
 */

/**
 * The callback format for inserts
 * @callback Collection~updateWriteOpCallback
 * @param {MongoError} error An error instance representing the error during the execution.
 * @param {Collection~updateWriteOpResult} result The result object if the command was executed successfully.
 */

/**
 * Update a single document in a collection
 * @method
 * @param {object} filter The Filter used to select the document to update
 * @param {object} update The update operations to be applied to the document
 * @param {object} [options] Optional settings.
 * @param {boolean} [options.upsert] Update operation is an upsert.
 * @param {(number|string)} [options.w] The write concern.
 * @param {number} [options.wtimeout] The write concern timeout.
 * @param {boolean} [options.j] Specify a journal write concern.
 * @param {boolean} [options.bypassDocumentValidation] Allow driver to bypass schema validation in MongoDB 3.2 or higher.
 * @param {array} [options.arrayFilters] optional list of array filters referenced in filtered positional operators
 * @param {object} [options.collation] Specify collation (MongoDB 3.4 or higher) settings for update operation (see 3.4 documentation for available fields).
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Collection~updateWriteOpCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 */
Collection.prototype.updateOne = function(filter, update, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});

  const err = checkForAtomicOperators(update);
  if (err) {
    if (typeof callback === 'function') return callback(err);
    return this.s.promiseLibrary.reject(err);
  }

  validate(updateOneSchema, options, { optionsValidationLevel: this.optionsValidationLevel });

  options = applyDefaults(
    updateOneSchema,
    options,
    {},
    {
      ignoreUndefined: this.s.options.ignoreUndefined,
      multi: false
    }
  );

  return executeOperation(this.s.topology, updateOne, [this, filter, update, options, callback]);
};

/**
 * Replace a document in a collection with another document
 * @method
 * @param {object} filter The Filter used to select the document to replace
 * @param {object} doc The Document that replaces the matching document
 * @param {object} [options] Optional settings.
 * @param {boolean} [options.upsert] Update operation is an upsert.
 * @param {(number|string)} [options.w] The write concern.
 * @param {number} [options.wtimeout] The write concern timeout.
 * @param {boolean} [options.j] Specify a journal write concern.
 * @param {boolean} [options.bypassDocumentValidation] Allow driver to bypass schema validation in MongoDB 3.2 or higher.
 * @param {object} [options.collation] Specify collation (MongoDB 3.4 or higher) settings for replace operation (see 3.4 documentation for available fields).
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Collection~updateWriteOpCallback} [callback] The command result callback
 * @return {Promise<Collection~updatewriteOpResultObject>} returns Promise if no callback passed
 */
Collection.prototype.replaceOne = function(filter, doc, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});

  validate(replaceOneSchema, options, { optionsValidationLevel: this.optionsValidationLevel });

  options = applyDefaults(
    replaceOneSchema,
    options,
    {},
    {
      ignoreUndefined: this.s.options.ignoreUndefined,
      multi: false
    }
  );

  return executeOperation(this.s.topology, replaceOne, [this, filter, doc, options, callback]);
};

/**
 * Update multiple documents in a collection
 * @method
 * @param {object} filter The Filter used to select the documents to update
 * @param {object} update The update operations to be applied to the documents
 * @param {object} [options] Optional settings.
 * @param {boolean} [options.upsert] Update operation is an upsert.
 * @param {(number|string)} [options.w] The write concern.
 * @param {number} [options.wtimeout] The write concern timeout.
 * @param {boolean} [options.j] Specify a journal write concern.
 * @param {array} [options.arrayFilters] optional list of array filters referenced in filtered positional operators
 * @param {boolean} [options.bypassDocumentValidation] Allow driver to bypass schema validation in MongoDB 3.2 or higher.
 * @param {object} [options.collation] Specify collation (MongoDB 3.4 or higher) settings for update operation (see 3.4 documentation for available fields).
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Collection~updateWriteOpCallback} [callback] The command result callback
 * @return {Promise<Collection~updateWriteOpResultObject>} returns Promise if no callback passed
 */
Collection.prototype.updateMany = function(filter, update, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});

  const err = checkForAtomicOperators(update);
  if (err) {
    if (typeof callback === 'function') return callback(err);
    return this.s.promiseLibrary.reject(err);
  }

  validate(updateManySchema, options, { optionsValidationLevel: this.optionsValidationLevel });

  options = applyDefaults(
    updateManySchema,
    options,
    {},
    {
      ignoreUndefined: this.s.options.ignoreUndefined,
      multi: true
    }
  );

  return executeOperation(this.s.topology, updateMany, [this, filter, update, options, callback]);
};

/**
 * Updates documents.
 * @method
 * @param {object} selector The selector for the update operation.
 * @param {object} update The update operations to be applied to the documents
 * @param {object} [options] Optional settings.
 * @param {(number|string)} [options.w] The write concern.
 * @param {number} [options.wtimeout] The write concern timeout.
 * @param {boolean} [options.j=false] Specify a journal write concern.
 * @param {boolean} [options.upsert=false] Update operation is an upsert.
 * @param {boolean} [options.multi=false] Update one/all documents with operation.
 * @param {boolean} [options.bypassDocumentValidation] Allow driver to bypass schema validation in MongoDB 3.2 or higher.
 * @param {object} [options.collation] Specify collation (MongoDB 3.4 or higher) settings for update operation (see 3.4 documentation for available fields).
 * @param {Array} [options.arrayFilters] optional list of array filters referenced in filtered positional operators
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Collection~writeOpCallback} [callback] The command result callback
 * @throws {MongoError}
 * @return {Promise} returns Promise if no callback passed
 * @deprecated use updateOne, updateMany or bulkWrite
 */
Collection.prototype.update = deprecate(function(selector, update, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = options || {};

  // Add ignoreUndfined
  if (this.s.options.ignoreUndefined) {
    options = Object.assign({}, options);
    options.ignoreUndefined = this.s.options.ignoreUndefined;
  }

  return executeOperation(this.s.topology, updateDocuments, [
    this,
    selector,
    update,
    options,
    callback
  ]);
}, 'collection.update is deprecated. Use updateOne, updateMany, or bulkWrite instead.');

/**
 * @typedef {Object} Collection~deleteWriteOpResult
 * @property {Object} result The raw result returned from MongoDB. Will vary depending on server version.
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
 * Delete a document from a collection
 * @method
 * @param {object} filter The Filter used to select the document to remove
 * @param {object} [options] Optional settings.
 * @param {(number|string)} [options.w] The write concern.
 * @param {number} [options.wtimeout] The write concern timeout.
 * @param {boolean} [options.j] Specify a journal write concern.
 * @param {object} [options.collation] Specify collation (MongoDB 3.4 or higher) settings for remove operation (see 3.4 documentation for available fields).
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Collection~deleteWriteOpCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 */
Collection.prototype.deleteOne = function(filter, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});

  validate(deleteOneSchema, options, { optionsValidationLevel: this.optionsValidationLevel });

  options = applyDefaults(
    deleteOneSchema,
    options,
    {},
    {
      ignoreUndefined: this.s.options.ignoreUndefined,
      single: true
    }
  );

  return executeOperation(this.s.topology, deleteOne, [this, filter, options, callback]);
};

Collection.prototype.removeOne = Collection.prototype.deleteOne;

/**
 * Delete multiple documents from a collection
 * @method
 * @param {object} filter The Filter used to select the documents to remove
 * @param {object} [options] Optional settings.
 * @param {(number|string)} [options.w] The write concern.
 * @param {number} [options.wtimeout] The write concern timeout.
 * @param {boolean} [options.j] Specify a journal write concern.
 * @param {object} [options.collation] Specify collation (MongoDB 3.4 or higher) settings for remove operation (see 3.4 documentation for available fields).
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Collection~deleteWriteOpCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 */
Collection.prototype.deleteMany = function(filter, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});

  validate(deleteManySchema, options, { optionsValidationLevel: this.optionsValidationLevel });

  options = applyDefaults(
    deleteManySchema,
    options,
    {},
    {
      ignoreUndefined: this.s.options.ignoreUndefined,
      single: false
    }
  );

  return executeOperation(this.s.topology, deleteMany, [this, filter, options, callback]);
};

Collection.prototype.removeMany = Collection.prototype.deleteMany;

/**
 * Remove documents.
 * @method
 * @param {object} selector The selector for the update operation.
 * @param {object} [options] Optional settings.
 * @param {(number|string)} [options.w] The write concern.
 * @param {number} [options.wtimeout] The write concern timeout.
 * @param {boolean} [options.j=false] Specify a journal write concern.
 * @param {boolean} [options.single=false] Removes the first document found.
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Collection~writeOpCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 * @deprecated use deleteOne, deleteMany or bulkWrite
 */
Collection.prototype.remove = deprecate(function(selector, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = options || {};

  // Add ignoreUndfined
  if (this.s.options.ignoreUndefined) {
    options = Object.assign({}, options);
    options.ignoreUndefined = this.s.options.ignoreUndefined;
  }

  return executeOperation(this.s.topology, removeDocuments, [this, selector, options, callback]);
}, 'collection.remove is deprecated. Use deleteOne, deleteMany, or bulkWrite instead.');

/**
 * Save a document. Simple full document replacement function. Not recommended for efficiency, use atomic
 * operators and update instead for more efficient operations.
 * @method
 * @param {object} doc Document to save
 * @param {object} [options] Optional settings.
 * @param {(number|string)} [options.w] The write concern.
 * @param {number} [options.wtimeout] The write concern timeout.
 * @param {boolean} [options.j=false] Specify a journal write concern.
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Collection~writeOpCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 * @deprecated use insertOne, insertMany, updateOne or updateMany
 */
Collection.prototype.save = deprecate(function(doc, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = options || {};

  // Add ignoreUndfined
  if (this.s.options.ignoreUndefined) {
    options = Object.assign({}, options);
    options.ignoreUndefined = this.s.options.ignoreUndefined;
  }

  return executeOperation(this.s.topology, save, [this, doc, options, callback]);
}, 'collection.save is deprecated. Use insertOne, insertMany, updateOne, or updateMany instead.');

/**
 * The callback format for results
 * @callback Collection~resultCallback
 * @param {MongoError} error An error instance representing the error during the execution.
 * @param {object} result The result object if the command was executed successfully.
 */

/**
 * The callback format for an aggregation call
 * @callback Collection~aggregationCallback
 * @param {MongoError} error An error instance representing the error during the execution.
 * @param {AggregationCursor} cursor The cursor if the aggregation command was executed successfully.
 */

/**
 * Fetches the first document that matches the query
 * @method
 * @param {object} query Query for find Operation
 * @param {object} [options] Optional settings.
 * @param {object} [options.projection] The fields to return in the query. Object of fields to include or exclude (not both), {'a':1}
 * @param {object} [options.fields] **Deprecated** Use `options.projection` instead
 * @param {string|object} [options.hint] Tell the query to use specific indexes in the query. Object of indexes to use, {'_id':1}
 * @param {boolean} [options.explain] Explain the query instead of returning the data.
 * @param {boolean} [options.snapshot] DEPRECATED: Snapshot query.
 * @param {boolean} [options.timeout] Specify if the cursor can timeout.
 * @param {boolean} [options.tailable] Specify if the cursor is tailable.
 * @param {number} [options.batchSize] Set the batchSize for the getMoreCommand when iterating over the query results.
 * @param {boolean} [options.returnKey] Only return the index key.
 * @param {number} [options.maxScan] DEPRECATED: Limit the number of items to scan.
 * @param {number} [options.min] Set index bounds.
 * @param {number} [options.max] Set index bounds.
 * @param {boolean} [options.showDiskLoc=false] DEPRECATED. Show disk location of results.
 * @param {boolean} [options.showRecordId] Return the record identifier for each document.
 * @param {string} [options.comment] You can put a $comment field on a query to make looking in the profiler logs simpler.
 * @param {boolean} [options.raw=false] Return document results as raw BSON buffers.
 * @param {boolean} [options.promoteLongs=true] Promotes Long values to number if they fit inside the 53 bits resolution.
 * @param {boolean} [options.promoteValues=true] Promotes BSON values to native types where possible, set to false to only receive wrapper types.
 * @param {boolean} [options.promoteBuffers=false] Promotes Binary BSON values to native Node Buffers.
 * @param {(ReadPreference|string)} [options.readPreference] The preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
 * @param {boolean} [options.partial] Specify if the cursor should return partial results when querying against a sharded system
 * @param {number} [options.maxTimeMS] Number of miliseconds to wait before aborting the query.
 * @param {object} [options.collation] Specify collation (MongoDB 3.4 or higher) settings for update operation (see 3.4 documentation for available fields).
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Collection~resultCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 */
Collection.prototype.findOne = deprecateOptions(
  {
    name: 'collection.find',
    deprecatedOptions: DEPRECATED_FIND_OPTIONS,
    optionsIndex: 1
  },
  function(query, options, callback) {
    if (typeof callback === 'object') {
      // TODO(MAJOR): throw in the future
      console.warn('Third parameter to `findOne()` must be a callback or undefined');
    }

    if (typeof query === 'function') (callback = query), (query = {}), (options = {});
    if (typeof options === 'function') (callback = options), (options = {});
    query = query || {};

    validate(findOneSchema, options, { optionsValidationLevel: this.optionsValidationLevel });

    options = applyDefaults(findOneSchema, options, {});

    return executeOperation(this.s.topology, findOne, [this, query, options, callback]);
  }
);

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
 * @param {object} [options] Optional settings.
 * @param {boolean} [options.dropTarget=false] Drop the target name collection if it previously exists.
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Collection~collectionResultCallback} [callback] The results callback
 * @return {Promise} returns Promise if no callback passed
 */
Collection.prototype.rename = function(newName, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});

  validate(renameSchema, options, { optionsValidationLevel: this.optionsValidationLevel });

  options = applyDefaults(renameSchema, options, {}, { readPreference: ReadPreference.primary });

  return executeOperation(this.s.topology, rename, [this, newName, options, callback]);
};

/**
 * Drop the collection from the database, removing it permanently. New accesses will create a new collection.
 *
 * @method
 * @param {object} [options] Optional settings.
 * @param {(number|string)} [options.w] The write concern.
 * @param {number} [options.wtimeout] The write concern timeout.
 * @param {boolean} [options.j] Specify a journal write concern.
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Collection~resultCallback} [callback] The results callback
 * @return {Promise} returns Promise if no callback passed
 */
Collection.prototype.drop = function(options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});

  validate(dropSchema, options, { optionsValidationLevel: this.optionsValidationLevel });

  options = applyDefaults(dropSchema, options, {}, { readPreference: ReadPreference.primary });

  // Command to execute
  const cmd = { drop: this.s.name };

  // Decorate with write concern
  applyWriteConcern(cmd, { db: this }, options);

  return executeOperation(this.s.topology, dropCollection, [this.s.db, cmd, options, callback]);
};

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

  validate(optionsSchema, opts, { optionsValidationLevel: this.optionsValidationLevel });

  const finalOpts = applyDefaults(optionsSchema, opts, {});

  return executeOperation(this.s.topology, optionsOp, [this, finalOpts, callback]);
};

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

  validate(isCappedSchema, options, { optionsValidationLevel: this.optionsValidationLevel });

  options = applyDefaults(isCappedSchema, options, {});

  return executeOperation(this.s.topology, isCapped, [this, options, callback]);
};

/**
 * Creates an index on the db and collection collection.
 * @method
 * @param {(string|object)} fieldOrSpec Defines the index.
 * @param {object} [options] Optional settings.
 * @param {(number|string)} [options.w] The write concern.
 * @param {number} [options.wtimeout] The write concern timeout.
 * @param {boolean} [options.j] Specify a journal write concern.
 * @param {boolean} [options.unique=false] Creates an unique index.
 * @param {boolean} [options.sparse] Creates a sparse index.
 * @param {boolean} [options.background] Creates the index in the background, yielding whenever possible.
 * @param {boolean} [options.dropDups] A unique index cannot be created on a key that has pre-existing duplicate values. If you would like to create the index anyway, keeping the first document the database indexes and deleting all subsequent documents that have duplicate value
 * @param {number} [options.min] For geospatial indexes set the lower bound for the co-ordinates.
 * @param {number} [options.max] For geospatial indexes set the high bound for the co-ordinates.
 * @param {number} [options.v] Specify the format version of the indexes.
 * @param {number} [options.expireAfterSeconds] Allows you to expire data on indexes applied to a data (MongoDB 2.2 or higher)
 * @param {string} [options.name] Override the autogenerated index name (useful if the resulting name is larger than 128 bytes)
 * @param {object} [options.partialFilterExpression] Creates a partial index based on the given filter object (MongoDB 3.2 or higher)
 * @param {object} [options.collation] Specify collation (MongoDB 3.4 or higher) settings for createIndex operation (see 3.4 documentation for available fields).
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Collection~resultCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 */
Collection.prototype.createIndex = function(fieldOrSpec, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});

  validate(createIndexSchema, options, { optionsValidationLevel: this.optionsValidationLevel });

  options = applyDefaults(
    createIndexSchema,
    options,
    {},
    { readPreference: ReadPreference.primary }
  );

  return executeOperation(this.s.topology, createIndex, [this, fieldOrSpec, options, callback]);
};

/**
 * Creates multiple indexes in the collection, this method is only supported for
 * MongoDB 2.6 or higher. Earlier version of MongoDB will throw a command not supported
 * error. Index specifications are defined at http://docs.mongodb.org/manual/reference/command/createIndexes/.
 * @method
 * @param {array} indexSpecs An array of index specifications to be created
 * @param {Object} [options] Optional settings
 * @param {(number|string)} [options.w] The write concern.
 * @param {number} [options.wtimeout] The write concern timeout.
 * @param {boolean} [options.j] Specify a journal write concern.
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {number} [options.maxTimeMS] Number of milliseconds to wait before aborting the query.
 * @param {Collection~resultCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 */
Collection.prototype.createIndexes = function(indexSpecs, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});

  validate(createIndexesSchema, options, { optionsValidationLevel: this.optionsValidationLevel });

  options = applyDefaults(
    createIndexesSchema,
    options,
    {},
    { readPreference: ReadPreference.primary }
  );

  return executeOperation(this.s.topology, createIndexes, [this, indexSpecs, options, callback]);
};

/**
 * Drops an index from this collection.
 * @method
 * @param {string} indexName Name of the index to drop.
 * @param {object} [options] Optional settings.
 * @param {(number|string)} [options.w] The write concern.
 * @param {number} [options.wtimeout] The write concern timeout.
 * @param {boolean} [options.j] Specify a journal write concern.
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {number} [options.maxTimeMS] Number of milliseconds to wait before aborting the query.
 * @param {Collection~resultCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 */
Collection.prototype.dropIndex = function(indexName, options, callback) {
  const args = Array.prototype.slice.call(arguments, 1);
  callback = typeof args[args.length - 1] === 'function' ? args.pop() : undefined;
  options = args.length ? args.shift() || {} : {};

  validate(dropIndexSchema, options, { optionsValidationLevel: this.optionsValidationLevel });

  options = applyDefaults(dropIndexSchema, options, {}, { readPreference: ReadPreference.primary });

  return executeOperation(this.s.topology, dropIndex, [this, indexName, options, callback]);
};

/**
 * Drops all indexes from this collection.
 * @method
 * @param {Object} [options] Optional settings
 * @param {(number|string)} [options.w] The write concern.
 * @param {number} [options.wtimeout] The write concern timeout.
 * @param {boolean} [options.j] Specify a journal write concern.
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {number} [options.maxTimeMS] Number of milliseconds to wait before aborting the query.
 * @param {Collection~resultCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 */
Collection.prototype.dropIndexes = function(options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});

  validate(dropIndexesSchema, options, { optionsValidationLevel: this.optionsValidationLevel });

  options = applyDefaults(dropIndexesSchema, options, {});

  return executeOperation(this.s.topology, dropIndexes, [this, options, callback]);
};

/**
 * Drops all indexes from this collection.
 * @method
 * @deprecated use dropIndexes
 * @param {Collection~resultCallback} callback The command result callback
 * @return {Promise} returns Promise if no [callback] passed
 */
Collection.prototype.dropAllIndexes = deprecate(
  Collection.prototype.dropIndexes,
  'collection.dropAllIndexes is deprecated. Use dropIndexes instead.'
);

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

  validate(reIndexSchema, options, { optionsValidationLevel: this.optionsValidationLevel });

  options = applyDefaults(reIndexSchema, options, {});

  return executeOperation(this.s.topology, reIndex, [this, options, callback]);
};

/**
 * Get the list of all indexes information for the collection.
 *
 * @method
 * @param {object} [options] Optional settings.
 * @param {number} [options.batchSize] The batchSize for the returned command cursor or if pre 2.8 the systems batch collection
 * @param {(ReadPreference|string)} [options.readPreference] The preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @return {CommandCursor}
 */
Collection.prototype.listIndexes = function(options) {
  if (!this.s.topology.capabilities()) {
    throw new MongoError('cannot connect to server');
  }

  validate(listIndexesSchema, options, { optionsValidationLevel: this.optionsValidationLevel });

  options = applyDefaults(
    listIndexesSchema,
    options,
    {},
    {
      readPreference: resolveReadPreference(options, { db: this.s.db, collection: this }),
      cursorFactory: CommandCursor,
      promiseLibrary: this.s.promiseLibrary,
      optionsValidationLevel: this.optionsValidationLevel
    }
  );

  return listIndexes(this, options);
};

/**
 * Ensures that an index exists, if it does not it creates it
 * @method
 * @deprecated use createIndexes instead
 * @param {(string|object)} fieldOrSpec Defines the index.
 * @param {object} [options] Optional settings.
 * @param {(number|string)} [options.w] The write concern.
 * @param {number} [options.wtimeout] The write concern timeout.
 * @param {boolean} [options.j=false] Specify a journal write concern.
 * @param {boolean} [options.unique=false] Creates an unique index.
 * @param {boolean} [options.sparse=false] Creates a sparse index.
 * @param {boolean} [options.background=false] Creates the index in the background, yielding whenever possible.
 * @param {boolean} [options.dropDups=false] A unique index cannot be created on a key that has pre-existing duplicate values. If you would like to create the index anyway, keeping the first document the database indexes and deleting all subsequent documents that have duplicate value
 * @param {number} [options.min] For geospatial indexes set the lower bound for the co-ordinates.
 * @param {number} [options.max] For geospatial indexes set the high bound for the co-ordinates.
 * @param {number} [options.v] Specify the format version of the indexes.
 * @param {number} [options.expireAfterSeconds] Allows you to expire data on indexes applied to a data (MongoDB 2.2 or higher)
 * @param {number} [options.name] Override the autogenerated index name (useful if the resulting name is larger than 128 bytes)
 * @param {object} [options.collation] Specify collation (MongoDB 3.4 or higher) settings for update operation (see 3.4 documentation for available fields).
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Collection~resultCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 */
Collection.prototype.ensureIndex = deprecate(function(fieldOrSpec, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = options || {};

  return executeOperation(this.s.topology, ensureIndex, [this, fieldOrSpec, options, callback]);
}, 'collection.ensureIndex is deprecated. Use createIndexes instead.');

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

  validate(indexExistsSchema, options, { optionsValidationLevel: this.optionsValidationLevel });

  options = applyDefaults(indexExistsSchema, options, {});

  return executeOperation(this.s.topology, indexExists, [this, indexes, options, callback]);
};

/**
 * Retrieves this collections index info.
 * @method
 * @param {object} [options] Optional settings.
 * @param {boolean} [options.full=false] Returns the full raw index information.
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Collection~resultCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 */
Collection.prototype.indexInformation = function(options, callback) {
  const args = Array.prototype.slice.call(arguments, 0);
  callback = typeof args[args.length - 1] === 'function' ? args.pop() : undefined;

  validate(indexInformationSchema, options, {
    optionsValidationLevel: this.optionsValidationLevel
  });

  options = applyDefaults(indexInformationSchema, options, {});

  return executeOperation(this.s.topology, indexInformation, [this, options, callback]);
};

/**
 * The callback format for results
 * @callback Collection~countCallback
 * @param {MongoError} error An error instance representing the error during the execution.
 * @param {number} result The count of documents that matched the query.
 */

/**
 * Count number of matching documents in the db to a query.
 * @method
 * @param {object} [query={}] The query for the count.
 * @param {object} [options] Optional settings.
 * @param {boolean} [options.limit] The limit of documents to count.
 * @param {boolean} [options.skip] The number of documents to skip for the count.
 * @param {string} [options.hint] An index name hint for the query.
 * @param {(ReadPreference|string)} [options.readPreference] The preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
 * @param {number} [options.maxTimeMS] Number of miliseconds to wait before aborting the query.
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Collection~countCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 * @deprecated use {@link Collection#countDocuments countDocuments} or {@link Collection#estimatedDocumentCount estimatedDocumentCount} instead
 */
Collection.prototype.count = deprecate(function(query, options, callback) {
  const args = Array.prototype.slice.call(arguments, 0);
  callback = typeof args[args.length - 1] === 'function' ? args.pop() : undefined;
  query = args.length ? args.shift() || {} : {};
  options = args.length ? args.shift() || {} : {};

  return executeOperation(this.s.topology, count, [this, query, options, callback]);
}, 'collection.count is deprecated, and will be removed in a future version.' +
  ' Use collection.countDocuments or collection.estimatedDocumentCount instead');

/**
 * Gets an estimate of the count of documents in a collection using collection metadata.
 *
 * @method
 * @param {object} [options] Optional settings.
 * @param {number} [options.maxTimeMS] The maximum amount of time to allow the operation to run.
 * @param {object} [options.readConcern] Specify a read concern for the operation. (only MongoDB 3.2 or higher supported)
 * @param {Collection~countCallback} [callback] The command result callback.
 * @return {Promise} returns Promise if no callback passed.
 */
Collection.prototype.estimatedDocumentCount = function(options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});

  validate(estimatedDocumentCountSchema, options, {
    optionsValidationLevel: this.optionsValidationLevel
  });

  options = applyDefaults(estimatedDocumentCountSchema, options, {});

  return executeOperation(this.s.topology, count, [this, null, options, callback]);
};

/**
 * Gets the number of documents matching the filter.
 *
 * **Note**: When migrating from {@link Collection#count count} to {@link Collection#countDocuments countDocuments}
 * the following query operators must be replaced:
 *
 * | Operator | Replacement |
 * | -------- | ----------- |
 * | `$where`   | [`$expr`][1] |
 * | `$near`    | [`$geoWithin`][2] with [`$center`][3] |
 * | `$nearSphere` | [`$geoWithin`][2] with [`$centerSphere`][4] |
 *
 * [1]: https://docs.mongodb.com/manual/reference/operator/query/expr/
 * [2]: https://docs.mongodb.com/manual/reference/operator/query/geoWithin/
 * [3]: https://docs.mongodb.com/manual/reference/operator/query/center/#op._S_center
 * [4]: https://docs.mongodb.com/manual/reference/operator/query/centerSphere/#op._S_centerSphere
 *
 * @param {object} [query] the query for the count
 * @param {object} [options] Optional settings.
 * @param {object} [options.collation] Specifies a collation.
 * @param {string|object} [options.hint] The index to use.
 * @param {number} [options.limit] The maximum number of document to count.
 * @param {number} [options.maxTimeMS] The maximum amount of time to allow the operation to run.
 * @param {number} [options.skip] The number of documents to skip before counting.
 * @param {object} [options.readConcern] Specify a read concern for the operation. (only MongoDB 3.2 or higher supported)
 * @param {Collection~countCallback} [callback] The command result callback.
 * @return {Promise} returns Promise if no callback passed.
 * @see https://docs.mongodb.com/manual/reference/operator/query/expr/
 * @see https://docs.mongodb.com/manual/reference/operator/query/geoWithin/
 * @see https://docs.mongodb.com/manual/reference/operator/query/center/#op._S_center
 * @see https://docs.mongodb.com/manual/reference/operator/query/centerSphere/#op._S_centerSphere
 */
Collection.prototype.countDocuments = function(query, options, callback) {
  const args = Array.prototype.slice.call(arguments, 0);
  callback = typeof args[args.length - 1] === 'function' ? args.pop() : undefined;
  query = args.length ? args.shift() || {} : {};
  options = args.length ? args.shift() || {} : {};

  validate(countDocumentsSchema, options, { optionsValidationLevel: this.optionsValidationLevel });

  options = applyDefaults(countDocumentsSchema, options, {});

  return executeOperation(this.s.topology, countDocuments, [this, query, options, callback]);
};

/**
 * The distinct command returns returns a list of distinct values for the given key across a collection.
 * @method
 * @param {string} key Field of the document to find distinct values for.
 * @param {object} query The query for filtering the set of documents to which we apply the distinct filter.
 * @param {object} [options] Optional settings.
 * @param {object} [options.collation] Specifies a collation.
 * @param {(ReadPreference|string)} [options.readPreference] The preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
 * @param {number} [options.maxTimeMS] Number of milliseconds to wait before aborting the query.
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {object} [options.readConcern] Specify a read concern for the operation. (only MongoDB 3.2 or higher supported)
 * @param {Collection~resultCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 */
Collection.prototype.distinct = function(key, query, options, callback) {
  const args = Array.prototype.slice.call(arguments, 1);
  callback = typeof args[args.length - 1] === 'function' ? args.pop() : undefined;
  const queryOption = args.length ? args.shift() || {} : {};
  const optionsOption = args.length ? args.shift() || {} : {};

  validate(distinctSchema, optionsOption, { optionsValidationLevel: this.optionsValidationLevel });

  options = applyDefaults(
    distinctSchema,
    optionsOption,
    {},
    { readPreference: resolveReadPreference(options, { db: this.s.db, collection: this }) }
  );

  return executeOperation(this.s.topology, distinct, [this, key, queryOption, options, callback]);
};

/**
 * Retrieve all the indexes on the collection.
 * @method
 * @param {Object} [options] Optional settings
 * @param {number} [options.batchSize] The batchSize for the returned command cursor or if pre 2.8 the systems batch collection
 * @param {(ReadPreference|string)} [options.readPreference] The preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Collection~resultCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 */
Collection.prototype.indexes = function(options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});

  validate(indexesSchema, options, { optionsValidationLevel: this.optionsValidationLevel });

  options = applyDefaults(indexesSchema, options, {});

  return executeOperation(this.s.topology, indexes, [this, options, callback]);
};

/**
 * Get all the collection statistics.
 *
 * @method
 * @param {object} [options] Optional settings.
 * @param {(ReadPreference|string)} [options.readPreference] The preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
 * @param {number} [options.scale] Divide the returned sizes by scale value.
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Collection~resultCallback} [callback] The collection result callback
 * @return {Promise} returns Promise if no callback passed
 */
Collection.prototype.stats = function(options, callback) {
  const args = Array.prototype.slice.call(arguments, 0);
  callback = typeof args[args.length - 1] === 'function' ? args.pop() : undefined;

  validate(statsSchema, options, { optionsValidationLevel: this.optionsValidationLevel });

  options = applyDefaults(
    statsSchema,
    options,
    {},
    { readPreference: resolveReadPreference(options, { db: this.s.db, collection: this }) }
  );

  return executeOperation(this.s.topology, stats, [this, options, callback]);
};

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
 * Find a document and delete it in one atomic operation. Requires a write lock for the duration of the operation.
 *
 * @method
 * @param {object} filter The Filter used to select the document to remove
 * @param {object} [options] Optional settings.
 * @param {object} [options.collation] Specifies a collation.
 * @param {object} [options.projection] Limits the fields to return for all matching documents.
 * @param {object} [options.sort] Determines which document the operation modifies if the query selects multiple documents.
 * @param {number} [options.maxTimeMS] The maximum amount of time to allow the query to run.
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Collection~findAndModifyCallback} [callback] The collection result callback
 * @return {Promise<Collection~findAndModifyWriteOpResultObject>} returns Promise if no callback passed
 */
Collection.prototype.findOneAndDelete = function(filter, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});

  // Basic validation
  if (filter == null || typeof filter !== 'object')
    throw toError('filter parameter must be an object');

  validate(findOneAndDeleteSchema, options, {
    optionsValidationLevel: this.optionsValidationLevel
  });

  options = applyDefaults(
    findOneAndDeleteSchema,
    options,
    { serializeFunctions: this.s.serializeFunctions },
    {
      fields: options ? options.projection : null,
      remove: true,
      new: false,
      upsert: false,
      checkKeys: false,
      readPreference: ReadPreference.primary
    }
  );

  return executeOperation(this.s.topology, findOneAndDelete, [this, filter, options, callback]);
};

/**
 * Find a document and replace it in one atomic operation. Requires a write lock for the duration of the operation.
 *
 * @method
 * @param {object} filter The Filter used to select the document to replace
 * @param {object} replacement The Document that replaces the matching document
 * @param {object} [options] Optional settings.
 * @param {boolean} [options.bypassDocumentValidation] Allow driver to bypass schema validation in MongoDB 3.2 or higher.
 * @param {object} [options.collation] Specifies a collation.
 * @param {object} [options.projection] Limits the fields to return for all matching documents.
 * @param {object} [options.sort] Determines which document the operation modifies if the query selects multiple documents.
 * @param {number} [options.maxTimeMS] The maximum amount of time to allow the query to run.
 * @param {boolean} [options.upsert=false] Upsert the document if it does not exist.
 * @param {boolean} [options.returnOriginal] When false, returns the updated document rather than the original. The default is true.
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Collection~findAndModifyCallback} [callback] The collection result callback
 * @return {Promise<Collection~findAndModifyWriteOpResultObject>} returns Promise if no callback passed
 */
Collection.prototype.findOneAndReplace = function(filter, replacement, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});

  // Basic validation
  if (filter == null || typeof filter !== 'object')
    throw toError('filter parameter must be an object');
  if (replacement == null || typeof replacement !== 'object')
    throw toError('replacement parameter must be an object');

  validate(findOneAndReplaceSchema, options, {
    optionsValidationLevel: this.optionsValidationLevel
  });

  options = applyDefaults(
    findOneAndReplaceSchema,
    options,
    { serializeFunctions: this.s.serializeFunctions },
    {
      fields: options ? options.projection : null,
      update: true,
      new: options ? (options.returnOriginal !== void 0 ? !options.returnOriginal : false) : null,
      remove: false,
      checkKeys: false,
      readPreference: ReadPreference.primary
    }
  );

  return executeOperation(this.s.topology, findOneAndReplace, [
    this,
    filter,
    replacement,
    options,
    callback
  ]);
};

/**
 * Find a document and update it in one atomic operation. Requires a write lock for the duration of the operation.
 *
 * @method
 * @param {object} filter The Filter used to select the document to update
 * @param {object} update Update operations to be performed on the document
 * @param {object} [options] Optional settings.
 * @param {boolean} [options.bypassDocumentValidation] Allow driver to bypass schema validation in MongoDB 3.2 or higher.
 * @param {object} [options.collation] Specifies a collation.
 * @param {object} [options.projection] Limits the fields to return for all matching documents.
 * @param {object} [options.sort] Determines which document the operation modifies if the query selects multiple documents.
 * @param {number} [options.maxTimeMS] The maximum amount of time to allow the query to run.
 * @param {boolean} [options.upsert=false] Upsert the document if it does not exist.
 * @param {boolean} [options.returnOriginal] When false, returns the updated document rather than the original. The default is true.
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {array} [options.arrayFilters] optional list of array filters referenced in filtered positional operators
 * @param {Collection~findAndModifyCallback} [callback] The collection result callback
 * @return {Promise<Collection~findAndModifyWriteOpResultObject>} returns Promise if no callback passed
 */
Collection.prototype.findOneAndUpdate = function(filter, update, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});

  // Basic validation
  if (filter == null || typeof filter !== 'object')
    throw toError('filter parameter must be an object');
  if (update == null || typeof update !== 'object')
    throw toError('update parameter must be an object');

  const err = checkForAtomicOperators(update);
  if (err) {
    if (typeof callback === 'function') return callback(err);
    return this.s.promiseLibrary.reject(err);
  }

  validate(findOneAndUpdateSchema, options, {
    optionsValidationLevel: this.optionsValidationLevel
  });

  options = applyDefaults(
    findOneAndUpdateSchema,
    options,
    { serializeFunctions: this.s.serializeFunctions },
    {
      fields: options ? options.projection : null,
      update: true,
      new: options ? (options.returnOriginal !== void 0 ? !options.returnOriginal : false) : null,
      remove: false,
      checkKeys: false,
      readPreference: ReadPreference.primary
    }
  );

  return executeOperation(this.s.topology, findOneAndUpdate, [
    this,
    filter,
    update,
    options,
    callback
  ]);
};

/**
 * Find and update a document.
 * @method
 * @param {object} query Query object to locate the object to modify.
 * @param {array} sort If multiple docs match, choose the first one in the specified sort order as the object to manipulate.
 * @param {object} doc The fields/vals to be updated.
 * @param {object} [options] Optional settings.
 * @param {(number|string)} [options.w] The write concern.
 * @param {number} [options.wtimeout] The write concern timeout.
 * @param {boolean} [options.j=false] Specify a journal write concern.
 * @param {boolean} [options.remove=false] Set to true to remove the object before returning.
 * @param {boolean} [options.upsert=false] Perform an upsert operation.
 * @param {boolean} [options.new=false] Set to true if you want to return the modified object rather than the original. Ignored for remove.
 * @param {object} [options.projection] Object containing the field projection for the result returned from the operation.
 * @param {object} [options.fields] **Deprecated** Use `options.projection` instead
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Array} [options.arrayFilters] optional list of array filters referenced in filtered positional operators
 * @param {Collection~findAndModifyCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 * @deprecated use findOneAndUpdate, findOneAndReplace or findOneAndDelete instead
 */
Collection.prototype.findAndModify = deprecate(function(query, sort, doc, options, callback) {
  const args = Array.prototype.slice.call(arguments, 1);
  callback = typeof args[args.length - 1] === 'function' ? args.pop() : undefined;
  sort = args.length ? args.shift() || [] : [];
  doc = args.length ? args.shift() : null;
  options = args.length ? args.shift() || {} : {};

  validate(findAndModifySchema, options, { optionsValidationLevel: this.optionsValidationLevel });

  // Validate options
  options = applyDefaults(
    findAndModifySchema,
    options,
    { serializeFunctions: this.s.serializeFunctions },
    { readPreference: ReadPreference.primary, checkKeys: false }
  );

  return executeOperation(this.s.topology, findAndModify, [
    this,
    query,
    sort,
    doc,
    options,
    callback
  ]);
}, 'collection.findAndModify is deprecated. Use findOneAndUpdate, findOneAndReplace or findOneAndDelete instead.');

/**
 * Find and remove a document.
 * @method
 * @param {object} query Query object to locate the object to modify.
 * @param {array} sort If multiple docs match, choose the first one in the specified sort order as the object to manipulate.
 * @param {object} [options] Optional settings.
 * @param {(number|string)} [options.w] The write concern.
 * @param {number} [options.wtimeout] The write concern timeout.
 * @param {boolean} [options.j=false] Specify a journal write concern.
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Collection~resultCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 * @deprecated use findOneAndDelete instead
 */
Collection.prototype.findAndRemove = deprecate(function(query, sort, options, callback) {
  const args = Array.prototype.slice.call(arguments, 1);
  callback = typeof args[args.length - 1] === 'function' ? args.pop() : undefined;
  sort = args.length ? args.shift() || [] : [];
  options = args.length ? args.shift() || {} : {};

  validate(findAndRemoveSchema, options, { optionsValidationLevel: this.optionsValidationLevel });

  options = applyDefaults(
    findAndRemoveSchema,
    options,
    { serializeFunctions: this.s.serializeFunctions },
    {
      remove: true,
      upsert: false,
      new: false,
      readPreference: ReadPreference.primary,
      checkKeys: false
    }
  );

  return executeOperation(this.s.topology, findAndRemove, [this, query, sort, options, callback]);
}, 'collection.findAndRemove is deprecated. Use findOneAndDelete instead.');

/**
 * Execute an aggregation framework pipeline against the collection, needs MongoDB >= 2.2
 * @method
 * @param {object} [pipeline=[]] Array containing all the aggregation framework commands for the execution.
 * @param {object} [options] Optional settings.
 * @param {(ReadPreference|string)} [options.readPreference] The preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
 * @param {object} [options.cursor] Return the query as cursor, on 2.6 > it returns as a real cursor on pre 2.6 it returns as an emulated cursor.
 * @param {number} [options.cursor.batchSize] The batchSize for the cursor
 * @param {boolean} [options.explain] Explain returns the aggregation execution plan (requires mongodb 2.6 >).
 * @param {boolean} [options.allowDiskUse] allowDiskUse lets the server know if it can use disk to store temporary results for the aggregation (requires mongodb 2.6 >).
 * @param {number} [options.maxTimeMS] maxTimeMS specifies a cumulative time limit in milliseconds for processing operations on the cursor. MongoDB interrupts the operation at the earliest following interrupt point.
 * @param {boolean} [options.bypassDocumentValidation] Allow driver to bypass schema validation in MongoDB 3.2 or higher.
 * @param {boolean} [options.raw=false] Return document results as raw BSON buffers.
 * @param {boolean} [options.promoteLongs=true] Promotes Long values to number if they fit inside the 53 bits resolution.
 * @param {boolean} [options.promoteValues=true] Promotes BSON values to native types where possible, set to false to only receive wrapper types.
 * @param {boolean} [options.promoteBuffers=false] Promotes Binary BSON values to native Node Buffers.
 * @param {object} [options.collation] Specify collation (MongoDB 3.4 or higher) settings for aggregate operation (see 3.4 documentation for available fields).
 * @param {string} [options.comment] Add a comment to an aggregation command
 * @param {object|string} [options.hint] Tell the query to use specific indexes in the query. Object of indexes to use, {'_id':1}
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {object} [options.readConcern] Specify a read concern for the operation. (only MongoDB 3.2 or higher supported)
 * @param {Collection~aggregationCallback} callback The command result callback
 * @return {(null|AggregationCursor)}
 */
Collection.prototype.aggregate = function(pipeline, options, callback) {
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
    const args = Array.prototype.slice.call(arguments, 0);
    // Get the callback
    callback = args.pop();
    // Get the possible options object
    const opts = args[args.length - 1];
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

  validate(aggregateSchema, options, { optionsValidationLevel: this.optionsValidationLevel });

  options = applyDefaults(
    aggregateSchema,
    options,
    {},
    {
      readPreference: resolveReadPreference(options, { db: this.s.db, collection: this }),
      promiseLibrary: this.s.promiseLibrary,
      cursorFactory: AggregationCursor,
      optionsValidationLevel: this.optionsValidationLevel
    }
  );

  return aggregate(this, pipeline, options, callback);
};

/**
 * Create a new Change Stream, watching for new changes (insertions, updates, replacements, deletions, and invalidations) in this collection.
 * @method
 * @since 3.0.0
 * @param {Array} [pipeline] An array of {@link https://docs.mongodb.com/manual/reference/operator/aggregation-pipeline/|aggregation pipeline stages} through which to pass change stream documents. This allows for filtering (using $match) and manipulating the change stream documents.
 * @param {object} [options] Optional settings
 * @param {string} [options.fullDocument='default'] Allowed values: ‘default’, ‘updateLookup’. When set to ‘updateLookup’, the change stream will include both a delta describing the changes to the document, as well as a copy of the entire document that was changed from some time after the change occurred.
 * @param {object} [options.resumeAfter] Specifies the logical starting point for the new change stream. This should be the _id field from a previously returned change stream document.
 * @param {number} [options.maxAwaitTimeMS] The maximum amount of time for the server to wait on new documents to satisfy a change stream query
 * @param {number} [options.batchSize] The number of documents to return per batch. See {@link https://docs.mongodb.com/manual/reference/command/aggregate|aggregation documentation}.
 * @param {object} [options.collation] Specify collation settings for operation. See {@link https://docs.mongodb.com/manual/reference/command/aggregate|aggregation documentation}.
 * @param {ReadPreference} [options.readPreference] The read preference. Defaults to the read preference of the database or collection. See {@link https://docs.mongodb.com/manual/reference/read-preference|read preference documentation}.
 * @param {Timestamp} [options.startAtClusterTime] receive change events that occur after the specified timestamp
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @return {ChangeStream} a ChangeStream instance.
 */
Collection.prototype.watch = function(pipeline, options) {
  pipeline = pipeline || [];

  // Allow optionally not specifying a pipeline
  if (!Array.isArray(pipeline)) {
    options = pipeline;
    pipeline = [];
  }

  validate(watchSchema, options, { optionsValidationLevel: this.optionsValidationLevel });

  options = applyDefaults(
    watchSchema,
    options,
    {},
    {
      readPreference: resolveReadPreference(options, { db: this.s.db, collection: this }),
      optionsValidationLevel: this.optionsValidationLevel
    }
  );

  return new ChangeStream(this, pipeline, options);
};

/**
 * The callback format for results
 * @callback Collection~parallelCollectionScanCallback
 * @param {MongoError} error An error instance representing the error during the execution.
 * @param {Cursor[]} cursors A list of cursors returned allowing for parallel reading of collection.
 */

/**
 * Return N number of parallel cursors for a collection allowing parallel reading of entire collection. There are
 * no ordering guarantees for returned results.
 *
 * @method
 * @param {object} [options] Optional settings.
 * @param {(ReadPreference|string)} [options.readPreference] The preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
 * @param {number} [options.batchSize] Set the batchSize for the getMoreCommand when iterating over the query results.
 * @param {number} [options.numCursors=1] The maximum number of parallel command cursors to return (the number of returned cursors will be in the range 1:numCursors)
 * @param {boolean} [options.raw=false] Return all BSON documents as Raw Buffer documents.
 * @param {object} [options.readConcern] Specify a read concern for the operation. (only MongoDB 3.2 or higher supported)
 * @param {Collection~parallelCollectionScanCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 */
Collection.prototype.parallelCollectionScan = function(options, callback) {
  if (typeof options === 'function') (callback = options), (options = { numCursors: 1 });

  validate(parallelCollectionScanSchema, options, {
    optionsValidationLevel: this.optionsValidationLevel
  });

  options = applyDefaults(
    parallelCollectionScanSchema,
    options,
    {},
    {
      readPreference: resolveReadPreference(options, { db: this.s.db, collection: this }),
      promiseLibrary: this.s.promiseLibrary,
      session: undefined,
      optionsValidationLevel: this.optionsValidationLevel
    }
  );

  return executeOperation(this.s.topology, parallelCollectionScan, [this, options, callback], {
    skipSessions: true
  });
};

/**
 * Execute a geo search using a geo haystack index on a collection.
 *
 * @method
 * @param {number} x Point to search on the x axis, ensure the indexes are ordered in the same order.
 * @param {number} y Point to search on the y axis, ensure the indexes are ordered in the same order.
 * @param {object} [options] Optional settings.
 * @param {(ReadPreference|string)} [options.readPreference] The preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
 * @param {number} [options.maxDistance] Include results up to maxDistance from the point.
 * @param {object} [options.search] Filter the results by a query.
 * @param {number} [options.limit] Max number of results to return.
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {object} [options.readConcern] Specify a read concern for the operation. (only MongoDB 3.2 or higher supported)
 * @param {Collection~resultCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 */
Collection.prototype.geoHaystackSearch = function(x, y, options, callback) {
  const args = Array.prototype.slice.call(arguments, 2);
  callback = typeof args[args.length - 1] === 'function' ? args.pop() : undefined;
  options = args.length ? args.shift() || {} : {};

  validate(geoHaystackSearchSchema, options, {
    optionsValidationLevel: this.optionsValidationLevel
  });

  options = applyDefaults(
    geoHaystackSearchSchema,
    options,
    {},
    { readPreference: resolveReadPreference(options, { db: this.s.db, collection: this }) }
  );

  return executeOperation(this.s.topology, geoHaystackSearch, [this, x, y, options, callback]);
};

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
 * @param {object} [options] Optional settings.
 * @param {(ReadPreference|string)} [options.readPreference] The preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {Collection~resultCallback} [callback] The command result callback
 * @return {Promise} returns Promise if no callback passed
 * @deprecated MongoDB 3.6 or higher no longer supports the group command. We recommend rewriting using the aggregation framework.
 */
Collection.prototype.group = deprecate(function(
  keys,
  condition,
  initial,
  reduce,
  finalize,
  command,
  options,
  callback
) {
  const args = Array.prototype.slice.call(arguments, 3);
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
},
'MongoDB 3.6 or higher no longer supports the group command. We recommend rewriting using the aggregation framework.');

/**
 * Run Map Reduce across a collection. Be aware that the inline option for out will return an array of results not a collection.
 *
 * @method
 * @param {(function|string)} map The mapping function.
 * @param {(function|string)} reduce The reduce function.
 * @param {object} [options] Optional settings.
 * @param {object} [options.collation] Specifies a collation.
 * @param {(ReadPreference|string)} [options.readPreference] The preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
 * @param {(string|object)} [options.out] Sets the output target for the map reduce job. *{inline:1} | {replace:'collectionName'} | {merge:'collectionName'} | {reduce:'collectionName'}*
 * @param {object} [options.query] Query filter object.
 * @param {object} [options.sort] Sorts the input objects using this key. Useful for optimization, like sorting by the emit key for fewer reduces.
 * @param {number} [options.limit] Number of objects to return from collection.
 * @param {boolean} [options.keeptemp] Keep temporary data.
 * @param {(function|string)} [options.finalize] Finalize function.
 * @param {object} [options.scope] Can pass in variables that can be access from map/reduce/finalize.
 * @param {boolean} [options.jsMode] It is possible to make the execution stay in JS. Provided in MongoDB > 2.0.X.
 * @param {boolean} [options.verbose] Provide statistics on job execution time.
 * @param {boolean} [options.bypassDocumentValidation] Allow driver to bypass schema validation in MongoDB 3.2 or higher.
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {object} [options.readConcern] Specify a read concern for the operation. (only MongoDB 3.2 or higher supported)
 * @param {Collection~resultCallback} [callback] The command result callback
 * @throws {MongoError}
 * @return {Promise} returns Promise if no callback passed
 */
Collection.prototype.mapReduce = function(map, reduce, options, callback) {
  if ('function' === typeof options) (callback = options), (options = {});

  if ('function' === typeof map) {
    map = map.toString();
  }

  if ('function' === typeof reduce) {
    reduce = reduce.toString();
  }

  if ('function' === typeof options.finalize) {
    options.finalize = options.finalize.toString();
  }

  validate(mapReduceSchema, options, { optionsValidationLevel: this.optionsValidationLevel });

  options = applyDefaults(
    mapReduceSchema,
    options,
    {},
    {
      readPreference: resolveReadPreference(options, { db: this.s.db, collection: this }),
      finalize:
        typeof options.finalize === 'function' ? options.finalize.toString() : options.finalize
    }
  );

  return executeOperation(this.s.topology, mapReduce, [this, map, reduce, options, callback]);
};

/**
 * Initiate an Out of order batch write operation. All operations will be buffered into insert/update/remove commands executed out of order.
 *
 * @method
 * @param {object} [options] Optional settings.
 * @param {boolean} [options.bypassDocumentValidation] Allow driver to bypass schema validation in MongoDB 3.2 or higher.
 * @param {(number|string)} [options.w] The write concern.
 * @param {number} [options.wtimeout] The write concern timeout.
 * @param {boolean} [options.j] Specify a journal write concern.
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @return {UnorderedBulkOperation}
 */
Collection.prototype.initializeUnorderedBulkOp = function(options) {
  validate(initializeUnorderedBulkOpSchema, options, {
    optionsValidationLevel: this.optionsValidationLevel
  });

  options = applyDefaults(
    initializeUnorderedBulkOpSchema,
    options,
    {},
    { promiseLibrary: this.s.promiseLibrary }
  );

  return unordered(this.s.topology, this, options);
};

/**
 * Initiate an In order bulk write operation. Operations will be serially executed in the order they are added, creating a new operation for each switch in types.
 *
 * @method
 * @param {object} [options] Optional settings.
 * @param {boolean} [options.bypassDocumentValidation] Allow driver to bypass schema validation in MongoDB 3.2 or higher.
 * @param {(number|string)} [options.w] The write concern.
 * @param {number} [options.wtimeout] The write concern timeout.
 * @param {boolean} [options.j] Specify a journal write concern.
 * @param {ClientSession} [options.session] optional session to use for this operation
 * @param {OrderedBulkOperation} callback The command result callback
 * @return {null}
 */
Collection.prototype.initializeOrderedBulkOp = function(options) {
  validate(initializeOrderedBulkOpSchema, options, {
    optionsValidationLevel: this.optionsValidationLevel
  });

  options = applyDefaults(
    initializeOrderedBulkOpSchema,
    options,
    {},
    { promiseLibrary: this.s.promiseLibrary }
  );

  return ordered(this.s.topology, this, options);
};

/**
 * Return the db logger
 * @method
 * @return {Logger} return the db logger
 * @ignore
 */
Collection.prototype.getLogger = function() {
  return this.s.db.s.logger;
};

module.exports = Collection;
