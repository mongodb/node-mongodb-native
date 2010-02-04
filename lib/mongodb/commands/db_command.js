var mongo = require('mongodb/commands/query_command');
process.mixin(mongo, require('mongodb/bson/collections'));
process.mixin(mongo, require('mongodb/commands/insert_command'));
require("../crypto/md5");

sys = require("sys");

/**
  Db Command
**/
exports.DbCommand = mongo.QueryCommand.extend({
  init: function(collectionName, queryOptions, numberToSkip, numberToReturn, query, returnFieldSelector) {
    this.collectionName = collectionName;
    this.queryOptions = queryOptions;
    this.numberToSkip = numberToSkip;
    this.numberToReturn = numberToReturn;
    this.query = query;
    this.returnFieldSelector = returnFieldSelector;
  }
})

// Constants
exports.DbCommand.SYSTEM_NAMESPACE_COLLECTION = "system.namespaces";
exports.DbCommand.SYSTEM_INDEX_COLLECTION = "system.indexes";
exports.DbCommand.SYSTEM_PROFILE_COLLECTION = "system.profile";
exports.DbCommand.SYSTEM_USER_COLLECTION = "system.users";
exports.DbCommand.SYSTEM_COMMAND_COLLECTION = "$cmd";

// Provide constructors for different db commands
exports.DbCommand.createIsMasterCommand = function(databaseName) {
  return new exports.DbCommand(databaseName + "." + exports.DbCommand.SYSTEM_COMMAND_COLLECTION, mongo.QueryCommand.OPTS_NO_CURSOR_TIMEOUT, 0, -1, new mongo.OrderedHash().add('ismaster', 1), null);
}

exports.DbCommand.createCollectionInfoCommand = function(databaseName, selector) {
  return new exports.DbCommand(databaseName + "." + exports.DbCommand.SYSTEM_NAMESPACE_COLLECTION, mongo.QueryCommand.OPTS_NO_CURSOR_TIMEOUT, 0, 0, selector, null);  
}

exports.DbCommand.createGetNonceCommand = function(databaseName) {
  return new exports.DbCommand(databaseName + "." + exports.DbCommand.SYSTEM_COMMAND_COLLECTION, mongo.QueryCommand.OPTS_NO_CURSOR_TIMEOUT, 0, -1, new mongo.OrderedHash().add('getnonce', 1), null);    
}

exports.DbCommand.createAuthenticationCommand = function(databaseName, username, password, nonce) {
  // Generate keys used for authentication
  var hash_password = MD5.hex_md5(username + ":mongo:" + password);
  var key = MD5.hex_md5(nonce + username + hash_password);
  var selector = new mongo.OrderedHash().add('authenticate', 1).add('user', username).add('nonce', nonce).add('key', key);
  // Create db command
  return new exports.DbCommand(databaseName + "." + exports.DbCommand.SYSTEM_COMMAND_COLLECTION, mongo.QueryCommand.OPTS_NO_CURSOR_TIMEOUT, 0, -1, selector, null);      
}

exports.DbCommand.createLogoutCommand = function(databaseName) {
  return new exports.DbCommand(databaseName + "." + exports.DbCommand.SYSTEM_COMMAND_COLLECTION, mongo.QueryCommand.OPTS_NO_CURSOR_TIMEOUT, 0, -1, new mongo.OrderedHash().add('logout', 1), null);        
}

exports.DbCommand.createCreateCollectionCommand = function(databaseName, collectionName, options) {
  var selector = new mongo.OrderedHash().add('create', collectionName);
  // Modify the options to ensure correct behaviour
  for(var name in options) {
    if(options[name] != null && options[name].constructor != Function) selector.add(name, options[name]);
  }
  // Execute the command
  return new exports.DbCommand(databaseName + "." + exports.DbCommand.SYSTEM_COMMAND_COLLECTION, mongo.QueryCommand.OPTS_NO_CURSOR_TIMEOUT, 0, -1, selector, null);          
}

exports.DbCommand.createDropCollectionCommand = function(databaseName, collectionName) {
  return new exports.DbCommand(databaseName + "." + exports.DbCommand.SYSTEM_COMMAND_COLLECTION, mongo.QueryCommand.OPTS_NO_CURSOR_TIMEOUT, 0, -1, new mongo.OrderedHash().add('drop', collectionName), null);              
}

