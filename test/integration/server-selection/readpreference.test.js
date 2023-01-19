'use strict';

const { ReadPreference } = require('../../mongodb');
const { Topology } = require('../../mongodb');
const chai = require('chai');
chai.use(require('chai-subset'));

const { assert: test, setupDatabase } = require('../shared');

const expect = chai.expect;

describe('ReadPreference', function () {
  let client;
  beforeEach(async function () {
    client = this.configuration.newClient({ monitorCommands: true });
  });

  afterEach(async function () {
    await client.close();
  });

  before(function () {
    return setupDatabase(this.configuration);
  });

  it('Should correctly apply collection level read Preference to count', {
    metadata: { requires: { mongodb: '>=2.6.0', topology: ['single', 'ssl'] } },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        var db = client.db(configuration.db);
        expect(err).to.not.exist;
        // Set read preference
        var collection = db.collection('read_pref_1', {
          readPreference: ReadPreference.SECONDARY_PREFERRED
        });
        // Save checkout function
        var command = client.topology.command;
        // Set up our checker method
        client.topology.command = function () {
          var args = Array.prototype.slice.call(arguments, 0);
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
  });

  it('Should correctly apply collection level read Preference to aggregate', {
    metadata: { requires: { mongodb: '>=2.6.0', topology: ['single', 'ssl'] } },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        var db = client.db(configuration.db);
        expect(err).to.not.exist;
        // Set read preference
        var collection = db.collection('read_pref_1', {
          readPreference: ReadPreference.SECONDARY_PREFERRED
        });
        // Save checkout function
        var command = client.topology.command;
        // Set up our checker method
        client.topology.command = function () {
          var args = Array.prototype.slice.call(arguments, 0);
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
  });

  it('Should correctly apply collection level read Preference to stats', {
    metadata: { requires: { mongodb: '>=2.6.0', topology: ['single', 'ssl'] } },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        var db = client.db(configuration.db);
        expect(err).to.not.exist;
        // Set read preference
        var collection = db.collection('read_pref_1', {
          readPreference: ReadPreference.SECONDARY_PREFERRED
        });
        // Save checkout function
        var command = client.topology.command;
        // Set up our checker method
        client.topology.command = function () {
          var args = Array.prototype.slice.call(arguments, 0);
          if (args[0] === 'integration_tests.$cmd') {
            test.equal(ReadPreference.SECONDARY_PREFERRED, args[2].readPreference.mode);
          }

          return command.apply(db.s.topology, args);
        };

        // Perform the map reduce
        collection.stats(function (/* err */) {
          // expect(err).to.not.exist;
          client.topology.command = command;
          client.close(done);
        });
      });
    }
  });

  it('Should correctly honor the readPreferences at DB and individual command level', {
    metadata: { requires: { mongodb: '>=2.6.0', topology: ['single', 'ssl'] } },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(
        { w: 1, readPreference: 'secondary' },
        { maxPoolSize: 1 }
      );
      client.connect(function (err, client) {
        var db = client.db(configuration.db);
        // Save checkout function
        var command = client.topology.command;
        // Set up our checker method
        client.topology.command = function () {
          var args = Array.prototype.slice.call(arguments, 0);
          if (args[0] === 'integration_tests.$cmd') {
            test.equal(ReadPreference.SECONDARY, args[2].readPreference.mode);
          }

          return command.apply(db.s.topology, args);
        };

        db.command({ dbStats: true }, function (err) {
          expect(err).to.not.exist;

          client.topology.command = function () {
            var args = Array.prototype.slice.call(arguments, 0);
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
  });

  it('Should correctly apply readPreferences specified as objects', {
    metadata: { requires: { mongodb: '>=2.6.0', topology: ['single', 'ssl'] } },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        var db = client.db(configuration.db);
        expect(err).to.not.exist;
        // Create read preference object.
        var mySecondaryPreferred = { mode: 'secondaryPreferred', tags: [] };
        db.command({ dbStats: true }, { readPreference: mySecondaryPreferred }, function (err) {
          expect(err).to.not.exist;
          client.close(done);
        });
      });
    }
  });

  it('Should correctly pass readPreferences specified as objects to cursors', {
    metadata: { requires: { mongodb: '>=2.6.0', topology: ['single', 'ssl'] } },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        var db = client.db(configuration.db);
        expect(err).to.not.exist;
        // Create read preference object.
        var mySecondaryPreferred = { mode: 'secondaryPreferred', tags: [] };
        db.listCollections({}, { readPreference: mySecondaryPreferred }).toArray(function (err) {
          expect(err).to.not.exist;
          client.close(done);
        });
      });
    }
  });

  it('Should correctly pass readPreferences specified as objects to collection methods', {
    metadata: { requires: { mongodb: '>=2.6.0', topology: ['single', 'ssl'] } },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        var db = client.db(configuration.db);
        expect(err).to.not.exist;
        // Create read preference object.
        var mySecondaryPreferred = { mode: 'secondaryPreferred', tags: [] };
        var cursor = db.collection('test').find({}, { readPreference: mySecondaryPreferred });
        cursor.toArray(function (err) {
          expect(err).to.not.exist;
          client.close(done);
        });
      });
    }
  });

  it('Should correctly pass readPreferences on the Collection to listIndexes', {
    metadata: { requires: { mongodb: '>=2.6.0', topology: ['single', 'ssl'] } },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        var db = client.db(configuration.db);
        expect(err).to.not.exist;
        var cursor = db
          .collection('test', { readPreference: ReadPreference.SECONDARY_PREFERRED })
          .listIndexes();
        test.equal(cursor.readPreference.mode, 'secondaryPreferred');
        client.close(done);
      });
    }
  });

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

  context('hedge', function () {
    it('should set hedge using [find option & empty hedge]', {
      metadata: { requires: { mongodb: '>=3.6.0' } },
      test: function (done) {
        const events = [];
        client.on('commandStarted', event => {
          if (event.commandName === 'find') {
            events.push(event);
          }
        });
        const rp = new ReadPreference(ReadPreference.SECONDARY, null, { hedge: {} });
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
    });

    it('should set hedge using [.withReadPreference & empty hedge] ', {
      metadata: { requires: { mongodb: '>=3.6.0' } },
      test: function (done) {
        const events = [];
        client.on('commandStarted', event => {
          if (event.commandName === 'find') {
            events.push(event);
          }
        });
        const rp = new ReadPreference(ReadPreference.SECONDARY, null, { hedge: {} });
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
    });

    it('should set hedge using [.withReadPreference & enabled hedge] ', {
      metadata: { requires: { mongodb: '>=3.6.0' } },
      test: function (done) {
        const events = [];
        client.on('commandStarted', event => {
          if (event.commandName === 'find') {
            events.push(event);
          }
        });
        const rp = new ReadPreference(ReadPreference.SECONDARY, null, { hedge: { enabled: true } });
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
    });

    it('should set hedge using [.withReadPreference & disabled hedge] ', {
      metadata: { requires: { mongodb: '>=3.6.0' } },
      test: function (done) {
        const events = [];
        client.on('commandStarted', event => {
          if (event.commandName === 'find') {
            events.push(event);
          }
        });
        const rp = new ReadPreference(ReadPreference.SECONDARY, null, {
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
    });

    it('should set hedge using [.withReadPreference & undefined hedge] ', {
      metadata: { requires: { mongodb: '>=3.6.0' } },
      test: function (done) {
        const events = [];
        client.on('commandStarted', event => {
          if (event.commandName === 'find') {
            events.push(event);
          }
        });
        const rp = new ReadPreference(ReadPreference.SECONDARY, null);
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
      await db.addUser('default', 'pass', { roles: 'readWrite' }).catch(() => null);
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
      'Db#addUser': ['thomas', 'pass', { roles: 'readWrite' }],
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
    metadata: { requires: { topology: 'replicaset', mongodb: '>=3.6' } },
    test: async function () {
      const client = this.configuration.newClient({
        readPreference: 'secondary',
        monitorCommands: true
      });
      const events = [];
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
  });
});
