import * as fs from 'fs';

import { MongoAWSError } from '../../../error';
import { type AccessToken, MachineWorkflow } from './machine_workflow';

/** Error for when the token is missing in the environment. */
const TOKEN_MISSING_ERROR = 'AWS_WEB_IDENTITY_TOKEN_FILE must be set in the environment.';

/**
 * Device workflow implementation for AWS.
 *
 * @internal
 */
export class AwsMachineWorkflow extends MachineWorkflow {
  constructor() {
    super();
  }

  /**
   * Get the token from the environment.
   */
  async getToken(): Promise<AccessToken> {
    const tokenFile = process.env.AWS_WEB_IDENTITY_TOKEN_FILE;
    if (!tokenFile) {
      throw new MongoAWSError(TOKEN_MISSING_ERROR);
    }
    const token = await fs.promises.readFile(tokenFile, 'utf8');
    return { access_token: token };
  }
}
