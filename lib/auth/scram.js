var f = require('util').format
  , crypto = require('crypto')
  , Binary = require('bson').Binary
  , MongoError = require('../error');

var AuthSession = function(db, username, password) {
  this.db = db;
  this.username = username;
  this.password = password;
} 

AuthSession.prototype.equal = function(session) {
  return session.db == this.db 
    && session.username == this.username
    && session.password == this.password;
}

/**
 * Creates a new ScramSHA1 authentication mechanism
 * @class
 * @return {ScramSHA1} A cursor instance
 */
var ScramSHA1 = function() {
  this.authStore = [];
}

var parsePayload = function(payload) {
  var dict = {};
  var parts = payload.split(',');

  for(var i = 0; i < parts.length; i++) {
    var valueParts = parts[i].split('=');
    dict[valueParts[0]] = valueParts[1];
  }

  return dict;
}

var passwordDigest = function(username, password) {
  if(typeof username != 'string') throw new MongoError("username must be a string");
  if(typeof password != 'string') throw new MongoError("password must be a string");
  if(password.length == 0) throw new MongoError("password cannot be empty");
  // Use node md5 generator
  var md5 = crypto.createHash('md5');
  // Generate keys used for authentication
  md5.update(username + ":mongo:" + password);
  return md5.digest('hex');
}

// XOR two buffers
var xor = function(a, b) {
  if (!Buffer.isBuffer(a)) a = new Buffer(a)
  if (!Buffer.isBuffer(b)) b = new Buffer(b)
  var res = []
  if (a.length > b.length) {
    for (var i = 0; i < b.length; i++) {
      res.push(a[i] ^ b[i])
    }
  } else {
    for (var i = 0; i < a.length; i++) {
      res.push(a[i] ^ b[i])
    }
  }
  return new Buffer(res);
}

