var core = require('mongodb-core');
var crypto = require('crypto');
var Emitter = require('events').EventEmitter;
var shallowClone = require('../utils').shallowClone;

var DEFAULT_GRIDFS_BUCKET_OPTIONS = {
  bucketName: 'fs',
  chunkSizeBytes: 255 * 1024
};

exports.GridFSBucket = GridFSBucket;

function GridFSBucket(db, options) {
  if (options && typeof options === 'object') {
    options = shallowClone(options);
    var keys = Object.keys(DEFAULT_GRIDFS_BUCKET_OPTIONS);
    for (var i = 0; i < keys.length; ++i) {
      if (!options[keys[i]]) {
        options[keys[i]] = DEFAULT_GRIDFS_BUCKET_OPTIONS[keys[i]];
      }
    }
  } else {
    options = DEFAULT_GRIDFS_BUCKET_OPTIONS;
  }

  this.s = {
    db: db,
    options: options,
    _chunksCollection: db.collection(options.bucketName + '.chunks'),
    _filesCollection: db.collection(options.bucketName + '.files')
  };
};

GridFSBucket.prototype = new Emitter();

GridFSBucket.prototype.uploadFromStream = function(filename, source, options) {
  options = options || {};

  var _id = core.BSON.ObjectId();
  var _this = this;
  var chunkSizeBytes = options.chunkSizeBytes || this.s.options.chunkSizeBytes;
  var bufToStore = new Buffer(chunkSizeBytes);
  var length = 0;
  var md5 = crypto.createHash('md5');
  var n = 0;
  var pos = 0;
  var state = {
    streamEnd: false,
    outstandingRequests: 0,
    errored: false
  };

  var errorHandler = function(error) {
    if (state.errored) {
      return;
    }
    _this.emit('error', error);
  };

  var checkDone = function() {
    if (state.streamEnd && state.outstandingRequests === 0 && !state.errored) {
      var filesDoc = createFilesDoc(_id, length, chunkSizeBytes,
        md5.digest('hex'), filename, options.contentType, options.aliases,
        options.metadata);

      _this.s._filesCollection.insert(filesDoc, function(error) {
        if (error) {
          return errorHandler(error);
        }
        _this.emit('done', filename);
      });
    }
  };

  source.on('data', function(inputBuf) {
    length += inputBuf.length;

    // Input is small enough to fit in our buffer
    if (pos + inputBuf.length < chunkSizeBytes) {
      inputBuf.copy(bufToStore, pos);
      pos += inputBuf.length;

      return;
    }

    // Otherwise, buffer is full, so store it in the chunks collection
    inputBuf.copy(bufToStore, pos, 0, chunkSizeBytes - pos);
    md5.update(bufToStore);
    var doc = createChunkDoc(_id, n, bufToStore);
    ++state.outstandingRequests;
    _this.s._chunksCollection.insert(doc, function(error) {
      if (error) {
        return errorHandler(error);
      }
      --state.outstandingRequests;
      checkDone();
    });

    // Copy any leftover bytes from old buffer
    inputBuf.copy(bufToStore, 0, chunkSizeBytes - pos);

    // Re-use the old buffer and increment counter
    pos = inputBuf.length - (chunkSizeBytes - pos);
    ++n;
  });

  source.on('error', function(error) {
    errorHandler(error);
  });

  source.on('end', function() {
    state.streamEnd = true;

    // Buffer is empty, so don't bother to insert
    if (pos === 0) {
      return checkDone();
    }

    ++state.outstandingRequests;
    // Create a new buffer to make sure the buffer isn't bigger than it needs
    // to be.
    var remnant = new Buffer(pos);
    bufToStore.copy(remnant, 0, 0, pos);
    md5.update(remnant);
    var doc = createChunkDoc(_id, n, remnant);
    _this.s._chunksCollection.insert(doc, function(error) {
      if (error) {
        return errorHandler(error);
      }
      --state.outstandingRequests;
      checkDone();
    });
  });

  return _id;
};

function createChunkDoc(filesId, n, data) {
  return {
    _id: core.BSON.ObjectId(),
    files_id: filesId,
    n: n,
    data: data
  };
}

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
