'use strict';
const setupDatabase = require('./shared').setupDatabase;
const expect = require('chai').expect;
const { MongoClient, ReadPreference, Logger } = require('../../src');

describe('Sharding (Read Preference)', function () {
  before(function () {
    return setupDatabase(this.configuration);
  });

  it.skip('Should correctly perform a Mongos secondary read using the read preferences', {
    metadata: { requires: { topology: 'sharded' } },

    test: function (done) {
      // NOTE: this test is skipped because it directly mucks with the connection string, which isn't
      // guaranteed to be present with mongo-orchestration. This behavior should be unit tested.

      const configuration = this.configuration;
      const host = configuration.host;
      const port = configuration.port;

      const url = `mongodb://${host}:${port}/sharded_test_db?w=1`;
      // Connect using the mongos connections
      var client = new MongoClient(url, { w: 0, monitorCommands: true });
      client.connect(function (err) {
        expect(err).to.not.exist;
        const db = client.db(configuration.db);

        // Perform a simple insert into a collection
        const collection = db.collection('shard_test1');
        // Insert a simple doc
        collection.insertOne({ test: 1 }, { w: 'majority', wtimeout: 10000 }, function (err) {
          expect(err).to.not.exist;

          // Set debug level for the driver
          Logger.setLevel('debug');

          let gotMessage = false;

          // Get the current logger
          Logger.setCurrentLogger(function (message, options) {
            if (
              options.type === 'debug' &&
              options.className === 'Cursor' &&
              options.message.indexOf('"mode":"secondary"') !== -1
            ) {
              gotMessage = true;
            }
          });

          collection.findOne(
            { test: 1 },
            { readPreference: new ReadPreference(ReadPreference.SECONDARY) },
            function (err, item) {
              expect(err).to.not.exist;
              expect(item).to.exist.and.to.have.property('test', 1);
              expect(gotMessage).to.equal(true);

              // Set error level for the driver
              Logger.setLevel('error');
              // Close db connection
              client.close(done);
            }
          );
        });
      });
    }
  });

  it('Should fail a Mongos secondary read using the read preference and tags that dont exist', {
    metadata: { requires: { topology: 'sharded' } },

    test: function (done) {
      const configuration = this.configuration;
      const host = configuration.host;
      const port = configuration.port;

      const url = `mongodb://${host}:${port}/sharded_test_db?w=1`;
      // Connect using the mongos connections
      const client = new MongoClient(url, { w: 0 });
      client.connect(function (err) {
        expect(err).to.not.exist;
        const db = client.db(configuration.db);

        // Perform a simple insert into a collection
        const collection = db.collection('shard_test3');
        // Insert a simple doc
        collection.insertOne({ test: 1 }, { w: 'majority', wtimeout: 10000 }, function (err) {
          expect(err).to.not.exist;

          // Set debug level for the driver
          Logger.setLevel('debug');

          let gotMessage = false;
          // Get the current logger
          Logger.setCurrentLogger(function (message, options) {
            if (
              options.type === 'debug' &&
              options.className === 'Cursor' &&
              options.message.indexOf(
                '{"mode":"secondary","tags":[{"dc":"sf","s":"1"},{"dc":"ma","s":"2"}]}'
              ) !== -1
            ) {
              gotMessage = true;
            }
          });

          collection.findOne(
            { test: 1 },
            {
              readPreference: new ReadPreference(ReadPreference.SECONDARY, [
                { dc: 'sf', s: '1' },
                { dc: 'ma', s: '2' }
              ])
            },
            function (err) {
              expect(err).to.exist;
              expect(gotMessage).to.equal(true);
              // Set error level for the driver
              Logger.setLevel('error');
              // Close db connection
              client.close(done);
            }
          );
        });
      });
    }
  });

  it.skip('Should correctly read from a tagged secondary using Mongos', {
    // NOTE: skipped because mongo-orchestration will not set up these tags
    metadata: { requires: { topology: 'sharded' } },

    test: function (done) {
      const configuration = this.configuration;
      // Set up mongos connection

      // Connect using the mongos connections
      const client = new MongoClient(configuration.url(), { w: 0 });
      client.connect(function (err) {
        expect(err).to.not.exist;
        const db = client.db(configuration.db);

        // Perform a simple insert into a collection
        const collection = db.collection('shard_test4');
        // Insert a simple doc
        collection.insertOne({ test: 1 }, { w: 'majority', wtimeout: 10000 }, function (err) {
          expect(err).to.not.exist;

          // Set debug level for the driver
          Logger.setLevel('debug');

          let gotMessage = false;
          // Get the current logger
          Logger.setCurrentLogger(function (message, options) {
            if (
              options.type === 'debug' &&
              options.className === 'Cursor' &&
              options.message.indexOf('{"mode":"secondary","tags":[{"loc":"ny"},{"loc":"sf"}]}') !==
                -1
            ) {
              gotMessage = true;
            }
          });

          collection.findOne(
            { test: 1 },
            {
              readPreference: new ReadPreference(ReadPreference.SECONDARY, [
                { loc: 'ny' },
                { loc: 'sf' }
              ])
            },
            function (err, item) {
              expect(err).to.not.exist;
              expect(item).to.exist.and.to.have.a.property('test', 1);
              expect(gotMessage).to.equal(true);
              // Set error level for the driver
              Logger.setLevel('error');
              // Close db connection
              client.close(done);
            }
          );
        });
      });
    }
  });

  it('shouldCorrectlyEmitOpenEvent', {
    metadata: { requires: { topology: 'sharded' } },

    test: function (done) {
      const configuration = this.configuration;

      let openCalled = false;

      const client = new MongoClient(configuration.url(), { w: 0 });
      client.once('open', () => (openCalled = true));

      client.connect(function (err, client) {
        expect(err).to.not.exist;
        expect(client).to.exist;
        expect(openCalled).to.equal(true);

        client.close(done);
      });
    }
  });

  it('Should correctly apply readPreference when performing inline mapReduce', {
    metadata: { requires: { topology: 'sharded' } },

    test: function (done) {
      const configuration = this.configuration;

      // Connect using the mongos connections
      const client = new MongoClient(configuration.url());
      client.connect(function (err) {
        expect(err).to.not.exist;
        const db = client.db(configuration.db);

        // Get the collection
        const col = db.collection('items');
        // Insert some items
        col.insertMany([{ a: 1 }, { a: 2 }, { a: 3 }], function (err) {
          expect(err).to.not.exist;

          client.db('admin').command({ enableSharding: 'integration_test_2' }, function (err) {
            expect(err).to.not.exist;

            col.createIndex({ _id: 'hashed' }, function (err) {
              expect(err).to.not.exist;

              client.db('admin').command(
                {
                  shardCollection: 'integration_test_2.items',
                  key: { _id: 'hashed' }
                },
                function (err) {
                  expect(err).to.not.exist;

                  var map = function () {
                    emit(this._id, this._id); // eslint-disable-line
                  };

                  var reduce = function () {
                    return 123;
                  };

                  col.mapReduce(
                    map,
                    reduce,
                    {
                      out: {
                        inline: 1
                      },
                      readPreference: ReadPreference.SECONDARY_PREFERRED
                    },
                    function (err, r) {
                      expect(err).to.not.exist;
                      expect(r).to.have.a.lengthOf(3);
                      client.close(done);
                    }
                  );
                }
              );
            });
          });
        });
      });
    }
  });
});
