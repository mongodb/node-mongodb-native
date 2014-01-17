var Readable = require('stream').Readable
  , inherits = require('util').inherits;

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
function CursorStream(cursor, options) {
  Readable.call(this, { objectMode: true });
  options = options || {};
  var self = this;

  var _destroyed = null;
  var _closed = null;

  /**
   * @ignore
   * @api private
   */
  this._next = function(callback) {
    if(_destroyed || _closed) return;

    cursor.nextObject(function (err, doc) {
      callback(err, doc);
    });
  }

  /**
   * @ignore
   * @api public
   */
  this.isDestroyed = function() {
    return _destroyed;
  }

  /**
   * @ignore
   * @api public
   */
  this.isClosed = function() {
    return _closed;
  }

  /**
   * Close internal resources, but allow stream to send remaining data.
   * @ignore
   * @api private
   */
  var _shutdown = function(err) {
    if(_closed) return;
    _closed = true;

    if(err) self.emit('error', err);
    cursor.close();
    self.emit('close');
  }


  /**
   * @ignore
   * @api private
   */
  this._read = function() {
    if(_destroyed || _closed) return;
    var self = this;

    this._next(function (err, doc) {
      if(err) return self.destroy(err);
      // Transform might be needed to convert a document to another representation
      // before emitting it
      if(doc && typeof options.transform == 'function') 
        doc = options.transform(doc);
      
      // We have a valid doc add it to the list
      if(doc && typeof doc != 'undefined') {
        self.push(doc);
      } else {
        // we've hit the end of the cursor
        if(cursor.state == 1 || cursor.state == 2) {
          self.push(null);
          _shutdown();
        }
      }
    });
  }

  /**
   * Kill the cursor immediately, stop emitting data/readable events.
   * 
   * @param {err} an error object
   * @return {null}
   * @api public
   */
  this.destroy = function(err) {
    if(_destroyed) return;
    _destroyed = true;
    this.pause();
    _shutdown(err);
  }
}

inherits(CursorStream, Readable);

module.exports = exports = CursorStream;