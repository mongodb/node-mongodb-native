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
 * @param {Object} [options=null] Optional settings.
 * @param {Number} [options.sort=null] Optional sort for the file find query
 * @param {Number} [options.skip=null] Optional skip for the file find query
 * @param {Number} [options.start=null] Optional 0-based offset in bytes to start streaming from
 * @param {Number} [options.end=null] Optional 0-based offset in bytes to stop streaming before
 * @fires GridFSBucketReadStream#error
 * @fires GridFSBucketReadStream#file
 * @return {GridFSBucketReadStream} a GridFSBucketReadStream instance.
 */

function GridFSBucketReadStream(chunks, files, readPreference, filter, options) {
  var _this = this;
  this.s = {
    bytesRead: 0,
    cursor: null,
    expected: 0,
    expectedEnd: 0,
    file: null
  };

  stream.Readable.call(this);

  var findOneOptions = {};
  if (readPreference) {
    findOneOptions.readPreference = readPreference;
  }
  if (options && options.sort) {
    findOneOptions.sort = options.sort;
  }
  if (options && options.skip) {
    findOneOptions.skip = options.skip;
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

    _this.s.expectedEnd = Math.ceil(doc.length / doc.chunkSize);
    _this.s.file = doc;
    _this.s.bytesToSkip = handleStartOption(_this, doc, _this.s.cursor,
      options);
    _this.s.bytesToTrim = handleEndOption(_this, doc, _this.s.cursor, options);
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

    var bytesRemaining = _this.s.file.length - _this.s.bytesRead;
    var expectedN = _this.s.expected++;
    var expectedLength = Math.min(_this.s.file.chunkSize,
      bytesRemaining);
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
      if (bytesRemaining <= 0) {
        var errmsg = 'ExtraChunk: Got unexpected n: ' + doc.n;
        return __handleError(_this, new Error(errmsg));
      }
      var errmsg = 'ChunkIsWrongSize: Got unexpected length: ' +
        doc.data.length() + ', expected: ' + expectedLength;
      return __handleError(_this, new Error(errmsg));
    }

    _this.s.bytesRead += doc.data.length();

    if (doc.data.buffer.length === 0) {
      return _this.push(null);
    }

    var sliceStart = null;
    var sliceEnd = null;
    var buf = doc.data.buffer;
    if (_this.s.bytesToSkip != null) {
      sliceStart = _this.s.bytesToSkip;
      _this.s.bytesToSkip = 0;
    }

    if (expectedN === _this.s.expectedEnd && _this.s.bytesToTrim != null) {
      sliceEnd = _this.s.bytesToTrim;
    }

    if (sliceStart != null || sliceEnd != null) {
      buf = buf.slice(sliceStart || 0, sliceEnd || buf.length);
    }

    _this.push(buf);
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

function handleStartOption(stream, doc, cursor, options) {
  if (options && options.start != null) {
    if (options.start > doc.length) {
      throw new Error('Stream start (' + options.start + ') must not be ' +
        'more than the length of the file (' + doc.length +')')
    }
    if (options.start < 0) {
      throw new Error('Stream start (' + options.start + ') must not be ' +
        'negative');
    }
    if (options.end != null && options.end < options.start) {
      throw new Error('Stream start (' + options.start + ') must not be ' +
        'greater than stream end (' + options.end + ')');
    }

    cursor.skip(Math.floor(options.start / doc.chunkSize));

    stream.s.bytesRead = Math.floor(options.start / doc.chunkSize) *
      doc.chunkSize;
    stream.s.expected = Math.floor(options.start / doc.chunkSize);

    return options.start - stream.s.bytesRead;
  }
}

/**
 * @ignore
 */

function handleEndOption(stream, doc, cursor, options) {
  if (options && options.end != null) {
    if (options.end > doc.length) {
      throw new Error('Stream end (' + options.end + ') must not be ' +
        'more than the length of the file (' + doc.length +')')
    }
    if (options.start < 0) {
      throw new Error('Stream end (' + options.end + ') must not be ' +
        'negative');
    }

    var start = options.start != null ?
      Math.floor(options.start / doc.chunkSize) :
      0;

    cursor.limit(Math.ceil(options.end / doc.chunkSize) - start);

    stream.s.expectedEnd = Math.ceil(options.end / doc.chunkSize);

    return (Math.ceil(options.end / doc.chunkSize) * doc.chunkSize) -
      options.end;
  }
}

/**
 * @ignore
 */

function __handleError(_this, error) {
  _this.emit('error', error);
}
