'use strict';
import { BSON } from '../../deps';
const { Binary } = BSON;
import { AuthProvider } from './auth_provider';

class Plain extends AuthProvider {
  auth(authContext: any, callback: Function) {
    const { connection, credentials } = authContext;
    const username = credentials.username;
    const password = credentials.password;

    const payload = new Binary(`\x00${username}\x00${password}`);
    const command = {
      saslStart: 1,
      mechanism: 'PLAIN',
      payload: payload,
      autoAuthorize: 1
    };

    connection.command('$external.$cmd', command, callback);
  }
}

export = Plain;
