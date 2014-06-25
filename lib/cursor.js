var inherits = require('util').inherits
  , f = require('util').format
  , Logger = require('mongodb-core').Logger
  , EventEmitter = require('events').EventEmitter
  , ReadPreference = require('./read_preference')
  , CoreCursor = require('mongodb-core').Cursor
  , CoreReadPreference = require('mongodb-core').ReadPreference;

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

  // Resolve all the next
  var getAllNexts = function(items, callback) {
    self.next(function(err, item) {
      if(err) return callback(err);
      if(item == null) return callback(null, null);
      items.push(item);
      getAllNexts(items, callback);
    });
  }

  // Set the read preference on the cursor
  this.setReadPreference = function(r) {
    if(r instanceof ReadPreference) {
      options.readPreference = new CoreReadPreference(r.mode, r.tags);
    } else {
      options.readPreference = new CoreReadPreference(r);
    }
    return this;
  }

  // Adding a toArray function to the cursor
  this.toArray = function(callback) {
    var items = [];

    getAllNexts(items, function(err, r) {
      if(err) return callback(err, null);          
      callback(null, items);
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