/* eslint-disable @typescript-eslint/no-restricted-imports */
import { EJSON } from 'bson';
import { expect } from 'chai';
import { spawnSync } from 'child_process';
import { promisify } from 'util';

import { type AutoEncrypter } from '../../../src/client-side-encryption/autoEncrypter';
import { type MongoClient } from '../../mongodb';
import { getEncryptExtraOptions } from '../../tools/utils';

const sharedLibrarySuffix =
  process.platform === 'win32' ? 'dll' : process.platform === 'darwin' ? 'dylib' : 'so';

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
    await promisify(cb =>
      autoEncrypter ? autoEncrypter.teardown(true, cb) : cb(undefined, undefined)
    )();
    await client?.close();
  });
  it('should fail if no library can be found in the search path and cryptSharedLibRequired is set', async function () {
    const env = {
      MONGODB_URI: this.configuration.url(),
      EXTRA_OPTIONS: JSON.stringify({
        cryptSharedLibSearchPaths: ['/nonexistent'],
        cryptSharedLibRequired: true
      })
    };
    const file = `${__dirname}/../../tools/fixtures/shared_library_test.js`;
    const { stderr } = spawnSync(process.execPath, [file], {
      env,
      encoding: 'utf-8'
    });

    expect(stderr).to.include('`cryptSharedLibRequired` set but no crypt_shared library loaded');
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
      const env = {
        MONGODB_URI: this.configuration.url(),
        EXTRA_OPTIONS: JSON.stringify({
          cryptSharedLibPath
        })
      };
      const file = `${__dirname}/../../tools/fixtures/shared_library_test.js`;
      const { stdout } = spawnSync(process.execPath, [file], { env, encoding: 'utf-8' });

      const response = EJSON.parse(stdout, { useBigInt64: true });

      expect(response).not.to.be.null;

      expect(response).to.have.property('version').that.is.a('bigint');
      expect(response).to.have.property('versionStr').that.is.a('string');
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
      const env = {
        MONGODB_URI: this.configuration.url(),
        EXTRA_OPTIONS: JSON.stringify({
          // This test only runs when cryptSharedLibPath is undefined.
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          cryptSharedLibSearchPaths: [getEncryptExtraOptions().cryptSharedLibPath!]
        })
      };
      const file = `${__dirname}/../../tools/fixtures/shared_library_test.js`;
      const { stdout } = spawnSync(process.execPath, [file], { env, encoding: 'utf-8' });

      const response = EJSON.parse(stdout, { useBigInt64: true });

      expect(response).not.to.be.null;

      expect(response).to.have.property('version').that.is.a('bigint');
      expect(response).to.have.property('versionStr').that.is.a('string');
    }
  );
});
