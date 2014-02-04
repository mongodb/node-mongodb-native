var EventEmitter = require('events').EventEmitter
  , inherits = require('util').inherits
  , utils = require('../utils')
  , mongodb_cr_authenticate = require('../auth/mongodb_cr.js').authenticate
  , mongodb_gssapi_authenticate = require('../auth/mongodb_gssapi.js').authenticate
  , mongodb_sspi_authenticate = require('../auth/mongodb_sspi.js').authenticate
  , mongodb_plain_authenticate = require('../auth/mongodb_plain.js').authenticate
  , mongodb_x509_authenticate = require('../auth/mongodb_x509.js').authenticate;

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
 * @ignore
 */
inherits(CallbackStore, EventEmitter);

CallbackStore.prototype.notRepliedToIds = function() {
  return Object.keys(this._notReplied);
}

CallbackStore.prototype.callbackInfo = function(id) {
  return this._notReplied[id]; 
}

/**
 * Internal class for holding non-executed commands
 * @ignore
 */
var NonExecutedOperationStore = function(config) {  
  var commands = {
      read: []
    , write_reads: []
    , write: []
  };

  // Execute all callbacks
  var fireCallbacksWithError = function(error, commands) {
    while(commands.length > 0) {
      var command = commands.shift();
      if(typeof command.callback == 'function') {
        command.callback(error);        
      }
    }
  }

  this.count = function() {
    return commands.read.length
      + commands.write_reads.length
      + commands.write.length;
  }

  this.write = function(op) {
    commands.write.push(op);
  }  

  this.read_from_writer = function(op) {  
    commands.write_reads.push(op);
  }

  this.read = function(op) {  
    commands.read.push(op);
  }  

  this.validateBufferLimit = function(numberToFailOn) {
    if(numberToFailOn == -1 || numberToFailOn == null) 
      return true;

    // Error passed back
    var error = utils.toError("No connection operations buffering limit of " + numberToFailOn + " reached");

    // If we have passed the number of items to buffer we need to fail
    if(numberToFailOn < this.count()) {
      // Fail all of the callbacks
      fireCallbacksWithError(error, commands.read);
      fireCallbacksWithError(error, commands.write_reads);
      fireCallbacksWithError(error, commands.write);

      // Report back that the buffer has been filled
      return false;
    }

    // There is still some room to go
    return true;
  }

  this.execute_queries = function(executeInsertCommand) {
    var connection = config.checkoutReader();
    if(connection == null || connection instanceof Error) return;

    // Write out all the queries
    while(commands.read.length > 0) {
      // Get the next command
      var command = commands.read.shift();
      command.options.connection = connection;
      // Execute the next command
      command.executeQueryCommand(command.db, command.db_command, command.options, command.callback);
    }
  }

  this.execute_writes = function() {
    var connection = config.checkoutWriter();
    if(connection == null || connection instanceof Error) return;

    // Write out all the queries to the primary
    while(commands.write_reads.length > 0) {
      // Get the next command
      var command = commands.write_reads.shift();
      command.options.connection = connection;
      // Execute the next command
      command.executeQueryCommand(command.db, command.db_command, command.options, command.callback);
    }

    // Execute all write operations
    while(commands.write.length > 0) {
      // Get the next command
      var command = commands.write.shift();
      // Set the connection
      command.options.connection = connection;
      // Execute the next command
      command.executeInsertCommand(command.db, command.db_command, command.options, command.callback);
    }  
  }
}

/**
 * Internal class for authentication storage
 * @ignore
 */
var AuthStore = function() {
  var _auths = [];

  this.add = function(authMechanism, dbName, username, password, authdbName, gssapiServiceName) {
    // Check for duplicates
    if(!this.contains(dbName)) {
      // Base config
      var config = {
          'username':username
        , 'password':password
        , 'db': dbName
        , 'authMechanism': authMechanism
        , 'gssapiServiceName': gssapiServiceName
      };

      // Add auth source if passed in
      if(typeof authdbName == 'string') {
        config['authdb'] = authdbName;
      }

      // Push the config
      _auths.push(config);
    }
  }  

  this.contains = function(dbName) {
    for(var i = 0; i < _auths.length; i++) {
      if(_auths[i].db == dbName) return true;
    }

    return false;
  }

  this.remove = function(dbName) {
    var newAuths = [];

    // Filter out all the login details
    for(var i = 0; i < _auths.length; i++) {
      if(_auths[i].db != dbName) newAuths.push(_auths[i]);
    }

    //  Set the filtered list
    _auths = newAuths;
  }

  this.get = function(index) {
    return _auths[index];
  }

  this.length = function() {
    return _auths.length;
  }

  this.toArray = function() {
    return _auths.slice(0);
  }
}

