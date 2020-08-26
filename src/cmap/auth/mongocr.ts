import * as crypto from 'crypto';
import { AuthProvider, AuthContext } from './auth_provider';
import type { Callback } from '../../utils';
import { MongoError } from '../../error';

export class MongoCR extends AuthProvider {
  auth(authContext: AuthContext, callback: Callback): void {
    const { connection, credentials } = authContext;
    if (!credentials) {
      return callback(new MongoError('AuthContext must provide credentials.'));
    }
    const username = credentials.username;
    const password = credentials.password;
    const source = credentials.source;
    connection.command(`${source}.$cmd`, { getnonce: 1 }, (err, r) => {
      let nonce = null;
      let key = null;

      // Get nonce
      if (err == null) {
        nonce = r.nonce;

        // Use node md5 generator
        let md5 = crypto.createHash('md5');

        // Generate keys used for authentication
        md5.update(username + ':mongo:' + password, 'utf8');
        const hash_password = md5.digest('hex');

        // Final key
        md5 = crypto.createHash('md5');
        md5.update(nonce + username + hash_password, 'utf8');
        key = md5.digest('hex');
      }

      const authenticateCommand = {
        authenticate: 1,
        user: username,
        nonce,
        key
      };

      connection.command(`${source}.$cmd`, authenticateCommand, callback);
    });
  }
}
