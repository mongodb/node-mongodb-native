'use strict';

const Long = require('mongodb-core').BSON.Long;
const MongoError = require('mongodb-core').MongoError;
const toError = require('../utils').toError;
const handleCallback = require('../utils').handleCallback;
const applyWriteConcern = require('../utils').applyWriteConcern;
const shallowClone = require('../utils').shallowClone;
const ObjectID = require('mongodb-core').BSON.ObjectID;

// Error codes
const UNKNOWN_ERROR = 8;
const INVALID_BSON_ERROR = 22;
const WRITE_CONCERN_ERROR = 64;
const MULTIPLE_ERROR = 65;

// Insert types
const INSERT = 1;
const UPDATE = 2;
const REMOVE = 3;

/**
 * Helper function to define properties
 * @ignore
 */
function defineReadOnlyProperty(self, name, value) {
  Object.defineProperty(self, name, {
    enumerable: true,
    get: function() {
      return value;
    }
  });
}

/**
 * Keeps the state of a unordered batch so we can rewrite the results
 * correctly after command execution
 * @ignore
 */
class Batch {
  constructor(batchType, originalZeroIndex) {
    this.originalZeroIndex = originalZeroIndex;
    this.currentIndex = 0;
    this.originalIndexes = [];
    this.batchType = batchType;
    this.operations = [];
    this.size = 0;
    this.sizeBytes = 0;
  }
}

/**
 * Wraps a legacy operation so we can correctly rewrite it's error
 * @ignore
 */
class LegacyOp {
  constructor(batchType, operation, index) {
    this.batchType = batchType;
    this.index = index;
    this.operation = operation;
  }
}

/**
 * Create a new BulkWriteResult instance (INTERNAL TYPE, do not instantiate directly)
 *
 * @class
 * @property {boolean} ok Did bulk operation correctly execute
 * @property {number} nInserted number of inserted documents
 * @property {number} nUpdated number of documents updated logically
 * @property {number} nUpserted Number of upserted documents
 * @property {number} nModified Number of documents updated physically on disk
 * @property {number} nRemoved Number of removed documents
 * @return {BulkWriteResult} a BulkWriteResult instance
 */
class BulkWriteResult {
  constructor(bulkResult) {
    defineReadOnlyProperty(this, 'ok', bulkResult.ok);
    defineReadOnlyProperty(this, 'nInserted', bulkResult.nInserted);
    defineReadOnlyProperty(this, 'nUpserted', bulkResult.nUpserted);
    defineReadOnlyProperty(this, 'nMatched', bulkResult.nMatched);
    defineReadOnlyProperty(this, 'nModified', bulkResult.nModified);
    defineReadOnlyProperty(this, 'nRemoved', bulkResult.nRemoved);

    /**
     * Return an array of inserted ids
     *
     * @return {object[]}
     */
    this.getInsertedIds = function() {
      return bulkResult.insertedIds;
    };

    /**
     * Return an array of upserted ids
     *
     * @return {object[]}
     */
    this.getUpsertedIds = function() {
      return bulkResult.upserted;
    };

    /**
     * Return the upserted id at position x
     *
     * @param {number} index the number of the upserted id to return, returns undefined if no result for passed in index
     * @return {object}
     */
    this.getUpsertedIdAt = function(index) {
      return bulkResult.upserted[index];
    };

    /**
     * Return raw internal result
     *
     * @return {object}
     */
    this.getRawResponse = function() {
      return bulkResult;
    };

    /**
     * Returns true if the bulk operation contains a write error
     *
     * @return {boolean}
     */
    this.hasWriteErrors = function() {
      return bulkResult.writeErrors.length > 0;
    };

    /**
     * Returns the number of write errors off the bulk operation
     *
     * @return {number}
     */
    this.getWriteErrorCount = function() {
      return bulkResult.writeErrors.length;
    };

    /**
     * Returns a specific write error object
     *
     * @param {number} index of the write error to return, returns null if there is no result for passed in index
     * @return {WriteError}
     */
    this.getWriteErrorAt = function(index) {
      if (index < bulkResult.writeErrors.length) {
        return bulkResult.writeErrors[index];
      }
      return null;
    };

    /**
     * Retrieve all write errors
     *
     * @return {object[]}
     */
    this.getWriteErrors = function() {
      return bulkResult.writeErrors;
    };

    /**
     * Retrieve lastOp if available
     *
     * @return {object}
     */
    this.getLastOp = function() {
      return bulkResult.lastOp;
    };

    /**
     * Retrieve the write concern error if any
     *
     * @return {WriteConcernError}
     */
    this.getWriteConcernError = function() {
      if (bulkResult.writeConcernErrors.length === 0) {
        return null;
      } else if (bulkResult.writeConcernErrors.length === 1) {
        // Return the error
        return bulkResult.writeConcernErrors[0];
      } else {
        // Combine the errors
        let errmsg = '';
        for (let i = 0; i < bulkResult.writeConcernErrors.length; i++) {
          const err = bulkResult.writeConcernErrors[i];
          errmsg = errmsg + err.errmsg;

          // TODO: Something better
          if (i === 0) errmsg = errmsg + ' and ';
        }

        return new WriteConcernError({ errmsg: errmsg, code: WRITE_CONCERN_ERROR });
      }
    };

    this.toJSON = function() {
      return bulkResult;
    };

    this.toString = function() {
      return 'BulkWriteResult(' + this.toJSON(bulkResult) + ')';
    };

    this.isOk = function() {
      return bulkResult.ok === 1;
    };
  }
}

