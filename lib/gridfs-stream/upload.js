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
 * @param {Collection} chunks Handle for chunks collection
 * @param {Collection} files Handle for files collection
 * @param {string} filename The value of the 'filename' key in the files doc
 * @param {object} [options=null] Optional settings.
 */

function GridFSBucketWriteStream(chunks, files, filename, options) {
  this.chunks = chunks;
  this.files = files;
  this.filename = filename;
  this.options = options;

  this.id = core.BSON.ObjectId();
  this.chunkSizeBytes = this.options.chunkSizeBytes;
  this.bufToStore = new Buffer(this.chunkSizeBytes);
  this.length = 0;
  this.md5 = crypto.createHash('md5');
  this.n = 0;
  this.pos = 0;
  this.state = {
    hasCheckedIndexes: false,
    streamEnd: false,
    outstandingRequests: 0,
    errored: false
  };

  var _this = this;
  this.checkIndexes(function() {
    _this.state.hasCheckedIndexes = true;
    _this.emit('index');
  });
}

util.inherits(GridFSBucketWriteStream, stream.Writable);

/**
 * @ignore
 */

GridFSBucketWriteStream.prototype.checkIndexes = function(callback) {
  var _this = this;

  this.files.findOne({}, { _id: 1 }, function(error, doc) {
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

            _this.checkChunksIndex(callback);
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
        _this.checkChunksIndex(callback);
      } else {
        var index = { filename: 1, uploadDate: 1 };
        _this.files.createIndex(index, { background: false }, function(error) {
          if (error) {
            return callback(error);
          }

          _this.checkChunksIndex(callback);
        });
      }
    });
  });
};

/**
 * @ignore
 */

GridFSBucketWriteStream.prototype.checkChunksIndex = function(callback) {
  var _this = this;

  this.chunks.listIndexes().toArray(function(error, indexes) {
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
      _this.chunks.createIndex(index, { background: false }, function(error) {
        if (error) {
          return callback(error);
        }

        callback();
      });
    }
  });
};

/**
 * @ignore
 */

GridFSBucketWriteStream.prototype.__waitForIndexes = function(callback) {
  if (this.state.hasCheckedIndexes) {
    return callback();
  }

  this.once('index', function() {
    callback();
  });

  return true;
};

/**
 * @ignore
 */

GridFSBucketWriteStream.prototype.__handleError = function(error, callback) {
  if (this.state.errored) {
    return;
  }
  this.state.errored = true;
  if (callback) {
    return callback(error);
  }
  this.emit('error', error);
};

/**
 * @ignore
 */

GridFSBucketWriteStream.prototype.__checkDone = function(callback) {
  var _this = this;
  if (this.state.streamEnd &&
      this.state.outstandingRequests === 0 &&
      !this.state.errored) {
    var filesDoc = createFilesDoc(this.id, this.length, this.chunkSizeBytes,
      this.md5.digest('hex'), this.filename, this.options.contentType,
      this.options.aliases, this.options.metadata);

    this.files.insert(filesDoc, function(error) {
      if (error) {
        return _this.__handleError(error, callback);
      }
      _this.emit('finish', filesDoc);
    });

    return true;
  }

  return false;
};

/**
 * @ignore
 */

GridFSBucketWriteStream.prototype.__writeRemnant = function(callback) {
  var _this = this;
  // Buffer is empty, so don't bother to insert
  if (this.pos === 0) {
    return this.__checkDone(callback);
  }

  ++this.state.outstandingRequests;

  // Create a new buffer to make sure the buffer isn't bigger than it needs
  // to be.
  var remnant = new Buffer(this.pos);
  this.bufToStore.copy(remnant, 0, 0, this.pos);
  this.md5.update(remnant);
  var doc = createChunkDoc(this.id, this.n, remnant);
  this.chunks.insert(doc, function(error) {
    if (error) {
      return _this.__handleError(error);
    }
    --_this.state.outstandingRequests;
    _this.__checkDone();
  });
};

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
  return this.__waitForIndexes(function() {
    return _this.__doWrite(chunk, encoding, callback);
  });
};

/**
 * @ignore
 */

GridFSBucketWriteStream.prototype.__doWrite = function(chunk, encoding, callback) {
  var _this = this;
  var inputBuf = (Buffer.isBuffer(chunk)) ?
    chunk : new Buffer(chunk, encoding);

  this.length += inputBuf.length;

  // Input is small enough to fit in our buffer
  if (this.pos + inputBuf.length < this.chunkSizeBytes) {
    inputBuf.copy(this.bufToStore, this.pos);
    this.pos += inputBuf.length;

    callback && callback();

    // Note that we reverse the typical semantics of write's return value
    // to be compatible with node's `.pipe()` function.
    // True means client can keep writing.
    return true;
  }

  // Otherwise, buffer is full, so store it in the chunks collection
  inputBuf.copy(this.bufToStore, this.pos, 0, this.chunkSizeBytes - this.pos);
  this.md5.update(this.bufToStore);
  var doc = createChunkDoc(this.id, this.n, this.bufToStore);
  ++this.state.outstandingRequests;
  this.chunks.insert(doc, function(error) {
    if (error) {
      return this.__handleError(error);
    }
    --_this.state.outstandingRequests;
    _this.emit('drain', doc);
    callback && callback();
    _this.__checkDone();
  });

  // Copy any leftover bytes from old buffer
  inputBuf.copy(this.bufToStore, 0, this.chunkSizeBytes - this.pos);

  // Re-use the old buffer and increment counter
  this.pos = inputBuf.length - (this.chunkSizeBytes - this.pos);
  ++this.n;

  // Note that we reverse the typical semantics of write's return value
  // to be compatible with node's `.pipe()` function.
  // False means the client should wait for the 'drain' event.
  return false;
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
    this.__waitForIndexes(function() {
      _this.__writeRemnant();
    });
    return;
  }

  var _this = this;
  var inputBuf = (Buffer.isBuffer(chunk)) ?
    chunk : new Buffer(chunk, encoding);

  this.write(chunk, encoding, function() {
    _this.__writeRemnant();
  });
};

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
