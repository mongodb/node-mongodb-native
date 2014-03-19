var Cursor2 = require('./cursor').Cursor
  , Readable = require('stream').Readable
  , utils = require('./utils')
  , inherits = require('util').inherits;

var Cursor = function Cursor(_scope_options, _cursor) {
  //
  // Backward compatible methods
  this.toArray = function(callback) {
    return _cursor.toArray(callback);
  }

  this.each = function(callback) {
    return _cursor.each(callback);
  }

  this.next = function(callback) {
    this.nextObject(callback);
  }

  this.nextObject = function(callback) {
    return _cursor.nextObject(callback);
  }

  this.setReadPreference = function(readPreference, callback) {
    _scope_options.readPreference = {readPreference: readPreference};
    _cursor.setReadPreference(readPreference, callback);
    return this;
  }

  this.batchSize = function(batchSize, callback) {
    _scope_options.batchSize = batchSize;
    _cursor.batchSize(_scope_options.batchSize, callback);
    return this;
  }

  this.count = function(applySkipLimit, callback) {
    return _cursor.count(applySkipLimit, callback);
  }

  this.stream = function(options) {
    return _cursor.stream(options);
  }

  this.close = function(callback) {
    return _cursor.close(callback);
  }

  this.explain = function(callback) {
    return _cursor.explain(callback);
  }

  this.isClosed = function(callback) {
    return _cursor.isClosed();
  }

  this.rewind = function() {
    return _cursor.rewind();
  }

  // Internal methods
  this.limit = function(limit, callback) {
    _cursor.limit(limit, callback);
    _scope_options.limit = limit;
    return this;
  }

  this.skip = function(skip, callback) {
    _cursor.skip(skip, callback);
    _scope_options.skip = skip;
    return this;
  }

  this.hint = function(hint) {
    _scope_options.hint = hint;
    _cursor.hint = _scope_options.hint;
    return this;
  }

  this.maxTimeMS = function(maxTimeMS) {  
    _cursor.maxTimeMS(maxTimeMS)
    _scope_options.maxTimeMS = maxTimeMS;
    return this;
  },  

  this.sort = function(keyOrList, direction, callback) {
    _cursor.sort(keyOrList, direction, callback);
    _scope_options.sort = keyOrList;
    return this;
  },

  this.fields = function(fields) {
    _fields = fields;
    _cursor.fields = _fields;
    return this;
  }

  //
  // Backward compatible settings
  Object.defineProperty(this, "timeout", {
    get: function() {
      return _cursor.timeout;
    }
  });

  Object.defineProperty(this, "items", {
    get: function() {
      return _cursor.items;
    }
  });  

  Object.defineProperty(this, "readPreference", {
    get: function() {
      return _cursor.readPreference;
    }
  });  
}

var Scope = function(collection, _selector, _fields, _scope_options) {
  var self = this;

  // Ensure we have at least an empty cursor options object
  _scope_options = _scope_options || {};
  var _write_concern = _scope_options.write_concern || null;

  // Ensure default read preference
  if(!_scope_options.readPreference) _scope_options.readPreference = {readPreference: 'primary'};

  // Set up the cursor
  var _cursor = new Cursor2(
        collection.db, collection, _selector
      , _fields, _scope_options
    );

  // Write branch options
  var writeOptions = {
    insert: function(documents, callback) {
      // Merge together options
      var options = _write_concern || {};
      // Execute insert
      collection.insert(documents, options, callback);
    },
    
    save: function(document, callback) {
      // Merge together options
      var save_options = _write_concern || {};
      // Execute save
      collection.save(document, save_options, function(err, result) {
        if(typeof result == 'number' && result == 1) {
          return callback(null, document);
        }

        return callback(null, document);
      });
    },

    find: function(selector) {
      _selector = selector;
      return writeOptions;
    },

    //
    // Update is implicit multiple document update
    update: function(operations, callback) {
      // Merge together options
      var update_options = _write_concern || {};
      
      // Set up options, multi is default operation
      update_options.multi = _scope_options.multi ? _scope_options.multi : true;
      if(_scope_options.upsert) update_options.upsert = _scope_options.upsert;
      
      // Execute options
      collection.update(_selector, operations, update_options, function(err, result, obj) {
        callback(err, obj);
      });
    },
  }

  // Set write concern
  this.withWriteConcern = function(write_concern) {
    // Save the current write concern to the Scope
    _scope_options.write_concern = write_concern;
    _write_concern = write_concern;
    // Only allow legal options
    return writeOptions;
  }

  // Start find
  this.find = function(selector, options) {
    // Save the current selector
    _selector = selector;
    // Set the cursor
    _cursor.selector = selector;
    // Return only legal read options
    return new Cursor(_scope_options, _cursor);
  }
}

exports.Scope = Scope;