/**
 * Create a new WriteConcernError instance (INTERNAL TYPE, do not instantiate directly)
 *
 * @class
 * @property {number} code Write concern error code.
 * @property {string} errmsg Write concern error message.
 * @return {WriteConcernError} a WriteConcernError instance
 */
class WriteConcernError {
  constructor(err) {
    if (!(this instanceof WriteConcernError)) return new WriteConcernError(err);

    // Define properties
    defineReadOnlyProperty(this, 'code', err.code);
    defineReadOnlyProperty(this, 'errmsg', err.errmsg);

    this.toJSON = function() {
      return { code: err.code, errmsg: err.errmsg };
    };

    this.toString = function() {
      return 'WriteConcernError(' + err.errmsg + ')';
    };
  }
}

/**
 * Create a new WriteError instance (INTERNAL TYPE, do not instantiate directly)
 *
 * @class
 * @property {number} code Write concern error code.
 * @property {number} index Write concern error original bulk operation index.
 * @property {string} errmsg Write concern error message.
 * @return {WriteConcernError} a WriteConcernError instance
 */
class WriteError {
  constructor(err) {
    if (!(this instanceof WriteError)) return new WriteError(err);

    // Define properties
    defineReadOnlyProperty(this, 'code', err.code);
    defineReadOnlyProperty(this, 'index', err.index);
    defineReadOnlyProperty(this, 'errmsg', err.errmsg);

    //
    // Define access methods
    this.getOperation = function() {
      return err.op;
    };

    this.toJSON = function() {
      return { code: err.code, index: err.index, errmsg: err.errmsg, op: err.op };
    };

    this.toString = function() {
      return 'WriteError(' + JSON.stringify(this.toJSON()) + ')';
    };
  }
}

/**
 * Merges results into shared data structure
 * @ignore
 */
