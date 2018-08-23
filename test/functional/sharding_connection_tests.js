'use strict';

var co = require('co');
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
      var url = f(
        'mongodb://%s:%s,%s:%s/sharded_test_db?w=1&readPreference=secondaryPreferred&readPreferenceTags=sf%3A1&readPreferenceTags=',
        configuration.host,
        configuration.port,
        configuration.host,
        configuration.port + 1
      );

      const client = configuration.newClient(url, {
        mongos: {
          haInterval: 500
        }
      });

      client.connect(function(err, client) {
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
      });
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
      var url = f(
        'mongodb://%s:%s,%s:%s,localhost:50002/sharded_test_db?w=1',
        configuration.host,
        configuration.port,
        configuration.host,
        configuration.port + 1
      );

      const client = configuration.newClient(url);
      client.connect(function(err, client) {
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
      var url = f(
        'mongodb://%s:%s,%s:%s/sharded_test_db?w=1&readPreference=secondaryPreferred&readPreferenceTags=sf%3A1&readPreferenceTags=',
        configuration.host,
        configuration.port,
        configuration.host,
        configuration.port + 1
      );

      const client = configuration.newClient(url, { mongos: { haInterval: 500 } });
      client.connect(function(err, client) {
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
      });
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
      var url = f(
        'mongodb://%s:%s,%s:%s/sharded_test_db?w=1&readPreference=secondaryPreferred&readPreferenceTags=sf%3A1&readPreferenceTags=',
        configuration.host,
        configuration.port,
        configuration.host,
        configuration.port + 1
      );

      const client = configuration.newClient(url, { reconnectTries: 10 });
      client.connect(function(err, client) {
        test.equal(null, err);
        test.ok(client != null);

        var servers = client.topology.s.coreTopology.connectedProxies;
        for (var i = 0; i < servers.length; i++) {
          test.equal(10, servers[i].s.pool.options.reconnectTries);
        }

        client.close();
        done();
      });
    }
  });

  /**
   * @ignore
   */
  it('Should emit close event when mongos is stopped', {
    metadata: { requires: { topology: 'sharded' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var manager = configuration.manager;
      var mongos = manager.proxies;

      co(function*() {
        var url = f(
          'mongodb://%s:%s,%s:%s/sharded_test_db',
          configuration.host,
          configuration.port,
          configuration.host,
          configuration.port + 1
        );

        const client = configuration.newClient(url);
        yield client.connect();

        var doc = { answer: 42 };
        var db = client.db('Test');
        var coll = db.collection('docs');
        yield coll.insertOne(doc);

        doc = yield coll.findOne({ answer: 42 });
        test.ok(!!doc);

        var waitForClose = new Promise(resolve => db.once('close', resolve));

        yield mongos.map(p => p.stop());
        yield waitForClose;
        yield mongos.map(p => p.start());

        doc = yield coll.findOne({ answer: 42 });
        test.ok(!!doc);

        waitForClose = new Promise(resolve => db.once('close', resolve));

        yield mongos.map(p => p.stop());
        yield waitForClose;
        yield mongos.map(p => p.start());

        doc = yield coll.findOne({ answer: 42 });
        test.ok(!!doc);
      }).then(() => done(), done);
    }
  });
});
