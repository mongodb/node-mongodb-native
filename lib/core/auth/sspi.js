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
  _authenticateSingleConnection(sendAuthCommand, connection, credentials, callback) {
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
      sendAuthCommand,
      connection,
      mechanismProperties,
      callback
    );
  }

  /**
   * Authenticate
   * @override
   * @method
   */
  auth(sendAuthCommand, connections, credentials, callback) {
    if (kerberos == null) {
      try {
        kerberos = retrieveKerberos();
      } catch (e) {
        return callback(e, null);
      }
    }

    super.auth(sendAuthCommand, connections, credentials, callback);
  }
}

function SSIPAuthenticate(
  self,
  MongoAuthProcess,
  username,
  password,
  gssapiServiceName,
  sendAuthCommand,
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

  function authCommand(command, authCb) {
    sendAuthCommand(connection, '$external.$cmd', command, authCb);
  }

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

      authCommand(command, (err, doc) => {
        if (err) return callback(err, false);

        authProcess.transition(doc.payload, (err, payload) => {
          if (err) return callback(err, false);
          const command = {
            saslContinue: 1,
            conversationId: doc.conversationId,
            payload
          };

          authCommand(command, (err, doc) => {
            if (err) return callback(err, false);

            authProcess.transition(doc.payload, (err, payload) => {
              if (err) return callback(err, false);
              const command = {
                saslContinue: 1,
                conversationId: doc.conversationId,
                payload
              };

              authCommand(command, (err, response) => {
                if (err) return callback(err, false);

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