function mergeBatchResults(ordered, batch, bulkResult, err, result) {
  // If we have an error set the result to be the err object
  if (err) {
    result = err;
  } else if (result && result.result) {
    result = result.result;
  } else if (result == null) {
    return;
  }

  // Do we have a top level error stop processing and return
  if (result.ok === 0 && bulkResult.ok === 1) {
    bulkResult.ok = 0;

    var writeError = {
      index: 0,
      code: result.code || 0,
      errmsg: result.message,
      op: batch.operations[0]
    };

    bulkResult.writeErrors.push(new WriteError(writeError));
    return;
  } else if (result.ok === 0 && bulkResult.ok === 0) {
    return;
  }

  // Deal with opTime if available
  if (result.opTime || result.lastOp) {
    const opTime = result.lastOp || result.opTime;
    let lastOpTS = null;
    let lastOpT = null;

    // We have a time stamp
    if (opTime && opTime._bsontype === 'Timestamp') {
      if (bulkResult.lastOp == null) {
        bulkResult.lastOp = opTime;
      } else if (opTime.greaterThan(bulkResult.lastOp)) {
        bulkResult.lastOp = opTime;
      }
    } else {
      // Existing TS
      if (bulkResult.lastOp) {
        lastOpTS =
          typeof bulkResult.lastOp.ts === 'number'
            ? Long.fromNumber(bulkResult.lastOp.ts)
            : bulkResult.lastOp.ts;
        lastOpT =
          typeof bulkResult.lastOp.t === 'number'
            ? Long.fromNumber(bulkResult.lastOp.t)
            : bulkResult.lastOp.t;
      }

      // Current OpTime TS
      const opTimeTS = typeof opTime.ts === 'number' ? Long.fromNumber(opTime.ts) : opTime.ts;
      const opTimeT = typeof opTime.t === 'number' ? Long.fromNumber(opTime.t) : opTime.t;

      // Compare the opTime's
      if (bulkResult.lastOp == null) {
        bulkResult.lastOp = opTime;
      } else if (opTimeTS.greaterThan(lastOpTS)) {
        bulkResult.lastOp = opTime;
      } else if (opTimeTS.equals(lastOpTS)) {
        if (opTimeT.greaterThan(lastOpT)) {
          bulkResult.lastOp = opTime;
        }
      }
    }
  }

  // If we have an insert Batch type
  if (batch.batchType === INSERT && result.n) {
    bulkResult.nInserted = bulkResult.nInserted + result.n;
  }

  // If we have an insert Batch type
  if (batch.batchType === REMOVE && result.n) {
    bulkResult.nRemoved = bulkResult.nRemoved + result.n;
  }

  let nUpserted = 0;

  // We have an array of upserted values, we need to rewrite the indexes
  if (Array.isArray(result.upserted)) {
    nUpserted = result.upserted.length;

    for (let i = 0; i < result.upserted.length; i++) {
      bulkResult.upserted.push({
        index: result.upserted[i].index + batch.originalZeroIndex,
        _id: result.upserted[i]._id
      });
    }
  } else if (result.upserted) {
    nUpserted = 1;

    bulkResult.upserted.push({
      index: batch.originalZeroIndex,
      _id: result.upserted
    });
  }

  // If we have an update Batch type
  if (batch.batchType === UPDATE && result.n) {
    const nModified = result.nModified;
    bulkResult.nUpserted = bulkResult.nUpserted + nUpserted;
    bulkResult.nMatched = bulkResult.nMatched + (result.n - nUpserted);

    if (typeof nModified === 'number') {
      bulkResult.nModified = bulkResult.nModified + nModified;
    } else {
      bulkResult.nModified = null;
    }
  }

  if (Array.isArray(result.writeErrors)) {
    for (let i = 0; i < result.writeErrors.length; i++) {
      writeError = {
        index: batch.originalZeroIndex + result.writeErrors[i].index,
        code: result.writeErrors[i].code,
        errmsg: result.writeErrors[i].errmsg,
        op: batch.operations[result.writeErrors[i].index]
      };

      bulkResult.writeErrors.push(new WriteError(writeError));
    }
  }

  if (result.writeConcernError) {
    bulkResult.writeConcernErrors.push(new WriteConcernError(result.writeConcernError));
  }
}

//
// Clone the options
function cloneOptions(options) {
  const clone = {};
  const keys = Object.keys(options);
  for (let i = 0; i < keys.length; i++) {
    clone[keys[i]] = options[keys[i]];
  }

  return clone;
}

function handleMongoWriteConcernError(batch, bulkResult, ordered, err, callback) {
  mergeBatchResults(ordered, batch, bulkResult, null, err.result);

  const wrappedWriteConcernError = new WriteConcernError({
    errmsg: err.result.writeConcernError.errmsg,
    code: err.result.writeConcernError.result
  });
  return handleCallback(
    callback,
    new BulkWriteError(toError(wrappedWriteConcernError), new BulkWriteResult(bulkResult)),
    null
  );
}

/**
 * Creates a new BulkWriteError
 *
 * @class
 * @param {Error|string|object} message The error message
 * @param {BulkWriteResult} result The result of the bulk write operation
 * @return {BulkWriteError} A BulkWriteError instance
 * @extends {MongoError}
 */
