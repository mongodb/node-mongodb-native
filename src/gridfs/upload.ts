import { Writable } from 'stream';

import type { Document } from '../bson';
import { ObjectId } from '../bson';
import type { Collection } from '../collection';
import { AnyError, MongoAPIError, MONGODB_ERROR_CODES, MongoError } from '../error';
import { Callback, maybePromise } from '../utils';
import type { WriteConcernOptions } from '../write_concern';
import { WriteConcern } from './../write_concern';
import type { GridFSFile } from './download';
import type { GridFSBucket } from './index';

/** @public */
export interface GridFSChunk {
  _id: ObjectId;
  files_id: ObjectId;
  n: number;
  data: Buffer | Uint8Array;
}

/** @public */
export interface GridFSBucketWriteStreamOptions extends WriteConcernOptions {
  /** Overwrite this bucket's chunkSizeBytes for this file */
  chunkSizeBytes?: number;
  /** Custom file id for the GridFS file. */
  id?: ObjectId;
  /** Object to store in the file document's `metadata` field */
  metadata?: Document;
  /** String to store in the file document's `contentType` field */
  contentType?: string;
  /** Array of strings to store in the file document's `aliases` field */
  aliases?: string[];
}

/**
 * A writable stream that enables you to write buffers to GridFS.
 *
 * Do not instantiate this class directly. Use `openUploadStream()` instead.
 * @public
 */
export class GridFSBucketWriteStream extends Writable implements NodeJS.WritableStream {
  bucket: GridFSBucket;
  chunks: Collection<GridFSChunk>;
  filename: string;
  files: Collection<GridFSFile>;
  options: GridFSBucketWriteStreamOptions;
  done: boolean;
  id: ObjectId;
  chunkSizeBytes: number;
  bufToStore: Buffer;
  length: number;
  n: number;
  pos: number;
  state: {
    streamEnd: boolean;
    outstandingRequests: number;
    errored: boolean;
    aborted: boolean;
  };
  writeConcern?: WriteConcern;

  /** @event */
  static readonly CLOSE = 'close';
  /** @event */
  static readonly ERROR = 'error';
  /**
   * `end()` was called and the write stream successfully wrote the file metadata and all the chunks to MongoDB.
   * @event
   */
  static readonly FINISH = 'finish';

  /** @internal
   * @param bucket - Handle for this stream's corresponding bucket
   * @param filename - The value of the 'filename' key in the files doc
   * @param options - Optional settings.
   */
  constructor(bucket: GridFSBucket, filename: string, options?: GridFSBucketWriteStreamOptions) {
    super();

    options = options ?? {};
    this.bucket = bucket;
    this.chunks = bucket.s._chunksCollection;
    this.filename = filename;
    this.files = bucket.s._filesCollection;
    this.options = options;
    this.writeConcern = WriteConcern.fromOptions(options) || bucket.s.options.writeConcern;
    // Signals the write is all done
    this.done = false;

    this.id = options.id ? options.id : new ObjectId();
    // properly inherit the default chunksize from parent
    this.chunkSizeBytes = options.chunkSizeBytes || this.bucket.s.options.chunkSizeBytes;
    this.bufToStore = Buffer.alloc(this.chunkSizeBytes);
    this.length = 0;
    this.n = 0;
    this.pos = 0;
    this.state = {
      streamEnd: false,
      outstandingRequests: 0,
      errored: false,
      aborted: false
    };

    if (!this.bucket.s.calledOpenUploadStream) {
      this.bucket.s.calledOpenUploadStream = true;

      checkIndexes(this, () => {
        this.bucket.s.checkedIndexes = true;
        this.bucket.emit('index');
      });
    }
  }

