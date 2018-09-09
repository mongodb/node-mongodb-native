'use strict';
const setupDatabase = require('./shared').setupDatabase;
const expect = require('chai').expect;

describe('Connection', function() {
  before(function() {
    return setupDatabase(this.configuration);
  });

  /**
   * @ignore
   */
  it('should correctly start monitoring for single server connection', {
    metadata: { requires: { topology: 'single' } },
    test: function(done) {
      const configuration = this.configuration;
      const client = configuration.newClient(
        { w: 1 },
        { poolSize: 1, host: '/tmp/mongodb-27017.sock' }
      );

      client.connect((err, client) => {
        expect(err).to.not.exist;

        client.topology.once('monitoring', () => {
          client.close();
          done();
        });
      });
    }
  });

  /**
   * @ignore
   */
  // NOTE: skipped for direct variable inspection
  it.skip('should correctly disable monitoring for single server connection', {
    metadata: { requires: { topology: 'single' } },
    test: function(done) {
      const configuration = this.configuration;
      const client = configuration.newClient(
        { w: 1 },
        { poolSize: 1, host: '/tmp/mongodb-27017.sock', monitoring: false }
      );

      client.connect((err, client) => {
        expect(err).to.not.exist;
        expect(client.topology.s.coreTopology.s.monitoring).to.equal(false);

        client.close();
        done();
      });
    }
  });

  /**
   * @ignore
   */
  it('should correctly connect to server using domain socket', {
    metadata: { requires: { topology: 'single' } },
    test: function(done) {
      const configuration = this.configuration;
      const client = configuration.newClient(
        { w: 1 },
        { poolSize: 1, host: '/tmp/mongodb-27017.sock' }
      );

      client.connect((err, client) => {
        expect(err).to.not.exist;

        const db = client.db(configuration.db);
        db.collection('domainSocketCollection0').insert({ a: 1 }, { w: 1 }, err => {
          expect(err).to.not.exist;

          db
            .collection('domainSocketCollection0')
            .find({ a: 1 })
            .toArray((err, items) => {
              expect(err).to.not.exist;
              expect(items).to.have.length(1);

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
  it('should correctly connect to server using just events', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function(done) {
      const configuration = this.configuration;
      const client = configuration.newClient({ w: 1 }, { poolSize: 1, auto_reconnect: true });

      client.on('open', () => {
        client.close();
        done();
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

    test: function(done) {
      const configuration = this.configuration;
      const client = configuration.newClient({ w: 1 }, { poolSize: 1, auto_reconnect: true });

      client.connect().then(() => {
        expect(client.topology.parserType).to.equal('js');
        client.close();
        done();
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

    test: function(done) {
      const configuration = this.configuration;
      const client = configuration.newClient({ w: 1 }, { poolSize: 2000, auto_reconnect: true });
      client.on('open', () => {
        client.close();
        done();
      });

      client.connect();
    }
  });

  /**
   * @ignore
   */
  it('should connect to server using domain socket with undefined port', {
    metadata: { requires: { topology: 'single' } },

    test: function(done) {
      const configuration = this.configuration;
      const client = configuration.newClient(
        { w: 1 },
        { poolSize: 1, host: '/tmp/mongodb-27017.sock', port: undefined }
      );

      client.connect((err, client) => {
        expect(err).to.not.exist;

        const db = client.db(configuration.db);
        db.collection('domainSocketCollection1').insert({ x: 1 }, { w: 1 }, err => {
          expect(err).to.not.exist;

          db
            .collection('domainSocketCollection1')
            .find({ x: 1 })
            .toArray((err, items) => {
              expect(err).to.not.exist;
              expect(items).to.have.length(1);

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
  it('should fail to connect using non-domain socket with undefined port', {
    metadata: { requires: { topology: 'single' } },
    test: function(done) {
      const configuration = this.configuration;
      const Server = configuration.require.Server;
      const MongoClient = configuration.require.MongoClient;

      let error;
      try {
        const client = new MongoClient(new Server('localhost', undefined), { w: 0 });
        client.connect(() => {});
      } catch (err) {
        error = err;
      }

      expect(error).to.be.instanceOf(Error);
      expect(error.message).to.match(/port must be specified/);
      done();
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
            expect(dropped).to.be.true;

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
    test: function(done) {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.url());

      client.connect(
        connectionTester(configuration, 'testConnectNoOptions', client => {
          client.close();
          done();
        })
      );
    }
  });

  /**
   * @ignore
   */
  // NOTE: skipped for direct variable inspection
  it.skip('test connect server options', {
    metadata: { requires: { topology: 'single' } },
    test: function(done) {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.url(), {
        auto_reconnect: true,
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
  // NOTE: skipped for direct variable inspection
  it.skip('testConnectAllOptions', {
    metadata: { requires: { topology: 'single' } },
    test: function(done) {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.url(), {
        auto_reconnect: true,
        poolSize: 4,
        native_parser: process.env['TEST_NATIVE'] != null
      });

      client.connect(
        connectionTester(configuration, 'testConnectAllOptions', client => {
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
  it('test connect good auth', {
    metadata: { requires: { topology: 'single' } },
    test: function(done) {
      const configuration = this.configuration;
      if (configuration.usingUnifiedTopology()) {
        // The unified topology does not currently support authentication
        return this.skip();
      }

      const user = 'testConnectGoodAuth';
      const password = 'password';
      const client = configuration.newClient(configuration.url());

      // First add a user.
      client.connect((err, client) => {
        expect(err).to.not.exist;

        const db = client.db(configuration.db);
        db.addUser(user, password, err => {
          expect(err).to.not.exist;
          client.close();
          restOfTest();
        });
      });

      function restOfTest() {
        const secondClient = configuration.newClient(configuration.url(user, password));
        secondClient.connect(
          connectionTester(configuration, 'testConnectGoodAuth', client => {
            client.close();
            done();
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
    test: function(done) {
      const configuration = this.configuration;
      if (configuration.usingUnifiedTopology()) {
        // The unified topology does not currently support authentication
        return this.skip();
      }

      const user = 'testConnectGoodAuthAsOption';
      const password = 'password';
      const client = configuration.newClient(configuration.url());

      // First add a user.
      client.connect((err, client) => {
        expect(err).to.not.exist;

        const db = client.db(configuration.db);
        db.addUser(user, password, err => {
          expect(err).to.not.exist;
          client.close();
          restOfTest();
        });
      });

      function restOfTest() {
        const secondClient = configuration.newClient(configuration.url('baduser', 'badpassword'), {
          auth: { user: user, password: password }
        });

        secondClient.connect(
          connectionTester(configuration, 'testConnectGoodAuthAsOption', client => {
            client.close();
            done();
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
    test: function(done) {
      const configuration = this.configuration;
      if (configuration.usingUnifiedTopology()) {
        // The unified topology does not currently support authentication
        return this.skip();
      }

      const client = configuration.newClient(configuration.url('slithy', 'toves'));
      client.connect((err, client) => {
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
    test: function(done) {
      const configuration = this.configuration;
      const client = configuration.newClient('mangodb://localhost:27017/test?safe=false');

      expect(() => client.connect(() => {})).to.throw;
      done();
    }
  });

  /**
   * @ignore
   */
  it('should correctly return false on `isConnected` before connection happened', {
    metadata: { requires: { topology: 'single' } },
    test: function(done) {
      const configuration = this.configuration;
      const client = configuration.newClient({ w: 1 }, { poolSize: 1, auto_reconnect: false });
      expect(client.isConnected()).to.equal(false);
      done();
    }
  });

  /**
   * @ignore
   */
  it('should correctly reconnect and finish query operation', {
    metadata: { requires: { topology: 'single' } },
    test: function(done) {
      const configuration = this.configuration;
      if (configuration.usingUnifiedTopology()) {
        // The unified topology deprecates autoReconnect, this test depends on the `reconnect` event
        return this.skip();
      }

      const client = configuration.newClient({ w: 1 }, { poolSize: 1, auto_reconnect: true });
      client.connect((err, client) => {
        expect(err).to.not.exist;

        const db = client.db(configuration.db);
        db.collection('test_reconnect').insert({ a: 1 }, err => {
          expect(err).to.not.exist;

          let dbReconnect = 0;
          let dbClose = 0;
          db.on('reconnect', () => ++dbReconnect);
          db.on('close', () => ++dbClose);

          client.topology.once('reconnect', () => {
            // Await reconnect and re-authentication
            db.collection('test_reconnect').findOne((err, doc) => {
              expect(err).to.not.exist;
              expect(doc.a).to.equal(1);
              expect(dbReconnect).to.equal(1);
              expect(dbClose).to.equal(1);

              // Attempt disconnect again
              client.topology.connections()[0].destroy();

              // Await reconnect and re-authentication
              db.collection('test_reconnect').findOne((err, doc) => {
                expect(err).to.not.exist;
                expect(doc.a).to.equal(1);
                expect(dbReconnect).to.equal(2);
                expect(dbClose).to.equal(2);

                client.close();
                done();
              });
            });
          });

          // Force close
          client.topology.connections()[0].destroy();
        });
      });
    }
  });
});
