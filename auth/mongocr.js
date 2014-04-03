var f = require('util').format
  , crypto = require('crypto');

var AuthSession = function(db, username, password) {
  this.db = db;
  this.username = username;
  this.password = password;

  this.equal = function(session) {
    return session.db == this.db 
      && session.username == this.username
      && session.password == this.password;
  }
}

var MongoCR = function() {
  var authStore = [];

  //
  // Authenticate mechanism
  this.auth = function(server, pool, db, username, password, callback) {
    // Get all the connections
    var connections = pool.getAll();
    // Total connections
    var count = connections.length;
    if(count == 0) return callback(null, null);

    // For each connection we need to authenticate
    while(connections.length > 0) {    
      // Execute MongoCR
      var executeMongoCR = function(connection) {
        // Let's start the process
        server.command(f("%s.$cmd", db)
          , { getnonce: 1 }
          , { connection: connection }, function(err, r) {
            // Adjust the number of connections left
            // Get nonce
            var nonce = r.result.nonce;
            // Use node md5 generator
            var md5 = crypto.createHash('md5');
            // Generate keys used for authentication
            md5.update(username + ":mongo:" + password);
            var hash_password = md5.digest('hex');
            // Final key
            md5 = crypto.createHash('md5');
            md5.update(nonce + username + hash_password);
            var key = md5.digest('hex');

            // Execute command
            server.command(f("%s.$cmd", db)
              , { authenticate: 1, user: username, nonce: nonce, key:key}
              , { connection: connection }, function(err, r) {
                count = count - 1;
                if(err && count == 0) return callback(err, false);
                if(err) return;

                // We have authenticated all connections
                if(count == 0) {
                  // Store the auth details
                  addAuthSession(new AuthSession(db, username, password));
                  // Return correct authentication
                  callback(null, true);
                }
            });
        });
      }

      // Get the connection
      executeMongoCR(connections.shift());
    }
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

  //
  // Re authenticate server
  this.reauthenticate = function(server, pool, callback) {
    var count = authStore.length;
    if(count == 0) return callback(null, null);
    // Iterate over all the auth details stored
    for(var i = 0; i < authStore.length; i++) {
      this.auth(server, pool, authStore[i].db, authStore[i].username, authStore[i].password, function(err, r) {
        count = count - 1;
        // Done re-authenticating
        if(count == 0) {
          callback(null, null);
        }
      });
    }
  }
}

module.exports = MongoCR;