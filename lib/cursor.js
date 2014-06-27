var inherits = require('util').inherits
  , f = require('util').format
  , toError = require('./utils').toError
  , getSingleProperty = require('./utils').getSingleProperty
  , formattedOrderClause = require('./utils').formattedOrderClause
  , Logger = require('mongodb-core').Logger
  , EventEmitter = require('events').EventEmitter
  , ReadPreference = require('./read_preference')
  , MongoError = require('mongodb-core').MongoError
  , CoreCursor = require('mongodb-core').Cursor
  , Query = require('mongodb-core').Query
  , CoreReadPreference = require('mongodb-core').ReadPreference;

var Cursor = function(bson, ns, cmd, connection, callbacks, options) {
  CoreCursor.apply(this, Array.prototype.slice.call(arguments, 0));
  var self = this;
  var state = Cursor.INIT;

  // Add a read Only property
  Object.defineProperty(this, 'sortValue', {
    enumerable:true,
    get: function() { return cmd.orderby; }
  });

  this.nextObject = function(options, callback) {
    if('function' === typeof options) callback = options, options = {};
    if(state == Cursor.INIT && cmd.orderby) {
      try {
        cmd.orderby = formattedOrderClause(cmd.orderby);
      } catch(err) {
        return callback(err);
      }
    }
    
    // Get the next object
    self.next(function(err, doc) {
      state = Cursor.OPEN;
      if(err) return callback(err);
      callback(null, doc);
    });
  }

  var eachObject = function(callback) {
    return function() {
      return eachObject
    }
  }

  this.each = function(callback) {
    if(!callback) throw new MongoError('callback is mandatory');
    if(state == Cursor.CLOSED) return callback(new MongoError("Cursor is closed"), null);
    // Execute next
    self.next(function(err, item) {
      if(err) {
        self.state = Cursor.CLOSED;
        return callback(toError(err), item);
      }

      if(item == null) return callback(null, null);
      callback(null, item);
      self.each(callback);
    });
  };

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
    if(!callback) throw new MongoError('callback is mandatory');
    if(options.tailable) return callback(new MongoError("Tailable cursor cannot be converted to array"), null);
    if(state == Cursor.CLOSED) return callback(new MongoError("Cursor is closed"), null);
    var items = [];

    getAllNexts(items, function(err, r) {
      if(err) return callback(err, null);          
      state = Cursor.CLOSED;
      callback(null, items);
    });
  }

  this.count = function(applySkipLimit, callback) {
    if(cmd.query == null) callback(new MongoError("count can only be used with find command"));
    if(typeof applySkipLimit == 'function') {
      callback = applySkipLimit;
      applySkipLimit = false;
    }

    var options = {};
    if(applySkipLimit) {
      if(typeof this.skipValue == 'number') options.skip = this.skipValue;
      if(typeof this.limitValue == 'number') options.limit = this.limitValue;    
    }

    // If maxTimeMS set
    if(typeof this.maxTimeMSValue == 'number') options.maxTimeMS = this.maxTimeMSValue;

    // Command
    var command = {
        'count': ns.split('.').pop(), 'query': cmd.query
      , 'fields': null
    }

    // Build Query object
    var query = new Query(bson, f("%s.$cmd", ns.split('.').shift()), command, {
        numberToSkip: 0, numberToReturn: -1
      , checkKeys: false
    });

    // Set up callback
    callbacks.once(query.requestId, function(err, result) {
      if(err) return callback(err);
      callback(null, result.documents[0].n);
    });

    // Write the initial command out
    connection.write(query);
  };

  this.limit = function(value) {
    if(options.tailable) throw new Error("Tailable cursor doesn't support limit");
    if(state == Cursor.OPEN || state == Cursor.CLOSED) throw new Error("Cursor is closed");
    if(typeof value != 'number') throw new Error("limit requires an integer");
    cmd.limit = value;
    return self;
  }

  this.sort = function(keyOrList, direction) {
    if(options.tailable) throw new MongoError("Tailable cursor doesn't support sorting");
    if(state == Cursor.CLOSED || state == Cursor.OPEN) throw new MongoError("Cursor is closed");
    var order = keyOrList;

    if(direction != null) {
      order = [[keyOrList, direction]];
    }

    cmd.orderby = order;
    return this;
  }

  this.close = function(callback) {
    state = Cursor.CLOSED;

    this.kill(function() {
      if(callback) return callback(null, self);
      return self;
    });
  }

  this.explain = function(callback) {
    cmd.limit = -1;
    cmd.explain = true;
    self.next(callback);
  }

  this.batchSize = function(value) {
    cmd.batchSize = value;
    return self;
  }
}

// Extend the Cursor
inherits(Cursor, CoreCursor);

Cursor.INIT = 0;
Cursor.OPEN = 1;
Cursor.CLOSED = 2;
Cursor.GET_MORE = 3;

module.exports = Cursor;