/**
 * Internal class for storing db references
 * @ignore
 */
var DbStore = function() {
  var _dbs = [];

  this.add = function(db) {
    var found = false;
    
    // Only add if it does not exist already
    for(var i = 0; i < _dbs.length; i++) {
      if(db.databaseName == _dbs[i].databaseName) found = true;
    }

    // Only add if it does not already exist
    if(!found) {
      _dbs.push(db);    
    } 
  }

  this.reset = function() {
    _dbs = [];
  }

  this.db = function() {
    return _dbs;
  }

  this.fetch = function(databaseName) {
    // Only add if it does not exist already
    for(var i = 0; i < _dbs.length; i++) {
      if(databaseName == _dbs[i].databaseName)
        return _dbs[i];
    }  

    return null;
  }

  this.emit = function(event, message, object, reset, filterDb, rethrow_if_no_listeners) {
    var emitted = false;

    // Not emitted and we have enabled rethrow, let process.uncaughtException
    // deal with the issue
    if(!emitted && rethrow_if_no_listeners) {
      return process.nextTick(function() {
        throw message;      
      })
    }

    // Emit the events
    for(var i = 0; i < _dbs.length; i++) {    
      if(_dbs[i].listeners(event).length > 0) {
        if(filterDb == null || filterDb.databaseName !== _dbs[i].databaseName 
          || filterDb.tag !== _dbs[i].tag) {
          _dbs[i].emit(event, message, object == null ? _dbs[i] : object);
          emitted = true;
        }
      }
    }

    // Emit error message
    if(message 
      && event == 'error' 
      && !emitted
      && rethrow_if_no_listeners 
      && object && object.db) {
        process.nextTick(function() {
          object.db.emit(event, message, null);      
        })
    }
  }
}

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
  // Contains all the dbs attached to this server config
  this._dbStore = new DbStore();
}

/**
 * @ignore
 */
inherits(Base, EventEmitter);

/**
 * @ignore
 */
Base.prototype._apply_auths = function(db, callback) {
  _apply_auths_serially(this, db, this.auth.toArray(), callback);
}

var _apply_auths_serially = function(self, db, auths, callback) {
  if(auths.length == 0) return callback(null, null);
  // Get the first auth
  var auth = auths.shift();
  var connections = self.allRawConnections();
  var connectionsLeft = connections.length;
  var options = {};

  if(auth.authMechanism == 'GSSAPI') {
    // We have the kerberos library, execute auth process
    if(process.platform == 'win32') {
      mongodb_sspi_authenticate(db, auth.username, auth.password, auth.authdb, options, callback);
    } else {
      mongodb_gssapi_authenticate(db, auth.username, auth.password, auth.authdb, options, callback);
    }
  } else if(auth.authMechanism == 'MONGODB-CR') {
    mongodb_cr_authenticate(db, auth.username, auth.password, auth.authdb, options, callback);
  } else if(auth.authMechanism == 'PLAIN') {
    mongodb_plain_authenticate(db, auth.username, auth.password, auth.authdb, options, callback);
  } else if(auth.authMechanism == 'MONGODB-X509') {
    mongodb_x509_authenticate(db, auth.username, auth.password, auth.authdb, options, callback);
  }
}

/**
 * Fire all the errors
 * @ignore
 */
Base.prototype.__executeAllCallbacksWithError = function(err) {
  // Check all callbacks
  var keys = Object.keys(this._callBackStore._notReplied);
  // For each key check if it's a callback that needs to be returned
  for(var j = 0; j < keys.length; j++) {
    var info = this._callBackStore._notReplied[keys[j]];
    // Execute callback with error
    this._callBackStore.emit(keys[j], err, null);
    // Remove the key
    delete this._callBackStore._notReplied[keys[j]];
    // Force cleanup _events, node.js seems to set it as a null value
    if(this._callBackStore._events) {
      delete this._callBackStore._events[keys[j]];
    }
  }
}

