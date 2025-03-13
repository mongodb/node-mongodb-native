import { MongoAWSError } from '../../../error';
import { type MongoClient } from '../../../mongo_client';
import { type MongoCredentials } from '../mongo_credentials';
import { type AccessToken, MachineWorkflow } from './machine_workflow';

/** Error for when the token is missing in the environment. */
const TOKEN_MISSING_ERROR = 'OIDC_TOKEN_FILE must be set in the environment.';

/**
 * Device workflow implementation for AWS.
 *
 * @internal
 */
export class TokenMachineWorkflow extends MachineWorkflow {
  /**
   * Get the token from the environment.
   */
  async getToken(_: MongoCredentials, client: MongoClient): Promise<AccessToken> {
    const tokenFile = process.env.OIDC_TOKEN_FILE;
    if (!tokenFile) {
      throw new MongoAWSError(TOKEN_MISSING_ERROR);
    }
    const token = await client.io.fs.readFile(tokenFile, { encoding: 'utf8' });
    return { access_token: token };
  }
}
