import { type Document } from 'bson';

import { MongoCryptAzureKMSRequestError, MongoCryptKMSRequestNetworkTimeoutError } from '../errors';
import { type KMSProviders } from '.';
import * as utils from './utils';

const MINIMUM_TOKEN_REFRESH_IN_MILLISECONDS = 6000;

interface AccessToken {
  accessToken: string;
  expiresOnTimestamp: number;
}
/**
 * @internal
 */
export class AzureCredentialCache {
  /** @internal */
  cachedToken: AccessToken | null = null;

  async getToken(): Promise<AccessToken> {
    if (this.needsRefresh(this.cachedToken)) {
      this.cachedToken = await this._getToken();
    }

    return { ...this.cachedToken! };
  }

  needsRefresh(token: typeof this.cachedToken): boolean {
    if (token == null) {
      return true;
    }
    const timeUntilExpirationMS = token.expiresOnTimestamp - Date.now();
    return timeUntilExpirationMS <= MINIMUM_TOKEN_REFRESH_IN_MILLISECONDS;
  }

  /**
   * exposed for testing
   * @internal
   */
  resetCache() {
    this.cachedToken = null;
  }

  /**
   * exposed for testing
   * @internal
   */
  _getToken(): Promise<typeof this.cachedToken> {
    return fetchAzureKMSToken();
  }
}

/** @internal */
export const tokenCache = new AzureCredentialCache();

async function parseResponse(response: { body: string; status?: number }): Promise<AccessToken> {
  const { status, body: rawBody } = response;

  const body: { expires_in?: number; access_token?: string } = (() => {
    try {
      return JSON.parse(rawBody);
    } catch {
      throw new MongoCryptAzureKMSRequestError('Malformed JSON body in GET request.');
    }
  })();

  if (status !== 200) {
    throw new MongoCryptAzureKMSRequestError('Unable to complete request.', body);
  }

  if (!body.access_token) {
    throw new MongoCryptAzureKMSRequestError(
      'Malformed response body - missing field `access_token`.'
    );
  }

  if (!body.expires_in) {
    throw new MongoCryptAzureKMSRequestError(
      'Malformed response body - missing field `expires_in`.'
    );
  }

  const expiresInMS = Number(body.expires_in) * 1000;
  if (Number.isNaN(expiresInMS)) {
    throw new MongoCryptAzureKMSRequestError(
      'Malformed response body - unable to parse int from `expires_in` field.'
    );
  }

  return {
    accessToken: body.access_token,
    expiresOnTimestamp: Date.now() + expiresInMS
  };
}

/**
 * @internal
 *
 * exposed for CSFLE
 * [prose test 18](https://github.com/mongodb/specifications/tree/master/source/client-side-encryption/tests#azure-imds-credentials)
 */
export interface AzureKMSRequestOptions {
  headers?: Document;
  url?: URL | string;
}

/**
 * @internal
 *
 * parses any options provided by prose tests to `fetchAzureKMSToken` and merges them with
 * the default values for headers and the request url.
 */
export function prepareRequest(options: AzureKMSRequestOptions): {
  headers: Document;
  url: URL;
} {
  const url =
    options.url == null
      ? new URL('http://169.254.169.254/metadata/identity/oauth2/token')
      : // The Node URL constructor technically supports "any object that converts to a valid URL string",
        // but Node types doesn't support this.  See the Node docs for new URL().
        // https://nodejs.org/api/url.html#new-urlinput-base
        // @ts-ignore
        new URL(options.url);

  url.searchParams.append('api-version', '2018-02-01');
  url.searchParams.append('resource', 'https://vault.azure.net');

  const headers = { ...options.headers, 'Content-Type': 'application/json', Metadata: true };
  return { headers, url };
}

/**
 * @internal
 *
 * `AzureKMSRequestOptions` allows prose tests to modify the http request sent to the idms
 * servers.  This is required to simulate different server conditions.  No options are expected to
 * be set outside of tests.
 *
 * exposed for CSFLE
 * [prose test 18](https://github.com/mongodb/specifications/tree/master/source/client-side-encryption/tests#azure-imds-credentials)
 */
export async function fetchAzureKMSToken(options: AzureKMSRequestOptions = {}) {
  const { headers, url } = prepareRequest(options);
  const response = await utils.get(url, { headers }).catch(error => {
    if (error instanceof MongoCryptKMSRequestNetworkTimeoutError) {
      throw new MongoCryptAzureKMSRequestError(`[Azure KMS] ${error.message}`);
    }
    throw error;
  });
  return parseResponse(response);
}

/**
 * @internal
 *
 * @throws Will reject with a `MongoCryptError` if the http request fails or the http response is malformed.
 */
export async function loadAzureCredentials(kmsProviders: KMSProviders): Promise<KMSProviders> {
  const azure = await tokenCache.getToken();
  return { ...kmsProviders, azure };
}