class BulkWriteError extends MongoError {
  constructor(error, result) {
    const message = error.err || error.errmsg || error.errMessage || error;
    super(message);

    const keys = typeof error === 'object' ? Object.keys(error) : [];
    for (let i = 0; i < keys.length; i++) {
      this[keys[i]] = error[keys[i]];
    }

    this.name = 'BulkWriteError';
    this.result = result;
  }
}

class BulkOperationBase {
  /**
   * Add a single update document to the bulk operation
   *
   * @method
   * @param {object} updateDocument update operations
   * @param {class} bulk FindOperatorsOrdered or FindOperatorsUnordered
   * @throws {MongoError}
   * @return {OrderedBulkOperation or UnordedBulkOperation}
   */
  bulkUpdate(updateDocument, bulk) {
    // Perform upsert
    const upsert = typeof bulk.s.currentOp.upsert === 'boolean' ? bulk.s.currentOp.upsert : false;

    // Establish the update command
    const document = {
      q: bulk.s.currentOp.selector,
      u: updateDocument,
      multi: true,
      upsert: upsert
    };

    // Clear out current Op
    bulk.s.currentOp = null;
    return bulk.addToOperationsList(bulk, UPDATE, document);
  }

  /**
   * Add a single update one document to the bulk operation
   *
   * @method
   * @param {object} updateDocument update operations
   * @param {class} bulk either FindOperatorsOrdered or FindOperatorsUnordered
   * @throws {MongoError}
   * @return {OrderedBulkOperation or UnordedBulkOperation}
   */
  bulkUpdateOne(updateDocument, bulk) {
    // Perform upsert
    const upsert = typeof bulk.s.currentOp.upsert === 'boolean' ? bulk.s.currentOp.upsert : false;

    // Establish the update command
    const document = {
      q: bulk.s.currentOp.selector,
      u: updateDocument,
      multi: false,
      upsert: upsert
    };

    // Clear out current Op
    bulk.s.currentOp = null;
    return bulk.addToOperationsList(bulk, UPDATE, document);
  }

  /**
   * Upsert modifier for update bulk operation
   *
   * @method
   * @param {class} bulk FindOperatorsOrdered or FindOperatorsUnordered
   * @throws {MongoError}
   * @return {FindOperatorsOrdered or FindOperatorsUnordered}
   */
  bulkUpsert(bulk) {
    bulk.s.currentOp.upsert = true;
    return bulk;
  }

  /**
   * Add a delete one operation to the bulk operation
   *
   * @method
   * @param {class} bulk either FindOperatorsOrdered or FindOperatorsUnordered
   * @throws {MongoError}
   * @return {OrderedBulkOperation or UnordedBulkOperation}
   */
  bulkDeleteOne(bulk) {
    // Establish the update command
    const document = {
      q: bulk.s.currentOp.selector,
      limit: 1
    };

    // Clear out current Op
    bulk.s.currentOp = null;
    return bulk.addToOperationsList(bulk, REMOVE, document);
  }

  /**
   * Add a delete operation to the bulk operation
   *
   * @method
   * @param {class} bulk either FindOperatorsOrdered or FindOperatorsUnordered
   * @throws {MongoError}
   * @return {OrderedBulkOperation or UnordedBulkOperation}
   */
  bulkDelete(bulk) {
    // Establish the update command
    const document = {
      q: bulk.s.currentOp.selector,
      limit: 0
    };

    // Clear out current Op
    bulk.s.currentOp = null;
    return bulk.addToOperationsList(bulk, REMOVE, document);
  }

