'use strict';

var f = require('util').format;
var test = require('./shared').assert;
var setupDatabase = require('./shared').setupDatabase;

// NOTE: these tests should be converted to use the mock server, no use in running
//       incredibly long integration tests
describe.skip('Sharding (Failover)', function() {
  before(function() {
    return setupDatabase(this.configuration);
  });

  /**
   * @ignore
   */
  it('Should correctly connect and then handle a mongos failure', {
    metadata: { requires: { topology: 'sharded' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var MongoClient = configuration.require.MongoClient;

      var manager = configuration.manager;
      var url = f(
        'mongodb://%s:%s,%s:%s/sharded_test_db?w=1',
        configuration.host,
        configuration.port,
        configuration.host,
        configuration.port + 1
      );

      MongoClient.connect(url, {}, function(err, client) {
        test.equal(null, err);
        var db = client.db(configuration.db);

        db
          .collection('replicaset_mongo_client_collection')
          .update({ a: 1 }, { b: 1 }, { upsert: true }, function(err, result) {
            test.equal(null, err);
            test.equal(1, result.result.n);
            var numberOfTicks = 10;

            var ticker = function() {
              numberOfTicks = numberOfTicks - 1;

              db.collection('replicaset_mongo_client_collection').findOne(function(err) {
                test.equal(null, err);
                if (numberOfTicks === 0) {
                  mongos.start().then(function() {
                    client.close();
                    done();
                  });
                } else {
                  setTimeout(ticker, 1000);
                }
              });
            };

            // Get first proxy
            var mongos = manager.proxies[0];
            mongos.stop().then(function() {
              setTimeout(ticker, 1000);
            });
          });
      });
    }
  });

  /**
   * @ignore
   */
  it('shouldCorrectlyConnectToMongoSShardedSetupAndKillTheMongoSProxy', {
    metadata: { requires: { topology: 'sharded' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var Mongos = configuration.require.Mongos,
        MongoClient = configuration.require.MongoClient,
        Server = configuration.require.Server;

      var manager = configuration.manager;
      // Set up mongos connection
      var mongos = new Mongos(
        [
          new Server(configuration.host, configuration.port, { auto_reconnect: true }),
          new Server(configuration.host, configuration.port + 1, { auto_reconnect: true })
        ],
        { ha: true, haInterval: 500, poolSize: 1 }
      );

      // Counters to track emitting of events
      var numberOfJoins = 0;
      var numberLeaving = 0;

      // Add some listeners
      mongos.on('left', function() {
        numberLeaving += 1;
      });

      mongos.on('joined', function() {
        numberOfJoins += 1;
      });

      // Connect using the mongos connections
      var client = new MongoClient(mongos, { w: 0 });
      client.connect(function(err, client) {
        test.equal(null, err);
        var db = client.db(configuration.db);

        // Perform a simple insert into a collection
        var collection = db.collection('shard_test2');
        // Insert a simple doc
        collection.insert({ test: 1 }, { w: 1 }, function(err) {
          test.equal(null, err);

          // Server managers
          var proxies = manager.proxies;

          // Kill the mongos proxy
          proxies[0].stop().then(function() {
            // Attempt another insert
            collection.insert({ test: 2 }, { w: 1 }, function(err) {
              test.equal(null, err);
              test.equal(1, mongos.connections().length);

              // Restart the other mongos
              proxies[0].start().then(function() {
                // Wait for the ha process to pick up the existing new server
                setTimeout(function() {
                  test.equal(2, mongos.connections().length);
                  global.debug = false;
                  // // Kill the mongos proxy
                  // manager.remove('mongos', {index: 1}, function(err, serverDetails2) {
                  proxies[1].stop().then(function() {
                    // Attempt another insert
                    collection.insert({ test: 3 }, { w: 1 }, function(err) {
                      test.equal(null, err);
                      global.debug = false;
                      test.equal(1, mongos.connections().length);

                      // Restart the other mongos
                      proxies[1].start().then(function() {
                        // Wait for the ha process to pick up the existing new server
                        setTimeout(function() {
                          // Kill the mongos proxy
                          proxies[1].stop().then(function() {
                            // Attempt another insert
                            collection.insert({ test: 4 }, { w: 1 }, function(err) {
                              test.equal(null, err);
                              test.equal(1, mongos.connections().length);

                              // manager.add(serverDetails3, function(err, result) {
                              proxies[1].start().then(function() {
                                // Wait for the ha process to pick up the existing new server
                                setTimeout(function() {
                                  test.equal(2, mongos.connections().length);
                                  test.equal(5, numberOfJoins);
                                  test.equal(3, numberLeaving);
                                  client.close();
                                  done();
                                }, 10000);
                              });
                            });
                          });
                        }, 10000);
                      });
                    });
                  });
                }, 10000);
              });
            });
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('Should correctly connect and emit a reconnect event after mongos failover', {
    metadata: { requires: { topology: 'sharded' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var MongoClient = configuration.require.MongoClient;

      var manager = configuration.manager;
      var url = f(
        'mongodb://%s:%s,%s:%s/sharded_test_db?w=1',
        configuration.host,
        configuration.port,
        configuration.host,
        configuration.port + 1
      );

      MongoClient.connect(url, {}, function(err, client) {
        test.equal(null, err);
        test.ok(client != null);
        var db = client.db(configuration.db);

        var reconnectCalled = false;
        // Add listener to the serverConfig
        client.topology.on('reconnect', function() {
          reconnectCalled = true;
        });

        // Server managers
        var proxies = manager.proxies;

        // Kill the mongos proxy
        proxies[0].stop().then(function() {
          // Kill the mongos proxy
          proxies[1].stop().then(function() {
            // Cause an insert to be buffered
            db.collection('replicaset_mongo_client_collection').insert({ c: 1 }, function() {});

            // Kill the mongos proxy
            proxies[0].start().then(function() {
              // Kill the mongos proxy
              proxies[1].start().then(function() {
                db.collection('replicaset_mongo_client_collection').insert({ c: 1 }, function(err) {
                  test.equal(null, err);
                  test.ok(reconnectCalled);
                  client.close();
                  done();
                });
              });
            });
          });
        });
      });
    }
  });
});
