'use strict';
import { AuthProvider } from './auth_provider';
import { Kerberos, kModuleError } from '../../deps';

class GSSAPI extends AuthProvider {
  auth(authContext: any, callback: Function) {
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

    authProcess.init(username, password, (err: any) => {
      if (err) return callback(err, false);
      authProcess.transition('', (err?: any, payload?: any) => {
        if (err) return callback(err, false);

        const command = {
          saslStart: 1,
          mechanism: 'GSSAPI',
          payload,
          autoAuthorize: 1
        };

        connection.command('$external.$cmd', command, (err?: any, result?: any) => {
          if (err) return callback(err, false);

          const doc = result.result;
          authProcess.transition(doc.payload, (err?: any, payload?: any) => {
            if (err) return callback(err, false);
            const command = {
              saslContinue: 1,
              conversationId: doc.conversationId,
              payload
            };

            connection.command('$external.$cmd', command, (err?: any, result?: any) => {
              if (err) return callback(err, false);

              const doc = result.result;
              authProcess.transition(doc.payload, (err?: any, payload?: any) => {
                if (err) return callback(err, false);
                const command = {
                  saslContinue: 1,
                  conversationId: doc.conversationId,
                  payload
                };

                connection.command('$external.$cmd', command, (err?: any, result?: any) => {
                  if (err) return callback(err, false);

                  const response = result.result;
                  authProcess.transition(null, (err: any) => {
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

export = GSSAPI;
