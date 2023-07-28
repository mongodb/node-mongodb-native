import { expect } from 'chai';
import * as fs from 'fs';
import * as sinon from 'sinon';

// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { AutoEncrypter } from '../../../src/client-side-encryption/autoEncrypter';
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { MongocryptdManager } from '../../../src/client-side-encryption/mongocryptdManager';
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { StateMachine } from '../../../src/client-side-encryption/stateMachine';
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { MongoClient } from '../../../src/mongo_client';
import { BSON } from '../../mongodb';
import * as requirements from './requirements.helper';

const bson = BSON;
const { EJSON } = BSON;

function readExtendedJsonToBuffer(path) {
  const ejson = EJSON.parse(fs.readFileSync(path, 'utf8'));
  return bson.serialize(ejson);
}

function readHttpResponse(path) {
  let data = fs.readFileSync(path, 'utf8');
  data = data.split('\n').join('\r\n');
  return Buffer.from(data, 'utf8');
}

const TEST_COMMAND = JSON.parse(
  fs.readFileSync(`${__dirname}/data/cmd.json`, { encoding: 'utf-8' })
);
const MOCK_COLLINFO_RESPONSE = readExtendedJsonToBuffer(`${__dirname}/data/collection-info.json`);
const MOCK_MONGOCRYPTD_RESPONSE = readExtendedJsonToBuffer(
  `${__dirname}/data/mongocryptd-reply.json`
);
const MOCK_KEYDOCUMENT_RESPONSE = readExtendedJsonToBuffer(`${__dirname}/data/key-document.json`);
const MOCK_KMS_DECRYPT_REPLY = readHttpResponse(`${__dirname}/data/kms-decrypt-reply.txt`);

class MockClient {}

const originalAccessKeyId = process.env.AWS_ACCESS_KEY_ID;
const originalSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

