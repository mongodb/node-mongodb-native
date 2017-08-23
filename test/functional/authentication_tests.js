'use strict';

var f = require('util').format,
  fs = require('fs');

/**
 * Fail due to illegal authentication mechanism
 *
 * @ignore
 */
exports['should fail due to illegal authentication mechanism'] = {
  metadata: { requires: { topology: ['auth'], mongodb: '<=2.6.x' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var Db = configuration.require.Db,
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
        var db = client.db(configuration.database);

        db.admin().addUser('admin', 'admin', function(err, result) {
          test.equal(null, err);
          client.close();

          var client1 = new MongoClient(
            new Server(configuration.host, configuration.port, { auto_reconnect: true }),
            { w: 1, user: 'admin', password: 'admin', authMechanism: 'SCRAM-SHA-1' }
          );

          client1.connect(function(err, client) {
            test.ok(err);
            test.equal(59, err.code);

            // restart server
            configuration.manager.restart(true).then(function() {
              test.done();
            });
          });
        });
      });
    });
  }
};

/**
 * @ignore
 */
exports['should correctly authenticate with kay.kay'] = {
  metadata: { requires: { topology: ['auth'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var Db = configuration.require.Db,
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
        var db = client.db(configuration.database);

        db.admin().addUser('kay:kay', 'abc123', function(err, result) {
          test.equal(null, err);
          client.close();

          MongoClient.connect('mongodb://kay%3Akay:abc123@localhost:27017/admin', function(
            err,
            db
          ) {
            // restart server
            configuration.manager.restart(true).then(function() {
              test.done();
            });
          });
        });
      });
    });
  }
};

/**
 * Retrieve the server information for the current
 * instance of the db client
 *
 * @ignore
 */
