'use strict';
const dns = require('dns');

const AuthProvider = require('./auth_provider').AuthProvider;
const retrieveKerberos = require('../utils').retrieveKerberos;
const MongoError = require('../error').MongoError;

let kerberos;

class GSSAPI extends AuthProvider {
  auth(authContext, callback) {
    const connection = authContext.connection;
    const credentials = authContext.credentials;
    if (credentials == null) return callback(new MongoError('credentials required'));
    const username = credentials.username;
    function externalCommand(command, cb) {
      return connection.command('$external.$cmd', command, cb);
    }
    makeKerberosClient(authContext, (err, client) => {
      if (err) return callback(err);
      if (client == null) return callback(new MongoError('gssapi client missing'));
      client.step('', (err, payload) => {
        if (err) return callback(err);
        externalCommand(saslStart(payload), (err, response) => {
          if (err) return callback(err);
          const result = response.result;
          negotiate(client, 10, result.payload, (err, payload) => {
            if (err) return callback(err);
            externalCommand(saslContinue(payload, result.conversationId), (err, response) => {
              if (err) return callback(err);
              const result = response.result;
              finalize(client, username, result.payload, (err, payload) => {
                if (err) return callback(err);
                externalCommand(
                  {
                    saslContinue: 1,
                    conversationId: result.conversationId,
                    payload
                  },
                  (err, result) => {
                    if (err) return callback(err);
                    callback(undefined, result);
                  }
                );
              });
            });
          });
        });
      });
    });
  }
}
module.exports = GSSAPI;

function makeKerberosClient(authContext, callback) {
  const host = authContext.options.host;
  const port = authContext.options.port;
  const credentials = authContext.credentials;
  if (!host || !port || !credentials) {
    return callback(
      new MongoError(
        `Connection must specify: ${host ? 'host' : ''}, ${port ? 'port' : ''}, ${
          credentials ? 'host' : 'credentials'
        }.`
      )
    );
  }
  if (kerberos == null) {
    try {
      kerberos = retrieveKerberos();
    } catch (e) {
      return callback(e);
    }
  }
  const username = credentials.username;
  const password = credentials.password;
  const mechanismProperties = credentials.mechanismProperties;
  const serviceName =
    mechanismProperties['gssapiservicename'] ||
    mechanismProperties['gssapiServiceName'] ||
    'mongodb';
  performGssapiCanonicalizeHostName(host, mechanismProperties, (err, host) => {
    if (err) return callback(err);
    const initOptions = {};
    if (password != null) {
      Object.assign(initOptions, { user: username, password: password });
    }
    kerberos.initializeClient(
      `${serviceName}${process.platform === 'win32' ? '/' : '@'}${host}`,
      initOptions,
      (err, client) => {
        if (err) return callback(new MongoError(err));
        callback(null, client);
      }
    );
  });
}

function saslStart(payload) {
  return {
    saslStart: 1,
    mechanism: 'GSSAPI',
    payload,
    autoAuthorize: 1
  };
}
function saslContinue(payload, conversationId) {
  return {
    saslContinue: 1,
    conversationId,
    payload
  };
}
function negotiate(client, retries, payload, callback) {
  client.step(payload, (err, response) => {
    // Retries exhausted, raise error
    if (err && retries === 0) return callback(err);
    // Adjust number of retries and call step again
    if (err) return negotiate(client, retries - 1, payload, callback);
    // Return the payload
    callback(undefined, response || '');
  });
}
function finalize(client, user, payload, callback) {
  // GSS Client Unwrap
  client.unwrap(payload, (err, response) => {
    if (err) return callback(err);
    // Wrap the response
    client.wrap(response || '', { user }, (err, wrapped) => {
      if (err) return callback(err);
      // Return the payload
      callback(undefined, wrapped);
    });
  });
}
function performGssapiCanonicalizeHostName(host, mechanismProperties, callback) {
  const canonicalizeHostName =
    typeof mechanismProperties.gssapiCanonicalizeHostName === 'boolean'
      ? mechanismProperties.gssapiCanonicalizeHostName
      : false;
  if (!canonicalizeHostName) return callback(undefined, host);
  // Attempt to resolve the host name
  dns.resolveCname(host, (err, r) => {
    if (err) return callback(err);
    // Get the first resolve host id
    if (Array.isArray(r) && r.length > 0) {
      return callback(undefined, r[0]);
    }
    callback(undefined, host);
  });
}
