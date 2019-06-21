'use strict';
const mongo = require('../..');
const setupDatabase = require('./shared').setupDatabase;
const expect = require('chai').expect;

let client;
let url;
const info = { commands: { started: [], succeeded: [] } };

describe('ReadConcern', function() {
  before(function() {
    return setupDatabase(this.configuration);
  });

  afterEach(() => info.listener.uninstrument());

  beforeEach(function() {
    info.commands = { started: [], succeeded: [] };
    info.listener = mongo.instrument(err => expect(err).to.be.null);
  });

  afterEach(() => client.close());

  const tests = [
    {
      description: 'Should set local readConcern on db level',
      level: 'local',
      commandName: 'find'
    },
    {
      description: 'Should set majority readConcern on db level',
      level: 'majority',
      commandName: 'find'
    },
    {
      description: 'Should set local readConcern at collection level',
      level: 'local',
      commandName: 'find',
      collectionReadConcern: true
    },
    {
      description: 'Should set majority readConcern at collection level',
      level: 'majority',
      commandName: 'find',
      collectionReadConcern: true
    },
    {
      description: 'Should set local readConcern using MongoClient',
      level: 'local',
      commandName: 'find',
      urlReadConcernLevel: 'readConcernLevel=local'
    },
    {
      description: 'Should set majority readConcern using MongoClient',
      level: 'majority',
      commandName: 'find',
      urlReadConcernLevel: 'readConcernLevel=majority'
    },
    {
      description: 'Should set majority readConcern using MongoClient with options',
      level: 'majority',
      commandName: 'find',
      urlOptions: 'majority'
    },
    {
      description: 'Should set majority readConcern aggregate command',
      level: 'majority',
      commandName: 'aggregate'
    },
    {
      description: 'Should set majority readConcern geoSearch command',
      level: 'majority',
      commandName: 'geoSearch'
    }
  ];

  function run_tests(index, commandName, level) {
    expect(info.commands.started).to.have.a.lengthOf(index + 1);
    expect(info.commands.succeeded).to.have.a.lengthOf(index + 1);
    expect(info.commands.started[index]).to.have.property('commandName', commandName);
    expect(info.commands.succeeded[index]).to.have.property('commandName', commandName);
    if (level != null) {
      expect(info.commands.started[index]).to.have.nested.property(
        'command.readConcern.level',
        level
      );
    } else {
      expect(info.commands.started[index].command.readConcern).to.be.undefined;
    }
  }

  tests.forEach(test => {
    it(test.description, {
      metadata: { requires: { topology: 'replicaset', mongodb: '>= 3.2' } },

      test: function(done) {
        // Get a new instance
        const configuration = this.configuration;
        let options;

        if (test.urlReadConcernLevel || test.urlOptions) {
          url = configuration.url();
          if (!test.urlOptions) {
            url =
              url.indexOf('?') !== -1
                ? `${url}&${test.urlReadConcernLevel}`
                : `${url}?${test.urlReadConcernLevel}`;
          } else {
            options = {
              readConcern: {
                level: test.level
              }
            };
          }
        }

        client =
          test.urlOptions != null
            ? configuration.newClient(url, options)
            : configuration.newClient(
                { w: 1 },
                { poolSize: 1, readConcern: { level: test.level } }
              );

        client.connect((err, client) => {
          expect(err).to.not.exist;

          const db = client.db(configuration.db);
          expect(db.s.readConcern).to.deep.equal({ level: test.level });

          // Get a collection
          const collection = test.collectionReadConcern
            ? db.collection('readConcernCollection', {
                readConcern: { level: test.level }
              })
            : db.collection('readConcernCollection');

          // Validate readConcern
          expect(collection.s.readConcern).to.deep.equal({ level: test.level });

          // commandMonitoring / listening to events
          info.listener.on('started', event => {
            if (
              event.commandName === 'find' ||
              event.commandName === 'aggregate' ||
              event.commandName === 'geoSearch'
            ) {
              info.commands.started.push(event);
            }
          });
          info.listener.on('succeeded', event => {
            if (
              event.commandName === 'find' ||
              event.commandName === 'aggregate' ||
              event.commandName === 'geoSearch'
            ) {
              info.commands.succeeded.push(event);
            }
          });

          // Execute find
          if (test.commandName === 'find') {
            collection.find().toArray(err => {
              expect(err).to.not.exist;
              run_tests(0, test.commandName, test.level);
              done();
            });
          } else if (test.commandName === 'aggregate') {
            collection.aggregate([{ $match: {} }]).toArray(err => {
              expect(err).to.not.exist;
              run_tests(0, test.commandName, test.level);
              done();
            });
          } else if (test.commandName === 'geoSearch') {
            collection.ensureIndex({ loc: 'geoHaystack', type: 1 }, { bucketSize: 1 }, err => {
              expect(err).to.not.exist;
              // Save a new location tagged document
              collection.insertMany(
                [{ a: 1, loc: [50, 30] }, { a: 1, loc: [30, 50] }],
                configuration.writeConcernMax(),
                err => {
                  expect(err).to.not.exist;

                  // Use geoHaystackSearch command to find document
                  collection.geoHaystackSearch(
                    50,
                    50,
                    { search: { a: 1 }, limit: 1, maxDistance: 100 },
                    err => {
                      expect(err).to.not.exist;
                      run_tests(0, test.commandName, test.level);
                      done();
                    }
                  );
                }
              );
            });
          }
        });
      }
    });
  });

  const insertTests = [
    {
      description: 'Should set majority readConcern distinct command',
      level: 'majority',
      commandName: 'distinct',
      mongodbVersion: '>= 3.2'
    },
    {
      description: 'Should set majority readConcern count command',
      level: 'majority',
      commandName: 'count',
      mongodbVersion: '>= 3.2'
    },
    {
      description: 'Should set majority readConcern group command',
      level: 'majority',
      commandName: 'group',
      mongodbVersion: '>= 3.2 <=4.1.0'
    },
    {
      description: 'Should set majority readConcern parallelCollectionScan command',
      level: 'majority',
      commandName: 'parallelCollectionScan',
      mongodbVersion: '>= 3.2 <=4.1.0'
    }
  ];

  insertTests.forEach(test => {
    it(test.description, {
      metadata: { requires: { topology: 'replicaset', mongodb: test.mongodbVersion } },

      test: function(done) {
        // Get a new instance
        const configuration = this.configuration;
        client = configuration.newClient(
          { w: 1 },
          { poolSize: 1, readConcern: { level: test.level } }
        );

        client.connect((err, client) => {
          expect(err).to.not.exist;

          const db = client.db(configuration.db);
          expect(db.s.readConcern).to.deep.equal({ level: test.level });

          // Get the collection
          const collection = db.collection('test_distinct_read_concern');

          // Insert documents to perform distinct against
          collection.insertMany(
            [
              { a: 0, b: { c: 'a' } },
              { a: 1, b: { c: 'b' } },
              { a: 1, b: { c: 'c' } },
              { a: 2, b: { c: 'a' } },
              { a: 3 },
              { a: 3 }
            ],
            configuration.writeConcernMax(),
            err => {
              expect(err).to.not.exist;

              // Listen to apm events
              info.listener.on('started', event => {
                if (
                  event.commandName === 'distinct' ||
                  event.commandName === 'count' ||
                  event.commandName === 'group' ||
                  event.commandName === 'parallelCollectionScan'
                ) {
                  info.commands.started.push(event);
                }
              });
              info.listener.on('succeeded', event => {
                if (
                  event.commandName === 'distinct' ||
                  event.commandName === 'count' ||
                  event.commandName === 'group' ||
                  event.commandName === 'parallelCollectionScan'
                ) {
                  info.commands.succeeded.push(event);
                }
              });

              // Perform a distinct query against the a field
              if (test.commandName === 'distinct') {
                collection.distinct('a', err => {
                  expect(err).to.not.exist;
                  run_tests(0, test.commandName, test.level);
                  done();
                });
              } else if (test.commandName === 'count') {
                collection.estimatedDocumentCount({ a: 1 }, err => {
                  expect(err).to.not.exist;
                  run_tests(0, test.commandName, test.level);
                  done();
                });
              } else if (test.commandName === 'group') {
                collection.group(
                  [],
                  {},
                  { count: 0 },
                  'function (obj, prev) { prev.count++; }',
                  err => {
                    expect(err).to.not.exist;
                    run_tests(0, test.commandName, test.level);
                    done();
                  }
                );
              } else if (test.commandName === 'parallelCollectionScan') {
                collection.parallelCollectionScan({ numCursors: 1 }, err => {
                  expect(err).to.not.exist;
                  run_tests(0, test.commandName, test.level);
                  done();
                });
              }
            }
          );
        });
      }
    });
  });

  it('Should set majority readConcern aggregate command but ignore due to out', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>= 3.2 < 4.1' } },

    test: function(done) {
      // Get a new instance
      const configuration = this.configuration;
      client = configuration.newClient(
        { w: 1 },
        { poolSize: 1, readConcern: { level: 'majority' } }
      );

      client.connect((err, client) => {
        expect(err).to.not.exist;

        const db = client.db(configuration.db);
        expect(db.s.readConcern).to.deep.equal({ level: 'majority' });

        // Get a collection
        const collection = db.collection('readConcernCollectionAggregate1');
        // Validate readConcern
        expect(collection.s.readConcern).to.deep.equal({ level: 'majority' });

        // Listen to apm events
        info.listener.on('started', event => {
          if (event.commandName === 'aggregate') info.commands.started.push(event);
        });
        info.listener.on('succeeded', event => {
          if (event.commandName === 'aggregate') info.commands.succeeded.push(event);
        });

        // Execute find
        collection
          .aggregate([{ $match: {} }, { $out: 'readConcernCollectionAggregate1Output' }])
          .toArray(err => {
            expect(err).to.not.exist;
            run_tests(0, 'aggregate');

            // Execute find
            collection
              .aggregate([{ $match: {} }], { out: 'readConcernCollectionAggregate2Output' })
              .toArray(err => {
                expect(err).to.not.exist;
                run_tests(1, 'aggregate');
                done();
              });
          });
      });
    }
  });

  it('Should set majority readConcern aggregate command against server >= 4.1', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>= 4.1' } },

    test: function(done) {
      // Get a new instance
      const configuration = this.configuration;
      client = configuration.newClient(
        { w: 1 },
        { poolSize: 1, readConcern: { level: 'majority' }, monitorCommands: true }
      );

      client
        .connect()
        .then(() => {
          // Get a collection
          const collection = client
            .db(configuration.db)
            .collection('readConcernCollectionAggregate1');

          // Listen to apm events
          client.on('commandStarted', event => {
            if (event.commandName === 'aggregate') info.commands.started.push(event);
          });
          client.on('commandSucceeded', event => {
            if (event.commandName === 'aggregate') info.commands.succeeded.push(event);
          });

          // Execute find
          return collection
            .aggregate([{ $match: {} }, { $out: 'readConcernCollectionAggregate1Output' }])
            .toArray()
            .then(() => {
              run_tests(0, 'aggregate', 'majority');

              // Execute find
              return collection
                .aggregate([{ $match: {} }], { out: 'readConcernCollectionAggregate2Output' })
                .toArray()
                .then(() => {
                  run_tests(1, 'aggregate', 'majority');
                });
            });
        })
        .then(() => client.close(done), e => client.close(() => done(e)));
    }
  });

  it('Should set majority readConcern mapReduce command but be ignored', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>= 3.2' } },

    test: function(done) {
      // Get a new instance
      const configuration = this.configuration;
      client = configuration.newClient(
        { w: 1 },
        { poolSize: 1, readConcern: { level: 'majority' } }
      );

      client.connect((err, client) => {
        expect(err).to.not.exist;

        const db = client.db(configuration.db);
        expect(db.s.readConcern).to.deep.equal({ level: 'majority' });

        // Get the collection
        const collection = db.collection('test_map_reduce_read_concern');
        collection.insertMany(
          [{ user_id: 1 }, { user_id: 2 }],
          configuration.writeConcernMax(),
          err => {
            expect(err).to.not.exist;
            // String functions
            const map = 'function() { emit(this.user_id, 1); }';
            const reduce = 'function(k,vals) { return 1; }';

            // Listen to apm events
            info.listener.on('started', event => {
              if (event.commandName === 'mapreduce') info.commands.started.push(event);
            });
            info.listener.on('succeeded', event => {
              if (event.commandName === 'mapreduce') info.commands.succeeded.push(event);
            });

            // Execute mapReduce
            collection.mapReduce(map, reduce, { out: { replace: 'tempCollection' } }, err => {
              expect(err).to.not.exist;
              run_tests(0, 'mapreduce');
              done();
            });
          }
        );
      });
    }
  });
  it('Should set local readConcern on db level when using createCollection method', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>= 3.2' } },

    test: function(done) {
      // Get a new instance
      const configuration = this.configuration;
      const client = configuration.newClient(
        { w: 1 },
        { poolSize: 1, readConcern: { level: 'local' } }
      );
      client.connect((err, client) => {
        expect(err).to.not.exist;
        const db = client.db(configuration.db);
        expect(db.s.readConcern).to.deep.equal({ level: 'local' });

        // Get a collection using createCollection
        db.createCollection('readConcernCollection', (err, collection) => {
          // Validate readConcern
          expect(collection.s.readConcern).to.deep.equal({ level: 'local' });
          client.close(done);
        });
      });
    }
  });
});