  /**
   * Write a buffer to the stream.
   *
   * @param chunk - Buffer to write
   * @param encodingOrCallback - Optional encoding for the buffer
   * @param callback - Function to call when the chunk was added to the buffer, or if the entire chunk was persisted to MongoDB if this chunk caused a flush.
   * @returns False if this write required flushing a chunk to MongoDB. True otherwise.
   */
  override write(chunk: Buffer | string): boolean;
  override write(chunk: Buffer | string, callback: Callback<void>): boolean;
  override write(chunk: Buffer | string, encoding: BufferEncoding | undefined): boolean;
  override write(
    chunk: Buffer | string,
    encoding: BufferEncoding | undefined,
    callback: Callback<void>
  ): boolean;
  override write(
    chunk: Buffer | string,
    encodingOrCallback?: Callback<void> | BufferEncoding,
    callback?: Callback<void>
  ): boolean {
    const encoding = typeof encodingOrCallback === 'function' ? undefined : encodingOrCallback;
    callback = typeof encodingOrCallback === 'function' ? encodingOrCallback : callback;
    return waitForIndexes(this, () => doWrite(this, chunk, encoding, callback));
  }

  // TODO(NODE-3405): Refactor this with maybePromise and MongoStreamClosedError
  /**
   * Places this write stream into an aborted state (all future writes fail)
   * and deletes all chunks that have already been written.
   *
   * @param callback - called when chunks are successfully removed or error occurred
   */
  abort(): Promise<void>;
  abort(callback: Callback<void>): void;
  abort(callback?: Callback<void>): Promise<void> | void {
    return maybePromise(callback, callback => {
      if (this.state.streamEnd) {
        // TODO(NODE-3485): Replace with MongoGridFSStreamClosed
        return callback(new MongoAPIError('Cannot abort a stream that has already completed'));
      }

      if (this.state.aborted) {
        // TODO(NODE-3485): Replace with MongoGridFSStreamClosed
        return callback(new MongoAPIError('Cannot call abort() on a stream twice'));
      }

      this.state.aborted = true;
      this.chunks.deleteMany({ files_id: this.id }, error => callback(error));
    });
  }

  /**
   * Tells the stream that no more data will be coming in. The stream will
   * persist the remaining data to MongoDB, write the files document, and
   * then emit a 'finish' event.
   *
   * @param chunk - Buffer to write
   * @param encoding - Optional encoding for the buffer
   * @param callback - Function to call when all files and chunks have been persisted to MongoDB
   */
  override end(): this;
  override end(chunk: Buffer): this;
  override end(callback: Callback<GridFSFile | void>): this;
  override end(chunk: Buffer, callback: Callback<GridFSFile | void>): this;
  override end(chunk: Buffer, encoding: BufferEncoding): this;
  override end(
    chunk: Buffer,
    encoding: BufferEncoding | undefined,
    callback: Callback<GridFSFile | void>
  ): this;
  override end(
    chunkOrCallback?: Buffer | Callback<GridFSFile | void>,
    encodingOrCallback?: BufferEncoding | Callback<GridFSFile | void>,
    callback?: Callback<GridFSFile | void>
  ): this {
    const chunk = typeof chunkOrCallback === 'function' ? undefined : chunkOrCallback;
    const encoding = typeof encodingOrCallback === 'function' ? undefined : encodingOrCallback;
    callback =
      typeof chunkOrCallback === 'function'
        ? chunkOrCallback
        : typeof encodingOrCallback === 'function'
        ? encodingOrCallback
        : callback;

    if (this.state.streamEnd || checkAborted(this, callback)) return this;

    this.state.streamEnd = true;

    if (callback) {
      this.once(GridFSBucketWriteStream.FINISH, (result: GridFSFile) => {
        if (callback) callback(undefined, result);
      });
    }

    if (!chunk) {
      waitForIndexes(this, () => !!writeRemnant(this));
      return this;
    }

    this.write(chunk, encoding, () => {
      writeRemnant(this);
    });

    return this;
  }
}

function __handleError(
  stream: GridFSBucketWriteStream,
  error: AnyError,
  callback?: Callback
): void {
  if (stream.state.errored) {
    return;
  }
  stream.state.errored = true;
  if (callback) {
    return callback(error);
  }
  stream.emit(GridFSBucketWriteStream.ERROR, error);
}

function createChunkDoc(filesId: ObjectId, n: number, data: Buffer): GridFSChunk {
  return {
    _id: new ObjectId(),
    files_id: filesId,
    n,
    data
  };
}

