'use strict';
const test = require('./shared').assert;
const setupDatabase = require('./shared').setupDatabase;
const expect = require('chai').expect;
const sinon = require('sinon');
const Connection = require('../../lib/cmap/connection').Connection;

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

  it('must respect an infinite connectTimeoutMS for the streaming protocol', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>= 4.4' } },
    test: function(done) {
      if (!this.configuration.usingUnifiedTopology()) return done();
      const client = this.configuration.newClient({
        connectTimeoutMS: 0,
        heartbeatFrequencyMS: 500
      });
      client.connect(err => {
        expect(err).to.not.exist;
        const stub = sinon.stub(Connection.prototype, 'command').callsFake(function() {
          const args = Array.prototype.slice.call(arguments);
          const ns = args[0];
          const command = args[1];
          const options = args[2];
          if (ns === 'admin.$cmd' && command.ismaster && options.exhaustAllowed) {
            stub.restore();
            expect(options)
              .property('socketTimeout')
              .to.equal(0);
            client.close(done);
          }
          stub.wrappedMethod.apply(this, args);
        });
      });
    }
  });

  it('must respect a finite connectTimeoutMS for the streaming protocol', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>= 4.4' } },
    test: function(done) {
      if (!this.configuration.usingUnifiedTopology()) return done();
      const client = this.configuration.newClient({
        connectTimeoutMS: 10,
        heartbeatFrequencyMS: 500
      });
      client.connect(err => {
        expect(err).to.not.exist;
        const stub = sinon.stub(Connection.prototype, 'command').callsFake(function() {
          const args = Array.prototype.slice.call(arguments);
          const ns = args[0];
          const command = args[1];
          const options = args[2];
          if (ns === 'admin.$cmd' && command.ismaster && options.exhaustAllowed) {
            stub.restore();
            expect(options)
              .property('socketTimeout')
              .to.equal(510);
            client.close(done);
          }
          stub.wrappedMethod.apply(this, args);
        });
      });
    }
  });

  it('should directConnect when no replicaSet name is specified', {
    metadata: { requires: { topology: 'replicaset' } },
    test: function(done) {
      const urlNoReplicaSet = this.configuration
        .url()
        // strip the replicaSet parameter from the url if present
        .replace(/([&?])replicaSet=.+?[&$]/, '$1')
        // reduce down to a single host if multiple are provided
        .replace(new RegExp('(^mongodb://[^,]+)[^/]+'), '$1');
      const client = this.configuration.newClient(urlNoReplicaSet);
      client.connect(err => {
        expect(err).to.not.exist;
        expect(client.s.options.directConnection).to.be.true;
        client.close(done);
      });
    }
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
