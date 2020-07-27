import { AuthProvider, AuthContext } from './auth_provider';
import { Kerberos, kModuleError } from '../../deps';
import type { Callback } from '../../types';
import { MongoError } from '../../error';

interface MongoAuthProcessConstructor {
  new (host: string, port: number, serviceName: string, options: unknown): MongoAuthProcessLike;
}

interface MongoAuthProcessLike {
  host: string;
  port: number;
  serviceName: string;
  canonicalizeHostName: boolean;
  retries: number;

  init: (username: string, password: string, callback: Callback) => void;
  transition: (payload: unknown, callback: Callback) => void;
}

export class GSSAPI extends AuthProvider {
  auth(authContext: AuthContext, callback: Callback): void {
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

    const MongoAuthProcess: MongoAuthProcessConstructor = Kerberos.processes.MongoAuthProcess;

    const { host, port } = authContext.options;
    if (!host || !port) {
      return callback(new MongoError('Connection must specify host and port.'));
    }

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
