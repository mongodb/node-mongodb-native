var f = require('util').format
  , crypto = require('crypto')
  , MongoError = require('../error');

var AuthSession = function(db, username, password, options) {
  this.db = db;
  this.username = username;
  this.password = password;
  this.options = options;

  this.equal = function(session) {
    return session.db == this.db 
      && session.username == this.username
      && session.password == this.password;
  }
}

// Kerberos class
var Kerberos = null;
var MongoAuthProcess = null;

// Try to grab the Kerberos class
try {
  Kerberos = require('kerberos').Kerberos
  // Authentication process for Mongo
  MongoAuthProcess = require('kerberos').processes.MongoAuthProcess
} catch(err) {}

/**
 * Creates a new MongoCR authentication mechanism
 * @class
 * @return {MongoCR} A cursor instance
 */
var GSSAPI = function() {
  var authStore = [];

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
  this.auth = function(server, pool, db, username, password, options, callback) {
    // We don't have the Kerberos library
    if(Kerberos == null) return callback(new Error("Kerberos library is not installed"));  
    var gssapiServiceName = options['gssapiServiceName'] || 'mongodb';
    // console.log("########################################### AUTH")
    // console.log("########################################### AUTH")
    // console.log("########################################### AUTH")
    // console.dir(username)
    // console.dir(password)
    // console.dir(callback)
    // Get all the connections
    var connections = pool.getAll();
    // console.log("########################################### AUTH -1 :: " + connections.length)
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
        // console.log("########################################### AUTH 0")
        // Let's start the sasl process
        var command = {
            authenticate: 1
          , mechanism: 'MONGODB-X509'
          , user: username
        };

        // console.log("########################################### AUTH 1")
        // Let's start the process
        server.command("$external.$cmd"
          , command
          , { connection: connection }, function(err, r) {
        // console.log("########################################### AUTH 2")
        // console.dir(err)
        // console.dir(r)
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
        // console.log("########################################### AUTH 3")
            // Store the auth details
            addAuthSession(new AuthSession(db, username, password));
            // Return correct authentication
            callback(null, true);
          } else if(count == 0) {
        // console.log("########################################### AUTH 4")
        // console.log(callback.toString())
            if(errorObject == null) errorObject = new MongoError(f("failed to authenticate using mongocr"));
            callback(errorObject, false);
          }
        });
      }

      // Get the connection
      execute(connections.shift());
    }
  }

  //
  // Initialize step
  var GSSAPIInitialize = function(db, username, password, authdb, gssapiServiceName, connection, callback) {
    // Create authenticator
    var mongo_auth_process = new MongoAuthProcess(connection.socketOptions.host, connection.socketOptions.port, gssapiServiceName);

    // Perform initialization
    mongo_auth_process.init(username, password, function(err, context) {
      if(err) return callback(err, false);

      // Perform the first step
      mongo_auth_process.transition('', function(err, payload) {
        if(err) return callback(err, false);

        // Call the next db step
        MongoDBGSSAPIFirstStep(mongo_auth_process, payload, db, username, password, authdb, connection, callback);
      });
    });
  }

  //
  // Perform first step against mongodb
  var MongoDBGSSAPIFirstStep = function(mongo_auth_process, payload, db, username, password, authdb, connection, callback) {
    // Build the sasl start command
    var command = {
        saslStart: 1
      , mechanism: 'GSSAPI'
      , payload: payload
      , autoAuthorize: 1
    };

    // Execute first sasl step
    db._executeQueryCommand(DbCommand.createDbCommand(db, command, {}, '$external'), {connection:connection}, function(err, doc) {
      if(err) return callback(err, false);
      // Get the payload
      doc = doc.documents[0];
      var db_payload = doc.payload;

      mongo_auth_process.transition(doc.payload, function(err, payload) {
        if(err) return callback(err, false);

        // MongoDB API Second Step
        MongoDBGSSAPISecondStep(mongo_auth_process, payload, doc, db, username, password, authdb, connection, callback);
      });
    });
  }

  //
  // Perform first step against mongodb
  var MongoDBGSSAPISecondStep = function(mongo_auth_process, payload, doc, db, username, password, authdb, connection, callback) {
    // Build Authentication command to send to MongoDB
    var command = {
        saslContinue: 1
      , conversationId: doc.conversationId
      , payload: payload
    };

    // Execute the command
    db._executeQueryCommand(DbCommand.createDbCommand(db, command, {}, '$external'), {connection:connection}, function(err, doc) {
      if(err) return callback(err, false);

      // Get the result document
      doc = doc.documents[0];

      // Call next transition for kerberos
      mongo_auth_process.transition(doc.payload, function(err, payload) {
        if(err) return callback(err, false);

        // Call the last and third step
        MongoDBGSSAPIThirdStep(mongo_auth_process, payload, doc, db, username, password, authdb, connection, callback);
      });    
    });
  }

  var MongoDBGSSAPIThirdStep = function(mongo_auth_process, payload, doc, db, username, password, authdb, connection, callback) {
    // Build final command
    var command = {
        saslContinue: 1
      , conversationId: doc.conversationId
      , payload: payload
    };

    // Let's finish the auth process against mongodb
    db._executeQueryCommand(DbCommand.createDbCommand(db, command, {}, '$external'), {connection:connection}, function(err, doc) {
      if(err) return callback(err, false);

      mongo_auth_process.transition(null, function(err, payload) {
        if(err) return callback(err, false);
        callback(null, true);
      });
    });
  }

  // Add to store only if it does not exist
  var addAuthSession = function(session) {
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
  this.reauthenticate = function(server, pool, callback) {
    var count = authStore.length;
    if(count == 0) return callback(null, null);
    // Iterate over all the auth details stored
    for(var i = 0; i < authStore.length; i++) {
      this.auth(server, pool, authStore[i].db, authStore[i].username, authStore[i].password, authStore[i].options, function(err, r) {
        count = count - 1;
        // Done re-authenticating
        if(count == 0) {
          callback(null, null);
        }
      });
    }
  }
}

/**
 * This is a result from a authentication strategy
 *
 * @callback authResultCallback
 * @param {error} error An error object. Set to null if no error present
 * @param {boolean} result The result of the authentication process
 */

module.exports = GSSAPI;