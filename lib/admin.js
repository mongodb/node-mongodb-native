var toError = require('./utils').toError;

/**
 * @fileOverview The **Admin** class is an internal class that allows convenient access to
 * the admin functionality and commands for MongoDB.
 * 
 * **ADMIN Cannot directly be instantiated**
 * @example
 * var MongoClient = require('mongodb').MongoClient,
 *   test = require('assert');
 * // Connection url
 * var url = 'mongodb://localhost:27017/test';
 * // Connect using MongoClient
 * MongoClient.connect(url, function(err, db) {
 *   // Use the admin database for the operation
 *   var adminDb = db.admin();
 *     
 *   // List all the available databases
 *   adminDb.listDatabases(function(err, dbs) {
 *     test.equal(null, err);
 *     test.ok(dbs.databases.length > 0);
 *     db.close();
 *   });
 * });
 */

/**
 * Create a new Admin instance (INTERNAL TYPE, do not instantiate directly)
 * @class
 * @return {Admin} a collection instance.
 */
var Admin = function(db, topology) {
  if(!(this instanceof Admin)) return new Admin(db, topology);
  var self = this;

  // Internal state
  this.s = {
      db: db
    , topology: topology
  }
}

/**
 * The callback format for results
 * @callback Admin~resultCallback
 * @param {MongoError} error An error instance representing the error during the execution.
 * @param {object} result The result object if the command was executed successfully.
 */

/**
 * Execute a command
 * @method
 * @param {object} command The command hash
 * @param {object} [options=null] Optional settings.
 * @param {(ReadPreference|string)} [options.readPreference=null] The preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
 * @param {number} [options.maxTimeMS=null] Number of milliseconds to wait before aborting the query.
 * @param {Admin~resultCallback} callback The command result callback
 * @return {null}
 */
Admin.prototype.command = function(command, options, callback) {
  var args = Array.prototype.slice.call(arguments, 1);
  callback = args.pop();
  options = args.length ? args.shift() : {};

  // Execute a command
  this.s.db.executeDbAdminCommand(command, options, function(err, doc) {
    return callback != null ? callback(err, doc) : null;
  });
} 

/**
 * Retrieve the server information for the current
 * instance of the db client
 *
 * @param {Admin~resultCallback} callback The command result callback
 * @return {null}
 */
Admin.prototype.buildInfo = function(callback) {
  this.serverInfo(callback);
}

/**
 * Retrieve the server information for the current
 * instance of the db client
 *
 * @param {Admin~resultCallback} callback The command result callback
 * @return {null}
 */
Admin.prototype.serverInfo = function(callback) {
  this.s.db.executeDbAdminCommand({buildinfo:1}, function(err, doc) {
    if(err != null) return callback(err, null);
    return callback(null, doc);
  });
}

/**
 * Retrieve this db's server status.
 *
 * @param {Admin~resultCallback} callback The command result callback
 * @return {null}
 */
Admin.prototype.serverStatus = function(callback) {
  var self = this;

  this.s.db.executeDbAdminCommand({serverStatus: 1}, function(err, doc) {
    if(err == null && doc.ok === 1) {
      callback(null, doc);
    } else {
      if(err) return callback(err, false);
      return callback(toError(doc), false);
    }
  });
};

/**
 * Retrieve the current profiling Level for MongoDB
 *
 * @param {Admin~resultCallback} callback The command result callback
 * @return {null}
 */
Admin.prototype.profilingLevel = function(callback) {
  var self = this;

  this.s.db.executeDbAdminCommand({profile:-1}, function(err, doc) {
    doc = doc;

    if(err == null && doc.ok === 1) {
      var was = doc.was;
      if(was == 0) return callback(null, "off");
      if(was == 1) return callback(null, "slow_only");
      if(was == 2) return callback(null, "all");
        return callback(new Error("Error: illegal profiling level value " + was), null);
    } else {
      err != null ? callback(err, null) : callback(new Error("Error with profile command"), null);
    }
  });
};

/**
 * Ping the MongoDB server and retrieve results
 *
 * @param {Admin~resultCallback} callback The command result callback
 * @return {null}
 */
Admin.prototype.ping = function(options, callback) {
  var args = Array.prototype.slice.call(arguments, 0);
  this.s.db.executeDbAdminCommand({ping: 1}, args.pop());
}

/**
 * Authenticate a user against the server.
 * @method
 * @param {string} username The username.
 * @param {string} [password] The password.
 * @param {Admin~resultCallback} callback The command result callback
 * @return {null}
 */
Admin.prototype.authenticate = function(username, password, callback) {
  this.s.db.authenticate(username, password, {authdb: 'admin'}, function(err, doc) {
    return callback(err, doc);
  })
}

