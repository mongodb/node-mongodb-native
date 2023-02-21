import { readFile } from 'node:fs';

import { MongoAWSError } from '../../../error';
import type { Callback } from '../../../utils';
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
  execute(connection: Connection, credentials: MongoCredentials, callback: Callback): void {
    const tokenFile = process.env.AWS_WEB_IDENTITY_TOKEN_FILE;
    if (tokenFile) {
      readFile(tokenFile, 'utf8', (error, token) => {
        if (error) {
          return callback(error);
        }
        super.authenticate(connection, credentials, token, callback);
      });
    } else {
      callback(new MongoAWSError('AWS_WEB_IDENTITY_TOKEN_FILE must be set in the environment.'));
    }
  }
}
