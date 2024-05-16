import { expect } from 'chai';

import { ReadPreference, Topology } from '../../mongodb';
import { assert as test, setupDatabase } from '../shared';

describe('ReadPreference', function () {
  let client;
  let events;

  beforeEach(async function () {
    client = this.configuration.newClient({ monitorCommands: true });
  });

  afterEach(async function () {
    await client.close();
  });

  before(function () {
    return setupDatabase(this.configuration);
  });

  it(
    'Should correctly apply collection level read Preference to count',
    { requires: { mongodb: '>=2.6.0', topology: ['single', 'ssl'] } },
    function (done) {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        const db = client.db(configuration.db);
        expect(err).to.not.exist;
        // Set read preference
        const collection = db.collection('read_pref_1', {
          readPreference: ReadPreference.SECONDARY_PREFERRED
        });
        // Save checkout function
        const command = client.topology.command;
        // Set up our checker method
        client.topology.command = function (...args) {
          if (args[0] === 'integration_tests.$cmd') {
            test.equal(ReadPreference.SECONDARY_PREFERRED, args[2].readPreference.mode);
          }
          return command.apply(db.s.topology, args);
        };
        // Execute count
        collection.count(function (err) {
          expect(err).to.not.exist;
          client.topology.command = command;
          client.close(done);
        });
      });
    }
  );

  it(
    'Should correctly apply collection level read Preference to aggregate',
    { requires: { mongodb: '>=2.6.0', topology: ['single', 'ssl'] } },
    function (done) {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        const db = client.db(configuration.db);
        expect(err).to.not.exist;
        // Set read preference
        const collection = db.collection('read_pref_1', {
          readPreference: ReadPreference.SECONDARY_PREFERRED
        });
        // Save checkout function
        const command = client.topology.command;
        // Set up our checker method
        client.topology.command = function (...args) {
          if (args[0] === 'integration_tests.$cmd') {
            test.equal(ReadPreference.SECONDARY_PREFERRED, args[2].readPreference.mode);
          }
          return command.apply(db.s.topology, args);
        };
        const cursor = collection.aggregate([
          {
            $project: {
              author: 1,
              tags: 1
            }
          },
          { $unwind: '$tags' },
          {
            $group: {
              _id: { tags: '$tags' },
              authors: { $addToSet: '$author' }
            }
          }
        ]);
        cursor.toArray(function (err) {
          expect(err).to.not.exist;
          client.topology.command = command;
          client.close(done);
        });
      });
    }
  );

  it(
    'Should correctly honor the readPreferences at DB and individual command level',
    { requires: { mongodb: '>=2.6.0', topology: ['single', 'ssl'] } },
    function (done) {
      const configuration = this.configuration;
      const client = configuration.newClient(
        { w: 1, readPreference: 'secondary' },
        { maxPoolSize: 1 }
      );
      client.connect(function (err, client) {
        const db = client.db(configuration.db);
        // Save checkout function
        const command = client.topology.command;
        // Set up our checker method
        client.topology.command = function (...args) {
          if (args[0] === 'integration_tests.$cmd') {
            test.equal(ReadPreference.SECONDARY, args[2].readPreference.mode);
          }
          return command.apply(db.s.topology, args);
        };
        db.command({ dbStats: true }, function (err) {
          expect(err).to.not.exist;
          client.topology.command = function (...args) {
            if (args[0] === 'integration_tests.$cmd') {
              test.equal(ReadPreference.SECONDARY_PREFERRED, args[2].readPreference.mode);
            }
            return command.apply(db.s.topology, args);
          };
          db.command({ dbStats: true }, { readPreference: 'secondaryPreferred' }, function (err) {
            expect(err).to.not.exist;
            client.topology.command = command;
            client.close(done);
          });
        });
      });
    }
  );

  it(
    'Should correctly apply readPreferences specified as objects',
    { requires: { mongodb: '>=2.6.0', topology: ['single', 'ssl'] } },
    function (done) {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        const db = client.db(configuration.db);
        expect(err).to.not.exist;
        // Create read preference object.
        const mySecondaryPreferred = { mode: 'secondaryPreferred', tags: [] };
        db.command({ dbStats: true }, { readPreference: mySecondaryPreferred }, function (err) {
          expect(err).to.not.exist;
          client.close(done);
        });
      });
    }
  );

  it(
    'Should correctly pass readPreferences specified as objects to cursors',
    { requires: { mongodb: '>=2.6.0', topology: ['single', 'ssl'] } },
    function (done) {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        const db = client.db(configuration.db);
        expect(err).to.not.exist;
        // Create read preference object.
        const mySecondaryPreferred = { mode: 'secondaryPreferred', tags: [] };
        db.listCollections({}, { readPreference: mySecondaryPreferred }).toArray(function (err) {
          expect(err).to.not.exist;
          client.close(done);
        });
      });
    }
  );

  it(
    'Should correctly pass readPreferences specified as objects to collection methods',
    { requires: { mongodb: '>=2.6.0', topology: ['single', 'ssl'] } },
    function (done) {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        const db = client.db(configuration.db);
        expect(err).to.not.exist;
        // Create read preference object.
        const mySecondaryPreferred = { mode: 'secondaryPreferred', tags: [] };
        const cursor = db.collection('test').find({}, { readPreference: mySecondaryPreferred });
        cursor.toArray(function (err) {
          expect(err).to.not.exist;
          client.close(done);
        });
      });
    }
  );

  it(
    'Should correctly pass readPreferences on the Collection to listIndexes',
    { requires: { mongodb: '>=2.6.0', topology: ['single', 'ssl'] } },
    function (done) {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        const db = client.db(configuration.db);
        expect(err).to.not.exist;
        const cursor = db
          .collection('test', { readPreference: ReadPreference.SECONDARY_PREFERRED })
          .listIndexes();
        test.equal(cursor.readPreference.mode, 'secondaryPreferred');
        client.close(done);
      });
    }
  );

  it('Should throw an error on an invalid readPreference', function (done) {
    const configuration = this.configuration;
    const client = configuration.newClient();
    client.connect((err, client) => {
      const db = client.db(configuration.db);
      expect(db.collection.bind(db, 'test', { readPreference: 'invalid' })).to.throw(
        'Invalid read preference mode "invalid"'
      );
      client.close(done);
    });
  });

  describe('hedge', function () {
    it(
      'should set hedge using [find option & empty hedge]',
      { requires: { topology: 'replicaset', mongodb: '>=3.6.0' } },
      function (done) {
        events = [];
        client.on('commandStarted', event => {
          if (event.commandName === 'find') {
            events.push(event);
          }
        });
        const rp = new ReadPreference(ReadPreference.SECONDARY, undefined, { hedge: {} });
        client
          .db(this.configuration.db)
          .collection('test')
          .find({}, { readPreference: rp })
          .toArray(err => {
            expect(err).to.not.exist;
            const expected = { mode: ReadPreference.SECONDARY, hedge: {} };
            expect(events[0]).nested.property('command.$readPreference').to.deep.equal(expected);
            done();
          });
      }
    );

    it(
      'should set hedge using [.withReadPreference & empty hedge] ',
      { requires: { topology: 'replicaset', mongodb: '>=3.6.0' } },
      function (done) {
        events = [];
        client.on('commandStarted', event => {
          if (event.commandName === 'find') {
            events.push(event);
          }
        });
        const rp = new ReadPreference(ReadPreference.SECONDARY, undefined, { hedge: {} });
        client
          .db(this.configuration.db)
          .collection('test')
          .find({})
          .withReadPreference(rp)
          .toArray(err => {
            expect(err).to.not.exist;
            const expected = { mode: ReadPreference.SECONDARY, hedge: {} };
            expect(events[0]).nested.property('command.$readPreference').to.deep.equal(expected);
            done();
          });
      }
    );

    it(
      'should set hedge using [.withReadPreference & enabled hedge] ',
      { requires: { topology: 'replicaset', mongodb: '>=3.6.0' } },
      function (done) {
        events = [];
        client.on('commandStarted', event => {
          if (event.commandName === 'find') {
            events.push(event);
          }
        });
        const rp = new ReadPreference(ReadPreference.SECONDARY, undefined, {
          hedge: { enabled: true }
        });
        client
          .db(this.configuration.db)
          .collection('test')
          .find({})
          .withReadPreference(rp)
          .toArray(err => {
            expect(err).to.not.exist;
            const expected = { mode: ReadPreference.SECONDARY, hedge: { enabled: true } };
            expect(events[0]).nested.property('command.$readPreference').to.deep.equal(expected);
            done();
          });
      }
    );

    it(
      'should set hedge using [.withReadPreference & disabled hedge] ',
      { requires: { topology: 'replicaset', mongodb: '>=3.6.0' } },
      function (done) {
        events = [];
        client.on('commandStarted', event => {
          if (event.commandName === 'find') {
            events.push(event);
          }
        });
        const rp = new ReadPreference(ReadPreference.SECONDARY, undefined, {
          hedge: { enabled: false }
        });
        client
          .db(this.configuration.db)
          .collection('test')
          .find({})
          .withReadPreference(rp)
          .toArray(err => {
            expect(err).to.not.exist;
            const expected = { mode: ReadPreference.SECONDARY, hedge: { enabled: false } };
            expect(events[0]).nested.property('command.$readPreference').to.deep.equal(expected);
            done();
          });
      }
    );

    it(
      'should set hedge using [.withReadPreference & undefined hedge] ',
      { requires: { topology: 'replicaset', mongodb: '>=3.6.0' } },
      function (done) {
        events = [];
        client.on('commandStarted', event => {
          if (event.commandName === 'find') {
            events.push(event);
          }
        });
        const rp = new ReadPreference(ReadPreference.SECONDARY);
        client
          .db(this.configuration.db)
          .collection('test')
          .find({})
          .withReadPreference(rp)
          .toArray(err => {
            expect(err).to.not.exist;
            const expected = { mode: ReadPreference.SECONDARY };
            expect(events[0]).nested.property('command.$readPreference').to.deep.equal(expected);
            done();
          });
      }
    );
  });

  describe('should enforce fixed primary read preference', function () {
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
      it(
        `${operation}`,
        {
          requires: { topology: ['replicaset', 'sharded'] }
        },
        async function () {
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
      );
    }
  });

  it(
    'should respect readPreference from uri',
    { requires: { topology: 'replicaset' } },
    async function () {
      const client = this.configuration.newClient({
        readPreference: 'secondary',
        monitorCommands: true
      });
      events = [];
      client.on('commandStarted', event => {
        if (event.commandName === 'find') {
          events.push(event);
        }
      });
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
  );

  describe('when connecting to a secondary in a replica set with a direct connection', function () {
    describe('when readPreference is primary', () => {
      it(
        'should attach a read preference of primaryPreferred to the read command for replicaset',
        { requires: { topology: 'replicaset' } },
        async function () {
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
            events = [];
            client.on('commandStarted', event => {
              if (event.commandName === 'find') {
                events.push(event);
              }
            });
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
      );

      it(
        'should not attach a read preference to the read command for standalone',
        { requires: { topology: 'single' } },
        async function () {
          const client = this.configuration.newClient(
            {
              readPreference: 'primary',
              directConnection: true
            },
            {
              monitorCommands: true
            }
          );
          events = [];
          client.on('commandStarted', event => {
            if (event.commandName === 'find') {
              events.push(event);
            }
          });
          await client.db('test').collection('test').findOne({ a: 1 });
          expect(events[0]).to.have.property('commandName', 'find');
          expect(events[0]).to.not.have.deep.nested.property('command.$readPreference');
          await client.close();
        }
      );
    });

    describe('when readPreference is secondary', () => {
      it(
        'should attach a read preference of secondary to the read command for replicaset',
        { requires: { topology: 'replicaset' } },
        async function () {
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
            events = [];
            client.on('commandStarted', event => {
              if (event.commandName === 'find') {
                events.push(event);
              }
            });
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
      );

      it(
        'should not attach a read preference to the read command for standalone',
        { requires: { topology: 'single' } },
        async function () {
          const client = this.configuration.newClient(
            {
              readPreference: 'secondary',
              directConnection: true
            },
            {
              monitorCommands: true
            }
          );
          events = [];
          client.on('commandStarted', event => {
            if (event.commandName === 'find') {
              events.push(event);
            }
          });
          await client.db('test').collection('test').findOne({ a: 1 });
          expect(events[0]).to.have.property('commandName', 'find');
          expect(events[0]).to.not.have.deep.nested.property('command.$readPreference');
          await client.close();
        }
      );
    });
  });
});
