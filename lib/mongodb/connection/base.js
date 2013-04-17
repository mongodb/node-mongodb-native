var EventEmitter = require('events').EventEmitter
  , inherits = require('util').inherits;

var id = 0;

/**
 * Internal class for callback storage
 * @ignore
 */
var CallbackStore = function() {
  // Make class an event emitter
  EventEmitter.call(this);
  // Add a info about call variable
  this._notReplied = {};
  this.id = id++;
}

/**
 * Internal class for holding non-executed commands
 * @ignore
 */
var NonExecutedOperationStore = function(config) {  
  this.config = config;
  this.commands = {
      read: []
    , write_reads: []
    , write: []
  };
}

NonExecutedOperationStore.prototype.write = function(op) {
  this.commands.write.push(op);
}

NonExecutedOperationStore.prototype.read_from_writer = function(op) {  
  this.commands.write_reads.push(op);
}

NonExecutedOperationStore.prototype.read = function(op) {  
  this.commands.read.push(op);
}

NonExecutedOperationStore.prototype.execute_queries = function(executeInsertCommand) {
  // console.log("$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$ execute_queries :: " + this.commands.read.length)
  var connection = this.config.checkoutReader();
  if(connection == null || connection instanceof Error) return;
  // console.dir(connection)
  // console.log("$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$ EXECUTE")

  // Write out all the queries
  while(this.commands.read.length > 0) {
    // Get the next command
    var command = this.commands.read.shift();
    // // Remove any connection
    // if(command['options'] == null) command['options'] = {};
    // command['options'].connection = this.config.checkoutReader();
    command.options.connection = connection;
    // Execute the next command
    command.executeQueryCommand(command.db, command.db_command, command.options, command.callback);
  }
}

NonExecutedOperationStore.prototype.execute_writes = function() {
  // console.log("$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$ execute_writes :: " + this.commands.write_reads.length + " :: " + this.commands.write.length)
  var connection = this.config.checkoutWriter();
  // console.dir(connection)
  if(connection == null || connection instanceof Error) return;
  // console.log("$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$ EXECUTE")

  // Write out all the queries to the primary
  while(this.commands.write_reads.length > 0) {
    // Get the next command
    var command = this.commands.write_reads.shift();
    command.options.connection = connection;
    // Execute the next command
    command.executeQueryCommand(command.db, command.db_command, command.options, command.callback);
  }

  // Execute all write operations
  while(this.commands.write.length > 0) {
    // Get the next command
    var command = this.commands.write.shift();
    // // Remove any connection
    // if(command['options'] == null) command['options'] = {};
    // command['options'].connection = this.config.checkoutWriter();
    command.options.connection = connection;
    // Execute the next command
    command.executeInsertCommand(command.db, command.db_command, command.options, command.callback);
    // write_func(db, command['db_command'], command['options'], command['callback']);
  }  
}

/**
 * Internal class for authentication storage
 * @ignore
 */
var AuthStore = function() {
  this._auths = [];
}

AuthStore.prototype.add = function(authMechanism, dbName, username, password, authdbName) {
  // Check for duplicates
  if(!this.contains(dbName)) {
    // Base config
    var config = {
        'username':username
      , 'password':password
      , 'db': dbName
      , 'authMechanism': authMechanism
    };

    // Add auth source if passed in
    if(typeof authdbName == 'string') {
      config['authdb'] = authdbName;
    }

    // Push the config
    this._auths.push(config);
  }
}

AuthStore.prototype.contains = function(dbName) {
  for(var i = 0; i < this._auths.length; i++) {
    if(this._auths[i].db == dbName) return true;
  }

  return false;
}

AuthStore.prototype.remove = function(dbName) {
  var newAuths = [];

  // Filter out all the login details
  for(var i = 0; i < this._auths.length; i++) {
    if(this._auths[i].db != dbName) newAuths.push(this._auths[i]);
  }

  //  Set the filtered list
  this._auths = newAuths;
}

AuthStore.prototype.get = function(index) {
  return this._auths[index];
}

AuthStore.prototype.length = function() {
  return this._auths.length;
}

/**
 * @ignore
 */
inherits(CallbackStore, EventEmitter);

var Base = function Base() {  
  EventEmitter.call(this);

  // Callback store is part of connection specification
  if(Base._callBackStore == null) {
    Base._callBackStore = new CallbackStore();
  }

  // Create a new callback store  
  this._callBackStore = new CallbackStore();
  // All commands not being executed
  this._commandsStore = new NonExecutedOperationStore(this);
  // Create a new auth store
  this.auth = new AuthStore();
}

/**
 * @ignore
 */
inherits(Base, EventEmitter);

/**
 * Fire all the errors
 * @ignore
 */
Base.prototype.__executeAllCallbacksWithError = function(err) {
  // console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! __executeAllCallbacksWithError")
  // console.dir(err)
  // Check all callbacks
  var keys = Object.keys(this._callBackStore._notReplied);
  // For each key check if it's a callback that needs to be returned
  for(var j = 0; j < keys.length; j++) {
    var info = this._callBackStore._notReplied[keys[j]];
    // Check if we have a chained command (findAndModify)
    if(info && info['chained'] && Array.isArray(info['chained']) && info['chained'].length > 0) {
      var chained = info['chained'];
      // Only callback once and the last one is the right one
      var finalCallback = chained.pop();
      // Emit only the last event
      this._callBackStore.emit(finalCallback, err, null);

      // Put back the final callback to ensure we don't call all commands in the chain
      chained.push(finalCallback);

      // Remove all chained callbacks
      for(var i = 0; i < chained.length; i++) {
        delete this._callBackStore._notReplied[chained[i]];
      }
      // Remove the key
      delete this._callBackStore._notReplied[keys[j]];
    } else {
      this._callBackStore.emit(keys[j], err, null);
      // Remove the key
      delete this._callBackStore._notReplied[keys[j]];
    }
  }
}