exports.shouldCorrectlyCallValidateCollectionUsingAuthenticatedMode = {
  metadata: { requires: { topology: ['single', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var client = configuration.newDbInstance(configuration.writeConcernMax(), { poolSize: 1 });
    client.connect(function(err, client) {
      var db = client.db(configuration.database);
      var collection = db.collection('shouldCorrectlyCallValidateCollectionUsingAuthenticatedMode');
      collection.insert({ a: 1 }, { w: 1 }, function(err, doc) {
        var adminDb = db.admin();
        adminDb.addUser('admin', 'admin', configuration.writeConcernMax(), function(err, result) {
          test.equal(null, err);

          MongoClient.connect('mongodb://admin:admin@localhost:27017/admin', function(err, client) {
            test.equal(null, err);

            adminDb.validateCollection(
              'shouldCorrectlyCallValidateCollectionUsingAuthenticatedMode',
              function(err, doc) {
                test.equal(null, err);
                test.ok(doc != null);

                adminDb.removeUser('admin', function(err) {
                  test.equal(null, err);

                  client.close();
                  test.done();
                });
              }
            );
          });
        });
      });
    });
  }
};

/**
 * @ignore
 */
exports['Should correctly issue authenticated event on successful authentication'] = {
  metadata: { requires: { topology: 'single' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var client = configuration.newDbInstance({ w: 1 }, { poolSize: 1 });

    // DOC_LINE var client = new MongoClient(new Server('localhost', 27017));
    // DOC_START
    // Establish connection to db
    client.connect(function(err, client) {
      var db = client.db(configuration.database);
      // Grab a collection object
      var collection = db.collection('test');

      // Force the creation of the collection by inserting a document
      // Collections are not created until the first document is inserted
      collection.insert({ a: 1 }, { w: 1 }, function(err, doc) {
        // Use the admin database for the operation
        var adminDb = db.admin();

        // Add the new user to the admin database
        adminDb.addUser('admin15', 'admin15', function(err, result) {
          test.equal(null, err);
          test.ok(result != null);
          client.close();

          client = new MongoClient('mongodb://admin15:admin15@localhost:27017/admin');
          client.once('authenticated', function() {
            test.done();
          });

          // Authenticate using the newly added user
          client.connect('mongodb://admin15:admin15@localhost:27017/admin', function(err, client) {
            test.equal(null, err);
            client.close();
          });
        });
      });
    });
    // DOC_END
  }
};

exports['Should correctly authenticate against normal db'] = {
  metadata: { requires: { topology: ['auth'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var Db = configuration.require.Db,
      MongoClient = configuration.require.MongoClient,
      Server = configuration.require.Server;

    // restart server
    configuration.manager.restart(true).then(function() {
      var client = new MongoClient(new Server('127.0.0.1', 27017, { auto_reconnect: true }), {
        w: 1
      });
      client.connect(function(err, client) {
        test.equal(null, err);
        var db = client.db(configuration.database);
        // console.log("------------------- 0")

        // An admin user must be defined for db level authentication to work correctly
        db.admin().addUser('admin', 'admin', function(err, result) {
          // console.log("------------------- 1")
          client.close();

          new MongoClient(new Server('127.0.0.1', 27017, { auto_reconnect: true }), {
            w: 1,
            user: 'admin',
            password: 'admin',
            authSource: 'admin'
          }).connect(function(err, client) {
            test.equal(null, err);
            var db = client.db(configuration.database);
            // console.log("------------------- 2")

            db.addUser('user', 'user', function(err, result) {
              // console.log("------------------- 3")
              // console.dir(err)
              test.equal(null, err);

              // Logout admin
              client.logout(function(err, result) {
                // console.log("------------------- 4")

                // Attempt to save a document
                db.collection('test').insert({ a: 1 }, function(err, result) {
                  // console.log("------------------- 5")
                  test.ok(err != null);

                  // // Login the user
                  // db.authenticate("user", "user", function(err, result) {
                  new MongoClient(new Server('127.0.0.1', 27017, { auto_reconnect: true }), {
                    w: 1,
                    user: 'user',
                    password: 'user',
                    authSource: configuration.database
                  }).connect(function(err, client) {
                    test.equal(null, err);
                    var db = client.db(configuration.database);
                    // console.log("------------------- 6")
                    test.equal(null, err);

                    db.collection('test').insert({ a: 1 }, function(err, result) {
                      // console.log("------------------- 7")
                      test.equal(null, err);

                      // Logout the user
                      client.logout(function(err, result) {
                        // console.log("------------------- 8")
                        test.equal(null, err);

                        // Attempt to save a document
                        db.collection('test').insert({ a: 1 }, function(err, result) {
                          // console.log("------------------- 9")
                          test.ok(err != null);
                          client.close();

                          // restart server
                          configuration.manager.restart(true).then(function() {
                            // console.log("------------------- 10")
                            test.done();
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
};

exports['Should correctly reapply the authentications'] = {
  metadata: { requires: { topology: ['auth'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var Db = configuration.require.Db,
      MongoClient = configuration.require.MongoClient,
      Server = configuration.require.Server;

    // restart server
    configuration.manager.restart(true).then(function() {
      var client = new MongoClient(new Server('localhost', 27017, { auto_reconnect: true }), {
        w: 1
      });
      client.connect(function(err, client) {
        test.equal(null, err);
        var db = client.db(configuration.database);

        db.admin().addUser('admin', 'admin', function(err, result) {
          test.equal(null, err);

          // Attempt to save a document
          db.collection('test').insert({ a: 1 }, function(err, result) {
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
              var db = client.db(configuration.database);
              test.equal(null, err);

              db.collection('test').insert({ a: 1 }, function(err, result) {
                test.equal(null, err);

                // Bounce server
                configuration.manager.restart(false).then(function() {
                  // Reconnect should reapply the credentials
                  db.collection('test').insert({ a: 1 }, function(err, result) {
                    test.equal(null, err);
                  });

                  db.collection('test').insert({ a: 1 }, function(err, result) {
                    test.equal(null, err);
                  });

                  db.collection('test').insert({ a: 1 }, function(err, result) {
                    test.equal(null, err);
                  });

                  // Reconnect should reapply the credentials
                  db.collection('test').insert({ a: 1 }, function(err, result) {
                    test.equal(null, err);

                    client.close();

                    // restart server
                    configuration.manager.restart(true).then(function() {
                      test.done();
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
};

exports['Ordered bulk operation should fail correctly when not authenticated'] = {
  metadata: { requires: { topology: ['auth'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var Db = configuration.require.Db,
      MongoClient = configuration.require.MongoClient,
      Server = configuration.require.Server;

    // restart server
    configuration.manager.restart(true).then(function() {
      var client = new MongoClient(new Server('127.0.0.1', 27017, { auto_reconnect: true }), {
        w: 1
      });
      client.connect(function(err, client) {
        test.equal(null, err);
        var db = client.db(configuration.database);

        // console.log("------------------- 0")

        db.admin().addUser('admin', 'admin', function(err, result) {
          // console.log("------------------- 1")
          test.equal(null, err);

          // Attempt to save a document
          var col = db.collection('test');

          // Initialize the Ordered Batch
          var batch = col.initializeOrderedBulkOp();

          // Add some operations to be executed in order
          batch.insert({ a: 1 });
          batch.find({ a: 1 }).updateOne({ $set: { b: 1 } });
          batch.find({ a: 2 }).upsert().updateOne({ $set: { b: 2 } });
          batch.insert({ a: 3 });
          batch.find({ a: 3 }).remove({ a: 3 });

          // Execute the operations
          batch.execute(function(err, result) {
            // console.log("------------------- 2")
            test.ok(err != null);
            test.ok(err.code != null);
            test.ok(err.errmsg != null);

            configuration.manager.restart(true).then(function() {
              // console.log("------------------- 3")
              client.close();
              test.done();
            });
          });
        });
      });
    });
  }
};

exports['Unordered bulk operation should fail correctly when not authenticated'] = {
  metadata: { requires: { topology: ['auth'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var Db = configuration.require.Db,
      MongoClient = configuration.require.MongoClient,
      Server = configuration.require.Server;

    // restart server
    configuration.manager.restart(true).then(function() {
      var client = new MongoClient(new Server('127.0.0.1', 27017, { auto_reconnect: true }), {
        w: 1
      });
      client.connect(function(err, client) {
        test.equal(null, err);
        var db = client.db(configuration.database);

        db.admin().addUser('admin', 'admin', function(err, result) {
          test.equal(null, err);

          // Attempt to save a document
          var col = db.collection('test');

          // Initialize the Ordered Batch
          var batch = col.initializeUnorderedBulkOp();

          // Add some operations to be executed in order
          batch.insert({ a: 1 });
          batch.find({ a: 1 }).updateOne({ $set: { b: 1 } });
          batch.find({ a: 2 }).upsert().updateOne({ $set: { b: 2 } });
          batch.insert({ a: 3 });
          batch.find({ a: 3 }).remove({ a: 3 });

          // Execute the operations
          batch.execute(function(err, result) {
            test.ok(err != null);
            test.ok(err.code != null);
            test.ok(err.errmsg != null);

            configuration.manager.restart(true).then(function() {
              client.close();
              test.done();
            });
          });
        });
      });
    });
  }
};

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

var replSetManager;

var setUp = function(configuration, options, callback) {
  var ReplSetManager = require('mongodb-topology-manager').ReplSet,
    Db = configuration.require.Db,
    Server = configuration.require.Server,
    MongoClient = configuration.require.MongoClient;

  // Check if we have any options
  if (typeof options == 'function') (callback = options), (options = null);

  // Override options
  if (options) {
    var rsOptions = options;
  } else {
    var rsOptions = {
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

  // console.log("--------------------- setup 0")
  // Merge in any node start up options
  for (var i = 0; i < nodes.length; i++) {
    for (var name in rsOptions.server) {
      nodes[i].options[name] = rsOptions.server[name];
    }
  }

  // Create a manager
  var replicasetManager = new ReplSetManager('mongod', nodes, rsOptions.client);
  // console.log("--------------------- setup 1")
  // Purge the set
  replicasetManager.purge().then(function() {
    // console.log("--------------------- setup 2")
    // Start the server
    replicasetManager
      .start()
      .then(function() {
        // console.log("--------------------- setup 3")
        setTimeout(function() {
          // console.log("--------------------- setup 4")
          callback(null, replicasetManager);
        }, 10000);
      })
      .catch(function(e) {
        console.log(e.stack);
        process.exit(0);
        // // console.dir(e);
      });
  });
};

/**
 * @ignore
 */
exports['Should correctly handle replicaset master stepdown and stepup without loosing auth'] = {
  metadata: { requires: { topology: ['auth'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var Db = configuration.require.Db,
      MongoClient = configuration.require.MongoClient,
      Server = configuration.require.Server,
      ReplSet = configuration.require.ReplSet;

    setUp(configuration, function(err, replicasetManager) {
      var replSet = new ReplSet([new Server('localhost', 31000), new Server('localhost', 31001)], {
        rs_name: 'rs',
        poolSize: 1
      });

      // Connect
      new MongoClient(replSet, { w: 1 }).connect(function(err, client) {
        test.equal(null, err);
        var db = client.db(configuration.database);

        // Add a user
        db.admin().addUser('root', 'root', { w: 3, wtimeout: 25000 }, function(err, result) {
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
            var db = client.db(configuration.database);

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
                db
                  .collection('replicaset_test_auth')
                  .insert({ a: 1 }, { w: 1 }, function(err, result) {
                    test.equal(null, err);

                    client.close();

                    replicasetManager.stop().then(function() {
                      test.done();
                    });
                  });
              })
              .catch(function(e) {
                // // console.log(e.stack);
              });
          });
        });
      });
    });
  }
};

/**
 * @ignore
 */
exports[
  'Should correctly perform nearest read from secondaries without auth fail when priamry is first seed'
] = {
  metadata: { requires: { topology: ['auth'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var Db = configuration.require.Db,
      Server = configuration.require.Server,
      ReadPreference = configuration.require.ReadPreference,
      MongoClient = configuration.require.MongoClient,
      ReplSet = configuration.require.ReplSet;

    setUp(configuration, function(err, replicasetManager) {
      var replSet = new ReplSet([new Server('localhost', 31000), new Server('localhost', 31001)], {
        rs_name: 'rs',
        poolSize: 1
      });

      // Connect
      new MongoClient(replSet, {
        w: 1,
        readPreference: ReadPreference.NEAREST
      }).connect(function(err, client) {
        test.equal(null, err);
        var db = client.db(configuration.database);

        // Add a user
        db.admin().addUser('root', 'root', { w: 3, wtimeout: 25000 }, function(err, result) {
          test.equal(null, err);

          client.close();

          MongoClient.connect(
            'mongodb://root:root@localhost:31000,localhost:31001,localhost:31002/admin?replicaSet=rs&readPreference=nearest',
            function(err, client) {
              test.equal(null, err);
              var db = client.db(configuration.database);

              db
                .collection('replicaset_test_auth')
                .insert({ a: 1 }, { w: 1 }, function(err, result) {
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
                            test.done();
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
};

/**
 * @ignore
 */
exports['Should correctly create indexes without hanging when different seedlists'] = {
  metadata: { requires: { topology: ['auth'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var Db = configuration.require.Db,
      Server = configuration.require.Server,
      ReadPreference = configuration.require.ReadPreference,
      MongoClient = configuration.require.MongoClient,
      ReplSet = configuration.require.ReplSet;

    setUp(configuration, function(err, replicasetManager) {
      var replSet = new ReplSet([new Server('localhost', 31000), new Server('localhost', 31001)], {
        rs_name: 'rs',
        poolSize: 1
      });

      // Connect
      new MongoClient(replSet, {
        w: 1,
        readPreference: ReadPreference.NEAREST
      }).connect(function(err, client) {
        test.equal(null, err);
        var db = client.db(configuration.database);

        // Add a user
        db.admin().addUser('root', 'root', { w: 3, wtimeout: 25000 }, function(err, result) {
          test.equal(null, err);

          client.close();

          MongoClient.connect(
            'mongodb://root:root@localhost:31000,localhost:31001,localhost:31002/admin?replicaSet=rs&readPreference=secondary',
            function(err, client) {
              test.equal(null, err);
              var db = client.db(configuration.database);

              // Attempt create index
              client
                .db('replicaset_test_auth')
                .collection('createIndexes1')
                .ensureIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }, function(err, r) {
                  test.equal(null, err);
                  client.close();

                  MongoClient.connect(
                    'mongodb://root:root@localhost:31002/admin?replicaSet=rs&readPreference=secondary',
                    function(err, client) {
                      test.equal(null, err);
                      var db = client.db(configuration.database);

                      client
                        .db('replicaset_test_auth')
                        .collection('createIndexes2')
                        .ensureIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }, function(err, r) {
                          test.equal(null, err);
                          client.close();

                          replicasetManager.stop().then(function() {
                            test.done();
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
};

/**
 * @ignore
 */
exports.shouldCorrectlyAuthenticateUsingPrimary = {
  metadata: { requires: { topology: ['auth'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient,
      Db = configuration.require.Db,
      Server = configuration.require.Server,
      ReplSet = configuration.require.ReplSet;

    setUp(configuration, function(err, replicasetManager) {
      var replSet = new ReplSet([new Server('localhost', 31000), new Server('localhost', 31001)], {
        rs_name: 'rs',
        poolSize: 1
      });

      var client = new MongoClient(replSet, { w: 1 });
      client.connect(function(err, p_db) {
        test.equal(null, err);
        var db = client.db(configuration.database);

        // Add a user
        db.admin().addUser('admin', 'admin', { w: 3, wtimeout: 25000 }, function(err, result) {
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
            var db = client.db(configuration.database);

            // Add a user to the db
            db.addUser('me', 'secret', { w: 3, wtimeout: 25000 }, function(err, result) {
              test.equal(null, err);

              // Close the connection
              client.close();

              // connection string
              var config = f(
                'mongodb://me:secret@localhost:%s/%s?replicaSet=%s',
                31000,
                configuration.database,
                'rs'
              );
              // Connect
              MongoClient.connect(config, function(err, client) {
                test.equal(null, err);
                var db = client.db(configuration.database);

                db.collections(function(err, names) {
                  test.equal(null, err);

                  client.close();

                  replicasetManager.stop().then(function() {
                    test.done();
                  });
                });
              });
            });
          });
        });
      });
    });
  }
};

/**
 * @ignore
 */
exports.shouldCorrectlyAuthenticateWithTwoSeeds = {
  metadata: { requires: { topology: ['auth'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient,
      Db = configuration.require.Db,
      Server = configuration.require.Server,
      ReplSet = configuration.require.ReplSet;

    setUp(configuration, function(err, replicasetManager) {
      var replSet = new ReplSet([new Server('localhost', 31000), new Server('localhost', 31001)], {
        rs_name: 'rs',
        poolSize: 1
      });

      var client = new MongoClient(replSet, { w: 1 });
      client.connect(function(err, client) {
        test.equal(null, err);
        var db = client.db(configuration.database);

        // Add a user
        db.admin().addUser('admin', 'admin', { w: 3, wtimeout: 25000 }, function(err, result) {
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
            var db = client.db(configuration.database);

            db.addUser('me', 'secret', { w: 3, wtimeout: 25000 }, function(err, result) {
              // Close the connection
              client.close();

              // connection string
              var config = f(
                'mongodb://me:secret@localhost:%s,localhost:%s/%s?replicaSet=%s',
                31000,
                31001,
                configuration.database,
                'rs'
              );
              // Connect
              MongoClient.connect(config, function(error, client) {
                test.equal(null, error);
                var db = client.db(configuration.database);

                db.collections(function(error, names) {
                  test.equal(null, err);

                  client.close();

                  replicasetManager.stop().then(function() {
                    test.done();
                  });
                });
              });
            });
          });
        });
      });
    });
  }
};

/**
 * @ignore
 */
exports.shouldCorrectlyAuthenticateWithOnlySecondarySeed = {
  metadata: { requires: { topology: ['auth'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient,
      Db = configuration.require.Db,
      Server = configuration.require.Server,
      ReplSet = configuration.require.ReplSet;

    setUp(configuration, function(err, replicasetManager) {
      var replSet = new ReplSet([new Server('localhost', 31000), new Server('localhost', 31001)], {
        rs_name: 'rs',
        poolSize: 1
      });

      var client = new MongoClient(replSet, { w: 1 });
      client.on('all', function(client) {
        test.equal(null, err);
        var p_db = client.db(configuration.database);

        // console.log("------------------------------------------- 0")
        // Add a user
        p_db.admin().addUser('admin', 'admin', { w: 3, wtimeout: 25000 }, function(err, result) {
          test.equal(null, err);
          client.close();
          // console.log("------------------------------------------- 1")

          new MongoClient(
            new ReplSet([new Server('localhost', 31000), new Server('localhost', 31001)], {
              rs_name: 'rs',
              poolSize: 1
            }),
            { w: 1, user: 'admin', password: 'admin', authSource: 'admin' }
          ).connect(function(err, client) {
            test.equal(null, err);
            var p_db = client.db(configuration.database);

            // console.log("------------------------------------------- 2")

            p_db.admin().addUser('me', 'secret', { w: 3, wtimeout: 25000 }, function(err, result) {
              // console.log("------------------------------------------- 3")
              // Close the connection
              client.close();

              // connection string
              var config = f(
                'mongodb://me:secret@localhost:%s/%s?authSource=admin&readPreference=secondary&replicaSet=%s&maxPoolSize=1',
                31000,
                configuration.database,
                'rs'
              );

              // Connect
              MongoClient.connect(config, function(err, client) {
                test.equal(null, err);
                var db = client.db(configuration.database);

                // console.log("------------------------------------------- 4")
                db.collection('test').insert({ a: 1 }, function(err, r) {
                  // console.log("------------------------------------------- 5")
                  test.equal(null, err);

                  // Logout
                  client.logout(function() {
                    // console.log("------------------------------------------- 6")

                    // Should fail
                    db.collection('test').findOne(function(err, r) {
                      // console.log("------------------------------------------- 7")
                      test.ok(err != null);

                      // Connect
                      MongoClient.connect(config, function(err, client) {
                        test.equal(null, err);
                        var db = client.db(configuration.database);
                        // console.log("------------------------------------------- 8")
                        // // console.dir(err)

                        replicasetManager
                          .secondaries()
                          .then(function(managers) {
                            // console.log("------------------------------------------- 9")
                            // Shutdown the first secondary
                            managers[0]
                              .stop()
                              .then(function(err, result) {
                                // console.log("------------------------------------------- 10")

                                // Shutdown the second secondary
                                managers[1]
                                  .stop()
                                  .then(function(err, result) {
                                    // console.log("------------------------------------------- 11")

                                    // Let's restart a secondary
                                    managers[0]
                                      .start()
                                      .then(function(err, result) {
                                        // console.log("------------------------------------------- 12")

                                        // Let's restart a secondary
                                        managers[1]
                                          .start()
                                          .then(function(err, result) {
                                            client.topology.once('joined', function() {
                                              // console.log("------------------------------------------- 13")
                                              // // console.dir(err)
                                              // Should fail
                                              db.collection('test').findOne(function(err) {
                                                // console.log("------------------------------------------- 14")
                                                // // console.dir(err)
                                                test.equal(null, err);

                                                client.close();

                                                replicasetManager.stop().then(function() {
                                                  test.done();
                                                });
                                              });
                                            });
                                          })
                                          .catch(function(e) {
                                            // // console.log(e.stack);
                                          });
                                      })
                                      .catch(function(e) {
                                        // // console.log(e.stack);
                                      });
                                  })
                                  .catch(function(e) {
                                    // // console.log(e.stack);
                                  });
                              })
                              .catch(function(e) {
                                // // console.log(e.stack);
                              });
                          })
                          .catch(function(e) {
                            // // console.log(e.stack);
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

      client.connect(function(err, p_db) {});
    });
  }
};

/**
 * @ignore
 */
exports.shouldCorrectlyAuthenticateAndEnsureIndex = {
  metadata: { requires: { topology: ['auth'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient,
      Db = configuration.require.Db,
      Server = configuration.require.Server,
      ReadPreference = configuration.require.ReadPreference,
      ReplSet = configuration.require.ReplSet;

    setUp(configuration, function(err, replicasetManager) {
      var replSet = new ReplSet([new Server('localhost', 31000), new Server('localhost', 31001)], {
        rs_name: 'rs',
        poolSize: 1
      });

      var client = new MongoClient(replSet, { w: 1 });
      client.connect(function(err, client) {
        test.equal(null, err);
        var db_p = client.db(configuration.database);

        db_p.admin().addUser('me', 'secret', { w: 3 }, function runWhatever(err, result) {
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
            var db_p = client.db(configuration.database);

            db_p.addUser('test', 'test', { w: 3, wtimeout: 25000 }, function(err, result) {
              test.equal(null, err);
              client.close();

              new MongoClient(
                new ReplSet([new Server('localhost', 31000), new Server('localhost', 31001)], {
                  rs_name: 'rs',
                  poolSize: 1
                }),
                { w: 1, user: 'test', password: 'test', authSource: configuration.database }
              ).connect(function(err, client) {
                test.equal(null, err);
                var db_p = client.db(configuration.database);

                db_p.collection('userconfirm', function(err, result) {
                  test.equal(null, err);

                  var userconfirm = result;
                  var ensureIndexOptions = { unique: true, w: 0, background: true };
                  userconfirm.ensureIndex([['confirmcode', 1]], ensureIndexOptions, function(
                    err,
                    item
                  ) {
                    test.equal(null, err);

                    db_p.collection('session', function(err, result) {
                      test.equal(null, err);

                      var session = result;
                      session.ensureIndex([['sid', 1]], ensureIndexOptions, function(err, res) {
                        test.equal(null, err);

                        client.close();

                        replicasetManager.stop().then(function() {
                          test.done();
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
};

/**
 * @ignore
 */
exports.shouldCorrectlyAuthenticateAndUseReadPreference = {
  metadata: { requires: { topology: ['auth'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient,
      Db = configuration.require.Db,
      Server = configuration.require.Server,
      ReadPreference = configuration.require.ReadPreference,
      ReplSet = configuration.require.ReplSet;

    setUp(configuration, function(err, replicasetManager) {
      var replSet = new ReplSet([new Server('localhost', 31000), new Server('localhost', 31001)], {
        rs_name: 'rs',
        poolSize: 1
      });

      var client = new MongoClient(replSet, { w: 1 });
      client.connect(function(err, client) {
        test.equal(null, err);
        var db_p = client.db(configuration.database);

        db_p
          .admin()
          .addUser('me', 'secret', { w: 3, wtimeout: 25000 }, function runWhatever(err, result) {
            new MongoClient(
              new ReplSet([new Server('localhost', 31000), new Server('localhost', 31001)], {
                rs_name: 'rs',
                poolSize: 1
              }),
              { w: 1, user: 'me', password: 'secret', authSource: 'admin' }
            ).connect(function(err, client) {
              test.equal(null, err);
              var db_p = client.db(configuration.database);

              db_p.addUser('test', 'test', { w: 3, wtimeout: 25000 }, function(err, result) {
                test.equal(null, err);
                client.close();

                new MongoClient(
                  new ReplSet([new Server('localhost', 31000), new Server('localhost', 31001)], {
                    rs_name: 'rs',
                    poolSize: 1
                  }),
                  { w: 1, user: 'test', password: 'test', authSource: configuration.database }
                ).connect(function(err, client) {
                  test.equal(null, err);
                  var db_p = client.db(configuration.database);

                  db_p.collection('userconfirm2').insert({ a: 1 }, { w: 1 }, function(err, result) {
                    test.equal(null, err);

                    db_p.collection('userconfirm2').findOne(function(err, item) {
                      test.equal(null, err);
                      test.equal(1, item.a);
                      client.close();

                      replicasetManager.stop().then(function() {
                        test.done();
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
};

/**
 * @ignore
 */
exports.shouldCorrectlyBringReplicasetStepDownPrimaryAndStillReadFromSecondary = {
  metadata: { requires: { topology: ['auth'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient,
      Db = configuration.require.Db,
      Server = configuration.require.Server,
      ReadPreference = configuration.require.ReadPreference,
      ReplSet = configuration.require.ReplSet;

    setUp(configuration, function(err, replicasetManager) {
      var replSet = new ReplSet([new Server('localhost', 31000), new Server('localhost', 31001)], {
        rs_name: 'rs',
        poolSize: 1
      });

      var client = new MongoClient(replSet, { w: 1 });
      client.on('all', function(client) {
        test.ok(client != null);
        var db_p = client.db(configuration.database);

        // console.log("-------------------------------------------------- 0")
        db_p
          .admin()
          .addUser('me', 'secret', { w: 3, wtimeout: 25000 }, function runWhatever(err, result) {
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
              var db_p = client.db(configuration.database);

              // // console.log("-------------------------------------------------- 1")
              // db_p.admin().authenticate("me", "secret", function(err, result) {
              // console.log("-------------------------------------------------- 2")
              // test.equal(null, err);

              db_p.collection('test').insert({ a: 1 }, { w: 1 }, function(err, result) {
                // console.log("-------------------------------------------------- 3")
                test.equal(null, err);

                db_p.addUser('test', 'test', { w: 3, wtimeout: 25000 }, function(err, result) {
                  // console.log("-------------------------------------------------- 4")
                  test.equal(null, err);
                  test.ok(result != null);

                  client.topology.on('joined', function(t, o, s) {
                    // console.log("-------------------------------------------------- joined 5 :: " + t + " :: " + s.name)
                    if (t == 'primary') {
                      // console.log("-------------------------------------------------- 6")
                      var counter = 10;
                      var errors = 0;

                      for (var i = 0; i < counter; i++) {
                        db_p
                          .collection('test')
                          .find({ a: 1 })
                          .setReadPreference(ReadPreference.SECONDARY)
                          .toArray(function(err, r) {
                            // console.log("-------------------------------------------------- 7")
                            // console.dir(err)
                            counter = counter - 1;

                            if (err != null) {
                              errors = errors + 1;
                            }

                            if (counter == 0) {
                              test.equal(0, errors);

                              client.close();

                              replicasetManager.stop().then(function() {
                                test.done();
                              });
                            }
                          });
                      }
                    }
                  });

                  client.topology.on('left', function(t, s) {
                    // console.log("-------------------------------------------------- left 5 :: " + t + " :: " + s.name)
                  });

                  // // console.log("^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ SHUTDOWN 0")
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
                    .then(function() {
                      // // console.log("^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ SHUTDOWN 1")
                    })
                    .catch(function(e) {});
                });
              });
            });
          });
      });

      client.connect(function() {});
    });
  }
};

/**
 * @ignore
 */
exports.shouldCorrectlyAuthWithSecondaryAfterKillPrimary = {
  metadata: { requires: { topology: ['auth'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient,
      Db = configuration.require.Db,
      Server = configuration.require.Server,
      ReadPreference = configuration.require.ReadPreference,
      ReplSet = configuration.require.ReplSet;

    setUp(configuration, function(err, replicasetManager) {
      var replSet = new ReplSet([new Server('localhost', 31000), new Server('localhost', 31001)], {
        rs_name: 'rs',
        poolSize: 1
      });

      var client = new MongoClient(replSet, { w: 1 });
      client.connect(function(err, client) {
        test.equal(null, err);
        var db_p = client.db(configuration.database);

        // Add a user
        db_p.admin().addUser('admin', 'admin', { w: 3, wtimeout: 25000 }, function(err, result) {
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
            var db_p = client.db(configuration.database);

            db_p.collection('test').insert({ a: 1 }, { w: 1 }, function(err, result) {
              test.equal(null, err);

              db_p.addUser('test', 'test', { w: 3, wtimeout: 25000 }, function(err, result) {
                test.equal(null, err);
                client.close();

                new MongoClient(
                  new ReplSet([new Server('localhost', 31000), new Server('localhost', 31001)], {
                    rs_name: 'rs',
                    poolSize: 1
                  }),
                  { w: 1, user: 'test', password: 'test', authSource: configuration.database }
                ).connect(function(err, client) {
                  test.equal(null, err);
                  var db_p = client.db(configuration.database);

                  // shutdown the primary
                  replicasetManager.primary().then(function(primary) {
                    primary.stop().then(function() {
                      db_p.serverConfig.on('joined', function(t) {
                        if (t == 'primary') {
                          var counter = 1000;
                          var errors = 0;

                          for (var i = 0; i < counter; i++) {
                            db_p
                              .collection('test')
                              .find({ a: 1 })
                              .setReadPreference(ReadPreference.SECONDARY)
                              .toArray(function(err, r) {
                                test.equal(null, err);
                                counter = counter - 1;

                                if (counter == 0) {
                                  test.equal(0, errors);

                                  client.close();

                                  replicasetManager.stop().then(function() {
                                    test.done();
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
};

/**
 * @ignore
 */
exports.shouldCorrectlyAuthAgainstReplicaSetAdminDbUsingMongoClient = {
  metadata: { requires: { topology: ['auth'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient,
      Db = configuration.require.Db,
      Server = configuration.require.Server,
      ReadPreference = configuration.require.ReadPreference,
      ReplSet = configuration.require.ReplSet;

    setUp(configuration, function(err, replicasetManager) {
      var replSet = new ReplSet([new Server('localhost', 31000), new Server('localhost', 31001)], {
        rs_name: 'rs',
        poolSize: 1
      });

      // console.log("--------------------------------------------- 0")
      var client = new MongoClient(replSet, { w: 3 });
      client.connect(function(err, client) {
        // console.log("--------------------------------------------- 1")
        test.equal(null, err);
        var db_p = client.db(configuration.database);

        db_p
          .admin()
          .addUser('me', 'secret', { w: 3, wtimeout: 25000 }, function runWhatever(err, result) {
            test.equal(null, err);
            client.close();
            // console.log("--------------------------------------------- 2")

            MongoClient.connect(
              f(
                'mongodb://me:secret@%s:%s/%s?rs_name=%s&readPreference=secondary&w=3',
                'localhost',
                31000,
                'admin',
                'rs'
              ),
              function(err, client) {
                // console.log("--------------------------------------------- 3")
                // console.dir(err)
                // console.dir(err)

                // db.on('all', function(err, db) {
                // console.log("--------------------------------------------- 4")
                test.equal(null, err);
                var db = client.db(configuration.database);

                // Insert document
                db
                  .collection('authcollectiontest')
                  .insert({ a: 1 }, { w: 3, wtimeout: 25000 }, function(err, result) {
                    // console.log("--------------------------------------------- 5")
                    // console.dir(err)
                    test.equal(null, err);

                    // console.log("--------------------------------------------- 5")
                    // Find the document
                    db.collection('authcollectiontest').find().toArray(function(err, docs) {
                      // console.log("--------------------------------------------- 6")
                      // console.dir(err)
                      // test.equal(null, err);
                      test.equal(1, docs.length);
                      test.equal(1, docs[0].a);

                      client.close();

                      replicasetManager.stop().then(function() {
                        // console.log("--------------------------------------------- 7")
                        test.done();
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
};

/**
 * @ignore
 */
exports.shouldCorrectlyAuthAgainstNormalDbUsingMongoClient = {
  metadata: { requires: { topology: ['auth'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient,
      Db = configuration.require.Db,
      Server = configuration.require.Server,
      ReadPreference = configuration.require.ReadPreference,
      ReplSet = configuration.require.ReplSet;

    setUp(configuration, function(err, replicasetManager) {
      // console.log("------------------------------------0")
      var replSet = new ReplSet([new Server('localhost', 31000), new Server('localhost', 31001)], {
        rs_name: 'rs',
        poolSize: 1
      });

      new MongoClient(replSet, { w: 3 }).connect(function(err, client) {
        test.equal(null, err);
        var db_p = client.db(configuration.database);

        // console.log("------------------------------------1")
        // db_p.on('all', function(err, db) {
        // console.log("------------------------------------2")
        // Add a user
        db_p.admin().addUser('admin', 'admin', { w: 3, wtimeout: 25000 }, function(err, result) {
          test.equal(null, err);
          client.close();
          // console.log("------------------------------------3")

          new MongoClient(
            new ReplSet([new Server('localhost', 31000), new Server('localhost', 31001)], {
              rs_name: 'rs',
              poolSize: 1
            }),
            { w: 1, user: 'admin', password: 'admin', authSource: 'admin' }
          ).connect(function(err, client) {
            test.equal(null, err);
            var db_p = client.db(configuration.database);

            // // Log in to admin
            // db_p.admin().authenticate("admin", "admin", function(err, result) {
            // console.log("------------------------------------4")
            // test.equal(null, err);

            db_p.addUser('me', 'secret', { w: 3, wtimeout: 25000 }, function runWhatever(
              err,
              result
            ) {
              test.equal(null, err);
              // console.log("------------------------------------5")

              client.close();

              // console.log("------------------------------------6")
              MongoClient.connect(
                f(
                  'mongodb://me:secret@%s:%s/%s?rs_name=%s&readPreference=secondary&w=3',
                  'localhost',
                  31000,
                  configuration.database,
                  'rs'
                ),
                function(err, client) {
                  // console.log("------------------------------------7")
                  test.equal(null, err);
                  var db = client.db(configuration.database);

                  // Insert document
                  db
                    .collection('authcollectiontest1')
                    .insert({ a: 1 }, { w: 3, wtimeout: 25000 }, function(err, result) {
                      // console.log("------------------------------------9")
                      test.equal(null, err);

                      // Find the document
                      db.collection('authcollectiontest1').find().toArray(function(err, docs) {
                        // console.log("------------------------------------10")
                        test.equal(null, err);
                        test.equal(1, docs.length);
                        test.equal(1, docs[0].a);

                        client.close();

                        replicasetManager.stop().then(function() {
                          // console.log("------------------------------------11")
                          test.done();
                        });
                      });
                    });
                }
              );
            });
          });
        });
        // });
      });
    });
  }
};

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

var shardedManager;

var setUpSharded = function(configuration, options, callback) {
  // var ShardingManager = require('mongodb-tools').ShardingManager
  var ShardingManager = require('../topology_test_definitions').Sharded,
    Db = configuration.require.Db,
    Server = configuration.require.Server,
    MongoClient = configuration.require.MongoClient,
    path = require('path');

  // Check if we have any options
  if (typeof options == 'function') (callback = options), (options = null);

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
        // // console.log(e.stack)
      });
  });
};

/**
 * @ignore
 */
exports['should correctly connect and authenticate against admin database using mongos'] = {
  metadata: { requires: { topology: ['auth'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient,
      Db = configuration.require.Db,
      Server = configuration.require.Server,
      Mongos = configuration.require.Mongos;

    setUpSharded(configuration, function(err, manager) {
      var mongos = new Mongos([new Server('localhost', 51000)], { poolSize: 1 });

      var client = new MongoClient(mongos, { w: 1 });
      client.connect(function(err, client) {
        test.equal(null, err);
        var db = client.db(configuration.database);

        // Add a user
        db.admin().addUser('admin', 'admin', { w: 'majority' }, function(err, result) {
          test.equal(null, err);
          client.close();

          new MongoClient(new Mongos([new Server('localhost', 51000)], { poolSize: 1 }), {
            w: 1,
            user: 'admin',
            password: 'admin',
            authSource: 'admin'
          }).connect(function(err, client) {
            test.equal(null, err);
            var db = client.db(configuration.database);

            db.addUser('me', 'secret', { w: 'majority' }, function(err, result) {
              // Close the connection
              client.close();

              setTimeout(function() {
                // connection string
                var config = f(
                  'mongodb://me:secret@localhost:%s/%s',
                  51000,
                  configuration.database
                );
                // Connect
                MongoClient.connect(config, function(error, client) {
                  test.equal(null, error);
                  var db = client.db(configuration.database);

                  db.collections(function(error, names) {
                    test.equal(null, error);

                    client.close();

                    manager.stop().then(function() {
                      test.done();
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
};

/**
 * @ignore
 */
exports['Should correctly handle proxy stepdown and stepup without loosing auth for sharding'] = {
  metadata: { requires: { topology: ['auth'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient,
      Db = configuration.require.Db,
      Server = configuration.require.Server,
      Mongos = configuration.require.Mongos;

    setUpSharded(configuration, function(err, manager) {
      var mongos = new Mongos([new Server('localhost', 51000)], { poolSize: 1 });

      var client = new MongoClient(mongos, { w: 1 });
      client.connect(function(err, client) {
        test.equal(null, err);
        var db = client.db(configuration.database);

        // Add a user
        db.admin().addUser('admin', 'admin', { w: 'majority' }, function(err, result) {
          test.equal(null, err);
          client.close();

          new MongoClient(new Mongos([new Server('localhost', 51000)], { poolSize: 1 }), {
            w: 1,
            user: 'admin',
            password: 'admin',
            authSource: 'admin'
          }).connect(function(err, client) {
            test.equal(null, err);
            var db = client.db(configuration.database);

            db.addUser('me', 'secret', { w: 'majority' }, function(err, result) {
              // Close the connection
              client.close();

              // connection string
              var config = f('mongodb://me:secret@localhost:%s/%s', 51000, configuration.database);
              // Connect
              MongoClient.connect(config, function(error, client) {
                test.equal(null, error);
                var db = client.db(configuration.database);

                db.collections(function(error, names) {
                  test.equal(null, error);

                  // Get the proxies
                  var proxies = manager.proxies();

                  proxies[0].stop().then(function() {
                    proxies[1].stop().then(function() {
                      db.collections(function(error, names) {
                        test.equal(null, error);
                      });

                      proxies[0].start().then(function() {
                        proxies[1].start().then(function() {
                          db.collections(function(error, names) {
                            test.equal(null, error);

                            client.close();

                            manager.stop().then(function() {
                              test.done();
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
};
