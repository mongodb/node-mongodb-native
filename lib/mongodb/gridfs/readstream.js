var Stream = require('stream').Stream,
  util = require('util');

/**
 * ReadStream
 *
 * Returns a stream interface for the **file**.
 *
 * Events
 *  - **data** {function(item) {}} the data event triggers when a document is ready.
 *  - **end** {function() {}} the end event triggers when there is no more documents available.
 *  - **close** {function() {}} the close event triggers when the stream is closed.
 *  - **error** {function(err) {}} the error event triggers if an error happens.
 *
 * @class Represents a GridFS File Stream.
 * @param {Boolean} autoclose automatically close file when the stream reaches the end.
 * @param {GridStore} cursor a cursor object that the stream wraps.
 * @return {ReadStream}
 */
function ReadStream(autoclose, gstore) {
  if (!(this instanceof ReadStream)) return new ReadStream(autoclose, gstore);
  Stream.call(this);

  this.autoclose = !!autoclose;
  this.gstore = gstore;

  this.finalLength = gstore.length - gstore.position;
  this.completedLength = 0;

  this.paused = false;
  this.readable = true;
  this.pendingChunk = null;

  var self = this;
  process.nextTick(function() {
    self._execute();
  });
};

/**
 * Inherit from Stream
 * @ignore
 * @api private
 */
ReadStream.prototype.__proto__ = Stream.prototype;

/**
 * Flag stating whether or not this stream is readable.
 */
ReadStream.prototype.readable;

/**
 * Flag stating whether or not this stream is paused.
 */
ReadStream.prototype.paused;

/**
 * @ignore
 * @api private
 */
ReadStream.prototype._execute = function() {
  if(this.paused === true || this.readable === false) {
    return;
  }

  var gstore = this.gstore;
  var self = this;

  var last = false;
  var toRead = 0;

  if ((gstore.currentChunk.length() - gstore.currentChunk.position + 1 + self.completedLength) >= self.finalLength) {
    toRead = self.finalLength - self.completedLength;
    last = true;
  } else {
    toRead = gstore.currentChunk.length();
  }

  var data = gstore.currentChunk.readSlice(toRead);
  
  if (data != null) {
    self.completedLength += data.length;
    self.pendingChunk = null;
    self.emit("data", data);
  }

  if (last === true) {
    self.readable = false;
    self.emit("end");
    if (self.autoclose === true) {
      if (gstore.mode[0] == "w") {
        gstore.close(function(err, doc) {
          if (err) {
            self.emit("error", err);
            return;
          }
          self.readable = false;
          self.emit("close", doc);
        });
      } else {
        self.readable = false;
        self.emit("close");
      }
    }
  } else {
    gstore._nthChunk(gstore.currentChunk.chunkNumber + 1, function(err, chunk) {
      if (err) {
        self.readable = false;
        self.emit("error", err);
        return;
      }
      self.pendingChunk = chunk;
      if (self.paused === true) {
        return;
      }
      gstore.currentChunk = self.pendingChunk;
      self._execute();
    });
  }
};

/**
 * Pauses this stream, then no farther events will be fired.
 *
 * @ignore
 * @api public
 */
ReadStream.prototype.pause = function() {
  this.paused = true;
};

/**
 * Destroys the stream, then no farther events will be fired.
 *
 * @ignore
 * @api public
 */
ReadStream.prototype.destroy = function() {
  this.readable = false;
  // Emit close event
  this.emit("close");
};

/**
 * Resumes this stream.
 *
 * @ignore
 * @api public
 */
ReadStream.prototype.resume = function() {
  if (this.paused === false) {
    return;
  }
  this.paused = false;
  var self = this;
  if(self.pendingChunk != null) {
    self.currentChunk = self.pendingChunk;
    process.nextTick(function() {
      self._execute();
    });
  } else {
    self.readable = false;
    self.emit("close");    
  }
};

exports.ReadStream = ReadStream;
