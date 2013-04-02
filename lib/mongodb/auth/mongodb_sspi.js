var DbCommand = require('../commands/db_command').DbCommand
  , utils = require('../utils')
  , format = require('util').format;

// Kerberos class
var Kerberos = null;
// Try to grab the Kerberos class
try {
    Kerberos = require('kerberos').Kerberos
  , SecurityCredentials = require('kerberos').SSPI.SecurityCredentials
  , SecurityContext = require('kerberos').SSPI.SecurityContext
  , SecurityBuffer = require('kerberos').SSPI.SecurityBuffer
  , SecurityBufferDescriptor = require('kerberos').SSPI.SecurityBufferDescriptor;
} catch(err) {}

// console.log("-------------------------------------------------------")
// console.dir(SecurityContext)
// console.dir(SecurityContext.initialize)
// console.dir(new SecurityContext())

var authenticate = function(db, username, password, authdb, options, callback) {
  var numberOfConnections = 0;
  var errorObject = null;  
  // We don't have the Kerberos library
  if(Kerberos == null) return callback(new Error("Kerberos library is not installed"));

  if(options['connection'] != null) {
    //if a connection was explicitly passed on options, then we have only one...
    numberOfConnections = 1;
  } else {
    // Get the amount of connections in the pool to ensure we have authenticated all comments
    numberOfConnections = db.serverConfig.allRawConnections().length;
    options['onAll'] = true;
  }

  var connection = db.serverConfig.allRawConnections()[0];

  var command = {
      saslStart: 1
    , mechanism: 'GSSAPI'
    , payload: ''
    , autoAuthorize: 1
  };

  // Execute first sasl step
  db._executeQueryCommand(DbCommand.createDbCommand(db, command, {}, '$external'), {connection:connection}, function(err, doc) {
    if(err) return callback(err);
    doc = doc.documents[0];

    console.log("=========================================================");
    console.log("========= authenticate 0");
    console.log("=========================================================");
    console.dir(err);
    console.dir(doc);

    // Aquire security credentials
    var security_credentials = SecurityCredentials.aquire_kerberos(username, password);
    console.log("=========================================================");
    console.log("========= security credential 0");    
    console.log("=========================================================");
    console.dir(security_credentials)

    // Set up service principal
    var target = format("mongodb/%s", connection.socketOptions.host);
    // Initialize the security context
    console.dir(doc)
    console.log("=========================================================");
    console.log("========= security context 0")
    console.log("=========================================================");
    var security_context = SecurityContext.initialize(security_credentials, target, doc.payload);
    console.dir(security_context.payload)

    // Perform the next step against mongod
    var command = {
        saslContinue: 1
      , conversationId: doc.conversationId
      , payload: security_context.payload
    };

    // Execute the command
    db._executeQueryCommand(DbCommand.createDbCommand(db, command, {}, '$external'), {connection:connection}, function(err, doc) {
      if(err) return callback(err);
      doc = doc.documents[0];

      console.log("=========================================================");
      console.log("========= authenticate 1");
      console.log("=========================================================");
      console.dir(err);
      console.dir(doc);
      // Let's perform a step
      security_context.initialize(target, doc.payload);
      console.log("=========================================================");
      console.log("========= security context 1")
      console.log("=========================================================");
      console.dir(security_context.payload)

      // Perform the next step against mongod
      var command = {
          saslContinue: 1
        , conversationId: doc.conversationId
        , payload: security_context.payload
      };

      // Execute the command
      db._executeQueryCommand(DbCommand.createDbCommand(db, command, {}, '$external'), {connection:connection}, function(err, doc) {
        if(err) return callback(err);
        doc = doc.documents[0];
        
        console.log("=========================================================");
        console.log("========= authenticate 2");
        console.log("=========================================================");
        console.dir(err);
        console.dir(doc);

        var messageLength = 0;
        // Get the raw bytes
        var encryptedBytes = new Buffer(doc.payload, 'base64');
        var encryptedMessage = new Buffer(messageLength);
        // Copy first byte
        encryptedBytes.copy(encryptedMessage, 0, 0, messageLength);
        console.log("================================== decryptMEssage")
        console.dir(encryptedMessage)

        var securityTrailerLength = encryptedBytes.length - messageLength;
        var securityTrailer = new Buffer(securityTrailerLength);
        encryptedBytes.copy(securityTrailer, 0, messageLength, securityTrailerLength);

        var buffers = [
            new SecurityBuffer(SecurityBuffer.DATA, encryptedBytes)
          , new SecurityBuffer(SecurityBuffer.STREAM, securityTrailer)
        ];

        console.log("****************************************************")
        console.dir(encryptedBytes)
        console.dir(securityTrailer)

        var descriptor = new SecurityBufferDescriptor(buffers);


        // Decrypt the message
        security_context.decryptMessage(descriptor);
        console.log("=========================================================");
        console.log("========= security context 2")
        console.log("=========================================================");
        console.dir(security_context.payload)

        var length = 4;
        if(username != null) {
          length += username.length;          
        }

        var bytesReceivedFromServer = new Buffer(length);
        bytesReceivedFromServer[0] = 0x01;  // NO_PROTECTION
        bytesReceivedFromServer[1] = 0x00;  // NO_PROTECTION
        bytesReceivedFromServer[2] = 0x00;  // NO_PROTECTION
        bytesReceivedFromServer[3] = 0x00;  // NO_PROTECTION        

        if(username != null) {
          var authorization_id_bytes = new Buffer(username, 'utf8');
          authorization_id_bytes.copy(bytesReceivedFromServer, 4, 0);
        }

        console.log(bytesReceivedFromServer.toString('base64'))
        console.log("=========================================================");
        console.log("========= security context 3")
        console.log("=========================================================");
        // Get the sizes
        var sizes = security_context.queryContextAttributes(0x00);
        console.dir(sizes)

        var buffers = [
            new SecurityBuffer(SecurityBuffer.TOKEN, new Buffer(sizes.securityTrailer))
          , new SecurityBuffer(SecurityBuffer.DATA, bytesReceivedFromServer)
          , new SecurityBuffer(SecurityBuffer.PADDING, new Buffer(sizes.blockSize))
        ]

        var descriptor = new SecurityBufferDescriptor(buffers);

        // Encrypt the data
        security_context.encryptMessage(descriptor, 0x80000001);
        console.log("=========================================================");
        console.log("========= security context 4")
        console.log("=========================================================");
        console.dir(security_context.payload)

        // Perform the next step against mongod
        var command = {
            saslContinue: 1
          , conversationId: doc.conversationId
          , payload: security_context.payload
        };

        // Execute the command
        db._executeQueryCommand(DbCommand.createDbCommand(db, command, {}, '$external'), {connection:connection}, function(err, doc) {
          console.log("=========================================================");
          console.log("========= authenticate 3");
          console.log("=========================================================");
          console.dir(err);
          console.dir(doc);
          // if(err) return callback(err);
          // doc = doc.documents[0];
        });        
      });
    });

    // // console.dir(new SecurityContext())
    // console.dir(new SecurityContext().encryptMessage)
    // // console.dir(security_context.initialize)
    // // console.dir(security_context.payload)
    // // console.dir(security_context.encryptMessage )
    // console.dir(new SecurityBuffer(SecurityBuffer.DATA, 100).toBuffer);
  });


  return


  var numberOfConnections = 0;
  var errorObject = null;  
  // We don't have the Kerberos library
  if(Kerberos == null) return callback(new Error("Kerberos library is not installed"));

  if(options['connection'] != null) {
    //if a connection was explicitly passed on options, then we have only one...
    numberOfConnections = 1;
  } else {
    // Get the amount of connections in the pool to ensure we have authenticated all comments
    numberOfConnections = db.serverConfig.allRawConnections().length;
    options['onAll'] = true;
  }

  console.log("=================================== SSPI")

  var connection = db.serverConfig.allRawConnections()[0];

  var command = {
      saslStart: 1
    , mechanism: 'GSSAPI'
    , payload: ''
    , autoAuthorize: 1
  };

  // Execute first sasl step
  db._executeQueryCommand(DbCommand.createDbCommand(db, command, {}, '$external'), {connection:connection}, function(err, doc) {
    // console.log("========= authenticate 0");
    // console.dir(err);
    // console.dir(doc);

    doc = doc.documents[0];

    var kerberos = new Kerberos();
    console.dir(kerberos.acquireAlternateCredentials(username, password));
    // Target
    var target = format("mongodb/%s", connection.socketOptions.host);
    // Get payload
    var payload = kerberos.prepareOutboundPackage(target);
    // console.log("========= authenticate 1");
    // console.log(payload);
    console.log("============================== payload sspi")
    console.log(payload)

    // // Perform initiate context
    // console.dir(kerberos.prepareOutboundPackage(target));
  
    // Build Authentication command to send to MongoDB
    var command = {
        saslContinue: 1
      , conversationId: doc.conversationId
      , payload: payload
    };

    // Execute the command
    db._executeQueryCommand(DbCommand.createDbCommand(db, command, {}, '$external'), {connection:connection}, function(err, doc) {
      // console.log("========= authenticate 2");
      // console.dir(err);
      // console.dir(doc);

      doc = doc.documents[0];
      payload = doc.payload;
      console.log("============================== payload mongodb")
      console.log(payload)

      var payload = kerberos.prepareOutboundPackage(target, payload);
      // console.log("========= authenticate 3");
      // console.log(payload)

      console.log("============================== payload sspi")
      console.log(payload)

      var command = {
          saslContinue: 1
        , conversationId: doc.conversationId
        , payload: ''
      };

      db._executeQueryCommand(DbCommand.createDbCommand(db, command, {}, '$external'), {connection:connection}, function(err, doc) {
        // console.log("========= authenticate 4");
        // console.dir(err);
        // console.dir(doc);

        doc = doc.documents[0];
        payload = doc.payload;

        console.log("============================== payload mongodb")
        console.log(payload)

        var payload = kerberos.decryptMessage(payload);

        console.log("============================== payload decrypt")
        console.log(payload)

        console.dir(kerberos.queryContextAttribute(0x00));

        // payload = kerberos.encryptMessage(payload, username);

        console.log("============================== payload encrypt")
        console.log(payload)

        // var payload = kerberos.prepareOutboundPackage(target, payload);

        // console.log("============================== payload sspi")
        // console.log(payload)

        // // console.log("========= authenticate 5");
        // // console.log(payload)

        // var command = {
        //     saslContinue: 1
        //   , conversationId: doc.conversationId
        //   , payload: payload
        // };

        // db._executeQueryCommand(DbCommand.createDbCommand(db, command, {}, '$external'), {connection:connection}, function(err, doc) {
        //   console.log("============================== payload mongodb")
        //   console.log(payload)

        //   // console.log("========= authenticate 6");
        //   // console.dir(err);
        //   // console.dir(doc);
        // });
      });
    });
  });


  //
  // TODO: Authenticate all connections with the credentials
  // TODO: Ensure correct Re-Authentication of all connections on reconnects using GSSAPI
  //
  // var connections = db.serverConfig.allRawConnections();
  // var error = null;
  // // Authenticate all connections
  // for(var i = 0; i < numberOfConnections; i++) {

    // // Start Auth process for a connection
    // GSSAPIInitialize(db, username, password, authdb, connections[i], function(err, result) {
    //   // Adjust number of connections left to connect
    //   numberOfConnections = numberOfConnections - 1;
    //   // If we have an error save it
    //   if(err) error = err;

    //   // We are done
    //   if(numberOfConnections == 0) {
    //     if(err) return callback(err, false);
    //     // We authenticated correctly save the credentials
    //     db.auths = [{'username':username, 'password':password, 'authdb': authdb, 'authMechanism': 'GSSAPI'}];
    //     // Return valid callback
    //     return callback(null, true);
    //   }
    // });    
  // }
}

