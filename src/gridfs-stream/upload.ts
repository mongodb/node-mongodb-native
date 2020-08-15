import * as crypto from 'crypto';
import { PromiseProvider } from '../promise_provider';
import { Writable } from 'stream';
import { ObjectId } from '../bson';
import type { Callback } from '../utils';

const ERROR_NAMESPACE_NOT_FOUND = 26;

/**
 * A writable stream that enables you to write buffers to GridFS.
 *
 * Do not instantiate this class directly. Use `openUploadStream()` instead.
 *
 * @class
 * @extends external:Writable
 * @param {GridFSBucket} bucket Handle for this stream's corresponding bucket
 * @param {string} filename The value of the 'filename' key in the files doc
 * @param {object} [options] Optional settings.
 * @param {string|number|object} [options.id] Custom file id for the GridFS file.
 * @param {number} [options.chunkSizeBytes] The chunk size to use, in bytes
 * @param {number} [options.w] The write concern
 * @param {number} [options.wtimeout] The write concern timeout
 * @param {number} [options.j] The journal write concern
 * @param {boolean} [options.disableMD5=false] If true, disables adding an md5 field to file data
 * @fires GridFSBucketWriteStream#error
 * @fires GridFSBucketWriteStream#finish
 */

export class GridFSBucketWriteStream extends Writable {
  bucket: any;
  chunks: any;
  filename: any;
  files: any;
  options: any;
  done: any;
  id: any;
  chunkSizeBytes: any;
  bufToStore: any;
  length: any;
  md5: any;
  n: any;
  pos: any;
  state: any;

  constructor(bucket: any, filename: any, options: any) {
    super();

    options = options || {};
    this.bucket = bucket;
    this.chunks = bucket.s._chunksCollection;
    this.filename = filename;
    this.files = bucket.s._filesCollection;
    this.options = options;
    // Signals the write is all done
    this.done = false;

    this.id = options.id ? options.id : new ObjectId();
    this.chunkSizeBytes = this.options.chunkSizeBytes;
    this.bufToStore = Buffer.alloc(this.chunkSizeBytes);
    this.length = 0;
    this.md5 = !options.disableMD5 && crypto.createHash('md5');
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

      var _this = this;
      checkIndexes(this, () => {
        _this.bucket.s.checkedIndexes = true;
        _this.bucket.emit('index');
      });
    }
  }

  /**
   * An error occurred
   *
   * @event GridFSBucketWriteStream#error
   * @type {Error}
   */

  /**
   * `end()` was called and the write stream successfully wrote the file
   * metadata and all the chunks to MongoDB.
   *
   * @event GridFSBucketWriteStream#finish
   * @type {object}
   */

  /**
   * Write a buffer to the stream.
   *
   * @function
   * @param {Buffer} chunk Buffer to write
   * @param {string} encoding Optional encoding for the buffer
   * @param {GridFSBucket~errorCallback} callback Function to call when the chunk was added to the buffer, or if the entire chunk was persisted to MongoDB if this chunk caused a flush.
   * @returns {boolean} False if this write required flushing a chunk to MongoDB. True otherwise.
   */

  write(chunk: any, encoding: any, callback?: Callback): boolean {
    var _this = this;
    return waitForIndexes(this, () => doWrite(_this, chunk, encoding, callback));
  }

  /**
   * Places this write stream into an aborted state (all future writes fail)
   * and deletes all chunks that have already been written.
   *
   * @function
   * @param {GridFSBucket~errorCallback} callback called when chunks are successfully removed or error occurred
   * @returns {Promise<void>} if no callback specified
   */

  abort(callback: Callback) {
    const Promise = PromiseProvider.get();
    if (this.state.streamEnd) {
      var error = new Error('Cannot abort a stream that has already completed');
      if (typeof callback === 'function') {
        return callback(error);
      }
      return Promise.reject(error);
    }
    if (this.state.aborted) {
      error = new Error('Cannot call abort() on a stream twice');
      if (typeof callback === 'function') {
        return callback(error);
      }
      return Promise.reject(error);
    }
    this.state.aborted = true;
    this.chunks.deleteMany({ files_id: this.id }, (error: any) => {
      if (typeof callback === 'function') callback(error);
    });
  }

  /**
   * Tells the stream that no more data will be coming in. The stream will
   * persist the remaining data to MongoDB, write the files document, and
   * then emit a 'finish' event.
   *
   * @function
   * @param {Buffer} chunk Buffer to write
   * @param {string} encoding Optional encoding for the buffer
   * @param {GridFSBucket~errorCallback} callback Function to call when all files and chunks have been persisted to MongoDB
   */

  end(chunk: any, encoding?: any, callback?: Callback) {
    var _this = this;
    if (typeof chunk === 'function') {
      (callback = chunk), (chunk = null), (encoding = null);
    } else if (typeof encoding === 'function') {
      (callback = encoding), (encoding = null);
    }

    if (checkAborted(this, callback)) {
      return;
    }
    this.state.streamEnd = true;

    if (callback) {
      this.once('finish', (result: any) => {
        callback!(undefined, result);
      });
    }

    if (!chunk) {
      waitForIndexes(this, () => !!writeRemnant(_this));
      return;
    }

    this.write(chunk, encoding, () => {
      writeRemnant(_this);
    });
  }
}

