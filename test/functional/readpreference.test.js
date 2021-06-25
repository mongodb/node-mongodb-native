'use strict';

const Topology = require('../../lib/core/sdam/topology').Topology;
const test = require('./shared').assert;
const setupDatabase = require('./shared').setupDatabase;
const withMonitoredClient = require('./shared').withMonitoredClient;

const ReadPreference = require('../../lib/core/topologies/read_preference');
const withClient = require('./shared').withClient;
const chai = require('chai');
chai.use(require('chai-subset'));
const expect = chai.expect;

describe('ReadPreference', function() {
  before(function() {
    return setupDatabase(this.configuration);
  });

  /**
   * @ignore
   */
  it('Should correctly apply collection level read Preference to count', {
    metadata: { requires: { mongodb: '>=2.6.0', topology: ['single', 'ssl'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var mongo = configuration.require,
        ReadPreference = mongo.ReadPreference;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        expect(err).to.not.exist;
        // Set read preference
        var collection = db.collection('read_pref_1', {
          readPreference: ReadPreference.SECONDARY_PREFERRED
        });
        // Save checkout function
        var command = client.topology.command;
        // Set up our checker method
        client.topology.command = function() {
          var args = Array.prototype.slice.call(arguments, 0);
          if (args[0] === 'integration_tests.$cmd') {
            test.equal(ReadPreference.SECONDARY_PREFERRED, args[2].readPreference.mode);
          }

          return command.apply(db.serverConfig, args);
        };

        // Execute count
        collection.count(function(err) {
          expect(err).to.not.exist;
          client.topology.command = command;

          client.close(done);
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('Should correctly apply collection level read Preference to group', {
    metadata: { requires: { mongodb: '>=2.6.0,<=4.0.x', topology: ['single', 'ssl'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var mongo = configuration.require,
        ReadPreference = mongo.ReadPreference;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        expect(err).to.not.exist;
        // Set read preference
        var collection = db.collection('read_pref_1', {
          readPreference: ReadPreference.SECONDARY_PREFERRED
        });

        // Save checkout function
        var command = client.topology.command;
        // Set up our checker method
        client.topology.command = function() {
          var args = Array.prototype.slice.call(arguments, 0);
          if (args[0] === 'integration_tests.$cmd') {
            test.equal(ReadPreference.SECONDARY_PREFERRED, args[2].readPreference.mode);
          }

          return command.apply(db.serverConfig, args);
        };

        // Execute count
        collection.group([], {}, { count: 0 }, 'function (obj, prev) { prev.count++; }', function(
          err
        ) {
          expect(err).to.not.exist;
          client.topology.command = command;

          client.close(done);
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('Should correctly apply collection level read Preference to geoHaystackSearch', {
    metadata: { requires: { mongodb: '>=2.6.0', topology: ['single', 'ssl'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var mongo = configuration.require,
        ReadPreference = mongo.ReadPreference;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        expect(err).to.not.exist;
        // Set read preference
        var collection = db.collection('read_pref_1', {
          readPreference: ReadPreference.SECONDARY_PREFERRED
        });
        // Save checkout function
        var command = client.topology.command;
        // Set up our checker method
        client.topology.command = function() {
          var args = Array.prototype.slice.call(arguments, 0);
          if (args[0] === 'integration_tests.$cmd') {
            test.equal(ReadPreference.SECONDARY_PREFERRED, args[2].readPreference.mode);
          }

          return command.apply(db.serverConfig, args);
        };

        // Execute count
        collection.geoHaystackSearch(
          50,
          50,
          { search: { a: 1 }, limit: 1, maxDistance: 100 },
          function(/* err */) {
            // expect(err).to.not.exist;
            client.topology.command = command;
            client.close(done);
          }
        );
      });
    }
  });

  /**
   * @ignore
   */
  it('Should correctly apply collection level read Preference to mapReduce', {
    metadata: { requires: { mongodb: '>=2.6.0', topology: ['single', 'ssl'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var mongo = configuration.require,
        ReadPreference = mongo.ReadPreference;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        expect(err).to.not.exist;
        // Set read preference
        var collection = db.collection('read_pref_1', {
          readPreference: ReadPreference.SECONDARY_PREFERRED
        });
        // Save checkout function
        var command = client.topology.command;
        // Set up our checker method
        client.topology.command = function() {
          var args = Array.prototype.slice.call(arguments, 0);
          if (args[0] === 'integration_tests.$cmd') {
            test.equal(ReadPreference.SECONDARY_PREFERRED, args[2].readPreference.mode);
          }

          return command.apply(db.serverConfig, args);
        };

        // Map function
        var map = function() {
          emit(this.user_id, 1); // eslint-disable-line
        };
        // Reduce function
        var reduce = function(/* k, vals */) {
          return 1;
        };

        // Perform the map reduce
        collection.mapReduce(map, reduce, { out: { inline: 1 } }, function(/* err */) {
          // expect(err).to.not.exist;

          // eslint-disable-line
          client.topology.command = command;

          client.close(done);
        });
      });
    }
  });

  /**
   * @ignore
   */
  it(
    'Should correctly apply collection level read Preference to mapReduce backward compatibility',
    {
      metadata: { requires: { mongodb: '>=2.6.0', topology: ['single', 'ssl'] } },

      // The actual test we wish to run
      test: function(done) {
        var configuration = this.configuration;
        var mongo = configuration.require,
          ReadPreference = mongo.ReadPreference;

        var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
        client.connect(function(err, client) {
          var db = client.db(configuration.db);
          expect(err).to.not.exist;
          // Set read preference
          var collection = db.collection('read_pref_1', {
            readPreference: ReadPreference.SECONDARY_PREFERRED
          });
          // Save checkout function
          var command = client.topology.command;
          // Set up our checker method
          client.topology.command = function() {
            var args = Array.prototype.slice.call(arguments, 0);
            if (args[0] === 'integration_tests.$cmd') {
              test.equal(ReadPreference.SECONDARY_PREFERRED, args[2].readPreference.mode);
            }

            return command.apply(db.serverConfig, args);
          };

          // Map function
          var map = function() {
            emit(this.user_id, 1); // eslint-disable-line
          };

          // Reduce function
          var reduce = function(/* k, vals */) {
            return 1;
          };

          // Perform the map reduce
          collection.mapReduce(map, reduce, { out: 'inline' }, function(/* err */) {
            // expect(err).to.not.exist;
            client.topology.command = command;
            client.close(done);
          });
        });
      }
    }
  );

  /**
   * @ignore
   */
  it('Should fail due to not using mapReduce inline with read preference', {
    metadata: { requires: { mongodb: '>=2.6.0', topology: ['single', 'ssl'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var mongo = configuration.require,
        ReadPreference = mongo.ReadPreference;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        expect(err).to.not.exist;
        // Set read preference
        var collection = db.collection('read_pref_1', {
          readPreference: ReadPreference.SECONDARY_PREFERRED
        });
        // Map function
        var map = function() {
          emit(this.user_id, 1); // eslint-disable-line
        };

        // Reduce function
        var reduce = function(/* k, vals */) {
          return 1;
        };

        // Perform the map reduce
        collection.mapReduce(map, reduce, { out: { append: 'test' } }, function(err) {
          test.notEqual(err, null);
          client.close(done);
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('Should correctly apply collection level read Preference to aggregate', {
    metadata: { requires: { mongodb: '>=2.6.0', topology: ['single', 'ssl'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var mongo = configuration.require,
        ReadPreference = mongo.ReadPreference;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        expect(err).to.not.exist;
        // Set read preference
        var collection = db.collection('read_pref_1', {
          readPreference: ReadPreference.SECONDARY_PREFERRED
        });
        // Save checkout function
        var command = client.topology.command;
        // Set up our checker method
        client.topology.command = function() {
          var args = Array.prototype.slice.call(arguments, 0);
          if (args[0] === 'integration_tests.$cmd') {
            test.equal(ReadPreference.SECONDARY_PREFERRED, args[2].readPreference.mode);
          }

          return command.apply(db.serverConfig, args);
        };

        collection.aggregate(
          [
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
          ],
          function(err, cursor) {
            expect(err).to.not.exist;

            cursor.toArray(function(err) {
              expect(err).to.not.exist;
              client.topology.command = command;

              client.close(done);
            });
          }
        );
      });
    }
  });

  /**
   * @ignore
   */
  it('Should correctly apply collection level read Preference to stats', {
    metadata: { requires: { mongodb: '>=2.6.0', topology: ['single', 'ssl'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var mongo = configuration.require,
        ReadPreference = mongo.ReadPreference;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        expect(err).to.not.exist;
        // Set read preference
        var collection = db.collection('read_pref_1', {
          readPreference: ReadPreference.SECONDARY_PREFERRED
        });
        // Save checkout function
        var command = client.topology.command;
        // Set up our checker method
        client.topology.command = function() {
          var args = Array.prototype.slice.call(arguments, 0);
          if (args[0] === 'integration_tests.$cmd') {
            test.equal(ReadPreference.SECONDARY_PREFERRED, args[2].readPreference.mode);
          }

          return command.apply(db.serverConfig, args);
        };

        // Perform the map reduce
        collection.stats(function(/* err */) {
          // expect(err).to.not.exist;
          client.topology.command = command;
          client.close(done);
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('Should correctly honor the readPreferences at DB and individual command level', {
    metadata: { requires: { mongodb: '>=2.6.0', topology: ['single', 'ssl'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var mongo = configuration.require,
        ReadPreference = mongo.ReadPreference;

      var client = configuration.newClient({ w: 1, readPreference: 'secondary' }, { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        // Save checkout function
        var command = client.topology.command;
        // Set up our checker method
        client.topology.command = function() {
          var args = Array.prototype.slice.call(arguments, 0);
          if (args[0] === 'integration_tests.$cmd') {
            test.equal(ReadPreference.SECONDARY, args[2].readPreference.mode);
          }

          return command.apply(db.serverConfig, args);
        };

        db.command({ dbStats: true }, function(err) {
          expect(err).to.not.exist;

          client.topology.command = function() {
            var args = Array.prototype.slice.call(arguments, 0);
            if (args[0] === 'integration_tests.$cmd') {
              test.equal(ReadPreference.SECONDARY_PREFERRED, args[2].readPreference.mode);
            }

            return command.apply(db.serverConfig, args);
          };

          db.command({ dbStats: true }, { readPreference: 'secondaryPreferred' }, function(err) {
            expect(err).to.not.exist;
            client.topology.command = command;
            client.close(done);
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('Should correctly apply readPreferences specified as objects', {
    metadata: { requires: { mongodb: '>=2.6.0', topology: ['single', 'ssl'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        expect(err).to.not.exist;
        // Create read preference object.
        var mySecondaryPreferred = { mode: 'secondaryPreferred', tags: [] };
        db.command({ dbStats: true }, { readPreference: mySecondaryPreferred }, function(err) {
          expect(err).to.not.exist;
          client.close(done);
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('Should correctly pass readPreferences specified as objects to cursors', {
    metadata: { requires: { mongodb: '>=2.6.0', topology: ['single', 'ssl'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        expect(err).to.not.exist;
        // Create read preference object.
        var mySecondaryPreferred = { mode: 'secondaryPreferred', tags: [] };
        db.listCollections({}, { readPreference: mySecondaryPreferred }).toArray(function(err) {
          expect(err).to.not.exist;
          client.close(done);
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('Should correctly pass readPreferences specified as objects to collection methods', {
    metadata: { requires: { mongodb: '>=2.6.0', topology: ['single', 'ssl'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        expect(err).to.not.exist;
        // Create read preference object.
        var mySecondaryPreferred = { mode: 'secondaryPreferred', tags: [] };
        var cursor = db.collection('test').find({}, { readPreference: mySecondaryPreferred });
        cursor.toArray(function(err) {
          expect(err).to.not.exist;
          client.close(done);
        });
      });
    }
  });

  it('Should correctly pass readPreferences on the Collection to listIndexes', {
    metadata: { requires: { mongodb: '>=2.6.0', topology: ['single', 'ssl'] } },

    test: function(done) {
      var configuration = this.configuration;
      var mongo = configuration.require,
        SecondaryPreferred = mongo.ReadPreference.SECONDARY_PREFERRED;

      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        expect(err).to.not.exist;
        var cursor = db.collection('test', { readPreference: SecondaryPreferred }).listIndexes();
        test.equal(cursor.options.readPreference.mode, 'secondaryPreferred');
        client.close(done);
      });
    }
  });

  it('Should throw an error on an invalid readPreference', function(done) {
    const configuration = this.configuration;

    const client = configuration.newClient();
    client.connect((err, client) => {
      const db = client.db(configuration.db);
      expect(db.collection.bind(db, 'test', { readPreference: 'invalid' })).to.throw(
        'Invalid read preference mode invalid'
      );

      client.close(done);
    });
  });

  context('hedge', function() {
    it('should set hedge using [find option & empty hedge]', {
      metadata: { requires: { mongodb: '>=3.6.0' } },
      test: withMonitoredClient(['find'], function(client, events, done) {
        const rp = new ReadPreference(ReadPreference.SECONDARY, null, { hedge: {} });
        client
          .db(this.configuration.db)
          .collection('test')
          .find({}, { readPreference: rp })
          .toArray(err => {
            expect(err).to.not.exist;
            const expected = { mode: ReadPreference.SECONDARY, hedge: {} };
            expect(events[0])
              .nested.property('command.$readPreference')
              .to.deep.equal(expected);
            done();
          });
      })
    });

    it('should set hedge using [.setReadPreference & empty hedge] ', {
      metadata: { requires: { mongodb: '>=3.6.0' } },
      test: withMonitoredClient(['find'], function(client, events, done) {
        const rp = new ReadPreference(ReadPreference.SECONDARY, null, { hedge: {} });
        client
          .db(this.configuration.db)
          .collection('test')
          .find({})
          .setReadPreference(rp)
          .toArray(err => {
            expect(err).to.not.exist;
            const expected = { mode: ReadPreference.SECONDARY, hedge: {} };
            expect(events[0])
              .nested.property('command.$readPreference')
              .to.deep.equal(expected);
            done();
          });
      })
    });

    it('should set hedge using [.setReadPreference & enabled hedge] ', {
      metadata: { requires: { mongodb: '>=3.6.0' } },
      test: withMonitoredClient(['find'], function(client, events, done) {
        const rp = new ReadPreference(ReadPreference.SECONDARY, null, { hedge: { enabled: true } });
        client
          .db(this.configuration.db)
          .collection('test')
          .find({})
          .setReadPreference(rp)
          .toArray(err => {
            expect(err).to.not.exist;
            const expected = { mode: ReadPreference.SECONDARY, hedge: { enabled: true } };
            expect(events[0])
              .nested.property('command.$readPreference')
              .to.deep.equal(expected);
            done();
          });
      })
    });

    it('should set hedge using [.setReadPreference & disabled hedge] ', {
      metadata: { requires: { mongodb: '>=3.6.0' } },
      test: withMonitoredClient(['find'], function(client, events, done) {
        const rp = new ReadPreference(ReadPreference.SECONDARY, null, {
          hedge: { enabled: false }
        });
        client
          .db(this.configuration.db)
          .collection('test')
          .find({})
          .setReadPreference(rp)
          .toArray(err => {
            expect(err).to.not.exist;
            const expected = { mode: ReadPreference.SECONDARY, hedge: { enabled: false } };
            expect(events[0])
              .nested.property('command.$readPreference')
              .to.deep.equal(expected);
            done();
          });
      })
    });

    it('should set hedge using [.setReadPreference & undefined hedge] ', {
      metadata: { requires: { mongodb: '>=3.6.0' } },
      test: withMonitoredClient(['find'], function(client, events, done) {
        const rp = new ReadPreference(ReadPreference.SECONDARY, null);
        client
          .db(this.configuration.db)
          .collection('test')
          .find({})
          .setReadPreference(rp)
          .toArray(err => {
            expect(err).to.not.exist;
            const expected = { mode: ReadPreference.SECONDARY };
            expect(events[0])
              .nested.property('command.$readPreference')
              .to.deep.equal(expected);
            done();
          });
      })
    });
  });

  context('should enforce fixed primary read preference', function() {
    const collectionName = 'ddl_collection';

    beforeEach(function() {
      const configuration = this.configuration;
      const client = this.configuration.newClient(configuration.writeConcernMax(), {
        useUnifiedTopology: true,
        readPreference: 'primaryPreferred'
      });
      return withClient(client, (client, done) => {
        const db = client.db(configuration.db);
        db.addUser('default', 'pass', { roles: 'readWrite' }, () => {
          db.createCollection('before_collection', () => {
            db.createIndex(collectionName, { aloha: 1 }, done);
          });
        });
      });
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

    Object.keys(methods).forEach(operation => {
      it(`${operation}`, {
        metadata: {
          requires: { topology: ['replicaset', 'sharded'] }
        },
        test: function() {
          const configuration = this.configuration;
          const client = this.configuration.newClient(configuration.writeConcernMax(), {
            useUnifiedTopology: true,
            readPreference: 'primaryPreferred'
          });
          return withClient(client, (client, done) => {
            const db = client.db(configuration.db);
            const args = methods[operation];
            const split = operation.split('#');
            const parentId = split[0];
            const method = split[1];
            const collection = db.collection(collectionName);
            const parent = parentId === 'Collection' ? collection : parentId === 'Db' ? db : null;
            const selectServerSpy = this.sinon.spy(Topology.prototype, 'selectServer');
            const callback = err => {
              expect(err).to.not.exist;
              expect(selectServerSpy.called).to.equal(true);
              if (typeof selectServerSpy.args[0][0] === 'function') {
                expect(selectServerSpy)
                  .nested.property('args[0][1].readPreference.mode')
                  .to.equal(ReadPreference.PRIMARY);
              } else {
                expect(selectServerSpy)
                  .nested.property('args[0][0].readPreference.mode')
                  .to.equal(ReadPreference.PRIMARY);
              }
              done();
            };
            args.push(callback);
            parent[method].apply(parent, args);
          });
        }
      });
    });
  });

  it('should respect readPreference from uri', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>=3.6' } },
    test: withMonitoredClient('find', { queryOptions: { readPreference: 'secondary' } }, function(
      client,
      events,
      done
    ) {
      expect(client.readPreference.mode).to.equal('secondary');
      client
        .db('test')
        .collection('test')
        .findOne({ a: 1 }, err => {
          expect(err).to.not.exist;
          expect(events)
            .to.be.an('array')
            .with.lengthOf(1);
          expect(events[0]).to.containSubset({
            commandName: 'find',
            command: {
              $readPreference: { mode: 'secondary' }
            }
          });
          done();
        });
    })
  });

  describe('Session readPreference', function() {
    let client;
    let session;

    beforeEach(function(done) {
      let configuration = this.configuration;
      client = configuration.newClient(configuration.writeConcernMax(), {
        readPreference: 'primaryPreferred'
      });
      client.connect(err => {
        done(err);
      });
    });

    afterEach(function(done) {
      if (session) {
        session.abortTransaction(() => {
          session.endSession(() => {
            client.close(() => done());
          });
        });
      } else {
        client.close(() => done());
      }
    });

    it('should use session readPreference instead of client readPreference', {
      metadata: { requires: { unifiedTopology: true, topology: ['single', 'replicaset'] } },
      test: function() {
        session = client.startSession({
          defaultTransactionOptions: { readPreference: 'secondary' },
          causalConsistency: true
        });
        session.startTransaction();
        const result = ReadPreference.resolve(client, { session: session });
        expect(result).to.have.property('mode', 'secondary');
      }
    });
  });
});