function checkChunksIndex(stream: GridFSBucketWriteStream, callback: Callback): void {
  stream.chunks.listIndexes().toArray((error?: AnyError, indexes?: Document[]) => {
    let index: { files_id: number; n: number };
    if (error) {
      // Collection doesn't exist so create index
      if (error instanceof MongoError && error.code === MONGODB_ERROR_CODES.NamespaceNotFound) {
        index = { files_id: 1, n: 1 };
        stream.chunks.createIndex(index, { background: false, unique: true }, error => {
          if (error) {
            return callback(error);
          }

          callback();
        });
        return;
      }
      return callback(error);
    }

    let hasChunksIndex = false;
    if (indexes) {
      indexes.forEach((index: Document) => {
        if (index.key) {
          const keys = Object.keys(index.key);
          if (keys.length === 2 && index.key.files_id === 1 && index.key.n === 1) {
            hasChunksIndex = true;
          }
        }
      });
    }

    if (hasChunksIndex) {
      callback();
    } else {
      index = { files_id: 1, n: 1 };
      const writeConcernOptions = getWriteOptions(stream);

      stream.chunks.createIndex(
        index,
        {
          ...writeConcernOptions,
          background: true,
          unique: true
        },
        callback
      );
    }
  });
}

function checkDone(stream: GridFSBucketWriteStream, callback?: Callback): boolean {
  if (stream.done) return true;
  if (stream.state.streamEnd && stream.state.outstandingRequests === 0 && !stream.state.errored) {
    // Set done so we do not trigger duplicate createFilesDoc
    stream.done = true;
    // Create a new files doc
    const filesDoc = createFilesDoc(
      stream.id,
      stream.length,
      stream.chunkSizeBytes,
      stream.filename,
      stream.options.contentType,
      stream.options.aliases,
      stream.options.metadata
    );

    if (checkAborted(stream, callback)) {
      return false;
    }

    stream.files.insertOne(filesDoc, getWriteOptions(stream), (error?: AnyError) => {
      if (error) {
        return __handleError(stream, error, callback);
      }
      stream.emit(GridFSBucketWriteStream.FINISH, filesDoc);
      stream.emit(GridFSBucketWriteStream.CLOSE);
    });

    return true;
  }

  return false;
}

function checkIndexes(stream: GridFSBucketWriteStream, callback: Callback): void {
  stream.files.findOne({}, { projection: { _id: 1 } }, (error, doc) => {
    if (error) {
      return callback(error);
    }
    if (doc) {
      return callback();
    }

    stream.files.listIndexes().toArray((error?: AnyError, indexes?: Document) => {
      let index: { filename: number; uploadDate: number };
      if (error) {
        // Collection doesn't exist so create index
        if (error instanceof MongoError && error.code === MONGODB_ERROR_CODES.NamespaceNotFound) {
          index = { filename: 1, uploadDate: 1 };
          stream.files.createIndex(index, { background: false }, (error?: AnyError) => {
            if (error) {
              return callback(error);
            }

            checkChunksIndex(stream, callback);
          });
          return;
        }
        return callback(error);
      }

      let hasFileIndex = false;
      if (indexes) {
        indexes.forEach((index: Document) => {
          const keys = Object.keys(index.key);
          if (keys.length === 2 && index.key.filename === 1 && index.key.uploadDate === 1) {
            hasFileIndex = true;
          }
        });
      }

      if (hasFileIndex) {
        checkChunksIndex(stream, callback);
      } else {
        index = { filename: 1, uploadDate: 1 };

        const writeConcernOptions = getWriteOptions(stream);

        stream.files.createIndex(
          index,
          {
            ...writeConcernOptions,
            background: false
          },
          (error?: AnyError) => {
            if (error) {
              return callback(error);
            }

            checkChunksIndex(stream, callback);
          }
        );
      }
    });
  });
}

function createFilesDoc(
  _id: ObjectId,
  length: number,
  chunkSize: number,
  filename: string,
  contentType?: string,
  aliases?: string[],
  metadata?: Document
): GridFSFile {
  const ret: GridFSFile = {
    _id,
    length,
    chunkSize,
    uploadDate: new Date(),
    filename
  };

  if (contentType) {
    ret.contentType = contentType;
  }

  if (aliases) {
    ret.aliases = aliases;
  }

  if (metadata) {
    ret.metadata = metadata;
  }

  return ret;
}