describe('AutoEncrypter', function () {
  this.timeout(12000);
  let ENABLE_LOG_TEST = false;
  const sandbox = sinon.createSandbox();
  beforeEach(() => {
    sandbox.restore();
    sandbox.stub(StateMachine.prototype, 'kmsRequest').callsFake(request => {
      request.addResponse(MOCK_KMS_DECRYPT_REPLY);
      return Promise.resolve();
    });

    sandbox
      .stub(StateMachine.prototype, 'fetchCollectionInfo')
      .callsFake((client, ns, filter, callback) => {
        callback(null, MOCK_COLLINFO_RESPONSE);
      });

    sandbox
      .stub(StateMachine.prototype, 'markCommand')
      .callsFake((client, ns, command, callback) => {
        if (ENABLE_LOG_TEST) {
          const response = bson.deserialize(MOCK_MONGOCRYPTD_RESPONSE);
          response.schemaRequiresEncryption = false;

          ENABLE_LOG_TEST = false; // disable test after run
          callback(null, bson.serialize(response));
          return;
        }

        callback(null, MOCK_MONGOCRYPTD_RESPONSE);
      });

    sandbox.stub(StateMachine.prototype, 'fetchKeys').callsFake((client, ns, filter, callback) => {
      // mock data is already serialized, our action deals with the result of a cursor
      const deserializedKey = bson.deserialize(MOCK_KEYDOCUMENT_RESPONSE);
      callback(null, [deserializedKey]);
    });
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('#constructor', function () {
    context('when using mongocryptd', function () {
      const client = new MockClient() as MongoClient;
      const autoEncrypterOptions = {
        mongocryptdBypassSpawn: true,
        keyVaultNamespace: 'admin.datakeys',
        options: {
          // eslint-disable-next-line @typescript-eslint/no-empty-function
          logger: () => {}
        },
        kmsProviders: {
          aws: { accessKeyId: 'example', secretAccessKey: 'example' },
          local: { key: Buffer.alloc(96) }
        }
      };
      const autoEncrypter = new AutoEncrypter(client, autoEncrypterOptions);

      it('instantiates a mongo client on the auto encrypter', function () {
        expect(autoEncrypter).to.have.property('_mongocryptdClient').to.be.instanceOf(MongoClient);
      });

      it('sets serverSelectionTimeoutMS to 10000ms', function () {
        expect(autoEncrypter).to.have.nested.property('_mongocryptdClient.s.options');
        const options = autoEncrypter._mongocryptdClient?.s.options;
        expect(options).to.have.property('serverSelectionTimeoutMS', 10000);
      });

      context('when mongocryptdURI is not specified', () => {
        it('sets the ip address family to ipv4', function () {
          expect(autoEncrypter).to.have.nested.property('_mongocryptdClient.s.options');
          const options = autoEncrypter._mongocryptdClient?.s.options;
          expect(options).to.have.property('family', 4);
        });
      });

      context('when mongocryptdURI is specified', () => {
        it('does not set the ip address family to ipv4', function () {
          const autoEncrypter = new AutoEncrypter(client, {
            ...autoEncrypterOptions,
            extraOptions: { mongocryptdURI: MongocryptdManager.DEFAULT_MONGOCRYPTD_URI }
          });

          expect(autoEncrypter).to.have.nested.property('_mongocryptdClient.s.options');
          const options = autoEncrypter._mongocryptdClient?.s.options;
          expect(options).not.to.have.property('family', 4);
        });
      });
    });
  });

  it('should support `bypassAutoEncryption`', function (done) {
    const client = new MockClient();
    const autoEncrypter = new AutoEncrypter(client, {
      bypassAutoEncryption: true,
      mongocryptdBypassSpawn: true,
      keyVaultNamespace: 'admin.datakeys',
      options: {
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        logger: () => {}
      },
      kmsProviders: {
        aws: { accessKeyId: 'example', secretAccessKey: 'example' },
        local: { key: Buffer.alloc(96) }
      }
    });

    autoEncrypter.encrypt('test.test', { test: 'command' }, (err, encrypted) => {
      expect(err).to.not.exist;
      expect(encrypted).to.eql({ test: 'command' });
      done();
    });
  });

  describe('state machine', function () {
    it('should decrypt mock data', function (done) {
      const input = readExtendedJsonToBuffer(`${__dirname}/data/encrypted-document.json`);
      const client = new MockClient() as MongoClient;
      const mc = new AutoEncrypter(client, {
        keyVaultNamespace: 'admin.datakeys',
        options: {
          // eslint-disable-next-line @typescript-eslint/no-empty-function
          logger: () => {}
        },
        kmsProviders: {
          aws: { accessKeyId: 'example', secretAccessKey: 'example' },
          local: { key: Buffer.alloc(96) }
        }
      });
      mc.decrypt(input, (err, decrypted) => {
        if (err) return done(err);
        expect(decrypted).to.eql({ filter: { find: 'test', ssn: '457-55-5462' } });
        expect(decrypted).to.not.have.property(Symbol.for('@@mdb.decryptedKeys'));
        expect(decrypted.filter).to.not.have.property(Symbol.for('@@mdb.decryptedKeys'));
        done();
      });
    });

    it('should decrypt mock data and mark decrypted items if enabled for testing', function (done) {
      const input = readExtendedJsonToBuffer(`${__dirname}/data/encrypted-document.json`);
      const nestedInput = readExtendedJsonToBuffer(
        `${__dirname}/data/encrypted-document-nested.json`
      );
      const client = new MockClient();
      const mc = new AutoEncrypter(client, {
        keyVaultNamespace: 'admin.datakeys',
        options: {
          // eslint-disable-next-line @typescript-eslint/no-empty-function
          logger: () => {}
        },
        kmsProviders: {
          aws: { accessKeyId: 'example', secretAccessKey: 'example' },
          local: { key: Buffer.alloc(96) }
        }
      });
      mc[Symbol.for('@@mdb.decorateDecryptionResult')] = true;
      mc.decrypt(input, (err, decrypted) => {
        if (err) return done(err);
        expect(decrypted).to.eql({ filter: { find: 'test', ssn: '457-55-5462' } });
        expect(decrypted).to.not.have.property(Symbol.for('@@mdb.decryptedKeys'));
        expect(decrypted.filter[Symbol.for('@@mdb.decryptedKeys')]).to.eql(['ssn']);

        // The same, but with an object containing different data types as the input
        mc.decrypt({ a: [null, 1, { c: new bson.Binary('foo', 1) }] }, (err, decrypted) => {
          if (err) return done(err);
          expect(decrypted).to.eql({ a: [null, 1, { c: new bson.Binary('foo', 1) }] });
          expect(decrypted).to.not.have.property(Symbol.for('@@mdb.decryptedKeys'));

          // The same, but with nested data inside the decrypted input
          mc.decrypt(nestedInput, (err, decrypted) => {
            if (err) return done(err);
            expect(decrypted).to.eql({ nested: { x: { y: 1234 } } });
            expect(decrypted[Symbol.for('@@mdb.decryptedKeys')]).to.eql(['nested']);
            expect(decrypted.nested).to.not.have.property(Symbol.for('@@mdb.decryptedKeys'));
            expect(decrypted.nested.x).to.not.have.property(Symbol.for('@@mdb.decryptedKeys'));
            expect(decrypted.nested.x.y).to.not.have.property(Symbol.for('@@mdb.decryptedKeys'));
            done();
          });
        });
      });
    });

    context('when the aws sdk is installed', function () {
      const accessKey = 'example';
      const secretKey = 'example';

      before(function () {
        if (!requirements.credentialProvidersInstalled.aws) {
          this.currentTest.skipReason = 'Cannot refresh credentials without sdk provider';
          this.currentTest.skip();
          return;
        }
        // After the entire suite runs, set the env back for the rest of the test run.
        process.env.AWS_ACCESS_KEY_ID = accessKey;
        process.env.AWS_SECRET_ACCESS_KEY = secretKey;
      });

      after(function () {
        // After the entire suite runs, set the env back for the rest of the test run.
        process.env.AWS_ACCESS_KEY_ID = originalAccessKeyId;
        process.env.AWS_SECRET_ACCESS_KEY = originalSecretAccessKey;
      });

      it('should decrypt mock data with KMS credentials from the environment', function (done) {
        const input = readExtendedJsonToBuffer(`${__dirname}/data/encrypted-document.json`);
        const client = new MockClient();
        const mc = new AutoEncrypter(client, {
          keyVaultNamespace: 'admin.datakeys',
          options: {
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            logger: () => {}
          },
          kmsProviders: {
            aws: {}
          }
        });
        mc.decrypt(input, (err, decrypted) => {
          if (err) return done(err);
          expect(decrypted).to.eql({ filter: { find: 'test', ssn: '457-55-5462' } });
          done();
        });
      });
    });

    context('when no refresh function is provided and no optional sdk', function () {
      const accessKey = 'example';
      const secretKey = 'example';

      before(function () {
        if (requirements.credentialProvidersInstalled.aws) {
          this.currentTest.skipReason = 'With optional sdk installed credentials would be loaded.';
          this.currentTest.skip();
          return;
        }
        // After the entire suite runs, set the env back for the rest of the test run.
        process.env.AWS_ACCESS_KEY_ID = accessKey;
        process.env.AWS_SECRET_ACCESS_KEY = secretKey;
      });

      after(function () {
        // After the entire suite runs, set the env back for the rest of the test run.
        process.env.AWS_ACCESS_KEY_ID = originalAccessKeyId;
        process.env.AWS_SECRET_ACCESS_KEY = originalSecretAccessKey;
      });

      it('errors without the optional sdk credential provider', function (done) {
        const input = readExtendedJsonToBuffer(`${__dirname}/data/encrypted-document.json`);
        const client = new MockClient();
        const mc = new AutoEncrypter(client, {
          keyVaultNamespace: 'admin.datakeys',
          options: {
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            logger: () => {}
          },
          kmsProviders: {
            aws: {}
          }
        });
        mc.decrypt(input, err => {
          expect(err.message).to.equal(
            'client not configured with KMS provider necessary to decrypt'
          );
          done();
        });
      });
    });

    it('should encrypt mock data', function (done) {
      const client = new MockClient();
      const mc = new AutoEncrypter(client, {
        keyVaultNamespace: 'admin.datakeys',
        options: {
          // eslint-disable-next-line @typescript-eslint/no-empty-function
          logger: () => {}
        },
        kmsProviders: {
          aws: { accessKeyId: 'example', secretAccessKey: 'example' },
          local: { key: Buffer.alloc(96) }
        }
      });

      mc.encrypt('test.test', TEST_COMMAND, (err, encrypted) => {
        if (err) return done(err);
        const expected = EJSON.parse(
          JSON.stringify({
            find: 'test',
            filter: {
              ssn: {
                $binary: {
                  base64:
                    'AWFhYWFhYWFhYWFhYWFhYWECRTOW9yZzNDn5dGwuqsrJQNLtgMEKaujhs9aRWRp+7Yo3JK8N8jC8P0Xjll6C1CwLsE/iP5wjOMhVv1KMMyOCSCrHorXRsb2IKPtzl2lKTqQ=',
                  subType: '6'
                }
              }
            }
          })
        );

        expect(encrypted).to.containSubset(expected);
        done();
      });
    });

    it('should encrypt mock data with per-context KMS credentials', function (done) {
      const client = new MockClient();
      const mc = new AutoEncrypter(client, {
        keyVaultNamespace: 'admin.datakeys',
        options: {
          // eslint-disable-next-line @typescript-eslint/no-empty-function
          logger: () => {}
        },
        kmsProviders: {
          aws: {}
        },
        async onKmsProviderRefresh() {
          return { aws: { accessKeyId: 'example', secretAccessKey: 'example' } };
        }
      });

      mc.encrypt('test.test', TEST_COMMAND, (err, encrypted) => {
        if (err) return done(err);
        const expected = EJSON.parse(
          JSON.stringify({
            find: 'test',
            filter: {
              ssn: {
                $binary: {
                  base64:
                    'AWFhYWFhYWFhYWFhYWFhYWECRTOW9yZzNDn5dGwuqsrJQNLtgMEKaujhs9aRWRp+7Yo3JK8N8jC8P0Xjll6C1CwLsE/iP5wjOMhVv1KMMyOCSCrHorXRsb2IKPtzl2lKTqQ=',
                  subType: '6'
                }
              }
            }
          })
        );

        expect(encrypted).to.containSubset(expected);
        done();
      });
    });
  });

  describe('logging', function () {
    it('should allow registration of a log handler', function (done) {
      ENABLE_LOG_TEST = true;

      let loggerCalled = false;
      const logger = (level, message) => {
        if (loggerCalled) return;

        loggerCalled = true;
        expect(level).to.be.oneOf([2, 3]);
        expect(message).to.not.be.empty;
      };

      const client = new MockClient();
      const mc = new AutoEncrypter(client, {
        logger,
        kmsProviders: {
          aws: { accessKeyId: 'example', secretAccessKey: 'example' },
          local: { key: Buffer.alloc(96) }
        }
      });

      mc.encrypt('test.test', TEST_COMMAND, (err, encrypted) => {
        if (err) return done(err);
        const expected = EJSON.parse(
          JSON.stringify({
            find: 'test',
            filter: {
              ssn: '457-55-5462'
            }
          })
        );

        expect(encrypted).to.containSubset(expected);
        done();
      });
    });
  });

  it('should provide the libmongocrypt version', function () {
    expect(AutoEncrypter.libmongocryptVersion).to.be.a('string');
  });
});
