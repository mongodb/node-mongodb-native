'use strict';
const test = require('./shared').assert,
  setupDatabase = require('./shared').setupDatabase,
  expect = require('chai').expect;

describe('Connection', function() {
  before(function() {
    return setupDatabase(this.configuration);
  });

  /**
   * @ignore
   */
  it('should correctly start monitoring for single server connection', {
    metadata: { requires: { topology: 'single' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(
        { w: 1 },
        { poolSize: 1, host: '/tmp/mongodb-27017.sock', heartbeatFrequencyMS: 250 }
      );

      client.connect(function(err, client) {
        test.equal(null, err);

        client.topology.once('monitoring', function() {
          client.close(done);
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('should correctly connect to server using domain socket', {
    metadata: { requires: { topology: 'single' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(
        { w: 1 },
        { poolSize: 1, host: '/tmp/mongodb-27017.sock' }
      );

      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        test.equal(null, err);

        db.collection('domainSocketCollection0').insert({ a: 1 }, { w: 1 }, function(err) {
          test.equal(null, err);

          db.collection('domainSocketCollection0')
            .find({ a: 1 })
            .toArray(function(err, items) {
              test.equal(null, err);
              test.equal(1, items.length);

              client.close(done);
            });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('should correctly connect to server using just events', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient({ w: 1 }, { poolSize: 1, auto_reconnect: true });

      client.on('open', function() {
        client.close(done);
      });

      client.connect();
    }
  });

  /**
   * @ignore
   */
  it('should correctly identify parser type', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient({ w: 1 }, { poolSize: 1, auto_reconnect: true });

      client.connect().then(() => {
        test.equal('js', client.topology.parserType);

        client.close(done);
      });
    }
  });

  /**
   * @ignore
   */
  it('should correctly connect to server using big connection pool', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] },
      ignore: { travis: true }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient({ w: 1 }, { poolSize: 2000, auto_reconnect: true });
      client.on('open', function() {
        client.close(done);
      });

      client.connect();
    }
  });

  /**
   * @ignore
   */
  it('should connect to server using domain socket with undefined port', {
    metadata: { requires: { topology: 'single' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(
        { w: 1 },
        { poolSize: 1, host: '/tmp/mongodb-27017.sock', port: undefined }
      );

      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        test.equal(null, err);

        db.collection('domainSocketCollection1').insert({ x: 1 }, { w: 1 }, function(err) {
          test.equal(null, err);

          db.collection('domainSocketCollection1')
            .find({ x: 1 })
            .toArray(function(err, items) {
              test.equal(null, err);
              test.equal(1, items.length);

              client.close(done);
            });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('should fail to connect using non-domain socket with undefined port', {
    metadata: { requires: { topology: 'single' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration,
        Server = configuration.require.Server,
        MongoClient = configuration.require.MongoClient;

      var error;
      try {
        var client = new MongoClient(new Server('localhost', undefined), { w: 0 });
        client.connect(function() {});
      } catch (err) {
        error = err;
      }

      test.ok(error instanceof Error);
      test.ok(/port must be specified/.test(error));
      done();
    }
  });

  /**
   * @ignore
   */
  function connectionTester(configuration, testName, callback) {
    return function(err, client) {
      var db = client.db(configuration.db);
      test.equal(err, null);

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

  /**
   * @ignore
   */
  it('test connect no options', {
    metadata: { requires: { topology: 'single' } },

    // The actual test we wish to run
    test: function(done) {
      const configuration = this.configuration;
      const client = configuration.newClient();

      client.connect(
        connectionTester(configuration, 'testConnectNoOptions', function(client) {
          client.close(done);
        })
      );
    }
  });

  /**
   * @ignore
   */
  it('test connect good auth', {
    metadata: { requires: { topology: 'single' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var user = 'testConnectGoodAuth',
        password = 'password';

      const setupClient = configuration.newClient();

      // First add a user.
      setupClient.connect(function(err, client) {
        test.equal(err, null);
        var db = client.db(configuration.db);

        db.addUser(user, password, function(err) {
          test.equal(err, null);
          client.close(restOfTest);
        });
      });

      function restOfTest() {
        const testClient = configuration.newClient(configuration.url(user, password));
        testClient.connect(
          connectionTester(configuration, 'testConnectGoodAuth', function(client) {
            client.close(done);
          })
        );
      }
    }
  });

  /**
   * @ignore
   */
  it('test connect good auth as option', {
    metadata: { requires: { topology: 'single' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var user = 'testConnectGoodAuthAsOption',
        password = 'password';

      // First add a user.
      const setupClient = configuration.newClient();
      setupClient.connect(function(err, client) {
        test.equal(err, null);
        var db = client.db(configuration.db);

        db.addUser(user, password, function(err) {
          test.equal(err, null);
          client.close(restOfTest);
        });
      });

      function restOfTest() {
        var opts = { auth: { user: user, password: password } };

        const testClient = configuration.newClient(
          configuration.url('baduser', 'badpassword'),
          opts
        );

        testClient.connect(
          connectionTester(configuration, 'testConnectGoodAuthAsOption', function(client) {
            client.close(done);
          })
        );
      }
    }
  });

  /**
   * @ignore
   */
  it('test connect bad auth', {
    metadata: { requires: { topology: 'single' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      const client = configuration.newClient(configuration.url('slithy', 'toves'), {
        serverSelectionTimeoutMS: 10
      });

      client.connect(function(err, client) {
        expect(err).to.exist;
        expect(client).to.not.exist;
        done();
      });
    }
  });

  /**
   * @ignore
   */
  it('test connect bad url', {
    metadata: { requires: { topology: 'single' } },

    // The actual test we wish to run
    test: function(done) {
      const configuration = this.configuration;
      const client = configuration.newClient('mangodb://localhost:27017/test?safe=false');

      test.throws(function() {
        client.connect(function() {
          test.ok(false, 'Bad URL!');
        });
      });

      done();
    }
  });

  /**
   * @ignore
   */
  it('should correctly return false on `isConnected` before connection happened', {
    metadata: { requires: { topology: 'single' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient({ w: 1 }, { poolSize: 1, auto_reconnect: false });
      test.equal(false, client.isConnected());
      done();
    }
  });
});
