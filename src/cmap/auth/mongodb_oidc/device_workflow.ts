import { type Document, BSON } from 'bson';

import { type Callback, ns } from '../../../utils';
import type { Connection } from '../../connection';
import type { MongoCredentials } from '../mongo_credentials';
import { AuthMechanism } from '../providers';

/**
 * Common behaviour for OIDC device workflows.
 * @internal
 */
export abstract class DeviceWorkflow {
  /**
   * Authenticates using the provided OIDC access token.
   */
  authenticate(
    connection: Connection,
    credentials: MongoCredentials,
    token: string,
    callback: Callback
  ): void {
    const command = commandDocument(token);
    connection.command(ns(credentials.source), command, undefined, (error, result) => {
      if (error) {
        return callback(error);
      }
      console.log('authenticate result', result);
      callback(undefined, { clientId: '' });
    });
  }

  /**
   * All device workflows must implement this method in order to get the access
   * token and then call authenticate with it.
   */
  abstract execute(connection: Connection, credentials: MongoCredentials, callback: Callback): void;
}

/**
 * Create the saslStart command document.
 */
function commandDocument(token: string): Document {
  return {
    saslStart: 1,
    mechanism: AuthMechanism.MONGODB_OIDC,
    payload: BSON.serialize({ jwt: token })
  };
}
