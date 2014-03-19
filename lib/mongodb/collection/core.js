var InsertCommand = require('../commands/insert_command').InsertCommand
  , DeleteCommand = require('../commands/delete_command').DeleteCommand
  , UpdateCommand = require('../commands/update_command').UpdateCommand
  , DbCommand = require('../commands/db_command').DbCommand
  , utils = require('../utils')
  , hasWriteCommands = require('../utils').hasWriteCommands
  , shared = require('./shared');

/**
 * Precompiled regexes
 * @ignore
 **/
var eErrorMessages = /No matching object found/;

// ***************************************************
// Insert function
// ***************************************************
var insert = function insert (docs, options, callback) {
  if ('function' === typeof options) callback = options, options = {};
  if(options == null) options = {};
  if(!('function' === typeof callback)) callback = null;

  // Get a connection
  var connection = this.db.serverConfig.checkoutWriter();
  var useLegacyOps = options.useLegacyOps == null || options.useLegacyOps == false ? false : true;
  // If we support write commands let's perform the insert using it  
  if(!useLegacyOps && hasWriteCommands(connection) 
    && !Buffer.isBuffer(docs) 
    && !(Array.isArray(docs) && docs.length > 0 && Buffer.isBuffer(docs[0]))) {
      insertWithWriteCommands(this, Array.isArray(docs) ? docs : [docs], options, callback);
      return this
  } 

  // Backwards compatibility
  insertAll(this, Array.isArray(docs) ? docs : [docs], options, callback);
  return this;
};

//
// Uses the new write commands available from 2.6 >
//
var insertWithWriteCommands = function(self, docs, options, callback) {
  // Get the intended namespace for the operation
  var namespace = self.collectionName;

  // Ensure we have no \x00 bytes in the name causing wrong parsing
  if(!!~namespace.indexOf("\x00")) {
    return callback(new Error("namespace cannot contain a null character"), null);
  }

  // Check if we have passed in continue on error
  var continueOnError = typeof options['keepGoing'] == 'boolean' 
    ? options['keepGoing'] : false;
  continueOnError = typeof options['continueOnError'] == 'boolean' 
    ? options['continueOnError'] : continueOnError;

  // Do we serialzie functions
  var serializeFunctions = typeof options.serializeFunctions != 'boolean' 
    ? self.serializeFunctions : options.serializeFunctions;

  // Checkout a write connection
  var connection = self.db.serverConfig.checkoutWriter();  

  // Collect errorOptions
  var errorOptions = shared._getWriteConcern(self, options);

  // If we have a write command with no callback and w:0 fail
  if(errorOptions.w && errorOptions.w != 0 && callback == null) {
    throw new Error("writeConcern requires callback")
  }

  // Add the documents and decorate them with id's if they have none
  for(var index = 0, len = docs.length; index < len; ++index) {
    var doc = docs[index];

    // Add id to each document if it's not already defined
    if (!(Buffer.isBuffer(doc))
      && doc['_id'] == null
      && self.db.forceServerObjectId != true
      && options.forceServerObjectId != true) {
        doc['_id'] = self.pkFactory.createPk();
    }
  }

  // Single document write
  if(docs.length == 1) {
    // Create the write command
    var write_command = {
        insert: namespace
      , writeConcern: errorOptions
      , ordered: !continueOnError
      , documents: docs
    }

    // Execute the write command
    return self.db.command(write_command
      , { connection:connection
        , checkKeys: typeof options.checkKeys == 'boolean' ? options.checkKeys : true
        , serializeFunctions: serializeFunctions
        , writeCommand: true }
      , function(err, result) {  
        if(errorOptions.w == 0 && typeof callback == 'function') return callback(null, null);
        if(errorOptions.w == 0) return;
        if(callback == null) return;
        if(err != null) {
          return callback(err, null);
        }

        // Result has an error
        if(!result.ok || Array.isArray(result.writeErrors) && result.writeErrors.length > 0) {
          var error = utils.toError(result.writeErrors[0].errmsg);
          error.code = result.writeErrors[0].code;
          error.err = result.writeErrors[0].errmsg;
          // Return the error
          return callback(error, null);
        }

        // Return the results for a whole batch
        callback(null, docs)
    });    
  } else {
    try {
      // Multiple document write (use bulk)
      var bulk = !continueOnError ? self.initializeOrderedBulkOp() : self.initializeUnorderedBulkOp();
      // Add all the documents
      for(var i = 0; i < docs.length;i++) {
        bulk.insert(docs[i]);
      }

      // Execute the command
      bulk.execute(errorOptions, function(err, result) {
        if(errorOptions.w == 0 && typeof callback == 'function') return callback(null, null);
        if(errorOptions.w == 0) return;
        if(callback == null) return;
        if(err) return callback(err, null);
        if(result.hasWriteErrors()) {
          var error = result.getWriteErrors()[0];
          error.code = result.getWriteErrors()[0].code;
          error.err = result.getWriteErrors()[0].errmsg;        
          // Return the error
          return callback(error, null);
        }

        // Return the results for a whole batch
        callback(null, docs)
      });
    } catch(err) {
      callback(utils.toError(err), null);
    }
  }
}

