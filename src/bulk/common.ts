import type { AnyError } from './../error';
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
  (err?: AnyError, result?: any): void;
  operationId?: number;
}

// Error codes
const WRITE_CONCERN_ERROR = 64;

export enum BatchType {
  INSERT = 1,
  UPDATE = 2,
  REMOVE = 3
}

/** @public */
export interface Operation {
  selector?: Document;
  multi?: boolean;
  upsert?: boolean;
  limit?: number;
}

/** @public */
export interface InsertOneOptions extends Document, InsertOptions {
  document?: Document;
  _id?: ObjectId;
}

/** @public */
export type InsertManyOptions = InsertOneOptions[];

/** @public */
export interface ReplaceOneOptions extends ReplaceOptions {
  q?: Document;
  replacement: Document;
  filter?: Document;
}

/** @public */
export interface UpdateOneOptions extends UpdateOptions {
  q?: Document;
  update: Document;
  filter?: Document;
}

/** @public */
export interface UpdateManyOptions extends UpdateOptions {
  q?: Document;
  update: Document;
  filter?: Document;
}

/** @public */
export type RemoveOneOptions = RemoveOptions;

/** @public */
export interface RemoveManyOptions extends RemoveOptions {
  limit?: number;
}

/** @public */
export interface DeleteOneOptions extends RemoveOptions {
  hint?: Hint;
  filter?: Document;
  q?: Document;
}

/** @public */
export interface DeleteManyOptions extends RemoveOptions {
  filter?: Document;
  q?: Document;
}

/** @public */
export interface InsertOneModel {
  insertOne: InsertOneOptions;
}

/** @public */
export interface InsertManyModel {
  insertMany: InsertManyOptions;
}

/** @public */
export interface ReplaceOneModel {
  replaceOne: ReplaceOneOptions;
}

/** @public */
export interface UpdateOneModel {
  updateOne: UpdateOneOptions;
}

/** @public */
export interface UpdateManyModel {
  updateMany: UpdateManyOptions;
}

/** @public */
export interface RemoveOneModel {
  removeOne: RemoveOneOptions;
}

/** @public */
export interface RemoveManyModel {
  removeMany: RemoveManyOptions;
}

/** @public */
export interface DeleteOneModel {
  deleteOne: DeleteOneOptions;
}

/** @public */
export interface DeleteManyModel {
  deleteMany: DeleteManyOptions;
}

/** @public */
export type AnyModelOption =
  | InsertOneOptions
  | InsertManyOptions
  | ReplaceOneOptions
  | UpdateOneOptions
  | UpdateManyOptions
  | RemoveOneOptions
  | RemoveManyOptions
  | DeleteOneOptions
  | DeleteManyOptions;

/** @public */
export type AnyModel =
  | InsertOneModel
  | InsertManyModel
  | ReplaceOneModel
  | UpdateOneModel
  | UpdateManyModel
  | RemoveOneModel
  | RemoveManyModel
  | DeleteOneModel
  | DeleteManyModel;

/** @public */
export interface BulkOp {
  _bsontype: string;
  ts: Long | number;
  t: Long | number;
  greaterThan: (arg: BulkOp) => BulkOp;
  equals: (arg: BulkOp) => BulkOp;
}

/** @public */
export interface BulkIdDocument {
  index: number;
  _id: ObjectId;
}

/** @public */
export interface BulkResult {
  nInserted: number;
  nMatched: number;
  nModified?: number;
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
export class Batch {
  originalZeroIndex: number;
  currentIndex: number;
  originalIndexes: number[];
  batchType: BatchType;
  operations: Partial<AnyModelOption>[];
  size: number;
  sizeBytes: number;

