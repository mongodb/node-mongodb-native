'use strict';

const { loadAWSCredentials } = require('./aws');
const { loadAzureCredentials, fetchAzureKMSToken } = require('./azure');
const { loadGCPCredentials } = require('./gcp');

/**
 * Auto credential fetching should only occur when the provider is defined on the kmsProviders map
 * and the settings are an empty object.
 *
 * This is distinct from a nullish provider key.
 *
 * @param {'aws' | 'gcp' | 'azure'} provider
 * @param {object} kmsProviders
 *
 * @ignore
 */
function isEmptyCredentials(provider, kmsProviders) {
  return (
    provider in kmsProviders &&
    kmsProviders[provider] != null &&
    typeof kmsProviders[provider] === 'object' &&
    Object.keys(kmsProviders[provider]).length === 0
  );
}

/**
 * Load cloud provider credentials for the user provided KMS providers.
 * Credentials will only attempt to get loaded if they do not exist
 * and no existing credentials will get overwritten.
 *
 * @param {object} kmsProviders - The user provided KMS providers.
 * @returns {object} The new kms providers.
 *
 * @ignore
 */
async function loadCredentials(kmsProviders) {
  let finalKMSProviders = kmsProviders;

  if (isEmptyCredentials('aws', kmsProviders)) {
    finalKMSProviders = await loadAWSCredentials(finalKMSProviders);
  }

  if (isEmptyCredentials('gcp', kmsProviders)) {
    finalKMSProviders = await loadGCPCredentials(finalKMSProviders);
  }

  if (isEmptyCredentials('azure', kmsProviders)) {
    finalKMSProviders = await loadAzureCredentials(finalKMSProviders);
  }
  return finalKMSProviders;
}

module.exports = { loadCredentials, isEmptyCredentials, fetchAzureKMSToken };
