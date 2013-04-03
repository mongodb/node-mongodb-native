var DbCommand = require('../commands/db_command').DbCommand
  , utils = require('../utils')
  , format = require('util').format;

// Kerberos class
var Kerberos = null;
// Try to grab the Kerberos class
try {
  Kerberos = require('kerberos').Kerberos
  // , SecurityCredentials = require('kerberos').SSPI.SecurityCredentials
  // , SecurityContext = require('kerberos').SSPI.SecurityContext
  // , SecurityBuffer = require('kerberos').SSPI.SecurityBuffer
  // , SecurityBufferDescriptor = require('kerberos').SSPI.SecurityBufferDescriptor

  // Authentication process for Mongo
  MongoAuthProcess = require('kerberos').processes.MongoAuthProcess
} catch(err) {console.dir(err)}

// console.dir(require('kerberos').processes.MongoAuthProcess)

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

  // --------------------------------------------------------------
  // Async Version
  // --------------------------------------------------------------
  var command = {
      saslStart: 1
    , mechanism: 'GSSAPI'
    , payload: ''
    , autoAuthorize: 1
  };

  // Create authenticator
  var mongo_auth_process = new MongoAuthProcess(connection.socketOptions.host, connection.socketOptions.port);

  // Execute first sasl step
  db._executeQueryCommand(DbCommand.createDbCommand(db, command, {}, '$external'), {connection:connection}, function(err, doc) {
    if(err) return callback(err);
    doc = doc.documents[0];

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
        db._executeQueryCommand(DbCommand.createDbCommand(db, command, {}, '$external'), {connection:connection}, function(err, doc) {
          if(err) return callback(err);
          doc = doc.documents[0];

          mongo_auth_process.transition(doc.payload, function(err, payload) {
            if(err) return callback(err);

            // Perform the next step against mongod
            var command = {
                saslContinue: 1
              , conversationId: doc.conversationId
              , payload: payload
            };

            // Execute the command
            db._executeQueryCommand(DbCommand.createDbCommand(db, command, {}, '$external'), {connection:connection}, function(err, doc) {
              if(err) return callback(err);
              doc = doc.documents[0];
              
              mongo_auth_process.transition(doc.payload, function(err, payload) {
                // Perform the next step against mongod
                var command = {
                    saslContinue: 1
                  , conversationId: doc.conversationId
                  , payload: payload
                };

                // Execute the command
                db._executeQueryCommand(DbCommand.createDbCommand(db, command, {}, '$external'), {connection:connection}, function(err, doc) {
                  if(err) return callback(err);
                  doc = doc.documents[0];

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

  // // --------------------------------------------------------------
  // // Sync Version
  // // --------------------------------------------------------------
  // var command = {
  //     saslStart: 1
  //   , mechanism: 'GSSAPI'
  //   , payload: ''
  //   , autoAuthorize: 1
  // };

  // // Execute first sasl step
  // db._executeQueryCommand(DbCommand.createDbCommand(db, command, {}, '$external'), {connection:connection}, function(err, doc) {
  //   if(err) return callback(err);
  //   doc = doc.documents[0];

  //   console.log("=========================================================");
  //   console.log("========= authenticate 0");
  //   console.log("=========================================================");
  //   console.dir(err);
  //   console.dir(doc);

  //   // Aquire security credentials
  //   var security_credentials = SecurityCredentials.aquire_kerberos(username, password);
  //   console.log("=========================================================");
  //   console.log("========= security credential 0");    
  //   console.log("=========================================================");
  //   console.dir(security_credentials)

  //   // Set up service principal
  //   var target = format("mongodb/%s", connection.socketOptions.host);
  //   // Initialize the security context
  //   console.dir(doc)
  //   console.log("=========================================================");
  //   console.log("========= security context 0")
  //   console.log("=========================================================");
  //   var security_context = SecurityContext.initializeSync(security_credentials, target, doc.payload);
  //   console.dir(security_context.payload)

  //   // Perform the next step against mongod
  //   var command = {
  //       saslContinue: 1
  //     , conversationId: doc.conversationId
  //     , payload: security_context.payload
  //   };

  //   // Execute the command
  //   db._executeQueryCommand(DbCommand.createDbCommand(db, command, {}, '$external'), {connection:connection}, function(err, doc) {
  //     if(err) return callback(err);
  //     doc = doc.documents[0];

  //     console.log("=========================================================");
  //     console.log("========= authenticate 1");
  //     console.log("=========================================================");
  //     console.dir(err);
  //     console.dir(doc);
  //     // Let's perform a step
  //     security_context.initializeSync(target, doc.payload);
  //     console.log("=========================================================");
  //     console.log("========= security context 1")
  //     console.log("=========================================================");
  //     console.dir(security_context.payload)

  //     // Perform the next step against mongod
  //     var command = {
  //         saslContinue: 1
  //       , conversationId: doc.conversationId
  //       , payload: security_context.payload
  //     };

  //     // Execute the command
  //     db._executeQueryCommand(DbCommand.createDbCommand(db, command, {}, '$external'), {connection:connection}, function(err, doc) {
  //       if(err) return callback(err);
  //       doc = doc.documents[0];
        
  //       console.log("=========================================================");
  //       console.log("========= authenticate 2");
  //       console.log("=========================================================");
  //       console.dir(err);
  //       console.dir(doc);

  //       var messageLength = 0;
  //       // Get the raw bytes
  //       var encryptedBytes = new Buffer(doc.payload, 'base64');
  //       var encryptedMessage = new Buffer(messageLength);
  //       // Copy first byte
  //       encryptedBytes.copy(encryptedMessage, 0, 0, messageLength);
  //       console.log("================================== decryptMEssage")
  //       console.dir(encryptedMessage)

  //       var securityTrailerLength = encryptedBytes.length - messageLength;
  //       var securityTrailer = new Buffer(securityTrailerLength);
  //       encryptedBytes.copy(securityTrailer, 0, messageLength, securityTrailerLength);

  //       var buffers = [
  //           new SecurityBuffer(SecurityBuffer.DATA, encryptedBytes)
  //         , new SecurityBuffer(SecurityBuffer.STREAM, securityTrailer)
  //       ];

  //       console.log("****************************************************")
  //       console.dir(encryptedBytes)
  //       console.dir(securityTrailer)

  //       var descriptor = new SecurityBufferDescriptor(buffers);


  //       // Decrypt the message
  //       security_context.decryptMessageSync(descriptor);
  //       console.log("=========================================================");
  //       console.log("========= security context 2")
  //       console.log("=========================================================");
  //       console.dir(security_context.payload)

  //       var length = 4;
  //       if(username != null) {
  //         length += username.length;          
  //       }

  //       var bytesReceivedFromServer = new Buffer(length);
  //       bytesReceivedFromServer[0] = 0x01;  // NO_PROTECTION
  //       bytesReceivedFromServer[1] = 0x00;  // NO_PROTECTION
  //       bytesReceivedFromServer[2] = 0x00;  // NO_PROTECTION
  //       bytesReceivedFromServer[3] = 0x00;  // NO_PROTECTION        

  //       if(username != null) {
  //         var authorization_id_bytes = new Buffer(username, 'utf8');
  //         authorization_id_bytes.copy(bytesReceivedFromServer, 4, 0);
  //       }

  //       console.log(bytesReceivedFromServer.toString('base64'))
  //       console.log("=========================================================");
  //       console.log("========= security context 3")
  //       console.log("=========================================================");
  //       // Get the sizes
  //       var sizes = security_context.queryContextAttributesSync(0x00);
  //       console.dir(sizes)

  //       var buffers = [
  //           new SecurityBuffer(SecurityBuffer.TOKEN, new Buffer(sizes.securityTrailer))
  //         , new SecurityBuffer(SecurityBuffer.DATA, bytesReceivedFromServer)
  //         , new SecurityBuffer(SecurityBuffer.PADDING, new Buffer(sizes.blockSize))
  //       ]

  //       var descriptor = new SecurityBufferDescriptor(buffers);

  //       // Encrypt the data
  //       security_context.encryptMessageSync(descriptor, 0x80000001);
  //       console.log("=========================================================");
  //       console.log("========= security context 4")
  //       console.log("=========================================================");
  //       console.dir(security_context.payload)

  //       // Perform the next step against mongod
  //       var command = {
  //           saslContinue: 1
  //         , conversationId: doc.conversationId
  //         , payload: security_context.payload
  //       };

  //       // Execute the command
  //       db._executeQueryCommand(DbCommand.createDbCommand(db, command, {}, '$external'), {connection:connection}, function(err, doc) {
  //         console.log("=========================================================");
  //         console.log("========= authenticate 3");
  //         console.log("=========================================================");
  //         console.dir(err);
  //         console.dir(doc);
  //         if(err) return callback(err);
  //         doc = doc.documents[0];

  //         if(doc.done) return callback(null, true);
  //         callback(new Error("Authentication failed"), false);
  //       });        
  //     });
  //   });
  // });
}

exports.authenticate = authenticate;