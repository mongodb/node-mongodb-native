var inherits = require('util').inherits
  , f = require('util').format
  , toError = require('./utils').toError
  , getSingleProperty = require('./utils').getSingleProperty
  , formattedOrderClause = require('./utils').formattedOrderClause
  , handleCallback = require('./utils').handleCallback
  , Logger = require('mongodb-core').Logger
  , EventEmitter = require('events').EventEmitter
  , ReadPreference = require('./read_preference')
  , MongoError = require('mongodb-core').MongoError
  , Readable = require('stream').Readable || require('readable-stream').Readable
  , CoreCursor = require('mongodb-core').Cursor
  , Query = require('mongodb-core').Query
  , CoreReadPreference = require('mongodb-core').ReadPreference;

var Cursor = function(bson, ns, cmd, options, topology, topologyOptions) {
  CoreCursor.apply(this, Array.prototype.slice.call(arguments, 0));
  var self = this;
  var state = Cursor.INIT;
  var streamOptions = {};

  // Tailable cursor options
  var numberOfRetries = options.numberOfRetries || 5;
  var tailableRetryInterval = options.tailableRetryInterval || 500;
  var currentNumberOfRetries = numberOfRetries;
  // MaxTimeMS
  var maxTimeMS = null;

  // Set up
  Readable.call(this, {objectMode: true});

  // Add a read Only property
  Object.defineProperty(this, 'sortValue', {
    enumerable:true,
    get: function() { return cmd.sort; }
  });

  // Add a read Only property
  Object.defineProperty(this, 'timeout', {
    enumerable:true,
    get: function() { return options.noCursorTimeout == true; }
  });

  // Get the read preferences
  Object.defineProperty(this, 'readPreference', {
    enumerable:true,
    get: function() { return options.readPreference; }
  });

  this.filter = function(selector) {
    cmd.query = selector;
    return this;
  }

  // Flags allowed for cursor
  var flags = ['tailable', 'oplogReplay', 'noCursorTimeout', 'awaitData', 'exhaust', 'partial'];

  this.addCursorFlag = function(flag, value) {
    if(flags.indexOf(flag) == -1) throw new MongoError(f("flag % not a supported flag %s", flag, flags));
    if(typeof value != 'boolean') throw new MongoError(f("flag % must be a boolean value", flag));
    options[flag] = value;
    return this;
  }

  // Query modifiers allowed
  var queryModifiers = ['tailable', 'oplogReplay', 'noCursorTimeout', 'awaitData', 'exhaust', 'partial'];

  this.addQueryModifier = function(name, value) {
    if(name[0] != '$') throw new MongoError(f("%s is not a valid query modifier"));
    // Strip of the $
    var field = name.substr(1);
    // Set on the command
    cmd[field] = value;
    // Deal with the special case for sort
    if(field == 'orderby') cmd.sort = cmd[field];
    return this;
  }

  this.comment = function(value) {
    cmd.comment = value;
    return this;
  }

  this.maxTimeMS = function(value) {
    if(typeof value != 'number') throw new MongoError("maxTimeMS must be a number");
    maxTimeMS = value;
    cmd.maxTimeMS = value;
    return self;
  }

  this.maxTimeMs = this.maxTimeMS;

  this.project = function(value) {
    cmd.fields = value;
    return this;
  }

  this.sort = function(keyOrList, direction) {
    if(options.tailable) throw new MongoError("Tailable cursor doesn't support sorting");
    if(state == Cursor.CLOSED || state == Cursor.OPEN || self.isDead()) throw new MongoError("Cursor is closed");
    var order = keyOrList;

    if(direction != null) {
      order = [[keyOrList, direction]];
    }

    cmd.sort = order;
    return this;
  }

  this.batchSize = function(value) {
    if(options.tailable) throw new MongoError("Tailable cursor doesn't support limit");
    if(state == Cursor.CLOSED || self.isDead()) throw new MongoError("Cursor is closed");
    if(typeof value != 'number') throw new MongoError("batchSize requires an integer");
    cmd.batchSize = value;
    this.cursorBatchSize = value;
    return self;
  }

  this.limit = function(value) {
    if(options.tailable) throw new MongoError("Tailable cursor doesn't support limit");
    if(state == Cursor.OPEN || state == Cursor.CLOSED || self.isDead()) throw new MongoError("Cursor is closed");
    if(typeof value != 'number') throw new MongoError("limit requires an integer");
    cmd.limit = value;
    this.cursorLimit = value;
    return self;
  }

  this.skip = function(value) {
    if(options.tailable) throw new MongoError("Tailable cursor doesn't support skip");
    if(state == Cursor.OPEN || state == Cursor.CLOSED || self.isDead()) throw new MongoError("Cursor is closed");
    if(typeof value != 'number') throw new MongoError("skip requires an integer");
    cmd.skip = value;
    this.cursorSkip = value;
    return self;
  }

  this.nextObject = function(options, callback) {
    if('function' === typeof options) callback = options, options = {};
    if(state == Cursor.CLOSED || self.isDead()) return handleCallback(callback, new MongoError("Cursor is closed"));
    if(state == Cursor.INIT && cmd.sort) {
      try {
        cmd.sort = formattedOrderClause(cmd.sort);
      } catch(err) {
        return handleCallback(callback, err);
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
      if(err) return handleCallback(callback, err);
      handleCallback(callback, null, doc);
    });
  }

  // Trampoline emptying the number of retrieved items
  // without incurring a nextTick operation
  var loop = function(self, callback) {
    // No more items we are done
    if(self.bufferedCount() == 0) return;
    // Get the next document
    self.next(callback);
    // Loop
    return loop;
  }

  this.each = function(callback) {
    if(!callback) throw new MongoError('callback is mandatory');
    if(state == Cursor.CLOSED || self.isDead()) return handleCallback(callback, new MongoError("Cursor is closed"), null);
    if(state == Cursor.INIT) state = Cursor.OPEN;
    // Trampoline all the entries
    if(self.bufferedCount() > 0) {
      while(fn = loop(self, callback)) fn(self, callback);
      self.each(callback);
    } else {
      self.next(function(err, item) {
        if(err) return handleCallback(callback, err);
        if(item == null) return handleCallback(callback, null, null);
        if(!handleCallback(callback, null, item)) return;
        self.each(callback);
      })
    }
  };

  // Set the read preference on the cursor
  this.setReadPreference = function(r) {
    if(state != Cursor.INIT) throw new MongoError('cannot change cursor readPreference after cursor has been accessed');
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
    if(options.tailable) return handleCallback(callback, new MongoError("Tailable cursor cannot be converted to array"), null);
    var items = [];
    
    // Reset cursor
    this.rewind();

    // Fetch all the documents
    var fetchDocs = function() {
      self.next(function(err, doc) {
        if(err) return handleCallback(callback, err);
        if(doc == null) {
          state = Cursor.CLOSED;
          return handleCallback(callback, null, items);
        }

        // Add doc to items
        items.push(doc)
        // Get all buffered objects
        if(self.bufferedCount() > 0) {
          items = items.concat(self.readBufferedDocuments(self.bufferedCount()));
        }

        // Attempt a fetch
        fetchDocs();
      })      
    }

    fetchDocs();
  }

  this.count = function(applySkipLimit, opts, callback) {
    if(typeof opts == 'function') callback = opts, opts = {};
    opts = opts || {};
    if(cmd.query == null) callback(new MongoError("count can only be used with find command"));
    if(typeof applySkipLimit == 'function') {
      callback = applySkipLimit;
      applySkipLimit = true;
    }

    var opts = {};
    if(applySkipLimit) {
      if(typeof this.cursorSkip == 'number') opts.skip = this.cursorSkip;
      if(typeof this.cursorLimit == 'number') opts.limit = this.cursorLimit;    
    }

    // Command
    var command = {
      'count': ns.split('.').pop(), 'query': cmd.query
    }

    // If maxTimeMS set
    if(typeof maxTimeMS == 'number') {
      command.maxTimeMS = maxTimeMS;
    }

    // Get a server
    var server = topology.getServer(opts);
    // Get a connection
    var connection = topology.getConnection(opts);
    // Get the callbacks
    var callbacks = server.getCallbacks();

    // Merge in any options
    if(opts.skip) command.skip = opts.skip;
    if(opts.limit) command.limit = opts.limit;
    if(options.hint) command.hint = options.hint;

    // Build Query object
    var query = new Query(bson, f("%s.$cmd", ns.split('.').shift()), command, {
        numberToSkip: 0, numberToReturn: -1
      , checkKeys: false
    });

    // Set up callback
    callbacks.once(query.requestId, function(err, result) {
      if(err) return handleCallback(callback, err);
      if(result.documents.length == 1 
        && (result.documents[0].errmsg
        || result.documents[0].err
        || result.documents[0]['$err'])) return callback(MongoError.create(result.documents[0]));
      handleCallback(callback, null, result.documents[0].n);
    });

    // Write the initial command out
    connection.write(query);
  };

  this.close = function(callback) {
    state = Cursor.CLOSED;
    // Kill the cursor
    this.kill();
    // Emit the close event for the cursor
    this.emit('close');      
    // Callback if provided
    if(callback) return handleCallback(callback, null, self);  
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
    cmd.explain = true;
    self.next(callback);
  }

  this._read = function(n) {
    if(state == Cursor.CLOSED || self.isDead()) {
      // options.db.removeListener('close', closeListener);
      return self.push(null);
    }

    // Get the next item
    self.nextObject(function(err, result) {
      if(err) {
        if(!self.isDead()) self.destroy();
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