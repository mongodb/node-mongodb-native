/*!
 * Module dependencies.
 */
var Collection = require('./collection').Collection,
    Cursor = require('./cursor').Cursor,
    DbCommand = require('./commands/db_command').DbCommand;

/**
 * Allows the user to access the admin functionality of MongoDB
 *
 * @class Represents the Admin methods of MongoDB.
 * @param {Object} db Current db instance we wish to perform Admin operations on.
 * @return {Function} Constructor for Admin type.
 */
function Admin(db) {  
  if(!(this instanceof Admin)) return new Admin(db);
  
  this.db = db;
};

/**
 * Retrieve the server information for the current
 * instance of the db client
 * 
 * @param {Function} callback Callback function of format `function(err, result) {}`.
 * @return {null} Returns no result
 * @api public
 */
Admin.prototype.buildInfo = function(callback) {
  this.serverInfo(callback);
}

/**
 * Retrieve the server information for the current
 * instance of the db client
 * 
 * @param {Function} callback Callback function of format `function(err, result) {}`.
 * @return {null} Returns no result
 * @api private
 */
Admin.prototype.serverInfo = function(callback) {
  var self = this;
  var command = {buildinfo:1};
  this.command(command, function(err, doc) {
    if(err != null) return callback(err, null);
    return callback(null, doc.documents[0]);
  });
}

/**
 * Retrieve this db's server status.
 *
 * @param {Function} callback returns the server status.
 * @return {null}
 * @api public
 */
Admin.prototype.serverStatus = function(callback) {
  var self = this;

  this.command({serverStatus: 1}, function(err, result) {
    if (err == null && result.documents[0].ok == 1) {
      callback(null, result.documents[0]);
    } else {
      if (err) {
        callback(err, false);
      } else {
        callback(self.wrap(result.documents[0]), false);
      }
    }
  });
};

/**
 * Retrieve the current profiling Level for MongoDB
 * 
 * @param {Function} callback Callback function of format `function(err, result) {}`.
 * @return {null} Returns no result
 * @api public
 */
Admin.prototype.profilingLevel = function(callback) {
  var self = this;
  var command = {profile:-1};

  this.command(command, function(err, doc) {
    doc = doc.documents[0];
    
    if(err == null && (doc.ok == 1 || typeof doc.was === 'number')) {
      var was = doc.was;
      if(was == 0) {
        callback(null, "off");
      } else if(was == 1) {
        callback(null, "slow_only");
      } else if(was == 2) {
        callback(null, "all");
      } else {
        callback(new Error("Error: illegal profiling level value " + was), null);
      }
    } else {
      err != null ? callback(err, null) : callback(new Error("Error with profile command"), null);
    }
  });
};

/**
 * Ping the MongoDB server and retrieve results
 *
 * @param {Object} [options] Optional parameters to the command. 
 * @param {Function} callback Callback function of format `function(err, result) {}`.
 * @return {null} Returns no result
 * @api public
 */
Admin.prototype.ping = function(options, callback) {
  // Unpack calls
  var args = Array.prototype.slice.call(arguments, 0);
  callback = args.pop();
  options = args.length ? args.shift() : {};
  // Set self
  var self = this;
  var databaseName = this.db.databaseName;
  this.db.databaseName = 'admin';
  this.db.executeDbCommand({ping:1}, options, function(err, result) {
    self.db.databaseName = databaseName;
    return callback(err, result);
  })  
}

/**
 * Authenticate against MongoDB
 * 
 * @param {String} username The user name for the authentication.
 * @param {String} password The password for the authentication.
 * @param {Function} callback Callback function of format `function(err, result) {}`.
 * @return {null} Returns no result
 * @api public
 */
Admin.prototype.authenticate = function(username, password, callback) {
  var self = this;
  var databaseName = this.db.databaseName;
  this.db.databaseName = 'admin';
  this.db.authenticate(username, password, function(err, result) {    
    self.db.databaseName = databaseName;
    return callback(err, result);
  })
}

/**
 * Logout current authenticated user
 *
 * @param {Object} [options] Optional parameters to the command. 
 * @param {Function} callback Callback function of format `function(err, result) {}`.
 * @return {null} Returns no result
 * @api public
 */
Admin.prototype.logout = function(callback) {
  var self = this;
  var databaseName = this.db.databaseName;
  this.db.databaseName = 'admin';
  this.db.logout(function(err, result) {
    return callback(err, result);
  })  

  self.db.databaseName = databaseName;
}

/**
 * Add a user to the MongoDB server, if the user exists it will
 * overwrite the current password
 *
 * Options
 *  - **safe** {true | {w:n, wtimeout:n} | {fsync:true}, default:false}, executes with a getLastError command returning the results of the command on MongoDB.
 *
 * @param {String} username The user name for the authentication.
 * @param {String} password The password for the authentication.
 * @param {Object} [options] additional options during update.
 * @param {Function} callback Callback function of format `function(err, result) {}`.
 * @return {null} Returns no result
 * @api public
 */
Admin.prototype.addUser = function(username, password, options, callback) {
  var self = this;
  var args = Array.prototype.slice.call(arguments, 2);
  callback = args.pop();
  options = args.length ? args.shift() : {};

  var self = this;
  var databaseName = this.db.databaseName;
  this.db.databaseName = 'admin';
  this.db.addUser(username, password, options, function(err, result) {
    self.db.databaseName = databaseName;
    return callback(err, result);
  })  
}

