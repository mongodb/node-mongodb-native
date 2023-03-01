import { readFile } from 'fs/promises';

import { MongoAWSError } from '../../../error';
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
   * Get the token from the environment.
   */
  async getToken(): Promise<string> {
    const tokenFile = process.env.AWS_WEB_IDENTITY_TOKEN_FILE;
    if (!tokenFile) {
      throw new MongoAWSError('AWS_WEB_IDENTITY_TOKEN_FILE must be set in the environment.');
    }
    return readFile(tokenFile, 'utf8');
  }
}
