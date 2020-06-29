'use strict';
import { Readable } from 'stream';

/**
 * A readable stream that enables you to read buffers from GridFS.
 *
 * Do not instantiate this class directly. Use `openDownloadStream()` instead.
 *
 * @class
 * @extends external:Readable
 * @param {Collection} chunks Handle for chunks collection
 * @param {Collection} files Handle for files collection
 * @param {object} readPreference The read preference to use
 * @param {object} filter The query to use to find the file document
 * @param {object} [options] Optional settings.
 * @param {number} [options.sort] Optional sort for the file find query
 * @param {number} [options.skip] Optional skip for the file find query
 * @param {number} [options.start] Optional 0-based offset in bytes to start streaming from
 * @param {number} [options.end] Optional 0-based offset in bytes to stop streaming before
 * @fires GridFSBucketReadStream#error
 * @fires GridFSBucketReadStream#file
 */
class GridFSBucketReadStream extends Readable {
  s: any;

  constructor(chunks: any, files: any, readPreference: any, filter: any, options: any) {
    super();

    this.s = {
      bytesRead: 0,
      chunks,
      cursor: null,
      expected: 0,
      files,
      filter,
      init: false,
      expectedEnd: 0,
      file: null,
      options,
      readPreference
    };
  }

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
   * Emitted when a chunk of data is available to be consumed.
   *
   * @event GridFSBucketReadStream#data
   * @type {object}
   */

  /**
   * Fired when the stream is exhausted (no more data events).
   *
   * @event GridFSBucketReadStream#end
   * @type {object}
   */

  /**
   * Fired when the stream is exhausted and the underlying cursor is killed
   *
   * @event GridFSBucketReadStream#close
   * @type {object}
   */

  /**
   * Reads from the cursor and pushes to the stream.
   * Private Impl, do not call directly
   *
   * @function
   */

  _read() {
    var _this = this;
    if (this.destroyed) {
      return;
    }

    waitForFile(_this, () => {
      doRead(_this);
    });
  }

  /**
   * Sets the 0-based offset in bytes to start streaming from. Throws
   * an error if this stream has entered flowing mode
   * (e.g. if you've already called `on('data')`)
   *
   * @function
   * @param {number} start Offset in bytes to start reading at
   * @returns {GridFSBucketReadStream} Reference to Self
   */

  start(start: any) {
    throwIfInitialized(this);
    this.s.options.start = start;
    return this;
  }

  /**
   * Sets the 0-based offset in bytes to start streaming from. Throws
   * an error if this stream has entered flowing mode
   * (e.g. if you've already called `on('data')`)
   *
   * @function
   * @param {number} end Offset in bytes to stop reading at
   * @returns {GridFSBucketReadStream} Reference to self
   */

  end(end: any) {
    throwIfInitialized(this);
    this.s.options.end = end;
    return this;
  }

  /**
   * Marks this stream as aborted (will never push another `data` event)
   * and kills the underlying cursor. Will emit the 'end' event, and then
   * the 'close' event once the cursor is successfully killed.
   *
   * @function
   * @param {GridFSBucket~errorCallback} [callback] called when the cursor is successfully closed or an error occurred.
   * @fires GridFSBucketWriteStream#close
   * @fires GridFSBucketWriteStream#end
   */

  abort(callback: Function) {
    var _this = this;
    this.push(null);
    this.destroyed = true;
    if (this.s.cursor) {
      this.s.cursor.close((error: any) => {
        _this.emit('close');
        callback && callback(error);
      });
    } else {
      if (!this.s.init) {
        // If not initialized, fire close event because we will never
        // get a cursor
        _this.emit('close');
      }
      callback && callback();
    }
  }
}

function throwIfInitialized(self: any) {
  if (self.s.init) {
    throw new Error('You cannot change options after the stream has entered' + 'flowing mode!');
  }
}

function doRead(_this: any) {
  if (_this.destroyed) {
    return;
  }

  _this.s.cursor.next((error?: any, doc?: any) => {
    if (_this.destroyed) {
      return;
    }
    if (error) {
      return __handleError(_this, error);
    }
    if (!doc) {
      _this.push(null);

      process.nextTick(() => {
        _this.s.cursor.close((error: any) => {
          if (error) {
            __handleError(_this, error);
            return;
          }

          _this.emit('close');
        });
      });

      return;
    }

    var bytesRemaining = _this.s.file.length - _this.s.bytesRead;
    var expectedN = _this.s.expected++;
    var expectedLength = Math.min(_this.s.file.chunkSize, bytesRemaining);

    if (doc.n > expectedN) {
      var errmsg = 'ChunkIsMissing: Got unexpected n: ' + doc.n + ', expected: ' + expectedN;
      return __handleError(_this, new Error(errmsg));
    }

    if (doc.n < expectedN) {
      errmsg = 'ExtraChunk: Got unexpected n: ' + doc.n + ', expected: ' + expectedN;
      return __handleError(_this, new Error(errmsg));
    }

    var buf = Buffer.isBuffer(doc.data) ? doc.data : doc.data.buffer;

    if (buf.length !== expectedLength) {
      if (bytesRemaining <= 0) {
        errmsg = 'ExtraChunk: Got unexpected n: ' + doc.n;
        return __handleError(_this, new Error(errmsg));
      }

      errmsg =
        'ChunkIsWrongSize: Got unexpected length: ' + buf.length + ', expected: ' + expectedLength;
      return __handleError(_this, new Error(errmsg));
    }

    _this.s.bytesRead += buf.length;

    if (buf.length === 0) {
      return _this.push(null);
    }

    var sliceStart = null;
    var sliceEnd = null;

    if (_this.s.bytesToSkip != null) {
      sliceStart = _this.s.bytesToSkip;
      _this.s.bytesToSkip = 0;
    }

    const atEndOfStream = expectedN === _this.s.expectedEnd - 1;
    const bytesLeftToRead = _this.s.options.end - _this.s.bytesToSkip;
    if (atEndOfStream && _this.s.bytesToTrim != null) {
      sliceEnd = _this.s.file.chunkSize - _this.s.bytesToTrim;
    } else if (_this.s.options.end && bytesLeftToRead < doc.data.length()) {
      sliceEnd = bytesLeftToRead;
    }

    if (sliceStart != null || sliceEnd != null) {
      buf = buf.slice(sliceStart || 0, sliceEnd || buf.length);
    }

    _this.push(buf);
  });
}