/**
 * Fire all the errors
 * @ignore
 */
Base.prototype.__executeAllServerSpecificErrorCallbacks = function(host, port, err) {  
  // Check all callbacks
  var keys = Object.keys(this._callBackStore._notReplied);
  // For each key check if it's a callback that needs to be returned
  for(var j = 0; j < keys.length; j++) {
    var info = this._callBackStore._notReplied[keys[j]];

    if(info.connection) {
      // Unpack the connection settings
      var _host = info.connection.socketOptions.host;
      var _port = info.connection.socketOptions.port;
      // If the server matches execute the callback with the error
      if(_port == port && _host == host) {
        this._callBackStore.emit(keys[j], err, null);
        // Remove the key
        delete this._callBackStore._notReplied[keys[j]];
        // Force cleanup _events, node.js seems to set it as a null value
        if(this._callBackStore._events) {
          delete this._callBackStore._events[keys[j]];
        } 
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
  // Check if we have exhausted
  if(typeof exhaust == 'function') {
    callback = exhaust;
    exhaust = false;
  }

  // Add the callback to the list of handlers
  this._callBackStore.once(db_command.getRequestId(), callback);
  // Add the information about the reply
  this._callBackStore._notReplied[db_command.getRequestId().toString()] = {start: new Date().getTime(), 'raw': raw, connection:connection, exhaust:exhaust};
}

/**
 * Re-Register a handler, on the cursor id f.ex
 * @ignore
 * @api private
 */
Base.prototype._reRegisterHandler = function(newId, object, callback) {
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
Base.prototype._flushAllCallHandlers = function(err) {
  var keys = Object.keys(this._callBackStore._notReplied);

  for(var i = 0; i < keys.length; i++) {
    this._callHandler(keys[i], null, err);
  }
}

/**
 *
 * @ignore
 * @api private
 */
Base.prototype._callHandler = function(id, document, err) {
  var self = this;

  // If there is a callback peform it
  if(this._callBackStore.listeners(id).length >= 1) {
    // Get info object
    var info = this._callBackStore._notReplied[id];
    // Delete the current object
    delete this._callBackStore._notReplied[id]; 
    // Call the handle directly don't emit
    var callback = this._callBackStore.listeners(id)[0].listener;
    // Remove the listeners
    this._callBackStore.removeAllListeners(id);
    // Force key deletion because it nulling it not deleting in 0.10.X
    if(this._callBackStore._events) {
      delete this._callBackStore._events[id];
    }

    try {
      // Execute the callback if one was provided
      if(typeof callback == 'function') callback(err, document, info.connection);
    } catch(err) {
      self._emitAcrossAllDbInstances(self, null, "error", utils.toError(err), self, true, true);
    }
  }
}

/**
 *
 * @ignore
 * @api private
 */
Base.prototype._hasHandler = function(id) {
  return this._callBackStore.listeners(id).length >= 1;
}

/**
 *
 * @ignore
 * @api private
 */
Base.prototype._removeHandler = function(id) {
  // Remove the information
  if(this._callBackStore._notReplied[id] != null) delete this._callBackStore._notReplied[id];
  // Remove the callback if it's registered
  this._callBackStore.removeAllListeners(id);
  // Force cleanup _events, node.js seems to set it as a null value
  if(this._callBackStore._events) {
    delete this._callBackStore._events[id];
  }
}

/**
 *
 * @ignore
 * @api private
 */
Base.prototype._findHandler = function(id) {
  var info = this._callBackStore._notReplied[id];
  // Return the callback
  return {info:info, callback:(this._callBackStore.listeners(id).length >= 1) ? this._callBackStore.listeners(id)[0] : null}
}

/**
 *
 * @ignore
 * @api private
 */
Base.prototype._emitAcrossAllDbInstances = function(server, filterDb, event, message, object, resetConnection, rethrow_if_no_listeners) {
  if(resetConnection) {
    var dbs = this._dbStore.db();

    for(var i = 0; i < dbs.length; i++) {
      if(typeof dbs[i].openCalled != 'undefined')
        dbs[i].openCalled = false;
    }
  }
  
  // Fire event
  this._dbStore.emit(event, message, object, resetConnection, filterDb, rethrow_if_no_listeners);
}

exports.Base = Base;