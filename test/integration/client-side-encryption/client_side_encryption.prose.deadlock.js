'use strict';

const BSON = require('bson');
const { expect } = require('chai');
const { dropCollection } = require('../shared');
const util = require('util');
const fs = require('fs');
const path = require('path');
const { getEncryptExtraOptions } = require('../../tools/utils');
const { installNodeDNSWorkaroundHooks } = require('../../tools/runner/hooks/configuration');

/* REFERENCE: (note commit hash) */
/* https://github.com/mongodb/specifications/blob/b3beada72ae1c992294ae6a8eea572003a274c35/source/client-side-encryption/tests/README.rst#deadlock-tests */

const LOCAL_KEY = Buffer.from(
  'Mng0NCt4ZHVUYUJCa1kxNkVyNUR1QURhZ2h2UzR2d2RrZzh0cFBwM3R6NmdWMDFBMUN3YkQ5aXRRMkhGRGdQV09wOGVNYUMxT2k3NjZKelhaQmRCZGJkTXVyZG9uSjFk',
  'base64'
);

const externalKey = BSON.EJSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, '../../spec/client-side-encryption/external/external-key.json')
  )
);
const $jsonSchema = BSON.EJSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, '../../spec/client-side-encryption/external/external-schema.json')
  )
);

const kEvents = Symbol('events');
const kClientsCreated = Symbol('clientsCreated');
const CapturingMongoClient = class extends require('../../mongodb').MongoClient {
  constructor(url, options) {
    options = { ...options, monitorCommands: true };
    if (process.env.MONGODB_API_VERSION) {
      options.serverApi = process.env.MONGODB_API_VERSION;
    }

    super(url, options);

    this[kEvents] = [];
    this.on('commandStarted', ev => this[kEvents].push(ev));

    this[kClientsCreated] = 0;
    this.on('topologyOpening', () => this[kClientsCreated]++);
  }
};

function deadlockTest(options, assertions) {
  return function () {
    const url = this.configuration.url();
    const clientTest = this.clientTest;
    const ciphertext = this.ciphertext;

    const clientEncryptedOpts = {
      autoEncryption: {
        keyVaultNamespace: 'keyvault.datakeys',
        kmsProviders: { local: { key: LOCAL_KEY } },
        bypassAutoEncryption: options.bypassAutoEncryption,
        keyVaultClient: options.useKeyVaultClient ? this.clientKeyVault : undefined,
        extraOptions: getEncryptExtraOptions()
      },
      maxPoolSize: options.maxPoolSize
    };
    const clientEncrypted = new CapturingMongoClient(url, clientEncryptedOpts);

    return clientEncrypted
      .connect()
      .then(() => {
        if (clientEncryptedOpts.autoEncryption.bypassAutoEncryption === true) {
          return clientTest
            .db('db')
            .collection('coll')
            .insertOne({ _id: 0, encrypted: ciphertext });
        }
        return clientEncrypted
          .db('db')
          .collection('coll')
          .insertOne({ _id: 0, encrypted: 'string0' });
      })
      .then(() => clientEncrypted.db('db').collection('coll').findOne({ _id: 0 }))
      .then(res => {
        expect(res).to.have.property('_id', 0);
        expect(res).to.have.property('encrypted', 'string0');
        assertions(clientEncrypted, this.clientKeyVault);
        return clientEncrypted.close();
      });
  };
}