// //
// // Initialize step
// var GSSAPIInitialize = function(db, username, password, authdb, connection, callback) {
//   // Create Kerberos instance
//   var kerberos = new Kerberos();
//   // Right let's get sasl going
//   var connection = db.serverConfig.checkoutWriter();
//   // Create connection string
//   var kerberos_connection_string = format("mongodb@%s", db.serverConfig.host);
//   // Start the kerberos process
//   kerberos.authGSSClientInit(kerberos_connection_string, Kerberos.GSS_C_MUTUAL_FLAG, function(err, context) {
//     if(err) return callback(err, false);

//     // Let's perform the first step
//     kerberos.authGSSClientStep(context, '', function(err, result) {
//       if(err) return callback(err, false);
//       // Call next step
//       MongoDBGSSAPIFirstStep(kerberos, context, db, username, password, authdb, connection, callback);
//     });
//   });
// }

// //
// // Perform first step against mongodb
// var MongoDBGSSAPIFirstStep = function(kerberos, context, db, username, password, authdb, connection, callback) {
//   // Grab the payload
//   var payload = context.response;
//   // Build the sasl start command
//   var command = {
//       saslStart: 1
//     , mechanism: 'GSSAPI'
//     , payload: payload
//     , autoAuthorize: 1
//   };

//   // Execute first sasl step
//   db._executeQueryCommand(DbCommand.createDbCommand(db, command, {}, '$external'), {connection:connection}, function(err, doc) {
//     if(err) return callback(err, false);
//     // Get the payload
//     doc = doc.documents[0];
//     var db_payload = doc.payload;
    
