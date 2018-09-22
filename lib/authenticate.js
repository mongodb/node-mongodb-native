'use strict';

const MongoError = require('mongodb-core').MongoError;
const MongoCredentials = require('mongodb-core').MongoCredentials;

// TODO: I feel like these sets should be somewhere else.
// Maybe in the core MongoCredentials class?
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

function generateCredentials(options) {
  options = Object.assign({}, options);
  const username = options.username || options.user;
  const password = options.password;

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

module.exports = { generateCredentials };
