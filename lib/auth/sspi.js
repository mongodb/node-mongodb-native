"use strict";

var f = require('util').format
  , crypto = require('crypto')
  , require_optional = require('require_optional')
  , MongoError = require('../error');

var AuthSession = function(db, username, password, options) {
  this.db = db;
  this.username = username;
  this.password = password;
  this.options = options;
}

AuthSession.prototype.equal = function(session) {
  return session.db == this.db
    && session.username == this.username
    && session.password == this.password;
}

// Kerberos class
var Kerberos = null;
var MongoAuthProcess = null;

// Try to grab the Kerberos class
try {
  Kerberos = require_optional('kerberos').Kerberos
  // Authentication process for Mongo
  MongoAuthProcess = require_optional('kerberos').processes.MongoAuthProcess
} catch(err) {
  console.dir(err)
}

/**
 * Creates a new SSPI authentication mechanism
 * @class
 * @return {SSPI} A cursor instance
 */
var SSPI = function() {
  this.authStore = [];
}

/**
 * Authenticate
 * @method
 * @param {{Server}|{ReplSet}|{Mongos}} server Topology the authentication method is being called on
 * @param {[]Connections} connections Connections to authenticate using this authenticator
 * @param {string} db Name of the database
 * @param {string} username Username
 * @param {string} password Password
 * @param {authResultCallback} callback The callback to return the result from the authentication
 * @return {object}
 */
SSPI.prototype.auth = function(server, connections, db, username, password, options, callback) {
  var self = this;
  // We don't have the Kerberos library
  if(Kerberos == null) return callback(new Error("Kerberos library is not installed"));
  var gssapiServiceName = options['gssapiServiceName'] || 'mongodb';
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
      // Start Auth process for a connection
      SSIPAuthenticate(username, password, gssapiServiceName, server, connection, function(err, r) {
        // Adjust count
        count = count - 1;

        // If we have an error
        if(err) {
          errorObject = err;
        } else if(r && typeof r == 'object' && r.result['$err']) {
          errorObject = r.result;
        } else if(r && typeof r == 'object' && r.result['errmsg']) {
          errorObject = r.result;
        } else {
          credentialsValid = true;
          numberOfValidConnections = numberOfValidConnections + 1;
        }

        // We have authenticated all connections
        if(count == 0 && numberOfValidConnections > 0) {
          // Store the auth details
          addAuthSession(self.authStore, new AuthSession(db, username, password, options));
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

var SSIPAuthenticate = function(username, password, gssapiServiceName, server, connection, callback) {
  // Build Authentication command to send to MongoDB
  var command = {
      saslStart: 1
    , mechanism: 'GSSAPI'
    , payload: ''
    , autoAuthorize: 1
  };

  // Create authenticator
  var mongo_auth_process = new MongoAuthProcess(connection.host, connection.port, gssapiServiceName);

  // Execute first sasl step
  server.command("$external.$cmd"
    , command
    , { connection: connection }, function(err, r) {
    if(err) return callback(err, false);
    var doc = r.result;

    mongo_auth_process.init(username, password, function(err) {
      if(err) return callback(err);

      mongo_auth_process.transition(doc.payload, function(err, payload) {
        if(err) return callback(err);

        // Perform the next step against mongod
        var command = {
            saslContinue: 1
          , conversationId: doc.conversationId
          , payload: payload
        };

        // Execute the command
        server.command("$external.$cmd"
          , command
          , { connection: connection }, function(err, r) {
          if(err) return callback(err, false);
          var doc = r.result;

          mongo_auth_process.transition(doc.payload, function(err, payload) {
            if(err) return callback(err);

            // Perform the next step against mongod
            var command = {
                saslContinue: 1
              , conversationId: doc.conversationId
              , payload: payload
            };

            // Execute the command
            server.command("$external.$cmd"
              , command
              , { connection: connection }, function(err, r) {
              if(err) return callback(err, false);
              var doc = r.result;

              mongo_auth_process.transition(doc.payload, function(err, payload) {
                // Perform the next step against mongod
                var command = {
                    saslContinue: 1
                  , conversationId: doc.conversationId
                  , payload: payload
                };

                // Execute the command
                server.command("$external.$cmd"
                  , command
                  , { connection: connection }, function(err, r) {
                  if(err) return callback(err, false);
                  var doc = r.result;

                  if(doc.done) return callback(null, true);
                  callback(new Error("Authentication failed"), false);
                });
              });
            });
          });
        });
      });
    });
  });
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
 * @param {[]Connections} connections Connections to authenticate using this authenticator
 * @param {authResultCallback} callback The callback to return the result from the authentication
 * @return {object}
 */
SSPI.prototype.reauthenticate = function(server, connections, callback) {
  var authStore = this.authStore.slice(0);
  var err = null;
  var count = authStore.length;
  if(count == 0) return callback(null, null);
  // Iterate over all the auth details stored
  for(var i = 0; i < authStore.length; i++) {
    this.auth(server, connections, authStore[i].db, authStore[i].username, authStore[i].password, authStore[i].options, function(err, r) {
      if(err) err = err;
      count = count - 1;
      // Done re-authenticating
      if(count == 0) {
        callback(err, null);
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

module.exports = SSPI;
