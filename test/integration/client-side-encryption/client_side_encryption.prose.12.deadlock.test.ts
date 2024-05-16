import * as BSON from 'bson';
import { expect } from 'chai';
import { readFileSync } from 'fs';
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { ClientEncryption } from '../../../src/client-side-encryption/client_encryption';
import { type CommandStartedEvent, MongoClient, type MongoClientOptions } from '../../mongodb';
import { installNodeDNSWorkaroundHooks } from '../../tools/runner/hooks/configuration';
import { getEncryptExtraOptions } from '../../tools/utils';
import { dropCollection } from '../shared';
/* REFERENCE: (note commit hash) */
/* https://github.com/mongodb/specifications/blob/b3beada 72ae1c992294ae6a8eea572003a274c35/source/client-side-encryption/tests/README.rst#deadlock-tests */
const LOCAL_KEY = Buffer.from(
  'Mng0NCt4ZHVUYUJCa1kxNkVyNUR1QURhZ2h2UzR2d2RrZzh0cFBwM3R6NmdWMDFBMUN3YkQ5aXRRMkhGRGdQV09wOGVNYUMxT2k3NjZKelhaQmRCZGJkTXVyZG9uSjFk',
  'base64'
);
const externalKey = BSON.EJSON.parse(
  readFileSync(
    path.resolve(__dirname, '../../spec/client-side-encryption/external/external-key.json'),
    { encoding: 'utf-8' }
  )
);
const $jsonSchema = BSON.EJSON.parse(
  readFileSync(
    path.resolve(__dirname, '../../spec/client-side-encryption/external/external-schema.json'),
    { encoding: 'utf-8' }
  )
);
class CapturingMongoClient extends MongoClient {
  commandStartedEvents: Array<CommandStartedEvent> = [];
  clientsCreated = 0;
  constructor(url: string, options: MongoClientOptions = {}) {
    options = { ...options, monitorCommands: true, [Symbol.for('@@mdb.skipPingOnConnect')]: true };
    if (process.env.MONGODB_API_VERSION) {
      options.serverApi = process.env.MONGODB_API_VERSION as MongoClientOptions['serverApi'];
    }
    super(url, options);
    this.on('commandStarted', ev => this.commandStartedEvents.push(ev));
    this.on('topologyOpening', () => this.clientsCreated++);
  }
}
function deadlockTest(
  {
    maxPoolSize,
    bypassAutoEncryption,
    useKeyVaultClient
  }: {
    maxPoolSize: number;
    useKeyVaultClient: boolean;
    bypassAutoEncryption: boolean;
  },
  assertions
) {
  return async function () {
    const url = this.configuration.url();
    const clientTest = this.clientTest;
    const ciphertext = this.ciphertext;
    const clientEncryptedOpts = {
      autoEncryption: {
        keyVaultNamespace: 'keyvault.datakeys',
        kmsProviders: { local: { key: LOCAL_KEY } },
        bypassAutoEncryption,
        keyVaultClient: useKeyVaultClient ? this.clientKeyVault : undefined,
        extraOptions: getEncryptExtraOptions()
      },
      maxPoolSize
    };
    const clientEncrypted = new CapturingMongoClient(url, clientEncryptedOpts);
    await clientEncrypted.connect();
    try {
      if (bypassAutoEncryption) {
        await clientTest.db('db').collection('coll').insertOne({ _id: 0, encrypted: ciphertext });
      } else {
        await clientEncrypted
          .db('db')
          .collection('coll')
          .insertOne({ _id: 0, encrypted: 'string0' });
      }
      const res = await clientEncrypted.db('db').collection('coll').findOne({ _id: 0 });
      expect(res).to.have.property('_id', 0);
      expect(res).to.have.property('encrypted', 'string0');
      assertions(clientEncrypted, this.clientKeyVault);
    } finally {
      await clientEncrypted.close();
    }
  };
}
const metadata = {
  requires: {
    clientSideEncryption: true,
    mongodb: '>=4.2.0',
    topology: '!load-balanced'
  }
};
describe('Connection Pool Deadlock Prevention', function () {
  installNodeDNSWorkaroundHooks();

  beforeEach(async function () {
    const url: string = this.configuration.url();
    this.clientTest = new CapturingMongoClient(url);
    this.clientKeyVault = new CapturingMongoClient(url, {
      monitorCommands: true,
      maxPoolSize: 1
    });
    this.clientEncryption = undefined;
    this.ciphertext = undefined;
    await this.clientTest.connect();
    await this.clientKeyVault.connect();
    await dropCollection(this.clientTest.db('keyvault'), 'datakeys');
    await dropCollection(this.clientTest.db('db'), 'coll');
    await this.clientTest
      .db('keyvault')
      .collection('datakeys')
      .insertOne(externalKey, {
        writeConcern: { w: 'majority' }
      });
    await this.clientTest.db('db').createCollection('coll', { validator: { $jsonSchema } });
    this.clientEncryption = new ClientEncryption(this.clientTest, {
      kmsProviders: { local: { key: LOCAL_KEY } },
      keyVaultNamespace: 'keyvault.datakeys',
      keyVaultClient: this.keyVaultClient,
      extraOptions: getEncryptExtraOptions()
    });
    this.ciphertext = await this.clientEncryption.encrypt('string0', {
      algorithm: 'AEAD_AES_256_CBC_HMAC_SHA_512-Deterministic',
      keyAltName: 'local'
    });
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
      expect(clientEncrypted.clientsCreated, 'Incorrect number of clients created').to.equal(2);
      const events = clientEncrypted.commandStartedEvents;
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
      expect(clientEncrypted.clientsCreated, 'Incorrect number of clients created').to.equal(2);
      const events = clientEncrypted.commandStartedEvents;
      expect(events).to.have.lengthOf(3);
      expect(events[0].command).to.have.property('listCollections');
      expect(events[0].command.$db).to.equal('db');
      expect(events[1].command).to.have.property('insert');
      expect(events[1].command.$db).to.equal('db');
      expect(events[2].command).to.have.property('find');
      expect(events[2].command.$db).to.equal('db');
      const keyVaultEvents = clientKeyVault.commandStartedEvents;
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
      expect(clientEncrypted.clientsCreated, 'Incorrect number of clients created').to.equal(2);
      const events = clientEncrypted.commandStartedEvents;
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
      expect(clientEncrypted.clientsCreated, 'Incorrect number of clients created').to.equal(1);
      const events = clientEncrypted.commandStartedEvents;
      expect(events).to.have.lengthOf(1);
      expect(events[0].command).to.have.property('find');
      expect(events[0].command.$db).to.equal('db');
      const keyVaultEvents = clientKeyVault.commandStartedEvents;
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
      expect(clientEncrypted.clientsCreated, 'Incorrect number of clients created').to.equal(1);
      const events = clientEncrypted.commandStartedEvents;
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
      expect(clientEncrypted.clientsCreated, 'Incorrect number of clients created').to.equal(1);
      const events = clientEncrypted.commandStartedEvents;
      expect(events).to.have.lengthOf(3);
      expect(events[0].command).to.have.property('listCollections');
      expect(events[0].command.$db).to.equal('db');
      expect(events[1].command).to.have.property('insert');
      expect(events[1].command.$db).to.equal('db');
      expect(events[2].command).to.have.property('find');
      expect(events[2].command.$db).to.equal('db');
      const keyVaultEvents = clientKeyVault.commandStartedEvents;
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
      expect(clientEncrypted.clientsCreated, 'Incorrect number of clients created').to.equal(1);
      const events = clientEncrypted.commandStartedEvents;
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
      expect(clientEncrypted.clientsCreated, 'Incorrect number of clients created').to.equal(1);
      const events = clientEncrypted.commandStartedEvents;
      expect(events).to.have.lengthOf(1);
      expect(events[0].command).to.have.property('find');
      expect(events[0].command.$db).to.equal('db');
      const keyVaultEvents = clientKeyVault.commandStartedEvents;
      expect(keyVaultEvents).to.have.lengthOf(1);
      expect(keyVaultEvents[0].command).to.have.property('find');
      expect(keyVaultEvents[0].command.$db).to.equal('keyvault');
    })
  );
});
