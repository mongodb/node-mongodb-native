'use strict';
const { withClient, setupDatabase } = require('./shared');
const test = require('./shared').assert;
const { expect } = require('chai');

describe('Connection - functional', function () {
  before(function () {
    return setupDatabase(this.configuration);
  });

  it('should correctly start monitoring for single server connection', {
    metadata: { requires: { topology: 'single', os: '!win32' } },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(
        { w: 1 },
        { maxPoolSize: 1, host: '/tmp/mongodb-27017.sock', heartbeatFrequencyMS: 250 }
      );

      client.connect(function (err, client) {
        expect(err).to.not.exist;

        client.topology.once('monitoring', function () {
          client.close(done);
        });
      });
    }
  });

  it('should correctly connect to server using domain socket', {
    metadata: { requires: { topology: 'single', os: '!win32' } },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(
        { w: 1 },
        { maxPoolSize: 1, host: '/tmp/mongodb-27017.sock' }
      );

      client.connect(function (err, client) {
        expect(err).to.not.exist;
        var db = client.db(configuration.db);

        db.collection('domainSocketCollection0').insert(
          { a: 1 },
          { writeConcern: { w: 1 } },
          function (err) {
            expect(err).to.not.exist;

            db.collection('domainSocketCollection0')
              .find({ a: 1 })
              .toArray(function (err, items) {
                expect(err).to.not.exist;
                test.equal(1, items.length);

                client.close(done);
              });
          }
        );
      });
    }
  });

  it('should correctly connect to server using just events', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient({ w: 1 }, { maxPoolSize: 1 });

      client.on('open', function () {
        client.close(done);
      });

      client.connect();
    }
  });

  it('should correctly connect to server using big connection pool', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] },
      ignore: { travis: true }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient({ w: 1 }, { maxPoolSize: 2000 });
      client.on('open', function () {
        client.close(done);
      });

      client.connect();
    }
  });

  it('should connect to server using domain socket with undefined port', {
    metadata: { requires: { topology: 'single', os: '!win32' } },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(
        { w: 1 },
        { maxPoolSize: 1, host: '/tmp/mongodb-27017.sock', port: undefined }
      );

      client.connect(function (err, client) {
        expect(err).to.not.exist;
        var db = client.db(configuration.db);

        db.collection('domainSocketCollection1').insert(
          { x: 1 },
          { writeConcern: { w: 1 } },
          function (err) {
            expect(err).to.not.exist;

            db.collection('domainSocketCollection1')
              .find({ x: 1 })
              .toArray(function (err, items) {
                expect(err).to.not.exist;
                test.equal(1, items.length);

                client.close(done);
              });
          }
        );
      });
    }
  });

  /**
   * @param {any} configuration
   * @param {any} testName
   * @param {any} callback
   */
  function connectionTester(configuration, testName, callback) {
    return function (err, client) {
      var db = client.db(configuration.db);
      expect(err).to.not.exist;

      db.collection(testName, function (err, collection) {
        expect(err).to.not.exist;

        collection.insert({ foo: 123 }, { writeConcern: { w: 1 } }, function (err) {
          expect(err).to.not.exist;

          db.dropDatabase(function (err, dropped) {
            expect(err).to.not.exist;
            test.ok(dropped);
            if (callback) return callback(client);
          });
        });
      });
    };
  }

  it('test connect no options', {
    metadata: { requires: { topology: 'single' } },

    test: function (done) {
      const configuration = this.configuration;
      const client = configuration.newClient();

      client.connect(
        connectionTester(configuration, 'testConnectNoOptions', function (client) {
          client.close(done);
        })
      );
    }
  });

  it('test connect good auth', {
    metadata: { requires: { topology: 'single' } },

    test: function (done) {
      var configuration = this.configuration;
      var user = 'testConnectGoodAuth',
        password = 'password';

      const setupClient = configuration.newClient();

      // First add a user.
      setupClient.connect(function (err, client) {
        expect(err).to.not.exist;
        var db = client.db(configuration.db);

        db.addUser(user, password, function (err) {
          expect(err).to.not.exist;
          client.close(restOfTest);
        });
      });

      function restOfTest() {
        const testClient = configuration.newClient(configuration.url(user, password));
        testClient.connect(
          connectionTester(configuration, 'testConnectGoodAuth', function (client) {
            client.close(done);
          })
        );
      }
    }
  });

  it('test connect good auth as option', {
    metadata: { requires: { topology: 'single' } },

    test: function (done) {
      var configuration = this.configuration;
      const username = 'testConnectGoodAuthAsOption';
      const password = 'password';

      // First add a user.
      const setupClient = configuration.newClient();
      setupClient.connect(function (err, client) {
        expect(err).to.not.exist;
        var db = client.db(configuration.db);

        db.addUser(username, password, function (err) {
          expect(err).to.not.exist;
          client.close(restOfTest);
        });
      });

      function restOfTest() {
        var opts = { auth: { username, password } };

        const testClient = configuration.newClient(
          configuration.url('baduser', 'badpassword'),
          opts
        );

        testClient.connect(
          connectionTester(configuration, 'testConnectGoodAuthAsOption', function (client) {
            client.close(done);
          })
        );
      }
    }
  });

  it('test connect bad auth', {
    metadata: { requires: { topology: 'single' } },

    test: function (done) {
      var configuration = this.configuration;
      const client = configuration.newClient(configuration.url('slithy', 'toves'));
      client.connect(function (err, client) {
        expect(err).to.exist;
        expect(client).to.not.exist;
        done();
      });
    }
  });

  it('test connect bad url', {
    metadata: { requires: { topology: 'single' } },

    test: function () {
      const configuration = this.configuration;
      expect(() => configuration.newClient('mangodb://localhost:27017/test?safe=false')).to.throw();
    }
  });

  it('should correctly return false on `isConnected` before connection happened', {
    metadata: { requires: { topology: 'single' } },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient({ w: 1 }, { maxPoolSize: 1 });
      test.equal(false, client.isConnected());
      done();
    }
  });

  it(
    'should be able to connect again after close',
    withClient(function (client, done) {
      expect(client.isConnected()).to.be.true;

      const collection = client.db('shouldConnectAfterClose').collection('test');
      collection.insertOne({ a: 1, b: 2 }, (err, result) => {
        expect(err).to.not.exist;
        expect(result).to.exist;

        client.close(err => {
          expect(err).to.not.exist;
          expect(client.isConnected()).to.be.false;

          client.connect(err => {
            expect(err).to.not.exist;
            expect(client.isConnected()).to.be.true;

            collection.findOne({ a: 1 }, (err, result) => {
              expect(err).to.not.exist;
              expect(result).to.exist;
              expect(result).to.have.property('a', 1);
              expect(result).to.have.property('b', 2);
              expect(client.topology.isDestroyed()).to.be.false;
              done();
            });
          });
        });
      });
    })
  );

  it(
    'should correctly fail on retry when client has been closed',
    withClient(function (client, done) {
      expect(client.isConnected()).to.be.true;
      const collection = client.db('shouldCorrectlyFailOnRetry').collection('test');
      collection.insertOne({ a: 1 }, (err, result) => {
        expect(err).to.not.exist;
        expect(result).to.exist;

        client.close(true, function (err) {
          expect(err).to.not.exist;
          expect(client.isConnected()).to.be.false;

          expect(() => {
            collection.insertOne({ a: 2 });
          }).to.throw(/must be connected/);
          done();
        });
      });
    })
  );
});
