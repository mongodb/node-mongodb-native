import { type Document, BSON } from 'bson';
import { promisify } from 'util';

import { ns } from '../../../utils';
import type { Connection } from '../../connection';
import type { MongoCredentials } from '../mongo_credentials';
import { AuthMechanism } from '../providers';
import type { Workflow } from './workflow';

/**
 * Common behaviour for OIDC device workflows.
 * @internal
 */
export abstract class DeviceWorkflow implements Workflow {
  /**
   * Authenticates using the provided OIDC access token.
   */
  async authenticate(
    connection: Connection,
    credentials: MongoCredentials,
    token: string
  ): Promise<Document> {
    const command = commandDocument(token);
    const executeCommand = promisify(connection.command.bind(connection));
    return executeCommand(ns(credentials.source), command, undefined);
  }

  /**
   * All device workflows must implement this method in order to get the access
   * token and then call authenticate with it.
   */
  abstract execute(connection: Connection, credentials: MongoCredentials): Promise<Document>;

  /**
   * Get the document to add for speculative authentication.
   */
  abstract speculativeAuth(): Promise<Document>;
}

/**
 * Create the saslStart command document.
 */
export function commandDocument(token: string): Document {
  return {
    saslStart: 1,
    mechanism: AuthMechanism.MONGODB_OIDC,
    payload: BSON.serialize({ jwt: token })
  };
}