//
// Uses pre 2.6 OP_INSERT wire protocol
//
var insertAll = function insertAll (self, docs, options, callback) {
  if('function' === typeof options) callback = options, options = {};
  if(options == null) options = {};
  if(!('function' === typeof callback)) callback = null;

  // Insert options (flags for insert)
  var insertFlags = {};
  // If we have a mongodb version >= 1.9.1 support keepGoing attribute
  if(options['keepGoing'] != null) {
    insertFlags['keepGoing'] = options['keepGoing'];
  }

  // If we have a mongodb version >= 1.9.1 support keepGoing attribute
  if(options['continueOnError'] != null) {
    insertFlags['continueOnError'] = options['continueOnError'];
  }

  // DbName
  var dbName = options['dbName'];
  // If no dbname defined use the db one
  if(dbName == null) {
    dbName = self.db.databaseName;
  }

  // Either use override on the function, or go back to default on either the collection
  // level or db
  if(options['serializeFunctions'] != null) {
    insertFlags['serializeFunctions'] = options['serializeFunctions'];
  } else {
    insertFlags['serializeFunctions'] = self.serializeFunctions;
  }

  // Get checkKeys value
  var checkKeys = typeof options.checkKeys != 'boolean' ? true : options.checkKeys;

  // Pass in options
  var insertCommand = new InsertCommand(
      self.db
    , dbName + "." + self.collectionName, checkKeys, insertFlags);

  // Add the documents and decorate them with id's if they have none
  for(var index = 0, len = docs.length; index < len; ++index) {
    var doc = docs[index];

    // Add id to each document if it's not already defined
    if (!(Buffer.isBuffer(doc))
      && doc['_id'] == null
      && self.db.forceServerObjectId != true
      && options.forceServerObjectId != true) {
        doc['_id'] = self.pkFactory.createPk();
    }

    insertCommand.add(doc);
  }

  // Collect errorOptions
  var errorOptions = shared._getWriteConcern(self, options);
  // Default command options
  var commandOptions = {};
  // If safe is defined check for error message
  if(shared._hasWriteConcern(errorOptions) && typeof callback == 'function') {
    // Set safe option
    commandOptions['safe'] = errorOptions;
    // If we have an error option
    if(typeof errorOptions == 'object') {
      var keys = Object.keys(errorOptions);
      for(var i = 0; i < keys.length; i++) {
        commandOptions[keys[i]] = errorOptions[keys[i]];
      }
    }

    // If we have a passed in connection use it
    if(options.connection) {
      commandOptions.connection = options.connection;
    }

    // Execute command with safe options (rolls up both command and safe command into one and executes them on the same connection)
    self.db._executeInsertCommand(insertCommand, commandOptions, handleWriteResults(function (err, error) {
      if(err) return callback(err, null);
      callback(null, docs);
    }));
  } else if(shared._hasWriteConcern(errorOptions) && callback == null) {
    throw new Error("Cannot use a writeConcern without a provided callback");
  } else {
    // Execute the call without a write concern
    var result = self.db._executeInsertCommand(insertCommand, commandOptions);
    // If no callback just return
    if(!callback) return;
    // If error return error
    if(result instanceof Error) {
      return callback(result);
    }

    // Otherwise just return
    return callback(null, docs);
  }
};

