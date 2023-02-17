'use strict';

const mongodb = require('../../../mongodb');
const process = require('process');

/**
 * Filter for whether or not a test needs / doesn't need Client Side Encryption
 *
 * example:
 * metadata: {
 *    requires: {
 *      clientSideEncryption: true|false
 *    }
 * }
 */

class ClientSideEncryptionFilter {
  initializeFilter(client, context, callback) {
    const CSFLE_KMS_PROVIDERS = process.env.CSFLE_KMS_PROVIDERS;
    let mongodbClientEncryption;
    try {
      mongodbClientEncryption = require('mongodb-client-encryption').extension(mongodb);
    } catch (failedToGetFLELib) {
      if (process.env.TEST_CSFLE) {
        console.error({ failedToGetFLELib });
      }
    }

    this.enabled = !!(CSFLE_KMS_PROVIDERS && mongodbClientEncryption);

    // Adds these fields onto the context so that they can be reused by tests
    context.clientSideEncryption = {
      enabled: this.enabled,
      mongodbClientEncryption,
      CSFLE_KMS_PROVIDERS
    };

    callback();
  }

  filter(test) {
    const clientSideEncryption =
      test.metadata && test.metadata.requires && test.metadata.requires.clientSideEncryption;

    if (clientSideEncryption == null) {
      return true;
    }

    if (clientSideEncryption !== true) {
      throw new Error('ClientSideEncryptionFilter can only be set to true');
    }

    // TODO(NODE-3401): unskip csfle tests on windows
    if (process.env.TEST_CSFLE && !this.enabled && process.platform !== 'win32') {
      throw new Error('Expected CSFLE to be enabled in the CI');
    }

    return this.enabled;
  }
}

module.exports = ClientSideEncryptionFilter;
