'use strict';

var f = require('util').format;
var test = require('./shared').assert;
var setupDatabase = require('./shared').setupDatabase;

describe('Authentication', function() {
  before(function() {
    const configuration = this.configuration;
    if (configuration.usingUnifiedTopology()) {
      // The unified topology does not currently support authentication
      return this.skip();
    }

    return setupDatabase(this.configuration);
  });

  /**
   * Fail due to illegal authentication mechanism
   *
   * @ignore
   */
  it('should fail due to illegal authentication mechanism', {
    metadata: { requires: { topology: ['auth'], mongodb: '<=2.6.x' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration,
        MongoClient = configuration.require.MongoClient,
        Server = configuration.require.Server;

      // restart server
      configuration.manager.restart(true).then(function() {
        var client = new MongoClient(
          new Server(configuration.host, configuration.port, { auto_reconnect: true }),
          { w: 1 }
        );
        client.connect(function(err, client) {
          test.equal(null, err);
          var db = client.db(configuration.db);

          db.admin().addUser('admin', 'admin', function(err) {
            test.equal(null, err);
            client.close();

            var client1 = new MongoClient(
              new Server(configuration.host, configuration.port, { auto_reconnect: true }),
              { w: 1, user: 'admin', password: 'admin', authMechanism: 'SCRAM-SHA-1' }
            );

            client1.connect(function(err) {
              test.ok(err);
              test.equal(59, err.code);

              // restart server
              configuration.manager.restart(true).then(function() {
                done();
              });
            });
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('should correctly authenticate with kay.kay', {
    metadata: { requires: { topology: ['auth'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration,
        MongoClient = configuration.require.MongoClient,
        Server = configuration.require.Server;

      // restart server
      configuration.manager.restart(true).then(function() {
        var client = new MongoClient(
          new Server(configuration.host, configuration.port, { auto_reconnect: true }),
          { w: 1 }
        );
        client.connect(function(err, client) {
          test.equal(null, err);
          var db = client.db(configuration.db);

          db.admin().addUser('kay:kay', 'abc123', function(err) {
            test.equal(null, err);
            client.close();

            MongoClient.connect('mongodb://kay%3Akay:abc123@localhost:27017/admin', function(err) {
              test.equal(null, err);

              // restart server
              configuration.manager.restart(true).then(function() {
                done();
              });
            });
          });
        });
      });
    }
  });

  /**
   * Retrieve the server information for the current
   * instance of the db client
   *
   * @ignore
   */
  it('should correctly call validateCollection using authenticatedMode', {
    metadata: { requires: { topology: ['single', 'heap', 'wiredtiger'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var MongoClient = configuration.require.MongoClient;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });

      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        var collection = db.collection(
          'shouldCorrectlyCallValidateCollectionUsingAuthenticatedMode'
        );
        collection.insert({ a: 1 }, { w: 1 }, function(err) {
          test.equal(null, err);
          var adminDb = db.admin();
          adminDb.addUser('admin', 'admin', configuration.writeConcernMax(), function(err) {
            test.equal(null, err);

            MongoClient.connect('mongodb://admin:admin@localhost:27017/admin', function(err) {
              test.equal(null, err);

              adminDb.validateCollection(
                'shouldCorrectlyCallValidateCollectionUsingAuthenticatedMode',
                function(err, doc) {
                  test.equal(null, err);
                  test.ok(doc != null);

                  adminDb.removeUser('admin', function(err) {
                    test.equal(null, err);

                    client.close();
                    done();
                  });
                }
              );
            });
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('should correctly issue authenticated event on successful authentication', {
    metadata: { requires: { topology: 'single' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var MongoClient = configuration.require.MongoClient;
      var client = configuration.newClient({ w: 1 }, { poolSize: 1 });

      // DOC_LINE var client = new MongoClient(new Server('localhost', 27017));
      // DOC_START
      // Establish connection to db
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        // Grab a collection object
        var collection = db.collection('test');

        // Force the creation of the collection by inserting a document
        // Collections are not created until the first document is inserted
        collection.insert({ a: 1 }, { w: 1 }, function(err) {
          test.equal(null, err);
          // Use the admin database for the operation
          var adminDb = db.admin();

          // Add the new user to the admin database
          adminDb.addUser('admin15', 'admin15', function(err, result) {
            test.equal(null, err);
            test.ok(result != null);
            client.close();

            client = new MongoClient('mongodb://admin15:admin15@localhost:27017/admin');
            client.once('authenticated', function() {
              done();
            });

            // Authenticate using the newly added user
            client.connect(function(err, client) {
              test.equal(null, err);
              client.close();
            });
          });
        });
      });
      // DOC_END
    }
  });

  it('should correctly authenticate against normal db', {
    metadata: { requires: { topology: ['auth'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration,
        MongoClient = configuration.require.MongoClient,
        Server = configuration.require.Server;

      // restart server
      configuration.manager.restart(true).then(function() {
        var client = new MongoClient(new Server('127.0.0.1', 27017, { auto_reconnect: true }), {
          w: 1
        });
        client.connect(function(err, client) {
          test.equal(null, err);
          var db = client.db(configuration.db);

          // An admin user must be defined for db level authentication to work correctly
          db.admin().addUser('admin', 'admin', function(err) {
            test.equal(null, err);
            client.close();

            new MongoClient(new Server('127.0.0.1', 27017, { auto_reconnect: true }), {
              w: 1,
              user: 'admin',
              password: 'admin',
              authSource: 'admin'
            }).connect(function(err, client) {
              test.equal(null, err);
              var db = client.db(configuration.db);

              db.addUser('user', 'user', function(err) {
                test.equal(null, err);

                // Logout admin
                client.logout(function(err) {
                  test.equal(null, err);

                  // Attempt to save a document
                  db.collection('test').insert({ a: 1 }, function(err) {
                    test.ok(err != null);

                    // // Login the user
                    new MongoClient(new Server('127.0.0.1', 27017, { auto_reconnect: true }), {
                      w: 1,
                      user: 'user',
                      password: 'user',
                      authSource: configuration.db
                    }).connect(function(err, client) {
                      test.equal(null, err);
                      var db = client.db(configuration.db);
                      test.equal(null, err);

                      db.collection('test').insert({ a: 1 }, function(err) {
                        test.equal(null, err);

                        // Logout the user
                        client.logout(function(err) {
                          test.equal(null, err);

                          // Attempt to save a document
                          db.collection('test').insert({ a: 1 }, function(err) {
                            test.ok(err != null);
                            client.close();

                            // restart server
                            configuration.manager.restart(true).then(function() {
                              done();
                            });
                          });
                        });
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });
    }
  });

  it('should correctly reapply the authentications', {
    metadata: { requires: { topology: ['auth'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration,
        MongoClient = configuration.require.MongoClient,
        Server = configuration.require.Server;

      // restart server
      configuration.manager.restart(true).then(function() {
        var client = new MongoClient(new Server('localhost', 27017, { auto_reconnect: true }), {
          w: 1
        });
        client.connect(function(err, client) {
          test.equal(null, err);
          var db = client.db(configuration.db);

          db.admin().addUser('admin', 'admin', function(err) {
            test.equal(null, err);

            // Attempt to save a document
            db.collection('test').insert({ a: 1 }, function(err) {
              test.ok(err != null);
              client.close();

              // Login the user
              new MongoClient(new Server('127.0.0.1', 27017, { auto_reconnect: true }), {
                w: 1,
                user: 'admin',
                password: 'admin',
                authSource: 'admin'
              }).connect(function(err, client) {
                test.equal(null, err);
                var db = client.db(configuration.db);
                test.equal(null, err);

                db.collection('test').insert({ a: 1 }, function(err) {
                  test.equal(null, err);

                  // Bounce server
                  configuration.manager.restart(false).then(function() {
                    // Reconnect should reapply the credentials
                    db.collection('test').insert({ a: 1 }, function(err) {
                      test.equal(null, err);
                    });

                    db.collection('test').insert({ a: 1 }, function(err) {
                      test.equal(null, err);
                    });

                    db.collection('test').insert({ a: 1 }, function(err) {
                      test.equal(null, err);
                    });

                    // Reconnect should reapply the credentials
                    db.collection('test').insert({ a: 1 }, function(err) {
                      test.equal(null, err);

                      client.close();

                      // restart server
                      configuration.manager.restart(true).then(function() {
                        done();
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });
    }
  });

  it('ordered bulk operation should fail correctly when not authenticated', {
    metadata: { requires: { topology: ['auth'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration,
        MongoClient = configuration.require.MongoClient,
        Server = configuration.require.Server;

      // restart server
      configuration.manager.restart(true).then(function() {
        var client = new MongoClient(new Server('127.0.0.1', 27017, { auto_reconnect: true }), {
          w: 1
        });

        client.connect(function(err, client) {
          test.equal(null, err);
          var db = client.db(configuration.db);

          db.admin().addUser('admin', 'admin', function(err) {
            test.equal(null, err);

            // Attempt to save a document
            var col = db.collection('test');

            // Initialize the Ordered Batch
            var batch = col.initializeOrderedBulkOp();

            // Add some operations to be executed in order
            batch.insert({ a: 1 });
            batch.find({ a: 1 }).updateOne({ $set: { b: 1 } });
            batch
              .find({ a: 2 })
              .upsert()
              .updateOne({ $set: { b: 2 } });
            batch.insert({ a: 3 });
            batch.find({ a: 3 }).remove({ a: 3 });

            // Execute the operations
            batch.execute(function(err) {
              test.ok(err != null);
              test.ok(err.code != null);
              test.ok(err.errmsg != null);

              configuration.manager.restart(true).then(function() {
                client.close();
                done();
              });
            });
          });
        });
      });
    }
  });

  it('unordered bulk operation should fail correctly when not authenticated', {
    metadata: { requires: { topology: ['auth'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration,
        MongoClient = configuration.require.MongoClient,
        Server = configuration.require.Server;

      // restart server
      configuration.manager.restart(true).then(function() {
        var client = new MongoClient(new Server('127.0.0.1', 27017, { auto_reconnect: true }), {
          w: 1
        });
        client.connect(function(err, client) {
          test.equal(null, err);
          var db = client.db(configuration.db);

          db.admin().addUser('admin', 'admin', function(err) {
            test.equal(null, err);

            // Attempt to save a document
            var col = db.collection('test');

            // Initialize the Ordered Batch
            var batch = col.initializeUnorderedBulkOp();

            // Add some operations to be executed in order
            batch.insert({ a: 1 });
            batch.find({ a: 1 }).updateOne({ $set: { b: 1 } });
            batch
              .find({ a: 2 })
              .upsert()
              .updateOne({ $set: { b: 2 } });
            batch.insert({ a: 3 });
            batch.find({ a: 3 }).remove({ a: 3 });

            // Execute the operations
            batch.execute(function(err) {
              test.ok(err != null);
              test.ok(err.code != null);
              test.ok(err.errmsg != null);

              configuration.manager.restart(true).then(function() {
                client.close();
                done();
              });
            });
          });
        });
      });
    }
  });

  // /**********************************************************************************************
  //   ReplsetRep    ReplsetRepl  tReplsetRe   etRepl          Repl  t  plsetReplse  eplsetReplse
  //   setReplsetR   setReplsetRe  setReplset  plsetR        plsetRepls tReplsetRepl etReplsetRep
  //    pls    pls   epls    plse  epls    pls   epl        etRep  etRe lset    setR pls  Rep  et
  //    tReplsetRe    tRe          etReplsetRe   et         plset        epl              set
  //    lsetRepls     lsetRe       plsetRepls    pl          Repls       etRepl           epl
  //    ReplsetR      Replset      tReplsetR     tR             Repls    plsetRe          et
  //    setReplse     setRepl      lse           lse             etRe    tReplse          pls
  //    epl   Rep  e  epl          Rep          tRep    Re        lset   lse              tRe
  //    etR   setRep  etRe    tRe  set           set    se  epls  Repl   Repl    epl      lse
  //   eplse  eplset eplsetR plse Replse       tReplsetRep  etReplsetR  lsetRep setR    etRepls
  //   etRep   tRep  etReplsetRep setRep       lsetReplset  plsetRepl   ReplsetRepls    plsetRe
  // **********************************************************************************************/

  var setUp = function(configuration, options, callback) {
    var ReplSetManager = require('mongodb-topology-manager').ReplSet;

    // Check if we have any options
    if (typeof options === 'function') (callback = options), (options = null);

    // Override options
    var rsOptions;
    if (options) {
      rsOptions = options;
    } else {
      rsOptions = {
        server: {
          keyFile: __dirname + '/data/keyfile.txt',
          auth: null,
          replSet: 'rs'
        },
        client: {
          replSet: 'rs'
        }
      };
    }

    // Set up the nodes
    var nodes = [
      {
        options: {
          bind_ip: 'localhost',
          port: 31000,
          dbpath: f('%s/../db/31000', __dirname)
        }
      },
      {
        options: {
          bind_ip: 'localhost',
          port: 31001,
          dbpath: f('%s/../db/31001', __dirname)
        }
      },
      {
        // arbiter: true,
        options: {
          bind_ip: 'localhost',
          port: 31002,
          dbpath: f('%s/../db/31002', __dirname)
        }
      }
    ];

    // Merge in any node start up options
    for (var i = 0; i < nodes.length; i++) {
      for (var name in rsOptions.server) {
        nodes[i].options[name] = rsOptions.server[name];
      }
    }

    // Create a manager
    var replicasetManager = new ReplSetManager('mongod', nodes, rsOptions.client);
    // Purge the set
    replicasetManager.purge().then(function() {
      // Start the server
      replicasetManager
        .start()
        .then(function() {
          setTimeout(function() {
            callback(null, replicasetManager);
          }, 10000);
        })
        .catch(function() {
          process.exit(0);
        });
    });
  };

  /**
   * @ignore
   */
  it('should correctly handle replicaset master stepdown and stepup without loosing auth', {
    metadata: { requires: { topology: ['auth'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration,
        MongoClient = configuration.require.MongoClient,
        Server = configuration.require.Server,
        ReplSet = configuration.require.ReplSet;

      setUp(configuration, function(err, replicasetManager) {
        var replSet = new ReplSet(
          [new Server('localhost', 31000), new Server('localhost', 31001)],
          {
            rs_name: 'rs',
            poolSize: 1
          }
        );

        // Connect
        new MongoClient(replSet, { w: 1 }).connect(function(err, client) {
          test.equal(null, err);
          var db = client.db(configuration.db);

          // Add a user
          db.admin().addUser('root', 'root', { w: 3, wtimeout: 25000 }, function(err) {
            test.equal(null, err);
            client.close();

            // Login the user
            new MongoClient(
              new ReplSet([new Server('localhost', 31000), new Server('localhost', 31001)], {
                rs_name: 'rs',
                poolSize: 1
              }),
              { user: 'root', password: 'root', authSource: 'admin' }
            ).connect(function(err, client) {
              test.equal(null, err);
              var db = client.db(configuration.db);

              replicasetManager
                .stepDownPrimary(
                  false,
                  { stepDownSecs: 1, force: true },
                  {
                    provider: 'default',
                    db: 'admin',
                    user: 'root',
                    password: 'root'
                  }
                )
                .then(function() {
                  db.collection('replicaset_test_auth').insert({ a: 1 }, { w: 1 }, function(err) {
                    test.equal(null, err);

                    client.close();

                    replicasetManager.stop().then(function() {
                      done();
                    });
                  });
                })
                .catch(function(e) {
                  done(e);
                });
            });
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it(
    'Should correctly perform nearest read from secondaries without auth fail when priamry is first seed',
    {
      metadata: { requires: { topology: ['auth'] } },

      // The actual test we wish to run
      test: function(done) {
        var configuration = this.configuration,
          Server = configuration.require.Server,
          ReadPreference = configuration.require.ReadPreference,
          MongoClient = configuration.require.MongoClient,
          ReplSet = configuration.require.ReplSet;

        setUp(configuration, function(err, replicasetManager) {
          var replSet = new ReplSet(
            [new Server('localhost', 31000), new Server('localhost', 31001)],
            {
              rs_name: 'rs',
              poolSize: 1
            }
          );

          // Connect
          new MongoClient(replSet, {
            w: 1,
            readPreference: ReadPreference.NEAREST
          }).connect(function(err, client) {
            test.equal(null, err);
            var db = client.db(configuration.db);

            // Add a user
            db.admin().addUser('root', 'root', { w: 3, wtimeout: 25000 }, function(err) {
              test.equal(null, err);

              client.close();

              MongoClient.connect(
                'mongodb://root:root@localhost:31000,localhost:31001,localhost:31002/admin?replicaSet=rs&readPreference=nearest',
                function(err, client) {
                  test.equal(null, err);
                  var db = client.db(configuration.db);

                  db.collection('replicaset_test_auth').insert({ a: 1 }, { w: 1 }, function(err) {
                    test.equal(null, err);

                    db.collection('replicaset_test_auth').findOne({}, function(err) {
                      test.equal(null, err);

                      db.collection('replicaset_test_auth').findOne({}, function(err) {
                        test.equal(null, err);

                        db.collection('replicaset_test_auth').findOne({}, function(err) {
                          test.equal(null, err);

                          db.collection('replicaset_test_auth').findOne({}, function(err) {
                            test.equal(null, err);

                            client.close();

                            replicasetManager.stop().then(function() {
                              done();
                            });
                          });
                        });
                      });
                    });
                  });
                }
              );
            });
          });
        });
      }
    }
  );

  /**
   * @ignore
   */
  it('should correctly create indexes without hanging when different seedlists', {
    metadata: { requires: { topology: ['auth'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration,
        Server = configuration.require.Server,
        ReadPreference = configuration.require.ReadPreference,
        MongoClient = configuration.require.MongoClient,
        ReplSet = configuration.require.ReplSet;

      setUp(configuration, function(err, replicasetManager) {
        var replSet = new ReplSet(
          [new Server('localhost', 31000), new Server('localhost', 31001)],
          {
            rs_name: 'rs',
            poolSize: 1
          }
        );

        // Connect
        new MongoClient(replSet, {
          w: 1,
          readPreference: ReadPreference.NEAREST
        }).connect(function(err, client) {
          test.equal(null, err);
          var db = client.db(configuration.db);

          // Add a user
          db.admin().addUser('root', 'root', { w: 3, wtimeout: 25000 }, function(err) {
            test.equal(null, err);

            client.close();

            MongoClient.connect(
              'mongodb://root:root@localhost:31000,localhost:31001,localhost:31002/admin?replicaSet=rs&readPreference=secondary',
              function(err, client) {
                test.equal(null, err);

                // Attempt create index
                client
                  .db('replicaset_test_auth')
                  .collection('createIndexes1')
                  .ensureIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }, function(err) {
                    test.equal(null, err);
                    client.close();

                    MongoClient.connect(
                      'mongodb://root:root@localhost:31002/admin?replicaSet=rs&readPreference=secondary',
                      function(err, client) {
                        test.equal(null, err);

                        client
                          .db('replicaset_test_auth')
                          .collection('createIndexes2')
                          .ensureIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }, function(err) {
                            test.equal(null, err);
                            client.close();

                            replicasetManager.stop().then(function() {
                              done();
                            });
                          });
                      }
                    );
                  });
              }
            );
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('should correctly authenticate using primary', {
    metadata: { requires: { topology: ['auth'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration,
        MongoClient = configuration.require.MongoClient,
        Server = configuration.require.Server,
        ReplSet = configuration.require.ReplSet;

      setUp(configuration, function(err, replicasetManager) {
        var replSet = new ReplSet(
          [new Server('localhost', 31000), new Server('localhost', 31001)],
          {
            rs_name: 'rs',
            poolSize: 1
          }
        );

        var client = new MongoClient(replSet, { w: 1 });
        client.connect(function(err) {
          test.equal(null, err);
          var db = client.db(configuration.db);

          // Add a user
          db.admin().addUser('admin', 'admin', { w: 3, wtimeout: 25000 }, function(err) {
            test.equal(null, err);
            client.close();

            // Login the user
            new MongoClient(
              new ReplSet([new Server('localhost', 31000), new Server('localhost', 31001)], {
                rs_name: 'rs',
                poolSize: 1
              }),
              { w: 1, user: 'admin', password: 'admin', authSource: 'admin' }
            ).connect(function(err, client) {
              test.equal(null, err);
              var db = client.db(configuration.db);

              // Add a user to the db
              db.addUser('me', 'secret', { w: 3, wtimeout: 25000 }, function(err) {
                test.equal(null, err);

                // Close the connection
                client.close();

                // connection string
                var config = f(
                  'mongodb://me:secret@localhost:%s/%s?replicaSet=%s',
                  31000,
                  configuration.db,
                  'rs'
                );
                // Connect
                MongoClient.connect(config, function(err, client) {
                  test.equal(null, err);
                  var db = client.db(configuration.db);

                  db.collections(function(err) {
                    test.equal(null, err);

                    client.close();

                    replicasetManager.stop().then(function() {
                      done();
                    });
                  });
                });
              });
            });
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('should correctly authenticate with two seeds', {
    metadata: { requires: { topology: ['auth'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration,
        MongoClient = configuration.require.MongoClient,
        Server = configuration.require.Server,
        ReplSet = configuration.require.ReplSet;

      setUp(configuration, function(err, replicasetManager) {
        var replSet = new ReplSet(
          [new Server('localhost', 31000), new Server('localhost', 31001)],
          {
            rs_name: 'rs',
            poolSize: 1
          }
        );

        var client = new MongoClient(replSet, { w: 1 });
        client.connect(function(err, client) {
          test.equal(null, err);
          var db = client.db(configuration.db);

          // Add a user
          db.admin().addUser('admin', 'admin', { w: 3, wtimeout: 25000 }, function(err) {
            test.equal(null, err);
            client.close();

            new MongoClient(
              new ReplSet([new Server('localhost', 31000), new Server('localhost', 31001)], {
                rs_name: 'rs',
                poolSize: 1
              }),
              { w: 1, user: 'admin', password: 'admin', authSource: 'admin' }
            ).connect(function(err, client) {
              test.equal(null, err);
              var db = client.db(configuration.db);

              db.addUser('me', 'secret', { w: 3, wtimeout: 25000 }, function(err) {
                test.equal(null, err);
                // Close the connection
                client.close();

                // connection string
                var config = f(
                  'mongodb://me:secret@localhost:%s,localhost:%s/%s?replicaSet=%s',
                  31000,
                  31001,
                  configuration.db,
                  'rs'
                );
                // Connect
                MongoClient.connect(config, function(error, client) {
                  test.equal(null, error);
                  var db = client.db(configuration.db);

                  db.collections(function(err) {
                    test.equal(null, err);

                    client.close();

                    replicasetManager.stop().then(function() {
                      done();
                    });
                  });
                });
              });
            });
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('should correctly authenticate with only secondary seed', {
    metadata: { requires: { topology: ['auth'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration,
        MongoClient = configuration.require.MongoClient,
        Server = configuration.require.Server,
        ReplSet = configuration.require.ReplSet;

      setUp(configuration, function(err, replicasetManager) {
        var replSet = new ReplSet(
          [new Server('localhost', 31000), new Server('localhost', 31001)],
          {
            rs_name: 'rs',
            poolSize: 1
          }
        );

        var client = new MongoClient(replSet, { w: 1 });
        client.on('all', function(client) {
          test.equal(null, err);
          var p_db = client.db(configuration.db);

          // Add a user
          p_db.admin().addUser('admin', 'admin', { w: 3, wtimeout: 25000 }, function(err) {
            test.equal(null, err);
            client.close();

            new MongoClient(
              new ReplSet([new Server('localhost', 31000), new Server('localhost', 31001)], {
                rs_name: 'rs',
                poolSize: 1
              }),
              { w: 1, user: 'admin', password: 'admin', authSource: 'admin' }
            ).connect(function(err, client) {
              test.equal(null, err);
              var p_db = client.db(configuration.db);

              p_db.admin().addUser('me', 'secret', { w: 3, wtimeout: 25000 }, function(err) {
                test.equal(null, err);
                // Close the connection
                client.close();

                // connection string
                var config = f(
                  'mongodb://me:secret@localhost:%s/%s?authSource=admin&readPreference=secondary&replicaSet=%s&maxPoolSize=1',
                  31000,
                  configuration.db,
                  'rs'
                );

                // Connect
                MongoClient.connect(config, function(err, client) {
                  test.equal(null, err);
                  var db = client.db(configuration.db);

                  db.collection('test').insert({ a: 1 }, function(err) {
                    test.equal(null, err);

                    // Logout
                    client.logout(function() {
                      // Should fail
                      db.collection('test').findOne(function(err) {
                        test.ok(err != null);

                        // Connect
                        MongoClient.connect(config, function(err, client) {
                          test.equal(null, err);
                          var db = client.db(configuration.db);

                          replicasetManager
                            .secondaries()
                            .then(function(managers) {
                              // Shutdown the first secondary
                              managers[0]
                                .stop()
                                .then(function() {
                                  // Shutdown the second secondary
                                  managers[1]
                                    .stop()
                                    .then(function() {
                                      // Let's restart a secondary
                                      managers[0]
                                        .start()
                                        .then(function() {
                                          // Let's restart a secondary
                                          managers[1]
                                            .start()
                                            .then(function() {
                                              client.topology.once('joined', function() {
                                                // Should fail
                                                db.collection('test').findOne(function(err) {
                                                  test.equal(null, err);

                                                  client.close();

                                                  replicasetManager.stop().then(function() {
                                                    done();
                                                  });
                                                });
                                              });
                                            })
                                            .catch(function(e) {
                                              done(e);
                                            });
                                        })
                                        .catch(function(e) {
                                          done(e);
                                        });
                                    })
                                    .catch(function(e) {
                                      done(e);
                                    });
                                })
                                .catch(function(e) {
                                  done(e);
                                });
                            })
                            .catch(function(e) {
                              done(e);
                            });
                        });
                      });
                    });
                  });
                });
              });
            });
          });
        });

        client.connect(function(err) {
          test.equal(null, err);
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('should correctly authenticate and ensure index', {
    metadata: { requires: { topology: ['auth'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration,
        MongoClient = configuration.require.MongoClient,
        Server = configuration.require.Server,
        ReplSet = configuration.require.ReplSet;

      setUp(configuration, function(err, replicasetManager) {
        var replSet = new ReplSet(
          [new Server('localhost', 31000), new Server('localhost', 31001)],
          {
            rs_name: 'rs',
            poolSize: 1
          }
        );

        var client = new MongoClient(replSet, { w: 1 });
        client.connect(function(err, client) {
          test.equal(null, err);
          var db_p = client.db(configuration.db);

          db_p.admin().addUser('me', 'secret', { w: 3 }, function runWhatever(err) {
            test.equal(null, err);
            client.close();

            new MongoClient(
              new ReplSet([new Server('localhost', 31000), new Server('localhost', 31001)], {
                rs_name: 'rs',
                poolSize: 1
              }),
              { w: 1, user: 'me', password: 'secret', authSource: 'admin' }
            ).connect(function(err, client) {
              test.equal(null, err);
              var db_p = client.db(configuration.db);

              db_p.addUser('test', 'test', { w: 3, wtimeout: 25000 }, function(err) {
                test.equal(null, err);
                client.close();

                new MongoClient(
                  new ReplSet([new Server('localhost', 31000), new Server('localhost', 31001)], {
                    rs_name: 'rs',
                    poolSize: 1
                  }),
                  { w: 1, user: 'test', password: 'test', authSource: configuration.db }
                ).connect(function(err, client) {
                  test.equal(null, err);
                  var db_p = client.db(configuration.db);

                  db_p.collection('userconfirm', function(err, result) {
                    test.equal(null, err);

                    var userconfirm = result;
                    var ensureIndexOptions = { unique: true, w: 0, background: true };
                    userconfirm.ensureIndex([['confirmcode', 1]], ensureIndexOptions, function(
                      err
                    ) {
                      test.equal(null, err);

                      db_p.collection('session', function(err, result) {
                        test.equal(null, err);

                        var session = result;
                        session.ensureIndex([['sid', 1]], ensureIndexOptions, function(err) {
                          test.equal(null, err);

                          client.close();

                          replicasetManager.stop().then(function() {
                            done();
                          });
                        });
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('should correctly authenticate and use read preference', {
    metadata: { requires: { topology: ['auth'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration,
        MongoClient = configuration.require.MongoClient,
        Server = configuration.require.Server,
        ReplSet = configuration.require.ReplSet;

      setUp(configuration, function(err, replicasetManager) {
        var replSet = new ReplSet(
          [new Server('localhost', 31000), new Server('localhost', 31001)],
          {
            rs_name: 'rs',
            poolSize: 1
          }
        );

        var client = new MongoClient(replSet, { w: 1 });
        client.connect(function(err, client) {
          test.equal(null, err);
          var db_p = client.db(configuration.db);

          db_p
            .admin()
            .addUser('me', 'secret', { w: 3, wtimeout: 25000 }, function runWhatever(err) {
              test.equal(null, err);
              new MongoClient(
                new ReplSet([new Server('localhost', 31000), new Server('localhost', 31001)], {
                  rs_name: 'rs',
                  poolSize: 1
                }),
                { w: 1, user: 'me', password: 'secret', authSource: 'admin' }
              ).connect(function(err, client) {
                test.equal(null, err);
                var db_p = client.db(configuration.db);

                db_p.addUser('test', 'test', { w: 3, wtimeout: 25000 }, function(err) {
                  test.equal(null, err);
                  client.close();

                  new MongoClient(
                    new ReplSet([new Server('localhost', 31000), new Server('localhost', 31001)], {
                      rs_name: 'rs',
                      poolSize: 1
                    }),
                    { w: 1, user: 'test', password: 'test', authSource: configuration.db }
                  ).connect(function(err, client) {
                    test.equal(null, err);
                    var db_p = client.db(configuration.db);

                    db_p.collection('userconfirm2').insert({ a: 1 }, { w: 1 }, function(err) {
                      test.equal(null, err);

                      db_p.collection('userconfirm2').findOne(function(err, item) {
                        test.equal(null, err);
                        test.equal(1, item.a);
                        client.close();

                        replicasetManager.stop().then(function() {
                          done();
                        });
                      });
                    });
                  });
                });
              });
            });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('should correctly bring replicaset step down primary and still read from secondary', {
    metadata: { requires: { topology: ['auth'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration,
        MongoClient = configuration.require.MongoClient,
        Server = configuration.require.Server,
        ReadPreference = configuration.require.ReadPreference,
        ReplSet = configuration.require.ReplSet;

      setUp(configuration, function(err, replicasetManager) {
        var replSet = new ReplSet(
          [new Server('localhost', 31000), new Server('localhost', 31001)],
          {
            rs_name: 'rs',
            poolSize: 1
          }
        );

        var client = new MongoClient(replSet, { w: 1 });
        client.on('all', function(client) {
          test.ok(client != null);
          var db_p = client.db(configuration.db);

          db_p
            .admin()
            .addUser('me', 'secret', { w: 3, wtimeout: 25000 }, function runWhatever(err) {
              test.equal(null, err);
              client.close();

              new MongoClient(
                new ReplSet([new Server('localhost', 31000), new Server('localhost', 31001)], {
                  rs_name: 'rs',
                  poolSize: 1
                }),
                { w: 1, user: 'me', password: 'secret', authSource: 'admin' }
              ).connect(function(err, client) {
                test.equal(null, err);
                var db_p = client.db(configuration.db);

                db_p.collection('test').insert({ a: 1 }, { w: 1 }, function(err) {
                  test.equal(null, err);

                  db_p.addUser('test', 'test', { w: 3, wtimeout: 25000 }, function(err, result) {
                    test.equal(null, err);
                    test.ok(result != null);

                    client.topology.on('joined', function(t) {
                      if (t === 'primary') {
                        var counter = 10;
                        var errors = 0;

                        for (var i = 0; i < counter; i++) {
                          db_p
                            .collection('test')
                            .find({ a: 1 })
                            .setReadPreference(ReadPreference.SECONDARY)
                            .toArray(function(err) {
                              counter = counter - 1;

                              if (err != null) {
                                errors = errors + 1;
                              }

                              if (counter === 0) {
                                test.equal(0, errors);

                                client.close();

                                replicasetManager.stop().then(function() {
                                  done();
                                });
                              }
                            });
                        }
                      }
                    });

                    // Step down the primary
                    replicasetManager
                      .stepDownPrimary(
                        false,
                        {
                          stepDownSecs: 1,
                          force: true,
                          returnImmediately: true
                        },
                        {
                          provider: 'default',
                          db: 'admin',
                          user: 'me',
                          password: 'secret'
                        }
                      )
                      .catch(function(e) {
                        done(e);
                      });
                  });
                });
              });
            });
        });

        client.connect(function(err) {
          test.equal(null, err);
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('should correctly auth with secondary after killing primary', {
    metadata: { requires: { topology: ['auth'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration,
        MongoClient = configuration.require.MongoClient,
        Server = configuration.require.Server,
        ReadPreference = configuration.require.ReadPreference,
        ReplSet = configuration.require.ReplSet;

      setUp(configuration, function(err, replicasetManager) {
        var replSet = new ReplSet(
          [new Server('localhost', 31000), new Server('localhost', 31001)],
          {
            rs_name: 'rs',
            poolSize: 1
          }
        );

        var client = new MongoClient(replSet, { w: 1 });
        client.connect(function(err, client) {
          test.equal(null, err);
          var db_p = client.db(configuration.db);

          // Add a user
          db_p.admin().addUser('admin', 'admin', { w: 3, wtimeout: 25000 }, function(err) {
            test.equal(null, err);
            client.close();

            new MongoClient(
              new ReplSet([new Server('localhost', 31000), new Server('localhost', 31001)], {
                rs_name: 'rs',
                poolSize: 1
              }),
              { w: 1, user: 'admin', password: 'admin', authSource: 'admin' }
            ).connect(function(err, client) {
              test.equal(null, err);
              var db_p = client.db(configuration.db);

              db_p.collection('test').insert({ a: 1 }, { w: 1 }, function(err) {
                test.equal(null, err);

                db_p.addUser('test', 'test', { w: 3, wtimeout: 25000 }, function(err) {
                  test.equal(null, err);
                  client.close();

                  new MongoClient(
                    new ReplSet([new Server('localhost', 31000), new Server('localhost', 31001)], {
                      rs_name: 'rs',
                      poolSize: 1
                    }),
                    { w: 1, user: 'test', password: 'test', authSource: configuration.db }
                  ).connect(function(err, client) {
                    test.equal(null, err);
                    var db_p = client.db(configuration.db);

                    // shutdown the primary
                    replicasetManager.primary().then(function(primary) {
                      primary.stop().then(function() {
                        db_p.serverConfig.on('joined', function(t) {
                          if (t === 'primary') {
                            var counter = 1000;
                            var errors = 0;

                            for (var i = 0; i < counter; i++) {
                              db_p
                                .collection('test')
                                .find({ a: 1 })
                                .setReadPreference(ReadPreference.SECONDARY)
                                .toArray(function(err) {
                                  test.equal(null, err);
                                  counter = counter - 1;

                                  if (counter === 0) {
                                    test.equal(0, errors);

                                    client.close();

                                    replicasetManager.stop().then(function() {
                                      done();
                                    });
                                  }
                                });
                            }
                          }
                        });
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('should correctly auth against replicaset admin db using MongoClient', {
    metadata: { requires: { topology: ['auth'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration,
        MongoClient = configuration.require.MongoClient,
        Server = configuration.require.Server,
        ReplSet = configuration.require.ReplSet;

      setUp(configuration, function(err, replicasetManager) {
        var replSet = new ReplSet(
          [new Server('localhost', 31000), new Server('localhost', 31001)],
          {
            rs_name: 'rs',
            poolSize: 1
          }
        );

        var client = new MongoClient(replSet, { w: 3 });
        client.connect(function(err, client) {
          test.equal(null, err);
          var db_p = client.db(configuration.db);

          db_p
            .admin()
            .addUser('me', 'secret', { w: 3, wtimeout: 25000 }, function runWhatever(err) {
              test.equal(null, err);
              client.close();

              MongoClient.connect(
                f(
                  'mongodb://me:secret@%s:%s/%s?rs_name=%s&readPreference=secondary&w=3',
                  'localhost',
                  31000,
                  'admin',
                  'rs'
                ),
                function(err, client) {
                  test.equal(null, err);
                  var db = client.db(configuration.db);

                  // Insert document
                  db
                    .collection('authcollectiontest')
                    .insert({ a: 1 }, { w: 3, wtimeout: 25000 }, function(err) {
                      test.equal(null, err);

                      // Find the document
                      db
                        .collection('authcollectiontest')
                        .find()
                        .toArray(function(err, docs) {
                          test.equal(1, docs.length);
                          test.equal(1, docs[0].a);

                          client.close();

                          replicasetManager.stop().then(function() {
                            done();
                          });
                        });
                    });
                  // });
                }
              );
            });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('should correctly auth against normal db using MongoClient', {
    metadata: { requires: { topology: ['auth'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration,
        MongoClient = configuration.require.MongoClient,
        Server = configuration.require.Server,
        ReplSet = configuration.require.ReplSet;

      setUp(configuration, function(err, replicasetManager) {
        var replSet = new ReplSet(
          [new Server('localhost', 31000), new Server('localhost', 31001)],
          {
            rs_name: 'rs',
            poolSize: 1
          }
        );

        new MongoClient(replSet, { w: 3 }).connect(function(err, client) {
          test.equal(null, err);
          var db_p = client.db(configuration.db);

          db_p.admin().addUser('admin', 'admin', { w: 3, wtimeout: 25000 }, function(err) {
            test.equal(null, err);
            client.close();

            new MongoClient(
              new ReplSet([new Server('localhost', 31000), new Server('localhost', 31001)], {
                rs_name: 'rs',
                poolSize: 1
              }),
              { w: 1, user: 'admin', password: 'admin', authSource: 'admin' }
            ).connect(function(err, client) {
              test.equal(null, err);
              var db_p = client.db(configuration.db);

              db_p.addUser('me', 'secret', { w: 3, wtimeout: 25000 }, function runWhatever(err) {
                test.equal(null, err);
                client.close();

                MongoClient.connect(
                  f(
                    'mongodb://me:secret@%s:%s/%s?rs_name=%s&readPreference=secondary&w=3',
                    'localhost',
                    31000,
                    configuration.db,
                    'rs'
                  ),
                  function(err, client) {
                    test.equal(null, err);
                    var db = client.db(configuration.db);

                    // Insert document
                    db
                      .collection('authcollectiontest1')
                      .insert({ a: 1 }, { w: 3, wtimeout: 25000 }, function(err) {
                        test.equal(null, err);

                        // Find the document
                        db
                          .collection('authcollectiontest1')
                          .find()
                          .toArray(function(err, docs) {
                            test.equal(null, err);
                            test.equal(1, docs.length);
                            test.equal(1, docs[0].a);

                            client.close();

                            replicasetManager.stop().then(function() {
                              done();
                            });
                          });
                      });
                  }
                );
              });
            });
          });
        });
      });
    }
  });

  // /*************************************************************************************
  //
  //   sMong       sMong    ngosMo   sMong   ongosM    sMong         ongosM       ngos  n
  //   ngosM       ngosM   osMongos  ngosM   osMong   ongosMongo    gosMongo    gosMongosM
  //     ongo      sMo    Mong  Mong  Mongo   ngos   gosM  gosM    sMon  sMon  sMong  Mong
  //     osMon    ongo    gos    osM  gosMon  sMo   sMon    ong    ngo    gos  ngosM
  //     ongos    o Mo   sMon    ongo MongosM ngo   ngo           osMo    Mong  Mongo
  //     osMong  Mo go   ngos    osMo gosMong sMo   sMo           ongo    gosM     Mongo
  //     on osMo go Mo    Mon    ong  Mon osMongo   ngo   ngosMo   sMo    Mon       osMo
  //     os ongosM  gos   gos    osM  gos ongosMo    Mo    Mongo   ngo    gos        ngos
  //     ong sMong sMon   Mong  Mong  Mon  sMongo    gos   gosM    sMon  sMon  sMon  sMon
  //   ngosMo gos ongosM   osMongos  ngosM  gosMo     ongosMon      gosMongo   ngosMongos
  //    Mongo Mo  osMong    ngosMo   sMong   ongo      sMongosM      ongosM    sMongosMo
  //
  // **************************************************************************************/

  var setUpSharded = function(configuration, options, callback) {
    var ShardingManager = require('../topology_test_definitions').Sharded;

    // Check if we have any options
    if (typeof options === 'function') (callback = options), (options = null);

    // Create Replicaset Manager
    var shardedManager = new ShardingManager({
      shard: {
        auth: null,
        keyFile: __dirname + '/data/keyfile.txt'
      },
      config: {
        auth: null,
        keyFile: __dirname + '/data/keyfile.txt'
      },
      proxy: {
        keyFile: __dirname + '/data/keyfile.txt'
      }
    });

    // Start SSL replicaset manager
    shardedManager.purge().then(function() {
      shardedManager
        .start()
        .then(function() {
          callback(null, shardedManager);
        })
        .catch(function(e) {
          callback(e, null);
        });
    });
  };

  /**
   * @ignore
   */
  it('should correctly connect and authenticate against admin database using mongos', {
    metadata: { requires: { topology: ['auth'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration,
        MongoClient = configuration.require.MongoClient,
        Server = configuration.require.Server,
        Mongos = configuration.require.Mongos;

      setUpSharded(configuration, function(err, manager) {
        var mongos = new Mongos([new Server('localhost', 51000)], { poolSize: 1 });

        var client = new MongoClient(mongos, { w: 1 });
        client.connect(function(err, client) {
          test.equal(null, err);
          var db = client.db(configuration.db);

          // Add a user
          db.admin().addUser('admin', 'admin', { w: 'majority' }, function(err) {
            test.equal(null, err);
            client.close();

            new MongoClient(new Mongos([new Server('localhost', 51000)], { poolSize: 1 }), {
              w: 1,
              user: 'admin',
              password: 'admin',
              authSource: 'admin'
            }).connect(function(err, client) {
              test.equal(null, err);
              var db = client.db(configuration.db);

              db.addUser('me', 'secret', { w: 'majority' }, function(err) {
                test.equal(null, err);

                // Close the connection
                client.close();

                setTimeout(function() {
                  // connection string
                  var config = f('mongodb://me:secret@localhost:%s/%s', 51000, configuration.db);
                  // Connect
                  MongoClient.connect(config, function(error, client) {
                    test.equal(null, error);
                    var db = client.db(configuration.db);

                    db.collections(function(error) {
                      test.equal(null, error);

                      client.close();

                      manager.stop().then(function() {
                        done();
                      });
                    });
                  });
                }, 5000);
              });
            });
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('should correctly handle proxy stepdown and stepup without loosing auth for sharding', {
    metadata: { requires: { topology: ['auth'] } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration,
        MongoClient = configuration.require.MongoClient,
        Server = configuration.require.Server,
        Mongos = configuration.require.Mongos;

      setUpSharded(configuration, function(err, manager) {
        var mongos = new Mongos([new Server('localhost', 51000)], { poolSize: 1 });

        var client = new MongoClient(mongos, { w: 1 });
        client.connect(function(err, client) {
          test.equal(null, err);
          var db = client.db(configuration.db);

          // Add a user
          db.admin().addUser('admin', 'admin', { w: 'majority' }, function(err) {
            test.equal(null, err);
            client.close();

            new MongoClient(new Mongos([new Server('localhost', 51000)], { poolSize: 1 }), {
              w: 1,
              user: 'admin',
              password: 'admin',
              authSource: 'admin'
            }).connect(function(err, client) {
              test.equal(null, err);
              var db = client.db(configuration.db);

              db.addUser('me', 'secret', { w: 'majority' }, function(err) {
                test.equal(null, err);

                // Close the connection
                client.close();

                // connection string
                var config = f('mongodb://me:secret@localhost:%s/%s', 51000, configuration.db);
                // Connect
                MongoClient.connect(config, function(error, client) {
                  test.equal(null, error);
                  var db = client.db(configuration.db);

                  db.collections(function(error) {
                    test.equal(null, error);

                    // Get the proxies
                    var proxies = manager.proxies();

                    proxies[0].stop().then(function() {
                      proxies[1].stop().then(function() {
                        db.collections(function(error) {
                          test.equal(null, error);
                        });

                        proxies[0].start().then(function() {
                          proxies[1].start().then(function() {
                            db.collections(function(error) {
                              test.equal(null, error);

                              client.close();

                              manager.stop().then(function() {
                                done();
                              });
                            });
                          });
                        });
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });
    }
  });
});
