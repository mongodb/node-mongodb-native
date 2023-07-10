'use strict';

const fs = require('fs');
const path = require('path');
const sinon = require('sinon');
const mongodb = require('mongodb');
const BSON = mongodb.BSON;
const EJSON = BSON.EJSON;
const requirements = require('./requirements.helper');
const MongoNetworkTimeoutError = mongodb.MongoNetworkTimeoutError || mongodb.MongoTimeoutError;
const MongoError = mongodb.MongoError;
const stateMachine = require('../lib/stateMachine')({ mongodb });
const StateMachine = stateMachine.StateMachine;
const MongocryptdManager = require('../lib/mongocryptdManager').MongocryptdManager;

const { expect } = require('chai');

const sharedLibrarySuffix =
  process.platform === 'win32' ? 'dll' : process.platform === 'darwin' ? 'dylib' : 'so';
let sharedLibraryStub = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  `mongo_crypt_v1.${sharedLibrarySuffix}`
);
if (!fs.existsSync(sharedLibraryStub)) {
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

function readExtendedJsonToBuffer(path) {
  const ejson = EJSON.parse(fs.readFileSync(path, 'utf8'));
  return BSON.serialize(ejson);
}

function readHttpResponse(path) {
  let data = fs.readFileSync(path, 'utf8');
  data = data.split('\n').join('\r\n');
  return Buffer.from(data, 'utf8');
}

const TEST_COMMAND = JSON.parse(fs.readFileSync(`${__dirname}/data/cmd.json`));
const MOCK_COLLINFO_RESPONSE = readExtendedJsonToBuffer(`${__dirname}/data/collection-info.json`);
const MOCK_MONGOCRYPTD_RESPONSE = readExtendedJsonToBuffer(
  `${__dirname}/data/mongocryptd-reply.json`
);
const MOCK_KEYDOCUMENT_RESPONSE = readExtendedJsonToBuffer(`${__dirname}/data/key-document.json`);
const MOCK_KMS_DECRYPT_REPLY = readHttpResponse(`${__dirname}/data/kms-decrypt-reply.txt`);

class MockClient {
  constructor() {
    this.topology = {
      bson: BSON
    };
  }
}

const originalAccessKeyId = process.env.AWS_ACCESS_KEY_ID;
const originalSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

const AutoEncrypter = require('../lib/autoEncrypter')({ mongodb, stateMachine }).AutoEncrypter;
describe('AutoEncrypter', function () {
  this.timeout(12000);
  let ENABLE_LOG_TEST = false;
  let sandbox = sinon.createSandbox();
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
          const response = BSON.deserialize(MOCK_MONGOCRYPTD_RESPONSE);
          response.schemaRequiresEncryption = false;

          ENABLE_LOG_TEST = false; // disable test after run
          callback(null, BSON.serialize(response));
          return;
        }

        callback(null, MOCK_MONGOCRYPTD_RESPONSE);
      });

    sandbox.stub(StateMachine.prototype, 'fetchKeys').callsFake((client, ns, filter, callback) => {
      // mock data is already serialized, our action deals with the result of a cursor
      const deserializedKey = BSON.deserialize(MOCK_KEYDOCUMENT_RESPONSE);
      callback(null, [deserializedKey]);
    });
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('#constructor', function () {
    context('when mongodb exports BSON (driver >= 4.9.0)', function () {
      context('when a bson option is provided', function () {
        const bson = Object.assign({}, BSON);
        const encrypter = new AutoEncrypter(
          {},
          {
            bson: bson,
            kmsProviders: {
              local: { key: Buffer.alloc(96) }
            }
          }
        );

        it('uses the bson option', function () {
          expect(encrypter._bson).to.equal(bson);
        });
      });

      context('when a bson option is not provided', function () {
        const encrypter = new AutoEncrypter(
          {},
          {
            kmsProviders: {
              local: { key: Buffer.alloc(96) }
            }
          }
        );

        it('uses the mongodb exported BSON', function () {
          expect(encrypter._bson).to.equal(BSON);
        });
      });

      it('never uses bson from the topology', function () {
        expect(() => {
          new AutoEncrypter(
            {},
            {
              kmsProviders: {
                local: { key: Buffer.alloc(96) }
              }
            }
          );
        }).not.to.throw();
      });
    });

    context('when mongodb does not export BSON (driver < 4.9.0)', function () {
      context('when a bson option is provided', function () {
        const bson = Object.assign({}, BSON);
        const encrypter = new AutoEncrypter(
          {},
          {
            bson: bson,
            kmsProviders: {
              local: { key: Buffer.alloc(96) }
            }
          }
        );

        it('uses the bson option', function () {
          expect(encrypter._bson).to.equal(bson);
        });
      });

      context('when a bson option is not provided', function () {
        const mongoNoBson = { ...mongodb, BSON: undefined };
        const AutoEncrypterNoBson = require('../lib/autoEncrypter')({
          mongodb: mongoNoBson,
          stateMachine
        }).AutoEncrypter;

        context('when the client has a topology', function () {
          const client = new MockClient();
          const encrypter = new AutoEncrypterNoBson(client, {
            kmsProviders: {
              local: { key: Buffer.alloc(96) }
            }
          });

          it('uses the bson on the topology', function () {
            expect(encrypter._bson).to.equal(client.topology.bson);
          });
        });

        context('when the client does not have a topology', function () {
          it('raises an error', function () {
            expect(() => {
              new AutoEncrypterNoBson({}, {});
            }).to.throw(/bson/);
          });
        });
      });
    });

    context('when using mongocryptd', function () {
      const client = new MockClient();
      const autoEncrypterOptions = {
        mongocryptdBypassSpawn: true,
        keyVaultNamespace: 'admin.datakeys',
        logger: () => {},
        kmsProviders: {
          aws: { accessKeyId: 'example', secretAccessKey: 'example' },
          local: { key: Buffer.alloc(96) }
        }
      };
      const autoEncrypter = new AutoEncrypter(client, autoEncrypterOptions);

      it('instantiates a mongo client on the auto encrypter', function () {
        expect(autoEncrypter)
          .to.have.property('_mongocryptdClient')
          .to.be.instanceOf(mongodb.MongoClient);
      });

      it('sets the 3x legacy client options on the mongo client', function () {
        expect(autoEncrypter).to.have.nested.property('_mongocryptdClient.s.options');
        const options = autoEncrypter._mongocryptdClient.s.options;
        expect(options).to.have.property('useUnifiedTopology', true);
        expect(options).to.have.property('useNewUrlParser', true);
      });

      it('sets serverSelectionTimeoutMS to 10000ms', function () {
        expect(autoEncrypter).to.have.nested.property('_mongocryptdClient.s.options');
        const options = autoEncrypter._mongocryptdClient.s.options;
        expect(options).to.have.property('serverSelectionTimeoutMS', 10000);
      });

      context('when mongocryptdURI is not specified', () => {
        it('sets the ip address family to ipv4', function () {
          expect(autoEncrypter).to.have.nested.property('_mongocryptdClient.s.options');
          const options = autoEncrypter._mongocryptdClient.s.options;
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
          const options = autoEncrypter._mongocryptdClient.s.options;
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
      logger: () => {},
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
      const client = new MockClient();
      const mc = new AutoEncrypter(client, {
        keyVaultNamespace: 'admin.datakeys',
        logger: () => {},
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
        logger: () => {},
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
        mc.decrypt({ a: [null, 1, { c: new BSON.Binary('foo', 1) }] }, (err, decrypted) => {
          if (err) return done(err);
          expect(decrypted).to.eql({ a: [null, 1, { c: new BSON.Binary('foo', 1) }] });
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

    it('should decrypt mock data with per-context KMS credentials', function (done) {
      const input = readExtendedJsonToBuffer(`${__dirname}/data/encrypted-document.json`);
      const client = new MockClient();
      const mc = new AutoEncrypter(client, {
        keyVaultNamespace: 'admin.datakeys',
        logger: () => {},
        kmsProviders: {
          aws: {}
        },
        async onKmsProviderRefresh() {
          return { aws: { accessKeyId: 'example', secretAccessKey: 'example' } };
        }
      });
      mc.decrypt(input, (err, decrypted) => {
        if (err) return done(err);
        expect(decrypted).to.eql({ filter: { find: 'test', ssn: '457-55-5462' } });
        done();
      });
    });

    context('when no refresh function is provided', function () {
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
          logger: () => {},
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
          logger: () => {},
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
        logger: () => {},
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
        logger: () => {},
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

    // TODO(NODE-4089): Enable test once https://github.com/mongodb/libmongocrypt/pull/263 is done
    it.skip('should encrypt mock data when using the crypt_shared library', function (done) {
      const client = new MockClient();
      const mc = new AutoEncrypter(client, {
        keyVaultNamespace: 'admin.datakeys',
        logger: () => {},
        kmsProviders: {
          aws: {}
        },
        async onKmsProviderRefresh() {
          return { aws: { accessKeyId: 'example', secretAccessKey: 'example' } };
        },
        extraOptions: {
          cryptSharedLibPath: sharedLibraryStub
        }
      });

      expect(mc).to.not.have.property('_mongocryptdManager');
      expect(mc).to.not.have.property('_mongocryptdClient');

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

  describe('autoSpawn', function () {
    beforeEach(function () {
      if (requirements.SKIP_LIVE_TESTS) {
        this.currentTest.skipReason = `requirements.SKIP_LIVE_TESTS=${requirements.SKIP_LIVE_TESTS}`;
        this.currentTest.skip();
        return;
      }
    });
    afterEach(function (done) {
      if (this.mc) {
        this.mc.teardown(false, err => {
          this.mc = undefined;
          done(err);
        });
      } else {
        done();
      }
    });

    it('should autoSpawn a mongocryptd on init by default', function (done) {
      const client = new MockClient();
      this.mc = new AutoEncrypter(client, {
        keyVaultNamespace: 'admin.datakeys',
        logger: () => {},
        kmsProviders: {
          aws: { accessKeyId: 'example', secretAccessKey: 'example' },
          local: { key: Buffer.alloc(96) }
        }
      });

      expect(this.mc).to.have.property('cryptSharedLibVersionInfo', null);

      const localMcdm = this.mc._mongocryptdManager;
      sandbox.spy(localMcdm, 'spawn');

      this.mc.init(err => {
        if (err) return done(err);
        expect(localMcdm.spawn).to.have.been.calledOnce;
        done();
      });
    });

    it('should not attempt to kick off mongocryptd on a normal error', function (done) {
      let called = false;
      StateMachine.prototype.markCommand.callsFake((client, ns, filter, callback) => {
        if (!called) {
          called = true;
          callback(new Error('msg'));
          return;
        }

        callback(null, MOCK_MONGOCRYPTD_RESPONSE);
      });

      const client = new MockClient();
      this.mc = new AutoEncrypter(client, {
        keyVaultNamespace: 'admin.datakeys',
        logger: () => {},
        kmsProviders: {
          aws: { accessKeyId: 'example', secretAccessKey: 'example' },
          local: { key: Buffer.alloc(96) }
        }
      });
      expect(this.mc).to.have.property('cryptSharedLibVersionInfo', null);

      const localMcdm = this.mc._mongocryptdManager;
      this.mc.init(err => {
        if (err) return done(err);

        sandbox.spy(localMcdm, 'spawn');

        this.mc.encrypt('test.test', TEST_COMMAND, err => {
          expect(localMcdm.spawn).to.not.have.been.called;
          expect(err).to.be.an.instanceOf(Error);
          done();
        });
      });
    });

    it('should restore the mongocryptd and retry once if a MongoNetworkTimeoutError is experienced', function (done) {
      let called = false;
      StateMachine.prototype.markCommand.callsFake((client, ns, filter, callback) => {
        if (!called) {
          called = true;
          callback(new MongoNetworkTimeoutError('msg'));
          return;
        }

        callback(null, MOCK_MONGOCRYPTD_RESPONSE);
      });

      const client = new MockClient();
      this.mc = new AutoEncrypter(client, {
        keyVaultNamespace: 'admin.datakeys',
        logger: () => {},
        kmsProviders: {
          aws: { accessKeyId: 'example', secretAccessKey: 'example' },
          local: { key: Buffer.alloc(96) }
        }
      });
      expect(this.mc).to.have.property('cryptSharedLibVersionInfo', null);

      const localMcdm = this.mc._mongocryptdManager;
      this.mc.init(err => {
        if (err) return done(err);

        sandbox.spy(localMcdm, 'spawn');

        this.mc.encrypt('test.test', TEST_COMMAND, err => {
          expect(localMcdm.spawn).to.have.been.calledOnce;
          expect(err).to.not.exist;
          done();
        });
      });
    });

    it('should propagate error if MongoNetworkTimeoutError is experienced twice in a row', function (done) {
      let counter = 2;
      StateMachine.prototype.markCommand.callsFake((client, ns, filter, callback) => {
        if (counter) {
          counter -= 1;
          callback(new MongoNetworkTimeoutError('msg'));
          return;
        }

        callback(null, MOCK_MONGOCRYPTD_RESPONSE);
      });

      const client = new MockClient();
      this.mc = new AutoEncrypter(client, {
        keyVaultNamespace: 'admin.datakeys',
        logger: () => {},
        kmsProviders: {
          aws: { accessKeyId: 'example', secretAccessKey: 'example' },
          local: { key: Buffer.alloc(96) }
        }
      });
      expect(this.mc).to.have.property('cryptSharedLibVersionInfo', null);

      const localMcdm = this.mc._mongocryptdManager;
      this.mc.init(err => {
        if (err) return done(err);

        sandbox.spy(localMcdm, 'spawn');

        this.mc.encrypt('test.test', TEST_COMMAND, err => {
          expect(localMcdm.spawn).to.have.been.calledOnce;
          expect(err).to.be.an.instanceof(MongoNetworkTimeoutError);
          done();
        });
      });
    });

    it('should return a useful message if mongocryptd fails to autospawn', function (done) {
      const client = new MockClient();
      this.mc = new AutoEncrypter(client, {
        keyVaultNamespace: 'admin.datakeys',
        logger: () => {},
        kmsProviders: {
          aws: { accessKeyId: 'example', secretAccessKey: 'example' },
          local: { key: Buffer.alloc(96) }
        },
        extraOptions: {
          mongocryptdURI: 'mongodb://something.invalid:27020/'
        }
      });
      expect(this.mc).to.have.property('cryptSharedLibVersionInfo', null);

      sandbox.stub(MongocryptdManager.prototype, 'spawn').callsFake(callback => {
        callback();
      });

      this.mc.init(err => {
        expect(err).to.exist;
        expect(err).to.be.instanceOf(MongoError);
        done();
      });
    });
  });

  describe('noAutoSpawn', function () {
    beforeEach('start MongocryptdManager', function (done) {
      if (requirements.SKIP_LIVE_TESTS) {
        this.currentTest.skipReason = `requirements.SKIP_LIVE_TESTS=${requirements.SKIP_LIVE_TESTS}`;
        this.skip();
      }

      this.mcdm = new MongocryptdManager({});
      this.mcdm.spawn(done);
    });

    afterEach(function (done) {
      if (this.mc) {
        this.mc.teardown(false, err => {
          this.mc = undefined;
          done(err);
        });
      } else {
        done();
      }
    });

    ['mongocryptdBypassSpawn', 'bypassAutoEncryption', 'bypassQueryAnalysis'].forEach(opt => {
      const encryptionOptions = {
        keyVaultNamespace: 'admin.datakeys',
        logger: () => {},
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

      it(`should not spawn mongocryptd on startup if ${opt} is true`, function (done) {
        const client = new MockClient();
        this.mc = new AutoEncrypter(client, encryptionOptions);

        const localMcdm = this.mc._mongocryptdManager || { spawn: () => {} };
        sandbox.spy(localMcdm, 'spawn');

        this.mc.init(err => {
          expect(err).to.not.exist;
          expect(localMcdm.spawn).to.have.a.callCount(0);
          done();
        });
      });
    });

    it('should not spawn a mongocryptd or retry on a server selection error if mongocryptdBypassSpawn: true', function (done) {
      let called = false;
      const timeoutError = new MongoNetworkTimeoutError('msg');
      StateMachine.prototype.markCommand.callsFake((client, ns, filter, callback) => {
        if (!called) {
          called = true;
          callback(timeoutError);
          return;
        }

        callback(null, MOCK_MONGOCRYPTD_RESPONSE);
      });

      const client = new MockClient();
      this.mc = new AutoEncrypter(client, {
        keyVaultNamespace: 'admin.datakeys',
        logger: () => {},
        kmsProviders: {
          aws: { accessKeyId: 'example', secretAccessKey: 'example' },
          local: { key: Buffer.alloc(96) }
        },
        extraOptions: {
          mongocryptdBypassSpawn: true
        }
      });

      const localMcdm = this.mc._mongocryptdManager;
      sandbox.spy(localMcdm, 'spawn');

      this.mc.init(err => {
        expect(err).to.not.exist;
        expect(localMcdm.spawn).to.not.have.been.called;

        this.mc.encrypt('test.test', TEST_COMMAND, (err, response) => {
          expect(localMcdm.spawn).to.not.have.been.called;
          expect(response).to.not.exist;
          expect(err).to.equal(timeoutError);
          done();
        });
      });
    });
  });

  describe('crypt_shared library', function () {
    it('should fail if no library can be found in the search path and cryptSharedLibRequired is set', function () {
      // NB: This test has to be run before the tests/without having previously
      // loaded a CSFLE shared library below to get the right error path.
      const client = new MockClient();
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

    it('should load a shared library by specifying its path', function (done) {
      const client = new MockClient();
      this.mc = new AutoEncrypter(client, {
        keyVaultNamespace: 'admin.datakeys',
        logger: () => {},
        kmsProviders: {
          aws: { accessKeyId: 'example', secretAccessKey: 'example' },
          local: { key: Buffer.alloc(96) }
        },
        extraOptions: {
          cryptSharedLibPath: sharedLibraryStub
        }
      });

      expect(this.mc).to.not.have.property('_mongocryptdManager');
      expect(this.mc).to.not.have.property('_mongocryptdClient');
      expect(this.mc).to.have.deep.property('cryptSharedLibVersionInfo', {
        // eslint-disable-next-line no-undef
        version: BigInt(0x000600020001000),
        versionStr: 'stubbed-crypt_shared'
      });

      this.mc.teardown(true, done);
    });

    it('should load a shared library by specifying a search path', function (done) {
      const client = new MockClient();
      this.mc = new AutoEncrypter(client, {
        keyVaultNamespace: 'admin.datakeys',
        logger: () => {},
        kmsProviders: {
          aws: { accessKeyId: 'example', secretAccessKey: 'example' },
          local: { key: Buffer.alloc(96) }
        },
        extraOptions: {
          cryptSharedLibSearchPaths: [path.dirname(sharedLibraryStub)]
        }
      });

      expect(this.mc).to.not.have.property('_mongocryptdManager');
      expect(this.mc).to.not.have.property('_mongocryptdClient');
      expect(this.mc).to.have.deep.property('cryptSharedLibVersionInfo', {
        // eslint-disable-next-line no-undef
        version: BigInt(0x000600020001000),
        versionStr: 'stubbed-crypt_shared'
      });

      this.mc.teardown(true, done);
    });
  });

  it('should provide the libmongocrypt version', function () {
    expect(AutoEncrypter.libmongocryptVersion).to.be.a('string');
  });
});
