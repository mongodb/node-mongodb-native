'use strict';

const mongodb = require('../../../../src');

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
    } catch (e) {
      // Do Nothing
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

    return typeof clientSideEncryption !== 'boolean' || clientSideEncryption === this.enabled;
  }
}

module.exports = ClientSideEncryptionFilter;
