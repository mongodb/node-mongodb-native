import { readFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import * as process from 'process';

import { type MongoClient } from '../../../mongodb';
import { Filter } from './filter';

/**
 * Filter for whether or not a test needs / doesn't need Client Side Encryption
 *
 * @example
 * ```js
 * metadata: {
 *    requires: {
 *      clientSideEncryption: true|false
 *    }
 * }
 * ```
 */

export class ClientSideEncryptionFilter extends Filter {
  enabled: boolean;
  static version = null;

  async initializeFilter(client: MongoClient, context: Record<string, any>) {
    const CSFLE_KMS_PROVIDERS = process.env.CSFLE_KMS_PROVIDERS;
    let mongodbClientEncryption;
    try {
      mongodbClientEncryption = require('mongodb-client-encryption');
    } catch (failedToGetFLELib) {
      if (process.env.TEST_CSFLE) {
        console.error({ failedToGetFLELib });
      }
    }

    ClientSideEncryptionFilter.version ??= JSON.parse(
      await readFile(
        resolve(dirname(require.resolve('mongodb-client-encryption')), '..', 'package.json'),
        'utf8'
      )
    ).version;

    this.enabled = !!(CSFLE_KMS_PROVIDERS && mongodbClientEncryption);

    // Adds these fields onto the context so that they can be reused by tests
    context.clientSideEncryption = {
      enabled: this.enabled,
      mongodbClientEncryption,
      CSFLE_KMS_PROVIDERS,
      version: ClientSideEncryptionFilter.version
    };
  }

  filter(test: { metadata?: MongoDBMetadataUI }) {
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
