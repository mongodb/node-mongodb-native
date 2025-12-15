import * as process from 'node:process';

import { expect } from 'chai';

import { aws4Sign } from '../../../src/aws4';

// This test verifies that our AWS SigV4 signing works correctly with real AWS credentials.
// This is done by calculating a signature, then using it to make a real request to the AWS STS service.
// To run this test, simply run `./etc/aws-test.sh`.

describe('AwsSigV4', function () {
  beforeEach(function () {
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      this.skipReason = 'AWS credentials are not present in the environment';
      this.skip();
    }
  });

  const testSigning = async credentials => {
    const host = 'sts.amazonaws.com';
    const body = 'Action=GetCallerIdentity&Version=2011-06-15';
    const headers: {
      'Content-Type': 'application/x-www-form-urlencoded';
      'Content-Length': number;
      'X-MongoDB-Server-Nonce': string;
      'X-MongoDB-GS2-CB-Flag': 'n';
    } = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': body.length,
      'X-MongoDB-Server-Nonce': 'fakenonce',
      'X-MongoDB-GS2-CB-Flag': 'n'
    };
    const signed = aws4Sign(
      {
        method: 'POST',
        host,
        path: '/',
        region: 'us-east-1',
        service: 'sts',
        headers: headers,
        body
      },
      credentials
    );

    const authorization = signed.headers.Authorization;
    const xAmzDate = signed.headers['X-Amz-Date'];

    const fetchHeaders = new Headers();
    for (const [key, value] of Object.entries(headers)) {
      fetchHeaders.append(key, value.toString());
    }
    if (credentials.sessionToken) {
      fetchHeaders.append('X-Amz-Security-Token', credentials.sessionToken);
    }
    fetchHeaders.append('Authorization', authorization);
    fetchHeaders.append('X-Amz-Date', xAmzDate);
    const response = await fetch('https://sts.amazonaws.com', {
      method: 'POST',
      headers: fetchHeaders,
      body
    });
    expect(response.status).to.equal(200);
    expect(response.statusText).to.equal('OK');
    const text = await response.text();
    expect(text).to.match(
      /<GetCallerIdentityResponse xmlns="https:\/\/sts.amazonaws.com\/doc\/2011-06-15\/">/
    );
  };

  describe('AWS4 signs requests with missing AWS env vars', function () {
    before(function () {
      if (
        process.env.AWS_ACCESS_KEY_ID ||
        process.env.AWS_SECRET_ACCESS_KEY ||
        process.env.AWS_SESSION_TOKEN
      ) {
        this.skipReason = 'Skipping missing credentials test because AWS credentials are set';
        this.skip();
      }
    });

    it('AWS4 signs requests with missing aws env vars', async () => {
      await testSigning(undefined);
    });
  });

  describe('AWS4 signs requests with AWS permanent env vars', function () {
    before(function () {
      if (process.env.AWS_SESSION_TOKEN) {
        this.skipReason = 'Skipping permanent credentials test because session token is set';
        this.skip();
      }
    });

    it('AWS4 signs requests with AWS permanent env vars', async () => {
      const awsCredentials = {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      };
      await testSigning(awsCredentials);
    });
  });

  describe('AWS4 signs requests with AWS session env vars', function () {
    before(function () {
      if (!process.env.AWS_SESSION_TOKEN) {
        this.skipReason = 'Skipping session credentials test because session token is not set';
        this.skip();
      }
    });

    it('AWS4 signs requests with AWS session env vars', async () => {
      const awsSesssionCredentials = {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken: process.env.AWS_SESSION_TOKEN
      };
      await testSigning(awsSesssionCredentials);
    });
  });
});
