import { type MongoClient } from '../../../mongo_client';
import { type MongoCredentials } from '../mongo_credentials';
import { type AccessToken, MachineWorkflow } from './machine_workflow';

/** The fallback file name */
const FALLBACK_FILENAME = '/var/run/secrets/kubernetes.io/serviceaccount/token';

/** The azure environment variable for the file name. */
const AZURE_FILENAME = 'AZURE_FEDERATED_TOKEN_FILE';

/** The AWS environment variable for the file name. */
const AWS_FILENAME = 'AWS_WEB_IDENTITY_TOKEN_FILE';

export class K8SMachineWorkflow extends MachineWorkflow {
  /**
   * Get the token from the environment.
   */
  async getToken(_credentials: MongoCredentials, client: MongoClient): Promise<AccessToken> {
    let filename: string;
    if (process.env[AZURE_FILENAME]) {
      filename = process.env[AZURE_FILENAME];
    } else if (process.env[AWS_FILENAME]) {
      filename = process.env[AWS_FILENAME];
    } else {
      filename = FALLBACK_FILENAME;
    }
    const token = await client.io.fs.readFile(filename, { encoding: 'utf8' });
    return { access_token: token };
  }
}
