import type { Document } from 'bson';

import type { Connection } from '../../connection';
import type { MongoCredentials } from '../mongo_credentials';

export interface Workflow {
  /**
   * All device workflows must implement this method in order to get the access
   * token and then call authenticate with it.
   */
  execute(
    connection: Connection,
    credentials: MongoCredentials,
    reauthenticate?: boolean
  ): Promise<Document>;

  /**
   * Get the document to add for speculative authentication.
   */
  speculativeAuth(): Promise<Document>;
}