/**
 * Remove a user from the MongoDB server
 *
 * Options
 *  - **safe** {true | {w:n, wtimeout:n} | {fsync:true}, default:false}, executes with a getLastError command returning the results of the command on MongoDB.
 *
 * @param {String} username The user name for the authentication.
 * @param {Object} [options] additional options during update.
 * @param {Function} callback Callback function of format `function(err, result) {}`.
 * @return {null} Returns no result
 * @api public
 */
Admin.prototype.removeUser = function(username, options, callback) {
  var self = this;
  var args = Array.prototype.slice.call(arguments, 1);
  callback = args.pop();
  options = args.length ? args.shift() : {};

  var self = this;
  var databaseName = this.db.databaseName;
  this.db.databaseName = 'admin';
  this.db.removeUser(username, options, function(err, result) {
    self.db.databaseName = databaseName;
    return callback(err, result);
  })  
}

/**
 * Set the current profiling level of MongoDB
 * 
 * @param {String} level The new profiling level (off, slow_only, all)
 * @param {Function} callback Callback function of format `function(err, result) {}`.
 * @return {null} Returns no result
 * @api public
 */
Admin.prototype.setProfilingLevel = function(level, callback) {
  var self = this;
  var command = {};
  var profile = 0;

  if(level == "off") {
    profile = 0;
  } else if(level == "slow_only") {
    profile = 1;
  } else if(level == "all") {
    profile = 2;
  } else {
    return callback(new Error("Error: illegal profiling level value " + level));
  }

  // Set up the profile number
  command['profile'] = profile;  
  // Execute the command to set the profiling level
  this.command(command, function(err, doc) {
    doc = doc.documents[0];
    
    if(err == null && (doc.ok == 1 || typeof doc.was === 'number')) {
      return callback(null, level);
    } else {
      return err != null ? callback(err, null) : callback(new Error("Error with profile command"), null);
    }    
  });
};

/**
 * Retrive the current profiling information for MongoDB
 * 
 * @param {Function} callback Callback function of format `function(err, result) {}`.
 * @return {null} Returns no result
 * @api public
 */
Admin.prototype.profilingInfo = function(callback) {
  var self = this;
  var databaseName = this.db.databaseName;
  this.db.databaseName = 'admin';

  try {
    new Cursor(this.db, new Collection(this.db, DbCommand.SYSTEM_PROFILE_COLLECTION), {}).toArray(function(err, items) {
      return callback(err, items);
    });    
  } catch (err) {
    return callback(err, null);
  }

  self.db.databaseName = databaseName;
};

/**
 * Execute a db command against the Admin database
 * 
 * @param {Object} command A command object `{ping:1}`.
 * @param {Object} [options] Optional parameters to the command. 
 * @param {Function} callback Callback function of format `function(err, result) {}`.
 * @return {null} Returns no result
 * @api public
 */
Admin.prototype.command = function(command, options, callback) {
  var self = this;
  var args = Array.prototype.slice.call(arguments, 1);
  callback = args.pop();
  options = args.length ? args.shift() : {};

  // Execute a command
  this.db.executeDbAdminCommand(command, options, function(err, result) {    
    // Ensure change before event loop executes
    return callback != null ? callback(err, result) : null;
  });
}

/**
 * Validate an existing collection
 * 
 * @param {String} collectionName The name of the collection to validate.
 * @param {Object} [options] Optional parameters to the command. 
 * @param {Function} callback Callback function of format `function(err, result) {}`.
 * @return {null} Returns no result
 * @api public
 */
Admin.prototype.validateCollection = function(collectionName, options, callback) {
  var args = Array.prototype.slice.call(arguments, 1);
  callback = args.pop();
  options = args.length ? args.shift() : {};

  var self = this;
  var command = {validate: collectionName};
  var keys = Object.keys(options);
  
  // Decorate command with extra options
  for(var i = 0; i < keys.length; i++) {
    if(options.hasOwnProperty(keys[i])) {
      command[keys[i]] = options[keys[i]];
    }
  }

  this.db.executeDbCommand(command, function(err, doc) {
    if(err != null) return callback(err, null);    
    doc = doc.documents[0];
    
    if(doc.ok == 0) {
      return callback(new Error("Error with validate command"), null);
    } else if(doc.result != null && doc.result.constructor != String) {
      return callback(new Error("Error with validation data"), null);
    } else if(doc.result != null && doc.result.match(/exception|corrupt/) != null) {
      return callback(new Error("Error: invalid collection " + collectionName), null);
    } else if(doc.valid != null && !doc.valid) {
      return callback(new Error("Error: invalid collection " + collectionName), null);      
    } else {
      return callback(null, doc);
    }
  });
};

/**
 * List the available databases
 * 
 * @param {Function} callback Callback function of format `function(err, result) {}`.
 * @return {null} Returns no result
 * @api public
 */
Admin.prototype.listDatabases = function(callback) {
  // Execute the listAllDatabases command
  this.db.executeDbAdminCommand({listDatabases:1}, {}, function(err, result) {        
    if(err != null) {
      callback(err, null);
    } else {
      callback(null, result.documents[0]);
    }
  });  
}

/**
 * Get ReplicaSet status
 *
 * @param {Function} callback returns the replica set status (if available).
 * @return {null}
 * @api public
 */
Admin.prototype.replSetGetStatus = function(callback) {
  var self = this;

  this.command({replSetGetStatus:1}, function(err, result) {
    if (err == null && result.documents[0].ok == 1) {
      callback(null, result.documents[0]);
    } else {
      if (err) {
        callback(err, false);
      } else {
        callback(self.db.wrap(result.documents[0]), false);
      }
    }
  });
};

/**
 * @ignore
 */
exports.Admin = Admin;
