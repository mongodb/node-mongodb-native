'use strict';
var f = require('util').format;
var test = require('./shared').assert;
var setupDatabase = require('./shared').setupDatabase;

describe('Sharding (Connection)', function() {
  before(function() {
    return setupDatabase(this.configuration);
  });

  /**
   * @ignore
   */
  it('Should connect to mongos proxies using connectiong string and options', {
    metadata: { requires: { topology: 'sharded' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var MongoClient = configuration.require.MongoClient;

      var url = f(
        'mongodb://%s:%s,%s:%s/sharded_test_db?w=1&readPreference=secondaryPreferred&readPreferenceTags=sf%3A1&readPreferenceTags=',
        configuration.host,
        configuration.port,
        configuration.host,
        configuration.port + 1
      );
      MongoClient.connect(
        url,
        {
          mongos: {
            haInterval: 500
          }
        },
        function(err, client) {
          test.equal(null, err);
          test.equal(500, client.topology.haInterval);
          var db = client.db(configuration.db);

          db
            .collection('replicaset_mongo_client_collection')
            .update({ a: 1 }, { b: 1 }, { upsert: true }, function(err, result) {
              test.equal(null, err);
              test.equal(1, result.result.n);

              // Perform fetch of document
              db.collection('replicaset_mongo_client_collection').findOne(function(err) {
                test.equal(null, err);

                client.close();
                done();
              });
            });
        }
      );
    }
  });

  /**
   * @ignore
   */
  it('Should correctly connect with a missing mongos', {
    metadata: { requires: { topology: 'sharded' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var MongoClient = configuration.require.MongoClient;

      var url = f(
        'mongodb://%s:%s,%s:%s,localhost:50002/sharded_test_db?w=1',
        configuration.host,
        configuration.port,
        configuration.host,
        configuration.port + 1
      );

      MongoClient.connect(url, {}, function(err, client) {
        setTimeout(function() {
          test.equal(null, err);
          client.close();
          done();
        }, 2000);
      });
    }
  });

  /**
   * @ignore
   */
  it('Should exercise all options on mongos topology', {
    metadata: { requires: { topology: 'sharded' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var MongoClient = configuration.require.MongoClient;

      var url = f(
        'mongodb://%s:%s,%s:%s/sharded_test_db?w=1&readPreference=secondaryPreferred&readPreferenceTags=sf%3A1&readPreferenceTags=',
        configuration.host,
        configuration.port,
        configuration.host,
        configuration.port + 1
      );
      MongoClient.connect(
        url,
        {
          mongos: {
            haInterval: 500
          }
        },
        function(err, client) {
          test.equal(null, err);
          test.equal(500, client.topology.haInterval);
          test.ok(client.topology.capabilities() != null);
          test.equal(true, client.topology.isConnected());
          test.ok(client.topology.lastIsMaster() != null);
          test.ok(client.topology.connections() != null);
          test.ok(client.topology.isMasterDoc != null);
          test.ok(client.topology.bson != null);

          client.close();
          done();
        }
      );
    }
  });

  /**
   * @ignore
   */
  it('Should correctly modify the server reconnectTries for all sharded proxy instances', {
    metadata: { requires: { topology: 'sharded' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var mongo = configuration.require,
        MongoClient = mongo.MongoClient;

      var url = f(
        'mongodb://%s:%s,%s:%s/sharded_test_db?w=1&readPreference=secondaryPreferred&readPreferenceTags=sf%3A1&readPreferenceTags=',
        configuration.host,
        configuration.port,
        configuration.host,
        configuration.port + 1
      );

      MongoClient.connect(
        url,
        {
          reconnectTries: 10
        },
        function(err, client) {
          test.equal(null, err);
          test.ok(client != null);

          var servers = client.topology.s.coreTopology.connectedProxies;
          for (var i = 0; i < servers.length; i++) {
            test.equal(10, servers[i].s.pool.options.reconnectTries);
          }

          client.close();
          done();
        }
      );
    }
  });
});
