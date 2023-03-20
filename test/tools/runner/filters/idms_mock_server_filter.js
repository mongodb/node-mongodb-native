'use strict';

const { get } = require('http');

async function isMockServerSetup() {
  const url = (() => {
    const url = new URL(`http://127.0.0.1:8080/metadata/identity/oauth2/token`);

    // minimum configuration for the mock server not to throw an error when responding.
    url.searchParams.append('api-version', '2018-02-01');
    url.searchParams.append('resource', 'https://vault.azure.net');
    return url;
  })();
  return new Promise((resolve, reject) => {
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

/**
 * Filter for tests that require the mock idms server to be running.
 *
 * example:
 * metadata: {
 *    requires: {
 *      idmsMockServer: true
 *    }
 * }
 */
class IDMSMockServerFilter {
  initializeFilter(client, context, callback) {
    isMockServerSetup()
      .then(
        () => (this.isRunning = true),
        () => (this.isRunning = false)
      )
      .then(() => callback());
  }

  filter(test) {
    if (!test.metadata) return true;
    if (!test.metadata.requires) return true;
    if (!test.metadata.requires.idmsMockServer) return true;

    const requiresMockServer = test.metadata.requires.idmsMockServer;
    if (!requiresMockServer) {
      return true;
    }
    if (process.env.TEST_CSFLE && !this.isRunning) {
      throw new Error('Expected Azure KMS server to be running.');
    }
    return this.isRunning;
  }
}

module.exports = IDMSMockServerFilter;