  /**
   * Create a new OrderedBulkOperation or UnorderedBulkOperation instance (INTERNAL TYPE, do not instantiate directly)
   * @class
   * @property {number} length Get the number of operations in the bulk.
   * @return {OrderedBulkOperation or UnordedBulkOperation}
   */
  bulkOperation(topology, collection, options, bulk) {
    options = options == null ? {} : options;
    // TODO Bring from driver information in isMaster
    // Get the namespace for the write operations
    const namespace = collection.collectionName;
    // Used to mark operation as executed
    const executed = false;

    // Current item
    const currentOp = null;

    // Handle to the bson serializer, used to calculate running sizes
    const bson = topology.bson;

    // Set max byte size
    const maxBatchSizeBytes =
      topology.isMasterDoc && topology.isMasterDoc.maxBsonObjectSize
        ? topology.isMasterDoc.maxBsonObjectSize
        : 1024 * 1025 * 16;
    const maxWriteBatchSize =
      topology.isMasterDoc && topology.isMasterDoc.maxWriteBatchSize
        ? topology.isMasterDoc.maxWriteBatchSize
        : 1000;

    // Get the write concern
    var writeConcern = applyWriteConcern(
      shallowClone(options),
      { collection: collection },
      options
    );
    writeConcern = writeConcern.writeConcern;

    // Get the promiseLibrary
    const promiseLibrary = options.promiseLibrary || Promise;

    // Final results
    const bulkResult = {
      ok: 1,
      writeErrors: [],
      writeConcernErrors: [],
      insertedIds: [],
      nInserted: 0,
      nUpserted: 0,
      nMatched: 0,
      nModified: 0,
      nRemoved: 0,
      upserted: []
    };

    // Internal state
    bulk.s = {
      // Final result
      bulkResult: bulkResult,
      // Current batch state
      currentBatch: null,
      currentIndex: 0,
      // ordered specific
      currentBatchSize: 0,
      currentBatchSizeBytes: 0,
      // unordered specific
      currentInsertBatch: null,
      currentUpdateBatch: null,
      currentRemoveBatch: null,
      batches: [],
      // Write concern
      writeConcern: writeConcern,
      // Max batch size options
      maxBatchSizeBytes: maxBatchSizeBytes,
      maxWriteBatchSize: maxWriteBatchSize,
      // Namespace
      namespace: namespace,
      // BSON
      bson: bson,
      // Topology
      topology: topology,
      // Options
      options: options,
      // Current operation
      currentOp: currentOp,
      // Executed
      executed: executed,
      // Collection
      collection: collection,
      // Promise Library
      promiseLibrary: promiseLibrary,
      // Fundamental error
      err: null,
      // check keys
      checkKeys: typeof options.checkKeys === 'boolean' ? options.checkKeys : true
    };

    // bypass Validation
    if (options.bypassDocumentValidation === true) {
      bulk.s.bypassDocumentValidation = true;
    }
  }

  /**
   * Add a single insert document to the bulk operation
   *
   * @param {object} document the document to insert
   * @param {class} bulk either OrderedBulkOperation or UnorderdBulkOperation
   * @throws {MongoError}
   * @return {OrderedBulkOperation or UnorderedBulkOperation}
   */
  bulkInsert(document, bulk) {
    if (bulk.s.collection.s.db.options.forceServerObjectId !== true && document._id == null)
      document._id = new ObjectID();
    return bulk.addToOperationsList(bulk, INSERT, document);
  }

  /**
   * Initiate a find operation for an update/updateOne/remove/removeOne/replaceOne
   *
   * @method
   * @param {class} bulk either OrderedBulkOperation or UnorderdBulkOperation
   * @param {object} selector The selector for the bulk operation.
   * @throws {MongoError}
   * @return {FindOperatorsOrdered or FindOperatorsUnordered}
   */
  bulkFind(selector, bulk) {
    if (!selector) {
      throw toError('Bulk find operation must specify a selector');
    }

    // Save a current selector
    bulk.s.currentOp = {
      selector: selector
    };
  }

