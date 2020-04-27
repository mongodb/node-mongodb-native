'use strict';

const crypto = require('crypto');
const AuthProvider = require('./auth_provider').AuthProvider;

class MongoCR extends AuthProvider {
  auth(authContext, callback) {
    const connection = authContext.connection;
    const credentials = authContext.credentials;
    const username = credentials.username;
    const password = credentials.password;
    const source = credentials.source;

    connection.command(`${source}.$cmd`, { getnonce: 1 }, (err, result) => {
      let nonce = null;
      let key = null;

      // Get nonce
      if (err == null) {
        const r = result.result;
        nonce = r.nonce;
        // Use node md5 generator
        let md5 = crypto.createHash('md5');
        // Generate keys used for authentication
        md5.update(username + ':mongo:' + password, 'utf8');
        const hash_password = md5.digest('hex');
        // Final key
        md5 = crypto.createHash('md5');
        md5.update(nonce + username + hash_password, 'utf8');
        key = md5.digest('hex');
      }

      const authenticateCommand = {
        authenticate: 1,
        user: username,
        nonce,
        key
      };

      connection.command(`${source}.$cmd`, authenticateCommand, callback);
    });
  }
}

module.exports = MongoCR;
