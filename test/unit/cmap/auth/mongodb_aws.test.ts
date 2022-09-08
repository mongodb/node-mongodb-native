import { expect } from 'chai';

import { findAwsKmsOptions } from '../../../../src/cmap/auth/mongodb_aws';

describe('mongodb_aws', function () {
  const originalAccessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const originalSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const originalSessionToken = process.env.AWS_SESSION_TOKEN;

  after(function () {
    // After the entire suite runs, set the env back for the rest of the test run.
    process.env.AWS_ACCESS_KEY_ID = originalAccessKeyId;
    process.env.AWS_SECRET_ACCESS_KEY = originalSecretAccessKey;
    process.env.AWS_SESSION_TOKEN = originalSessionToken;
  });

  const resetEnvironment = () => {
    process.env.AWS_ACCESS_KEY_ID = '';
    process.env.AWS_SECRET_ACCESS_KEY = '';
    process.env.AWS_SESSION_TOKEN = '';
  };
  afterEach(resetEnvironment);

  describe('#findAwsKmsOptions', function () {
    context('when the environment has variables set', function () {
      const accessKeyId = 'accessKeyId';
      const secretAccessKey = 'secretAccessKey';
      const sessionToken = 'sessionToken';

      context('when accessKeyId and secretAccessKey are set', function () {
        beforeEach(function () {
          process.env.AWS_ACCESS_KEY_ID = accessKeyId;
          process.env.AWS_SECRET_ACCESS_KEY = secretAccessKey;
        });

        context('when sessionToken is set', function () {
          beforeEach(function () {
            process.env.AWS_SESSION_TOKEN = sessionToken;
          });

          it('returns the kms providers with sessionToken', async function () {
            expect(await findAwsKmsOptions()).to.deep.equal({
              aws: {
                accessKeyId: 'accessKeyId',
                secretAccessKey: 'secretAccessKey',
                sessionToken: 'sessionToken'
              }
            });
          });
        });

        context('when sessionToken is not set', function () {
          it('returns the kms providers without sessionToken', async function () {
            expect(await findAwsKmsOptions()).to.deep.equal({
              aws: {
                accessKeyId: 'accessKeyId',
                secretAccessKey: 'secretAccessKey'
              }
            });
          });
        });
      });
    });
  });
});
