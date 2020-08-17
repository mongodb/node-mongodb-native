import { AuthProvider, AuthContext } from './auth_provider';
import type { Callback } from '../../types';
import { MongoError } from '../../error';
import { MongoAuthProcess } from './kerberosAuthProcess';

import { Kerberos } from '../../deps';

export class GSSAPI extends AuthProvider {
  auth(authContext: AuthContext, callback: Callback): void {
    const { host, port } = authContext.options;
    const { connection, credentials } = authContext;
    if (!host || !port || !credentials) {
      return callback(
        new MongoError(
          `Connection must specify: ${host ? 'host' : ''}, ${port ? 'port' : ''}, ${
            credentials ? 'host' : 'credentials'
          }.`
        )
      );
    }

    if ('kModuleError' in Kerberos) {
      return callback(Kerberos['kModuleError']);
    }

    const username = credentials.username;
    const password = credentials.password;
    const mechanismProperties = credentials.mechanismProperties;
    const gssapiServiceName =
      mechanismProperties['gssapiservicename'] ||
      mechanismProperties['gssapiServiceName'] ||
      'mongodb';

    const authProcess = new MongoAuthProcess(host, port, gssapiServiceName, mechanismProperties);

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
                    if (err) return callback(err);
                    callback(undefined, response);
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