/**
 * Fire all the errors
 * @ignore
 */
Base.prototype.__executeAllServerSpecificErrorCallbacks = function(host, port, err) {  
  // console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! __executeAllServerSpecificErrorCallbacks")
  // console.dir(err)
  // Check all callbacks
  var keys = Object.keys(this._callBackStore._notReplied);
  // For each key check if it's a callback that needs to be returned
  for(var j = 0; j < keys.length; j++) {
    var info = this._callBackStore._notReplied[keys[j]];

    if(info.connection) {
      // Unpack the connection settings
      var _host = info.connection.socketOptions.host;
      var _port = info.connection.socketOptions.port;
      // Check if we have a chained command (findAndModify)
      if(info && info['chained'] 
        && Array.isArray(info['chained']) 
        && info['chained'].length > 0
        && _port == port && _host == host) {
          var chained = info['chained'];
          // Only callback once and the last one is the right one
          var finalCallback = chained.pop();
          // Emit only the last event
          this._callBackStore.emit(finalCallback, err, null);

          // Put back the final callback to ensure we don't call all commands in the chain
          chained.push(finalCallback);

          // Remove all chained callbacks
          for(var i = 0; i < chained.length; i++) {
            delete this._callBackStore._notReplied[chained[i]];
          }
          // Remove the key
          delete this._callBackStore._notReplied[keys[j]];
      } else if(_port == port && _host == host) {
        this._callBackStore.emit(keys[j], err, null);
        // Remove the key
        delete this._callBackStore._notReplied[keys[j]];
      }      
    }
  }
}

/**
 * Register a handler
 * @ignore
 * @api private
 */
Base.prototype._registerHandler = function(db_command, raw, connection, exhaust, callback) {
  // console.log('----- _registerHandler :: ' + this._callBackStore.id + " connection :: " + (connection != null ? connection.socketOptions.port : 'no connection'));
  // If we have an array of commands, chain them
  var chained = Array.isArray(db_command);

  // Check if we have exhausted
  if(typeof exhaust == 'function') {
    callback = exhaust;
    exhaust = false;
  }

  // If they are chained we need to add a special handler situation
  if(chained) {
    // List off chained id's
    var chainedIds = [];
    // Add all id's
    for(var i = 0; i < db_command.length; i++) chainedIds.push(db_command[i].getRequestId().toString());
    // Register all the commands together
    for(var i = 0; i < db_command.length; i++) {
      var command = db_command[i];
      // Add the callback to the store
      this._callBackStore.once(command.getRequestId(), callback);
      // Add the information about the reply
      this._callBackStore._notReplied[command.getRequestId().toString()] = {start: new Date().getTime(), 'raw': raw, chained:chainedIds, connection:connection, exhaust:false};
    }
  } else {
    // Add the callback to the list of handlers
    this._callBackStore.once(db_command.getRequestId(), callback);
    // Add the information about the reply
    this._callBackStore._notReplied[db_command.getRequestId().toString()] = {start: new Date().getTime(), 'raw': raw, connection:connection, exhaust:exhaust};
  }
}

/**
 * Re-Register a handler, on the cursor id f.ex
 * @ignore
 * @api private
 */
Base.prototype._reRegisterHandler = function(newId, object, callback) {
  // console.log('----- _reRegisterHandler :: ' + this._callBackStore.id)
  // Add the callback to the list of handlers
  this._callBackStore.once(newId, object.callback.listener);
  // Add the information about the reply
  this._callBackStore._notReplied[newId] = object.info;
}

/**
 *
 * @ignore
 * @api private
 */
Base.prototype._callHandler = function(id, document, err) {
  // console.log('----- _callHandler :: ' + this._callBackStore.id)
  // console.dir(document)
  // If there is a callback peform it
  if(this._callBackStore.listeners(id).length >= 1) {
    // Get info object
    var info = this._callBackStore._notReplied[id];
    // Delete the current object
    delete this._callBackStore._notReplied[id];
    // Emit to the callback of the object
    this._callBackStore.emit(id, err, document, info.connection);
  }
}

/**
 *
 * @ignore
 * @api private
 */
Base.prototype._hasHandler = function(id) {
  // console.log('----- _hasHandler :: ' + this._callBackStore.id)
  // If there is a callback peform it
  return this._callBackStore.listeners(id).length >= 1;
}

/**
 *
 * @ignore
 * @api private
 */
Base.prototype._removeHandler = function(id) {
  // console.log('----- _removeHandler :: ' + this._callBackStore.id)
  // Remove the information
  if(this._callBackStore._notReplied[id] != null) delete this._callBackStore._notReplied[id];
  // Remove the callback if it's registered
  this._callBackStore.removeAllListeners(id);
  // Force cleanup _events, node.js seems to set it as a null value
  if(this._callBackStore._events != null) delete this._callBackStore._events[id];
}

/**
 *
 * @ignore
 * @api private
 */
Base.prototype._findHandler = function(id) {
  // console.log('----- _findHandler :: ' + this._callBackStore.id)
  var info = this._callBackStore._notReplied[id];
  // Return the callback
  return {info:info, callback:(this._callBackStore.listeners(id).length >= 1) ? this._callBackStore.listeners(id)[0] : null}
}

exports.Base = Base;