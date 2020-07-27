import { Binary } from '../../bson';
import { AuthProvider, AuthContext } from './auth_provider';
import type { Callback } from '../../types';

export class Plain extends AuthProvider {
  auth(authContext: AuthContext, callback: Callback): void {
    const { connection, credentials } = authContext;
    const username = credentials.username;
    const password = credentials.password;

    const payload = new Binary(Buffer.from(`\x00${username}\x00${password}`));
    const command = {
      saslStart: 1,
      mechanism: 'PLAIN',
      payload: payload,
      autoAuthorize: 1
    };

    connection.command('$external.$cmd', command, callback);
  }
}
