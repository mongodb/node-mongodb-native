'use strict';
const { AuthProvider } = require('./auth_provider');
const { Kerberos, kModuleError } = require('../../deps');

class GSSAPI extends AuthProvider {
  auth(authContext, callback) {
    if (Kerberos[kModuleError]) {
      callback(Kerberos[kModuleError]);
      return;
    }

    const { connection, credentials } = authContext;
    const username = credentials.username;
    const password = credentials.password;
    const mechanismProperties = credentials.mechanismProperties;
    const gssapiServiceName =
      mechanismProperties['gssapiservicename'] ||
      mechanismProperties['gssapiServiceName'] ||
      'mongodb';

    const MongoAuthProcess = Kerberos.processes.MongoAuthProcess;
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