//     // Show payload
//     kerberos.authGSSClientStep(context,  doc.payload, function(err, result) {
//       if(err) return callback(err, false);
//       // MongoDB API Second Step
//       MongoDBGSSAPISecondStep(kerberos, context, doc, db, username, password, authdb, connection, callback);
//     });
//   });
// }

// //
// // Perform first step against mongodb
// var MongoDBGSSAPISecondStep = function(kerberos, context, doc, db, username, password, authdb, connection, callback) {
//   // Get the payload
//   var payload = context.response || '';

//   // Build Authentication command to send to MongoDB
//   var command = {
//       saslContinue: 1
//     , conversationId: doc.conversationId
//     , payload: payload
//   };

//   // Execute the command
//   db._executeQueryCommand(DbCommand.createDbCommand(db, command, {}, '$external'), {connection:connection}, function(err, doc) {
//     if(err) return callback(err, false);

//     // Get the result document
//     doc = doc.documents[0];
    
//     // GSS Client Unwrap
//     kerberos.authGSSClientUnwrap(context, doc.payload, function(err, result) {
//       if(err) return callback(err, false);

//       var payload = context.response;
//       // Wrap the response
//       kerberos.authGSSClientWrap(context, payload, username, function(err, result) {
//         if(err) return callback(err, false);

//         // Call the last and third step
//         MongoDBGSSAPIThirdStep(kerberos, context, doc, db, username, password, authdb, connection, callback);
//       });
//     });
//   });
// }

// var MongoDBGSSAPIThirdStep = function(kerberos, context, doc, db, username, password, authdb, connection, callback) {
//   var payload = context.response;

//   // Build final command
//   var command = {
//       saslContinue: 1
//     , conversationId: doc.conversationId
//     , payload: payload
//   };

//   // Let's finish the auth process against mongodb
//   db._executeQueryCommand(DbCommand.createDbCommand(db, command, {}, '$external'), {connection:connection}, function(err, doc) {
//     if(err) return callback(err, false);

//     // Clean up context
//     kerberos.authGSSClientClean(context, function(err, result) {
//       if(err) return callback(err, false);
//       callback(null, true);
//     });
//   });
// }

exports.authenticate = authenticate;