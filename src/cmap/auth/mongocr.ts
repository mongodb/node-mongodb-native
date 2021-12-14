import * as crypto from 'crypto';

import { MongoMissingCredentialsError } from '../../error';
import { Callback, ns } from '../../utils';
import { AuthContext, AuthProvider } from './auth_provider';

export class MongoCR extends AuthProvider {
  auth(authContext: AuthContext, callback: Callback): void {
    const { connection, credentials } = authContext;
    if (!credentials) {
      return callback(new MongoMissingCredentialsError('AuthContext must provide credentials.'));
    }
    const username = credentials.username;
    const password = credentials.password;
    const source = credentials.source;
    connection.command(ns(`${source}.$cmd`), { getnonce: 1 }, undefined, (err, r) => {
      let nonce = null;
      let key = null;

      // Get nonce
      if (err == null) {
        nonce = r.nonce;

        // Use node md5 generator
        let md5 = crypto.createHash('md5');

        // Generate keys used for authentication
        md5.update(`${username}:mongo:${password}`, 'utf8');
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

      connection.command(ns(`${source}.$cmd`), authenticateCommand, undefined, callback);
    });
  }
}
