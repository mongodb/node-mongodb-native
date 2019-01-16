'use strict';

var f = require('util').format,
  MongoError = require('../error').MongoError;

var AuthSession = function(db, username, password) {
  this.db = db;
  this.username = username;
  this.password = password;
};

AuthSession.prototype.equal = function(session) {
  return (
    session.db === this.db &&
    session.username === this.username &&
    session.password === this.password
  );
};

/**
 * Creates a new X509 authentication mechanism
 * @class
 * @return {X509} A cursor instance
 */
var X509 = function(bson) {
  this.bson = bson;
  this.authStore = [];
};

/**
 * Authenticate
 * @method
 * @param {function} runCommand A method called to run commands directly on a connection, bypassing any message queue
 * @param {[]Connections} connections Connections to authenticate using this authenticator
 * @param {string} db Name of the database
 * @param {string} username Username
 * @param {string} password Password
 * @param {authResultCallback} callback The callback to return the result from the authentication
 * @return {object}
 */
X509.prototype.auth = function(runCommand, connections, db, username, password, callback) {
  var self = this;
  // Total connections
  var count = connections.length;
  if (count === 0) return callback(null, null);

  // Valid connections
  var numberOfValidConnections = 0;
  var errorObject = null;

  // For each connection we need to authenticate
  while (connections.length > 0) {
    // Execute MongoCR
    var execute = function(connection) {
      // Let's start the sasl process
      var command = {
        authenticate: 1,
        mechanism: 'MONGODB-X509'
      };

      // Add username if specified
      if (username) {
        command.user = username;
      }

      // Let's start the process
      runCommand(connection, '$external.$cmd', command, (err, r) => {
        // Adjust count
        count = count - 1;

        // If we have an error
        if (err) {
          errorObject = err;
        } else if (r.result['$err']) {
          errorObject = r.result;
        } else if (r.result['errmsg']) {
          errorObject = r.result;
        } else {
          numberOfValidConnections = numberOfValidConnections + 1;
        }

        // We have authenticated all connections
        if (count === 0 && numberOfValidConnections > 0) {
          // Store the auth details
          addAuthSession(self.authStore, new AuthSession(db, username, password));
          // Return correct authentication
          callback(null, true);
        } else if (count === 0) {
          if (errorObject == null)
            errorObject = new MongoError(f('failed to authenticate using mongocr'));
          callback(errorObject, false);
        }
      });
    };

    var _execute = function(_connection) {
      process.nextTick(function() {
        execute(_connection);
      });
    };

    _execute(connections.shift());
  }
};

// Add to store only if it does not exist
var addAuthSession = function(authStore, session) {
  var found = false;

  for (var i = 0; i < authStore.length; i++) {
    if (authStore[i].equal(session)) {
      found = true;
      break;
    }
  }

  if (!found) authStore.push(session);
};

/**
 * Remove authStore credentials
 * @method
 * @param {string} db Name of database we are removing authStore details about
 * @return {object}
 */
X509.prototype.logout = function(dbName) {
  this.authStore = this.authStore.filter(function(x) {
    return x.db !== dbName;
  });
};

/**
 * Re authenticate pool
 * @method
 * @param {function} runCommand A method called to run commands directly on a connection, bypassing any message queue
 * @param {[]Connections} connections Connections to authenticate using this authenticator
 * @param {authResultCallback} callback The callback to return the result from the authentication
 * @return {object}
 */
X509.prototype.reauthenticate = function(runCommand, connections, callback) {
  var authStore = this.authStore.slice(0);
  var count = authStore.length;
  if (count === 0) return callback(null, null);
  // Iterate over all the auth details stored
  for (var i = 0; i < authStore.length; i++) {
    this.auth(
      runCommand,
      connections,
      authStore[i].db,
      authStore[i].username,
      authStore[i].password,
      function(err) {
        count = count - 1;
        // Done re-authenticating
        if (count === 0) {
          callback(err, null);
        }
      }
    );
  }
};

/**
 * This is a result from a authentication strategy
 *
 * @callback authResultCallback
 * @param {error} error An error object. Set to null if no error present
 * @param {boolean} result The result of the authentication process
 */

module.exports = X509;
