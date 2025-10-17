import { expect } from 'chai';
import * as sinon from 'sinon';

import {
  ClientEncryption,
  type KMSProviders,
  type MongoClient,
  MongoNetworkTimeoutError,
  MongoRuntimeError,
  type UUID
} from '../../../src';
import { StateMachine } from '../../../src/client-side-encryption/state_machine';

describe('mongocryptd auto spawn', function () {
  let client: MongoClient;
  const kmsProviders: KMSProviders = {
    local: { key: Buffer.alloc(96) }
  };
  let dataKey: UUID;

  const keyVaultNamespace = 'data.keys';

  beforeEach('create data key', async function () {
    const utilClient = this.configuration.newClient();
    const clientEncryption = new ClientEncryption(utilClient, {
      kmsProviders,
      keyVaultNamespace
    });
    dataKey = await clientEncryption.createDataKey('local');
    await utilClient.close();
  });

  beforeEach(async function () {
    client = this.configuration.newClient(
      {},
      {
        retryReads: false,
        autoEncryption: {
          keyVaultNamespace,
          kmsProviders,
          schemaMap: {
            'namespace.collection': {
              bsonType: 'object',
              properties: {
                ssn: {
                  encrypt: {
                    keyId: dataKey,
                    bsonType: 'string',
                    algorithm: 'AEAD_AES_256_CBC_HMAC_SHA_512-Random'
                  }
                }
              }
            }
          }
        }
      }
    );
  });

  afterEach(async () => {
    await client?.close();
    sinon.restore();
  });

  it(
    'should autoSpawn a mongocryptd on init by default',
    { requires: { clientSideEncryption: true, crypt_shared: 'disabled' } },
    async function () {
      const autoEncrypter = client.autoEncrypter;
      const mongocryptdManager = autoEncrypter._mongocryptdManager;

      const spy = sinon.spy(mongocryptdManager, 'spawn');

      await client.connect();

      expect(spy).to.have.been.calledOnce;
    }
  );

  it(
    'should not attempt to kick off mongocryptd on a non-network error from mongocrpytd',
    { requires: { clientSideEncryption: true, crypt_shared: 'disabled' } },
    async function () {
      let called = false;
      sinon
        .stub(StateMachine.prototype, 'markCommand')
        .callsFake(async function (client, ns, filter) {
          if (!called) {
            called = true;
            throw new Error('non-network error');
          }

          return this.wrappedMethod.apply(client, ns, filter);
        });

      const autoEncrypter = client.autoEncrypter;
      await client.connect();

      const mongocryptdManager = autoEncrypter._mongocryptdManager;
      const spy = sinon.spy(mongocryptdManager, 'spawn');

      const error = await client
        .db('namespace')
        .collection('collection')
        .find()
        .toArray()
        .catch(e => e);
      expect(spy).to.not.have.been.called;
      expect(error).to.be.an.instanceOf(Error);
      expect(error).to.match(/non-network error/);
    }
  );

  it(
    'should respawn the mongocryptd after a MongoNetworkTimeoutError is returned when communicating with mongocryptd',
    { requires: { clientSideEncryption: true, crypt_shared: 'disabled' } },
    async function () {
      let called = false;
      sinon
        .stub(StateMachine.prototype, 'markCommand')
        .callsFake(async function (client, ns, filter) {
          if (!called) {
            called = true;
            throw new MongoNetworkTimeoutError('non-network error');
          }

          return this.wrappedMethod.apply(client, ns, filter);
        });

      const autoEncrypter = client.autoEncrypter;
      const mongocryptdManager = autoEncrypter._mongocryptdManager;

      await client.connect();

      const spy = sinon.spy(mongocryptdManager, 'spawn');

      await client
        .db('namespace')
        .collection('collection')
        .find()
        .toArray()
        .catch(e => e);

      expect(spy).to.have.been.calledOnce;
    }
  );

  it(
    'should propagate error if MongoNetworkTimeoutError is experienced twice in a row',
    { requires: { clientSideEncryption: true, crypt_shared: 'disabled' } },
    async function () {
      const stub = sinon
        .stub(StateMachine.prototype, 'markCommand')
        .callsFake(async (_client, _ns, _filter) => {
          throw new MongoNetworkTimeoutError('msg');
        });

      const autoEncrypter = client.autoEncrypter;
      const mongocryptdManager = autoEncrypter._mongocryptdManager;
      await client.connect();

      const spy = sinon.spy(mongocryptdManager, 'spawn');

      const error = await client
        .db('namespace')
        .collection('collection')
        .find()
        .toArray()
        .then(() => null)
        .catch(e => e);

      expect(spy).to.have.been.calledOnce;
      expect(stub).to.have.been.calledTwice;
      expect(error).to.be.an.instanceof(MongoNetworkTimeoutError);
      expect(error).to.match(/msg/);
    }
  );

  describe('when the client fails to connect to mongocryptd', function () {
    let client: MongoClient;
    this.afterEach(() => client?.close());

    it(
      'should return a useful message if mongocryptd fails to autospawn',
      { requires: { clientSideEncryption: true, crypt_shared: 'disabled' } },
      async function () {
        client = this.configuration.newClient(
          {},
          {
            autoEncryption: {
              keyVaultNamespace,
              kmsProviders,
              extraOptions: {
                // wrong URI
                mongocryptdURI: 'mongodb://localhost:27019'
              },
              schemaMap: {
                'namespace.collection': {
                  bsonType: 'object',
                  properties: {
                    ssn: {
                      encrypt: {
                        keyId: dataKey,
                        bsonType: 'string',
                        algorithm: 'AEAD_AES_256_CBC_HMAC_SHA_512-Random'
                      }
                    }
                  }
                }
              }
            }
          }
        );

        const err = await client.connect().catch(e => e);
        expect(err).to.be.instanceOf(MongoRuntimeError);
        expect(err).to.match(
          /Unable to connect to `mongocryptd`, please make sure it is running or in your PATH for auto-spawn/
        );
      }
    );
  });
});
