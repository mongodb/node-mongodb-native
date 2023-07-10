'use strict';

// Data Key Stuff
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const AWS_REGION = process.env.AWS_REGION;
const AWS_CMK_ID = process.env.AWS_CMK_ID;

const awsKmsProviders = {
  aws: { accessKeyId: AWS_ACCESS_KEY_ID, secretAccessKey: AWS_SECRET_ACCESS_KEY }
};
const awsDataKeyOptions = { masterKey: { key: AWS_CMK_ID, region: AWS_REGION } };

const SKIP_LIVE_TESTS = !!process.env.MONGODB_NODE_SKIP_LIVE_TESTS;
const SKIP_AWS_TESTS =
  SKIP_LIVE_TESTS || !AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY || !AWS_REGION || !AWS_CMK_ID;

function isAWSCredentialProviderInstalled() {
  try {
    require.resolve('@aws-sdk/credential-providers');
    return true;
  } catch {
    return false;
  }
}

function isGCPCredentialProviderInstalled() {
  try {
    require.resolve('gcp-metadata');
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  SKIP_LIVE_TESTS,
  SKIP_AWS_TESTS,
  KEYS: {
    AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY,
    AWS_REGION,
    AWS_CMK_ID
  },
  awsKmsProviders,
  awsDataKeyOptions,
  credentialProvidersInstalled: {
    aws: isAWSCredentialProviderInstalled(),
    gcp: isGCPCredentialProviderInstalled()
  }
};
