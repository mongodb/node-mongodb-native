'use strict';

let gcpMetadata = null;
/** @ignore */
async function loadGCPCredentials(kmsProviders) {
  if (gcpMetadata == null) {
    try {
      // Ensure you always wrap an optional require in the try block NODE-3199
      gcpMetadata = require('gcp-metadata');
      // eslint-disable-next-line no-empty
    } catch {}
  }

  if (gcpMetadata != null) {
    const { access_token: accessToken } = await gcpMetadata.instance({
      property: 'service-accounts/default/token'
    });
    return { ...kmsProviders, gcp: { accessToken } };
  }

  return kmsProviders;
}

module.exports = { loadGCPCredentials };
