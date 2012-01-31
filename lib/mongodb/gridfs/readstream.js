var Stream = require('stream').Stream,
  util = require('util');

var ReadStream = exports.ReadStream = function(autoclose, gstore) {
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

util.inherits(ReadStream, Stream);

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
          self.emit("close", doc);
        });
      } else {
          self.emit("close");
      }
    }
  } else {
    gstore.nthChunk(gstore.currentChunk.chunkNumber + 1, function(err, chunk) {
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
 * Pauses this stream, then no farther events will be fired
 * @ignore
 * @api private
 */
ReadStream.prototype.pause = function() {
  this.paused = true;
};

/**
 * Resumes this strea,
 * @ignore
 * @api private
 */
ReadStream.prototype.resume = function() {
  this.paused = false;
  var self = this;
  if (self.pendingChunk) {
    self.currentChunk = self.pendingChunk;
    process.nextTick(function() {
      self._execute();
    });
  }
};