/**
 * Logout user from server, fire off on all connections and remove all auth info
 * @method
 * @param {Admin~resultCallback} callback The command result callback
 * @return {null}
 */
Admin.prototype.logout = function(callback) {
  this.s.db.logout({authdb: 'admin'},  function(err, doc) {
    return callback(err, doc);
  })
}

/**
 * Add a user to the database.
 * @method
 * @param {string} username The username.
 * @param {string} password The password.
 * @param {object} [options=null] Optional settings.
 * @param {(number|string)} [options.w=null] The write concern.
 * @param {number} [options.wtimeout=null] The write concern timeout.
 * @param {boolean} [options.j=false] Specify a journal write concern.
 * @param {boolean} [options.fsync=false] Specify a file sync write concern.
 * @param {object} [options.customData=null] Custom data associated with the user (only Mongodb 2.6 or higher)
 * @param {object[]} [options.roles=null] Roles associated with the created user (only Mongodb 2.6 or higher)
 * @param {Admin~resultCallback} callback The command result callback
 * @return {null}
 */
Admin.prototype.addUser = function(username, password, options, callback) {
  var args = Array.prototype.slice.call(arguments, 2);
  callback = args.pop();
  options = args.length ? args.shift() : {};
  // Set the db name to admin
  options.dbName = 'admin';
  // Add user
  this.s.db.addUser(username, password, options, function(err, doc) {
    return callback(err, doc);
  })
}

/**
 * Remove a user from a database
 * @method
 * @param {string} username The username.
 * @param {object} [options=null] Optional settings.
 * @param {(number|string)} [options.w=null] The write concern.
 * @param {number} [options.wtimeout=null] The write concern timeout.
 * @param {boolean} [options.j=false] Specify a journal write concern.
 * @param {boolean} [options.fsync=false] Specify a file sync write concern.
 * @param {Admin~resultCallback} callback The command result callback
 * @return {null}
 */
Admin.prototype.removeUser = function(username, options, callback) {
  var self = this;
  var args = Array.prototype.slice.call(arguments, 1);
  callback = args.pop();
  options = args.length ? args.shift() : {};
  options.dbName = 'admin';

  this.s.db.removeUser(username, options, function(err, doc) {
    return callback(err, doc);
  })
}

/**
 * Set the current profiling level of MongoDB
 *
 * @param {string} level The new profiling level (off, slow_only, all).
 * @param {Admin~resultCallback} callback The command result callback.
 * @return {null}
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

  this.s.db.executeDbAdminCommand(command, function(err, doc) {
    doc = doc;

    if(err == null && doc.ok === 1)
      return callback(null, level);
    return err != null ? callback(err, null) : callback(new Error("Error with profile command"), null);
  });
};

/**
 * Retrive the current profiling information for MongoDB
 *
 * @param {Admin~resultCallback} callback The command result callback.
 * @return {null}
 */
Admin.prototype.profilingInfo = function(callback) {
  try {
    this.s.topology.cursor("admin.system.profile", { find: 'system.profile', query: {}}, {}).toArray(callback);
  } catch (err) {
    return callback(err, null);
  }
};

/**
 * Validate an existing collection
 *
 * @param {string} collectionName The name of the collection to validate.
 * @param {object} [options=null] Optional settings.
 * @param {Admin~resultCallback} callback The command result callback.
 * @return {null}
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

  this.s.db.command(command, function(err, doc) {
    if(err != null) return callback(err, null);

    if(doc.ok === 0)
      return callback(new Error("Error with validate command"), null);
    if(doc.result != null && doc.result.constructor != String)
      return callback(new Error("Error with validation data"), null);
    if(doc.result != null && doc.result.match(/exception|corrupt/) != null)
      return callback(new Error("Error: invalid collection " + collectionName), null);
    if(doc.valid != null && !doc.valid)
      return callback(new Error("Error: invalid collection " + collectionName), null);

    return callback(null, doc);
  });
};

/**
 * List the available databases
 *
 * @param {Admin~resultCallback} callback The command result callback.
 * @return {null}
 */
Admin.prototype.listDatabases = function(callback) {
  this.s.db.executeDbAdminCommand({listDatabases:1}, {}, function(err, doc) {
    if(err != null) return callback(err, null);
    return callback(null, doc);
  });
}

/**
 * Get ReplicaSet status
 *
 * @param {Admin~resultCallback} callback The command result callback.
 * @return {null}
 */
Admin.prototype.replSetGetStatus = function(callback) {
  var self = this;

  this.s.db.executeDbAdminCommand({replSetGetStatus:1}, function(err, doc) {
    if(err == null && doc.ok === 1)
      return callback(null, doc);
    if(err) return callback(err, false);
    return callback(toError(doc), false);
  });
}; 

module.exports = Admin;