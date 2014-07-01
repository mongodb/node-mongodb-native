var inherits = require('util').inherits
  , f = require('util').format
  , toError = require('./utils').toError
  , getSingleProperty = require('./utils').getSingleProperty
  , formattedOrderClause = require('./utils').formattedOrderClause
  , Logger = require('mongodb-core').Logger
  , EventEmitter = require('events').EventEmitter
  , ReadPreference = require('./read_preference')
  , MongoError = require('mongodb-core').MongoError
  , Readable = require('stream').Readable || require('readable-stream').Readable
  , CoreCursor = require('mongodb-core').Cursor
  , Query = require('mongodb-core').Query
  , CoreReadPreference = require('mongodb-core').ReadPreference;

var Cursor = function(bson, ns, cmd, connection, callbacks, options) {
  CoreCursor.apply(this, Array.prototype.slice.call(arguments, 0));
  var self = this;
  var state = Cursor.INIT;
  var streamOptions = {};

  // Tailable cursor options
  var numberOfRetries = options.numberOfRetries || 5;
  var tailableRetryInterval = options.tailableRetryInterval || 500;
  var currentNumberOfRetries = numberOfRetries;

  // Set up
  Readable.call(this, {objectMode: true});

  // Add a read Only property
  Object.defineProperty(this, 'sortValue', {
    enumerable:true,
    get: function() { return cmd.orderby; }
  });

  // Db close listener
  var closeListener = function() {
    state = Cursor.CLOSED;
    self.kill();

    if(self.listeners('close').length > 0) {
      self.emit('close');
    }
  }

  // If we have an end event emit close for backward comp
  self.once('end', function() {
    self.emit('close')
  });
  
  // Handle a connection close
  options.db.once('close', closeListener);    

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
      if(err && err.tailable && currentNumberOfRetries == 0) return callback(err);
      if(err && err.tailable && currentNumberOfRetries > 0) {
        currentNumberOfRetries = currentNumberOfRetries - 1;
        return setTimeout(function() {
          self.nextObject(options, callback);
        }, tailableRetryInterval);
      }

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

  // Trampoline emptying the number of retrieved items
  // without incurring a nextTick operation
  var loop = function(self, callback) {
    // No more items we are done
    if(self.bufferedDocuments().length == 0) return;
    // Get the next document
    self.next(callback);
    // Loop
    return loop;
  }

  this.each = function(callback) {
    if(!callback) throw new MongoError('callback is mandatory');
    if(state == Cursor.CLOSED) return callback(new MongoError("Cursor is closed"), null);
    // Trampoline all the entries
    if(self.bufferedDocuments().length > 0) {
      while(fn = loop(self, callback)) fn(self, callback);
      self.each(callback);
    } else {
      self.next(function(err, item) {
        if(err) return callback(err);
        callback(null, item);
        self.each(callback);
      })
    }
  };

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

    var fetchDocs = function() {
      // Get the first doc
      self.next(function(err, doc) {
        if(err) return callback(err);
        if(doc == null) return callback(null, items);
        // Add doc to items
        items.push(doc)
        // Get all buffered objects
        if(self.bufferedDocuments().length > 0) {
          items = items.concat(self.bufferedDocuments().splice(0));
        }

        // Attempt a fetch
        fetchDocs();
      })      
    }

    fetchDocs();
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
    this.cursorLimit = value;
    return self;
  }

  this.skip = function(value) {
    if(options.tailable) throw new Error("Tailable cursor doesn't support skip");
    if(state == Cursor.OPEN || state == Cursor.CLOSED) throw new Error("Cursor is closed");
    if(typeof value != 'number') throw new Error("skip requires an integer");
    cmd.skip = value;
    this.cursorSkip = value;
    return self;
  }

  this.batchSize = function(value) {
    if(options.tailable) throw new Error("Tailable cursor doesn't support limit");
    if(state == Cursor.CLOSED) throw new Error("Cursor is closed");
    if(typeof value != 'number') throw new Error("batchSize requires an integer");
    cmd.batchSize = value;
    this.cursorBatchSize = value;
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
    options.db.removeListener('close', closeListener);
    state = Cursor.CLOSED;
    this.emit('close');
    this.kill(function() {
      if(callback) return callback(null, self);
      return self;
    });
  }

  this.isClosed = function() {
    return this.isDead();
  }

  this.destroy = function(err) {
    this.pause();
    this.close();
    if(err) this.emit('error', err);
  }

  this.stream = function(options) {
    streamOptions = options || {};
    return this;
  }

  this.explain = function(callback) {
    cmd.limit = -1;
    cmd.explain = true;
    self.next(callback);
  }

  this._read = function(n) {
    if(state == Cursor.CLOSED) {
      options.db.removeListener('close', closeListener);
      return self.push(null);
    }

    // Get the next item
    self.nextObject(function(err, result) {
      if(err) {
        options.db.removeListener('close', closeListener);
        self.emit('error', err);
        return self.push(null);
      }

      // If we provided a transformation method
      if(typeof streamOptions.transform == 'function' && result != null) {
        return self.push(streamOptions.transform(result));
      }
      // Return the result
      self.push(result);
    });
  }  
}

// Extend the Cursor
inherits(Cursor, CoreCursor);

// Inherit from Readable
inherits(Cursor, Readable);  

Cursor.INIT = 0;
Cursor.OPEN = 1;
Cursor.CLOSED = 2;
Cursor.GET_MORE = 3;

module.exports = Cursor;