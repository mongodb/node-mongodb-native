import { expect } from 'chai';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import { dirname, resolve } from 'path';
import * as sinon from 'sinon';

import {
  AutoEncrypter,
  BSON,
  type CollectionInfo,
  type DataKey,
  deserialize,
  type MongoClient,
  MongocryptdManager,
  MongoError,
  MongoNetworkTimeoutError,
  serialize,
  StateMachine
} from '../../mongodb';
import { ClientSideEncryptionFilter } from '../../tools/runner/filters/client_encryption_filter';
import { getEncryptExtraOptions } from '../../tools/utils';

const { EJSON } = BSON;
const cryptShared = (status: 'enabled' | 'disabled') => () => {
  const isCryptSharedLoaded = ClientSideEncryptionFilter.cryptShared != null;

  if (status === 'enabled') {
    return isCryptSharedLoaded ? true : 'Test requires the shared library.';
  }

  return isCryptSharedLoaded ? 'Test requires that the crypt shared library NOT be present' : true;
};

const dataPath = (fileName: string) =>
  resolve(__dirname, '../../unit/client-side-encryption/data', fileName);

function readExtendedJsonToBuffer(path) {
  const ejson = EJSON.parse(fs.readFileSync(path, 'utf8'));
  return serialize(ejson);
}

function readHttpResponse(path) {
  let data = fs.readFileSync(path, 'utf8');
  data = data.split('\n').join('\r\n');
  return Buffer.from(data, 'utf8');
}

const TEST_COMMAND = JSON.parse(fs.readFileSync(dataPath(`cmd.json`), { encoding: 'utf-8' }));
const MOCK_COLLINFO_RESPONSE = readExtendedJsonToBuffer(dataPath(`collection-info.json`));
const MOCK_MONGOCRYPTD_RESPONSE = readExtendedJsonToBuffer(dataPath(`mongocryptd-reply.json`));
const MOCK_KEYDOCUMENT_RESPONSE = readExtendedJsonToBuffer(dataPath(`key-document.json`));
const MOCK_KMS_DECRYPT_REPLY = readHttpResponse(dataPath(`kms-decrypt-reply.txt`));

