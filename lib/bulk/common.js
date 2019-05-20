'use strict';

const Long = require('../core').BSON.Long;
const MongoError = require('../core').MongoError;
const ObjectID = require('../core').BSON.ObjectID;
const BSON = require('../core').BSON;
const MongoWriteConcernError = require('../core').MongoWriteConcernError;
const toError = require('../utils').toError;
const handleCallback = require('../utils').handleCallback;

const crudWrite = require('../operations/crud_write');
const CrudWriteOperation = crudWrite.CrudWriteOperation;
const BulkInsertModel = crudWrite.BulkInsertModel;
const BulkUpdateModel = crudWrite.BulkUpdateModel;
const BulkRemoveModel = crudWrite.BulkRemoveModel;

const executeOperation = require('../operations/execute_operation_v2');

// Error codes
const WRITE_CONCERN_ERROR = 64;

// Insert types
const INSERT = 1;
const UPDATE = 2;
const REMOVE = 3;
const MODEL_MAP = new Map([
  [INSERT, BulkInsertModel],
  [UPDATE, BulkUpdateModel],
  [REMOVE, BulkRemoveModel]
]);

const bson = new BSON([
  BSON.Binary,
  BSON.Code,
  BSON.DBRef,
  BSON.Decimal128,
  BSON.Double,
  BSON.Int32,
  BSON.Long,
  BSON.Map,
  BSON.MaxKey,
  BSON.MinKey,
  BSON.ObjectId,
  BSON.BSONRegExp,
  BSON.Symbol,
  BSON.Timestamp
]);

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
 * Create a new BulkWriteResult instance (INTERNAL TYPE, do not instantiate directly)
 *
 * @class
 * @return {BulkWriteResult} a BulkWriteResult instance
 */
class BulkWriteResult {
  constructor(bulkResult) {
    this.result = bulkResult;
  }

  /**
   * @return {boolean} ok Did bulk operation correctly execute
   */
  get ok() {
    return this.result.ok;
  }

  /**
   * @return {number} nInserted number of inserted documents
   */
  get nInserted() {
    return this.result.nInserted;
  }

  /**
   * @return {number} nUpserted Number of upserted documents
   */
  get nUpserted() {
    return this.result.nUpserted;
  }

  /**
   * @return {number} nMatched Number of matched documents
   */
  get nMatched() {
    return this.result.nMatched;
  }

  /**
   * @return {number} nModified Number of documents updated physically on disk
   */
  get nModified() {
    return this.result.nModified;
  }

  /**
   * @return {number} nRemoved Number of removed documents
   */
  get nRemoved() {
    return this.result.nRemoved;
  }

  /**
   * Return an array of inserted ids
   *
   * @return {object[]}
   */
  getInsertedIds() {
    return this.result.insertedIds;
  }

  /**
   * Return an array of upserted ids
   *
   * @return {object[]}
   */
  getUpsertedIds() {
    return this.result.upserted;
  }

  /**
   * Return the upserted id at position x
   *
   * @param {number} index the number of the upserted id to return, returns undefined if no result for passed in index
   * @return {object}
   */
  getUpsertedIdAt(index) {
    return this.result.upserted[index];
  }

  /**
   * Return raw internal result
   *
   * @return {object}
   */
  getRawResponse() {
    return this.result;
  }

  /**
   * Returns true if the bulk operation contains a write error
   *
   * @return {boolean}
   */
  hasWriteErrors() {
    return this.result.writeErrors.length > 0;
  }

  /**
   * Returns the number of write errors off the bulk operation
   *
   * @return {number}
   */
  getWriteErrorCount() {
    return this.result.writeErrors.length;
  }

  /**
   * Returns a specific write error object
   *
   * @param {number} index of the write error to return, returns null if there is no result for passed in index
   * @return {WriteError}
   */
  getWriteErrorAt(index) {
    if (index < this.result.writeErrors.length) {
      return this.result.writeErrors[index];
    }
    return null;
  }

  /**
   * Retrieve all write errors
   *
   * @return {object[]}
   */
  getWriteErrors() {
    return this.result.writeErrors;
  }

  /**
   * Retrieve lastOp if available
   *
   * @return {object}
   */
  getLastOp() {
    return this.result.lastOp;
  }