// ***************************************************
// Remove function
// ***************************************************
var removeWithWriteCommands = function(self, selector, options, callback) {
  if('function' === typeof selector) {
    callback = selector;
    selector = options = {};
  } else if ('function' === typeof options) {
    callback = options;
    options = {};
  }

  // Get the intended namespace for the operation
  var namespace = self.collectionName;

  // Ensure we have no \x00 bytes in the name causing wrong parsing
  if(!!~namespace.indexOf("\x00")) {
    return callback(new Error("namespace cannot contain a null character"), null);
  }

  // Set default empty selector if none
  selector = selector == null ? {} : selector;

  // Check if we have passed in continue on error
  var continueOnError = typeof options['keepGoing'] == 'boolean' 
    ? options['keepGoing'] : false;
  continueOnError = typeof options['continueOnError'] == 'boolean' 
    ? options['continueOnError'] : continueOnError;

  // Do we serialzie functions
  var serializeFunctions = typeof options.serializeFunctions != 'boolean' 
    ? self.serializeFunctions : options.serializeFunctions;

  // Checkout a write connection
  var connection = self.db.serverConfig.checkoutWriter();  

  // Figure out the value of top
  var limit = options.single == true ? 1 : 0;
  var upsert = typeof options.upsert == 'boolean' ? options.upsert : false;

  // Collect errorOptions
  var errorOptions = shared._getWriteConcern(self, options);

  // If we have a write command with no callback and w:0 fail
  if(errorOptions.w && errorOptions.w != 0 && callback == null) {
    throw new Error("writeConcern requires callback")
  }

  // Create the write command
  var write_command = {
    delete: namespace,
    writeConcern: errorOptions,
    ordered: !continueOnError,
    deletes: [{
      q : selector,
      limit: limit
    }]
  }

  // Execute the write command
  self.db.command(write_command
    , { connection:connection
      , checkKeys: false
      , serializeFunctions: serializeFunctions
      , writeCommand: true }
    , function(err, result) {  
      if(errorOptions.w == 0 && typeof callback == 'function') return callback(null, null);
      if(errorOptions.w == 0) return;
      if(callback == null) return;
      if(err != null) {
        return callback(err, null);
      }

      // Result has an error
      if(!result.ok || Array.isArray(result.writeErrors) && result.writeErrors.length > 0) {
        var error = utils.toError(result.writeErrors[0].errmsg);
        error.code = result.writeErrors[0].code;
        error.err = result.writeErrors[0].errmsg;
        // Return the error
        return callback(error, null);
      }
      
      // Backward compatibility format
      var r = backWardsCompatibiltyResults(result, 'remove');      
      // Return the results for a whole batch
      callback(null, r.n, r)
  });
}

