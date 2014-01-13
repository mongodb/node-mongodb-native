var Transform = require('stream').Transform;
var util = require('util');
var processor = require('./utils').processor();
util.inherits(CursorStream, Transform);

/**
 * CursorStream
 * 
 * Returns a stream interface for the **cursor**.
 *
 * Options
 * - **transform** {Function} function of type function(object) { return transformed },
 *   allows for transformation of data before emitting.
 *
 * Events - (inherited from node Transform streams)
 *  - **data** {function(item) {}} the data event triggers when a document is ready.
 *  - **error** {function(err) {}} the error event triggers if an error happens.
 *  - **close** {function() {}} the end event triggers when there is no more documents available.
 *
 * @class Represents a CursorStream.
 * @param {Cursor} cursor a cursor object that the stream wraps.
 * @return {Stream}
 */
function CursorStream(cursor, options) {
  Transform.call(this, { objectMode: true });

  var fn = function(doc) { return doc; };
  this._cursor = cursor;
  this._options = options || {};
  this._fn = typeof this._options.transform == 'function' ? this._options.transform : fn; 
  this._destroyed = null;
  this.readable = true;
 
  this._init();
}

/** 
 * A flag stating whether or not this stream is readable.
 */
CursorStream.prototype.readable;

/**
 * Initialize the stream
 * @ignore
 * @api private
 */
CursorStream.prototype._init = function() {
  if (this._destroyed) return;
  this._next();
}

/**
 * Pull documents from cursor, one at a time
 * @ignore
 * @api private
 */
CursorStream.prototype._next = function() {
  if (this._destroyed) return;
  var self = this;

  processor(function() {
    if(self.destroyed) return;
    self._cursor.nextObject(function (err, doc) {
      self._onNextObject(err, doc);
    });
  });  
}

/** 
 * Handle documents as they come from the cursor
 * @ignore
 * @api private
 */
CursorStream.prototype._onNextObject = function(err, doc) {
  if(err) return this.destroy(err);

  // when doc is null we've hit the end of the cursor
  if(!doc && (this._cursor.state == 1 || this._cursor.state == 2)) {
    return this.destroy();
  } else if(doc) {
    this.write(doc);
    this._next();
  }
}

/**
 * Transform data as specified by options.
 * @ignore
 * @api private
 */
CursorStream.prototype._transform = function(chunk, encoding, done) {
  var doc = this._fn(chunk);
  this.push(doc);
  done();
}

/**
 * Kill the cursor.
 */
CursorStream.prototype.destroy = function(err) {
  if (this._destroyed) return;
  if (err) this.emit('error', err);

  this._destroyed = true;
  this.readable = false;
  this._cursor.close();
  this.end(); 
  this.emit('close');
}

module.exports = exports = CursorStream;
