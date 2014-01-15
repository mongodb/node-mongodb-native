var Readable = require('stream').Readable;
var util = require('util');
util.inherits(CursorStream, Readable);

/**
 * CursorStream
 * 
 * Returns a stream interface for the **cursor**.
 *
 * Events - (inherited from node Readable streams)
 *  - **readable** {function() {}} the readable event triggers when a document is ready.
 *  - **data** {function(item) {}} the data event triggers when a document is ready.
 *  - **error** {function(err) {}} the error event triggers if an error happens.
 *  - **close** {function() {}} the close event triggers when the underlying database connection has been closed, though more items may still be waiting in the stream to be retrieved.
 *  - **end** {function() {}} the end event triggers when there are no more documents available.
 *
 * @class Represents a CursorStream.
 * @param {Cursor} cursor a cursor object that the stream wraps.
 * @return {Stream}
 */
function CursorStream(cursor) {
  Readable.call(this, { objectMode: true });
  this._cursor = cursor;
  this._destroyed = null;
  this._closed = null;
}

/**
 * @ignore
 * @api private
 */
CursorStream.prototype._next = function(callback) {
  if (this._destroyed || this._closed) return;

  this._cursor.nextObject(function (err, doc) {
    callback(err, doc);
  });
}

/**
 * @ignore
 * @api private
 */
CursorStream.prototype._read = function() {
  if (this._destroyed || this._closed) return;

  var self = this;
  this._next(function (err, doc) {
    if (err) return self.destroy(err);

    if (doc && typeof doc != 'undefined') {
      self.push(doc);
    }
    else {
      // we've hit the end of the cursor
      if(self._cursor.state == 1 || self._cursor.state == 2) {
	self.push(null);
        self._shutdown();
      }
    }
  });
}

/**
 * Close internal resources, but allow stream to send remaining data.
 * @ignore
 * @api private
 */
CursorStream.prototype._shutdown = function(err) {
  if (this._closed) return;
  this._closed = true;

  if (err) this.emit('error', err);
  this._cursor.close();
  this.emit('close');
}

/**
 * Kill the cursor immediately, stop emitting data/readable events.
 * 
 * @param {err} an error object
 * @return {null}
 * @api public
 */
CursorStream.prototype.destroy = function(err) {
  if (this._destroyed) return;
  this._destroyed = true;

  this.pause();
  this._shutdown(err);
}

module.exports = exports = CursorStream;