function __handleError(_this: any, error: any, callback?: Callback) {
  if (_this.state.errored) {
    return;
  }
  _this.state.errored = true;
  if (callback) {
    return callback(error);
  }
  _this.emit('error', error);
}

function createChunkDoc(filesId: any, n: any, data: any) {
  return {
    _id: new ObjectId(),
    files_id: filesId,
    n,
    data
  };
}

function checkChunksIndex(_this: any, callback: Callback) {
  _this.chunks.listIndexes().toArray((error?: any, indexes?: any) => {
    if (error) {
      // Collection doesn't exist so create index
      if (error.code === ERROR_NAMESPACE_NOT_FOUND) {
        var index = { files_id: 1, n: 1 };
        _this.chunks.createIndex(index, { background: false, unique: true }, (error: any) => {
          if (error) {
            return callback(error);
          }

          callback();
        });
        return;
      }
      return callback(error);
    }

    var hasChunksIndex = false;
    indexes.forEach((index: any) => {
      if (index.key) {
        var keys = Object.keys(index.key);
        if (keys.length === 2 && index.key.files_id === 1 && index.key.n === 1) {
          hasChunksIndex = true;
        }
      }
    });

    if (hasChunksIndex) {
      callback();
    } else {
      index = { files_id: 1, n: 1 };
      var indexOptions = getWriteOptions(_this);

      indexOptions.background = false;
      indexOptions.unique = true;

      _this.chunks.createIndex(index, indexOptions, (error: any) => {
        if (error) {
          return callback(error);
        }

        callback();
      });
    }
  });
}

function checkDone(_this: any, callback?: Callback) {
  if (_this.done) return true;
  if (_this.state.streamEnd && _this.state.outstandingRequests === 0 && !_this.state.errored) {
    // Set done so we dont' trigger duplicate createFilesDoc
    _this.done = true;
    // Create a new files doc
    var filesDoc = createFilesDoc(
      _this.id,
      _this.length,
      _this.chunkSizeBytes,
      _this.md5 && _this.md5.digest('hex'),
      _this.filename,
      _this.options.contentType,
      _this.options.aliases,
      _this.options.metadata
    );

    if (checkAborted(_this, callback)) {
      return false;
    }

    _this.files.insertOne(filesDoc, getWriteOptions(_this), (error: any) => {
      if (error) {
        return __handleError(_this, error, callback);
      }
      _this.emit('finish', filesDoc);
    });

    return true;
  }

  return false;
}

function checkIndexes(_this: any, callback: Callback) {
  _this.files.findOne({}, { _id: 1 }, (error?: any, doc?: any) => {
    if (error) {
      return callback(error);
    }
    if (doc) {
      return callback();
    }

    _this.files.listIndexes().toArray((error?: any, indexes?: any) => {
      if (error) {
        // Collection doesn't exist so create index
        if (error.code === ERROR_NAMESPACE_NOT_FOUND) {
          var index = { filename: 1, uploadDate: 1 };
          _this.files.createIndex(index, { background: false }, (error: any) => {
            if (error) {
              return callback(error);
            }

            checkChunksIndex(_this, callback);
          });
          return;
        }
        return callback(error);
      }

      var hasFileIndex = false;
      indexes.forEach((index: any) => {
        var keys = Object.keys(index.key);
        if (keys.length === 2 && index.key.filename === 1 && index.key.uploadDate === 1) {
          hasFileIndex = true;
        }
      });

      if (hasFileIndex) {
        checkChunksIndex(_this, callback);
      } else {
        index = { filename: 1, uploadDate: 1 };

        var indexOptions = getWriteOptions(_this);

        indexOptions.background = false;

        _this.files.createIndex(index, indexOptions, (error: any) => {
          if (error) {
            return callback(error);
          }

          checkChunksIndex(_this, callback);
        });
      }
    });
  });
}

