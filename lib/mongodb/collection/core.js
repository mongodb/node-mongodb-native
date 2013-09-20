var InsertCommand = require('../commands/insert_command').InsertCommand
  , DeleteCommand = require('../commands/delete_command').DeleteCommand
  , UpdateCommand = require('../commands/update_command').UpdateCommand
  , DbCommand = require('../commands/db_command').DbCommand
  , utils = require('../utils')
  , shared = require('./shared');

/**
 * Precompiled regexes
 * @ignore
 **/
const eErrorMessages = /No matching object found/;

// ***************************************************
// Insert function
// ***************************************************
var insert = function insert (docs, options, callback) {
  if ('function' === typeof options) callback = options, options = {};
  if(options == null) options = {};
  if(!('function' === typeof callback)) callback = null;
  var self = this;
  insertAll(self, Array.isArray(docs) ? docs : [docs], options, callback);
  return this;
};

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
  var errorOptions = shared._getWriteConcern(self, options, callback);
  // Default command options
  var commandOptions = {};
  // If safe is defined check for error message
  if(shared._hasWriteConcern(errorOptions) && typeof callback == 'function') {
    // Insert options
    commandOptions['read'] = false;
    // If we have safe set set async to false
    if(errorOptions == null) commandOptions['async'] = true;

    // Set safe option
    commandOptions['safe'] = errorOptions;
    // If we have an error option
    if(typeof errorOptions == 'object') {
      var keys = Object.keys(errorOptions);
      for(var i = 0; i < keys.length; i++) {
        commandOptions[keys[i]] = errorOptions[keys[i]];
      }
    }

    // Execute command with safe options (rolls up both command and safe command into one and executes them on the same connection)
    self.db._executeInsertCommand(insertCommand, commandOptions, function (err, error) {
      error = error && error.documents;
      if(!callback) return;

      if (err) {
        callback(err);
      } else if(error[0].err || error[0].errmsg) {
        callback(utils.toError(error[0]));
      } else {
        callback(null, docs);
      }
    });
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
var remove = function remove(selector, options, callback) {
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
  var errorOptions = shared._getWriteConcern(self, options, callback);
  // Execute the command, do not add a callback as it's async
  if(shared._hasWriteConcern(errorOptions) && typeof callback == 'function') {
    // Insert options
    var commandOptions = {read:false};
    // If we have safe set set async to false
    if(errorOptions == null) commandOptions['async'] = true;
    // Set safe option
    commandOptions['safe'] = true;
    // If we have an error option
    if(typeof errorOptions == 'object') {
      var keys = Object.keys(errorOptions);
      for(var i = 0; i < keys.length; i++) {
        commandOptions[keys[i]] = errorOptions[keys[i]];
      }
    }

    // Execute command with safe options (rolls up both command and safe command into one and executes them on the same connection)
    this.db._executeRemoveCommand(deleteCommand, commandOptions, function (err, error) {
      error = error && error.documents;
      if(!callback) return;

      if(err) {
        callback(err);
      } else if(error[0].err || error[0].errmsg) {
        callback(utils.toError(error[0]));
      } else {
        callback(null, error[0].n);
      }
    });
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
  var commandOptions = shared._getWriteConcern(this, options, callback);

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
// Save function
// ***************************************************
var update = function update(selector, document, options, callback) {
  if('function' === typeof options) callback = options, options = null;
  if(options == null) options = {};
  if(!('function' === typeof callback)) callback = null;

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
  var errorOptions = shared._getWriteConcern(this, options, callback);
  // If safe is defined check for error message
  if(shared._hasWriteConcern(errorOptions) && typeof callback == 'function') {
    // Insert options
    var commandOptions = {read:false};
    // If we have safe set set async to false
    if(errorOptions == null) commandOptions['async'] = true;
    // Set safe option
    commandOptions['safe'] = errorOptions;
    // If we have an error option
    if(typeof errorOptions == 'object') {
      var keys = Object.keys(errorOptions);
      for(var i = 0; i < keys.length; i++) {
        commandOptions[keys[i]] = errorOptions[keys[i]];
      }
    }

    // Execute command with safe options (rolls up both command and safe command into one and executes them on the same connection)
    this.db._executeUpdateCommand(updateCommand, commandOptions, function (err, error) {
      error = error && error.documents;
      if(!callback) return;

      if(err) {
        callback(err);
      } else if(error[0].err || error[0].errmsg) {
        callback(utils.toError(error[0]));
      } else {
        // Perform the callback
        callback(null, error[0].n, error[0]);
      }
    });
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

  // Either use override on the function, or go back to default on either the collection
  // level or db
  if(options['serializeFunctions'] != null) {
    options['serializeFunctions'] = options['serializeFunctions'];
  } else {
    options['serializeFunctions'] = this.serializeFunctions;
  }

  // Only run command and rely on getLastError command
  var command = DbCommand.createDbCommand(this.db, queryObject, options)
  // Execute command
  this.db._executeQueryCommand(command
    , {read:false}, utils.handleSingleCommandResultReturn(null, null, function(err, result) {
      if(err) return callback(err, null);
      return callback(null, result.value, result[0]);
    }));
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