import type { Document } from '../../bson';
import { MongoMissingCredentialsError } from '../../error';
import { Callback, ns } from '../../utils';
import type { HandshakeDocument } from '../connect';
import { AuthContext, AuthProvider } from './auth_provider';
import type { MongoCredentials } from './mongo_credentials';

export class X509 extends AuthProvider {
  override prepare(
    handshakeDoc: HandshakeDocument,
    authContext: AuthContext,
    callback: Callback
  ): void {
    const { credentials } = authContext;
    if (!credentials) {
      return callback(new MongoMissingCredentialsError('AuthContext must provide credentials.'));
    }
    Object.assign(handshakeDoc, {
      speculativeAuthenticate: x509AuthenticateCommand(credentials)
    });

    callback(undefined, handshakeDoc);
  }

  override auth(authContext: AuthContext, callback: Callback): void {
    const connection = authContext.connection;
    const credentials = authContext.credentials;
    if (!credentials) {
      return callback(new MongoMissingCredentialsError('AuthContext must provide credentials.'));
    }
    const response = authContext.response;

    if (response && response.speculativeAuthenticate) {
      return callback();
    }

    connection.command(
      ns('$external.$cmd'),
      x509AuthenticateCommand(credentials),
      undefined,
      callback
    );
  }
}

function x509AuthenticateCommand(credentials: MongoCredentials) {
  const command: Document = { authenticate: 1, mechanism: 'MONGODB-X509' };
  if (credentials.username) {
    command.user = credentials.username;
  }

  return command;
}
