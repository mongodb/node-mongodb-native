var inherits = require('util').inherits
  , f = require('util').format
  , Logger = require('mongodb-core').Logger
  , EventEmitter = require('events').EventEmitter
  , CoreCursor = require('mongodb-core').Cursor;

var Cursor = function(bson, ns, cmd, connection, callbacks, options) {
  CoreCursor.apply(this, Array.prototype.slice.call(arguments, 0));
  var self = this;

  this.nextObject = function(options, callback) {
    if('function' === typeof options) callback = options, options = {};
    self.next(function(err, doc) {
      if(err) return callback(err);
      callback(null, doc);
    });
  }

  this.limit = function(value) {
    cmd.limit = value;
    return self;
  }

  this.batchSize = function(value) {
    cmd.batchSize = value;
    return self;
  }
}

// Extend the Cursor
inherits(Cursor, CoreCursor);

module.exports = Cursor;