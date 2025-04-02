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

const { EJSON } = BSON;
export const cryptShared = (status: 'enabled' | 'disabled') => () => {
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

describe.only('mongocryptd auto spawn', function () {
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