  /**
   * Retrieve the write concern error if any
   *
   * @return {WriteConcernError}
   */
  getWriteConcernError() {
    if (this.result.writeConcernErrors.length === 0) {
      return null;
    } else if (this.result.writeConcernErrors.length === 1) {
      // Return the error
      return this.result.writeConcernErrors[0];
    } else {
      // Combine the errors
      let errmsg = '';
      for (let i = 0; i < this.result.writeConcernErrors.length; i++) {
        const err = this.result.writeConcernErrors[i];
        errmsg = errmsg + err.errmsg;

        // TODO: Something better
        if (i === 0) errmsg = errmsg + ' and ';
      }

      return new WriteConcernError({ errmsg: errmsg, code: WRITE_CONCERN_ERROR });
    }
  }

  /**
   * @return {BulkWriteResult} a BulkWriteResult instance
   */
  toJSON() {
    return this.result;
  }

  /**
   * @return {string}
   */
  toString() {
    return `BulkWriteResult(${this.toJSON(this.result)})`;
  }

  /**
   * @return {boolean}
   */
  isOk() {
    return this.result.ok === 1;
  }
}

/**
 * Create a new WriteConcernError instance (INTERNAL TYPE, do not instantiate directly)
 *
 * @class
 * @return {WriteConcernError} a WriteConcernError instance
 */
class WriteConcernError {
  constructor(err) {
    this.err = err;
  }

  /**
   * @return {number} code Write concern error code.
   */
  get code() {
    return this.err.code;
  }

  /**
   * @return {string} errmsg Write concern error message.
   */
  get errmsg() {
    return this.err.errmsg;
  }

  /**
   * @return {object}
   */
  toJSON() {
    return { code: this.err.code, errmsg: this.err.errmsg };
  }

  /**
   * @return {string}
   */
  toString() {
    return `WriteConcernError(${this.err.errmsg})`;
  }
}

/**
 * Create a new WriteError instance (INTERNAL TYPE, do not instantiate directly)
 *
 * @class
 * @return {WriteConcernError} a WriteConcernError instance
 */
class WriteError {
  constructor(err) {
    this.err = err;
  }

  /**
   * @return {number} code Write concern error code.
   */
  get code() {
    return this.err.code;
  }

  /**
   * @return {number} index Write concern error original bulk operation index.
   */
  get index() {
    return this.err.index;
  }

  /**
   * @return {string} errmsg Write concern error message.
   */
  get errmsg() {
    return this.err.errmsg;
  }

  /**
   * Define access methods
   * @return {object}
   */
  getOperation() {
    return this.err.op;
  }

  /**
   * @return {object}
   */
  toJSON() {
    return { code: this.err.code, index: this.err.index, errmsg: this.err.errmsg, op: this.err.op };
  }

  /**
   * @return {string}
   */
  toString() {
    return `WriteError(${JSON.stringify(this.toJSON())})`;
  }
}

/**
 * Merges results into shared data structure
 * @ignore
 */
