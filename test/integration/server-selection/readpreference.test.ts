import { expect } from 'chai';

import {
  type CommandStartedEvent,
  type MongoClient,
  ReadPreference,
  Topology
} from '../../mongodb';
import { assert as test, filterForCommands, setupDatabase } from '../shared';

describe('ReadPreference', function () {
  let client: MongoClient;
  let events: CommandStartedEvent[] = [];

  beforeEach(async function () {
    client = this.configuration.newClient({ monitorCommands: true });
  });

  afterEach(async function () {
    events = [];
    await client.close();
  });

  before(function () {
    return setupDatabase(this.configuration);
  });

  it('Should correctly pass readPreferences on the Collection to listIndexes', {
    metadata: { requires: { topology: ['single'] } },

    test: async function () {
      const db = client.db(this.configuration.db);
      const cursor = db
        .collection('test', { readPreference: ReadPreference.SECONDARY_PREFERRED })
        .listIndexes();
      test.equal(cursor.readPreference.mode, 'secondaryPreferred');
    }
  });

  it('Should throw an error on an invalid readPreference', async function () {
    const db = client.db(this.configuration.db);
    expect(db.collection.bind(db, 'test', { readPreference: 'invalid' })).to.throw(
      'Invalid read preference mode "invalid"'
    );
  });

  context('hedge', function () {
    it('should set hedge using [find option & empty hedge]', {
      metadata: { requires: { topology: 'replicaset' } },
      test: async function () {
        client.on('commandStarted', filterForCommands(['find'], events));
        const rp = new ReadPreference(ReadPreference.SECONDARY, undefined, { hedge: {} });
        await client
          .db(this.configuration.db)
          .collection('test')
          .find({}, { readPreference: rp })
          .toArray();
        const expected = { mode: ReadPreference.SECONDARY, hedge: {} };
        expect(events[0]).nested.property('command.$readPreference').to.deep.equal(expected);
      }
    });

    it('should set hedge using [.withReadPreference & empty hedge] ', {
      metadata: { requires: { topology: 'replicaset' } },
      test: async function () {
        client.on('commandStarted', filterForCommands(['find'], events));
        const rp = new ReadPreference(ReadPreference.SECONDARY, undefined, { hedge: {} });
        await client
          .db(this.configuration.db)
          .collection('test')
          .find({})
          .withReadPreference(rp)
          .toArray();
        const expected = { mode: ReadPreference.SECONDARY, hedge: {} };
        expect(events[0]).nested.property('command.$readPreference').to.deep.equal(expected);
      }
    });

    it('should set hedge using [.withReadPreference & enabled hedge] ', {
      metadata: { requires: { topology: 'replicaset' } },
      test: async function () {
        client.on('commandStarted', filterForCommands(['find'], events));
        const rp = new ReadPreference(ReadPreference.SECONDARY, undefined, {
          hedge: { enabled: true }
        });
        await client
          .db(this.configuration.db)
          .collection('test')
          .find({})
          .withReadPreference(rp)
          .toArray();
        const expected = { mode: ReadPreference.SECONDARY, hedge: { enabled: true } };
        expect(events[0]).nested.property('command.$readPreference').to.deep.equal(expected);
      }
    });

    it('should set hedge using [.withReadPreference & disabled hedge] ', {
      metadata: { requires: { topology: 'replicaset' } },
      test: async function () {
        client.on('commandStarted', filterForCommands(['find'], events));
        const rp = new ReadPreference(ReadPreference.SECONDARY, undefined, {
          hedge: { enabled: false }
        });
        await client
          .db(this.configuration.db)
          .collection('test')
          .find({})
          .withReadPreference(rp)
          .toArray();
        const expected = { mode: ReadPreference.SECONDARY, hedge: { enabled: false } };
        expect(events[0]).nested.property('command.$readPreference').to.deep.equal(expected);
      }
    });

    it('should set hedge using [.withReadPreference & undefined hedge] ', {
      metadata: { requires: { topology: 'replicaset' } },
      test: async function () {
        client.on('commandStarted', filterForCommands(['find'], events));
        const rp = new ReadPreference(ReadPreference.SECONDARY);
        await client
          .db(this.configuration.db)
          .collection('test')
          .find({})
          .withReadPreference(rp)
          .toArray();
        const expected = { mode: ReadPreference.SECONDARY };
        expect(events[0]).nested.property('command.$readPreference').to.deep.equal(expected);
      }
    });
  });

  context('should enforce fixed primary read preference', function () {
    const collectionName = 'ddl_collection';
    let client;

    beforeEach(async function () {
      const configuration = this.configuration;
      const utilClient = this.configuration.newClient(configuration.writeConcernMax(), {
        readPreference: 'primaryPreferred'
      });

      const db = utilClient.db(configuration.db);
      await db
        .command({
          createUser: 'default',
          pwd: 'pass',
          roles: [{ role: 'readWrite', db: configuration.db }]
        })
        .catch(() => null);

      await db.createCollection('before_collection').catch(() => null);
      await db.createIndex(collectionName, { aloha: 1 }).catch(() => null);

      await utilClient.close();

      client = await this.configuration.newClient(configuration.writeConcernMax()).connect();
    });

    afterEach(async () => {
      await client.close();
    });

    const methods = {
      'Collection#createIndex': [{ quote: 'text' }],
      'Db#createIndex': [collectionName, { quote: 'text' }],
      'Db#removeUser': ['default'],
      'Db#createCollection': ['created_collection'],
      'Db#dropCollection': ['before_collection'],
      'Collection#dropIndex': ['aloha_1'],
      'Collection#rename': ['new_name'],
      'Db#dropDatabase': []
    };

    for (const operation of Object.keys(methods)) {
      it(`${operation}`, {
        metadata: {
          requires: { topology: ['replicaset', 'sharded'] }
        },
        test: async function () {
          const configuration = this.configuration;
          const db = client.db(configuration.db);
          const args = methods[operation];
          const [parentId, method] = operation.split('#');
          const collection = db.collection(collectionName);
          const parent = parentId === 'Collection' ? collection : parentId === 'Db' ? db : null;
          const selectServerSpy = this.sinon.spy(Topology.prototype, 'selectServer');

          expect(parent).to.have.property(method).that.is.a('function');
          await parent[method](...args);

          expect(selectServerSpy.called).to.equal(true);
          const selectionCall = selectServerSpy.getCall(0);
          expect(selectionCall.args[0]).to.not.be.a('function');
          expect(selectionCall).nested.property('args[0].mode').to.equal(ReadPreference.PRIMARY);
        }
      });
    }
  });

  it('should respect readPreference from uri', {
    metadata: { requires: { topology: 'replicaset' } },
    test: async function () {
      const client = this.configuration.newClient({
        readPreference: 'secondary',
        monitorCommands: true
      });
      client.on('commandStarted', filterForCommands(['find'], events));

      expect(client.readPreference.mode).to.equal('secondary');
      await client.db('test').collection('test').findOne({ a: 1 });
      expect(events).to.be.an('array').with.lengthOf(1);
      expect(events[0]).to.containSubset({
        commandName: 'find',
        command: {
          $readPreference: { mode: 'secondary' }
        }
      });

      await client.close();
    }
  });

  context('when connecting to a secondary in a replica set with a direct connection', function () {
    context('when readPreference is primary', () => {
      it('should attach a read preference of primaryPreferred to the read command for replicaset', {
        metadata: { requires: { topology: 'replicaset' } },
        test: async function () {
          if (this.configuration.topologyType !== 'ReplicaSetWithPrimary') {
            this.skipReason = 'This test is supposed to run on the replicaset with primary';
            return this.skip();
          }

          let checkedPrimary = false;

          for (const server of this.configuration.options.hostAddresses) {
            const { host, port } = server.toHostPort();
            const client = this.configuration.newClient(
              {
                readPreference: 'primary',
                directConnection: true,
                host,
                port
              },
              {
                monitorCommands: true
              }
            );
            client.on('commandStarted', filterForCommands(['find'], events));

            const admin = client.db().admin();
            const serverStatus = await admin.serverStatus();

            if (server.toString() === serverStatus.repl.primary) {
              await client.db('test').collection('test').findOne({ a: 1 });
              expect(events[0]).to.have.property('commandName', 'find');
              expect(events[0]).to.have.deep.nested.property('command.$readPreference', {
                mode: 'primaryPreferred'
              });
              checkedPrimary = true;
            }
            await client.close();
          }
          expect(checkedPrimary).to.be.equal(true);
        }
      });

      it('should not attach a read preference to the read command for standalone', {
        metadata: { requires: { topology: 'single' } },
        test: async function () {
          const client = this.configuration.newClient(
            {
              readPreference: 'primary',
              directConnection: true
            },
            {
              monitorCommands: true
            }
          );
          client.on('commandStarted', filterForCommands(['find'], events));
          await client.db('test').collection('test').findOne({ a: 1 });
          expect(events[0]).to.have.property('commandName', 'find');
          expect(events[0]).to.not.have.deep.nested.property('command.$readPreference');
          await client.close();
        }
      });
    });

    context('when readPreference is secondary', () => {
      it('should attach a read preference of secondary to the read command for replicaset', {
        metadata: { requires: { topology: 'replicaset' } },
        test: async function () {
          let checkedSecondary = false;

          for (const server of this.configuration.options.hostAddresses) {
            const { host, port } = server.toHostPort();
            const client = this.configuration.newClient(
              {
                readPreference: 'secondary',
                directConnection: true,
                host,
                port
              },
              {
                monitorCommands: true
              }
            );
            client.on('commandStarted', filterForCommands(['find'], events));

            const admin = client.db().admin();
            const serverStatus = await admin.serverStatus();

            if (serverStatus.repl.secondary) {
              await client.db('test').collection('test').findOne({ a: 1 });
              expect(events[0]).to.have.property('commandName', 'find');
              expect(events[0]).to.have.deep.nested.property('command.$readPreference', {
                mode: 'secondary'
              });
              checkedSecondary = true;
            }
            await client.close();
          }
          expect(checkedSecondary).to.be.equal(true);
        }
      });

      it('should not attach a read preference to the read command for standalone', {
        metadata: { requires: { topology: 'single' } },
        test: async function () {
          const client = this.configuration.newClient(
            {
              readPreference: 'secondary',
              directConnection: true
            },
            {
              monitorCommands: true
            }
          );
          client.on('commandStarted', filterForCommands(['find'], events));
          await client.db('test').collection('test').findOne({ a: 1 });
          expect(events[0]).to.have.property('commandName', 'find');
          expect(events[0]).to.not.have.deep.nested.property('command.$readPreference');
          await client.close();
        }
      });
    });
  });
});
