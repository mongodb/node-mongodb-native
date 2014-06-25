var EventEmitter = require('events').EventEmitter
  , inherits = require('util').inherits
  , getSingleProperty = require('./utils').getSingleProperty
  , shallowClone = require('./utils').shallowClone
  , parseIndexOptions = require('./utils').parseIndexOptions
  , toError = require('./utils').toError
  , f = require('util').format
  , Admin = require('./admin')
  , Collection = require('./collection');

var Db = function(databaseName, topology, options) {
  options = options || {};
  if(!(this instanceof Db)) return new Db(databaseName, topology, options);  
  EventEmitter.call(this);
  var self = this;

  // Add a read Only property
  getSingleProperty(this, 'serverConfig', topology);

  // Last ismaster
  Object.defineProperty(this, 'options', {
    enumerable:true,
    get: function() { return options; }
  });  

  // Last ismaster
  Object.defineProperty(this, 'slaveOk', {
    enumerable:true,
    get: function() {
      if(options.readPreference != null
        && (options.readPreference != 'primary' || options.readPreference.mode != 'primary')) {
        return true;
      }
      return false;
    }
  });  

  Object.defineProperty(this, 'writeConcern', {
    enumerable:true,
    get: function() { 
      var ops = {};
      if(options.w) ops.w = options.w;
      if(options.j) ops.w = options.j;
      if(options.fsync) ops.w = options.fsync;
      if(options.wtimeout) ops.w = options.wtimeout;
      return ops;
    }
  });  

  /**
   * Open a database
   */
  this.open = function(callback) {
    topology.connect(self, options, function(err, topology) {
      if(err) return callback(err);
      callback(null, self);
    });
  }

  /**
   * Execute a command
   */
  this.command = function(selector, options, callback) {
    if(typeof options == 'function') callback = options, options = {};
    // Execute command
    topology.command(f('%s.$cmd', databaseName), selector, options, function(err, result) {
      if(err) return callback(err);
      callback(null, result.result);
    });
  }

  this.close = function() {
    topology.close();
  }

  this.admin = function(callback) {
    if(callback == null) return new Admin(this);
    callback(null, new Admin(this));
  };

  this.collection = function(name, options, callback) {
    if(typeof options == 'function') callback = options, options = {};
    options = options || {};

    if(options == null || !options.strict) {
      try {
        var collection = new Collection(self, topology, databaseName, name, self.pkFactory, options);
        if(callback) callback(null, collection);
        return collection;
      } catch(err) {
        if(callback) return callback(err);
        throw err;
      }      
    }

    // Strict mode
    self.collectionNames(name, function(err, collections) {
      if(err != null) return callback(err, null);
      if(collections.length == 0) return callback(toError(f("Collection %s does not exist. Currently in strict mode.", name)), null);
      try {
        return callback(null, new Collection(self, topology, databaseName, name, self.pkFactory, options));
      } catch(err) {
        return callback(err, null);
      }
    });    
  }


  // Get write concern
  var writeConcern = function(target, db, options) {
    if(options.w || options.j || options.fsync) {
      target.writeConcern = options;
    } else if(db.writeConcern.w || db.writeConcern.j || db.writeConcern.fsync) {
      target.writeConcern = db.writeConcern;
    }

    return target
  }

  // Create a collection
  this.createCollection = function(name, options, callback) {
    var args = Array.prototype.slice.call(arguments, 0);
    callback = args.pop();
    name = args.length ? args.shift() : null;
    options = args.length ? args.shift() || {} : {};

    // Get the write concern options
    var finalOptions = writeConcern(shallowClone(options), self, options);

    // Check if we have the name
    this.collectionNames(name, function(err, collections) {
      if(err != null) return callback(err, null);
      var found = false;
      for(var i = 0; i < collections.length; i++) {
        if(collections[i].name == databaseName + "." + name) {
          found = true;
          break;
        }
      }

      // If the collection exists either throw an exception (if db in safe mode) or return the existing collection
      if(found && finalOptions && finalOptions.strict) {
        return callback(new Error(f("Collection %s already exists. Currently in strict mode.", name)), null);
      } else if(found){
        try {
          return callback(null, new Collection(self, topology, databaseName, name, self.pkFactory, options));
        } catch(err) {
          return callback(err, null);
        }
      }

      // logout command
      var cmd = {'create':name};
      // Add all optional parameters
      for(var n in options) {
        if(options[n] != null && typeof options[n] != 'function') 
          cmd[n] = options[n];
      }

      // Execute command
      self.command(cmd, finalOptions, function(err, result) {
        if(err) return callback(err);
        callback(null, new Collection(self, topology, databaseName, name, self.pkFactory, options));
      });
    });
  }  

  // Get all collection names
  this.collectionNames = function(name, options, callback) {
    var args = Array.prototype.slice.call(arguments, 0);
    callback = args.pop();
    name = args.length ? args.shift() : null;
    options = args.length ? args.shift() || {} : {};

    // Only passed in options
    if(name != null && typeof name == 'object') options = name, name = null;

    // Let's make our own callback to reuse the existing collections info method
    self.collectionsInfo(name, function(err, cursor) {
      if(err != null) return callback(err, null);
      cursor.toArray(function(err, documents) {
        if(err != null) return callback(err, null);

        // List of result documents that have been filtered
        var filtered_documents = documents.filter(function(document) {
          return !(document.name.indexOf(databaseName) == -1 || document.name.indexOf('$') != -1);
        });

        // If we are returning only the names
        if(options.namesOnly) {
          filtered_documents = filtered_documents.map(function(document) { return document.name });
        }

        // Return filtered items
        callback(null, filtered_documents);
      });
    });
  };

  this.collectionsInfo = function(name, callback) {
    if(name != null && typeof name == 'function') callback = name, name = null;
    // Create selector
    var selector = {};
    // If we are limiting the access to a specific collection name
    if(name != null) selector.name = databaseName + "." + name;
    // Return a cursor using a callback
    if(callback) callback(null, self.collection(Db.SYSTEM_NAMESPACE_COLLECTION).find(selector));
    return self.collection(Db.SYSTEM_NAMESPACE_COLLECTION).find(selector);
  }; 

  this.renameCollection = function(fromCollection, toCollection, options, callback) {
    if(typeof options == 'function') callback = options, options = {};
    // Add return new collection
    options.new_collection = true;
    // Execute using the collection method
    this.collection(fromCollection).rename(toCollection, options, callback);
  };

  this.dropCollection = function(name, callback) {
    callback || (callback = function(){});

    // Command to execute
    var cmd = {'drop':name}

    // Execute command
    self.command(cmd, options, function(err, result) {
      if(err) return callback(err);
      if(result.ok) return callback(null, true);
      callback(null, false);
    });
  };

  this.collections = function(callback) {
    // Let's get the collection names
    self.collectionNames(function(err, documents) {
      if(err != null) return callback(err, null);
      // Return the collection objects
      callback(null, documents.map(function(d) {
        return new Collection(self, topology, databaseName, d.name.replace(databaseName + ".", ''), self.pkFactory, options);
      }));
    });
  };  

  this.executeDbAdminCommand = function(selector, options, callback) {
    if(typeof options == 'function') callback = options, options = {};
    if(options.readPreference) {
      options.readPreference = options.readPreference;
    }

    // Execute command
    topology.command('admin.$cmd', selector, options, function(err, result) {
      if(err) return callback(err);
      callback(null, result.result);
    });
  };

  this.createIndex = function(name, fieldOrSpec, options, callback) {
    var args = Array.prototype.slice.call(arguments, 2);
    callback = args.pop();
    options = args.length ? args.shift() || {} : {};
    options = typeof callback === 'function' ? options : callback;
    options = options == null ? {} : options;

    // Get the write concern options
    var finalOptions = writeConcern({}, self, options);
    // Ensure we have a callback
    if(finalOptions.writeConcern && typeof callback != 'function') {
      throw new Error("Cannot use a writeConcern without a provided callback");
    }

    // Attempt to run using createIndexes command
    createIndexUsingCreateIndexes(self, name, fieldOrSpec, options, function(err, result) {
      if(err == null) return callback(err, result);

      // Create command
      var doc = createCreateIndexCommand(self, name, fieldOrSpec, options);
      // Insert document
      topology.insert(f("%s.%s", databaseName, Db.SYSTEM_INDEX_COLLECTION), doc, finalOptions, function(err, result) {
        if(callback == null) return;
        if(err) return callback(err);
        callback(null, doc.name);
      });
    });
  };

  this.ensureIndex = function(name, fieldOrSpec, options, callback) {
    if(typeof options == 'function') callback = options, options = {};
    options = options || {};

    // Get the write concern options
    var finalOptions = writeConcern({}, self, options);
    // Create command
    var selector = createCreateIndexCommand(self, name, fieldOrSpec, options);
    var index_name = selector.name;

    // Default command options
    var commandOptions = {};
    // Check if the index allready exists
    this.indexInformation(name, writeConcern, function(err, collectionInfo) {
      if(err != null) return callback(err, null);
      // If the index does not exist, create it
      if(!collectionInfo[index_name])  {
        self.createIndex(name, fieldOrSpec, options, callback);
      } else {
        if(typeof callback === 'function') return callback(null, index_name);
      }
    });
  };  

  // Figure out the read preference
  var getReadPreference = function(options, db) {
    if(options.readPreference) return options;
    if(db.readPreference) options.readPreference = db.readPreference;
    return options;
  }

  this.indexInformation = function(name, options, callback) {
    if(typeof callback === 'undefined') {
      if(typeof options === 'undefined') {
        callback = name;
        name = null;
      } else {
        callback = options;
      }
      options = {};
    }

    // If we specified full information
    var full = options['full'] == null ? false : options['full'];
    // Build selector for the indexes
    var selector = name != null ? {ns: (databaseName + "." + name)} : {};

    // Get read preference if we set one
    var readPreference = getReadPreference(options, this);

    // Iterate through all the fields of the index
    var collection = this.collection(Db.SYSTEM_INDEX_COLLECTION);
    // Perform the find for the collection
    collection.find(selector).setReadPreference(readPreference).toArray(function(err, indexes) {
      if(err != null) return callback(err, null);
      // Contains all the information
      var info = {};

      // if full defined just return all the indexes directly
      if(full) return callback(null, indexes);

      // Process all the indexes
      for(var i = 0; i < indexes.length; i++) {
        var index = indexes[i];
        // Let's unpack the object
        info[index.name] = [];
        for(var name in index.key) {
          info[index.name].push([name, index.key[name]]);
        }
      }

      // Return all the indexes
      callback(null, info);
    });
  };

  var createCreateIndexCommand = function(db, name, fieldOrSpec, options) {
    var indexParameters = parseIndexOptions(fieldOrSpec);
    var fieldHash = indexParameters.fieldHash;
    var keys = indexParameters.keys;

    // Generate the index name
    var indexName = typeof options.name == 'string' ? options.name : indexParameters.name;
    var selector = {
      'ns': databaseName + "." + name, 'key': fieldHash, 'name': indexName
    }

    // Ensure we have a correct finalUnique
    var finalUnique = options == null || 'object' === typeof options ? false : options;
    // Set up options
    options = options == null || typeof options == 'boolean' ? {} : options;

    // Add all the options
    var keysToOmit = Object.keys(selector);
    for(var optionName in options) {
      if(keysToOmit.indexOf(optionName) == -1) {
        selector[optionName] = options[optionName];
      }
    }

    if(selector['unique'] == null) selector['unique'] = finalUnique;
    return selector;
  }

  var createIndexUsingCreateIndexes = function(self, name, fieldOrSpec, options, callback) {
    // Build the index
    var indexParameters = parseIndexOptions(fieldOrSpec);
    // Generate the index name
    var indexName = typeof options.name == 'string' ? options.name : indexParameters.name;
    // Set up the index
    var indexes = [{ name: indexName, key: indexParameters.fieldHash }];
    // merge all the options
    var keysToOmit = Object.keys(indexes[0]);
    for(var optionName in options) {
      if(keysToOmit.indexOf(optionName) == -1) {
        indexes[0][optionName] = options[optionName];
      }
    }

    // Build the command
    self.command({createIndexes: name, indexes: indexes}, options, function(err, result) {
      if(err) return callback(err, null);
      if(result.ok == 0) return callback(toError(result), null);
      // Return the indexName for backward compatibility
      callback(null, indexName);
    });
  }

  // Add listeners to topology
  var createListener = function(e) {
    var listener = function(err) {
      if(e != 'error') {
        self.emit(e, err);
      }
    }
    return listener;
  }

  topology.once('error', createListener('error'));
  topology.once('timeout', createListener('timeout'));
  topology.once('close', createListener('close'));
  topology.once('parseError', createListener('parseError'));
}

inherits(Db, EventEmitter);

// Constants
Db.SYSTEM_NAMESPACE_COLLECTION = "system.namespaces";
Db.SYSTEM_INDEX_COLLECTION = "system.indexes";
Db.SYSTEM_PROFILE_COLLECTION = "system.profile";
Db.SYSTEM_USER_COLLECTION = "system.users";
Db.SYSTEM_COMMAND_COLLECTION = "$cmd";
Db.SYSTEM_JS_COLLECTION = "system.js";

module.exports = Db;