// Create a final digest
var hi = function(data, salt, iterations) {
  // Create digest
  var digest = function(msg) {
    var hmac = crypto.createHmac('sha1', data);
    hmac.update(msg);
    var result = hmac.digest()
    return result;
  }

  // Create variables
  salt = Buffer.concat([salt, new Buffer('\x00\x00\x00\x01')])
  var ui = u1 = digest(salt);
  for(var i = 0; i < iterations - 1; i++) {
    u1 = digest(u1);
    ui = xor(ui, u1);
  }

  return ui;
}

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
ScramSHA1.prototype.auth = function(server, pool, db, username, password, callback) {
  var self = this;
  // Get all the connections
  var connections = pool.getAll();
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
    var executeScram = function(connection) {
      // Clean up the user
      username = username.replace('=', "=3D").replace(',', '=2C');

      // Create a random nonce
      var nonce = crypto.randomBytes(24).toString('base64');
      // var nonce = 'MsQUY9iw0T9fx2MUEz6LZPwGuhVvWAhc'
      var firstBare = f("n=%s,r=%s", username, nonce);

      // Build command structure
      var cmd = {
          saslStart: 1
        , mechanism: 'SCRAM-SHA-1'
        , payload: new Binary(f("n,,%s", firstBare))
        , autoAuthorize: 1
      }

      // Handle the error
      var handleError = function(err, r) {
        if(err) {
          errorObject = err; return false;
        } else if(r.result['$err']) {
          errorObject = r.result; return false;
        } else if(r.result['errmsg']) {
          errorObject = r.result; return false;
        } else {
          credentialsValid = true;
          numberOfValidConnections = numberOfValidConnections + 1;            
        }

        return true
      }

      // Finish up
      var finish = function(_count, _numberOfValidConnections) {
        if(_count == 0 && _numberOfValidConnections > 0) {
          // Store the auth details
          addAuthSession(self.authStore, new AuthSession(db, username, password));
          // Return correct authentication
          return callback(null, true);
        } else if(_count == 0) {
          if(errorObject == null) errorObject = new MongoError(f("failed to authenticate using scram"));
          return callback(errorObject, false);
        }
      }

      var handleEnd = function(_err, _r) {
        // Handle any error
        handleError(_err, _r)
        // Adjust the number of connections
        count = count - 1;
        // Execute the finish
        finish(count, numberOfValidConnections);                
      }

      // Execute start sasl command
      server.command(f("%s.$cmd", db)
        , cmd, { connection: connection }, function(err, r) {
        
        // Do we have an error, handle it
        if(handleError(err, r) == false) {
          count = count - 1;

          if(count == 0 && numberOfValidConnections > 0) {
            // Store the auth details
            addAuthSession(self.authStore, new AuthSession(db, username, password));
            // Return correct authentication
            return callback(null, true);
          } else if(count == 0) {
            if(errorObject == null) errorObject = new MongoError(f("failed to authenticate using scram"));
            return callback(errorObject, false);
          }

          return;
        }

        // Get the dictionary
        var dict = parsePayload(r.result.payload.value())

        // Unpack dictionary
        var iterations = parseInt(dict.i, 10);
        var salt = dict.s;
        var rnonce = dict.r;

        // Set up start of proof
        var withoutProof = f("c=biws,r=%s", rnonce);
        var passwordDig = passwordDigest(username, password);
        var saltedPassword = hi(passwordDig
            , new Buffer(salt, 'base64')
            , iterations);
        
        // Create the client key
        var hmac = crypto.createHmac('sha1', saltedPassword);
        hmac.update(new Buffer("Client Key"));
        var clientKey = hmac.digest();

        // Create the stored key
        var hash = crypto.createHash('sha1');
        hash.update(clientKey);
        var storedKey = hash.digest();

        // Create the authentication message
        var authMsg = [firstBare, r.result.payload.value().toString('base64'), withoutProof].join(',');

        // Create client signature
        var hmac = crypto.createHmac('sha1', storedKey);
        hmac.update(new Buffer(authMsg));          
        var clientSig = hmac.digest();

        // Create client proof
        var clientProof = f("p=%s", new Buffer(xor(clientKey, clientSig)).toString('base64'));

        // Create client final
        var clientFinal = [withoutProof, clientProof].join(',');

        // Generate server key
        var hmac = crypto.createHmac('sha1', saltedPassword);
        hmac.update(new Buffer('Server Key'))
        var serverKey = hmac.digest();

        // Generate server signature
        var hmac = crypto.createHmac('sha1', serverKey);
        hmac.update(new Buffer(authMsg))
        var serverSig = hmac.digest();

        //
        // Create continue message
        var cmd = {
            saslContinue: 1
          , conversationId: r.result.conversationId
          , payload: new Binary(new Buffer(clientFinal))
        }

        //
        // Execute sasl continue
        server.command(f("%s.$cmd", db)
          , cmd, { connection: connection }, function(err, r) {
            if(r && r.result.done == false) {
              var cmd = {
                  saslContinue: 1
                , conversationId: r.result.conversationId
                , payload: new Buffer(0)
              }

              server.command(f("%s.$cmd", db)
                , cmd, { connection: connection }, function(err, r) {
                  handleEnd(err, r);
              });
            } else {
              handleEnd(err, r);
            }
        });
      });
    }

    // Get the connection
    executeScram(connections.shift());
  }
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
 * @param {Pool} pool Connection pool for this topology
 * @param {authResultCallback} callback The callback to return the result from the authentication
 * @return {object}
 */
ScramSHA1.prototype.reauthenticate = function(server, pool, callback) {
  var count = this.authStore.length;
  if(count == 0) return callback(null, null);
  // Iterate over all the auth details stored
  for(var i = 0; i < this.authStore.length; i++) {
    this.auth(server, pool, this.authStore[i].db, this.authStore[i].username, this.authStore[i].password, function(err, r) {
      count = count - 1;
      // Done re-authenticating
      if(count == 0) {
        callback(null, null);
      }
    });
  }
}


module.exports = ScramSHA1;