var remove = function remove(selector, options, callback) {
  if('function' === typeof options) callback = options, options = null;
  if(options == null) options = {};
  if(!('function' === typeof callback)) callback = null;

  // Get a connection
  var connection = this.db.serverConfig.checkoutWriter();
  var useLegacyOps = options.useLegacyOps == null || options.useLegacyOps == false ? false : true;

  // If we support write commands let's perform the insert using it  
  if(!useLegacyOps && hasWriteCommands(connection) && !Buffer.isBuffer(selector)) {
    return removeWithWriteCommands(this, selector, options, callback);
  }

  if ('function' === typeof selector) {
    callback = selector;
    selector = options = {};
  } else if ('function' === typeof options) {
    callback = options;
    options = {};
  }

  // Ensure options
  if(options == null) options = {};
  if(!('function' === typeof callback)) callback = null;
  // Ensure we have at least an empty selector
  selector = selector == null ? {} : selector;
  // Set up flags for the command, if we have a single document remove
  var flags = 0 | (options.single ? 1 : 0);

  // DbName
  var dbName = options['dbName'];
  // If no dbname defined use the db one
  if(dbName == null) {
    dbName = this.db.databaseName;
  }

  // Create a delete command
  var deleteCommand = new DeleteCommand(
      this.db
    , dbName + "." + this.collectionName
    , selector
    , flags);

  var self = this;
  var errorOptions = shared._getWriteConcern(self, options);

  // Execute the command, do not add a callback as it's async
  if(shared._hasWriteConcern(errorOptions) && typeof callback == 'function') {
    // Insert options
    var commandOptions = {};
    // Set safe option
    commandOptions['safe'] = true;
    // If we have an error option
    if(typeof errorOptions == 'object') {
      var keys = Object.keys(errorOptions);
      for(var i = 0; i < keys.length; i++) {
        commandOptions[keys[i]] = errorOptions[keys[i]];
      }
    }

    // If we have a passed in connection use it
    if(options.connection) {
      commandOptions.connection = options.connection;
    }

    // Execute command with safe options (rolls up both command and safe command into one and executes them on the same connection)
    this.db._executeRemoveCommand(deleteCommand, commandOptions, handleWriteResults(function (err, error) {
      if(err) return callback(err, null);
      callback(null, error[0].n);
    }));
  } else if(shared._hasWriteConcern(errorOptions) && callback == null) {
    throw new Error("Cannot use a writeConcern without a provided callback");
  } else {
    var result = this.db._executeRemoveCommand(deleteCommand);
    // If no callback just return
    if (!callback) return;
    // If error return error
    if (result instanceof Error) {
      return callback(result);
    }
    // Otherwise just return
    return callback();
  }
};

// ***************************************************
// Save function
// ***************************************************
var save = function save(doc, options, callback) {
  if('function' === typeof options) callback = options, options = null;
  if(options == null) options = {};
  if(!('function' === typeof callback)) callback = null;
  // Throw an error if attempting to perform a bulk operation
  if(Array.isArray(doc)) throw new Error("doc parameter must be a single document");
  // Extract the id, if we have one we need to do a update command
  var id = doc['_id'];
  var commandOptions = shared._getWriteConcern(this, options);
  if(options.connection) commandOptions.connection = options.connection;

  if(id != null) {
    commandOptions.upsert = true;
    this.update({ _id: id }, doc, commandOptions, callback);
  } else {
    this.insert(doc, commandOptions, callback && function (err, docs) {
      if(err) return callback(err, null);

      if(Array.isArray(docs)) {
        callback(err, docs[0]);
      } else {
        callback(err, docs);
      }
    });
  }
};

