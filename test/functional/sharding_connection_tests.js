'use strict';

const setupDatabase = require('./shared').setupDatabase;
const expect = require('chai').expect;

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
      const configuration = this.configuration;
      if (configuration.usingUnifiedTopology()) {
        // disable for inspection of legacy properties
        return this.skip();
      }

      const url = `${configuration.url()}?w=1&readPreference=secondaryPreferred&readPreferenceTags=sf%3A1`;
      const client = configuration.newClient(url, { haInterval: 500, useNewUrlParser: true });

      client.connect(err => {
        expect(err).to.not.exist;
        expect(client).to.have.nested.property('topology.haInterval', 500);

        const db = client.db(configuration.db);

        db
          .collection('replicaset_mongo_client_collection')
          .update({ a: 1 }, { b: 1 }, { upsert: true }, (err, result) => {
            expect(err).to.not.exist;
            expect(result).to.have.nested.property('result.n', 1);

            // Perform fetch of document
            db.collection('replicaset_mongo_client_collection').findOne(err => {
              expect(err).to.not.exist;

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
      const configuration = this.configuration;
      const host = configuration.host;
      const port = configuration.port;

      // TODO: Better way to do this?
      const url = `mongodb://${host}:${port},${host}:${port +
        1},localhost:50002/sharded_test_db?w=1`;

      const client = configuration.newClient(url, { useNewUrlParser: true });

      client.connect(err => {
        expect(err).to.not.exist;
        client.close();
        done();
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
      const configuration = this.configuration;
      if (configuration.usingUnifiedTopology()) {
        // disable for inspection of legacy properties
        return this.skip();
      }

      const url = `${configuration.url()}?w=1&readPreference=secondaryPreferred&readPreferenceTags=sf%3A1`;

      const client = configuration.newClient(url, { useNewUrlParser: true, haInterval: 500 });
      client.connect(function(err) {
        expect(err).to.not.exist;
        expect(client)
          .to.have.property('topology')
          .that.is.an('object');

        const topology = client.topology;

        expect(topology).to.have.property('haInterval', 500);
        expect(topology).to.have.property('bson').that.does.exist;

        expect(topology)
          .to.have.property('isConnected')
          .that.is.a('function');
        expect(topology.isConnected()).to.equal(true);

        ['capabilities', 'lastIsMaster', 'connections'].forEach(member => {
          expect(topology)
            .to.have.property(member)
            .that.is.a('function');
          expect(topology[member]()).to.exist;
        });

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
      const configuration = this.configuration;
      if (configuration.usingUnifiedTopology()) {
        // disable for inspection of legacy properties
        return this.skip();
      }

      const url = `${configuration.url()}?w=1&readPreference=secondaryPreferred&readPreferenceTags=sf%3A1`;

      const client = configuration.newClient(url, { useNewUrlParser: true, reconnectTries: 10 });
      client.connect(function(err) {
        expect(err).to.not.exist;
        expect(client)
          .to.have.nested.property('topology.s.coreTopology.connectedProxies')
          .that.is.an('array');

        client.topology.s.coreTopology.connectedProxies.forEach(server => {
          expect(server).to.have.nested.property('s.pool.options.reconnectTries', 10);
        });

        client.close();
        done();
      });
    }
  });
});
