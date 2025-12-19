import { expect } from 'chai';

import { aws4Sign, type Options } from '../../src/aws4';

describe('Verify AWS4 signature generation', () => {
  const date = new Date('2025-12-15T12:34:56Z');
  const awsCredentials = {
    accessKeyId: 'AKIDEXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY'
  };
  const awsSessionCredentials = {
    accessKeyId: 'AKIDEXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYexamplekey',
    sessionToken: 'AQoDYXdzEJ'
  };
  const host = 'sts.amazonaws.com';
  const body = 'Action=GetCallerIdentity&Version=2011-06-15';
  const request: Options = {
    method: 'POST',
    host,
    path: '/',
    region: 'us-east-1',
    service: 'sts',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': body.length,
      'X-MongoDB-Server-Nonce': 'fakenonce',
      'X-MongoDB-GS2-CB-Flag': 'n'
    },
    body,
    date
  };

  it('should generate correct credentials for permanent credentials', async () => {
    const signed = await aws4Sign(request, awsCredentials);

    expect(signed.headers['X-Amz-Date']).to.exist;
    expect(signed.headers['X-Amz-Date']).to.equal('20251215T123456Z');
    expect(signed.headers['Authorization']).to.exist;
    expect(signed.headers['Authorization']).to.equal(
      'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20251215/us-east-1/sts/aws4_request, SignedHeaders=content-length;content-type;host;x-amz-date;x-mongodb-gs2-cb-flag;x-mongodb-server-nonce, Signature=48a66f9fc76829002a7a7ac5b92e4089395d9b88ea7d417ab146949b90eeab08'
    );

    // Uncomment the following lines if you want to compare with the old aws4 library.
    // Remember to import aws4 at the top of the file, like this: import * as aws4sign from 'aws4';

    // const oldSigned = aws4sign.sign(request, awsCredentials);
    // expect(oldSigned.headers['X-Amz-Date']).to.exist;
    // expect(oldSigned.headers['X-Amz-Date']).to.equal(signed.headers['X-Amz-Date']);
    // expect(oldSigned.headers['Authorization']).to.exist;
    // expect(oldSigned.headers['Authorization']).to.equal(signed.headers['Authorization']);
  });

  it('should generate correct credentials for session credentials', async () => {
    const signed = await aws4Sign(request, awsSessionCredentials);

    expect(signed.headers['X-Amz-Date']).to.exist;
    expect(signed.headers['X-Amz-Date']).to.equal('20251215T123456Z');
    expect(signed.headers['Authorization']).to.exist;
    expect(signed.headers['Authorization']).to.equal(
      'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20251215/us-east-1/sts/aws4_request, SignedHeaders=content-length;content-type;host;x-amz-date;x-amz-security-token;x-mongodb-gs2-cb-flag;x-mongodb-server-nonce, Signature=bbcb06e2feb8651dced329789743ba283f92ef1302d34a7398cb1d35808a1a66'
    );

    // Uncomment the following lines if you want to compare with the old aws4 library.
    // Remember to import aws4 at the top of the file, like this: import * as aws4sign from 'aws4';

    // const oldSigned = aws4sign.sign(request, awsSessionCredentials);
    // expect(oldSigned.headers['X-Amz-Date']).to.exist;
    // expect(oldSigned.headers['X-Amz-Date']).to.equal(signed.headers['X-Amz-Date']);
    // expect(oldSigned.headers['Authorization']).to.exist;
    // expect(oldSigned.headers['Authorization']).to.equal(signed.headers['Authorization']);
  });
});