// ***************************************************
// Update document function
// ***************************************************
var updateWithWriteCommands = function(self, selector, document, options, callback) {
  if('function' === typeof options) callback = options, options = null;
  if(options == null) options = {};
  if(!('function' === typeof callback)) callback = null;

  // Get the intended namespace for the operation
  var namespace = self.collectionName;

  // Ensure we have no \x00 bytes in the name causing wrong parsing
  if(!!~namespace.indexOf("\x00")) {
    return callback(new Error("namespace cannot contain a null character"), null);
  }

  // If we are not providing a selector or document throw
  if(selector == null || typeof selector != 'object') 
    return callback(new Error("selector must be a valid JavaScript object"));
  if(document == null || typeof document != 'object') 
    return callback(new Error("document must be a valid JavaScript object"));    

  // Check if we have passed in continue on error
  var continueOnError = typeof options['keepGoing'] == 'boolean' 
    ? options['keepGoing'] : false;
  continueOnError = typeof options['continueOnError'] == 'boolean' 
    ? options['continueOnError'] : continueOnError;

  // Do we serialzie functions
  var serializeFunctions = typeof options.serializeFunctions != 'boolean' 
    ? self.serializeFunctions : options.serializeFunctions;

  // Checkout a write connection
  var connection = self.db.serverConfig.checkoutWriter();  

  // Figure out the value of top
  var multi = typeof options.multi == 'boolean' ? options.multi : false;
  var upsert = typeof options.upsert == 'boolean' ? options.upsert : false;

  // Collect errorOptions
  var errorOptions = shared._getWriteConcern(self, options);

  // If we have a write command with no callback and w:0 fail
  if(errorOptions.w && errorOptions.w != 0 && callback == null) {
    throw new Error("writeConcern requires callback")
  }

  // Create the write command
  var write_command = {
    update: namespace,
    writeConcern: errorOptions,
    ordered: !continueOnError,
    updates: [{
      q : selector,
      u: document,
      multi: multi,
      upsert: upsert
    }]
  }

  // Check if we have a checkKeys override
  var checkKeys = typeof options.checkKeys == 'boolean' ? options.checkKeys : false;

  // Execute the write command
  self.db.command(write_command
    , { connection:connection
      , checkKeys: checkKeys
      , serializeFunctions: serializeFunctions
      , writeCommand: true }
    , function(err, result) { 
      if(errorOptions.w == 0 && typeof callback == 'function') return callback(null, null);
      if(errorOptions.w == 0) return;
      if(callback == null) return;

      if(errorOptions.w == 0 && typeof callback == 'function') return callback(null, null);
      if(errorOptions.w == 0) return;
      if(callback == null) return;
      if(err != null) {
        return callback(err, null);
      }

      // Result has an error
      if(!result.ok || Array.isArray(result.writeErrors) && result.writeErrors.length > 0) {
        var error = utils.toError(result.writeErrors[0].errmsg);
        error.code = result.writeErrors[0].code;
        error.err = result.writeErrors[0].errmsg;        
        return callback(error, null);
      }
      
      // Backward compatibility format
      var r = backWardsCompatibiltyResults(result, 'update');
      // Return the results for a whole batch
      callback(null, r.n, r)
  });
}

var backWardsCompatibiltyResults = function(result, op) {
  // Upserted
  var upsertedValue = null;
  var finalResult = null;
  var updatedExisting = true;

  // We have a single document upserted result
  if(Array.isArray(result.upserted) || result.upserted != null) {
    updatedExisting = false;
    upsertedValue = result.upserted;
  }

  // Final result
  if(op == 'remove' || op == 'insert') {
    finalResult = {ok: true, n: result.n}
  } else {
    finalResult = {ok: true, n: result.n, updatedExisting: updatedExisting}
  }

  if(upsertedValue != null) finalResult.upserted = upsertedValue;
  return finalResult;
}

var handleWriteResults = function handleWriteResults(callback) {
  return function(err, error) {
    documents = error && error.documents;
    if(!callback) return;
    // We have an error
    if(err) return callback(err, null);
    // If no document something is terribly wrong
    if(error == null) return callback(utils.toError("MongoDB did not return a response"));
    // Handle the case where no result was returned
    if(error != null && documents == null) {
      if(typeof error.err == 'string') {
        return callback(utils.toError(error.err));  
      } else if(typeof error.errmsg == 'string') {
        return callback(utils.toError(error.errmsg));          
      } else {
        return callback(utils.toError("Unknown MongoDB error"));
      }
    }

    // Handler normal cases
    if(documents[0].err || documents[0].errmsg) {
      callback(utils.toError(documents[0]));
    } else if(documents[0].jnote || documents[0].wtimeout) {
      callback(utils.toError(documents[0]));
    } else {
      callback(err, documents);
    }
  }
}

