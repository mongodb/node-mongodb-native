'use strict';

const mongodb = require('../../../../src');
const semver = require('semver');

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
  get name() {
    return this.constructor.name;
  }

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

    // CSFLE is only supported on LTS versions of node
    const nodeSupportsCSFLE = semver.satisfies(process.version, '>4');

    const ret = typeof clientSideEncryption !== 'boolean' || clientSideEncryption === this.enabled;
    return ret && nodeSupportsCSFLE;
  }
}

module.exports = ClientSideEncryptionFilter;
