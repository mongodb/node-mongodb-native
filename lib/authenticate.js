'use strict';

const handleCallback = require('./utils').handleCallback;
const MongoError = require('mongodb-core').MongoError;

const MongoCredentials = require('mongodb-core').MongoCredentials;

const VALID_AUTH_MECHANISMS = new Set([
  'DEFAULT',
  'MONGODB-CR',
  'PLAIN',
  'MONGODB-X509',
  'SCRAM-SHA-1',
  'SCRAM-SHA-256',
  'GSSAPI'
]);

const AUTH_MECHANISM_INTERNAL_MAP = {
  DEFAULT: 'default',
  'MONGODB-CR': 'mongocr',
  PLAIN: 'plain',
  'MONGODB-X509': 'x509',
  'SCRAM-SHA-1': 'scram-sha-1',
  'SCRAM-SHA-256': 'scram-sha-256'
};

function generateCredentials(client, username, password, options) {
  options = Object.assign({}, options);

  // the default db to authenticate against is 'self'
  // if authententicate is called from a retry context, it may be another one, like admin
  const source = options.authSource || options.authdb || options.dbName;

  // authMechanism
  const authMechanismRaw = options.authMechanism || 'DEFAULT';
  const authMechanism = authMechanismRaw.toUpperCase();

  if (!VALID_AUTH_MECHANISMS.has(authMechanism)) {
    throw MongoError.create({
      message: `authentication mechanism ${authMechanismRaw} not supported', options.authMechanism`,
      driver: true
    });
  }

  if (authMechanism === 'GSSAPI') {
    return new MongoCredentials({
      mechanism: process.platform === 'win32' ? 'sspi' : 'gssapi',
      mechanismProperties: options,
      source,
      username,
      password
    });
  }
  return new MongoCredentials({
    mechanism: AUTH_MECHANISM_INTERNAL_MAP[authMechanism],
    source,
    username,
    password
  });
}

function _authenticate(client, credentials, callback) {
  // Did the user destroy the topology
  if (client.topology && client.topology.isDestroyed())
    return callback(new MongoError('topology was destroyed'));

  // Callback
  var _callback = function(err, result) {
    if (client.listeners('authenticated').length > 0) {
      client.emit('authenticated', err, result);
    }

    // Return to caller
    handleCallback(callback, err, result);
  };

  client.topology.auth(credentials, function(err) {
    if (err) return handleCallback(callback, err, false);
    _callback(null, true);
  });
}

function authenticate(self, credentials, callback) {
  // if (!VALID_AUTH_MECHANISMS.has(credentials.authMechanism)) {
  //   return handleCallback(
  //     callback,
  //     MongoError.create({
  //       message:
  //         'only DEFAULT, GSSAPI, PLAIN, MONGODB-X509, or SCRAM-SHA-1 is supported by authMechanism',
  //       driver: true
  //     })
  //   );
  // }

  // If we have a callback fallback
  if (typeof callback === 'function')
    return _authenticate(self, credentials, function(err, r) {
      // Support failed auth method
      if (err && err.message && err.message.indexOf('saslStart') !== -1) err.code = 59;
      // Reject error
      if (err) return callback(err, r);
      callback(null, r);
    });

  // Return a promise
  return new self.s.promiseLibrary(function(resolve, reject) {
    _authenticate(self, credentials, function(err, r) {
      // Support failed auth method
      if (err && err.message && err.message.indexOf('saslStart') !== -1) err.code = 59;
      // Reject error
      if (err) return reject(err);
      resolve(r);
    });
  });
}

module.exports = { generateCredentials, authenticate };