function deadlockTests(_metadata) {
  const metadata = { ..._metadata, requires: { ..._metadata.requires, auth: 'disabled' } };
  metadata.skipReason = 'TODO: NODE-3891 - fix tests broken when AUTH enabled';
  describe('Connection Pool Deadlock Prevention', function () {
    installNodeDNSWorkaroundHooks();
    beforeEach(function () {
      try {
        const mongodbClientEncryption = this.configuration.mongodbClientEncryption;
        const url = this.configuration.url();

        this.clientTest = new CapturingMongoClient(url);
        this.clientKeyVault = new CapturingMongoClient(url, {
          monitorCommands: true,
          maxPoolSize: 1
        });

        this.clientEncryption = undefined;
        this.ciphertext = undefined;

        return this.clientTest
          .connect()
          .then(() => this.clientKeyVault.connect())
          .then(() => dropCollection(this.clientTest.db('keyvault'), 'datakeys'))
          .then(() => dropCollection(this.clientTest.db('db'), 'coll'))
          .then(
            () => this.clientTest.db('keyvault').collection('datakeys').insertOne(externalKey),
            {
              writeConcern: { w: 'majority' }
            }
          )
          .then(() =>
            this.clientTest.db('db').createCollection('coll', { validator: { $jsonSchema } })
          )
          .then(() => {
            this.clientEncryption = new mongodbClientEncryption.ClientEncryption(this.clientTest, {
              kmsProviders: { local: { key: LOCAL_KEY } },
              keyVaultNamespace: 'keyvault.datakeys',
              keyVaultClient: this.keyVaultClient,
              extraOptions: getEncryptExtraOptions()
            });
            this.clientEncryption.encryptPromisified = util.promisify(
              this.clientEncryption.encrypt.bind(this.clientEncryption)
            );

            return this.clientEncryption.encryptPromisified('string0', {
              algorithm: 'AEAD_AES_256_CBC_HMAC_SHA_512-Deterministic',
              keyAltName: 'local'
            });
          })
          .then(ciphertext => {
            this.ciphertext = ciphertext;
          })
          .catch(error => {
            // TODO(NODE-3400): Investigate and unskip this flaky error
            if (error.message === 'not all keys requested were satisfied') this.skip();
            else return Promise.reject(error);
          });
      } catch (error) {
        // TODO(NODE-3400): Investigate and unskip this flaky error
        if (error.message === 'not all keys requested were satisfied') this.skip();
        else return Promise.reject(error);
      }
    });

    afterEach(function () {
      return Promise.all([this.clientKeyVault.close(), this.clientTest.close()]).then(() => {
        this.clientKeyVault = undefined;
        this.clientTest = undefined;
        this.clientEncryption = undefined;
      });
    });

    const CASE1 = { maxPoolSize: 1, bypassAutoEncryption: false, useKeyVaultClient: false };
    it(
      'Case 1',
      metadata,
      deadlockTest(CASE1, clientEncrypted => {
        expect(clientEncrypted[kClientsCreated], 'Incorrect number of clients created').to.equal(2);

        const events = clientEncrypted[kEvents];
        expect(events).to.have.lengthOf(4);

        expect(events[0].command).to.have.property('listCollections');
        expect(events[0].command.$db).to.equal('db');

        expect(events[1].command).to.have.property('find');
        expect(events[1].command.$db).to.equal('keyvault');

        expect(events[2].command).to.have.property('insert');
        expect(events[2].command.$db).to.equal('db');

        expect(events[3].command).to.have.property('find');
        expect(events[3].command.$db).to.equal('db');
      })
    );

    const CASE2 = { maxPoolSize: 1, bypassAutoEncryption: false, useKeyVaultClient: true };
    it(
      'Case 2',
      metadata,
      deadlockTest(CASE2, (clientEncrypted, clientKeyVault) => {
        expect(clientEncrypted[kClientsCreated], 'Incorrect number of clients created').to.equal(2);

        const events = clientEncrypted[kEvents];
        expect(events).to.have.lengthOf(3);

        expect(events[0].command).to.have.property('listCollections');
        expect(events[0].command.$db).to.equal('db');

        expect(events[1].command).to.have.property('insert');
        expect(events[1].command.$db).to.equal('db');

        expect(events[2].command).to.have.property('find');
        expect(events[2].command.$db).to.equal('db');

        const keyVaultEvents = clientKeyVault[kEvents];
        expect(keyVaultEvents).to.have.lengthOf(1);

        expect(keyVaultEvents[0].command).to.have.property('find');
        expect(keyVaultEvents[0].command.$db).to.equal('keyvault');
      })
    );

    const CASE3 = { maxPoolSize: 1, bypassAutoEncryption: true, useKeyVaultClient: false };
    it(
      'Case 3',
      metadata,
      deadlockTest(CASE3, clientEncrypted => {
        expect(clientEncrypted[kClientsCreated], 'Incorrect number of clients created').to.equal(2);

        const events = clientEncrypted[kEvents];
        expect(events).to.have.lengthOf(2);

        expect(events[0].command).to.have.property('find');
        expect(events[0].command.$db).to.equal('db');

        expect(events[1].command).to.have.property('find');
        expect(events[1].command.$db).to.equal('keyvault');
      })
    );

    const CASE4 = { maxPoolSize: 1, bypassAutoEncryption: true, useKeyVaultClient: true };
    it(
      'Case 4',
      metadata,
      deadlockTest(CASE4, (clientEncrypted, clientKeyVault) => {
        expect(clientEncrypted[kClientsCreated], 'Incorrect number of clients created').to.equal(1);

        const events = clientEncrypted[kEvents];
        expect(events).to.have.lengthOf(1);

        expect(events[0].command).to.have.property('find');
        expect(events[0].command.$db).to.equal('db');

        const keyVaultEvents = clientKeyVault[kEvents];
        expect(keyVaultEvents).to.have.lengthOf(1);

        expect(keyVaultEvents[0].command).to.have.property('find');
        expect(keyVaultEvents[0].command.$db).to.equal('keyvault');
      })
    );

    const CASE5 = { maxPoolSize: 0, bypassAutoEncryption: false, useKeyVaultClient: false };
    it(
      'Case 5',
      metadata,
      deadlockTest(CASE5, clientEncrypted => {
        expect(clientEncrypted[kClientsCreated], 'Incorrect number of clients created').to.equal(1);

        const events = clientEncrypted[kEvents];
        expect(events).to.have.lengthOf(5);

        expect(events[0].command).to.have.property('listCollections');
        expect(events[0].command.$db).to.equal('db');

        expect(events[1].command).to.have.property('listCollections');
        expect(events[1].command.$db).to.equal('keyvault');

        expect(events[2].command).to.have.property('find');
        expect(events[2].command.$db).to.equal('keyvault');

        expect(events[3].command).to.have.property('insert');
        expect(events[3].command.$db).to.equal('db');

        expect(events[4].command).to.have.property('find');
        expect(events[4].command.$db).to.equal('db');
      })
    );

    const CASE6 = { maxPoolSize: 0, bypassAutoEncryption: false, useKeyVaultClient: true };
    it(
      'Case 6',
      metadata,
      deadlockTest(CASE6, (clientEncrypted, clientKeyVault) => {
        expect(clientEncrypted[kClientsCreated], 'Incorrect number of clients created').to.equal(1);

        const events = clientEncrypted[kEvents];
        expect(events).to.have.lengthOf(3);

        expect(events[0].command).to.have.property('listCollections');
        expect(events[0].command.$db).to.equal('db');

        expect(events[1].command).to.have.property('insert');
        expect(events[1].command.$db).to.equal('db');

        expect(events[2].command).to.have.property('find');
        expect(events[2].command.$db).to.equal('db');

        const keyVaultEvents = clientKeyVault[kEvents];
        expect(keyVaultEvents).to.have.lengthOf(1);

        expect(keyVaultEvents[0].command).to.have.property('find');
        expect(keyVaultEvents[0].command.$db).to.equal('keyvault');
      })
    );

    const CASE7 = { maxPoolSize: 0, bypassAutoEncryption: true, useKeyVaultClient: false };
    it(
      'Case 7',
      metadata,
      deadlockTest(CASE7, clientEncrypted => {
        expect(clientEncrypted[kClientsCreated], 'Incorrect number of clients created').to.equal(1);

        const events = clientEncrypted[kEvents];
        expect(events).to.have.lengthOf(2);

        expect(events[0].command).to.have.property('find');
        expect(events[0].command.$db).to.equal('db');

        expect(events[1].command).to.have.property('find');
        expect(events[1].command.$db).to.equal('keyvault');
      })
    );

    const CASE8 = { maxPoolSize: 0, bypassAutoEncryption: true, useKeyVaultClient: true };
    it(
      'Case 8',
      metadata,
      deadlockTest(CASE8, (clientEncrypted, clientKeyVault) => {
        expect(clientEncrypted[kClientsCreated], 'Incorrect number of clients created').to.equal(1);

        const events = clientEncrypted[kEvents];
        expect(events).to.have.lengthOf(1);

        expect(events[0].command).to.have.property('find');
        expect(events[0].command.$db).to.equal('db');

        const keyVaultEvents = clientKeyVault[kEvents];
        expect(keyVaultEvents).to.have.lengthOf(1);

        expect(keyVaultEvents[0].command).to.have.property('find');
        expect(keyVaultEvents[0].command.$db).to.equal('keyvault');
      })
    );
  });
}

module.exports = { deadlockTests };
