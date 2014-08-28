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

var AggregationCursor = function(bson, ns, cmd, options, topology, topologyOptions) {
  CoreCursor.apply(this, Array.prototype.slice.call(arguments, 0));
  var self = this;
  var state = AggregationCursor.INIT;
  var streamOptions = {};

  // MaxTimeMS
  var maxTimeMS = null;

  // Set up
  Readable.call(this, {objectMode: true});

  this.batchSize = function(value) {
    if(state == AggregationCursor.CLOSED || self.isDead()) throw new MongoError("Cursor is closed");
    if(typeof value != 'number') throw new MongoError("batchSize requires an integer");
    if(cmd.cursor) cmd.cursor.batchSize = value;
    this.cursorBatchSize = value;
    return self;
  }

  this.geoNear = function(document) {
    cmd.pipeline.push({$geoNear: document});
    return self;
  }

  this.group = function(document) {
    cmd.pipeline.push({$group: document});
    return self;
  }

  this.limit = function(value) {
    cmd.pipeline.push({$limit: value});
    return self; 
  }

  this.match = function(document) {
    cmd.pipeline.push({$match: document});
    return self; 
  }

  this.maxTimeMS = function(value) {
    if(topology.lastIsMaster().minWireVersion > 2) {
      cmd.maxTimeMS = value;
    }
    return self; 
  }

  this.out = function(field) {
    cmd.pipeline.push({$out: field});
    return self; 
  }

  this.project = function(document) {
    cmd.pipeline.push({$project: document});
    return self; 
  }

  this.redact = function(document) {
    cmd.pipeline.push({$redact: document});
    return self; 
  }

  this.skip = function(value) {
    cmd.pipeline.push({$skip: value});
    return self; 
  }

  this.sort = function(document) {
    cmd.pipeline.push({$sort: document});
    return self; 
  }

  this.unwind = function(field) {
    cmd.pipeline.push({$unwind: field});
    return self; 
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
    if(state == AggregationCursor.CLOSED || self.isDead()) return handleCallback(callback, new MongoError("Cursor is closed"), null);
    if(state == AggregationCursor.INIT) state = AggregationCursor.OPEN;
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
          state = AggregationCursor.CLOSED;
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

  this.get = this.toArray;

  this.close = function(callback) {
    state = AggregationCursor.CLOSED;
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

  this.explain = function(callback) {
    cmd.explain = true;
    self.next(callback);
  }

  this._read = function(n) {
    if(state == AggregationCursor.CLOSED || self.isDead()) {
      // options.db.removeListener('close', closeListener);
      return self.push(null);
    }

    // Get the next item
    self.next(function(err, result) {
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
inherits(AggregationCursor, CoreCursor);

// Inherit from Readable
inherits(AggregationCursor, Readable);  

AggregationCursor.INIT = 0;
AggregationCursor.OPEN = 1;
AggregationCursor.CLOSED = 2;

module.exports = AggregationCursor;