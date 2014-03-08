var QueryCommand = require('./query_command').QueryCommand,
  InsertCommand = require('./insert_command').InsertCommand,
  inherits = require('util').inherits,
  utils = require('../utils'),
  crypto = require('crypto');

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

  // Set the slave ok bit
  if(this.db && this.db.slaveOk) {
    this.queryOptions |= QueryCommand.OPTS_SLAVE;
  }

  // Make sure we don't get a null exception
  options = options == null ? {} : options;

  // Allow for overriding the BSON checkKeys function
  this.checkKeys = typeof options['checkKeys'] == 'boolean' ? options["checkKeys"] : true;

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
DbCommand.SYSTEM_JS_COLLECTION = "system.js";

// New commands
DbCommand.NcreateIsMasterCommand = function(db, databaseName) {
  return new DbCommand(db, databaseName + "." + DbCommand.SYSTEM_COMMAND_COLLECTION, QueryCommand.OPTS_NO_CURSOR_TIMEOUT, 0, -1, {'ismaster':1}, null);
};

// Provide constructors for different db commands
DbCommand.createIsMasterCommand = function(db) {
  return new DbCommand(db, db.databaseName + "." + DbCommand.SYSTEM_COMMAND_COLLECTION, QueryCommand.OPTS_NO_CURSOR_TIMEOUT, 0, -1, {'ismaster':1}, null);
};

DbCommand.createGetLastErrorCommand = function(options, db) {
  if (typeof db === 'undefined') {
    db =  options;
    options = {};
  }
  // Final command
  var command = {'getlasterror':1};
  // If we have an options Object let's merge in the fields (fsync/wtimeout/w)
  if('object' === typeof options) {
    for(var name in options) {
      command[name] = options[name]
    }
  }

  // Special case for w == 1, remove the w
  if(1 == command.w) {
    delete command.w;
  }

  // Execute command
  return new DbCommand(db, db.databaseName + "." + DbCommand.SYSTEM_COMMAND_COLLECTION, QueryCommand.OPTS_NO_CURSOR_TIMEOUT, 0, -1, command, null);
};

DbCommand.createGetLastStatusCommand = DbCommand.createGetLastErrorCommand;

DbCommand.createDbCommand = function(db, command_hash, options, auth_db) {
  var db_name = (auth_db ? auth_db : db.databaseName) + "." + DbCommand.SYSTEM_COMMAND_COLLECTION;
  options = options == null ? {checkKeys: false} : options;
  return new DbCommand(db, db_name, QueryCommand.OPTS_NO_CURSOR_TIMEOUT, 0, -1, command_hash, null, options);
};

DbCommand.createAdminDbCommand = function(db, command_hash) {
  return new DbCommand(db, "admin." + DbCommand.SYSTEM_COMMAND_COLLECTION, QueryCommand.OPTS_NO_CURSOR_TIMEOUT, 0, -1, command_hash, null);
};

DbCommand.createAdminDbCommandSlaveOk = function(db, command_hash) {
  return new DbCommand(db, "admin." + DbCommand.SYSTEM_COMMAND_COLLECTION, QueryCommand.OPTS_NO_CURSOR_TIMEOUT | QueryCommand.OPTS_SLAVE, 0, -1, command_hash, null);
};

DbCommand.createDbSlaveOkCommand = function(db, command_hash, options) {
  options = options == null ? {checkKeys: false} : options;
  var dbName = options.dbName ? options.dbName : db.databaseName;
  var flags = options.slaveOk ? QueryCommand.OPTS_NO_CURSOR_TIMEOUT | QueryCommand.OPTS_SLAVE : QueryCommand.OPTS_NO_CURSOR_TIMEOUT;
  return new DbCommand(db, dbName + "." + DbCommand.SYSTEM_COMMAND_COLLECTION, flags, 0, -1, command_hash, null, options);
};
