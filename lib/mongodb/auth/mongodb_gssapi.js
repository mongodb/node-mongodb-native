var DbCommand = require('../commands/db_command').DbCommand
  , utils = require('../utils')
  , format = require('util').format
  , Kerberos = require('kerberos').Kerberos;



var authenticate = function(db, username, password, authdb, options, callback) {
  console.log("================ GSSAPI")
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

  // Let's attempt to establish a GSSAPI authenticated connection on a single connection first
  


  // Create Kerberos instance
  var kerberos = new Kerberos();
  console.dir(kerberos)

  // Right let's get sasl going
  var connection = db.serverConfig.checkoutWriter();
  // Create connection string
  var kerberos_connection_string = format("mongodb@%s", db.serverConfig.host);
  console.log(kerberos_connection_string)
  // Start the kerberos process
  kerberos.authGSSClientInit(kerberos_connection_string, Kerberos.GSS_C_MUTUAL_FLAG, function(err, context) {
    console.log("============================== authGSSClientInit")
    console.dir(err)
    console.dir(context)
    if(err) return callback(err);

    // Let's perform the first step
    kerberos.authGSSClientStep(context, '', function(err, result) {
      if(err) return callback(err);
      // Grab the payload
      var payload = context.response;
      // Build the sasl start command
      var command = {
          saslStart: 1
        , mechanism: 'GSSAPI'
        , payload: payload
        , autoAuthorize: 1
      }
    })
  })

  // // Execute all four
  // db._executeQueryCommand(DbCommand.createGetNonceCommand(db), options, function(err, result, connection) {
  //   // Execute on all the connections
  //   if(err == null) {
  //     // Nonce used to make authentication request with md5 hash
  //     var nonce = result.documents[0].nonce;
  //     // Execute command
  //     db._executeQueryCommand(DbCommand.createAuthenticationCommand(db, username, password, nonce, authdb), {connection:connection}, function(err, result) {
  //       // Count down
  //       numberOfConnections = numberOfConnections - 1;
  //       // Ensure we save any error
  //       if(err) {
  //         errorObject = err;
  //       } else if(result.documents[0].err != null || result.documents[0].errmsg != null){
  //         errorObject = utils.toError(result.documents[0]);
  //       }

  //       // Work around the case where the number of connections are 0
  //       if(numberOfConnections <= 0 && typeof callback == 'function') {
  //         var internalCallback = callback;
  //         callback = null;

  //         if(errorObject == null && result.documents[0].ok == 1) {
  //           // We authenticated correctly save the credentials
  //           db.auths = [{'username':username, 'password':password, 'authdb': authdb}];
  //           // Return callback
  //           internalCallback(errorObject, true);
  //         } else {
  //           internalCallback(errorObject, false);
  //         }
  //       }
  //     });
  //   }
  // });  
}

exports.authenticate = authenticate;