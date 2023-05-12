import { MongoAWSError } from '../../../error';
import { request } from '../../../utils';
import { ServiceWorkflow } from './service_workflow';

/** Error for when the token audience is missing in the environment. */
const TOKEN_AUDIENCE_MISSING_ERROR = 'TOKEN_AUDIENCE must be set in the environment.';

/** Base URL for getting Azure tokens. */
const AZURE_BASE_URL =
  'http://169.254.169.254/metadata/identity/oauth2/token?api-version=2018-02-01';

/** Azure request headers. */
const AZURE_HEADERS = Object.freeze({ Metadata: 'true', Accept: 'application/json' });

/**
 * The Azure access token format.
 */
interface AzureAccessToken {
  access_token: string;
  expires_in: number;
}

/**
 * Device workflow implementation for Azure.
 *
 * @internal
 */
export class AzureServiceWorkflow extends ServiceWorkflow {
  constructor() {
    super();
  }

  /**
   * Get the token from the environment.
   */
  async getToken(): Promise<string> {
    const tokenAudience = process.env.TOKEN_AUDIENCE;
    if (!tokenAudience) {
      throw new MongoAWSError(TOKEN_AUDIENCE_MISSING_ERROR);
    }
    // TODO: Look for the token in the cache. They expire after 5 minutes.
    const data = await getAzureTokenData(tokenAudience);

    // TODO: Validate access_token and expires_in are present.
    return data.access_token;
  }
}

/**
 * Hit the Azure endpoint to get the token data.
 */
async function getAzureTokenData(tokenAudience: string): Promise<AzureAccessToken> {
  const url = `${AZURE_BASE_URL}&resource=${tokenAudience}`;
  const data = await request(url, {
    json: true,
    headers: AZURE_HEADERS
  });
  return data as AzureAccessToken;
}
