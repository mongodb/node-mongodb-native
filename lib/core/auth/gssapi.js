'use strict';
const AuthProvider = require('./auth_provider').AuthProvider;
const retrieveKerberos = require('../utils').retrieveKerberos;
let kerberos;

class GSSAPI extends AuthProvider {
  auth(authContext, callback) {
    const connection = authContext.connection;
    const credentials = authContext.credentials;

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

    const MongoAuthProcess = kerberos.processes.MongoAuthProcess;
    const authProcess = new MongoAuthProcess(
      connection.host,
      connection.port,
      gssapiServiceName,
      mechanismProperties
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
}

module.exports = GSSAPI;
