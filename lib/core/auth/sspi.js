'use strict';

const AuthProvider = require('./auth_provider').AuthProvider;
const retrieveKerberos = require('../utils').retrieveKerberos;
let kerberos;

/**
 * Creates a new SSPI authentication mechanism
 * @class
 * @extends AuthProvider
 */
class SSPI extends AuthProvider {
  /**
   * Implementation of authentication for a single connection
   * @override
   */
  auth(connection, credentials, callback) {
    if (kerberos == null) {
      try {
        kerberos = retrieveKerberos();
      } catch (e) {
        return callback(e, null);
      }
    }

    // TODO: Destructure this
    const username = credentials.username;
    const password = credentials.password;
    const mechanismProperties = credentials.mechanismProperties;
    const gssapiServiceName =
      mechanismProperties['gssapiservicename'] ||
      mechanismProperties['gssapiServiceName'] ||
      'mongodb';

    SSIPAuthenticate(
      this,
      kerberos.processes.MongoAuthProcess,
      username,
      password,
      gssapiServiceName,
      connection,
      mechanismProperties,
      callback
    );
  }
}

function SSIPAuthenticate(
  self,
  MongoAuthProcess,
  username,
  password,
  gssapiServiceName,
  connection,
  options,
  callback
) {
  const authProcess = new MongoAuthProcess(
    connection.host,
    connection.port,
    gssapiServiceName,
    options
  );

  authProcess.init(username, password, err => {
    if (err) return callback(err, false);

    authProcess.transition('', (err, payload) => {
      if (err) return callback(err, false);

      const command = {
        saslStart: 1,
        mechanism: 'GSSAPI',
        payload,
        autoAuthorize: 1
      };

      connection.command('$external.$cmd', command, (err, result) => {
        if (err) return callback(err, false);

        const doc = result.result;
        authProcess.transition(doc.payload, (err, payload) => {
          if (err) return callback(err, false);
          const command = {
            saslContinue: 1,
            conversationId: doc.conversationId,
            payload
          };

          connection.command('$external.$cmd', command, (err, result) => {
            if (err) return callback(err, false);

            const doc = result.result;
            authProcess.transition(doc.payload, (err, payload) => {
              if (err) return callback(err, false);
              const command = {
                saslContinue: 1,
                conversationId: doc.conversationId,
                payload
              };

              connection.command('$external.$cmd', command, (err, result) => {
                if (err) return callback(err, false);

                const response = result.result;
                authProcess.transition(null, err => {
                  if (err) return callback(err, null);
                  callback(null, response);
                });
              });
            });
          });
        });
      });
    });
  });
}

module.exports = SSPI;