var update = function update(selector, document, options, callback) {
  if('function' === typeof options) callback = options, options = null;
  if(options == null) options = {};
  if(!('function' === typeof callback)) callback = null;

  // Get a connection
  var connection = options.connection || this.db.serverConfig.checkoutWriter();
  var useLegacyOps = options.useLegacyOps == null || options.useLegacyOps == false ? false : true;
  // If we support write commands let's perform the insert using it  
  if(!useLegacyOps && hasWriteCommands(connection) && !Buffer.isBuffer(selector) && !Buffer.isBuffer(document)) {
    return updateWithWriteCommands(this, selector, document, options, callback);
  }

  // DbName
  var dbName = options['dbName'];
  // If no dbname defined use the db one
  if(dbName == null) {
    dbName = this.db.databaseName;
  }

  // If we are not providing a selector or document throw
  if(selector == null || typeof selector != 'object') return callback(new Error("selector must be a valid JavaScript object"));
  if(document == null || typeof document != 'object') return callback(new Error("document must be a valid JavaScript object"));

  // Either use override on the function, or go back to default on either the collection
  // level or db
  if(options['serializeFunctions'] != null) {
    options['serializeFunctions'] = options['serializeFunctions'];
  } else {
    options['serializeFunctions'] = this.serializeFunctions;
  }

  // Build the options command
  var updateCommand = new UpdateCommand(
      this.db
    , dbName + "." + this.collectionName
    , selector
    , document
    , options);

  var self = this;
  // Unpack the error options if any
  var errorOptions = shared._getWriteConcern(this, options);
  // If safe is defined check for error message
  if(shared._hasWriteConcern(errorOptions) && typeof callback == 'function') {
    // Insert options
    var commandOptions = {};
    // Set safe option
    commandOptions['safe'] = errorOptions;
    // If we have an error option
    if(typeof errorOptions == 'object') {
      var keys = Object.keys(errorOptions);
      for(var i = 0; i < keys.length; i++) {
        commandOptions[keys[i]] = errorOptions[keys[i]];
      }
    }

    // If we have a passed in connection use it
    if(options.connection) {
      commandOptions.connection = options.connection;
    }

    // Execute command with safe options (rolls up both command and safe command into one and executes them on the same connection)
    this.db._executeUpdateCommand(updateCommand, commandOptions, handleWriteResults(function(err, error) {
      if(err) return callback(err, null);
      callback(null, error[0].n, error[0]);
    }));
  } else if(shared._hasWriteConcern(errorOptions) && callback == null) {
    throw new Error("Cannot use a writeConcern without a provided callback");
  } else {
    // Execute update
    var result = this.db._executeUpdateCommand(updateCommand);
    // If no callback just return
    if (!callback) return;
    // If error return error
    if (result instanceof Error) {
      return callback(result);
    }
    
    // Otherwise just return
    return callback();
  }
};

// ***************************************************
// findAndModify function
// ***************************************************
var findAndModify = function findAndModify (query, sort, doc, options, callback) {
  var args = Array.prototype.slice.call(arguments, 1);
  callback = args.pop();
  sort = args.length ? args.shift() || [] : [];
  doc = args.length ? args.shift() : null;
  options = args.length ? args.shift() || {} : {};
  var self = this;

  var queryObject = {
      'findandmodify': this.collectionName
    , 'query': query
    , 'sort': utils.formattedOrderClause(sort)
  };

  queryObject.new = options.new ? 1 : 0;
  queryObject.remove = options.remove ? 1 : 0;
  queryObject.upsert = options.upsert ? 1 : 0;

  if (options.fields) {
    queryObject.fields = options.fields;
  }

  if (doc && !options.remove) {
    queryObject.update = doc;
  }

  // Checkout a write connection
  options.connection = self.db.serverConfig.checkoutWriter();  

  // Either use override on the function, or go back to default on either the collection
  // level or db
  if(options['serializeFunctions'] != null) {
    options['serializeFunctions'] = options['serializeFunctions'];
  } else {
    options['serializeFunctions'] = this.serializeFunctions;
  }

  // No check on the documents
  options.checkKeys = false

  // Execute the command
  this.db.command(queryObject
    , options, function(err, result) {
      if(err) return callback(err, null);
      return callback(null, result.value, result);
  });
}

// ***************************************************
// findAndRemove function
// ***************************************************
var findAndRemove = function(query, sort, options, callback) {
  var args = Array.prototype.slice.call(arguments, 1);
  callback = args.pop();
  sort = args.length ? args.shift() || [] : [];
  options = args.length ? args.shift() || {} : {};
  // Add the remove option
  options['remove'] = true;
  // Execute the callback
  this.findAndModify(query, sort, null, options, callback);
}

// Map methods
exports.insert = insert;
exports.remove = remove;
exports.save = save;
exports.update = update;
exports.findAndModify = findAndModify;
exports.findAndRemove = findAndRemove;