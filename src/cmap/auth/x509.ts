import { AuthProvider, AuthContext } from './auth_provider';
import { MongoDriverError } from '../../error';
import type { Document } from '../../bson';
import { Callback, ns } from '../../utils';
import type { MongoCredentials } from './mongo_credentials';
import type { HandshakeDocument } from '../connect';

export class X509 extends AuthProvider {
  prepare(handshakeDoc: HandshakeDocument, authContext: AuthContext, callback: Callback): void {
    const { credentials } = authContext;
    if (!credentials) {
      return callback(new MongoDriverError('AuthContext must provide credentials.'));
    }
    Object.assign(handshakeDoc, {
      speculativeAuthenticate: x509AuthenticateCommand(credentials)
    });

    callback(undefined, handshakeDoc);
  }

  auth(authContext: AuthContext, callback: Callback): void {
    const connection = authContext.connection;
    const credentials = authContext.credentials;
    if (!credentials) {
      return callback(new MongoDriverError('AuthContext must provide credentials.'));
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
