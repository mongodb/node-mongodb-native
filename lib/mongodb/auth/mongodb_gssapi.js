var DbCommand = require('../commands/db_command').DbCommand
  , utils = require('../utils')
  , format = require('util').format
  , Kerberos = require('kerberos').Kerberos;

var authenticate = function(db, username, password, authdb, options, callback) {
  var numberOfConnections = 0;
  var errorObject = null;  

  if(options['connection'] != null) {
    //if a connection was explicitly passed on options, then we have only one...
    numberOfConnections = 1;
  } else {
    // Get the amount of connections in the pool to ensure we have authenticated all comments
    numberOfConnections = db.serverConfig.allRawConnections().length;
    options['onAll'] = true;
  }

  //
  // TODO: Authenticate all connections with the credentials
  // TODO: Ensure correct Re-Authentication of all connections on reconnects using GSSAPI
  //
  var connections = db.serverConfig.allRawConnections();
  var error = null;
  // Authenticate all connections
  for(var i = 0; i < numberOfConnections; i++) {

    // Start Auth process for a connection
    GSSAPIInitialize(db, username, password, authdb, connections[i], function(err, result) {
      // Adjust number of connections left to connect
      numberOfConnections = numberOfConnections - 1;
      // If we have an error save it
      if(err) error = err;

      // We are done
      if(numberOfConnections == 0) {
        if(err) return callback(err, false);
        // We authenticated correctly save the credentials
        db.auths = [{'username':username, 'password':password, 'authdb': authdb, 'authMechanism': 'GSSAPI'}];
        // Return valid callback
        return callback(null, true);
      }
    });    
  }
}

//
// Initialize step
var GSSAPIInitialize = function(db, username, password, authdb, connection, callback) {
  // Create Kerberos instance
  var kerberos = new Kerberos();
  // Right let's get sasl going
  var connection = db.serverConfig.checkoutWriter();
  // Create connection string
  var kerberos_connection_string = format("mongodb@%s", db.serverConfig.host);
  // Start the kerberos process
  kerberos.authGSSClientInit(kerberos_connection_string, Kerberos.GSS_C_MUTUAL_FLAG, function(err, context) {
    if(err) return callback(err, false);

    // Let's perform the first step
    kerberos.authGSSClientStep(context, '', function(err, result) {
      if(err) return callback(err, false);
      // Call next step
      MongoDBGSSAPIFirstStep(kerberos, context, db, username, password, authdb, connection, callback);
    });
  });
}

//
// Perform first step against mongodb
var MongoDBGSSAPIFirstStep = function(kerberos, context, db, username, password, authdb, connection, callback) {
  // Grab the payload
  var payload = context.response;
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
    
    // Show payload
    kerberos.authGSSClientStep(context,  doc.payload, function(err, result) {
      if(err) return callback(err, false);
      // MongoDB API Second Step
      MongoDBGSSAPISecondStep(kerberos, context, doc, db, username, password, authdb, connection, callback);
    });
  });
}

//
// Perform first step against mongodb
var MongoDBGSSAPISecondStep = function(kerberos, context, doc, db, username, password, authdb, connection, callback) {
  // Get the payload
  var payload = context.response || '';

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
    
    // GSS Client Unwrap
    kerberos.authGSSClientUnwrap(context, doc.payload, function(err, result) {
      if(err) return callback(err, false);

      var payload = context.response;
      // Wrap the response
      kerberos.authGSSClientWrap(context, payload, username, function(err, result) {
        if(err) return callback(err, false);

        // Call the last and third step
        MongoDBGSSAPIThirdStep(kerberos, context, doc, db, username, password, authdb, connection, callback);
      });
    });
  });
}

var MongoDBGSSAPIThirdStep = function(kerberos, context, doc, db, username, password, authdb, connection, callback) {
  var payload = context.response;

  // Build final command
  var command = {
      saslContinue: 1
    , conversationId: doc.conversationId
    , payload: payload
  };

  // Let's finish the auth process against mongodb
  db._executeQueryCommand(DbCommand.createDbCommand(db, command, {}, '$external'), {connection:connection}, function(err, doc) {
    if(err) return callback(err, false);

    // Clean up context
    kerberos.authGSSClientClean(context, function(err, result) {
      if(err) return callback(err, false);
      callback(null, true);
    });
  });
}

exports.authenticate = authenticate;