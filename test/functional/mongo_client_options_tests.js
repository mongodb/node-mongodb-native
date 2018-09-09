'use strict';
const setupDatabase = require('./shared').setupDatabase;
const expect = require('chai').expect;

describe('MongoClient Options', function() {
  before(function() {
    return setupDatabase(this.configuration);
  });

  /**
   * @ignore
   */
  // NOTE: skipped for inspection of private variables
  it.skip('pass in server and db top level options', {
    metadata: { requires: { topology: 'single' } },

    // The actual test we wish to run
    test: function(done) {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.url(), {
        autoReconnect: true,
        poolSize: 4
      });

      client.connect(
        connectionTester(configuration, 'testConnectServerOptions', client => {
          expect(client.topology.poolSize).to.be.at.least(1);
          expect(client.topology.s.coreTopology.s.pool.size).to.equal(4);
          expect(client.topology.autoReconnect).to.equal(true);

          client.close();
          done();
        })
      );
    }
  });

  /**
   * @ignore
   */
  // NOTE: skipped for inspection of private variables
  it.skip('pass in server and db top level options', {
    metadata: { requires: { topology: 'single' } },

    // The actual test we wish to run
    test: function(done) {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.url(), {
        autoReconnect: true,
        poolSize: 4
      });

      client.connect(
        connectionTester(configuration, 'testConnectServerOptions', client => {
          expect(client.topology.poolSize).to.be.at.least(1);
          expect(client.topology.s.coreTopology.s.pool.size).to.equal(4);
          expect(client.topology.autoReconnect).to.equal(true);

          client.close();
          done();
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
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.url(), {
        autoReconnect: true,
        poolSize: 4,
        notlegal: {},
        validateOptions: true
      });

      client.connect((err, _client) => {
        expect(err.message).to.match(/option notlegal is not supported/);
        expect(_client).to.not.exist;

        done();
      });
    }
  });

  /**
   * @ignore
   */
  function connectionTester(configuration, testName, callback) {
    return (err, client) => {
      expect(err).to.not.exist;

      const db = client.db(configuration.db);
      db.collection(testName, (err, collection) => {
        expect(err).to.not.exist;

        collection.insert({ foo: 123 }, { w: 1 }, err => {
          expect(err).to.not.exist;

          db.dropDatabase((err, dropped) => {
            expect(err).to.not.exist;
            expect(dropped).to.equal(true);
            if (callback) return callback(client);
          });
        });
      });
    };
  }
});
