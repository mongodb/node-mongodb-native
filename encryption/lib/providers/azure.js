'use strict';

const {
  MongoCryptAzureKMSRequestError,
  MongoCryptKMSRequestNetworkTimeoutError
} = require('../errors');
const utils = require('./utils');

const MINIMUM_TOKEN_REFRESH_IN_MILLISECONDS = 6000;

/**
 * @class
 * @ignore
 */
class AzureCredentialCache {
  constructor() {
    /**
     * @type { { accessToken: string, expiresOnTimestamp: number } | null}
     */
    this.cachedToken = null;
  }

  async getToken() {
    if (this.needsRefresh(this.cachedToken)) {
      this.cachedToken = await this._getToken();
    }

    return { accessToken: this.cachedToken.accessToken };
  }

  needsRefresh(token) {
    if (token == null) {
      return true;
    }
    const timeUntilExpirationMS = token.expiresOnTimestamp - Date.now();
    return timeUntilExpirationMS <= MINIMUM_TOKEN_REFRESH_IN_MILLISECONDS;
  }

  /**
   * exposed for testing
   * @ignore
   */
  resetCache() {
    this.cachedToken = null;
  }

  /**
   * exposed for testing
   * @ignore
   */
  _getToken() {
    return fetchAzureKMSToken();
  }
}
/**
 * @type{ AzureCredentialCache }
 * @ignore
 */
let tokenCache = new AzureCredentialCache();

/**
 * @typedef {object} KmsRequestResponsePayload
 * @property {string | undefined} access_token
 * @property {string | undefined} expires_in
 *
 * @ignore
 */

/**
 * @param { {body: string, status: number }} response
 * @returns { Promise<{ accessToken: string, expiresOnTimestamp: number } >}
 * @ignore
 */
async function parseResponse(response) {
  const { status, body: rawBody } = response;

  /**
   * @type { KmsRequestResponsePayload }
   */
  const body = (() => {
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
 * @param {object} options
 * @param {object | undefined} [options.headers]
 * @param {URL | undefined} [options.url]
 *
 * @ignore
 */
function prepareRequest(options) {
  const url =
    options.url == null
      ? new URL('http://169.254.169.254/metadata/identity/oauth2/token')
      : new URL(options.url);

  url.searchParams.append('api-version', '2018-02-01');
  url.searchParams.append('resource', 'https://vault.azure.net');

  const headers = { ...options.headers, 'Content-Type': 'application/json', Metadata: true };
  return { headers, url };
}

/**
 * @typedef {object} AzureKMSRequestOptions
 * @property {object | undefined} headers
 * @property {URL | undefined} url
 * @ignore
 */

/**
 * @typedef {object} AzureKMSRequestResponse
 * @property {string} accessToken
 * @property {number} expiresOnTimestamp
 * @ignore
 */

/**
 * exported only for testing purposes in the driver
 *
 * @param {AzureKMSRequestOptions} options
 * @returns {Promise<AzureKMSRequestResponse>}
 *
 * @ignore
 */
async function fetchAzureKMSToken(options = {}) {
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
 * @ignore
 */
async function loadAzureCredentials(kmsProviders) {
  const azure = await tokenCache.getToken();
  return { ...kmsProviders, azure };
}

module.exports = { loadAzureCredentials, AzureCredentialCache, fetchAzureKMSToken, tokenCache };
