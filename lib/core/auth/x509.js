'use strict';
const AuthProvider = require('./auth_provider').AuthProvider;

class X509 extends AuthProvider {
  prepare(handshakeDoc, authContext, callback) {
    const credentials = authContext.credentials;
    Object.assign(handshakeDoc, {
      speculativeAuthenticate: x509AuthenticateCommand(credentials)
    });

    callback(undefined, handshakeDoc);
  }

  auth(authContext, callback) {
    const connection = authContext.connection;
    const credentials = authContext.credentials;
    const response = authContext.response;
    if (response.speculativeAuthenticate) {
      return callback();
    }

    connection.command('$external.$cmd', x509AuthenticateCommand(credentials), callback);
  }
}

function x509AuthenticateCommand(credentials) {
  const command = { authenticate: 1, mechanism: 'MONGODB-X509' };
  if (credentials.username) {
    Object.assign(command, { user: credentials.username });
  }

  return command;
}

module.exports = X509;
