import { readFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import * as process from 'process';
import { satisfies } from 'semver';

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
  static libmongocrypt: string | null = null;

  csfleKMSProviders = null;

  override async initializeFilter(client: MongoClient, context: Record<string, any>) {
    this.csfleKMSProviders = process.env.CSFLE_KMS_PROVIDERS;
    let mongodbClientEncryption;
    try {
      mongodbClientEncryption = require('mongodb-client-encryption');
      ClientSideEncryptionFilter.libmongocrypt = (
        mongodbClientEncryption as typeof import('mongodb-client-encryption')
      ).MongoCrypt.libmongocryptVersion;
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

    this.enabled = !!(this.csfleKMSProviders && mongodbClientEncryption);

    // Adds these fields onto the context so that they can be reused by tests
    context.clientSideEncryption = {
      enabled: this.enabled,
      mongodbClientEncryption,
      CSFLE_KMS_PROVIDERS: this.csfleKMSProviders,
      version: ClientSideEncryptionFilter.version,
      libmongocrypt: ClientSideEncryptionFilter.libmongocrypt
    };
  }

  filter(test: { metadata?: MongoDBMetadataUI }) {
    const clientSideEncryption =
      test.metadata && test.metadata.requires && test.metadata.requires.clientSideEncryption;

    if (clientSideEncryption == null) {
      return true;
    }

    if (clientSideEncryption === false) {
      throw new Error(
        'ClientSideEncryptionFilter can only be set to true or a semver version range.'
      );
    }

    // TODO(NODE-3401): unskip csfle tests on windows
    if (process.env.TEST_CSFLE && process.platform !== 'win32') {
      if (!this.csfleKMSProviders) {
        throw new Error('FLE tests must run, but no KMS providers were set in the environment.');
      }
      if (ClientSideEncryptionFilter.version == null) {
        throw new Error('FLE tests must run, but mongodb client encryption was not installed.');
      }
    }

    if (this.csfleKMSProviders == null) return 'Test requires FLE environment variables.';
    if (ClientSideEncryptionFilter.version == null)
      return 'Test requires mongodb-client-encryption to be installed.';

    const validRange = typeof clientSideEncryption === 'string' ? clientSideEncryption : '>=0.0.0';
    return satisfies(ClientSideEncryptionFilter.version, validRange, { includePrerelease: true })
      ? true
      : `requires mongodb-client-encryption ${validRange}, received ${ClientSideEncryptionFilter.version}`;
  }
}
