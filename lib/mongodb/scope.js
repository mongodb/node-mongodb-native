var Cursor = require('./cursor').Cursor
  , Readable = require('stream').Readable
  , utils = require('./utils')
  , inherits = require('util').inherits;

var Scope = function(collection, _selector, _fields, _scope_options) {
  var self = this;

  // Ensure we have at least an empty cursor options object
  _scope_options = _scope_options || {};
  var _write_concern = _scope_options.write_concern || null;

  // Ensure default read preference
  if(!_scope_options.readPreference) _scope_options.readPreference = {readPreference: 'primary'};

  // Set up the cursor
  var _cursor = new Cursor(
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

  // All the read options
  var readOptions = {
    //
    // Backward compatible methods
    toArray: function(callback) {
      return _cursor.toArray(callback);
    },

    each: function(callback) {
      return _cursor.each(callback);
    },    

    next: function(callback) {
      this.nextObject(callback);
    },

    nextObject: function(callback) {
      return _cursor.nextObject(callback);
    },    

    setReadPreference: function(readPreference, callback) {
      _scope_options.readPreference = {readPreference: readPreference};
      _cursor.setReadPreference(readPreference, callback);
      return readOptions;
    },

    batchSize: function(batchSize, callback) {
      _scope_options.batchSize = batchSize;
      _cursor.batchSize(_scope_options.batchSize, callback);
      return readOptions;
    },

    count: function(applySkipLimit, callback) {
      return _cursor.count(applySkipLimit, callback);
    },

    stream: function(options) {
      return _cursor.stream(options);
    },

    close: function(callback) {
      return _cursor.close(callback);
    },

    explain: function(callback) {
      return _cursor.explain(callback);
    },

    isClosed: function(callback) {
      return _cursor.isClosed();
    },

    rewind: function() {
      return _cursor.rewind();
    },
    // !------------------------------

    // Internal methods
    limit: function(limit, callback) {
      _cursor.limit(limit, callback);
      _scope_options.limit = limit;
      return readOptions;
    },

    skip: function(skip, callback) {
      _cursor.skip(skip, callback);
      _scope_options.skip = skip;
      return readOptions;
    },

    hint: function(hint) {
      _scope_options.hint = hint;
      _cursor.hint = _scope_options.hint;
      return readOptions;
    }, 

    maxTimeMS: function(maxTimeMS) {  
      _cursor.maxTimeMS(maxTimeMS)
      _scope_options.maxTimeMS = maxTimeMS;
      return readOptions;
    },  

    sort: function(keyOrList, direction, callback) {
      _cursor.sort(keyOrList, direction, callback);
      _scope_options.sort = keyOrList;
      return readOptions;
    },

    fields: function(fields) {
      _fields = fields;
      _cursor.fields = _fields;
      return readOptions;
    },
  }

  //
  // Backward compatible settings
  Object.defineProperty(readOptions, "timeout", {
    get: function() {
      return _cursor.timeout;
    }
  });

  Object.defineProperty(readOptions, "read", {
    get: function() {
      return _cursor.read;
    }
  });

  Object.defineProperty(readOptions, "items", {
    get: function() {
      return _cursor.items;
    }
  });
  // !------------------------------

  // Start find
  this.find = function(selector, options) {
    // Save the current selector
    _selector = selector;
    // Set the cursor
    _cursor.selector = selector;
    // Return only legal read options
    return readOptions;
  }
}

exports.Scope = Scope;