function doWrite(
  stream: GridFSBucketWriteStream,
  chunk: Buffer | string,
  encoding?: BufferEncoding,
  callback?: Callback<void>
): boolean {
  if (checkAborted(stream, callback)) {
    return false;
  }

  const inputBuf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding);

  stream.length += inputBuf.length;

  // Input is small enough to fit in our buffer
  if (stream.pos + inputBuf.length < stream.chunkSizeBytes) {
    inputBuf.copy(stream.bufToStore, stream.pos);
    stream.pos += inputBuf.length;

    callback && callback();

    // Note that we reverse the typical semantics of write's return value
    // to be compatible with node's `.pipe()` function.
    // True means client can keep writing.
    return true;
  }

  // Otherwise, buffer is too big for current chunk, so we need to flush
  // to MongoDB.
  let inputBufRemaining = inputBuf.length;
  let spaceRemaining: number = stream.chunkSizeBytes - stream.pos;
  let numToCopy = Math.min(spaceRemaining, inputBuf.length);
  let outstandingRequests = 0;
  while (inputBufRemaining > 0) {
    const inputBufPos = inputBuf.length - inputBufRemaining;
    inputBuf.copy(stream.bufToStore, stream.pos, inputBufPos, inputBufPos + numToCopy);
    stream.pos += numToCopy;
    spaceRemaining -= numToCopy;
    let doc: GridFSChunk;
    if (spaceRemaining === 0) {
      doc = createChunkDoc(stream.id, stream.n, Buffer.from(stream.bufToStore));
      ++stream.state.outstandingRequests;
      ++outstandingRequests;

      if (checkAborted(stream, callback)) {
        return false;
      }

      stream.chunks.insertOne(doc, getWriteOptions(stream), (error?: AnyError) => {
        if (error) {
          return __handleError(stream, error);
        }
        --stream.state.outstandingRequests;
        --outstandingRequests;

        if (!outstandingRequests) {
          stream.emit('drain', doc);
          callback && callback();
          checkDone(stream);
        }
      });

      spaceRemaining = stream.chunkSizeBytes;
      stream.pos = 0;
      ++stream.n;
    }
    inputBufRemaining -= numToCopy;
    numToCopy = Math.min(spaceRemaining, inputBufRemaining);
  }

  // Note that we reverse the typical semantics of write's return value
  // to be compatible with node's `.pipe()` function.
  // False means the client should wait for the 'drain' event.
  return false;
}

function getWriteOptions(stream: GridFSBucketWriteStream): WriteConcernOptions {
  const obj: WriteConcernOptions = {};
  if (stream.writeConcern) {
    obj.writeConcern = {
      w: stream.writeConcern.w,
      wtimeout: stream.writeConcern.wtimeout,
      j: stream.writeConcern.j
    };
  }
  return obj;
}

function waitForIndexes(
  stream: GridFSBucketWriteStream,
  callback: (res: boolean) => boolean
): boolean {
  if (stream.bucket.s.checkedIndexes) {
    return callback(false);
  }

  stream.bucket.once('index', () => {
    callback(true);
  });

  return true;
}

function writeRemnant(stream: GridFSBucketWriteStream, callback?: Callback): boolean {
  // Buffer is empty, so don't bother to insert
  if (stream.pos === 0) {
    return checkDone(stream, callback);
  }

  ++stream.state.outstandingRequests;

  // Create a new buffer to make sure the buffer isn't bigger than it needs
  // to be.
  const remnant = Buffer.alloc(stream.pos);
  stream.bufToStore.copy(remnant, 0, 0, stream.pos);
  const doc = createChunkDoc(stream.id, stream.n, remnant);

  // If the stream was aborted, do not write remnant
  if (checkAborted(stream, callback)) {
    return false;
  }

  stream.chunks.insertOne(doc, getWriteOptions(stream), (error?: AnyError) => {
    if (error) {
      return __handleError(stream, error);
    }
    --stream.state.outstandingRequests;
    checkDone(stream);
  });
  return true;
}

function checkAborted(stream: GridFSBucketWriteStream, callback?: Callback<void>): boolean {
  if (stream.state.aborted) {
    if (typeof callback === 'function') {
      // TODO(NODE-3485): Replace with MongoGridFSStreamClosedError
      callback(new MongoAPIError('Stream has been aborted'));
    }
    return true;
  }
  return false;
}
