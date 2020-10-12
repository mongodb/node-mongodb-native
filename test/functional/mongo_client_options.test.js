'use strict';
const test = require('./shared').assert;
const setupDatabase = require('./shared').setupDatabase;
const expect = require('chai').expect;
const MongoClient = require('../../lib/mongo_client');

describe('MongoClient Options', function() {
  before(function() {
    return setupDatabase(this.configuration);
  });

  /**
   * @ignore
   */
  it('pass in server and db top level options', {
    metadata: { requires: { topology: 'single' } },

    // The actual test we wish to run
    test: function(done) {
      const configuration = this.configuration;
      if (configuration.usingUnifiedTopology()) {
        // skipped for direct legacy variable inspection
        return this.skip();
      }

      const client = configuration.newClient(configuration.url(), {
        autoReconnect: true,
        poolSize: 4
      });

      client.connect(
        connectionTester(configuration, 'testConnectServerOptions', function(client) {
          test.ok(client.topology.poolSize >= 1);
          test.equal(4, client.topology.s.coreTopology.s.pool.size);
          test.equal(true, client.topology.autoReconnect);
          client.close(done);
        })
      );
    }
  });

  /**
   * @ignore
   */
  it('pass in server and db top level options', {
    metadata: { requires: { topology: 'single' } },

    // The actual test we wish to run
    test: function(done) {
      const configuration = this.configuration;
      if (configuration.usingUnifiedTopology()) {
        // skipped for direct legacy variable inspection
        return this.skip();
      }

      const client = configuration.newClient(configuration.url(), {
        autoReconnect: true,
        poolSize: 4
      });

      client.connect(
        connectionTester(configuration, 'testConnectServerOptions', function(client) {
          test.ok(client.topology.poolSize >= 1);
          test.equal(4, client.topology.s.coreTopology.s.pool.size);
          test.equal(true, client.topology.autoReconnect);
          client.close(done);
        })
      );
    }
  });

  /**
   * @ignore
   */
  it('should error on unexpected options', {
    metadata: { requires: { topology: 'single' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var connect = configuration.require;

      connect(
        configuration.url(),
        {
          autoReconnect: true,
          poolSize: 4,
          notlegal: {},
          validateOptions: true
        },
        function(err, client) {
          test.ok(err.message.indexOf('option notlegal is not supported') !== -1);
          expect(client).to.not.exist;
          done();
        }
      );
    }
  });

  it('should default socketTimeout to infinity', function(done) {
    const client = new MongoClient(this.configuration.url());
    client.connect(() => {
      expect(client.s.options.socketTimeoutMS).to.deep.equal(0);
      for (const connection of client.topology.s.coreTopology.connections()) {
        expect(connection.socketTimeout).to.deep.equal(0);
      }
      done();
    });
  });

  /**
   * @ignore
   */
  function connectionTester(configuration, testName, callback) {
    return function(err, client) {
      test.equal(err, null);
      var db = client.db(configuration.db);

      db.collection(testName, function(err, collection) {
        test.equal(err, null);

        collection.insert({ foo: 123 }, { w: 1 }, function(err) {
          test.equal(err, null);
          db.dropDatabase(function(err, dropped) {
            test.equal(err, null);
            test.ok(dropped);
            if (callback) return callback(client);
          });
        });
      });
    };
  }
});
