var core = require('mongodb-core');
var crypto = require('crypto');
var shallowClone = require('../utils').shallowClone;
var stream = require('stream');
var util = require('util');

var ERROR_NAMESPACE_NOT_FOUND = 26;

module.exports = GridFSBucketWriteStream;

/**
 * A writable stream that enables you to write buffers to GridFS.
 *
 * Do not instantiate this class directly. Use `openUploadStream()` instead.
 *
 * @class
 * @param {GridFSBucket} bucket Handle for this stream's corresponding bucket
 * @param {string} filename The value of the 'filename' key in the files doc
 * @param {object} [options=null] Optional settings.
 * @param {number} [options.chunkSizeBytes=null] The chunk size to use, in bytes
 * @param {number} [options.w=null] The write concern
 * @param {number} [options.wtimeout=null] The write concern timeout
 * @param {number} [options.j=null] The journal write concern
 * @fires GridFSBucketWriteStream#error
 * @fires GridFSBucketWriteStream#finish
 * @return {GridFSBucketWriteStream} a GridFSBucketWriteStream instance.
 */

function GridFSBucketWriteStream(bucket, filename, options) {
  this.bucket = bucket;
  this.chunks = bucket.s._chunksCollection;
  this.filename = filename;
  this.files = bucket.s._filesCollection;
  this.options = options;

  this.id = core.BSON.ObjectId();
  this.chunkSizeBytes = this.options.chunkSizeBytes;
  this.bufToStore = new Buffer(this.chunkSizeBytes);
  this.length = 0;
  this.md5 = crypto.createHash('md5');
  this.n = 0;
  this.pos = 0;
  this.state = {
    streamEnd: false,
    outstandingRequests: 0,
    errored: false
  };

  if (!this.bucket.s.calledOpenUploadStream) {
    this.bucket.s.calledOpenUploadStream = true;

    var _this = this;
    checkIndexes(this, function() {
      _this.bucket.s.checkedIndexes = true;
      _this.bucket.emit('index');
    });
  }
}

util.inherits(GridFSBucketWriteStream, stream.Writable);

/**
 * An error occurred
 *
 * @event GridFSBucketWriteStream#error
 * @type {Error}
 */

/**
 * end() was called and the write stream successfully wrote all chunks to
 * MongoDB.
 *
 * @event GridFSBucketWriteStream#finish
 * @type {object}
 */

/**
 * Write a buffer to the stream.
 *
 * @method
 * @param {Buffer} chunk Buffer to write
 * @param {String} encoding Optional encoding for the buffer
 * @param {Function} callback Function to call when the chunk was added to the buffer, or if the entire chunk was persisted to MongoDB if this chunk caused a flush.
 * @return {Boolean} False if this write required flushing a chunk to MongoDB. True otherwise.
 */

GridFSBucketWriteStream.prototype.write = function(chunk, encoding, callback) {
  var _this = this;
  return waitForIndexes(this, function() {
    return doWrite(_this, chunk, encoding, callback);
  });
};

/**
 * Tells the stream that no more data will be coming in. The stream will
 * persist the remaining data to MongoDB, write the files document, and
 * then emit a 'finish' event.
 *
 * @method
 * @param {Buffer} chunk Buffer to write
 * @param {String} encoding Optional encoding for the buffer
 * @param {Function} callback Function to call when all files and chunks have been persisted to MongoDB
 */

GridFSBucketWriteStream.prototype.end = function(chunk, encoding, callback) {
  var _this = this;
  this.state.streamEnd = true;

  if (callback) {
    this.once('finish', callback);
  }

  if (!chunk) {
    waitForIndexes(this, function() {
      writeRemnant(_this);
    });
    return;
  }

  var _this = this;
  var inputBuf = (Buffer.isBuffer(chunk)) ?
    chunk : new Buffer(chunk, encoding);

  this.write(chunk, encoding, function() {
    writeRemnant(_this);
  });
};

/**
 * @ignore
 */

function __handleError(_this, error, callback) {
  if (_this.state.errored) {
    return;
  }
  _this.state.errored = true;
  if (callback) {
    return callback(error);
  }
  _this.emit('error', error);
}

/**
 * @ignore
 */

function createChunkDoc(filesId, n, data) {
  return {
    _id: core.BSON.ObjectId(),
    files_id: filesId,
    n: n,
    data: data
  };
}

/**
 * @ignore
 */