exports.DbCommand.createRenameCollectionCommand = function(databaseName, fromCollectionName, toCollectionName) {
  return new exports.DbCommand("admin." + exports.DbCommand.SYSTEM_COMMAND_COLLECTION, mongo.QueryCommand.OPTS_NO_CURSOR_TIMEOUT, 0, -1, new mongo.OrderedHash().add('renameCollection', databaseName + "." + fromCollectionName).add('to', databaseName + "." + toCollectionName), null);                
}

exports.DbCommand.createGetLastErrorCommand = function(databaseName) {
  return new exports.DbCommand(databaseName + "." + exports.DbCommand.SYSTEM_COMMAND_COLLECTION, mongo.QueryCommand.OPTS_NO_CURSOR_TIMEOUT, 0, -1, new mongo.OrderedHash().add('getlasterror', 1), null);              
}

exports.DbCommand.createGetLastStatusCommand = function(databaseName) {
  return new exports.DbCommand(databaseName + "." + exports.DbCommand.SYSTEM_COMMAND_COLLECTION, mongo.QueryCommand.OPTS_NO_CURSOR_TIMEOUT, 0, -1, new mongo.OrderedHash().add('getlasterror', 1), null);              
}

exports.DbCommand.createGetPreviousErrorsCommand = function(databaseName) {
  return new exports.DbCommand(databaseName + "." + exports.DbCommand.SYSTEM_COMMAND_COLLECTION, mongo.QueryCommand.OPTS_NO_CURSOR_TIMEOUT, 0, -1, new mongo.OrderedHash().add('getpreverror', 1), null);                
}

exports.DbCommand.createResetErrorHistoryCommand = function(databaseName) {
  return new exports.DbCommand(databaseName + "." + exports.DbCommand.SYSTEM_COMMAND_COLLECTION, mongo.QueryCommand.OPTS_NO_CURSOR_TIMEOUT, 0, -1, new mongo.OrderedHash().add('reseterror', 1), null);                
}

exports.DbCommand.createCreateIndexCommand = function(databaseName, collectionName, fieldOrSpec, unique) {  
  var finalUnique = unique == null ? false : unique;
  var fieldHash = new mongo.OrderedHash();
  var finalFieldOrSpec = fieldOrSpec.constructor == String ? [[fieldOrSpec, 1]] : fieldOrSpec;
  var indexes = [];
  
  // Get all the fields
  finalFieldOrSpec.forEach(function(indexArray) {
    var indexArrayFinal = indexArray;
    if(indexArrayFinal.length == 1) indexArrayFinal[1] = 1;
    fieldHash.add(indexArrayFinal[0], indexArrayFinal[1]);
    indexes.push(indexArrayFinal[0] + "_" + indexArrayFinal[1]);
  });
  // Generate the index name
  var indexName = indexes.join("_");
  // Build the selector
  var selector = {'ns':(databaseName + "." + collectionName), 'unique':finalUnique, 'key':fieldHash, 'name':indexName};
  // Create the insert command for the index and return the document
  return new mongo.InsertCommand(databaseName + "." + exports.DbCommand.SYSTEM_INDEX_COLLECTION, false).add(selector);
}

exports.DbCommand.createDropIndexCommand = function(databaseName, collectionName, indexName) {  
  return new exports.DbCommand(databaseName + "." + exports.DbCommand.SYSTEM_COMMAND_COLLECTION, mongo.QueryCommand.OPTS_NO_CURSOR_TIMEOUT, 0, -1, new mongo.OrderedHash().add('deleteIndexes', collectionName).add('index', indexName), null);                
}

exports.DbCommand.createDropDatabaseCommand = function(databaseName) {
  return new exports.DbCommand(databaseName + "." + exports.DbCommand.SYSTEM_COMMAND_COLLECTION, mongo.QueryCommand.OPTS_NO_CURSOR_TIMEOUT, 0, -1, new mongo.OrderedHash().add('dropDatabase', 1), null);                  
}

exports.DbCommand.createDbCommand = function(databaseName, command_hash) {
  return new exports.DbCommand(databaseName + "." + exports.DbCommand.SYSTEM_COMMAND_COLLECTION, mongo.QueryCommand.OPTS_NO_CURSOR_TIMEOUT, 0, -1, (command_hash instanceof mongo.OrderedHash ? command_hash : new mongo.OrderedHash(command_hash)), null);                    
}











