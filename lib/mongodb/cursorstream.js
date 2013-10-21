// Set processor, setImmediate if 0.10 otherwise nextTick
var processor = require('./utils').processor();

/**
 * Module dependecies.
 */
var Readable = require('stream').Readable || require('readable-stream').Readable;

/**
 * CursorStream
 *
 * Returns a stream interface for the **cursor**.
 *
 * Options
 *  - **transform** {Function} function of type function(object) { return transformed }, allows for transformation of data before emitting.
 *
 * Events
 *  - **data** {function(item) {}} the data event triggers when a document is ready.
 *  - **error** {function(err) {}} the error event triggers if an error happens.
 *  - **end** {function() {}} the end event triggers when there are no more documents available.
 *  - **close** {function() {}} the close event triggers when the underlying cursor is closed.
 *
 * @class Represents a CursorStream.
 * @param {Cursor} cursor a cursor object that the stream wraps.
 * @param {Options} an options object that is also passed to the readable stream.
 * @return {Stream}
 */
function CursorStream(cursor, options) {
  if(!(this instanceof CursorStream)) return new CursorStream(cursor);
  options = options ? options : {};
  // Documents are objects
  options.objectMode = true;

  Readable.call(this, options);

  this._cursor = cursor;
  this.destroyed = null;
  this.transform = typeof options.transform === 'function' && options.transform;
  this.options = options;
}

/**
 * Inherit from Stream
 * @ignore
 * @api private
 */
CursorStream.prototype.__proto__ = Readable.prototype;

/**
 * Implement the _read method for the readable stream.
 * @ignore
 * @api private
 */
CursorStream.prototype._read = function (size) {
  // We _may_ want to implement the `size` argument,
  // but it is only advisory.
  if (this.destroyed) return;

  var self = this;
  processor(function() {
    self._cursor.nextObject(function (err, doc) {
      if (err) {
        this.destroy(err);
      } else if (doc) {
        // Continue reading if the stream wants more documents
        if (self.transform) doc = self.transform(doc);
        if (self.push(doc)) this._read();
      } else {
        // There are no more documents, so we've reached the end of the stream.
        self.push(null);
        self.destroy();
      }
    });
  });
}

/**
 * Destroys the stream, closing the underlying
 * cursor. No more events will be emitted.
 *
 * @api public
 */
CursorStream.prototype.destroy = function (err) {
  if (this.destroyed) return;
  this.destroyed = true;
  this._cursor.close();

  if (err) this.emit('error', err);

  this.emit('close');
}

// TODO - maybe implement the raw option to pass binary?
//CursorStream.prototype.setEncoding = function () {
//}

module.exports = exports = CursorStream;
