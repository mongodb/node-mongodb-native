require("../crypto/md5");

sys = require("sys");

/**
  Db Command
**/
DbCommand = function(collectionName, queryOptions, numberToSkip, numberToReturn, query, returnFieldSelector) {
  this.collectionName = collectionName;
  this.queryOptions = queryOptions;
  this.numberToSkip = numberToSkip;
  this.numberToReturn = numberToReturn;
  this.query = query;
  this.returnFieldSelector = returnFieldSelector;
}

// Constants
DbCommand.SYSTEM_NAMESPACE_COLLECTION = "system.namespaces";
DbCommand.SYSTEM_INDEX_COLLECTION = "system.indexes";
DbCommand.SYSTEM_PROFILE_COLLECTION = "system.profile";
DbCommand.SYSTEM_USER_COLLECTION = "system.users";
DbCommand.SYSTEM_COMMAND_COLLECTION = "$cmd";

// Inherit rom Query Command
DbCommand.prototype = new QueryCommand();

// Provide constructors for different db commands
DbCommand.createIsMasterCommand = function(databaseName) {
  return new DbCommand(databaseName + "." + DbCommand.SYSTEM_COMMAND_COLLECTION, QueryCommand.OPTS_NO_CURSOR_TIMEOUT, 0, -1, new OrderedHash().add('ismaster', 1), null);
}

DbCommand.createCollectionInfoCommand = function(databaseName, selector) {
  return new DbCommand(databaseName + "." + DbCommand.SYSTEM_NAMESPACE_COLLECTION, QueryCommand.OPTS_NO_CURSOR_TIMEOUT, 0, 0, selector, null);  
}

DbCommand.createGetNonceCommand = function(databaseName) {
  return new DbCommand(databaseName + "." + DbCommand.SYSTEM_COMMAND_COLLECTION, QueryCommand.OPTS_NO_CURSOR_TIMEOUT, 0, -1, new OrderedHash().add('getnonce', 1), null);    
}

DbCommand.createAuthenticationCommand = function(databaseName, username, password, nonce) {
  // Generate keys used for authentication
  var hash_password = MD5.hex_md5(username + ":mongo:" + password);
  var key = MD5.hex_md5(nonce + username + hash_password);
  var selector = new OrderedHash().add('authenticate', 1).add('user', username).add('nonce', nonce).add('key', key);
  // Create db command
  return new DbCommand(databaseName + "." + DbCommand.SYSTEM_COMMAND_COLLECTION, QueryCommand.OPTS_NO_CURSOR_TIMEOUT, 0, -1, selector, null);      
}

DbCommand.createLogoutCommand = function(databaseName) {
  return new DbCommand(databaseName + "." + DbCommand.SYSTEM_COMMAND_COLLECTION, QueryCommand.OPTS_NO_CURSOR_TIMEOUT, 0, -1, new OrderedHash().add('logout', 1), null);        
}

DbCommand.createCreateCollectionCommand = function(databaseName, collectionName) {
  return new DbCommand(databaseName + "." + DbCommand.SYSTEM_COMMAND_COLLECTION, QueryCommand.OPTS_NO_CURSOR_TIMEOUT, 0, -1, new OrderedHash().add('create', collectionName), null);          
}

DbCommand.createDropCollectionCommand = function(databaseName, collectionName) {
  return new DbCommand(databaseName + "." + DbCommand.SYSTEM_COMMAND_COLLECTION, QueryCommand.OPTS_NO_CURSOR_TIMEOUT, 0, -1, new OrderedHash().add('drop', collectionName), null);              
}

DbCommand.createRenameCollectionCommand = function(databaseName, fromCollectionName, toCollectionName) {
  return new DbCommand("admin." + DbCommand.SYSTEM_COMMAND_COLLECTION, QueryCommand.OPTS_NO_CURSOR_TIMEOUT, 0, -1, new OrderedHash().add('renameCollection', databaseName + "." + fromCollectionName).add('to', databaseName + "." + toCollectionName), null);                
}

DbCommand.createGetLastErrorCommand = function(databaseName) {
  return new DbCommand(databaseName + "." + DbCommand.SYSTEM_COMMAND_COLLECTION, QueryCommand.OPTS_NO_CURSOR_TIMEOUT, 0, -1, new OrderedHash().add('getlasterror', 1), null);              
}

DbCommand.createGetLastStatusCommand = function(databaseName) {
  return new DbCommand(databaseName + "." + DbCommand.SYSTEM_COMMAND_COLLECTION, QueryCommand.OPTS_NO_CURSOR_TIMEOUT, 0, -1, new OrderedHash().add('getlasterror', 1), null);              
}

DbCommand.createGetPreviousErrorsCommand = function(databaseName) {
  return new DbCommand(databaseName + "." + DbCommand.SYSTEM_COMMAND_COLLECTION, QueryCommand.OPTS_NO_CURSOR_TIMEOUT, 0, -1, new OrderedHash().add('getpreverror', 1), null);                
}

DbCommand.createResetErrorHistoryCommand = function(databaseName) {
  return new DbCommand(databaseName + "." + DbCommand.SYSTEM_COMMAND_COLLECTION, QueryCommand.OPTS_NO_CURSOR_TIMEOUT, 0, -1, new OrderedHash().add('reseterror', 1), null);                
}

DbCommand.createCreateIndexCommand = function(databaseName, collectionName, fieldOrSpec, unique) {  
}

DbCommand.createDropIndexCommand = function(databaseName, collectionName, indexName) {  
  return new DbCommand(databaseName + "." + DbCommand.SYSTEM_COMMAND_COLLECTION, QueryCommand.OPTS_NO_CURSOR_TIMEOUT, 0, -1, new OrderedHash().add('deleteIndexes', collectionName).add('index', indexName), null);                
}

DbCommand.createIndexInformationCommand = function(databaseName, collectionName) {  
}

DbCommand.createDropDatabaseCommand = function(databaseName) {
  return new DbCommand(databaseName + "." + DbCommand.SYSTEM_COMMAND_COLLECTION, QueryCommand.OPTS_NO_CURSOR_TIMEOUT, 0, -1, new OrderedHash().add('dropDatabase', 1), null);                  
}











