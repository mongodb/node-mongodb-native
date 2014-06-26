var EventEmitter = require('events').EventEmitter
  , inherits = require('util').inherits
  , getSingleProperty = require('./utils').getSingleProperty
  , shallowClone = require('./utils').shallowClone
  , parseIndexOptions = require('./utils').parseIndexOptions
  , toError = require('./utils').toError
  , ReadPreference = require('./read_preference')
  , f = require('util').format
  , Admin = require('./admin')
  , Code = require('mongodb-core').BSON.Code
  , CoreReadPreference = require('mongodb-core').ReadPreference
  , MongoError = require('mongodb-core').MongoError
  , Collection = require('./collection')
  , crypto = require('crypto');

var Db = function(databaseName, topology, options) {
  options = options || {};
  if(!(this instanceof Db)) return new Db(databaseName, topology, options);  
  EventEmitter.call(this);
  var self = this;

  // Ensure we have a valid db name
  validateDatabaseName(databaseName);

  // Set buffermaxEntries
  var bufferMaxEntries = typeof options.bufferMaxEntries == 'number' ? options.bufferMaxEntries : -1;

  // Add a read Only property
  getSingleProperty(this, 'serverConfig', topology);
  getSingleProperty(this, 'bufferMaxEntries', bufferMaxEntries);
  getSingleProperty(this, 'databaseName', databaseName);

  // Last ismaster
  Object.defineProperty(this, 'applicationClosed', {
    enumerable:true,
    get: function() { return applicationClosed; }
  });  

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

  this.close = function(force, callback) {
    if(typeof force == 'function') callback = force, force = false;
    topology.close(force);
    if(this.listeners('close').length > 0) self.emit('close');
    this.removeAllListeners('close');
    if(typeof callback == 'function') callback(null);
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

  this.eval = function(code, parameters, options, callback) {
    var args = Array.prototype.slice.call(arguments, 1);
    callback = args.pop();
    parameters = args.length ? args.shift() : parameters;
    options = args.length ? args.shift() || {} : {};

    var finalCode = code;
    var finalParameters = [];
    
    // If not a code object translate to one
    if(!(finalCode instanceof Code)) finalCode = new Code(finalCode);
    // Ensure the parameters are correct
    if(parameters != null && !Array.isArray(parameters) && typeof parameters !== 'function') {
      finalParameters = [parameters];
    } else if(parameters != null && Array.isArray(parameters) && typeof parameters !== 'function') {
      finalParameters = parameters;
    }

    // Create execution selector
    var cmd = {'$eval':finalCode, 'args':finalParameters};
    // Check if the nolock parameter is passed in
    if(options['nolock']) {
      cmd['nolock'] = options['nolock'];
    }

    // Set primary read preference
    options.readPreference = new CoreReadPreference(ReadPreference.PRIMARY);

    // Execute the command
    self.command(cmd, options, function(err, result) {
      if(err) return callback(err, null);
      if(result && result.ok == 1) return callback(null, result.retval);
      if(result) return callback(new MongoError(f("eval failed: %s", result.errmsg)), null);
      callback(err, result);
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

  this.dereference = function(dbRef, callback) {
    var db = this;
    // If we have a db reference then let's get the db first
    if(dbRef.db != null) db = this.db(dbRef.db);
    // Fetch the collection and find the reference
    var collection = db.collection(dbRef.namespace);
    collection.findOne({'_id':dbRef.oid}, function(err, result) {
      callback(err, result);
    });
  }

  this.db = function(dbName) {
    // Copy the options and add out internal override of the not shared flag
    var options = {};
    for(var key in this.options) {
      options[key] = this.options[key];
    }
    // Return the db object
    return new Db(dbName, topology, options);
  };

  var _executeAuthCreateUserCommand = function(self, username, password, options, callback) {
    // Special case where there is no password ($external users)
    if(typeof username == 'string' 
      && password != null && typeof password == 'object') {
      callback = options;
      options = password;
      password = null;
    }

    // Unpack all options
    if(typeof options == 'function') {
      callback = options;
      options = {};
    }  

    // Error out if we digestPassword set
    if(options.digestPassword != null) {
      throw utils.toError("The digestPassword option is not supported via add_user. Please use db.command('createUser', ...) instead for this option.");
    }

    // Get additional values
    var customData = options.customData != null ? options.customData : {};
    var roles = Array.isArray(options.roles) ? options.roles : [];
    var maxTimeMS = typeof options.maxTimeMS == 'number' ? options.maxTimeMS : null;

    // If not roles defined print deprecated message
    if(roles.length == 0) {
      console.log("Creating a user without roles is deprecated in MongoDB >= 2.6");
    }

    // Get the error options
    var wr = writeConcern({}, self, options);
    var commandOptions = {writeCommand:true};
    if(options['dbName']) commandOptions.dbName = options['dbName'];

    // Add maxTimeMS to options if set
    if(maxTimeMS != null) commandOptions.maxTimeMS = maxTimeMS;

    // Check the db name and add roles if needed
    if((self.databaseName.toLowerCase() == 'admin' || options.dbName == 'admin') && !Array.isArray(options.roles)) {
      roles = ['root']
    } else if(!Array.isArray(options.roles)) {
      roles = ['dbOwner']
    }

    // Build the command to execute
    var command = {
        createUser: username
      , customData: customData
      , roles: roles
      , digestPassword:false
      , writeConcern: wr
    }

    // Use node md5 generator
    var md5 = crypto.createHash('md5');
    // Generate keys used for authentication
    md5.update(username + ":mongo:" + password);
    var userPassword = md5.digest('hex');

    // No password
    if(typeof password == 'string') {
      command.pwd = userPassword;
    }

    // Force write using primary
    commandOptions.readPreference = CoreReadPreference.primary;

    // Execute the command
    self.command(command, commandOptions, function(err, result) {
      if(err) return callback(err, null);
      if(!result.ok && result.code == undefined) return callback({code: -5000});
      callback(!result.ok ? toError("Failed to add user " + username) : null
        , result.ok ? [{user: username, pwd: ''}] : null);
    })
  }

  this.addUser = function(username, password, options, callback) {
    if(typeof options == 'function') callback = options, options = {};
    options = options || {};
    
    // Attempt to execute auth command
    _executeAuthCreateUserCommand(this, username, password, options, function(err, r) {
      // We need to perform the backward compatible insert operation
      if(err && err.code == -5000) {        
        var finalOptions = writeConcern(shallowClone(options), self, options);
        // Use node md5 generator
        var md5 = crypto.createHash('md5');
        // Generate keys used for authentication
        md5.update(username + ":mongo:" + password);
        var userPassword = md5.digest('hex');
        
        // If we have another db set
        var db = options.dbName ? self.db(options.dbName) : self;

        // Fetch a user collection
        var collection = db.collection(Db.SYSTEM_USER_COLLECTION);
        
        // Check if we are inserting the first user
        collection.count({}, function(err, count) {
          // We got an error (f.ex not authorized)
          if(err != null) return callback(err, null);
          // Check if the user exists and update i
          collection.find({user: username}, {dbName: options['dbName']}).toArray(function(err, documents) {
            // We got an error (f.ex not authorized)
            if(err != null) return callback(err, null);
            // Add command keys
            finalOptions.upsert = true;

            // We have a user, let's update the password or upsert if not
            collection.update({user: username},{$set: {user: username, pwd: userPassword}}, finalOptions, function(err, results, full) {
              if(count == 0 && err) return callback(null, [{user:username, pwd:userPassword}]);
              if(err) return callback(err, null)
              callback(null, [{user:username, pwd:userPassword}]);
            });
          });
        });

        return;
      }

      if(err) return callback(err);
      callback(err, r);
    });
  };

  var _executeAuthRemoveUserCommand = function(self, username, options, callback) {
    if(typeof options == 'function') callback = options, options = {};
    // Get the error options
    var wr = writeConcern({}, self, options);
    var commandOptions = {writeCommand:true};
    if(options['dbName']) commandOptions.dbName = options['dbName'];

    // Get additional values
    var maxTimeMS = typeof options.maxTimeMS == 'number' ? options.maxTimeMS : null;

    // Add maxTimeMS to options if set
    if(maxTimeMS != null) commandOptions.maxTimeMS = maxTimeMS;

    // Build the command to execute
    var command = {
        dropUser: username
      , writeConcern: wr
    }

    // Force write using primary
    commandOptions.readPreference = CoreReadPreference.primary;

    // Execute the command
    self.command(command, commandOptions, function(err, result) {
      if(err) return callback(err, null);
      if(!result.ok && result.code == undefined) return callback({code: -5000});
      callback(null, result.ok ? true : false);
    })
  }

  this.removeUser = function(username, options, callback) {
    if(typeof options == 'function') callback = options, options = {};
    options = options || {};

    // Attempt to execute command
    _executeAuthRemoveUserCommand(this, username, options, function(err, result) {
      if(err && err.code == -5000) {        
        var finalOptions = writeConcern(shallowClone(options), self, options);
        // If we have another db set
        var db = options.dbName ? self.db(options.dbName) : self;

        // Fetch a user collection
        var collection = db.collection(Db.SYSTEM_USER_COLLECTION);

        // Locate the user
        collection.findOne({user: username}, {}, function(err, user) {
          if(user == null) return callback(err, false);
          collection.remove({user: username}, finalOptions, function(err, result) {
            callback(err, true);
          });
        });
      
        return;
      }

      if(err) return callback(err);
      callback(err, result);      
    });
  };

  this.authenticate = function(username, password, options, callback) {
    if(typeof options == 'function') callback = options, options = {};
    // Set default mechanism
    if(!options.authMechanism) {
      options.authMechanism = 'MONGODB-CR';
    } else if(options.authMechanism != 'GSSAPI' 
      && options.authMechanism != 'MONGODB-CR'
      && options.authMechanism != 'MONGODB-X509'
      && options.authMechanism != 'PLAIN') {
        return callback(new Error("only GSSAPI, PLAIN, MONGODB-X509 or MONGODB-CR is supported by authMechanism"));
    }

    // the default db to authenticate against is 'this'
    // if authententicate is called from a retry context, it may be another one, like admin
    var authdb = options.authdb ? options.authdb : self.databaseName;
    authdb = options.authSource ? options.authSource : authdb;

    // Callback
    var _callback = function(err, result) {
      if(self.listeners("authenticated").length > 0) {
        self.emit("authenticated", err, result);
      }

      // Return to caller
      callback(err, result);
    }

    // If classic auth delegate to auth command
    if(options.authMechanism == 'MONGODB-CR') {
      topology.auth('mongocr', databaseName, username, password, function(err, result) {
        if(err) return callback(err, false);
        callback(null, true);
      });
    //  mongodb_cr_authenticate(self, username, password, authdb, options, _callback);
    // } else if(options.authMechanism == 'PLAIN') {
    //   mongodb_plain_authenticate(self, username, password, options, _callback);
    // } else if(options.authMechanism == 'MONGODB-X509') {
    //   mongodb_x509_authenticate(self, username, password, options, _callback);
    // } else if(options.authMechanism == 'GSSAPI') {
    //   //
    //   // Kerberos library is not installed, throw and error
    //   if(hasKerberos == false) {
    //     console.log("========================================================================================");
    //     console.log("=  Please make sure that you install the Kerberos library to use GSSAPI                =");
    //     console.log("=                                                                                      =");
    //     console.log("=  npm install -g kerberos                                                             =");
    //     console.log("=                                                                                      =");
    //     console.log("=  The Kerberos package is not installed by default for simplicities sake              =");
    //     console.log("=  and needs to be global install                                                      =");
    //     console.log("========================================================================================");
    //     throw new Error("Kerberos library not installed");
    //   }

    //   if(process.platform == 'win32') {
    //     mongodb_sspi_authenticate(self, username, password, authdb, options, _callback);
    //   } else {
    //     // We have the kerberos library, execute auth process
    //     mongodb_gssapi_authenticate(self, username, password, authdb, options, _callback);      
    //   }
    }
  };

  this.logout = function(options, callback) {    
    var args = Array.prototype.slice.call(arguments, 0);
    callback = args.pop();
    options = args.length ? args.shift() || {} : {};

    // logout command
    var cmd = {'logout':1};
    // Add onAll to login to ensure all connection are logged out
    options.onAll = true;

    // Execute the command
    this.command(cmd, options, function(err, result) {
      if(err) return callback(err, false);
      callback(null, true)
    });
  }

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

// Validate the database name
var validateDatabaseName = function(databaseName) {
  if(typeof databaseName !== 'string') throw new Error("database name must be a string");
  if(databaseName.length === 0) throw new Error("database name cannot be the empty string");
  if(databaseName == '$external') return;

  var invalidChars = [" ", ".", "$", "/", "\\"];
  for(var i = 0; i < invalidChars.length; i++) {
    if(databaseName.indexOf(invalidChars[i]) != -1) throw new Error("database names cannot contain the character '" + invalidChars[i] + "'");
  }
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

// Constants
Db.SYSTEM_NAMESPACE_COLLECTION = "system.namespaces";
Db.SYSTEM_INDEX_COLLECTION = "system.indexes";
Db.SYSTEM_PROFILE_COLLECTION = "system.profile";
Db.SYSTEM_USER_COLLECTION = "system.users";
Db.SYSTEM_COMMAND_COLLECTION = "$cmd";
Db.SYSTEM_JS_COLLECTION = "system.js";

module.exports = Db;