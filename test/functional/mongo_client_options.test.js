'use strict';
const test = require('./shared').assert;
const setupDatabase = require('./shared').setupDatabase;
const expect = require('chai').expect;

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
    const client = this.configuration.newClient();
    client.connect(() => {
      expect(client.s.options.socketTimeoutMS).to.deep.equal(0);
      const connections = client.topology.s.coreTopology
        ? client.topology.s.coreTopology.connections()
        : [];
      for (const connection of connections) {
        expect(connection.socketTimeout).to.deep.equal(0);
      }
      client.close(done);
    });
  });

  it('NODE-2874: connectTimeoutMS=0 causes monitoring to time out', function(done) {
    const heartbeatFrequencyMS = 500;
    const client = this.configuration.newClient({
      connectTimeoutMS: 0, // no connect timeout
      heartbeatFrequencyMS // fast 500ms heartbeat
    });
    client.connect(() => {
      // success after 5 heartbeats
      const success = setTimeout(() => client.close(done), heartbeatFrequencyMS * 5);

      // fail on first error
      const listener = ev => {
        if (ev.newDescription.error) {
          clearTimeout(success);
          client.removeListener('serverDescriptionChanged', listener);
          client.close(() => done(ev.newDescription.error));
        }
      };
      client.on('serverDescriptionChanged', listener);
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
