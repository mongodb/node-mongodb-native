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
 * @param {Object} filter The query to use to find the file document
 * @param {Object} [sort] Optional sort for the file find query
 * @param {Number} [skip] Optional skip for the file find query
 * @fires GridFSBucketReadStream#error
 * @fires GridFSBucketReadStream#file
 * @return {GridFSBucketReadStream} a GridFSBucketReadStream instance.
 */

function GridFSBucketReadStream(chunks, files, readPreference, filter, sort, skip) {
  var _this = this;
  this.s = {
    cursor: null,
    expected: 0,
    file: null
  };

  stream.Readable.call(this);

  var findOneOptions = {};
  if (readPreference) {
    findOneOptions.readPreference = readPreference;
  }
  if (sort) {
    findOneOptions.sort = sort;
  }
  if (skip) {
    findOneOptions.skip = skip;
  }

  files.findOne(filter, findOneOptions, function(error, doc) {
    if (error) {
      return __handleError(_this, error);
    }
    if (!doc) {
      var identifier = filter._id ? filter._id.toString() : filter.filename;
      var errmsg = 'FileNotFound: file ' + identifier + ' was not found';
      return __handleError(_this, new Error(errmsg));
    }

    // If document is empty, kill the stream immediately and don't
    // execute any reads
    if (doc.length <= 0) {
      _this.push(null);
      return;
    }

    _this.s.cursor = chunks.find({ files_id: doc._id }).sort({ n: 1 });
    if (readPreference) {
      _this.s.cursor.setReadPreference(readPreference);
    }
    _this.s.file = doc;
    _this.s.bytesRemaining = doc.length;
    _this.emit('file', doc);
  });
}

util.inherits(GridFSBucketReadStream, stream.Readable);

/**
 * An error occurred
 *
 * @event GridFSBucketReadStream#error
 * @type {Error}
 */

/**
 * Fires when the stream loaded the file document corresponding to the
 * provided id.
 *
 * @event GridFSBucketReadStream#file
 * @type {object}
 */

/**
 * Reads from the cursor and pushes to the stream.
 * @method
 */

GridFSBucketReadStream.prototype._read = function() {
  var _this = this;
  waitForFile(_this, function() {
    doRead(_this);
  });
};

/**
 * @ignore
 */

function doRead(_this) {
  _this.s.cursor.next(function(error, doc) {
    if (error) {
      return __handleError(_this, error);
    }
    if (!doc) {
      return _this.push(null);
    }

    var expectedN = _this.s.expected++;
    var expectedLength = Math.min(_this.s.file.chunkSize,
      _this.s.bytesRemaining);
    if (doc.n > expectedN) {
      var errmsg = 'ChunkIsMissing: Got unexpected n: ' + doc.n +
        ', expected: ' + expectedN;
      return __handleError(_this, new Error(errmsg));
    }
    if (doc.n < expectedN) {
      var errmsg = 'ExtraChunk: Got unexpected n: ' + doc.n +
        ', expected: ' + expectedN;
      return __handleError(_this, new Error(errmsg));
    }
    if (doc.data.length() !== expectedLength) {
      if (_this.s.bytesRemaining <= 0) {
        var errmsg = 'ExtraChunk: Got unexpected n: ' + doc.n;
        return __handleError(_this, new Error(errmsg));
      }
      var errmsg = 'ChunkIsWrongSize: Got unexpected length: ' +
        doc.data.length() + ', expected: ' + expectedLength;
      return __handleError(_this, new Error(errmsg));
    }

    _this.s.bytesRemaining -= doc.data.length();

    if (doc.data.buffer.length === 0) {
      return _this.push(null);
    }
    _this.push(doc.data.buffer);
  });
};

/**
 * @ignore
 */

function waitForFile(_this, callback) {
  if (_this.s.file) {
    return callback();
  }
  _this.once('file', function() {
    callback();
  });
};

/**
 * @ignore
 */

function __handleError(_this, error) {
  _this.emit('error', error);
}
