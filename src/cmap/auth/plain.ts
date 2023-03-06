import { Binary } from '../../bson';
import { MongoMissingCredentialsError } from '../../error';
import { Callback, ns } from '../../utils';
import type { HandshakeDocument } from '../handshake/handshake_generator';
import { AuthContext, AuthProvider } from './auth_provider';

export class Plain extends AuthProvider {
  prepare(handshakeDoc: HandshakeDocument): Promise<HandshakeDocument> {
    return Promise.resolve(handshakeDoc);
  }
  override auth(authContext: AuthContext, callback: Callback): void {
    const { connection, credentials } = authContext;
    if (!credentials) {
      return callback(new MongoMissingCredentialsError('AuthContext must provide credentials.'));
    }
    const username = credentials.username;
    const password = credentials.password;

    const payload = new Binary(Buffer.from(`\x00${username}\x00${password}`));
    const command = {
      saslStart: 1,
      mechanism: 'PLAIN',
      payload: payload,
      autoAuthorize: 1
    };

    connection.command(ns('$external.$cmd'), command, undefined, callback);
  }
}
