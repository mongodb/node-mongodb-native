var DbCommand = require('../commands/db_command').DbCommand
  , utils = require('../utils')
  , crypto = require('crypto');

var authenticate = function(db, username, password, authdb, options, callback) {
  var numberOfConnections = 0;
  var errorObject = null;
  var numberOfValidConnections = 0;
  var credentialsValid = false;
  options = options || {};

  if(options['connection'] != null) {
    //if a connection was explicitly passed on options, then we have only one...
    numberOfConnections = 1;
  } else {
    // Get the amount of connections in the pool to ensure we have authenticated all comments
    numberOfConnections = db.serverConfig.allRawConnections().length;
    options['onAll'] = true;
  }

  // Return connection option
  options.returnConnection = true;

  // Execute nonce command
  db.command({'getnonce':1}, options, function(err, result, connection) {
    // Execute on all the connections
    if(err == null) {
      // Nonce used to make authentication request with md5 hash
      var nonce = result.nonce;

      // Use node md5 generator
      var md5 = crypto.createHash('md5');
      // Generate keys used for authentication
      md5.update(username + ":mongo:" + password);
      var hash_password = md5.digest('hex');
      // Final key
      md5 = crypto.createHash('md5');
      md5.update(nonce + username + hash_password);
      var key = md5.digest('hex');
      
      // Creat cmd
      var cmd = {'authenticate':1, 'user':username, 'nonce':nonce, 'key':key};

      // Execute command
      db.db(authdb).command(cmd, {connection:connection}, function(err, result) {
        // Count down
        numberOfConnections = numberOfConnections - 1;
        
        // Ensure we save any error
        if(err) { 
          errorObject = err;
        } else {
          credentialsValid = true;
          numberOfValidConnections = numberOfValidConnections + 1;
        }

        // Work around the case where the number of connections are 0
        if(numberOfConnections <= 0 && typeof callback == 'function') {
          var internalCallback = callback;
          callback = null;

          if(errorObject == null && credentialsValid) {
            db.serverConfig.auth.add('MONGODB-CR', db.databaseName, username, password, authdb);
            // Return callback
            internalCallback(errorObject, true);
          } else if(numberOfValidConnections > 0 && numberOfValidConnections != numberOfConnections
            && credentialsValid) {
              // One or more servers failed on auth (f.ex secondary hanging on foreground indexing)
              db.serverConfig.auth.add('MONGODB-CR', db.databaseName, username, password, authdb);
              // Return callback
              internalCallback(errorObject, true);
          } else {
            internalCallback(errorObject, false);
          }
        }
      });
    }
  });
}

exports.authenticate = authenticate;