function checkChunksIndex(_this, callback) {
  _this.chunks.listIndexes().toArray(function(error, indexes) {
    if (error) {
      // Collection doesn't exist so create index
      if (error.code === ERROR_NAMESPACE_NOT_FOUND) {
        var index = { files_id: 1, n: 1 };
        _this.chunks.createIndex(index, { background: false }, function(error) {
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
    indexes.forEach(function(index) {
      if (index.key) {
        var keys = Object.keys(index.key);
        if (keys.length === 2 && index.key.files_id === 1 &&
            index.key.n === 1) {
          hasChunksIndex = true;
        }
      }
    });

    if (hasChunksIndex) {
      callback();
    } else {
      var index = { files_id: 1, n: 1 };
      var indexOptions = getWriteOptions(_this);

      indexOptions.background = false;
      indexOptions.unique = true;

      _this.chunks.createIndex(index, indexOptions, function(error) {
        if (error) {
          return callback(error);
        }

        callback();
      });
    }
  });
}

/**
 * @ignore
 */

function checkDone(_this, callback) {
  if (_this.state.streamEnd &&
      _this.state.outstandingRequests === 0 &&
      !_this.state.errored) {
    var filesDoc = createFilesDoc(_this.id, _this.length, _this.chunkSizeBytes,
      _this.md5.digest('hex'), _this.filename, _this.options.contentType,
      _this.options.aliases, _this.options.metadata);

    _this.files.insert(filesDoc, getWriteOptions(_this), function(error) {
      if (error) {
        return __handleError(_this, error, callback);
      }
      _this.emit('finish', filesDoc);
    });

    return true;
  }

  return false;
}

/**
 * @ignore
 */

function checkIndexes(_this, callback) {
  _this.files.findOne({}, { _id: 1 }, function(error, doc) {
    if (error) {
      return callback(error);
    }
    if (doc) {
      return callback();
    }

    _this.files.listIndexes().toArray(function(error, indexes) {
      if (error) {
        // Collection doesn't exist so create index
        if (error.code === ERROR_NAMESPACE_NOT_FOUND) {
          var index = { filename: 1, uploadDate: 1 };
          _this.files.createIndex(index, { background: false }, function(error) {
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
      indexes.forEach(function(index) {
        var keys = Object.keys(index.key);
        if (keys.length === 2 && index.key.filename === 1 &&
            index.key.uploadDate === 1) {
          hasFileIndex = true;
        }
      });

      if (hasFileIndex) {
        checkChunksIndex(_this, callback);
      } else {
        var index = { filename: 1, uploadDate: 1 };

        var indexOptions = getWriteOptions(_this);

        indexOptions.background = false;

        _this.files.createIndex(index, indexOptions, function(error) {
          if (error) {
            return callback(error);
          }

          checkChunksIndex(_this, callback);
        });
      }
    });
  });
}

/**
 * @ignore
 */

function createFilesDoc(_id, length, chunkSize, md5, filename, contentType,
  aliases, metadata) {
  var ret = {
    _id: _id,
    length: length,
    chunkSize: chunkSize,
    uploadDate: new Date(),
    md5: md5,
    filename: filename
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

/**
 * @ignore
 */

function doWrite(_this, chunk, encoding, callback) {
  var inputBuf = (Buffer.isBuffer(chunk)) ?
    chunk : new Buffer(chunk, encoding);

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

  // Otherwise, buffer is full, so store it in the chunks collection
  inputBuf.copy(_this.bufToStore, _this.pos, 0, _this.chunkSizeBytes - _this.pos);
  _this.md5.update(_this.bufToStore);
  var doc = createChunkDoc(_this.id, _this.n, _this.bufToStore);
  ++_this.state.outstandingRequests;

  _this.chunks.insert(doc, getWriteOptions(_this), function(error) {
    if (error) {
      return __handleError(_this, error);
    }
    --_this.state.outstandingRequests;
    _this.emit('drain', doc);
    callback && callback();
    checkDone(_this);
  });

  // Copy any leftover bytes from old buffer
  inputBuf.copy(_this.bufToStore, 0, _this.chunkSizeBytes - _this.pos);

  // Re-use the old buffer and increment counter
  _this.pos = inputBuf.length - (_this.chunkSizeBytes - _this.pos);
  ++_this.n;

  // Note that we reverse the typical semantics of write's return value
  // to be compatible with node's `.pipe()` function.
  // False means the client should wait for the 'drain' event.
  return false;
}

/**
 * @ignore
 */

function getWriteOptions(_this) {
  var obj = {};
  if (_this.options.writeConcern) {
    obj.w = concern.w;
    obj.wtimeout = concern.wtimeout;
    obj.j = concern.j;
  }
  return obj;
}

/**
 * @ignore
 */

function waitForIndexes(_this, callback) {
  if (_this.bucket.s.checkedIndexes) {
    return callback();
  }

  _this.bucket.once('index', function() {
    callback();
  });

  return true;
}

/**
 * @ignore
 */

function writeRemnant(_this, callback) {
  // Buffer is empty, so don't bother to insert
  if (_this.pos === 0) {
    return checkDone(_this, callback);
  }

  ++_this.state.outstandingRequests;

  // Create a new buffer to make sure the buffer isn't bigger than it needs
  // to be.
  var remnant = new Buffer(_this.pos);
  _this.bufToStore.copy(remnant, 0, 0, _this.pos);
  _this.md5.update(remnant);
  var doc = createChunkDoc(_this.id, _this.n, remnant);

  _this.chunks.insert(doc, getWriteOptions(_this), function(error) {
    if (error) {
      return __handleError(_this, error);
    }
    --_this.state.outstandingRequests;
    checkDone(_this);
  });
}
