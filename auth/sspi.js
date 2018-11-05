'use strict';

const f = require('util').format;
const Query = require('../connection/commands').Query;
const MongoError = require('../error').MongoError;
const retrieveKerberos = require('../utils').retrieveKerberos;

var AuthSession = function(db, username, password, options) {
  this.db = db;
  this.username = username;
  this.password = password;
  this.options = options;
};

AuthSession.prototype.equal = function(session) {
  return (
    session.db === this.db &&
    session.username === this.username &&
    session.password === this.password
  );
};

/**
 * Creates a new SSPI authentication mechanism
 * @class
 * @return {SSPI} A cursor instance
 */
var SSPI = function(bson) {
  this.bson = bson;
  this.authStore = [];
};

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
  let kerberos;
  try {
    kerberos = retrieveKerberos();
  } catch (e) {
    return callback(e, null);
  }

  var gssapiServiceName = options['gssapiServiceName'] || 'mongodb';
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
      // Start Auth process for a connection
      SSIPAuthenticate(
        self,
        kerberos.processes.MongoAuthProcess,
        username,
        password,
        gssapiServiceName,
        server,
        connection,
        options,
        function(err, r) {
          // Adjust count
          count = count - 1;

          // If we have an error
          if (err) {
            errorObject = err;
          } else if (r && typeof r === 'object' && r.result['$err']) {
            errorObject = r.result;
          } else if (r && typeof r === 'object' && r.result['errmsg']) {
            errorObject = r.result;
          } else {
            numberOfValidConnections = numberOfValidConnections + 1;
          }

          // We have authenticated all connections
          if (count === 0 && numberOfValidConnections > 0) {
            // Store the auth details
            addAuthSession(self.authStore, new AuthSession(db, username, password, options));
            // Return correct authentication
            callback(null, true);
          } else if (count === 0) {
            if (errorObject == null)
              errorObject = new MongoError(f('failed to authenticate using mongocr'));
            callback(errorObject, false);
          }
        }
      );
    };

    var _execute = function(_connection) {
      process.nextTick(function() {
        execute(_connection);
      });
    };

    _execute(connections.shift());
  }
};

function SSIPAuthenticate(
  self,
  MongoAuthProcess,
  username,
  password,
  gssapiServiceName,
  server,
  connection,
  options,
  callback
) {
  const authProcess = new MongoAuthProcess(
    connection.host,
    connection.port,
    gssapiServiceName,
    options
  );

  function authCommand(command, authCb) {
    const query = new Query(self.bson, '$external.$cmd', command, {
      numberToSkip: 0,
      numberToReturn: 1
    });

    server(connection, query, authCb);
  }

  authProcess.init(username, password, err => {
    if (err) return callback(err, false);

    authProcess.transition('', (err, payload) => {
      if (err) return callback(err, false);

      const command = {
        saslStart: 1,
        mechanism: 'GSSAPI',
        payload,
        autoAuthorize: 1
      };

      authCommand(command, (err, result) => {
        if (err) return callback(err, false);
        const doc = result.result;

        authProcess.transition(doc.payload, (err, payload) => {
          if (err) return callback(err, false);
          const command = {
            saslContinue: 1,
            conversationId: doc.conversationId,
            payload
          };

          authCommand(command, (err, result) => {
            if (err) return callback(err, false);
            const doc = result.result;

            authProcess.transition(doc.payload, (err, payload) => {
              if (err) return callback(err, false);
              const command = {
                saslContinue: 1,
                conversationId: doc.conversationId,
                payload
              };

              authCommand(command, (err, response) => {
                if (err) return callback(err, false);

                authProcess.transition(null, err => {
                  if (err) return callback(err, null);
                  callback(null, response);
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
SSPI.prototype.logout = function(dbName) {
  this.authStore = this.authStore.filter(function(x) {
    return x.db !== dbName;
  });
};

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
  var count = authStore.length;
  if (count === 0) return callback(null, null);
  // Iterate over all the auth details stored
  for (var i = 0; i < authStore.length; i++) {
    this.auth(
      server,
      connections,
      authStore[i].db,
      authStore[i].username,
      authStore[i].password,
      authStore[i].options,
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

module.exports = SSPI;
