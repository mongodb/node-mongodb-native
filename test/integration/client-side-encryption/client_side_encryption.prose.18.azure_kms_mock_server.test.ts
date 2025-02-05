import { expect } from 'chai';

// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { MongoCryptAzureKMSRequestError } from '../../../src/client-side-encryption/errors';
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import {
  type AzureKMSRequestOptions,
  fetchAzureKMSToken
} from '../../../src/client-side-encryption/providers/azure';
import { type Document } from '../../mongodb';

const BASE_URL = new URL(`http://127.0.0.1:8080/metadata/identity/oauth2/token`);
class KMSRequestOptions implements AzureKMSRequestOptions {
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

const metadata: MongoDBMetadataUI = {
  requires: {
    clientSideEncryption: true,
    idmsMockServer: true
  }
};

const closeSignal = new AbortController().signal;

context('Azure KMS Mock Server Tests', function () {
  context('Case 1: Success', metadata, function () {
    // 	Do not set an ``X-MongoDB-HTTP-TestParams`` header.

    // Upon receiving a response from ``fake_azure``, the driver must decode the
    // following information:

    // 1. HTTP status will be ``200 Okay``.
    // 2. The HTTP body will be a valid JSON string.
    // 3. The access token will be the string ``"magic-cookie"``.
    // 4. The expiry duration of the token will be seventy seconds.
    // 5. The token will have a resource of ``"https://vault.azure.net"``

    it('returns a properly formatted access token', async () => {
      const credentials = await fetchAzureKMSToken(new KMSRequestOptions(), closeSignal);
      expect(credentials).to.have.property('accessToken', 'magic-cookie');
    });
  });

  context('Case 2: Empty JSON', metadata, function () {
    // This case addresses a server returning valid JSON with invalid content.
    // Set ``X-MongoDB-HTTP-TestParams`` to ``case=empty-json``.
    // Upon receiving a response:
    // 1. HTTP status will be ``200 Okay``
    // 2. The HTTP body will be a valid JSON string.
    // 3. There will be no access token, expiry duration, or resource.
    // The test case should ensure that this error condition is handled gracefully.

    it('returns an error', async () => {
      const error = await fetchAzureKMSToken(
        new KMSRequestOptions('empty-json'),
        closeSignal
      ).catch(e => e);

      expect(error).to.be.instanceof(MongoCryptAzureKMSRequestError);
    });
  });

  context('Case 3: Bad JSON', metadata, function () {
    // This case addresses a server returning malformed JSON.
    // Set ``X-MongoDB-HTTP-TestParams`` to ``case=bad-json``.
    // Upon receiving a response:
    // 1. HTTP status will be ``200 Okay``
    // 2. The response body will contain a malformed JSON string.
    // The test case should ensure that this error condition is handled gracefully.

    it('returns an error', async () => {
      const error = await fetchAzureKMSToken(new KMSRequestOptions('bad-json'), closeSignal).catch(
        e => e
      );

      expect(error).to.be.instanceof(MongoCryptAzureKMSRequestError);
    });
  });

  context('Case 4: HTTP 404', metadata, function () {
    // This case addresses a server returning a "Not Found" response. This is
    // documented to occur spuriously within an Azure environment.
    // Set ``X-MongoDB-HTTP-TestParams`` to ``case=404``.
    // Upon receiving a response:
    // 1. HTTP status will be ``404 Not Found``.
    // 2. The response body is unspecified.
    // The test case should ensure that this error condition is handled gracefully.
    it('returns an error', async () => {
      const error = await fetchAzureKMSToken(new KMSRequestOptions('404'), closeSignal).catch(
        e => e
      );

      expect(error).to.be.instanceof(MongoCryptAzureKMSRequestError);
    });
  });

  context('Case 5: HTTP 500', metadata, function () {
    // This case addresses an IMDS server reporting an internal error. This is
    // documented to occur spuriously within an Azure environment.
    // Set ``X-MongoDB-HTTP-TestParams`` to ``case=500``.
    // Upon receiving a response:
    // 1. HTTP status code will be ``500``.
    // 2. The response body is unspecified.
    // The test case should ensure that this error condition is handled gracefully.
    it('returns an error', async () => {
      const error = await fetchAzureKMSToken(new KMSRequestOptions('500'), closeSignal).catch(
        e => e
      );

      expect(error).to.be.instanceof(MongoCryptAzureKMSRequestError);
    });
  });

  context('Case 6: Slow Response', metadata, function () {
    // This case addresses an IMDS server responding very slowly. Drivers should not
    // halt the application waiting on a peer to communicate.
    // Set ``X-MongoDB-HTTP-TestParams`` to ``case=slow``.
    // The HTTP response from the ``fake_azure`` server will take at least 1000 seconds
    // to complete. The request should fail with a timeout.
    it('returns an error after the request times out', async () => {
      const error = await fetchAzureKMSToken(new KMSRequestOptions('slow'), closeSignal).catch(
        e => e
      );

      expect(error).to.be.instanceof(MongoCryptAzureKMSRequestError);
    });
  });
});