  constructor(batchType: BatchType, originalZeroIndex: number) {
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
  get nModified(): number | undefined {
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
  getOperation(): Partial<AnyModel> {
    return this.err.op;
  }

  toJSON(): { code: number; index: number; errmsg?: string; op: Partial<AnyModel> } {
    return { code: this.err.code, index: this.err.index, errmsg: this.err.errmsg, op: this.err.op };
  }

  toString(): string {
    return `WriteError(${JSON.stringify(this.toJSON())})`;
  }
}

/** Merges results into shared data structure */
function mergeBatchResults(batch: Batch, bulkResult: BulkResult, err: any, result?: BulkResult) {
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
  } else if (!result) {
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
  if (batch.batchType === BatchType.INSERT && result.n) {
    bulkResult.nInserted = bulkResult.nInserted + result.n;
  }

  // If we have an insert Batch type
  if (batch.batchType === BatchType.REMOVE && result.n) {
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
  if (batch.batchType === BatchType.UPDATE && result.n) {
    const nModified = result.nModified;
    bulkResult.nUpserted = bulkResult.nUpserted + nUpserted;
    bulkResult.nMatched = bulkResult.nMatched + (result.n - nUpserted);

    if (typeof bulkResult.nModified === 'number' && typeof nModified === 'number') {
      bulkResult.nModified = bulkResult.nModified + nModified;
    } else {
      bulkResult.nModified = undefined;
    }
  }

  if (Array.isArray(result.writeErrors)) {
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

  if (result.writeConcernError) {
    bulkResult.writeConcernErrors.push(new WriteConcernError(result.writeConcernError));
  }
}

function executeCommands(
  bulkOperation: BulkOperationBase,
  options: BulkOptions,
  callback: Callback<BulkWriteResult>
) {
  if (bulkOperation.s.batches.length === 0) {
    return callback(undefined, new BulkWriteResult(bulkOperation.s.bulkResult));
  }

  const batch = bulkOperation.s.batches.shift() as Batch;

  function resultHandler(err?: any, result?: BulkResult) {
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

/** handles write concern error */
function handleMongoWriteConcernError(
  batch: Batch,
  bulkResult: BulkResult,
  err: MongoWriteConcernError,
  callback: Callback
) {
  mergeBatchResults(batch, bulkResult, null, err.result as BulkResult);

  const wrappedWriteConcernError = new WriteConcernError({
    errmsg: err.result?.writeConcernError.errmsg,
    code: err.result?.writeConcernError.result
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
export class BulkWriteError extends MongoError {
  result?: BulkWriteResult;

  /** Creates a new BulkWriteError */
  constructor(error?: any, result?: BulkWriteResult) {
    const message = error.err || error.errmsg || error.errMessage || error;
    super(message);

    Object.assign(this, error);

    this.name = 'BulkWriteError';
    this.result = result;
  }
}

interface DocumentWithHint extends Document {
  /** An optional hint for query optimization. See the
   * {@link https://docs.mongodb.com/manual/reference/command/update/#update-command-hint|update-command-hint}
   * reference for more information. */
  hint?: Hint;
}

/**
 * A builder object that is returned from {@link BulkOperationBase#find}.
 * Is used to build a write operation that involves a query filter.
 */
export class FindOperators {
  s: BulkOperationPrivate;

  /**
   * @internal
   * Creates a new FindOperators object.
   */
  constructor(bulkOperation: BulkOperationBase) {
    this.s = bulkOperation.s;
  }

  /** Add a multiple update operation to the bulk operation */
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

    this.s.currentOp = undefined;
    return this.s.options.addToOperationsList!(this, BatchType.UPDATE, document);
  }

  /** Add a single update operation to the bulk operation */
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

    this.s.currentOp = undefined;
    return this.s.options.addToOperationsList!(this, BatchType.UPDATE, document);
  }

  /** Add a replace one operation to the bulk operation */
  replaceOne(replacement: DocumentWithHint): FindOperators {
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

    this.s.currentOp = undefined;
    return this.s.options.addToOperationsList!(this, BatchType.UPDATE, document);
  }

  /** Upsert modifier for update bulk operation, noting that this operation is an upsert. */
  upsert(): FindOperators {
    this.s.currentOp = { ...(this.s.currentOp || {}), upsert: true };
    return this;
  }

  /** Add a delete one operation to the bulk operation */
  deleteOne(): any {
    // Establish the update command
    const document = {
      q: this.s.currentOp?.selector,
      limit: 1
    };

    this.s.currentOp = undefined;
    return this.s.options.addToOperationsList!(this, BatchType.REMOVE, document);
  }

  /** Add a delete many operation to the bulk operation */
  delete(): any {
    // Establish the update command
    const document = {
      q: this.s.currentOp?.selector,
      limit: 0
    };

    this.s.currentOp = undefined;
    return this.s.options.addToOperationsList!(this, BatchType.REMOVE, document);
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
  currentBatch?: Batch;
  currentIndex: number;
  // ordered specific
  currentBatchSize: number;
  currentBatchSizeBytes: number;
  // unordered specific
  currentInsertBatch?: Batch;
  currentUpdateBatch?: Batch;
  currentRemoveBatch?: Batch;
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
  currentOp?: Operation;
  // Executed
  executed: boolean;
  // Collection
  collection: Collection;
  // Fundamental error
  err?: AnyError;
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
 * @internal
 * Parent class to OrderedBulkOperation and UnorderedBulkOperation
 */
export class BulkOperationBase {
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
      currentIndex: 0,
      // ordered specific
      currentBatchSize: 0,
      currentBatchSizeBytes: 0,
      // unordered specific
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
      // Executed
      executed: executed,
      // Collection
      collection: collection,
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
   * @example
   * ```js
   * const bulkOp = collection.initializeOrderedBulkOp();
   * // Adds three inserts to the bulkOp.
   * bulkOp
   *   .insert({ a: 1 })
   *   .insert({ b: 2 })
   *   .insert({ c: 3 });
   * await bulkOp.execute();
   * ```
   */
  insert(document: Document): BulkOperationBase {
    if (this.forceServerObjectId !== true && document._id == null) document._id = new ObjectId();
    return this.s.options.addToOperationsList!(this, BatchType.INSERT, document);
  }

  /**
   * Builds a find operation for an update/updateOne/delete/deleteOne/replaceOne.
   * Returns a builder object used to complete the definition of the operation.
   *
   * @example
   * ```js
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
   * ```
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

  isUpdateOneOp(op: AnyModel): op is UpdateOneModel {
    return Object.keys(op)[0] === 'updateOne';
  }

  isUpdateManyOp(op: AnyModel): op is UpdateManyModel {
    return Object.keys(op)[0] === 'updateMany';
  }

  isReplaceOneOp(op: AnyModel): op is ReplaceOneModel {
    return Object.keys(op)[0] === 'replaceOne';
  }

  isDeleteOneOp(op: AnyModel): op is DeleteOneModel {
    return Object.keys(op)[0] === 'deleteOne';
  }

  isDeleteManyOp(op: AnyModel): op is DeleteManyModel {
    return Object.keys(op)[0] === 'deleteMany';
  }

  isRemoveOneOp(op: AnyModel): op is RemoveOneModel {
    return Object.keys(op)[0] === 'removeOne';
  }

  isRemoveManyOp(op: AnyModel): op is RemoveManyModel {
    return Object.keys(op)[0] === 'removeMany';
  }

  isInsertOneOp(op: AnyModel): op is InsertOneModel {
    return Object.keys(op)[0] === 'insertOne';
  }

  isInsertManyOp(op: AnyModel): op is InsertManyModel {
    return Object.keys(op)[0] === 'insertMany';
  }

  getCollation(options: { collation?: CollationOptions }): { collation?: CollationOptions } {
    const collation = options.collation;
    if (this.isOrdered && collation) return { collation };
    return {};
  }

  getArrayFilters(options: { arrayFilters?: Document[] }): Document[] | undefined {
    const { arrayFilters } = options;
    if (arrayFilters && maxWireVersion(this.s.topology) < 6) {
      throw new TypeError('arrayFilters are only supported on MongoDB 3.6+');
    }
    return arrayFilters;
  }

  raw(op: AnyModel): BulkOperationBase {
    const { isOrdered: upsert } = this;
    const forceServerObjectId = this.forceServerObjectId;
    const shouldCreateId = forceServerObjectId !== true;
    if (this.isUpdateOneOp(op)) {
      // UPDATE ONE
      const multi = false;
      const options = op.updateOne;
      if (options.q) {
        const operation = { ...options, multi };
        return this.s.options.addToOperationsList!(this, BatchType.UPDATE, operation);
      }
      const { filter: q, update: u, hint } = options;
      const arrayFilters = this.getArrayFilters(options);
      const collation = this.getCollation(options);
      const operation = { multi, q, u, hint, upsert, arrayFilters, ...collation };
      return this.s.options.addToOperationsList!(this, BatchType.UPDATE, operation);
    } else if (this.isUpdateManyOp(op)) {
      // UPDATE MANY
      const multi = true;
      const options = op.updateMany;
      if (options.q) {
        const operation = { ...options, multi };
        return this.s.options.addToOperationsList!(this, BatchType.UPDATE, operation);
      }
      const { filter: q, update: u, hint } = options;
      const arrayFilters = this.getArrayFilters(options);
      const collation = this.getCollation(options);
      const operation = { multi, q, u, hint, upsert, arrayFilters, ...collation };
      return this.s.options.addToOperationsList!(this, BatchType.UPDATE, operation);
    } else if (this.isReplaceOneOp(op)) {
      // REPLACE ONE
      const multi = false;
      const options = op.replaceOne;
      if (options.q) {
        const operation = { ...options, multi: false };
        return this.s.options.addToOperationsList!(this, BatchType.UPDATE, operation);
      }
      const { filter: q, replacement: u, hint } = options;
      const operation = { multi, q, u, hint, upsert };
      return this.s.options.addToOperationsList!(this, BatchType.UPDATE, operation);
    } else if (this.isDeleteOneOp(op)) {
      // DELETE ONE
      const limit = 1;
      const options = op.deleteOne;
      if (options.q) {
        const operation = { ...options, limit };
        return this.s.options.addToOperationsList!(this, BatchType.REMOVE, operation);
      }
      const { filter: q, hint } = options;
      const collation = this.getCollation(options);
      const operation = { q, limit, hint, ...collation };
      return this.s.options.addToOperationsList!(this, BatchType.REMOVE, operation);
    } else if (this.isDeleteManyOp(op)) {
      // DELETE MANY
      const options = op.deleteMany;
      if (options.q) {
        const operation = { ...options };
        return this.s.options.addToOperationsList!(this, BatchType.REMOVE, operation);
      }
      const { filter: q } = options;
      const collation = this.getCollation(options);
      const operation = { q, ...collation };
      return this.s.options.addToOperationsList!(this, BatchType.REMOVE, operation);
    } else if (this.isRemoveOneOp(op)) {
      // REMOVE ONE
      const limit = 1;
      const options = op.removeOne;
      const operation = { ...options, limit };
      return this.s.options.addToOperationsList!(this, BatchType.REMOVE, operation);
    } else if (this.isRemoveManyOp(op)) {
      // REMOVE MANY
      const options = op.removeMany;
      const operation = options;
      return this.s.options.addToOperationsList!(this, BatchType.REMOVE, operation);
    } else if (this.isInsertOneOp(op)) {
      // INSERT ONE
      const options = op.insertOne;
      if (options.document == null) {
        const missingId = options._id == null;
        const _id = missingId && shouldCreateId ? { _id: new ObjectId() } : {};
        const operation = { ...options, ..._id };
        return this.s.options.addToOperationsList!(this, BatchType.INSERT, operation);
      }
      const missingId = options.document._id == null;
      const _id = missingId && shouldCreateId ? { _id: new ObjectId() } : {};
      const operation = { ...options.document, ..._id };
      return this.s.options.addToOperationsList!(this, BatchType.INSERT, operation);
    } else if (this.isInsertManyOp(op)) {
      // INSERT MANY
      op.insertMany.forEach(options => {
        // same as above, can be reused, OG code didn't check document
        if (options.document == null) {
          const missingId = options._id == null;
          const _id = missingId && shouldCreateId ? { _id: new ObjectId() } : {};
          const operation = { ...options, ..._id };
          return this.s.options.addToOperationsList!(this, BatchType.INSERT, operation);
        }
        const missingId = options.document._id == null;
        const _id = missingId && shouldCreateId ? { _id: new ObjectId() } : {};
        const operation = { ...options.document, ..._id };
        return this.s.options.addToOperationsList!(this, BatchType.INSERT, operation);
      });
    }
    throw new Error(`Operation not recognized: ${Object.keys(op)[0]}`);
  }

  /** helper function to assist with promiseOrCallback behavior */
  _handleEarlyError(err?: any, callback?: any): Promise<void> | void {
    const Promise = PromiseProvider.get();

    if (typeof callback === 'function') {
      callback(err, null);
      return;
    }

    return Promise.reject(err);
  }

  /** An internal helper method. Do not invoke directly. Will be going away in the future */
  bulkExecute(
    _writeConcern?: WriteConcern,
    options?: BulkOptions,
    callback?: Callback
  ): Promise<void> | { options: BulkOptions; callback?: Callback } | void {
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

  /** Execute the bulk operation */
  execute(
    _writeConcern?: WriteConcern,
    options?: BulkOptions,
    callback?: Callback<BulkWriteResult>
  ): Promise<void> | void {
    const ret = this.bulkExecute(_writeConcern, options, callback!);
    if (!ret) return;
    if (ret && isPromiseLike(ret)) {
      return ret;
    }
    options = ret.options;
    callback = ret.callback;
    return executeLegacyOperation(this.s.topology, executeCommands, [this, options, callback]);
  }

  /**
   * @internal
   * Handles final options before executing command
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
      if (config.batch.batchType === BatchType.UPDATE) {
        finalOptions.retryWrites =
          finalOptions.retryWrites && !config.batch.operations.some((op: any) => op.multi);
      }

      if (config.batch.batchType === BatchType.REMOVE) {
        finalOptions.retryWrites =
          finalOptions.retryWrites && !config.batch.operations.some((op: any) => op.limit === 0);
      }
    }

    try {
      if (config.batch.batchType === BatchType.INSERT) {
        executeOperation(
          this.s.topology,
          new InsertOperation(this.s.namespace, config.batch.operations, finalOptions),
          config.resultHandler
        );
      } else if (config.batch.batchType === BatchType.UPDATE) {
        executeOperation(
          this.s.topology,
          new UpdateOperation(this.s.namespace, config.batch.operations, finalOptions),
          config.resultHandler
        );
      } else if (config.batch.batchType === BatchType.REMOVE) {
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
      callback(undefined, mergeBatchResults(config.batch, this.s.bulkResult, err, undefined));
    }
  }

  /**
   * @internal
   * Handles the write error before executing commands
   */
  handleWriteError(callback: Callback, writeResult: BulkWriteResult): boolean | undefined {
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
    const possibleError = writeResult.getWriteConcernError();
    if (possibleError) {
      callback(new BulkWriteError(new MongoError(possibleError), writeResult));
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