function mergeBatchResults(batch, bulkResult, err, result) {
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

    const writeError = {
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
      const writeError = {
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

function executeCommands(bulkOperation, options, callback) {
  if (bulkOperation.s.batches.length === 0) {
    return handleCallback(callback, null, new BulkWriteResult(bulkOperation.s.bulkResult));
  }

  const batch = bulkOperation.s.batches.shift();

  function resultHandler(err, result) {
    // Error is a driver related error not a bulk op error, terminate
    if (((err && err.driver) || (err && err.message)) && !(err instanceof MongoWriteConcernError)) {
      return handleCallback(callback, err);
    }

    // If we have and error
    if (err) err.ok = 0;
    if (err instanceof MongoWriteConcernError) {
      return handleMongoWriteConcernError(batch, bulkOperation.s.bulkResult, err, callback);
    }

    // Merge the results together
    const writeResult = new BulkWriteResult(bulkOperation.s.bulkResult);
    const mergeResult = mergeBatchResults(batch, bulkOperation.s.bulkResult, err, result);
    if (mergeResult != null) {
      return handleCallback(callback, null, writeResult);
    }

    if (bulkOperation.handleWriteError(callback, writeResult)) return;

    // Execute the next command in line
    executeCommands(bulkOperation, options, callback);
  }

  bulkOperation.finalOptionsHandler({ options, batch, resultHandler }, callback);
}

/**
 * handles write concern error
 *
 * @param {object} batch
 * @param {object} bulkResult
 * @param {boolean} ordered
 * @param {WriteConcernError} err
 * @param {function} callback
 */
function handleMongoWriteConcernError(batch, bulkResult, err, callback) {
  mergeBatchResults(batch, bulkResult, null, err.result);

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

    Object.assign(this, error);

    this.name = 'BulkWriteError';
    this.result = result;
  }
}

/**
 * Handles the find operators for the bulk operations
 * @class
 */
class FindOperators {
  /**
   * @param {OrderedBulkOperation|UnorderedBulkOperation} bulkOperation
   */
  constructor(bulkOperation) {
    this.s = bulkOperation.s;
  }

  /**
   * Add a single update document to the bulk operation
   *
   * @method
   * @param {object} updateDocument update operations
   * @throws {MongoError}
   * @return {OrderedBulkOperation|UnordedBulkOperation}
   */
  update(updateDocument) {
    // Perform upsert
    const upsert = typeof this.s.currentOp.upsert === 'boolean' ? this.s.currentOp.upsert : false;

    // Establish the update command
    const document = {
      q: this.s.currentOp.selector,
      u: updateDocument,
      multi: true,
      upsert: upsert
    };

    // Clear out current Op
    this.s.currentOp = null;
    return this.s.addToOperationsList(this, UPDATE, document);
  }

  /**
   * Add a single update one document to the bulk operation
   *
   * @method
   * @param {object} updateDocument update operations
   * @throws {MongoError}
   * @return {OrderedBulkOperation|UnordedBulkOperation}
   */
  updateOne(updateDocument) {
    // Perform upsert
    const upsert = typeof this.s.currentOp.upsert === 'boolean' ? this.s.currentOp.upsert : false;

    // Establish the update command
    const document = {
      q: this.s.currentOp.selector,
      u: updateDocument,
      multi: false,
      upsert: upsert
    };

    // Clear out current Op
    this.s.currentOp = null;
    return this.s.addToOperationsList(this, UPDATE, document);
  }

  /**
   * Add a replace one operation to the bulk operation
   *
   * @method
   * @param {object} updateDocument the new document to replace the existing one with
   * @throws {MongoError}
   * @return {OrderedBulkOperation|UnorderedBulkOperation}
   */
  replaceOne(updateDocument) {
    this.updateOne(updateDocument);
  }

  /**
   * Upsert modifier for update bulk operation
   *
   * @method
   * @throws {MongoError}
   * @return {FindOperators}
   */
  upsert() {
    this.s.currentOp.upsert = true;
    return this;
  }

  /**
   * Add a delete one operation to the bulk operation
   *
   * @method
   * @throws {MongoError}
   * @return {OrderedBulkOperation|UnordedBulkOperation}
   */
  deleteOne() {
    // Establish the update command
    const document = {
      q: this.s.currentOp.selector,
      limit: 1
    };

    // Clear out current Op
    this.s.currentOp = null;
    return this.s.addToOperationsList(this, REMOVE, document);
  }

  /**
   * Add a delete operation to the bulk operation
   *
   * @method
   * @throws {MongoError}
   * @return {OrderedBulkOperation|UnordedBulkOperation}
   */
  delete() {
    // Establish the update command
    const document = {
      q: this.s.currentOp.selector,
      limit: 0
    };

    // Clear out current Op
    this.s.currentOp = null;
    return this.s.addToOperationsList(this, REMOVE, document);
  }

  /**
   * backwards compatability for deleteOne
   */
  removeOne() {
    return this.deleteOne();
  }

  /**
   * backwards compatability for delete
   */
  remove() {
    return this.delete();
  }
}

/**
 * Parent class to OrderedBulkOperation and UnorderedBulkOperation
 * @class
 */
class BulkOperationBase {
  /**
   * Create a new OrderedBulkOperation or UnorderedBulkOperation instance (INTERNAL TYPE, do not instantiate directly)
   * @class
   * @property {number} length Get the number of operations in the bulk.
   * @return {OrderedBulkOperation|UnordedBulkOperation}
   */
  constructor(topology, collection, options, isOrdered) {
    // determine whether bulkOperation is ordered or unordered
    this.isOrdered = isOrdered;

    options = Object.assign({}, options);
    // Used to mark operation as executed
    const executed = false;

    // Current item
    const currentOp = null;

    // Handle to the bson serializer, used to calculate running sizes
    const bson = topology.bson;

    // Set max byte size
    const isMaster = topology.lastIsMaster();
    const maxBatchSizeBytes =
      isMaster && isMaster.maxBsonObjectSize ? isMaster.maxBsonObjectSize : 1024 * 1024 * 16;
    const maxWriteBatchSize =
      isMaster && isMaster.maxWriteBatchSize ? isMaster.maxWriteBatchSize : 1000;

    // Calculates the largest possible size of an Array key, represented as a BSON string
    // element. This calculation:
    //     1 byte for BSON type
    //     # of bytes = length of (string representation of (maxWriteBatchSize - 1))
    //   + 1 bytes for null terminator
    const maxKeySize = (maxWriteBatchSize - 1).toString(10).length + 2;

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
    this.s = {
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
      // Max batch size options
      maxBatchSizeBytes: maxBatchSizeBytes,
      maxWriteBatchSize: maxWriteBatchSize,
      maxKeySize,
      // BSON
      bson: bson,
      // Topology
      topology: topology,
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
      // BSON Options
      checkKeys: typeof options.checkKeys === 'boolean' ? options.checkKeys : true,
      serializeFunctions: options.serializeFunctions,
      ignoreUndefined: options.ignoreUndefined,
      // Function for adding to operations list
      addToOperationsList: options.addToOperationsList,
      // determines if we should force server to add objectIds
      forceServerObjectId:
        typeof options.forceServerObjectId === 'boolean'
          ? options.forceServerObjectId
          : collection.s.db.options.forceServerObjectId
    };
  }

  /**
   * Add a single insert document to the bulk operation
   *
   * @param {object} document the document to insert
   * @throws {MongoError}
   * @return {OrderedBulkOperation|UnorderedBulkOperation}
   */
  insert(document) {
    if (this.s.forceServerObjectId !== true && document._id == null) {
      document._id = new ObjectID();
    }
    return this.s.addToOperationsList(this, INSERT, document);
  }

  /**
   * Initiate a find operation for an update/updateOne/remove/removeOne/replaceOne
   *
   * @method
   * @param {object} selector The selector for the bulk operation.
   * @throws {MongoError}
   */
  find(selector) {
    if (!selector) {
      throw toError('Bulk find operation must specify a selector');
    }

    // Save a current selector
    this.s.currentOp = {
      selector: selector
    };

    return new FindOperators(this);
  }

  /**
   * Raw performs the bulk operation
   *
   * @method
   * @param {object} op operation
   * @return {OrderedBulkOperation|UnorderedBulkOperation}
   */
  raw(op) {
    const key = Object.keys(op)[0];

    // Set up the force server object id
    const forceServerObjectId = this.s.forceServerObjectId;

    // Update operations
    if (
      (op.updateOne && op.updateOne.q) ||
      (op.updateMany && op.updateMany.q) ||
      (op.replaceOne && op.replaceOne.q)
    ) {
      op[key].multi = op.updateOne || op.replaceOne ? false : true;
      return this.s.addToOperationsList(this, UPDATE, op[key]);
    }

    // Crud spec update format
    if (op.updateOne || op.updateMany || op.replaceOne) {
      const multi = op.updateOne || op.replaceOne ? false : true;
      const operation = {
        q: op[key].filter,
        u: op[key].update || op[key].replacement,
        multi: multi
      };
      if (this.isOrdered) {
        operation.upsert = op[key].upsert ? true : false;
        if (op.collation) operation.collation = op.collation;
      } else {
        if (op[key].upsert) operation.upsert = true;
      }
      if (op[key].arrayFilters) operation.arrayFilters = op[key].arrayFilters;
      return this.s.addToOperationsList(this, UPDATE, operation);
    }

    // Remove operations
    if (
      op.removeOne ||
      op.removeMany ||
      (op.deleteOne && op.deleteOne.q) ||
      (op.deleteMany && op.deleteMany.q)
    ) {
      op[key].limit = op.removeOne ? 1 : 0;
      return this.s.addToOperationsList(this, REMOVE, op[key]);
    }

    // Crud spec delete operations, less efficient
    if (op.deleteOne || op.deleteMany) {
      const limit = op.deleteOne ? 1 : 0;
      const operation = { q: op[key].filter, limit: limit };
      if (this.isOrdered) {
        if (op.collation) operation.collation = op.collation;
      }
      return this.s.addToOperationsList(this, REMOVE, operation);
    }

    // Insert operations
    if (op.insertOne && op.insertOne.document == null) {
      if (forceServerObjectId !== true && op.insertOne._id == null)
        op.insertOne._id = new ObjectID();
      return this.s.addToOperationsList(this, INSERT, op.insertOne);
    } else if (op.insertOne && op.insertOne.document) {
      if (forceServerObjectId !== true && op.insertOne.document._id == null)
        op.insertOne.document._id = new ObjectID();
      return this.s.addToOperationsList(this, INSERT, op.insertOne.document);
    }

    if (op.insertMany) {
      for (let i = 0; i < op.insertMany.length; i++) {
        if (forceServerObjectId !== true && op.insertMany[i]._id == null)
          op.insertMany[i]._id = new ObjectID();
        this.s.addToOperationsList(this, INSERT, op.insertMany[i]);
      }

      return;
    }

    // No valid type of operation
    throw toError(
      'bulkWrite only supports insertOne, insertMany, updateOne, updateMany, removeOne, removeMany, deleteOne, deleteMany'
    );
  }

  /**
   * @ignore
   * TODO: Remove this when we remove bulkExecute
   */
  _handleEarlyError(err, callback) {
    if (typeof callback === 'function') {
      callback(err, null);
      return;
    }

    return this.s.promiseLibrary.reject(err);
  }

  /**
   * Execute next write command in a chain
   *
   * @method
   * @param {class} bulk either OrderedBulkOperation or UnorderdBulkOperation
   * @param {object} writeConcern
   * @param {object} options
   * @param {function} callback
   * @deprecated Will be removed in the next breaking version
   */
  bulkExecute(_writeConcern, options, callback) {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options || {};

    if (typeof _writeConcern === 'function') {
      callback = _writeConcern;
    } else if (_writeConcern && typeof _writeConcern === 'object') {
      this.s.writeConcern = _writeConcern;
    }

    if (this.s.executed) {
      const executedError = toError('batch cannot be re-executed');
      return this._handleEarlyError(executedError, callback);
    }

    // If we have current batch
    if (this.isOrdered) {
      if (this.s.currentBatch) this.s.batches.push(this.s.currentBatch);
    } else {
      if (this.s.currentInsertBatch) this.s.batches.push(this.s.currentInsertBatch);
      if (this.s.currentUpdateBatch) this.s.batches.push(this.s.currentUpdateBatch);
      if (this.s.currentRemoveBatch) this.s.batches.push(this.s.currentRemoveBatch);
    }
    // If we have no operations in the bulk raise an error
    if (this.s.batches.length === 0) {
      const emptyBatchError = toError('Invalid Operation, no operations specified');
      return this._handleEarlyError(emptyBatchError, callback);
    }
    return { options, callback };
  }

  /**
   * The callback format for results
   * @callback BulkOperationBase~resultCallback
   * @param {MongoError} error An error instance representing the error during the execution.
   * @param {BulkWriteResult} result The bulk write result.
   */
  /**
   * Execute the ordered bulk operation
   *
   * @method
   * @param {object} [options] Optional settings.
   * @param {(number|string)} [options.w] The write concern.
   * @param {number} [options.wtimeout] The write concern timeout.
   * @param {boolean} [options.j=false] Specify a journal write concern.
   * @param {boolean} [options.fsync=false] Specify a file sync write concern.
   * @param {BulkOperationBase~resultCallback} [callback] The result callback
   * @throws {MongoError} Throws error if the bulk object has already been executed
   * @throws {MongoError} Throws error if the bulk object does not have any operations
   * @return {Promise} returns Promise if no callback passed
   */
  execute(_writeConcern, options, callback) {
    if (typeof options === 'function') (callback = options), (options = {});
    options = Object.assign({}, options);

    if (typeof _writeConcern === 'function') {
      callback = _writeConcern;
    } else if (_writeConcern && typeof _writeConcern === 'object') {
      options.writeConcern = _writeConcern;
    }

    if (typeof callback === 'function') {
      try {
        this._execute(_writeConcern, options, callback);
      } catch (e) {
        callback(e);
      }
    } else {
      const Promise = this.s.promiseLibrary;
      return new Promise((resolve, reject) => {
        this._execute(_writeConcern, options, (err, result) => {
          if (err) {
            reject(err);
          } else {
            resolve(result);
          }
        });
      });
    }
  }

  _execute(_writeConcern, options, callback) {
    if (this.s.executed) {
      const executedError = toError('batch cannot be re-executed');
      return callback(executedError);
    }

    // If we have current batch
    if (this.isOrdered) {
      if (this.s.currentBatch) this.s.batches.push(this.s.currentBatch);
    } else {
      if (this.s.currentInsertBatch) this.s.batches.push(this.s.currentInsertBatch);
      if (this.s.currentUpdateBatch) this.s.batches.push(this.s.currentUpdateBatch);
      if (this.s.currentRemoveBatch) this.s.batches.push(this.s.currentRemoveBatch);
    }
    // If we have no operations in the bulk raise an error
    if (this.s.batches.length === 0) {
      const emptyBatchError = toError('Invalid Operation, no operations specified');
      return callback(emptyBatchError);
    }
    return executeCommands(this, options, callback);
  }

  /**
   * Handles final options before executing command
   *
   * @param {object} config
   * @param {object} config.options
   * @param {number} config.batch
   * @param {function} config.resultHandler
   * @param {function} callback
   */
  finalOptionsHandler(config, callback) {
    const finalOptions = Object.assign({ ordered: this.isOrdered }, config.options);

    if (finalOptions.bypassDocumentValidation !== true) {
      delete finalOptions.bypassDocumentValidation;
    }

    // Set an operationIf if provided
    if (this.operationId) {
      config.resultHandler.operationId = this.operationId;
    }

    // Serialize functions
    if (this.s.serializeFunctions) {
      finalOptions.serializeFunctions = true;
    }

    // Ignore undefined
    if (this.s.ignoreUndefined) {
      finalOptions.ignoreUndefined = true;
    }

    // Is the checkKeys option disabled
    if (this.s.checkKeys === false) {
      finalOptions.checkKeys = false;
    }

    try {
      const Model = MODEL_MAP.get(config.batch.batchType);
      if (!Model) {
        const err = MongoError.create({
          message: `Invalid batchType ${config.batch.batchType}`,
          driver: true
        });
        handleCallback(
          callback,
          null,
          mergeBatchResults(config.batch, this.s.bulkResult, err, null)
        );
        return;
      }

      const model = new Model(this.s.collection, finalOptions);
      model.operations = config.batch.operations;
      const operation = new CrudWriteOperation(model);

      executeOperation(this.s.topology, operation, config.resultHandler);
    } catch (err) {
      // Force top level error
      err.ok = 0;
      // Merge top level error and return
      handleCallback(callback, null, mergeBatchResults(config.batch, this.s.bulkResult, err, null));
    }
  }

  /**
   * Handles the write error before executing commands
   *
   * @param {function} callback
   * @param {BulkWriteResult} writeResult
   * @param {class} self either OrderedBulkOperation or UnorderdBulkOperation
   */
  handleWriteError(callback, writeResult) {
    if (this.s.bulkResult.writeErrors.length > 0) {
      if (this.s.bulkResult.writeErrors.length === 1) {
        handleCallback(
          callback,
          new BulkWriteError(toError(this.s.bulkResult.writeErrors[0]), writeResult),
          null
        );
        return true;
      }

      handleCallback(
        callback,
        new BulkWriteError(
          toError({
            message: 'write operation failed',
            code: this.s.bulkResult.writeErrors[0].code,
            writeErrors: this.s.bulkResult.writeErrors
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
}

Object.defineProperty(BulkOperationBase.prototype, 'length', {
  enumerable: true,
  get: function() {
    return this.s.currentIndex;
  }
});

// Exports symbols
module.exports = {
  Batch,
  BulkOperationBase,
  bson,
  INSERT: INSERT,
  UPDATE: UPDATE,
  REMOVE: REMOVE
};
