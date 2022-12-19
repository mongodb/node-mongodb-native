"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GridFSBucketWriteStream = void 0;
const stream_1 = require("stream");
const bson_1 = require("../bson");
const error_1 = require("../error");
const utils_1 = require("../utils");
const write_concern_1 = require("./../write_concern");
/**
 * A writable stream that enables you to write buffers to GridFS.
 *
 * Do not instantiate this class directly. Use `openUploadStream()` instead.
 * @public
 */
class GridFSBucketWriteStream extends stream_1.Writable {
    /**
     * @param bucket - Handle for this stream's corresponding bucket
     * @param filename - The value of the 'filename' key in the files doc
     * @param options - Optional settings.
     * @internal
     */
    constructor(bucket, filename, options) {
        super();
        options = options !== null && options !== void 0 ? options : {};
        this.bucket = bucket;
        this.chunks = bucket.s._chunksCollection;
        this.filename = filename;
        this.files = bucket.s._filesCollection;
        this.options = options;
        this.writeConcern = write_concern_1.WriteConcern.fromOptions(options) || bucket.s.options.writeConcern;
        // Signals the write is all done
        this.done = false;
        this.id = options.id ? options.id : new bson_1.ObjectId();
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
    write(chunk, encodingOrCallback, callback) {
        const encoding = typeof encodingOrCallback === 'function' ? undefined : encodingOrCallback;
        callback = typeof encodingOrCallback === 'function' ? encodingOrCallback : callback;
        return waitForIndexes(this, () => doWrite(this, chunk, encoding, callback));
    }
    abort(callback) {
        return (0, utils_1.maybeCallback)(async () => {
            if (this.state.streamEnd) {
                // TODO(NODE-3485): Replace with MongoGridFSStreamClosed
                throw new error_1.MongoAPIError('Cannot abort a stream that has already completed');
            }
            if (this.state.aborted) {
                // TODO(NODE-3485): Replace with MongoGridFSStreamClosed
                throw new error_1.MongoAPIError('Cannot call abort() on a stream twice');
            }
            this.state.aborted = true;
            await this.chunks.deleteMany({ files_id: this.id });
        }, callback);
    }
    end(chunkOrCallback, encodingOrCallback, callback) {
        const chunk = typeof chunkOrCallback === 'function' ? undefined : chunkOrCallback;
        const encoding = typeof encodingOrCallback === 'function' ? undefined : encodingOrCallback;
        callback =
            typeof chunkOrCallback === 'function'
                ? chunkOrCallback
                : typeof encodingOrCallback === 'function'
                    ? encodingOrCallback
                    : callback;
        if (this.state.streamEnd || checkAborted(this, callback))
            return this;
        this.state.streamEnd = true;
        if (callback) {
            this.once(GridFSBucketWriteStream.FINISH, (result) => {
                if (callback)
                    callback(undefined, result);
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
exports.GridFSBucketWriteStream = GridFSBucketWriteStream;
/** @event */
GridFSBucketWriteStream.CLOSE = 'close';
/** @event */
GridFSBucketWriteStream.ERROR = 'error';
/**
 * `end()` was called and the write stream successfully wrote the file metadata and all the chunks to MongoDB.
 * @event
 */
GridFSBucketWriteStream.FINISH = 'finish';
function __handleError(stream, error, callback) {
    if (stream.state.errored) {
        return;
    }
    stream.state.errored = true;
    if (callback) {
        return callback(error);
    }
    stream.emit(GridFSBucketWriteStream.ERROR, error);
}
function createChunkDoc(filesId, n, data) {
    return {
        _id: new bson_1.ObjectId(),
        files_id: filesId,
        n,
        data
    };
}
function checkChunksIndex(stream, callback) {
    stream.chunks.listIndexes().toArray((error, indexes) => {
        let index;
        if (error) {
            // Collection doesn't exist so create index
            if (error instanceof error_1.MongoError && error.code === error_1.MONGODB_ERROR_CODES.NamespaceNotFound) {
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
            indexes.forEach((index) => {
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
        }
        else {
            index = { files_id: 1, n: 1 };
            const writeConcernOptions = getWriteOptions(stream);
            stream.chunks.createIndex(index, {
                ...writeConcernOptions,
                background: true,
                unique: true
            }, callback);
        }
    });
}
function checkDone(stream, callback) {
    if (stream.done)
        return true;
    if (stream.state.streamEnd && stream.state.outstandingRequests === 0 && !stream.state.errored) {
        // Set done so we do not trigger duplicate createFilesDoc
        stream.done = true;
        // Create a new files doc
        const filesDoc = createFilesDoc(stream.id, stream.length, stream.chunkSizeBytes, stream.filename, stream.options.contentType, stream.options.aliases, stream.options.metadata);
        if (checkAborted(stream, callback)) {
            return false;
        }
        stream.files.insertOne(filesDoc, getWriteOptions(stream), (error) => {
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
function checkIndexes(stream, callback) {
    stream.files.findOne({}, { projection: { _id: 1 } }, (error, doc) => {
        if (error) {
            return callback(error);
        }
        if (doc) {
            return callback();
        }
        stream.files.listIndexes().toArray((error, indexes) => {
            let index;
            if (error) {
                // Collection doesn't exist so create index
                if (error instanceof error_1.MongoError && error.code === error_1.MONGODB_ERROR_CODES.NamespaceNotFound) {
                    index = { filename: 1, uploadDate: 1 };
                    stream.files.createIndex(index, { background: false }, (error) => {
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
                indexes.forEach((index) => {
                    const keys = Object.keys(index.key);
                    if (keys.length === 2 && index.key.filename === 1 && index.key.uploadDate === 1) {
                        hasFileIndex = true;
                    }
                });
            }
            if (hasFileIndex) {
                checkChunksIndex(stream, callback);
            }
            else {
                index = { filename: 1, uploadDate: 1 };
                const writeConcernOptions = getWriteOptions(stream);
                stream.files.createIndex(index, {
                    ...writeConcernOptions,
                    background: false
                }, (error) => {
                    if (error) {
                        return callback(error);
                    }
                    checkChunksIndex(stream, callback);
                });
            }
        });
    });
}
function createFilesDoc(_id, length, chunkSize, filename, contentType, aliases, metadata) {
    const ret = {
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
function doWrite(stream, chunk, encoding, callback) {
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
    let spaceRemaining = stream.chunkSizeBytes - stream.pos;
    let numToCopy = Math.min(spaceRemaining, inputBuf.length);
    let outstandingRequests = 0;
    while (inputBufRemaining > 0) {
        const inputBufPos = inputBuf.length - inputBufRemaining;
        inputBuf.copy(stream.bufToStore, stream.pos, inputBufPos, inputBufPos + numToCopy);
        stream.pos += numToCopy;
        spaceRemaining -= numToCopy;
        let doc;
        if (spaceRemaining === 0) {
            doc = createChunkDoc(stream.id, stream.n, Buffer.from(stream.bufToStore));
            ++stream.state.outstandingRequests;
            ++outstandingRequests;
            if (checkAborted(stream, callback)) {
                return false;
            }
            stream.chunks.insertOne(doc, getWriteOptions(stream), (error) => {
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
function getWriteOptions(stream) {
    const obj = {};
    if (stream.writeConcern) {
        obj.writeConcern = {
            w: stream.writeConcern.w,
            wtimeout: stream.writeConcern.wtimeout,
            j: stream.writeConcern.j
        };
    }
    return obj;
}
function waitForIndexes(stream, callback) {
    if (stream.bucket.s.checkedIndexes) {
        return callback(false);
    }
    stream.bucket.once('index', () => {
        callback(true);
    });
    return true;
}
function writeRemnant(stream, callback) {
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
    stream.chunks.insertOne(doc, getWriteOptions(stream), (error) => {
        if (error) {
            return __handleError(stream, error);
        }
        --stream.state.outstandingRequests;
        checkDone(stream);
    });
    return true;
}
function checkAborted(stream, callback) {
    if (stream.state.aborted) {
        if (typeof callback === 'function') {
            // TODO(NODE-3485): Replace with MongoGridFSStreamClosedError
            callback(new error_1.MongoAPIError('Stream has been aborted'));
        }
        return true;
    }
    return false;
}
//# sourceMappingURL=upload.js.map