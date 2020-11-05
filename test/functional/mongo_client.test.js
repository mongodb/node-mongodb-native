'use strict';

var f = require('util').format;
var test = require('./shared').assert;
var setupDatabase = require('./shared').setupDatabase;
const ReadPreference = require('../../lib/core/topologies/read_preference');
const Db = require('../../lib/db');
const expect = require('chai').expect;

describe('MongoClient', function() {
  before(function() {
    return setupDatabase(this.configuration);
  });

  it('Should Correctly Do MongoClient with bufferMaxEntries:0 and ordered execution', {
    metadata: {
      requires: {
        topology: ['single', 'ssl', 'wiredtiger']
      }
    },

    // The actual test we wish to run
    test: function(done) {
      const configuration = this.configuration;
      if (configuration.usingUnifiedTopology()) {
        // the new topology is far more resilient in these scenarios, making very difficult
        // to reproduce the issues tested here.
        return this.skip();
      }

      const client = configuration.newClient({}, { bufferMaxEntries: 0, sslValidate: false });

      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        // Listener for closing event
        var closeListener = function() {
          // Let's insert a document
          var collection = db.collection('test_object_id_generation.data2');
          // Insert another test document and collect using ObjectId
          var docs = [];
          for (var i = 0; i < 1500; i++) docs.push({ a: i });

          collection.insert(docs, configuration.writeConcern(), function(err) {
            test.ok(err != null);
            test.ok(err.message.indexOf('0') !== -1);

            // Let's close the db
            client.close(done);
          });
        };

        // Add listener to close event
        db.once('close', closeListener);
        // Ensure death of server instance
        client.topology.connections()[0].destroy();
      });
    }
  });

  it('Should Correctly Do MongoClient with bufferMaxEntries:0 and unordered execution', {
    metadata: {
      requires: {
        topology: ['single', 'ssl', 'wiredtiger']
      }
    },

    // The actual test we wish to run
    test: function(done) {
      const configuration = this.configuration;
      if (configuration.usingUnifiedTopology()) {
        // the new topology is far more resilient in these scenarios, making very difficult
        // to reproduce the issues tested here.
        return this.skip();
      }

      const client = configuration.newClient({}, { bufferMaxEntries: 0, sslValidate: false });

      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        // Listener for closing event
        var closeListener = function() {
          // Let's insert a document
          var collection = db.collection('test_object_id_generation.data_3');
          // Insert another test document and collect using ObjectId
          var docs = [];
          for (var i = 0; i < 1500; i++) docs.push({ a: i });

          var opts = configuration.writeConcern();
          opts.keepGoing = true;
          // Execute insert
          collection.insert(docs, opts, function(err) {
            test.ok(err != null);
            test.ok(err.message.indexOf('0') !== -1);

            // Let's close the db
            client.close(done);
          });
        };

        // Add listener to close event
        db.once('close', closeListener);
        // Ensure death of server instance
        client.topology.connections()[0].destroy();
      });
    }
  });

  it('Should correctly pass through extra db options', {
    metadata: {
      requires: {
        topology: ['single']
      }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      const client = configuration.newClient(
        {},
        {
          w: 1,
          wtimeout: 1000,
          fsync: true,
          j: true,
          readPreference: 'nearest',
          readPreferenceTags: { loc: 'ny' },
          native_parser: false,
          forceServerObjectId: true,
          pkFactory: function() {
            return 1;
          },
          serializeFunctions: true,
          raw: true,
          numberOfRetries: 10,
          bufferMaxEntries: 0
        }
      );

      client.connect(function(err, client) {
        var db = client.db(configuration.db);

        test.equal(1, db.writeConcern.w);
        test.equal(1000, db.writeConcern.wtimeout);
        test.equal(true, db.writeConcern.fsync);
        test.equal(true, db.writeConcern.j);

        test.equal('nearest', db.s.readPreference.mode);
        test.deepEqual({ loc: 'ny' }, db.s.readPreference.tags);

        test.equal(false, db.s.nativeParser);
        test.equal(true, db.s.options.forceServerObjectId);
        test.equal(1, db.s.pkFactory());
        test.equal(true, db.s.options.serializeFunctions);
        test.equal(true, db.s.options.raw);
        test.equal(10, db.s.options.numberOfRetries);
        test.equal(0, db.s.options.bufferMaxEntries);

        client.close(done);
      });
    }
  });

  it('Should correctly pass through extra server options', {
    metadata: {
      requires: {
        topology: ['single']
      }
    },

    // The actual test we wish to run
    test: function(done) {
      const configuration = this.configuration;
      if (configuration.usingUnifiedTopology()) {
        // skipped for direct legacy variable inspection
        return this.skip();
      }

      const client = configuration.newClient(
        {},
        {
          poolSize: 10,
          autoReconnect: false,
          noDelay: false,
          keepAlive: true,
          keepAliveInitialDelay: 100,
          connectTimeoutMS: 444444,
          socketTimeoutMS: 555555
        }
      );

      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        test.equal(10, db.s.topology.s.poolSize);
        test.equal(false, db.s.topology.autoReconnect);
        test.equal(444444, db.s.topology.s.clonedOptions.connectionTimeout);
        test.equal(555555, db.s.topology.s.clonedOptions.socketTimeout);
        test.equal(true, db.s.topology.s.clonedOptions.keepAlive);
        test.equal(100, db.s.topology.s.clonedOptions.keepAliveInitialDelay);

        client.close(done);
      });
    }
  });

  it.skip('Should correctly pass through extra replicaset options', {
    metadata: {
      requires: {
        topology: ['replicaset']
      }
    },

    // The actual test we wish to run
    test: function(done) {
      // NOTE: skipped because this test is using explicit variable names not used by
      // mongo-orchestration. This behavior should be unit tested without depending
      // on the test harness used.

      const configuration = this.configuration;
      if (configuration.usingUnifiedTopology()) {
        // skipped for direct legacy variable inspection
        return this.skip();
      }

      var url = configuration.url().replace('rs_name=rs', 'rs_name=rs1');
      const client = configuration.newClient(url, {
        replSet: {
          ha: false,
          haInterval: 10000,
          replicaSet: 'rs',
          secondaryAcceptableLatencyMS: 100,
          connectWithNoPrimary: true,
          poolSize: 1,
          socketOptions: {
            noDelay: false,
            keepAlive: true,
            keepAliveInitialDelay: 100,
            connectTimeoutMS: 444444,
            socketTimeoutMS: 555555
          }
        }
      });

      client.connect(function(err, client) {
        expect(err).to.not.exist;
        var db = client.db(configuration.db);

        test.equal(false, db.s.topology.s.clonedOptions.ha);
        test.equal(10000, db.s.topology.s.clonedOptions.haInterval);
        test.equal('rs', db.s.topology.s.clonedOptions.setName);
        test.equal(100, db.s.topology.s.clonedOptions.acceptableLatency);
        test.equal(true, db.s.topology.s.clonedOptions.secondaryOnlyConnectionAllowed);
        test.equal(1, db.s.topology.s.clonedOptions.size);

        test.equal(444444, db.s.topology.s.clonedOptions.connectionTimeout);
        test.equal(555555, db.s.topology.s.clonedOptions.socketTimeout);
        test.equal(true, db.s.topology.s.clonedOptions.keepAlive);
        test.equal(100, db.s.topology.s.clonedOptions.keepAliveInitialDelay);

        client.close(done);
      });
    }
  });

  it('Should correctly pass through extra sharded options', {
    metadata: {
      requires: {
        topology: ['sharded']
      }
    },

    // The actual test we wish to run
    test: function(done) {
      const configuration = this.configuration;
      if (configuration.usingUnifiedTopology()) {
        // skipped for direct legacy variable inspection
        return this.skip();
      }

      const client = configuration.newClient(
        {},
        {
          ha: false,
          haInterval: 10000,
          acceptableLatencyMS: 100,
          poolSize: 1,
          socketOptions: {
            noDelay: false,
            keepAlive: true,
            keepAliveInitialDelay: 100,
            connectTimeoutMS: 444444,
            socketTimeoutMS: 555555
          }
        }
      );

      client.connect(function(err, client) {
        expect(err).to.not.exist;
        var db = client.db(configuration.db);

        test.equal(false, db.s.topology.s.clonedOptions.ha);
        test.equal(10000, db.s.topology.s.clonedOptions.haInterval);
        test.equal(100, db.s.topology.s.clonedOptions.localThresholdMS);
        test.equal(1, db.s.topology.s.clonedOptions.poolSize);

        test.equal(444444, db.s.topology.s.clonedOptions.connectionTimeout);
        test.equal(555555, db.s.topology.s.clonedOptions.socketTimeout);
        test.equal(true, db.s.topology.s.clonedOptions.keepAlive);
        test.equal(100, db.s.topology.s.clonedOptions.keepAliveInitialDelay);

        client.close(done);
      });
    }
  });

  it('Should correctly set MaxPoolSize on single server', {
    metadata: {
      requires: {
        topology: ['single']
      }
    },

    // The actual test we wish to run
    test: function(done) {
      const configuration = this.configuration;
      if (configuration.usingUnifiedTopology()) {
        // skipped for direct legacy variable inspection
        return this.skip();
      }

      var url = configuration.url();
      url =
        url.indexOf('?') !== -1
          ? f('%s&%s', url, 'maxPoolSize=100')
          : f('%s?%s', url, 'maxPoolSize=100');

      const client = configuration.newClient(url);
      client.connect(function(err, client) {
        test.equal(1, client.topology.connections().length);
        test.equal(100, client.topology.s.coreTopology.s.pool.size);

        client.close(done);
      });
    }
  });

  it('Should correctly set MaxPoolSize on replicaset server', {
    metadata: {
      requires: {
        topology: ['replicaset'],
        unifiedTopology: false
      }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var url = configuration.url();
      url =
        url.indexOf('?') !== -1
          ? f('%s&%s', url, 'maxPoolSize=100')
          : f('%s?%s', url, 'maxPoolSize=100');

      const client = configuration.newClient(url);
      client.connect(function(err, client) {
        test.ok(client.topology.connections().length >= 1);

        var connections = client.topology.connections();

        for (var i = 0; i < connections.length; i++) {
          test.equal(10000, connections[i].connectionTimeout);
          test.equal(360000, connections[i].socketTimeout);
        }

        client.close();

        const secondClient = configuration.newClient(url, {
          connectTimeoutMS: 15000,
          socketTimeoutMS: 30000
        });

        secondClient.connect(function(err) {
          test.equal(null, err);
          test.ok(secondClient.topology.connections().length >= 1);

          var connections = secondClient.topology.connections();

          for (var i = 0; i < connections.length; i++) {
            test.equal(15000, connections[i].connectionTimeout);
            test.equal(30000, connections[i].socketTimeout);
          }

          secondClient.close(done);
        });
      });
    }
  });

  it('Should correctly set MaxPoolSize on sharded server', {
    metadata: {
      requires: {
        topology: ['sharded'],
        unifiedTopology: false
      }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var url = configuration.url();
      url =
        url.indexOf('?') !== -1
          ? f('%s&%s', url, 'maxPoolSize=100')
          : f('%s?%s', url, 'maxPoolSize=100');

      const client = configuration.newClient(url);
      client.connect(function(err, client) {
        test.ok(client.topology.connections().length >= 1);

        client.close(done);
      });
    }
  });

  /**
   * @ignore
   */
  it('Should fail due to wrong uri user:password@localhost', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      const client = configuration.newClient('user:password@localhost:27017/test');

      client.connect(function(err) {
        expect(err).to.exist.and.to.have.property('message', 'Invalid connection string');
        done();
      });
    }
  });

  /**
   * @ignore
   */
  it('Should fail due to wrong uri user:password@localhost, with new url parser', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      const client = configuration.newClient('user:password@localhost:27017/test', {
        useNewUrlParser: true
      });

      client.connect(function(err) {
        test.equal(err.message, 'Invalid connection string');
        done();
      });
    }
  });

  /**
   * @ignore
   */
  it('correctly error out when no socket available on MongoClient `connect`', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      const client = configuration.newClient('mongodb://localhost:27088/test', {
        serverSelectionTimeoutMS: 10
      });

      client.connect(function(err) {
        test.ok(err != null);

        done();
      });
    }
  });

  it('should correctly connect to mongodb using domain socket', {
    metadata: { requires: { topology: ['single'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      const client = configuration.newClient('mongodb://%2Ftmp%2Fmongodb-27017.sock/test');
      client.connect(function(err) {
        test.equal(null, err);
        client.close(done);
      });
    }
  });

  /**
   * @ignore
   */
  it('correctly connect setting keepAlive to 100', {
    metadata: {
      requires: {
        topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'],
        unifiedTopology: false
      }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      const client = configuration.newClient(
        {},
        {
          keepAlive: true,
          keepAliveInitialDelay: 100,
          // keepAliveInitialDelay is clamped to half the size of socketTimeout
          // if socketTimeout is less than keepAliveInitialDelay
          socketTimeout: 101
        }
      );

      client.connect(function(err, client) {
        test.equal(null, err);
        var connection = client.topology.connections()[0];
        test.equal(true, connection.keepAlive);
        test.equal(100, connection.keepAliveInitialDelay);

        client.close();

        const secondClient = configuration.newClient({}, { keepAlive: false });
        secondClient.connect(function(err) {
          test.equal(null, err);

          secondClient.topology.connections().forEach(function(x) {
            test.equal(false, x.keepAlive);
          });

          secondClient.close(done);
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('default keepAlive behavior', {
    metadata: {
      requires: {
        topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'],
        unifiedTopology: false
      }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      const client = configuration.newClient();
      client.connect(function(err, client) {
        test.equal(null, err);
        client.topology.connections().forEach(function(x) {
          test.equal(true, x.keepAlive);
        });

        client.close(done);
      });
    }
  });

  it('should fail dure to garbage connection string', {
    metadata: {
      requires: {
        topology: ['single']
      }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      const client = configuration.newClient('mongodb://unknownhost:36363/ddddd', {
        serverSelectionTimeoutMS: 10
      });

      client.connect(function(err) {
        test.ok(err != null);
        done();
      });
    }
  });

  it.skip('Should fail to connect due to instances not being mongos proxies', {
    metadata: {
      requires: {
        topology: ['replicaset']
      }
    },

    // The actual test we wish to run
    test: function(done) {
      // NOTE: skipped because this test is using explicit variable names not used by
      // mongo-orchestration. This behavior should be unit tested without depending
      // on the test harness used.

      var configuration = this.configuration;
      if (configuration.usingUnifiedTopology()) {
        // this is no longer relevant with the unified topology
        return this.skip();
      }

      var url = configuration
        .url()
        .replace('replicaSet=rs', '')
        .replace('localhost:31000', 'localhost:31000,localhost:31001');

      const client = configuration.newClient(url);
      client.connect(function(err) {
        test.ok(err != null);
        done();
      });
    }
  });

  it('Should correctly pass through appname', {
    metadata: {
      requires: {
        topology: ['single', 'replicaset', 'sharded']
      }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var url = configuration.url();
      if (url.indexOf('replicaSet') !== -1) {
        url = f('%s&appname=hello%20world', configuration.url());
      } else {
        url = f('%s?appname=hello%20world', configuration.url());
      }

      const client = configuration.newClient(url);
      client.connect(function(err, client) {
        test.equal(null, err);
        test.equal('hello world', client.topology.clientMetadata.application.name);

        client.close(done);
      });
    }
  });

  it('Should correctly pass through appname in options', {
    metadata: {
      requires: {
        topology: ['single', 'replicaset', 'sharded']
      }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var url = configuration.url();

      const client = configuration.newClient(url, { appname: 'hello world' });
      client.connect(err => {
        test.equal(null, err);
        test.equal('hello world', client.topology.clientMetadata.application.name);

        client.close(done);
      });
    }
  });

  it('Should correctly pass through socketTimeoutMS and connectTimeoutMS', {
    metadata: {
      requires: {
        topology: ['single', 'replicaset', 'sharded']
      }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      const client = configuration.newClient(
        {},
        {
          socketTimeoutMS: 0,
          connectTimeoutMS: 0
        }
      );

      client.connect(function(err, client) {
        test.equal(null, err);
        var db = client.db(configuration.db);

        if (db.s.topology.s.clonedOptions) {
          test.equal(0, db.s.topology.s.clonedOptions.connectionTimeout);
          test.equal(0, db.s.topology.s.clonedOptions.socketTimeout);
        } else {
          test.equal(0, db.s.topology.s.options.connectionTimeout);
          test.equal(0, db.s.topology.s.options.socketTimeout);
        }

        client.close(done);
      });
    }
  });

  it('Should correctly pass through socketTimeoutMS and connectTimeoutMS from uri', {
    metadata: {
      requires: {
        topology: ['single']
      }
    },

    // The actual test we wish to run
    test: function(done) {
      const configuration = this.configuration;
      if (configuration.usingUnifiedTopology()) {
        // skipped for direct legacy variable inspection
        return this.skip();
      }

      var uri = f('%s?socketTimeoutMS=120000&connectTimeoutMS=15000', configuration.url());
      const client = configuration.newClient(uri);
      client.connect(function(err, client) {
        test.equal(null, err);
        test.equal(120000, client.topology.s.coreTopology.s.options.socketTimeout);
        test.equal(15000, client.topology.s.coreTopology.s.options.connectionTimeout);

        client.close(done);
      });
    }
  });

  //////////////////////////////////////////////////////////////////////////////////////////
  //
  // new MongoClient connection tests
  //
  //////////////////////////////////////////////////////////////////////////////////////////
  it('Should open a new MongoClient connection', {
    metadata: {
      requires: {
        topology: ['single']
      }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      const client = configuration.newClient();
      client.connect(function(err, mongoclient) {
        test.equal(null, err);

        mongoclient
          .db('integration_tests')
          .collection('new_mongo_client_collection')
          .insertOne({ a: 1 }, function(err, r) {
            test.equal(null, err);
            test.ok(r);

            mongoclient.close(done);
          });
      });
    }
  });

  it('Should open a new MongoClient connection using promise', {
    metadata: {
      requires: {
        topology: ['single']
      }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      const client = configuration.newClient();
      client.connect().then(function(mongoclient) {
        mongoclient
          .db('integration_tests')
          .collection('new_mongo_client_collection')
          .insertOne({ a: 1 })
          .then(function(r) {
            test.ok(r);

            mongoclient.close(done);
          });
      });
    }
  });

  it('Should use compression from URI', {
    metadata: { requires: { topology: ['single'], unifiedTopology: false } },

    // The actual test we wish to run
    test: function(done) {
      const configuration = this.configuration;
      const url = `mongodb://${configuration.host}:${configuration.port}/?compressors=zlib`;
      const client = configuration.newClient(url, { useNewUrlParser: true });

      client.connect(function(err, client) {
        expect(err).to.not.exist;

        const db = client.db('integration_tests');
        db.collection('new_mongo_client_collection').insertOne({ a: 1 }, (err, r) => {
          expect(err).to.not.exist;
          expect(r.connection.options.compression).to.deep.equal({ compressors: ['zlib'] });
          client.close(done);
        });
      });
    }
  });

  it('should be able to access a database named "constructor"', function() {
    const client = this.configuration.newClient();
    let err;
    return client
      .connect()
      .then(() => {
        const db = client.db('constructor');
        expect(db).to.not.be.a('function');
        expect(db).to.be.an.instanceOf(Db);
      })
      .catch(_err => (err = _err))
      .then(() => client.close())
      .catch(() => {})
      .then(() => {
        if (err) {
          throw err;
        }
      });
  });

  it('should cache a resolved readPreference from options', function() {
    const client = this.configuration.newClient({}, { readPreference: ReadPreference.SECONDARY });
    expect(client.readPreference).to.be.instanceOf(ReadPreference);
    expect(client.readPreference).to.have.property('mode', ReadPreference.SECONDARY);
  });
});
