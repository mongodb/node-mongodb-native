import { AuthProvider, AuthContext } from './auth_provider';
import type { Callback } from '../../types';
import type { MongoCredentials } from './mongo_credentials';

export class X509 extends AuthProvider {
  prepare(handshakeDoc: any, authContext: AuthContext, callback: Callback) {
    const { credentials } = authContext;
    Object.assign(handshakeDoc, {
      speculativeAuthenticate: x509AuthenticateCommand(credentials)
    });

    callback(undefined, handshakeDoc);
  }

  auth(authContext: AuthContext, callback: Callback) {
    const connection = authContext.connection;
    const credentials = authContext.credentials;
    const response = authContext.response;
    if (response!.speculativeAuthenticate) {
      return callback();
    }

    connection.command('$external.$cmd', x509AuthenticateCommand(credentials), {}, callback);
  }
}

interface X509Command {
  authenticate: 1;
  mechanism: 'MONGODB-X509';
  user?: string;
  [key: string]: unknown;
}

function x509AuthenticateCommand(credentials: MongoCredentials) {
  const command: X509Command = { authenticate: 1, mechanism: 'MONGODB-X509' };
  if (credentials.username) {
    command.user = credentials.username;
  }

  return command;
}
