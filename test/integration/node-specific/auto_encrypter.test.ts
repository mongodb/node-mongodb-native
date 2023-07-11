import { expect } from 'chai';
import { existsSync } from 'fs';
import * as path from 'path';

import { AutoEncrypter } from '../../../src/client-side-encryption/autoEncrypter';
import { type MongoClient } from '../../mongodb';
import { getEncryptExtraOptions } from '../../tools/utils';

const sharedLibrarySuffix =
  process.platform === 'win32' ? 'dll' : process.platform === 'darwin' ? 'dylib' : 'so';

let sharedLibraryStub = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  `mongo_crypt_v1.${sharedLibrarySuffix}`
);
if (!existsSync(sharedLibraryStub)) {
  sharedLibraryStub = path.resolve(
    __dirname,
    '..',
    'deps',
    'tmp',
    'libmongocrypt-build',
    ...(process.platform === 'win32' ? ['RelWithDebInfo'] : []),
    `mongo_crypt_v1.${sharedLibrarySuffix}`
  );
}

const cryptSharedPredicate = () => {
  if (typeof getEncryptExtraOptions().cryptSharedLibPath !== 'string') {
    return 'Test requires the shared library.';
  }
  return true;
};

describe('crypt_shared library', function () {
  let client: MongoClient;
  let autoEncrypter: AutoEncrypter | undefined;
  beforeEach(async function () {
    client = this.configuration.newClient();
    await client.connect();
  });
  afterEach(async () => {
    if (autoEncrypter != null) {
      await new Promise<void>(resolve => {
        if (autoEncrypter) {
          autoEncrypter.teardown(true, resolve);
        } else {
          resolve();
        }
      });
      autoEncrypter = undefined;
    }
    await client?.close();
  });
  it('should fail if no library can be found in the search path and cryptSharedLibRequired is set', async function () {
    // NB: This test has to be run before the tests/without having previously
    // loaded a CSFLE shared library below to get the right error path.
    try {
      new AutoEncrypter(client, {
        keyVaultNamespace: 'admin.datakeys',
        logger: () => {},
        kmsProviders: {
          aws: { accessKeyId: 'example', secretAccessKey: 'example' },
          local: { key: Buffer.alloc(96) }
        },
        extraOptions: {
          cryptSharedLibSearchPaths: ['/nonexistent'],
          cryptSharedLibRequired: true
        }
      });
      expect.fail('missed exception');
    } catch (err) {
      expect(err.message).to.include(
        '`cryptSharedLibRequired` set but no crypt_shared library loaded'
      );
    }
  });

  it(
    'should load a shared library by specifying its path',
    {
      requires: {
        predicate: cryptSharedPredicate
      }
    },
    async function () {
      const cryptSharedLibPath = `${
        getEncryptExtraOptions().cryptSharedLibPath
      }/${`mongo_crypt_v1.${sharedLibrarySuffix}`}`;
      autoEncrypter = new AutoEncrypter(client, {
        keyVaultNamespace: 'admin.datakeys',
        logger: () => {},
        kmsProviders: {
          aws: { accessKeyId: 'example', secretAccessKey: 'example' },
          local: { key: Buffer.alloc(96) }
        },
        extraOptions: {
          cryptSharedLibPath
        }
      });

      expect(autoEncrypter).to.not.have.property('_mongocryptdManager');
      expect(autoEncrypter).to.not.have.property('_mongocryptdClient');
      expect(autoEncrypter).to.have.property('cryptSharedLibVersionInfo').that.is.not.null;

      const cryptSharedLibVersion = autoEncrypter.cryptSharedLibVersionInfo;

      expect(cryptSharedLibVersion).not.to.be.null;
      expect(cryptSharedLibVersion).to.have.property('version').that.is.a('bigint');
      expect(cryptSharedLibVersion).to.have.property('versionStr').that.is.a('string');
    }
  );

  it(
    'should load a shared library by specifying a search path',
    {
      requires: {
        predicate: cryptSharedPredicate
      }
    },
    async function () {
      autoEncrypter = new AutoEncrypter(client, {
        keyVaultNamespace: 'admin.datakeys',
        logger: () => {},
        kmsProviders: {
          aws: { accessKeyId: 'example', secretAccessKey: 'example' },
          local: { key: Buffer.alloc(96) }
        },
        extraOptions: {
          // This test only runs when cryptSharedLibPath is undefined.
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          cryptSharedLibSearchPaths: [getEncryptExtraOptions().cryptSharedLibPath!]
        }
      });

      expect(autoEncrypter._mongocryptdManager).to.be.undefined;
      expect(autoEncrypter._mongocryptdClient).to.be.undefined;

      const cryptSharedLibVersion = autoEncrypter.cryptSharedLibVersionInfo;
      expect(cryptSharedLibVersion).not.to.be.null;

      expect(cryptSharedLibVersion).to.have.property('version').that.is.a('bigint');
      expect(cryptSharedLibVersion).to.have.property('versionStr').that.is.a('string');
    }
  );
});
