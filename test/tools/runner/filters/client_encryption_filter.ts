import { readFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import * as process from 'process';
import { satisfies } from 'semver';

import { kmsCredentialsPresent } from '../../../csfle-kms-providers';
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
  enabled: boolean = false;
  version: string | null = null;
  libmongocrypt: string | null = null;

  override async initializeFilter(client: MongoClient, context: Record<string, any>) {
    let mongodbClientEncryption: typeof import('mongodb-client-encryption');
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      mongodbClientEncryption = require('mongodb-client-encryption');
      this.libmongocrypt = (
        mongodbClientEncryption as typeof import('mongodb-client-encryption')
      ).MongoCrypt.libmongocryptVersion;
    } catch (failedToGetFLELib) {
      if (process.env.TEST_CSFLE) {
        console.error({ failedToGetFLELib });
      }
    }

    if (!this.version) {
      this.version = JSON.parse(
        await readFile(
          resolve(dirname(require.resolve('mongodb-client-encryption')), '..', 'package.json'),
          'utf8'
        )
      ).version;
    }

    this.enabled = !!(kmsCredentialsPresent && mongodbClientEncryption);

    // Adds these fields onto the context so that they can be reused by tests
    context.clientSideEncryption = {
      enabled: this.enabled,
      mongodbClientEncryption,
      version: this.version,
      libmongocrypt: this.libmongocrypt
    };
  }

  filter(test: { metadata?: MongoDBMetadataUI }): boolean | string {
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
      if (this.version == null) {
        throw new Error('FLE tests must run, but mongodb client encryption was not installed.');
      }
    }

    if (!kmsCredentialsPresent) return 'Test requires FLE kms credentials';
    if (this.version == null) return 'Test requires mongodb-client-encryption to be installed.';

    const validRange = typeof clientSideEncryption === 'string' ? clientSideEncryption : '>=0.0.0';
    return satisfies(this.version, validRange, { includePrerelease: true })
      ? true
      : `requires mongodb-client-encryption ${validRange}, received ${this.version}`;
  }
}
