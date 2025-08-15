import { satisfies } from 'semver';

import { ClientSideEncryptionFilter } from './client_encryption_filter';

/**
 * Filter for whether or not a test requires a specific libmongocrypt version.
 *
 * @example
 * ```js
 * metadata: {
 *   requires: {
 *     libmongocrypt_version: '>=1.8.0 <2.0.0'
 *   }
 * }
 * ```
 *
 * - If `libmongocrypt_version` is specified, the test will only run if the detected libmongocrypt version satisfies the semver range.
 * - If not specified, the test will always run.
 */
export class LibmongocryptVersionFilter extends ClientSideEncryptionFilter {
  override filter(test: { metadata?: MongoDBMetadataUI }): boolean | string {
    const requiredVersion = test.metadata?.requires?.libmongocrypt;

    if (requiredVersion == null) {
      return true;
    }

    if (!this.libmongocrypt) {
      return 'Test requires libmongocrypt to be installed.';
    }

    if (satisfies(this.libmongocrypt, requiredVersion, { includePrerelease: true })) {
      return true;
    }
    return `requires libmongocrypt version ${requiredVersion}, detected ${this.libmongocrypt}`;
  }
}
