import {
  applyWriteConcern,
  applyRetryableWrites,
  executeLegacyOperation,
  isPromiseLike,
  hasAtomicOperators,
  maxWireVersion,
  Callback,
  MongoDBNamespace
} from '../utils';
import { PromiseProvider } from '../promise_provider';
import { Long, ObjectId, Document, BSONSerializeOptions } from '../bson';
import { MongoError, MongoWriteConcernError } from '../error';
import { executeOperation } from '../operations/execute_operation';
import { InsertOperation } from '../operations/insert';
import { UpdateOperation } from '../operations/update';
import { DeleteOperation } from '../operations/delete';
import { WriteConcern, WriteConcernOptions } from '../write_concern';
import type { HasRetryableWrites } from './../utils';
import type { Collection } from '../collection';
import type { Topology } from '../sdam/topology';
import type { Hint } from './../operations/operation';
import type { addToOperationsList as orderedAddToOperationsList } from './ordered';
import type { addToOperationsList as unorderedAddToOperationsList } from './unordered';
import type { CollationOptions } from '../cmap/wire_protocol/write_command';
import type { InsertOptions } from './../operations/insert';
import type { RemoveOptions } from './../cmap/wire_protocol/index';
import type { ReplaceOptions } from './../operations/replace_one';
import type { UpdateOptions } from './../operations/update';

interface FinalOptionsConfigOptions {
  bypassDocumentValidation?: boolean;
  retryWrites?: boolean;
}
interface ResultHandler {
  (err?: any, result?: any): void;
  operationId?: number;
}

// Error codes
const WRITE_CONCERN_ERROR = 64;

// Insert types
const INSERT = 1;
const UPDATE = 2;
const REMOVE = 3;

export type BatchTypes = typeof INSERT | typeof UPDATE | typeof REMOVE;

interface Operation {
  selector: Document;
  multi: boolean;
  upsert: boolean;
  limit: number;
}

const INSERT_ONE = 'insertOne';
const INSERT_MANY = 'insertMany';
const REPLACE_ONE = 'replaceOne';
const UPDATE_ONE = 'updateOne';
const UPDATE_MANY = 'updateMany';
const REMOVE_ONE = 'removeOne';
const REMOVE_MANY = 'removeMany';
const DELETE_ONE = 'deleteOne';
const DELETE_MANY = 'deleteMany';

type BatchInsert = Document & InsertOptions & { document?: Document; _id?: ObjectId };
interface BatchOperations {
  [INSERT_ONE]: BatchInsert;
  [INSERT_MANY]: BatchInsert[];
  [REPLACE_ONE]: ReplaceOptions & { q?: Document; replacement: Document; filter?: Document };
  [UPDATE_ONE]: UpdateOptions & { q?: Document; update: Document; filter?: Document };
  [UPDATE_MANY]: UpdateOptions & { q?: Document; update: Document; filter?: Document };
  [REMOVE_ONE]: RemoveOptions;
  [REMOVE_MANY]: RemoveOptions & { limit?: number };
  [DELETE_ONE]: RemoveOptions & { q: Document };
  [DELETE_MANY]: RemoveOptions & { q: Document };
}

export type AnyOperationOptions = BatchOperations[typeof INSERT_ONE] &
  BatchOperations[typeof REPLACE_ONE] &
  BatchOperations[typeof UPDATE_ONE] &
  BatchOperations[typeof UPDATE_MANY] &
  BatchOperations[typeof REPLACE_ONE] &
  BatchOperations[typeof REMOVE_MANY];

type BatchOpNested<T extends keyof BatchOperations> = Record<T, BatchOperations[T]>;

export type AnyOperation =
  | BatchOpNested<typeof INSERT_ONE>
  | BatchOpNested<typeof INSERT_MANY>
  | BatchOpNested<typeof REPLACE_ONE>
  | BatchOpNested<typeof UPDATE_ONE>
  | BatchOpNested<typeof UPDATE_MANY>
  | BatchOpNested<typeof REPLACE_ONE>
  | BatchOpNested<typeof REMOVE_MANY>;

export type Operations = AnyOperation[];

interface BulkOp {
  _bsontype: string;
  ts: Long | number;
  t: Long | number;
  greaterThan: (arg: BulkOp) => BulkOp;
  equals: (arg: BulkOp) => BulkOp;
}

interface BulkIdDocument {
  index: number;
  _id: ObjectId;
}

interface BulkResult {
  nInserted: number;
  nMatched: number;
  nModified: number | null;
  nRemoved: number;
  nUpserted: number;
  upserted: Document[];
  insertedIds: BulkIdDocument[];
  writeErrors: WriteError[];
  writeConcernErrors: WriteConcernError[];
  writeConcernError?: WriteConcernError;
  lastOp?: BulkOp;
  opTime?: BulkOp;
  ok: number;
  result?: BulkResult;
  code?: number;
  message?: string;
  n?: number;
}

