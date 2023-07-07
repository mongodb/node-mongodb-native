'use strict';

let awsCredentialProviders = null;
/** @ignore */
async function loadAWSCredentials(kmsProviders) {
  if (awsCredentialProviders == null) {
    try {
      // Ensure you always wrap an optional require in the try block NODE-3199
      awsCredentialProviders = require('@aws-sdk/credential-providers');
      // eslint-disable-next-line no-empty
    } catch {}
  }

  if (awsCredentialProviders != null) {
    const { fromNodeProviderChain } = awsCredentialProviders;
    const provider = fromNodeProviderChain();
    // The state machine is the only place calling this so it will
    // catch if there is a rejection here.
    const aws = await provider();
    return { ...kmsProviders, aws };
  }

  return kmsProviders;
}

module.exports = { loadAWSCredentials };
