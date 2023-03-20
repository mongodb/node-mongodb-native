import { expect } from 'chai';
import { get } from 'http';

import { Document } from '../../mongodb';

const BASE_URL = new URL(`http://127.0.0.1:8080/metadata/identity/oauth2/token`);

async function mockServerIsSetup() {
  const url = (() => {
    const copiedURL = new URL(BASE_URL);

    // minimum configuration for the mock server not to throw an error when responding.
    copiedURL.searchParams.append('api-version', '2018-02-01');
    copiedURL.searchParams.append('resource', 'https://vault.azure.net');
    return copiedURL;
  })();
  return new Promise<void>((resolve, reject) => {
    get(url, res => {
      if (res.statusCode === 200) {
        return resolve();
      }
      return reject('server not running');
    })
      .on('error', error => reject(error))
      .end();
  });
}

class KMSRequestOptions {
  url: URL = BASE_URL;
  headers: Document;
  constructor(testCase?: 'empty-json' | 'bad-json' | '404' | '500' | 'slow') {
    this.headers =
      testCase != null
        ? {
            'X-MongoDB-HTTP-TestParams': `case=${testCase}`
          }
        : {};
  }
}

context('Azure KMS Mock Server Tests', function () {
  let fetchAzureKMSToken: (options: {
    url: URL;
    headers: Document;
  }) => Promise<{ accessToken: string }>;
  let MongoCryptAzureKMSRequestError: Error;

  const AZURE_KMS_TEST_EXPORTS = '___azureKMSProseTestExports';
  beforeEach(async function () {
    try {
      await mockServerIsSetup();
    } catch {
      this.currentTest.skipReason = 'Test requires mock azure identity endpoint to be running.';
      this.test?.skip();
    }

    fetchAzureKMSToken = this.configuration.mongodbClientEncryption[AZURE_KMS_TEST_EXPORTS];
    KMSRequestFailedError =
      this.configuration.mongodbClientEncryption.MongoCryptAzureKMSRequestError;
  });

  context('Case 1: Success', function () {
    // 	Do not set an ``X-MongoDB-HTTP-TestParams`` header.

    // Upon receiving a response from ``fake_azure``, the driver must decode the
    // following information:

    // 1. HTTP status will be ``200 Okay``.
    // 2. The HTTP body will be a valid JSON string.
    // 3. The access token will be the string ``"magic-cookie"``.
    // 4. The expiry duration of the token will be seventy seconds.
    // 5. The token will have a resource of ``"https://vault.azure.net"``

    it('returns a properly formatted access token', async () => {
      const credentials = await fetchAzureKMSToken(new KMSRequestOptions());
      expect(credentials).to.have.property('accessToken', 'magic-cookie');
    });
  });

  context('Case 2: Empty JSON', function () {
    // This case addresses a server returning valid JSON with invalid content.
    // Set ``X-MongoDB-HTTP-TestParams`` to ``case=empty-json``.
    // Upon receiving a response:
    // 1. HTTP status will be ``200 Okay``
    // 2. The HTTP body will be a valid JSON string.
    // 3. There will be no access token, expiry duration, or resource.
    // The test case should ensure that this error condition is handled gracefully.

    it('returns an error', async () => {
      const error = await fetchAzureKMSToken(new KMSRequestOptions('empty-json')).catch(
        e => e
      );

      expect(credentials).to.be.instanceof(KMSRequestFailedError);
    });
  });

  context('Case 3: Bad JSON', function () {
    // This case addresses a server returning malformed JSON.
    // Set ``X-MongoDB-HTTP-TestParams`` to ``case=bad-json``.
    // Upon receiving a response:
    // 1. HTTP status will be ``200 Okay``
    // 2. The response body will contain a malformed JSON string.
    // The test case should ensure that this error condition is handled gracefully.

    it('returns an error', async () => {
      const credentials = await fetchAzureKMSToken(new KMSRequestOptions('bad-json')).catch(e => e);

      expect(credentials).to.be.instanceof(KMSRequestFailedError);
    });
  });

  context('Case 4: HTTP 404', function () {
    // This case addresses a server returning a "Not Found" response. This is
    // documented to occur spuriously within an Azure environment.
    // Set ``X-MongoDB-HTTP-TestParams`` to ``case=404``.
    // Upon receiving a response:
    // 1. HTTP status will be ``404 Not Found``.
    // 2. The response body is unspecified.
    // The test case should ensure that this error condition is handled gracefully.
    it('returns an error', async () => {
      const credentials = await fetchAzureKMSToken(new KMSRequestOptions('404')).catch(e => e);

      expect(credentials).to.be.instanceof(KMSRequestFailedError);
    });
  });

  context('Case 5: HTTP 500', function () {
    // This case addresses an IMDS server reporting an internal error. This is
    // documented to occur spuriously within an Azure environment.
    // Set ``X-MongoDB-HTTP-TestParams`` to ``case=500``.
    // Upon receiving a response:
    // 1. HTTP status code will be ``500``.
    // 2. The response body is unspecified.
    // The test case should ensure that this error condition is handled gracefully.
    it('returns an error', async () => {
      const credentials = await fetchAzureKMSToken(new KMSRequestOptions('500')).catch(e => e);

      expect(credentials).to.be.instanceof(KMSRequestFailedError);
    });
  });

  context('Case 6: Slow Response', function () {
    // This case addresses an IMDS server responding very slowly. Drivers should not
    // halt the application waiting on a peer to communicate.
    // Set ``X-MongoDB-HTTP-TestParams`` to ``case=slow``.
    // The HTTP response from the ``fake_azure`` server will take at least 1000 seconds
    // to complete. The request should fail with a timeout.
    it('returns an error after the request times out', async () => {
      const credentials = await fetchAzureKMSToken(new KMSRequestOptions('slow')).catch(e => e);

      expect(credentials).to.be.instanceof(KMSRequestFailedError);
    });
  });
});
