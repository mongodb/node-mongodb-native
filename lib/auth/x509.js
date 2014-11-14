var f = require('util').format
  , crypto = require('crypto')
  , MongoError = require('../error');

var AuthSession = function(db, username, password) {
  this.db = db;
  this.username = username;
  this.password = password;
}

AuthSession.prototype.equal = function(session) {
  return session.db == this.db 
    && session.username == this.username
    && session.password == this.password;
}

/**
 * Creates a new X509 authentication mechanism
 * @class
 * @return {X509} A cursor instance
 */
var X509 = function() {
  this.authStore = [];
}

/**
 * Authenticate
 * @method
 * @param {{Server}|{ReplSet}|{Mongos}} server Topology the authentication method is being called on
 * @param {Pool} pool Connection pool for this topology
 * @param {string} db Name of the database
 * @param {string} username Username
 * @param {string} password Password
 * @param {authResultCallback} callback The callback to return the result from the authentication
 * @return {object}
 */
X509.prototype.auth = function(server, pool, db, username, password, callback) {
  var self = this;
  // Get all the connections
  var connections = pool.getAll();
  // Total connections
  var count = connections.length;
  if(count == 0) return callback(null, null);

  // Valid connections
  var numberOfValidConnections = 0;
  var credentialsValid = false;
  var errorObject = null;

  // For each connection we need to authenticate
  while(connections.length > 0) {    
    // Execute MongoCR
    var execute = function(connection) {
      // Let's start the sasl process
      var command = {
          authenticate: 1
        , mechanism: 'MONGODB-X509'
        , user: username
      };

      // Let's start the process
      server.command("$external.$cmd"
        , command
        , { connection: connection }, function(err, r) {
        // Adjust count
        count = count - 1;

        // If we have an error
        if(err) {
          errorObject = err;
        } else if(r.result['$err']) {
          errorObject = r.result;
        } else if(r.result['errmsg']) {
          errorObject = r.result;
        } else {
          credentialsValid = true;
          numberOfValidConnections = numberOfValidConnections + 1;
        }

        // We have authenticated all connections
        if(count == 0 && numberOfValidConnections > 0) {
          // Store the auth details
          addAuthSession(self.authStore, new AuthSession(db, username, password));
          // Return correct authentication
          callback(null, true);
        } else if(count == 0) {
          if(errorObject == null) errorObject = new MongoError(f("failed to authenticate using mongocr"));
          callback(errorObject, false);
        }
      });
    }

    // Get the connection
    execute(connections.shift());
  }
}

// Add to store only if it does not exist
var addAuthSession = function(authStore, session) {
  var found = false;

  for(var i = 0; i < authStore.length; i++) {
    if(authStore[i].equal(session)) {
      found = true;
      break;
    }
  }

  if(!found) authStore.push(session);
}

/**
 * Re authenticate pool
 * @method
 * @param {{Server}|{ReplSet}|{Mongos}} server Topology the authentication method is being called on
 * @param {Pool} pool Connection pool for this topology
 * @param {authResultCallback} callback The callback to return the result from the authentication
 * @return {object}
 */
X509.prototype.reauthenticate = function(server, pool, callback) {
  var count = this.authStore.length;
  if(count == 0) return callback(null, null);
  // Iterate over all the auth details stored
  for(var i = 0; i < this.authStore.length; i++) {
    this.auth(server, pool, this.authStore[i].db, this.authStore[i].username, this.authStore[i].password, function(err, r) {
      count = count - 1;
      // Done re-authenticating
      if(count == 0) {
        callback(null, null);
      }
    });
  }
}

/**
 * This is a result from a authentication strategy
 *
 * @callback authResultCallback
 * @param {error} error An error object. Set to null if no error present
 * @param {boolean} result The result of the authentication process
 */

module.exports = X509;