  /**
   * @method
   * @param {class} bulk either OrderedBulkOperation or UnorderdBulkOperation
   * @param {object} op
   */
  bulkRaw(op, bulk) {
    const key = Object.keys(op)[0];

    // Set up the force server object id
    const forceServerObjectId =
      typeof bulk.s.options.forceServerObjectId === 'boolean'
        ? bulk.s.options.forceServerObjectId
        : bulk.s.collection.s.db.options.forceServerObjectId;

    // Update operations
    if (
      (op.updateOne && op.updateOne.q) ||
      (op.updateMany && op.updateMany.q) ||
      (op.replaceOne && op.replaceOne.q)
    ) {
      op[key].multi = op.updateOne || op.replaceOne ? false : true;
      return bulk.addToOperationsList(bulk, UPDATE, op[key]);
    }

    // Crud spec update format
    if (op.updateOne || op.updateMany || op.replaceOne) {
      const multi = op.updateOne || op.replaceOne ? false : true;
      var operation = { q: op[key].filter, u: op[key].update || op[key].replacement, multi: multi };
      if (bulk.isOrdered()) {
        operation.upsert = op[key].upsert ? true : false;
        if (op.collation) operation.collation = op.collation;
      } else {
        if (op[key].upsert) operation.upsert = true;
      }
      if (op[key].arrayFilters) operation.arrayFilters = op[key].arrayFilters;
      return bulk.addToOperationsList(bulk, UPDATE, operation);
    }

    // Remove operations
    if (
      op.removeOne ||
      op.removeMany ||
      (op.deleteOne && op.deleteOne.q) ||
      (op.deleteMany && op.deleteMany.q)
    ) {
      op[key].limit = op.removeOne ? 1 : 0;
      return bulk.addToOperationsList(bulk, REMOVE, op[key]);
    }

    // Crud spec delete operations, less efficient
    if (op.deleteOne || op.deleteMany) {
      const limit = op.deleteOne ? 1 : 0;
      operation = { q: op[key].filter, limit: limit };
      if (bulk.isOrdered()) {
        if (op.collation) operation.collation = op.collation;
      }
      return bulk.addToOperationsList(bulk, REMOVE, operation);
    }

    // Insert operations
    if (op.insertOne && op.insertOne.document == null) {
      if (forceServerObjectId !== true && op.insertOne._id == null)
        op.insertOne._id = new ObjectID();
      return bulk.addToOperationsList(bulk, INSERT, op.insertOne);
    } else if (op.insertOne && op.insertOne.document) {
      if (forceServerObjectId !== true && op.insertOne.document._id == null)
        op.insertOne.document._id = new ObjectID();
      return bulk.addToOperationsList(bulk, INSERT, op.insertOne.document);
    }

    if (op.insertMany) {
      for (let i = 0; i < op.insertMany.length; i++) {
        if (forceServerObjectId !== true && op.insertMany[i]._id == null)
          op.insertMany[i]._id = new ObjectID();
        bulk.addToOperationsList(bulk, INSERT, op.insertMany[i]);
      }

      return;
    }

    // No valid type of operation
    throw toError(
      'bulkWrite only supports insertOne, insertMany, updateOne, updateMany, removeOne, removeMany, deleteOne, deleteMany'
    );
  }

  /**
   * Execute next write command in a chain
   *
   * @method
   * @param {class} bulk either OrderedBulkOperation or UnorderdBulkOperation
   * @param {object} writeConcern
   * @param {object} options
   * @param {function} callback
   */
  bulkExecute(_writeConcern, options, callback, bulk) {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options || {};

    if (bulk.s.executed) {
      const executedError = toError('batch cannot be re-executed');
      return typeof callback === 'function'
        ? callback(executedError, null)
        : bulk.s.promiseLibrary.reject(executedError);
    }

    if (typeof _writeConcern === 'function') {
      callback = _writeConcern;
    } else if (_writeConcern && typeof _writeConcern === 'object') {
      bulk.s.writeConcern = _writeConcern;
    }

    // If we have current batch
    if (bulk.isOrdered()) {
      if (bulk.s.currentBatch) bulk.s.batches.push(bulk.s.currentBatch);
    } else {
      if (bulk.s.currentInsertBatch) bulk.s.batches.push(bulk.s.currentInsertBatch);
      if (bulk.s.currentUpdateBatch) bulk.s.batches.push(bulk.s.currentUpdateBatch);
      if (bulk.s.currentRemoveBatch) bulk.s.batches.push(bulk.s.currentRemoveBatch);
    }
    // If we have no operations in the bulk raise an error
    if (bulk.s.batches.length === 0) {
      const emptyBatchError = toError('Invalid Operation, no operations specified');
      return typeof callback === 'function'
        ? callback(emptyBatchError, null)
        : bulk.s.promiseLibrary.reject(emptyBatchError);
    }
    return {
      options: options,
      callback: callback
    };
  }
}

/**
 * Handles final options before executing command
 * @param {object} config
 * @param {object} config.options
 * @param {number} config.batch
 * @param {function} config.resultHandler
 * @param {function} callback
 * @param {class} bulk either OrderedBulkOperation or UnorderdBulkOperation
 */
