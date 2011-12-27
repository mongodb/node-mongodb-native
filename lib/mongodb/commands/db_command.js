var QueryCommand = require('./query_command').QueryCommand,
  InsertCommand = require('./insert_command').InsertCommand,
  inherits = require('util').inherits,
  debug = require('util').debug,
  crypto = require('crypto'),
  inspect = require('util').inspect;

/**
  Db Command
**/
var DbCommand = exports.DbCommand = function(dbInstance, collectionName, queryOptions, numberToSkip, numberToReturn, query, returnFieldSelector, options) {
  QueryCommand.call(this);
  this.collectionName = collectionName;
  this.queryOptions = queryOptions;
  this.numberToSkip = numberToSkip;
  this.numberToReturn = numberToReturn;
  this.query = query;
  this.returnFieldSelector = returnFieldSelector;
  this.db = dbInstance;

  // Make sure we don't get a null exception
  options = options == null ? {} : options;
  // Let us defined on a command basis if we want functions to be serialized or not
  if(options['serializeFunctions'] != null && options['serializeFunctions']) {
    this.serializeFunctions = true;
  }
};

inherits(DbCommand, QueryCommand);

// Constants
DbCommand.SYSTEM_NAMESPACE_COLLECTION = "system.namespaces";
DbCommand.SYSTEM_INDEX_COLLECTION = "system.indexes";
DbCommand.SYSTEM_PROFILE_COLLECTION = "system.profile";
DbCommand.SYSTEM_USER_COLLECTION = "system.users";
DbCommand.SYSTEM_COMMAND_COLLECTION = "$cmd";

// New commands
DbCommand.NcreateIsMasterCommand = function(db, databaseName) {
  return new DbCommand(db, databaseName + "." + DbCommand.SYSTEM_COMMAND_COLLECTION, QueryCommand.OPTS_NO_CURSOR_TIMEOUT, 0, -1, {'ismaster':1}, null);
};

// Provide constructors for different db commands
DbCommand.createIsMasterCommand = function(db) {
  return new DbCommand(db, db.databaseName + "." + DbCommand.SYSTEM_COMMAND_COLLECTION, QueryCommand.OPTS_NO_CURSOR_TIMEOUT, 0, -1, {'ismaster':1}, null);
};

DbCommand.createCollectionInfoCommand = function(db, selector) {
  return new DbCommand(db, db.databaseName + "." + DbCommand.SYSTEM_NAMESPACE_COLLECTION, QueryCommand.OPTS_NO_CURSOR_TIMEOUT, 0, 0, selector, null);
};

DbCommand.createGetNonceCommand = function(db) {
  return new DbCommand(db, db.databaseName + "." + DbCommand.SYSTEM_COMMAND_COLLECTION, QueryCommand.OPTS_NO_CURSOR_TIMEOUT, 0, -1, {'getnonce':1}, null);
};

DbCommand.createAuthenticationCommand = function(db, username, password, nonce) {
  // Use node md5 generator
  var md5 = crypto.createHash('md5');
  // Generate keys used for authentication
  md5.update(username + ":mongo:" + password);
  var hash_password = md5.digest('hex');
  // Final key
  md5 = crypto.createHash('md5');
  md5.update(nonce + username + hash_password);
  var key = md5.digest('hex');  
  // Creat selector
  var selector = {'authenticate':1, 'user':username, 'nonce':nonce, 'key':key};
  // Create db command
  return new DbCommand(db, db.databaseName + "." + DbCommand.SYSTEM_COMMAND_COLLECTION, QueryCommand.OPTS_NONE, 0, -1, selector, null);
};

DbCommand.createLogoutCommand = function(db) {
  return new DbCommand(db, db.databaseName + "." + DbCommand.SYSTEM_COMMAND_COLLECTION, QueryCommand.OPTS_NO_CURSOR_TIMEOUT, 0, -1, {'logout':1}, null);
};

DbCommand.createCreateCollectionCommand = function(db, collectionName, options) {
  var selector = {'create':collectionName};
  // Modify the options to ensure correct behaviour
  for(var name in options) {
    if(options[name] != null && options[name].constructor != Function) selector[name] = options[name];
  }
  // Execute the command
  return new DbCommand(db, db.databaseName + "." + DbCommand.SYSTEM_COMMAND_COLLECTION, QueryCommand.OPTS_NO_CURSOR_TIMEOUT, 0, -1, selector, null);
};

DbCommand.createDropCollectionCommand = function(db, collectionName) {
  return new DbCommand(db, db.databaseName + "." + DbCommand.SYSTEM_COMMAND_COLLECTION, QueryCommand.OPTS_NO_CURSOR_TIMEOUT, 0, -1, {'drop':collectionName}, null);
};

DbCommand.createRenameCollectionCommand = function(db, fromCollectionName, toCollectionName) {
  var renameCollection = db.databaseName + "." + fromCollectionName;
  var toCollection = db.databaseName + "." + toCollectionName;
  return new DbCommand(db, "admin." + DbCommand.SYSTEM_COMMAND_COLLECTION, QueryCommand.OPTS_NO_CURSOR_TIMEOUT, 0, -1, {'renameCollection':renameCollection, 'to':toCollection}, null);
};

