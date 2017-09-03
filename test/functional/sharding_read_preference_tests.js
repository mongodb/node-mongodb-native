'use strict';
var test = require('./shared').assert;
var setupDatabase = require('./shared').setupDatabase;

describe('Sharding (Read Preference)', function() {
  before(function() {
    return setupDatabase(this.configuration);
  });

  /**
   * @ignore
   */
  it('Should correctly perform a Mongos secondary read using the read preferences', {
    metadata: { requires: { topology: 'sharded' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var Mongos = configuration.require.Mongos,
        Server = configuration.require.Server,
        MongoClient = configuration.require.MongoClient,
        Logger = configuration.require.Logger,
        ReadPreference = configuration.require.ReadPreference;
      // Set up mongos connection
      var mongos = new Mongos([
        new Server(configuration.host, configuration.port, { auto_reconnect: true }),
        new Server(configuration.host, configuration.port + 1, { auto_reconnect: true })
      ]);

      // Connect using the mongos connections
      var client = new MongoClient(mongos, { w: 0 });
      client.connect(function(err, client) {
        test.equal(null, err);
        var db = client.db(configuration.db);

        // Perform a simple insert into a collection
        var collection = db.collection('shard_test1');
        // Insert a simple doc
        collection.insert({ test: 1 }, { w: 'majority', wtimeout: 10000 }, function(err) {
          test.equal(null, err);

          // Set debug level for the driver
          Logger.setLevel('debug');

          // Get the current logger
          Logger.setCurrentLogger(function(message, options) {
            if (
              options.type == 'debug' &&
              options.className == 'Cursor' &&
              options.message.indexOf('"mode":"secondary"') != -1
            ) {
              done();
            }
          });

          collection.findOne(
            { test: 1 },
            {},
            { readPreference: new ReadPreference(ReadPreference.SECONDARY) },
            function(err, item) {
              test.equal(null, err);
              test.equal(1, item.test);

              // Set error level for the driver
              Logger.setLevel('error');
              // Close db connection
              client.close();
            }
          );
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('Should correctly fail a Mongos read using a unsupported read preference', {
    metadata: { requires: { topology: 'sharded' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var Mongos = configuration.require.Mongos,
        MongoClient = configuration.require.MongoClient,
        Server = configuration.require.Server,
        Logger = configuration.require.Logger,
        ReadPreference = configuration.require.ReadPreference;
      // Set up mongos connection
      var mongos = new Mongos([
        new Server(configuration.host, configuration.port, { auto_reconnect: true }),
        new Server(configuration.host, configuration.port + 1, { auto_reconnect: true })
      ]);

      // Connect using the mongos connections
      var client = new MongoClient(mongos, { w: 0 });
      client.connect(function(err, client) {
        test.equal(null, err);
        var db = client.db(configuration.db);

        // Perform a simple insert into a collection
        var collection = db.collection('shard_test2');
        // Insert a simple doc
        collection.insert({ test: 1 }, { w: 'majority', wtimeout: 10000 }, function(err) {
          test.equal(null, err);

          // Set debug level for the driver
          Logger.setLevel('debug');

          // Get the current logger
          Logger.setCurrentLogger(function(message, options) {
            if (
              options.type == 'debug' &&
              options.className == 'Cursor' &&
              options.message.indexOf('"mode":"notsupported"') != -1
            ) {
              done();
            }
          });

          collection.findOne(
            { test: 1 },
            {},
            { readPreference: new ReadPreference('notsupported') },
            function(err) {
              test.ok(err != null);

              // Set error level for the driver
              Logger.setLevel('error');
              // Close db connection
              client.close();
            }
          );
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('Should fail a Mongos secondary read using the read preference and tags that dont exist', {
    metadata: { requires: { topology: 'sharded' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var Mongos = configuration.require.Mongos,
        MongoClient = configuration.require.MongoClient,
        Server = configuration.require.Server,
        Logger = configuration.require.Logger,
        ReadPreference = configuration.require.ReadPreference;
      // Set up mongos connection
      var mongos = new Mongos([
        new Server(configuration.host, configuration.port, { auto_reconnect: true }),
        new Server(configuration.host, configuration.port + 1, { auto_reconnect: true })
      ]);

      // Connect using the mongos connections
      var client = new MongoClient(mongos, { w: 0 });
      client.connect(function(err, client) {
        test.equal(null, err);
        var db = client.db(configuration.db);

        // Perform a simple insert into a collection
        var collection = db.collection('shard_test3');
        // Insert a simple doc
        collection.insert({ test: 1 }, { w: 'majority', wtimeout: 10000 }, function(err) {
          test.equal(null, err);

          // Set debug level for the driver
          Logger.setLevel('debug');

          // Get the current logger
          Logger.setCurrentLogger(function(message, options) {
            if (
              options.type == 'debug' &&
              options.className == 'Cursor' &&
              options.message.indexOf(
                '{"mode":"secondary","tags":[{"dc":"sf","s":"1"},{"dc":"ma","s":"2"}]}'
              ) != -1
            ) {
              done();
            }
          });

          collection.findOne(
            { test: 1 },
            {},
            {
              readPreference: new ReadPreference(ReadPreference.SECONDARY, [
                { dc: 'sf', s: '1' },
                { dc: 'ma', s: '2' }
              ])
            },
            function(err) {
              test.ok(err != null);
              // Set error level for the driver
              Logger.setLevel('error');
              // Close db connection
              client.close();
            }
          );
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('Should correctly read from a tagged secondary using Mongos', {
    metadata: { requires: { topology: 'sharded' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var Mongos = configuration.require.Mongos,
        MongoClient = configuration.require.MongoClient,
        Server = configuration.require.Server,
        Logger = configuration.require.Logger,
        ReadPreference = configuration.require.ReadPreference;
      // Set up mongos connection
      var mongos = new Mongos([
        new Server(configuration.host, configuration.port, { auto_reconnect: true }),
        new Server(configuration.host, configuration.port + 1, { auto_reconnect: true })
      ]);

      // Connect using the mongos connections
      var client = new MongoClient(mongos, { w: 0 });
      client.connect(function(err, client) {
        test.equal(null, err);
        var db = client.db(configuration.db);

        // Perform a simple insert into a collection
        var collection = db.collection('shard_test4');
        // Insert a simple doc
        collection.insert({ test: 1 }, { w: 'majority', wtimeout: 10000 }, function(err) {
          test.equal(null, err);

          // Set debug level for the driver
          Logger.setLevel('debug');

          // Get the current logger
          Logger.setCurrentLogger(function(message, options) {
            if (
              options.type == 'debug' &&
              options.className == 'Cursor' &&
              options.message.indexOf('{"mode":"secondary","tags":[{"loc":"ny"},{"loc":"sf"}]}') !==
                -1
            ) {
              done();
            }
          });

          collection.findOne(
            { test: 1 },
            {},
            {
              readPreference: new ReadPreference(ReadPreference.SECONDARY, [
                { loc: 'ny' },
                { loc: 'sf' }
              ])
            },
            function(err, item) {
              test.equal(null, err);
              test.equal(1, item.test);
              // Set error level for the driver
              Logger.setLevel('error');
              // Close db connection
              client.close();
            }
          );
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('Should correctly connect to MongoS using single server instance', {
    metadata: { requires: { topology: 'sharded' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var MongoClient = configuration.require.MongoClient,
        Server = configuration.require.Server,
        ReadPreference = configuration.require.ReadPreference;

      var mongos = new Server(configuration.host, configuration.port, { auto_reconnect: true });
      // Connect using the mongos connections
      var client = new MongoClient(mongos, { w: 0 });
      client.connect(function(err, client) {
        test.equal(null, err);
        var db = client.db(configuration.db);

        // Perform a simple insert into a collection
        var collection = db.collection('shard_test5');
        // Insert a simple doc
        collection.insert({ test: 1 }, { w: 'majority', wtimeout: 10000 }, function(err) {
          test.equal(null, err);

          collection.findOne(
            { test: 1 },
            {},
            { readPreference: new ReadPreference(ReadPreference.SECONDARY) },
            function(err, item) {
              test.equal(null, err);
              test.equal(1, item.test);

              client.close();
              done();
            }
          );
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('Should correctly connect to the mongos using Server connection', {
    metadata: { requires: { topology: 'sharded' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var MongoClient = configuration.require.MongoClient,
        Server = configuration.require.Server;

      // Connect using the mongos connections
      var client = new MongoClient(new Server(configuration.host, configuration.port), { w: 0 });
      client.connect(function(err, client) {
        test.equal(null, err);
        var db = client.db(configuration.db);

        db.createCollection('GabeTest', function(e) {
          test.equal(null, e);

          client.close();
          done();
        });
      });
    }
  });

  /**
   *
   * @ignore
   */
  it('shouldCorrectlyEmitOpenEvent', {
    metadata: { requires: { topology: 'sharded' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var Mongos = configuration.require.Mongos,
        MongoClient = configuration.require.MongoClient,
        Server = configuration.require.Server;

      // Set up mongos connection
      var mongos = new Mongos([
        new Server(configuration.host, configuration.port, { auto_reconnect: true }),
        new Server(configuration.host, configuration.port + 1, { auto_reconnect: true })
      ]);

      var openCalled = false;
      // Connect using the mongos connections
      var client = new MongoClient(mongos, { w: 0 });
      client.once('open', function(_err) {
        test.equal(null, _err);
        openCalled = true;
      });

      client.connect(function(err, client) {
        test.equal(null, err);
        test.ok(client != null);
        test.equal(true, openCalled);

        client.close();
        done();
      });
    }
  });

  /**
   *
   * @ignore
   */
  it('Should correctly apply readPreference when performing inline mapReduce', {
    metadata: { requires: { topology: 'sharded' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var Mongos = configuration.require.Mongos,
        MongoClient = configuration.require.MongoClient,
        Server = configuration.require.Server,
        ReadPreference = configuration.require.ReadPreference;

      // Set up mongos connection
      var mongos = new Mongos([
        new Server(configuration.host, configuration.port, { auto_reconnect: true })
        // new Server(configuration.host, configuration.port + 1, { auto_reconnect: true })
      ]);

      // Connect using the mongos connections
      new MongoClient(mongos).connect(function(err, client) {
        test.equal(null, err);
        var db = client.db(configuration.db);

        // Get the collection
        var col = db.collection('items');
        // Insert some items
        col.insertMany([{ a: 1 }, { a: 2 }, { a: 3 }], function(err) {
          test.equal(null, err);

          client.db('admin').command({ enableSharding: 'integration_test_2' }, function(err) {
            test.equal(null, err);

            col.createIndex({ _id: 'hashed' }, function(err) {
              test.equal(null, err);

              client.db('admin').command({
                shardCollection: 'integration_test_2.items',
                key: { _id: 'hashed' }
              }, function(err) {
                test.equal(null, err);

                var map = function() {
                  emit(this._id, this._id); // eslint-disable-line
                };

                var reduce = function(key, values) {  // eslint-disable-line
                  // eslint-disable-line
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
                  function(err, r) {
                    test.equal(null, err);
                    test.equal(3, r.length);
                    client.close();
                    done();
                  }
                );
              });
            });
          });
        });
      });
    }
  });
});