function finalOptionsHandler(config, bulk, callback) {
  const finalOptions = Object.assign({ ordered: bulk.isOrdered() }, config.options);
  if (bulk.s.writeConcern != null) {
    finalOptions.writeConcern = bulk.s.writeConcern;
  }

  if (finalOptions.bypassDocumentValidation !== true) {
    delete finalOptions.bypassDocumentValidation;
  }

  // Set an operationIf if provided
  if (bulk.operationId) {
    config.resultHandler.operationId = bulk.operationId;
  }

  // Serialize functions
  if (bulk.s.options.serializeFunctions) {
    finalOptions.serializeFunctions = true;
  }

  // Ignore undefined
  if (bulk.s.options.ignoreUndefined) {
    finalOptions.ignoreUndefined = true;
  }

  // Is the bypassDocumentValidation options specific
  if (bulk.s.bypassDocumentValidation === true) {
    finalOptions.bypassDocumentValidation = true;
  }

  // Is the checkKeys option disabled
  if (bulk.s.checkKeys === false) {
    finalOptions.checkKeys = false;
  }

  if (finalOptions.retryWrites) {
    if (config.batch.batchType === UPDATE) {
      finalOptions.retryWrites =
        finalOptions.retryWrites && !config.batch.operations.some(op => op.multi);
    }

    if (config.batch.batchType === REMOVE) {
      finalOptions.retryWrites =
        finalOptions.retryWrites && !config.batch.operations.some(op => op.limit === 0);
    }
  }

  try {
    if (config.batch.batchType === INSERT) {
      bulk.s.topology.insert(
        bulk.s.collection.namespace,
        config.batch.operations,
        finalOptions,
        config.resultHandler
      );
    } else if (config.batch.batchType === UPDATE) {
      bulk.s.topology.update(
        bulk.s.collection.namespace,
        config.batch.operations,
        finalOptions,
        config.resultHandler
      );
    } else if (config.batch.batchType === REMOVE) {
      bulk.s.topology.remove(
        bulk.s.collection.namespace,
        config.batch.operations,
        finalOptions,
        config.resultHandler
      );
    }
  } catch (err) {
    // Force top level error
    err.ok = 0;
    // Merge top level error and return
    handleCallback(
      callback,
      null,
      mergeBatchResults(false, config.batch, bulk.s.bulkResult, err, null)
    );
  }
}

/**
 * Handles the write error before executing commands
 *
 * @param {function} callback
 * @param {BulkWriteResult} writeResult
 * @param {class} self either OrderedBulkOperation or UnorderdBulkOperation
 */
function handleWriteError(callback, writeResult, self) {
  if (self.s.bulkResult.writeErrors.length > 0) {
    if (self.s.bulkResult.writeErrors.length === 1) {
      handleCallback(
        callback,
        new BulkWriteError(toError(self.s.bulkResult.writeErrors[0]), writeResult),
        null
      );
      return true;
    }

    handleCallback(
      callback,
      new BulkWriteError(
        toError({
          message: 'write operation failed',
          code: self.s.bulkResult.writeErrors[0].code,
          writeErrors: self.s.bulkResult.writeErrors
        }),
        writeResult
      ),
      null
    );
    return true;
  } else if (writeResult.getWriteConcernError()) {
    handleCallback(
      callback,
      new BulkWriteError(toError(writeResult.getWriteConcernError()), writeResult),
      null
    );
    return true;
  }
}

// Exports symbols
module.exports = {
  Batch,
  BulkOperationBase,
  BulkWriteError,
  BulkWriteResult,
  cloneOptions,
  finalOptionsHandler,
  handleWriteError,
  handleMongoWriteConcernError,
  LegacyOp,
  mergeBatchResults,
  INVALID_BSON_ERROR: INVALID_BSON_ERROR,
  MULTIPLE_ERROR: MULTIPLE_ERROR,
  UNKNOWN_ERROR: UNKNOWN_ERROR,
  WRITE_CONCERN_ERROR: WRITE_CONCERN_ERROR,
  INSERT: INSERT,
  UPDATE: UPDATE,
  REMOVE: REMOVE,
  WriteError,
  WriteConcernError
};