function init(self: any) {
  var findOneOptions = {} as any;
  if (self.s.readPreference) {
    findOneOptions.readPreference = self.s.readPreference;
  }
  if (self.s.options && self.s.options.sort) {
    findOneOptions.sort = self.s.options.sort;
  }
  if (self.s.options && self.s.options.skip) {
    findOneOptions.skip = self.s.options.skip;
  }

  self.s.files.findOne(self.s.filter, findOneOptions, (error?: any, doc?: any) => {
    if (error) {
      return __handleError(self, error);
    }
    if (!doc) {
      var identifier = self.s.filter._id ? self.s.filter._id.toString() : self.s.filter.filename;
      var errmsg = 'FileNotFound: file ' + identifier + ' was not found';
      var err = new Error(errmsg);
      (err as any).code = 'ENOENT';
      return __handleError(self, err);
    }

    // If document is empty, kill the stream immediately and don't
    // execute any reads
    if (doc.length <= 0) {
      self.push(null);
      return;
    }

    if (self.destroyed) {
      // If user destroys the stream before we have a cursor, wait
      // until the query is done to say we're 'closed' because we can't
      // cancel a query.
      self.emit('close');
      return;
    }

    self.s.bytesToSkip = handleStartOption(self, doc, self.s.options);

    var filter: any = { files_id: doc._id };

    // Currently (MongoDB 3.4.4) skip function does not support the index,
    // it needs to retrieve all the documents first and then skip them. (CS-25811)
    // As work around we use $gte on the "n" field.
    if (self.s.options && self.s.options.start != null) {
      var skip = Math.floor(self.s.options.start / doc.chunkSize);
      if (skip > 0) {
        filter['n'] = { $gte: skip };
      }
    }
    self.s.cursor = self.s.chunks.find(filter).sort({ n: 1 });

    if (self.s.readPreference) {
      self.s.cursor.setReadPreference(self.s.readPreference);
    }

    self.s.expectedEnd = Math.ceil(doc.length / doc.chunkSize);
    self.s.file = doc;
    self.s.bytesToTrim = handleEndOption(self, doc, self.s.cursor, self.s.options);
    self.emit('file', doc);
  });
}

function waitForFile(_this: any, callback: Function) {
  if (_this.s.file) {
    return callback();
  }

  if (!_this.s.init) {
    init(_this);
    _this.s.init = true;
  }

  _this.once('file', () => {
    callback();
  });
}

function handleStartOption(stream: any, doc: any, options: any) {
  if (options && options.start != null) {
    if (options.start > doc.length) {
      throw new Error(
        'Stream start (' +
          options.start +
          ') must not be ' +
          'more than the length of the file (' +
          doc.length +
          ')'
      );
    }
    if (options.start < 0) {
      throw new Error('Stream start (' + options.start + ') must not be ' + 'negative');
    }
    if (options.end != null && options.end < options.start) {
      throw new Error(
        'Stream start (' +
          options.start +
          ') must not be ' +
          'greater than stream end (' +
          options.end +
          ')'
      );
    }

    stream.s.bytesRead = Math.floor(options.start / doc.chunkSize) * doc.chunkSize;
    stream.s.expected = Math.floor(options.start / doc.chunkSize);

    return options.start - stream.s.bytesRead;
  }
}

function handleEndOption(stream: any, doc: any, cursor: any, options: any) {
  if (options && options.end != null) {
    if (options.end > doc.length) {
      throw new Error(
        'Stream end (' +
          options.end +
          ') must not be ' +
          'more than the length of the file (' +
          doc.length +
          ')'
      );
    }
    if (options.start < 0) {
      throw new Error('Stream end (' + options.end + ') must not be ' + 'negative');
    }

    var start = options.start != null ? Math.floor(options.start / doc.chunkSize) : 0;

    cursor.limit(Math.ceil(options.end / doc.chunkSize) - start);

    stream.s.expectedEnd = Math.ceil(options.end / doc.chunkSize);

    return Math.ceil(options.end / doc.chunkSize) * doc.chunkSize - options.end;
  }
}

function __handleError(_this: any, error?: any) {
  _this.emit('error', error);
}

export = GridFSBucketReadStream;
