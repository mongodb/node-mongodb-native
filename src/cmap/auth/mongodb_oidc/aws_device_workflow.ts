import type { Document } from 'bson';
import { readFile } from 'fs/promises';

import { MongoAWSError } from '../../../error';
import type { Connection } from '../../connection';
import type { MongoCredentials } from '../mongo_credentials';
import { DeviceWorkflow } from './device_workflow';

/**
 * Device workflow implementation for AWS.
 *
 * @internal
 */
export class AwsDeviceWorkflow extends DeviceWorkflow {
  constructor() {
    super();
  }

  /**
   * Execute the workflow. Looks for AWS_WEB_IDENTITY_TOKEN_FILE in the environment
   * and then attempts to read the token from that path.
   */
  async execute(connection: Connection, credentials: MongoCredentials): Promise<Document> {
    const tokenFile = process.env.AWS_WEB_IDENTITY_TOKEN_FILE;
    if (tokenFile) {
      const token = await readFile(tokenFile, 'utf8');
      return super.authenticate(connection, credentials, token);
    } else {
      throw new MongoAWSError('AWS_WEB_IDENTITY_TOKEN_FILE must be set in the environment.');
    }
  }
}