/**
 * Keeps the state of a unordered batch so we can rewrite the results
 * correctly after command execution
 */
class Batch {
  originalZeroIndex: number;
  currentIndex: number;
  originalIndexes: number[];
  batchType: BatchTypes;
  operations: Partial<AnyOperationOptions>[];
  size: number;
  sizeBytes: number;

  constructor(batchType: BatchTypes, originalZeroIndex: number) {
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
 * @public
 * The result of a bulk write.
 */
export class BulkWriteResult {
  result: BulkResult;
  n: number;

  /** Number of documents inserted. */
  insertedCount: number;
  /** Number of documents matched for update. */
  matchedCount: number;
  /** Number of documents modified. */
  modifiedCount: number;
  /** Number of documents deleted. */
  deletedCount: number;
  /** Number of documents upserted. */
  upsertedCount: number;
  /** Inserted document generated Id's, hash key is the index of the originating operation */
  insertedIds: { [key: number]: ObjectId };
  /** Upserted document generated Id's, hash key is the index of the originating operation */
  upsertedIds: { [key: number]: ObjectId };

  /** Create a new BulkWriteResult instance */
  constructor(bulkResult: BulkResult) {
    this.result = bulkResult;
    this.insertedCount = bulkResult.nInserted;
    this.matchedCount = bulkResult.nMatched;
    this.modifiedCount = bulkResult.nModified || 0;
    this.deletedCount = bulkResult.nRemoved;
    this.upsertedCount = bulkResult.upserted.length;
    this.upsertedIds = {};
    this.insertedIds = {};

    // Update the n
    this.n = this.insertedCount;

    // Inserted documents
    const inserted = bulkResult.insertedIds;
    // Map inserted ids
    for (let i = 0; i < inserted.length; i++) {
      this.insertedIds[inserted[i].index] = inserted[i]._id;
    }

    // Upserted documents
    const upserted = bulkResult.upserted;
    // Map upserted ids
    for (let i = 0; i < upserted.length; i++) {
      this.upsertedIds[upserted[i].index] = upserted[i]._id;
    }
  }

  /** Evaluates to true if the bulk operation correctly executes */
  get ok(): number {
    return this.result.ok;
  }

  /** The number of inserted documents */
  get nInserted(): number {
    return this.result.nInserted;
  }

  /** Number of upserted documents */
  get nUpserted(): number {
    return this.result.nUpserted;
  }

  /** Number of matched documents */
  get nMatched(): number {
    return this.result.nMatched;
  }

  /** Number of documents updated physically on disk */
  get nModified(): number | null {
    return this.result.nModified;
  }

  /** Number of removed documents */
  get nRemoved(): number {
    return this.result.nRemoved;
  }

  /** Returns an array of all inserted ids */
  getInsertedIds(): BulkIdDocument[] {
    return this.result.insertedIds;
  }

  /** Returns an array of all upserted ids */
  getUpsertedIds(): Document[] {
    return this.result.upserted;
  }

  /**
   * Returns the upserted id at the given index
   *
   * @param index - the number of the upserted id to return, returns undefined if no result for passed in index
   */
  getUpsertedIdAt(index: number): Document {
    return this.result.upserted[index];
  }

  /** Returns raw internal result */
  getRawResponse(): BulkResult {
    return this.result;
  }

  /** Returns true if the bulk operation contains a write error */
  hasWriteErrors(): boolean {
    return this.result.writeErrors.length > 0;
  }

  /** Returns the number of write errors off the bulk operation */
  getWriteErrorCount(): number {
    return this.result.writeErrors.length;
  }

  /**
   * Returns a specific write error object
   *
   * @param index - the write error to return, returns null if there is no result for passed in index
   */
  getWriteErrorAt(index: number): WriteError | undefined {
    if (index < this.result.writeErrors.length) {
      return this.result.writeErrors[index];
    }
  }

  /** Retrieve all write errors */
  getWriteErrors(): WriteError[] {
    return this.result.writeErrors;
  }

  /** Retrieve lastOp if available */
  getLastOp(): undefined | BulkOp {
    return this.result.lastOp;
  }

  /** Retrieve the write concern error if any */
  getWriteConcernError(): WriteConcernError | undefined {
    if (this.result.writeConcernErrors.length === 0) {
      return;
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

  toJSON(): BulkResult {
    return this.result;
  }

  toString(): string {
    return `BulkWriteResult(${this.toJSON()})`;
  }

  isOk(): boolean {
    return this.result.ok === 1;
  }
}

/**
 * An error representing a failure by the server to apply the requested write concern to the bulk operation.
 * @public
 * @category Error
 */
export class WriteConcernError {
  err: any;

  /**
   * Create a new WriteConcernError instance
   *
   * **NOTE:** Internal Type, do not instantiate directly
   *
   * @param err
   */
  constructor(err: any) {
    this.err = err;
  }

  /** Write concern error code. */
  get code(): number {
    return this.err.code;
  }

  /** Write concern error message. */
  get errmsg(): string {
    return this.err.errmsg;
  }

  toJSON(): { code: number; errmsg: string } {
    return { code: this.err.code, errmsg: this.err.errmsg };
  }

  toString(): string {
    return `WriteConcernError(${this.err.errmsg})`;
  }
}

/**
 * An error that occurred during a BulkWrite on the server.
 * @public
 * @category Error
 */
export class WriteError {
  err: any;

  /**
   * Create a new WriteError instance
   *
   * **NOTE:** Internal Type, do not instantiate directly
   *
   * @param err
   */
  constructor(err: any) {
    this.err = err;
  }

  /** WriteError code. */
  get code(): number {
    return this.err.code;
  }

  /** WriteError original bulk operation index. */
  get index(): number {
    return this.err.index;
  }

  /** WriteError message. */
  get errmsg(): string | undefined {
    return this.err.errmsg;
  }

  /** Returns the underlying operation that caused the error */
  getOperation(): Partial<AnyOperationOptions> {
    return this.err.op;
  }

  toJSON(): { code: number; index: number; errmsg?: string; op: Partial<AnyOperationOptions> } {
    return { code: this.err.code, index: this.err.index, errmsg: this.err.errmsg, op: this.err.op };
  }

  toString(): string {
    return `WriteError(${JSON.stringify(this.toJSON())})`;
  }
}

/**
 * Merges results into shared data structure
 *
 * @param batch
 * @param bulkResult
 * @param err
 * @param result
 */
function mergeBatchResults(
  batch: Batch,
  bulkResult: BulkResult,
  err: any,
  result?: BulkResult | null
) {
  // If we have an error set the result to be the err object
  if (err) {
    result = err;
  } else if (result && result.result) {
    result = result.result;
  } else if (result == null) {
    return;
  }

  // Do we have a top level error stop processing and return
  if (result && result.ok === 0 && bulkResult.ok === 1) {
    bulkResult.ok = 0;

    const writeError = {
      index: 0,
      code: result.code || 0,
      errmsg: result.message,
      op: batch.operations[0]
    };

    bulkResult.writeErrors.push(new WriteError(writeError));
    return;
  } else if (result && result.ok === 0 && bulkResult.ok === 0) {
    return;
  }

  // Deal with opTime if available
  if (result && (result.opTime || result.lastOp)) {
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
      const opTimeTS = typeof opTime?.ts === 'number' ? Long.fromNumber(opTime?.ts) : opTime?.ts;
      const opTimeT = typeof opTime?.t === 'number' ? Long.fromNumber(opTime?.t) : opTime?.t;

      // Compare the opTime's
      if (bulkResult.lastOp == null) {
        bulkResult.lastOp = opTime;
      } else if (lastOpTS && opTimeTS?.greaterThan(lastOpTS)) {
        bulkResult.lastOp = opTime;
      } else if (lastOpTS && opTimeTS?.equals(lastOpTS)) {
        if (lastOpT && opTimeT?.greaterThan(lastOpT)) {
          bulkResult.lastOp = opTime;
        }
      }
    }
  }

  // If we have an insert Batch type
  if (batch.batchType === INSERT && result?.n) {
    bulkResult.nInserted = bulkResult.nInserted + result.n;
  }

  // If we have an insert Batch type
  if (batch.batchType === REMOVE && result?.n) {
    bulkResult.nRemoved = bulkResult.nRemoved + result.n;
  }

  let nUpserted = 0;

  // We have an array of upserted values, we need to rewrite the indexes
  if (result && Array.isArray(result?.upserted)) {
    nUpserted = result.upserted.length;

    for (let i = 0; i < result?.upserted.length; i++) {
      bulkResult.upserted.push({
        index: result.upserted[i].index + batch.originalZeroIndex,
        _id: result.upserted[i]._id
      });
    }
  } else if (result?.upserted) {
    nUpserted = 1;

    bulkResult.upserted.push({
      index: batch.originalZeroIndex,
      _id: result.upserted
    });
  }

  // If we have an update Batch type
  if (batch.batchType === UPDATE && result?.n) {
    const nModified = result.nModified;
    bulkResult.nUpserted = bulkResult.nUpserted + nUpserted;
    bulkResult.nMatched = bulkResult.nMatched + (result.n - nUpserted);

    if (typeof bulkResult.nModified === 'number' && typeof nModified === 'number') {
      bulkResult.nModified = bulkResult.nModified + nModified;
    } else {
      bulkResult.nModified = null;
    }
  }

  if (result && Array.isArray(result.writeErrors)) {
    for (let i = 0; i < result.writeErrors.length; i++) {
      const writeError = {
        index: batch.originalIndexes[result.writeErrors[i].index],
        code: result.writeErrors[i].code,
        errmsg: result.writeErrors[i].errmsg,
        op: batch.operations[result.writeErrors[i].index]
      };

      bulkResult.writeErrors.push(new WriteError(writeError));
    }
  }

  if (result?.writeConcernError) {
    bulkResult.writeConcernErrors.push(new WriteConcernError(result.writeConcernError));
  }
}

function executeCommands(
  bulkOperation: BulkOperationBase,
  options: any,
  callback: Callback<BulkWriteResult>
) {
  if (bulkOperation.s.batches.length === 0) {
    return callback(undefined, new BulkWriteResult(bulkOperation.s.bulkResult));
  }

  const batch = bulkOperation.s.batches.shift() as Batch;

  function resultHandler(err?: any, result?: any) {
    // Error is a driver related error not a bulk op error, terminate
    if (((err && err.driver) || (err && err.message)) && !(err instanceof MongoWriteConcernError)) {
      return callback(err);
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
      return callback(undefined, writeResult);
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
 * @param batch
 * @param bulkResult
 * @param err
 * @param callback
 */
function handleMongoWriteConcernError(
  batch: Batch,
  bulkResult: BulkResult,
  err: any,
  callback: Callback
) {
  mergeBatchResults(batch, bulkResult, null, err.result);

  const wrappedWriteConcernError = new WriteConcernError({
    errmsg: err.result.writeConcernError.errmsg,
    code: err.result.writeConcernError.result
  });

  callback(
    new BulkWriteError(new MongoError(wrappedWriteConcernError), new BulkWriteResult(bulkResult))
  );
}

/**
 * An error indicating an unsuccessful Bulk Write
 * @public
 * @category Error
 */
class BulkWriteError extends MongoError {
  result: any;

  /**
   * Creates a new BulkWriteError
   *
   * @param error The error message
   * @param result The result of the bulk write operation
   */
  constructor(error?: any, result?: BulkWriteResult) {
    const message = error.err || error.errmsg || error.errMessage || error;
    super(message);

    Object.assign(this, error);

    this.name = 'BulkWriteError';
    this.result = result;
  }
}

type DocumentWithHint = Document & { hint?: Hint };

/**
 * @classdesc A builder object that is returned from {@link BulkOperationBase#find}.
 * Is used to build a write operation that involves a query filter.
 */
class FindOperators {
  s: {
    currentOp?: Partial<Operation>;
    options: {
      addToOperationsList: (self: FindOperators, batchType: BatchTypes, document: Document) => any;
    };
  };

  /**
   * Creates a new FindOperators object.
   *
   * **NOTE:** Internal Type, do not instantiate directly
   *
   * @param bulkOperation
   */
  constructor(bulkOperation: any) {
    this.s = bulkOperation.s;
  }

  /**
   * Add a multiple update operation to the bulk operation
   *
   * @function
   * @param updateDocument An update field for an update operation. See {@link https://docs.mongodb.com/manual/reference/command/update/#update-command-u u documentation}
   * @param reference for more information.
   * @throws MongoError If operation cannot be added to bulk write
   * @returns {any} A reference to the parent BulkOperation
   */
  update(updateDocument: DocumentWithHint) {
    // Perform upsert
    const upsert = typeof this.s.currentOp?.upsert === 'boolean' ? this.s.currentOp.upsert : false;

    // Establish the update command
    const document = {
      q: this.s.currentOp?.selector,
      u: updateDocument,
      multi: true,
      upsert: upsert,
      ...(updateDocument.hint ? { hint: updateDocument.hint } : {})
    };

    this.clearOutCurrentOp();
    return this.s.options.addToOperationsList(this, UPDATE, document);
  }

  clearOutCurrentOp() {
    this.s.currentOp = undefined;
  }

  /**
   * Add a single update operation to the bulk operation
   *
   * @function
   * @param updateDocument An update field for an update operation. See {@link https://docs.mongodb.com/manual/reference/command/update/#update-command-u u documentation}
   * @param reference for more information.
   * @throws {MongoError} If operation cannot be added to bulk write
   * @returns {any} A reference to the parent BulkOperation
   */
  updateOne(updateDocument: DocumentWithHint): any {
    // Perform upsert
    const upsert = typeof this.s.currentOp?.upsert === 'boolean' ? this.s.currentOp.upsert : false;

    // Establish the update command
    const document = {
      q: this.s.currentOp?.selector,
      u: updateDocument,
      multi: false,
      upsert: upsert,
      ...(updateDocument.hint ? { hint: updateDocument.hint } : {})
    };

    if (!hasAtomicOperators(updateDocument)) {
      throw new TypeError('Update document requires atomic operators');
    }

    this.clearOutCurrentOp();
    return this.s.options.addToOperationsList(this, UPDATE, document);
  }

  /**
   * Add a replace one operation to the bulk operation
   *
   * @param replacement the new document to replace the existing one with
   * @throws {MongoError} If operation cannot be added to bulk write
   * @returns {void} A reference to the parent BulkOperation
   */
  replaceOne(replacement: DocumentWithHint) {
    // Perform upsert
    const upsert = typeof this.s.currentOp?.upsert === 'boolean' ? this.s.currentOp.upsert : false;

    // Establish the update command
    const document = {
      q: this.s.currentOp?.selector,
      u: replacement,
      multi: false,
      upsert: upsert,
      ...(replacement.hint ? { hint: replacement.hint } : {})
    };

    if (hasAtomicOperators(replacement)) {
      throw new TypeError('Replacement document must not use atomic operators');
    }

    this.clearOutCurrentOp();
    return this.s.options.addToOperationsList(this, UPDATE, document);
  }

  /**
   * Upsert modifier for update bulk operation, noting that this operation is an upsert.
   *
   * @function
   * @throws {MongoError} If operation cannot be added to bulk write
   * @returns {FindOperators} reference to self
   */
  upsert(): FindOperators {
    this.s.currentOp = { ...this.s.currentOp, upsert: true };
    return this;
  }

  /**
   * Add a delete one operation to the bulk operation
   *
   * @function
   * @throws {MongoError} If operation cannot be added to bulk write
   * @returns {any} A reference to the parent BulkOperation
   */
  deleteOne(): any {
    // Establish the update command
    const document = {
      q: this.s.currentOp?.selector,
      limit: 1
    };

    this.clearOutCurrentOp();
    return this.s.options.addToOperationsList(this, REMOVE, document);
  }

  /**
   * Add a delete many operation to the bulk operation
   *
   * @function
   * @throws {MongoError} If operation cannot be added to bulk write
   * @returns {any} A reference to the parent BulkOperation
   */
  delete(): any {
    // Establish the update command
    const document = {
      q: this.s.currentOp?.selector,
      limit: 0
    };

    this.clearOutCurrentOp();
    return this.s.options.addToOperationsList(this, REMOVE, document);
  }

  /** backwards compatibility for deleteOne */
  removeOne() {
    return this.deleteOne();
  }

  /** backwards compatibility for delete */
  remove() {
    return this.delete();
  }
}

interface BulkOperationPrivate {
  bulkResult: BulkResult;
  currentBatch: Batch | null;
  currentIndex: number;
  // ordered specific
  currentBatchSize: number;
  currentBatchSizeBytes: number;
  // unordered specific
  currentInsertBatch: Batch | null;
  currentUpdateBatch: Batch | null;
  currentRemoveBatch: Batch | null;
  batches: Batch[];
  // Write concern
  writeConcern?: WriteConcern;
  // Max batch size options
  maxBsonObjectSize: number;
  maxBatchSizeBytes: number;
  maxWriteBatchSize: number;
  maxKeySize: number;
  // Namespace
  namespace: MongoDBNamespace;
  // Topology
  topology: Topology;
  // Options
  options: BulkOptions;
  // Current operation
  currentOp: { selector: Document } | null;
  // Executed
  executed: boolean;
  // Collection
  collection: Collection;
  // Fundamental error
  err: null;
  // check keys
  checkKeys: boolean;
  bypassDocumentValidation?: boolean;
}

type AddToOperationsList = typeof orderedAddToOperationsList | typeof unorderedAddToOperationsList;

export interface BulkOptions extends BSONSerializeOptions, WriteConcernOptions, HasRetryableWrites {
  bypassDocumentValidation?: boolean;
  addToOperationsList?: AddToOperationsList;
  forceServerObjectId?: boolean;
}

/**
 * @classdesc Parent class to OrderedBulkOperation and UnorderedBulkOperation
 *
 * **NOTE:** Internal Type, do not instantiate directly
 */
class BulkOperationBase {
  isOrdered: boolean;
  s: BulkOperationPrivate;
  operationId?: number;

  /** Create a new OrderedBulkOperation or UnorderedBulkOperation instance */
  constructor(
    topology: Topology,
    collection: Collection,
    options: BulkOptions,
    isOrdered: boolean
  ) {
    // determine whether bulkOperation is ordered or unordered
    this.isOrdered = isOrdered;

    options = options == null ? {} : options;
    // TODO Bring from driver information in isMaster
    // Get the namespace for the write operations
    const namespace = collection.s.namespace;
    // Used to mark operation as executed
    const executed = false;

    // Current item
    const currentOp = null;

    // Set max byte size
    const isMaster = topology.lastIsMaster();

    // If we have autoEncryption on, batch-splitting must be done on 2mb chunks, but single documents
    // over 2mb are still allowed
    const usingAutoEncryption = !!(topology.s.options && topology.s.options.autoEncrypter);
    const maxBsonObjectSize =
      isMaster && isMaster.maxBsonObjectSize ? isMaster.maxBsonObjectSize : 1024 * 1024 * 16;
    const maxBatchSizeBytes = usingAutoEncryption ? 1024 * 1024 * 2 : maxBsonObjectSize;
    const maxWriteBatchSize =
      isMaster && isMaster.maxWriteBatchSize ? isMaster.maxWriteBatchSize : 1000;

    // Calculates the largest possible size of an Array key, represented as a BSON string
    // element. This calculation:
    //     1 byte for BSON type
    //     # of bytes = length of (string representation of (maxWriteBatchSize - 1))
    //   + 1 bytes for null terminator
    const maxKeySize = (maxWriteBatchSize - 1).toString(10).length + 2;

    // Final options for retryable writes and write concern
    let finalOptions = Object.assign({}, options);
    finalOptions = applyRetryableWrites(finalOptions, collection.s.db);
    finalOptions = applyWriteConcern(finalOptions, { collection: collection }, options);
    const writeConcern = WriteConcern.fromOptions(finalOptions.writeConcern);

    // Final results
    const bulkResult: BulkResult = {
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
      bulkResult,
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
      maxBsonObjectSize,
      maxBatchSizeBytes,
      maxWriteBatchSize,
      maxKeySize,
      // Namespace
      namespace: namespace,
      // Topology
      topology: topology,
      // Options
      options: finalOptions,
      // Current operation
      currentOp: currentOp,
      // Executed
      executed: executed,
      // Collection
      collection: collection,
      // Fundamental error
      err: null,
      // check keys
      checkKeys: typeof options.checkKeys === 'boolean' ? options.checkKeys : true
    };

    // bypass Validation
    if (options.bypassDocumentValidation === true) {
      this.s.bypassDocumentValidation = true;
    }
  }

  get forceServerObjectId(): boolean {
    const result =
      typeof this.s.options.forceServerObjectId === 'boolean'
        ? this.s.options.forceServerObjectId
        : this.s.collection.s.db.options?.forceServerObjectId;
    return Boolean(result);
  }

  /**
   * Add a single insert document to the bulk operation
   *
   * @param document the document to insert
   * @throws {MongoError}
   * @returns {BulkOperationBase} A reference to self
   *
   * @example
   * const bulkOp = collection.initializeOrderedBulkOp();
   * // Adds three inserts to the bulkOp.
   * bulkOp
   *   .insert({ a: 1 })
   *   .insert({ b: 2 })
   *   .insert({ c: 3 });
   * await bulkOp.execute();
   */
  insert(document: Document): BulkOperationBase {
    if (this.forceServerObjectId !== true && document._id == null) document._id = new ObjectId();
    return this.s.options.addToOperationsList!(this, INSERT, document);
  }

  /**
   * Builds a find operation for an update/updateOne/delete/deleteOne/replaceOne.
   * Returns a builder object used to complete the definition of the operation.
   *
   * @function
   * @param selector The selector for the bulk operation. See {@link https://docs.mongodb.com/manual/reference/command/update/#update-command-q q documentation}
   * @throws {MongoError} if a selector is not specified
   * @returns {FindOperators} A helper object with which the write operation can be defined.
   *
   * @example
   * const bulkOp = collection.initializeOrderedBulkOp();
   *
   * // Add an updateOne to the bulkOp
   * bulkOp.find({ a: 1 }).updateOne({ $set: { b: 2 } });
   *
   * // Add an updateMany to the bulkOp
   * bulkOp.find({ c: 3 }).update({ $set: { d: 4 } });
   *
   * // Add an upsert
   * bulkOp.find({ e: 5 }).upsert().updateOne({ $set: { f: 6 } });
   *
   * // Add a deletion
   * bulkOp.find({ g: 7 }).deleteOne();
   *
   * // Add a multi deletion
   * bulkOp.find({ h: 8 }).delete();
   *
   * // Add a replaceOne
   * bulkOp.find({ i: 9 }).replaceOne({ j: 10 });
   *
   * // Update using a pipeline (requires Mongodb 4.2 or higher)
   * bulk.find({ k: 11, y: { $exists: true }, z: { $exists: true } }).updateOne([
   *   { $set: { total: { $sum: [ '$y', '$z' ] } } }
   * ]);
   *
   * // All of the ops will now be executed
   * await bulkOp.execute();
   */
  find(selector: object): FindOperators {
    if (!selector) {
      throw TypeError('Bulk find operation must specify a selector');
    }

    // Save a current selector
    this.s.currentOp = {
      selector: selector
    };

    return new FindOperators(this);
  }

  raw(op: Partial<BatchOperations> & { collation?: CollationOptions }): BulkOperationBase {
    const key = Object.keys(op)[0] as keyof BatchOperations;
    const opOptions = op[key] as AnyOperationOptions;
    // Set up the force server object id
    const forceServerObjectId = this.forceServerObjectId;

    // Update operations
    if (
      (op.updateOne && op.updateOne.q) ||
      (op.updateMany && op.updateMany.q) ||
      (op.replaceOne && op.replaceOne.q)
    ) {
      opOptions.multi = op.updateOne || op.replaceOne ? false : true;
      return this.s.options.addToOperationsList!(this, UPDATE, opOptions);
    }

    // Crud spec update format
    if (op.updateOne || op.updateMany || op.replaceOne) {
      if (op.replaceOne && hasAtomicOperators(opOptions.replacement)) {
        throw new TypeError('Replacement document must not use atomic operators');
      } else if ((op.updateOne || op.updateMany) && !hasAtomicOperators(opOptions.update)) {
        throw new TypeError('Update document requires atomic operators');
      }

      const multi = op.updateOne || op.replaceOne ? false : true;
      const operation = {
        q: opOptions.filter,
        u: opOptions.update || opOptions.replacement,
        multi: multi
      } as any;

      if (opOptions.hint) {
        operation.hint = opOptions.hint;
      }

      if (this.isOrdered) {
        operation.upsert = opOptions.upsert ? true : false;
        if (op.collation) operation.collation = op.collation;
      } else {
        if (opOptions.upsert) operation.upsert = true;
      }
      if (opOptions.arrayFilters) {
        // TODO: this check should be done at command construction against a connection, not a topology
        if (maxWireVersion(this.s.topology) < 6) {
          throw new TypeError('arrayFilters are only supported on MongoDB 3.6+');
        }

        operation.arrayFilters = opOptions.arrayFilters;
      }

      return this.s.options.addToOperationsList!(this, UPDATE, operation);
    }

    // Remove operations
    if (
      op.removeOne ||
      op.removeMany ||
      (op.deleteOne && op.deleteOne.q) ||
      (op.deleteMany && op.deleteMany.q)
    ) {
      opOptions.limit = op.removeOne ? 1 : 0;
      return this.s.options.addToOperationsList!(this, REMOVE, opOptions);
    }

    // Crud spec delete operations, less efficient
    if (op.deleteOne || op.deleteMany) {
      const limit = op.deleteOne ? 1 : 0;
      const operation = { q: opOptions.filter, limit: limit } as any;
      if (opOptions.hint) {
        operation.hint = opOptions.hint;
      }
      if (this.isOrdered) {
        if (op.collation) operation.collation = op.collation;
      }
      return this.s.options.addToOperationsList!(this, REMOVE, operation);
    }

    // Insert operations
    if (op.insertOne && op.insertOne.document == null) {
      if (forceServerObjectId !== true && op.insertOne._id == null)
        op.insertOne._id = new ObjectId();
      return this.s.options.addToOperationsList!(this, INSERT, op.insertOne);
    } else if (op.insertOne && op.insertOne.document) {
      if (forceServerObjectId !== true && op.insertOne.document._id == null)
        op.insertOne.document._id = new ObjectId();
      return this.s.options.addToOperationsList!(this, INSERT, op.insertOne.document);
    }

    if (op.insertMany) {
      for (let i = 0; i < op.insertMany.length; i++) {
        if (forceServerObjectId !== true && op.insertMany[i]._id == null)
          op.insertMany[i]._id = new ObjectId();
        this.s.options.addToOperationsList!(this, INSERT, op.insertMany[i]);
      }

      return this;
    }

    // No valid type of operation
    throw TypeError(
      'bulkWrite only supports insertOne, insertMany, updateOne, updateMany, removeOne, removeMany, deleteOne, deleteMany'
    );
  }

  /**
   * helper function to assist with promiseOrCallback behavior
   *
   * @param err
   * @param callback
   */
  _handleEarlyError(err?: any, callback?: any): Promise<void> | void {
    const Promise = PromiseProvider.get();

    if (typeof callback === 'function') {
      callback(err, null);
      return;
    }

    return Promise.reject(err);
  }

  /**
   * An internal helper method. Do not invoke directly. Will be going away in the future
   *
   * @function
   * @param _writeConcern
   * @param options
   * @param callback
   */
  bulkExecute(
    _writeConcern?: WriteConcern,
    options?: object,
    callback?: Callback
  ): Promise<void> | { options: any; callback?: Callback } | void {
    if (typeof options === 'function') (callback = options as Callback), (options = {});
    options = options || {};

    if (typeof _writeConcern === 'function') {
      callback = _writeConcern as Callback;
    } else if (_writeConcern && typeof _writeConcern === 'object') {
      this.s.writeConcern = _writeConcern;
    }

    if (this.s.executed) {
      const executedError = new MongoError('batch cannot be re-executed');
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
      const emptyBatchError = new TypeError('Invalid Operation, no operations specified');
      return this._handleEarlyError(emptyBatchError, callback);
    }
    return { options, callback };
  }

  /**
   * The callback format for results
   *
   * @callback BulkOperationBase~resultCallback
   * @param error An error instance representing the error during the execution.
   * @param result The bulk write result.
   */

  /**
   * Execute the bulk operation
   *
   * @function
   * @param [_writeConcern] Optional write concern. Can also be specified through options.
   * @param [options] Optional settings.
   * @param [options.w] The write concern.
   * @param [options.wtimeout] The write concern timeout.
   * @param [options.j=false] Specify a journal write concern.
   * @param [options.fsync=false] Specify a file sync write concern.
   * @param [callback] A callback that will be invoked when bulkWrite finishes/errors
   * @throws {MongoError} Throws error if the bulk object has already been executed
   * @throws {MongoError} Throws error if the bulk object does not have any operations
   * @returns {Promise<void>|void} returns Promise if no callback passed
   */
  execute(_writeConcern?: WriteConcern, options?: any, callback?: Callback): Promise<void> | void {
    const ret = this.bulkExecute(_writeConcern, options, callback!);
    if (!ret || isPromiseLike(ret as any)) {
      return ret as Promise<void>;
    }

    options = (ret as any).options;
    callback = (ret as any).callback;

    return executeLegacyOperation(this.s.topology, executeCommands, [this, options, callback]);
  }

  /**
   * Handles final options before executing command
   *
   * An internal method. Do not invoke. Will not be accessible in the future
   *
   * @param config
   * @param config.options
   * @param config.batch
   * @param config.resultHandler
   * @param callback
   */
  finalOptionsHandler(
    config: { options: FinalOptionsConfigOptions; batch: Batch; resultHandler: ResultHandler },
    callback: Callback
  ) {
    const finalOptions: any = Object.assign({ ordered: this.isOrdered }, config.options);
    if (this.s.writeConcern != null) {
      finalOptions.writeConcern = this.s.writeConcern;
    }

    if (finalOptions.bypassDocumentValidation !== true) {
      delete finalOptions.bypassDocumentValidation;
    }

    // Set an operationIf if provided
    if (this.operationId) {
      config.resultHandler.operationId = this.operationId;
    }

    // Serialize functions
    if (this.s.options.serializeFunctions) {
      finalOptions.serializeFunctions = true;
    }

    // Ignore undefined
    if (this.s.options.ignoreUndefined) {
      finalOptions.ignoreUndefined = true;
    }

    // Is the bypassDocumentValidation options specific
    if (this.s.bypassDocumentValidation === true) {
      finalOptions.bypassDocumentValidation = true;
    }

    // Is the checkKeys option disabled
    if (this.s.checkKeys === false) {
      finalOptions.checkKeys = false;
    }

    if (finalOptions.retryWrites) {
      if (config.batch.batchType === UPDATE) {
        finalOptions.retryWrites =
          finalOptions.retryWrites && !config.batch.operations.some((op: any) => op.multi);
      }

      if (config.batch.batchType === REMOVE) {
        finalOptions.retryWrites =
          finalOptions.retryWrites && !config.batch.operations.some((op: any) => op.limit === 0);
      }
    }

    try {
      if (config.batch.batchType === INSERT) {
        executeOperation(
          this.s.topology,
          new InsertOperation(this.s.namespace, config.batch.operations, finalOptions),
          config.resultHandler
        );
      } else if (config.batch.batchType === UPDATE) {
        executeOperation(
          this.s.topology,
          new UpdateOperation(this.s.namespace, config.batch.operations, finalOptions),
          config.resultHandler
        );
      } else if (config.batch.batchType === REMOVE) {
        executeOperation(
          this.s.topology,
          new DeleteOperation(this.s.namespace, config.batch.operations, finalOptions),
          config.resultHandler
        );
      }
    } catch (err) {
      // Force top level error
      err.ok = 0;
      // Merge top level error and return
      callback(undefined, mergeBatchResults(config.batch, this.s.bulkResult, err, null));
    }
  }

  /**
   * Handles the write error before executing commands
   *
   * An internal helper method. Do not invoke directly. Will be going away in the future
   *
   * @param callback
   * @param writeResult
   * @returns {boolean|undefined}
   */
  handleWriteError(callback: Callback<any>, writeResult: BulkWriteResult): boolean | undefined {
    if (this.s.bulkResult.writeErrors.length > 0) {
      const msg = this.s.bulkResult.writeErrors[0].errmsg
        ? this.s.bulkResult.writeErrors[0].errmsg
        : 'write operation failed';

      callback(
        new BulkWriteError(
          new MongoError({
            message: msg,
            code: this.s.bulkResult.writeErrors[0].code,
            writeErrors: this.s.bulkResult.writeErrors
          }),
          writeResult
        )
      );

      return true;
    }

    if (writeResult.getWriteConcernError()) {
      callback(new BulkWriteError(new MongoError(writeResult.getWriteConcernError()), writeResult));
      return true;
    }
  }
}

Object.defineProperty(BulkOperationBase.prototype, 'length', {
  enumerable: true,
  get() {
    return this.s.currentIndex;
  }
});

export { Batch, BulkOperationBase, INSERT, UPDATE, REMOVE, BulkWriteError };
