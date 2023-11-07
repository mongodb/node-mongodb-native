import { MongoGCPError } from '../../../error';
import { request } from '../../../utils';
import { type MongoCredentials } from '../mongo_credentials';
import { type AccessToken, MachineWorkflow } from './machine_workflow';

/** GCP base URL. */
const GCP_BASE_URL =
  'http://metadata/computeMetadata/v1/instance/service-accounts/default/identity';

/** GCP request headers. */
const GCP_HEADERS = Object.freeze({ 'Metadata-Flavor': 'Google' });

/** Error for when the token audience is missing in the environment. */
const TOKEN_RESOURCE_MISSING_ERROR =
  'TOKEN_RESOURCE must be set in the auth mechanism properties when ENVIRONMENT is gcp.';

export class GCPMachineWorkflow extends MachineWorkflow {
  /**
   * Get the token from the environment.
   */
  async getToken(credentials?: MongoCredentials): Promise<AccessToken> {
    const tokenAudience = credentials?.mechanismProperties.TOKEN_RESOURCE;
    if (!tokenAudience) {
      throw new MongoGCPError(TOKEN_RESOURCE_MISSING_ERROR);
    }
    return await getGcpTokenData(tokenAudience);
  }
}

/**
 * Hit the GCP endpoint to get the token data.
 */
async function getGcpTokenData(tokenAudience: string): Promise<AccessToken> {
  const url = new URL(GCP_BASE_URL);
  url.searchParams.append('audience', tokenAudience);
  const data = await request(url.toString(), {
    json: false,
    headers: GCP_HEADERS
  });
  return { access_token: data };
}