describe.only('crypt_shared library', function () {
  let client: MongoClient;
  let autoEncrypter: AutoEncrypter | undefined;

  beforeEach(async function () {
    client = this.configuration.newClient();
    await client.connect();
  });

  afterEach(async () => {
    await autoEncrypter?.teardown(true);
    await client?.close();
  });
  const sandbox = sinon.createSandbox();

  beforeEach(() => {
    sandbox.restore();
    sandbox.stub(StateMachine.prototype, 'kmsRequest').callsFake(async request => {
      request.addResponse(MOCK_KMS_DECRYPT_REPLY);
    });

    sandbox
      .stub(StateMachine.prototype, 'fetchCollectionInfo')
      .callsFake(function (_client, __ns, ___filter) {
        async function* iterator() {
          yield deserialize(MOCK_COLLINFO_RESPONSE) as CollectionInfo;
        }
        return iterator();
      });

    sandbox.stub(StateMachine.prototype, 'markCommand').resolves(MOCK_MONGOCRYPTD_RESPONSE);

    sandbox
      .stub(StateMachine.prototype, 'fetchKeys')
      .resolves([deserialize(MOCK_KEYDOCUMENT_RESPONSE) as DataKey]);
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('autoSpawn', function () {
    it(
      'should autoSpawn a mongocryptd on init by default',
      { requires: { clientSideEncryption: true, predicate: cryptShared('disabled') } },

      async function () {
        autoEncrypter = new AutoEncrypter(client, {
          keyVaultNamespace: 'admin.datakeys',
          kmsProviders: {
            aws: { accessKeyId: 'example', secretAccessKey: 'example' },
            local: { key: Buffer.alloc(96) }
          }
        });

        expect(autoEncrypter).to.have.property('cryptSharedLibVersionInfo', null);

        const localMcdm = autoEncrypter._mongocryptdManager;
        sandbox.spy(localMcdm, 'spawn');

        await autoEncrypter.init();
        expect(localMcdm.spawn).to.have.been.calledOnce;
      }
    );

    it(
      'should not attempt to kick off mongocryptd on a normal error',
      { requires: { clientSideEncryption: true, predicate: cryptShared('disabled') } },
      async function () {
        let called = false;
        StateMachine.prototype.markCommand.callsFake(async (_client, _ns, _filter) => {
          if (!called) {
            called = true;
            throw new Error('msg');
          }

          return MOCK_MONGOCRYPTD_RESPONSE;
        });

        autoEncrypter = new AutoEncrypter(client, {
          keyVaultNamespace: 'admin.datakeys',
          kmsProviders: {
            aws: { accessKeyId: 'example', secretAccessKey: 'example' },
            local: { key: Buffer.alloc(96) }
          }
        });
        expect(autoEncrypter).to.have.property('cryptSharedLibVersionInfo', null);

        const localMcdm = autoEncrypter._mongocryptdManager;
        await autoEncrypter.init();

        sandbox.spy(localMcdm, 'spawn');

        const err = await autoEncrypter.encrypt('test.test', TEST_COMMAND).catch(e => e);
        expect(localMcdm.spawn).to.not.have.been.called;
        expect(err).to.be.an.instanceOf(Error);
      }
    );

    it(
      'should restore the mongocryptd and retry once if a MongoNetworkTimeoutError is experienced',
      { requires: { clientSideEncryption: true, predicate: cryptShared('disabled') } },
      async function () {
        let called = false;
        StateMachine.prototype.markCommand.callsFake(async (_client, _ns, _filter) => {
          if (!called) {
            called = true;
            throw new MongoNetworkTimeoutError('msg');
          }

          return MOCK_MONGOCRYPTD_RESPONSE;
        });

        autoEncrypter = new AutoEncrypter(client, {
          keyVaultNamespace: 'admin.datakeys',
          kmsProviders: {
            aws: { accessKeyId: 'example', secretAccessKey: 'example' },
            local: { key: Buffer.alloc(96) }
          }
        });
        expect(autoEncrypter).to.have.property('cryptSharedLibVersionInfo', null);

        const localMcdm = autoEncrypter._mongocryptdManager;
        await autoEncrypter.init();

        sandbox.spy(localMcdm, 'spawn');

        await autoEncrypter.encrypt('test.test', TEST_COMMAND);
        expect(localMcdm.spawn).to.have.been.calledOnce;
      }
    );

    it(
      'should propagate error if MongoNetworkTimeoutError is experienced twice in a row',
      { requires: { clientSideEncryption: true, predicate: cryptShared('disabled') } },
      async function () {
        let counter = 2;
        StateMachine.prototype.markCommand.callsFake(async (_client, _ns, _filter) => {
          if (counter) {
            counter -= 1;
            throw new MongoNetworkTimeoutError('msg');
          }

          return MOCK_MONGOCRYPTD_RESPONSE;
        });

        autoEncrypter = new AutoEncrypter(client, {
          keyVaultNamespace: 'admin.datakeys',
          kmsProviders: {
            aws: { accessKeyId: 'example', secretAccessKey: 'example' },
            local: { key: Buffer.alloc(96) }
          }
        });
        expect(autoEncrypter).to.have.property('cryptSharedLibVersionInfo', null);

        const localMcdm = autoEncrypter._mongocryptdManager;
        await autoEncrypter.init();

        sandbox.spy(localMcdm, 'spawn');

        const err = await autoEncrypter.encrypt('test.test', TEST_COMMAND).catch(e => e);
        expect(localMcdm.spawn).to.have.been.calledOnce;
        expect(err).to.be.an.instanceof(MongoNetworkTimeoutError);
      }
    );

    it(
      'should return a useful message if mongocryptd fails to autospawn',
      { requires: { clientSideEncryption: true, predicate: cryptShared('disabled') } },
      async function () {
        autoEncrypter = new AutoEncrypter(client, {
          keyVaultNamespace: 'admin.datakeys',
          kmsProviders: {
            aws: { accessKeyId: 'example', secretAccessKey: 'example' },
            local: { key: Buffer.alloc(96) }
          },
          extraOptions: {
            mongocryptdURI: 'mongodb://something.invalid:27020/'
          }
        });
        expect(autoEncrypter).to.have.property('cryptSharedLibVersionInfo', null);

        sandbox.stub(MongocryptdManager.prototype, 'spawn').resolves();

        const err = await autoEncrypter.init().catch(e => e);
        expect(err).to.exist;
        expect(err).to.be.instanceOf(MongoError);
      }
    );
  });

  describe('noAutoSpawn', function () {
    ['mongocryptdBypassSpawn', 'bypassAutoEncryption', 'bypassQueryAnalysis'].forEach(opt => {
      const encryptionOptions = {
        keyVaultNamespace: 'admin.datakeys',
        kmsProviders: {
          aws: { accessKeyId: 'example', secretAccessKey: 'example' },
          local: { key: Buffer.alloc(96) }
        },
        extraOptions: {
          mongocryptdBypassSpawn: opt === 'mongocryptdBypassSpawn'
        },
        bypassAutoEncryption: opt === 'bypassAutoEncryption',
        bypassQueryAnalysis: opt === 'bypassQueryAnalysis'
      };

      it(
        `should not spawn mongocryptd on startup if ${opt} is true`,
        { requires: { clientSideEncryption: true, predicate: cryptShared('disabled') } },
        async function () {
          autoEncrypter = new AutoEncrypter(client, encryptionOptions);

          const localMcdm = autoEncrypter._mongocryptdManager || {
            spawn: () => {
              // intentional empty function
            }
          };
          sandbox.spy(localMcdm, 'spawn');

          await autoEncrypter.init();
          expect(localMcdm.spawn).to.have.a.callCount(0);
        }
      );
    });

    it(
      'should not spawn a mongocryptd or retry on a server selection error if mongocryptdBypassSpawn: true',
      { requires: { clientSideEncryption: true, predicate: cryptShared('disabled') } },
      async function () {
        let called = false;
        const timeoutError = new MongoNetworkTimeoutError('msg');
        StateMachine.prototype.markCommand.callsFake(async (_client, _ns, _filter) => {
          if (!called) {
            called = true;
            throw timeoutError;
          }

          return MOCK_MONGOCRYPTD_RESPONSE;
        });

        autoEncrypter = new AutoEncrypter(client, {
          keyVaultNamespace: 'admin.datakeys',
          kmsProviders: {
            aws: { accessKeyId: 'example', secretAccessKey: 'example' },
            local: { key: Buffer.alloc(96) }
          },
          extraOptions: {
            mongocryptdBypassSpawn: true
          }
        });

        const localMcdm = autoEncrypter._mongocryptdManager;
        sandbox.spy(localMcdm, 'spawn');

        await autoEncrypter.init();
        expect(localMcdm.spawn).to.not.have.been.called;

        const err = await autoEncrypter.encrypt('test.test', TEST_COMMAND).catch(e => e);
        expect(localMcdm.spawn).to.not.have.been.called;
        expect(err).to.equal(timeoutError);
      }
    );
  });

  describe('crypt shared library', () => {
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
          predicate: cryptShared('enabled')
        }
      },
      async function () {
        const env = {
          MONGODB_URI: this.configuration.url(),
          EXTRA_OPTIONS: JSON.stringify({
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            cryptSharedLibPath: getEncryptExtraOptions().cryptSharedLibPath!
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
          predicate: cryptShared('enabled')
        }
      },
      async function () {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const cryptDir = dirname(getEncryptExtraOptions().cryptSharedLibPath!);
        const env = {
          MONGODB_URI: this.configuration.url(),
          EXTRA_OPTIONS: JSON.stringify({
            cryptSharedLibSearchPaths: [cryptDir]
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
});