function createFilesDoc(
  _id: any,
  length: any,
  chunkSize: any,
  md5: any,
  filename: any,
  contentType: any,
  aliases: any,
  metadata: any
) {
  var ret = {
    _id,
    length,
    chunkSize,
    uploadDate: new Date(),
    filename
  } as any;

  if (md5) {
    ret.md5 = md5;
  }

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

function doWrite(_this: any, chunk: any, encoding: any, callback?: Callback) {
  if (checkAborted(_this, callback)) {
    return false;
  }

  var inputBuf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding);

  _this.length += inputBuf.length;

  // Input is small enough to fit in our buffer
  if (_this.pos + inputBuf.length < _this.chunkSizeBytes) {
    inputBuf.copy(_this.bufToStore, _this.pos);
    _this.pos += inputBuf.length;

    callback && callback();

    // Note that we reverse the typical semantics of write's return value
    // to be compatible with node's `.pipe()` function.
    // True means client can keep writing.
    return true;
  }

  // Otherwise, buffer is too big for current chunk, so we need to flush
  // to MongoDB.
  var inputBufRemaining = inputBuf.length;
  var spaceRemaining = _this.chunkSizeBytes - _this.pos;
  var numToCopy = Math.min(spaceRemaining, inputBuf.length);
  var outstandingRequests = 0;
  while (inputBufRemaining > 0) {
    var inputBufPos = inputBuf.length - inputBufRemaining;
    inputBuf.copy(_this.bufToStore, _this.pos, inputBufPos, inputBufPos + numToCopy);
    _this.pos += numToCopy;
    spaceRemaining -= numToCopy;
    if (spaceRemaining === 0) {
      if (_this.md5) {
        _this.md5.update(_this.bufToStore);
      }
      var doc = createChunkDoc(_this.id, _this.n, Buffer.from(_this.bufToStore));
      ++_this.state.outstandingRequests;
      ++outstandingRequests;

      if (checkAborted(_this, callback)) {
        return false;
      }

      _this.chunks.insertOne(doc, getWriteOptions(_this), (error: any) => {
        if (error) {
          return __handleError(_this, error);
        }
        --_this.state.outstandingRequests;
        --outstandingRequests;

        if (!outstandingRequests) {
          _this.emit('drain', doc);
          callback && callback();
          checkDone(_this);
        }
      });

      spaceRemaining = _this.chunkSizeBytes;
      _this.pos = 0;
      ++_this.n;
    }
    inputBufRemaining -= numToCopy;
    numToCopy = Math.min(spaceRemaining, inputBufRemaining);
  }

  // Note that we reverse the typical semantics of write's return value
  // to be compatible with node's `.pipe()` function.
  // False means the client should wait for the 'drain' event.
  return false;
}

function getWriteOptions(_this: any) {
  var obj = {} as any;
  if (_this.options.writeConcern) {
    obj.w = _this.options.writeConcern.w;
    obj.wtimeout = _this.options.writeConcern.wtimeout;
    obj.j = _this.options.writeConcern.j;
  }
  return obj;
}

function waitForIndexes(_this: any, callback: (res: boolean) => boolean): boolean {
  if (_this.bucket.s.checkedIndexes) {
    return callback(false);
  }

  _this.bucket.once('index', () => {
    callback(true);
  });

  return true;
}

function writeRemnant(_this: any, callback?: Callback) {
  // Buffer is empty, so don't bother to insert
  if (_this.pos === 0) {
    return checkDone(_this, callback);
  }

  ++_this.state.outstandingRequests;

  // Create a new buffer to make sure the buffer isn't bigger than it needs
  // to be.
  var remnant = Buffer.alloc(_this.pos);
  _this.bufToStore.copy(remnant, 0, 0, _this.pos);
  if (_this.md5) {
    _this.md5.update(remnant);
  }
  var doc = createChunkDoc(_this.id, _this.n, remnant);

  // If the stream was aborted, do not write remnant
  if (checkAborted(_this, callback)) {
    return false;
  }

  _this.chunks.insertOne(doc, getWriteOptions(_this), (error: any) => {
    if (error) {
      return __handleError(_this, error);
    }
    --_this.state.outstandingRequests;
    checkDone(_this);
  });
}

function checkAborted(_this: any, callback?: Callback) {
  if (_this.state.aborted) {
    if (typeof callback === 'function') {
      callback(new Error('this stream has been aborted'));
    }
    return true;
  }
  return false;
}