DbCommand.createGetLastErrorCommand = function(options, db) {
  var args = Array.prototype.slice.call(arguments, 0);
  db = args.pop();
  options = args.length ? args.shift() : {};
  // Final command 
  var command = {'getlasterror':1};
  // If we have an options Object let's merge in the fields (fsync/wtimeout/w)
  if('object' === typeof options) {
    for(var name in options) {
      command[name] = options[name]
    }
  }
  
  // Execute command
  return new DbCommand(db, db.databaseName + "." + DbCommand.SYSTEM_COMMAND_COLLECTION, QueryCommand.OPTS_NO_CURSOR_TIMEOUT, 0, -1, command, null);
};

DbCommand.createGetLastStatusCommand = DbCommand.createGetLastErrorCommand;

DbCommand.createGetPreviousErrorsCommand = function(db) {
  return new DbCommand(db, db.databaseName + "." + DbCommand.SYSTEM_COMMAND_COLLECTION, QueryCommand.OPTS_NO_CURSOR_TIMEOUT, 0, -1, {'getpreverror':1}, null);
};

DbCommand.createResetErrorHistoryCommand = function(db) {
  return new DbCommand(db, db.databaseName + "." + DbCommand.SYSTEM_COMMAND_COLLECTION, QueryCommand.OPTS_NO_CURSOR_TIMEOUT, 0, -1, {'reseterror':1}, null);
};

DbCommand.createCreateIndexCommand = function(db, collectionName, fieldOrSpec, options) {
  var finalUnique = options == null || 'object' === typeof options ? false : options;
  var fieldHash = {};
  var indexes = [];
  var keys;
  var sparse;
  var background;
  var geoMin, geoMax;
  
  // If the options is a hash
  if(options != null && 'object' === typeof options) {
    finalUnique = options['unique'] != null ? options['unique'] : false;
    sparse = options['sparse'] != null ? options['sparse'] : false;
    background = options['background'] != null ? options['background'] : false;
    geoMin = options['min'] != null ? options['min'] : null;
    geoMax = options['max'] != null ? options['max'] : null;
  }

  // Get all the fields accordingly
  if (fieldOrSpec.constructor === String) {             // 'type'
    indexes.push(fieldOrSpec + '_' + 1);
    fieldHash[fieldOrSpec] = 1;
  } else if (fieldOrSpec.constructor === Array) {       // [{location:'2d'}, ...]
    fieldOrSpec.forEach(function(f) {
      if (f.constructor === String) {                   // [{location:'2d'}, 'type']
        indexes.push(f + '_' + 1);
        fieldHash[f] = 1;
      } else if (f.constructor === Array) {             // [['location', '2d'],['type', 1]]
        indexes.push(f[0] + '_' + (f[1] || 1));
        fieldHash[f[0]] = f[1] || 1;
      } else if (f.constructor === Object) {            // [{location:'2d'}, {type:1}]
        keys = Object.keys(f);
        keys.forEach(function(k) {
          indexes.push(k + '_' + f[k]);
          fieldHash[k] = f[k];
      });
      } else {
        // undefined
      }
    });
  } else if (fieldOrSpec.constructor === Object) {  // {location:'2d', type:1}
    keys = Object.keys(fieldOrSpec);
    keys.forEach(function(key) {
      indexes.push(key + '_' + fieldOrSpec[key]);
      fieldHash[key] = fieldOrSpec[key];
    });
  } else {
    // undefined
  }
  
  // Generate the index name
  var indexName = indexes.join("_");

  // Build the selector
  var selector = {'ns':(db.databaseName + "." + collectionName), 'key':fieldHash, 'name':indexName};
  selector['unique'] = finalUnique;
  selector['sparse'] = sparse;
  selector['background'] = background;

  if (geoMin !== null) selector['min'] = geoMin;
  if (geoMax !== null) selector['max'] = geoMax;

  // Create the insert command for the index and return the document
  return new InsertCommand(db, db.databaseName + "." + DbCommand.SYSTEM_INDEX_COLLECTION, false).add(selector);
};

DbCommand.logoutCommand = function(db, command_hash) {
  return new DbCommand(db, db.databaseName + "." + DbCommand.SYSTEM_COMMAND_COLLECTION, QueryCommand.OPTS_NO_CURSOR_TIMEOUT, 0, -1, command_hash, null);
}

DbCommand.createDropIndexCommand = function(db, collectionName, indexName) {
  return new DbCommand(db, db.databaseName + "." + DbCommand.SYSTEM_COMMAND_COLLECTION, QueryCommand.OPTS_NO_CURSOR_TIMEOUT, 0, -1, {'deleteIndexes':collectionName, 'index':indexName}, null);
};

DbCommand.createDropDatabaseCommand = function(db) {
  return new DbCommand(db, db.databaseName + "." + DbCommand.SYSTEM_COMMAND_COLLECTION, QueryCommand.OPTS_NO_CURSOR_TIMEOUT, 0, -1, {'dropDatabase':1}, null);
};

DbCommand.createDbCommand = function(db, command_hash, options) {
  return new DbCommand(db, db.databaseName + "." + DbCommand.SYSTEM_COMMAND_COLLECTION, QueryCommand.OPTS_NO_CURSOR_TIMEOUT, 0, -1, command_hash, null, options);
};

DbCommand.createAdminDbCommand = function(db, command_hash) {
  return new DbCommand(db, "admin." + DbCommand.SYSTEM_COMMAND_COLLECTION, QueryCommand.OPTS_NO_CURSOR_TIMEOUT, 0, -1, command_hash, null);
};
