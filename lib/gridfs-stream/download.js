var shallowClone = require('../utils').shallowClone;
var stream = require('stream');
var util = require('util');

module.exports = GridFSBucketReadStream;

/**
 * A readable stream that enables you to read buffers from GridFS.
 *
 * Do not instantiate this class directly. Use `openDownloadStream()` instead.
 *
 * @class
 * @param {Collection} chunks Handle for chunks collection
 * @param {Collection} files Handle for files collection
 * @param {Object} readPreference The read preference to use
 * @param {ObjectId} id The id of the file in the files collection
 */

function GridFSBucketReadStream(chunks, files, readPreference, id) {
  var _this = this;
  this.cursor = chunks.find({ files_id: id }).sort({ n: 1, _id: 1 });
  this.expected = 0;

  stream.Readable.call(this);

  var findOneOptions = {};
  if (readPreference) {
    this.cursor.setReadPreference(readPreference);
    findOneOptions.readPreference = readPreference;
  }

  files.findOne({ _id: id }, findOneOptions, function(error, doc) {
    if (error) {
      return _this.__handleError(error);
    }
    if (!doc) {
      var errmsg = 'FileNotFound: file ' + id.toString() + ' was not found';
      return _this.__handleError(new Error(errmsg));
    }
    _this.file = doc;
    _this.bytesRemaining = doc.length;
    _this.emit('file', doc);
  });
}

util.inherits(GridFSBucketReadStream, stream.Readable);

GridFSBucketReadStream.prototype.__handleError = function(error) {
  this.emit('error', error);
};

GridFSBucketReadStream.prototype.waitForFile = function(callback) {
  if (this.file) {
    return callback();
  }
  this.once('file', function() {
    callback();
  });
};

GridFSBucketReadStream.prototype._read = function() {
  var _this = this;
  this.waitForFile(function() {
    _this.doRead();
  });
};

GridFSBucketReadStream.prototype.doRead = function() {
  var _this = this;
  this.cursor.next(function(error, doc) {
    if (error) {
      return _this.__handleError(error);
    }
    if (!doc) {
      return _this.push(null);
    }

    var expectedN = _this.expected++;
    var expectedLength = Math.min(_this.file.chunkSize, _this.bytesRemaining);
    if (doc.n > expectedN) {
      var errmsg = 'ChunkIsMissing: Got unexpected n: ' + doc.n +
        ', expected: ' + expectedN;
      return _this.__handleError(new Error(errmsg));
    }
    if (doc.n < expectedN) {
      var errmsg = 'ExtraChunk: Got unexpected n: ' + doc.n +
        ', expected: ' + expectedN;
      return _this.__handleError(new Error(errmsg));
    }
    if (doc.data.length() !== expectedLength) {
      if (_this.bytesRemaining <= 0) {
        var errmsg = 'ExtraChunk: Got unexpected n: ' + doc.n;
        return _this.__handleError(new Error(errmsg));
      }
      var errmsg = 'ChunkIsWrongSize: Got unexpected length: ' +
        doc.data.length() + ', expected: ' + expectedLength;
      return _this.__handleError(new Error(errmsg));
    }

    _this.bytesRemaining -= doc.data.length();

    if (doc.data.buffer.length === 0) {
      return _this.push(null);
    }
    _this.push(doc.data.buffer);
  });
};
