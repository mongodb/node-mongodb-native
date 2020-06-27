'use strict';

const mongodb = require('../../../..');
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
  initializeFilter(client, context, callback) {
    const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
    const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
    let mongodbClientEncryption;
    try {
      mongodbClientEncryption = require('mongodb-client-encryption').extension(mongodb);
    } catch (e) {
      // Do Nothing
    }

    this.enabled = !!(AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY && mongodbClientEncryption);

    // Adds these fields onto the context so that they can be reused by tests
    context.clientSideEncryption = {
      enabled: this.enabled,
      mongodbClientEncryption,
      AWS_ACCESS_KEY_ID,
      AWS_SECRET_ACCESS_KEY
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
