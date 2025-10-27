import { type AutoEncrypter, MongoClient } from '../../../../src';
import { getEncryptExtraOptions } from '../../utils';
import { Filter } from './filter';

function getCryptSharedVersion(): AutoEncrypter['cryptSharedLibVersionInfo'] | null {
  try {
    const mc = new MongoClient('mongodb://localhost:27017', {
      autoEncryption: {
        kmsProviders: {
          local: {
            key: Buffer.alloc(96)
          }
        },
        extraOptions: getEncryptExtraOptions()
      }
    });
    return mc.autoEncrypter.cryptSharedLibVersionInfo;
  } catch {
    try {
      const mc = new MongoClient('mongodb://localhost:27017', {
        autoEncryption: {
          kmsProviders: {
            local: {
              key: Buffer.alloc(96)
            }
          }
        }
      });
      return mc.autoEncrypter.cryptSharedLibVersionInfo;
    } catch {
      // squash errors
    }
  }

  return null;
}

/**
 * Filter for whether or not a test needs or does not need the crypt_shared FLE shared library.
 *
 * @example
 * ```js
 * metadata: {
 *   requires: {
 *     crypt_shared: 'enabled' | 'disabled'
 *   }
 * }
 * ```
 *
 * - If `crypt_shared: 'enabled'`, the test will only run if crypt_shared is present.
 * - If `crypt_shared: 'disabled'`, the test will only run if crypt_shared is not present.
 * - If not specified, the test will always run.
 */
export class CryptSharedFilter extends Filter {
  cryptShared: AutoEncrypter['cryptSharedLibVersionInfo'] | null = getCryptSharedVersion();

  override async initializeFilter(
    _client: MongoClient,
    context: Record<string, any>
  ): Promise<void> {
    context.cryptSharedVersion = this.cryptShared;
  }

  filter(test: { metadata?: MongoDBMetadataUI }): boolean | string {
    const cryptSharedRequirement = test.metadata?.requires?.crypt_shared;

    if (cryptSharedRequirement == null) {
      return true;
    }

    const cryptSharedPresent = Boolean(this.cryptShared);

    if (cryptSharedRequirement === 'enabled') {
      return cryptSharedPresent || 'Test requires crypt_shared to be present.';
    }
    if (cryptSharedRequirement === 'disabled') {
      return !cryptSharedPresent || 'Test requires crypt_shared to be absent.';
    }

    throw new Error(
      "cryptShared filter only supports requires.cryptShared: 'enabled' | 'disabled'"
    );
  }
}
