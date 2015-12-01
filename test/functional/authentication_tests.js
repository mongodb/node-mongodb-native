"use strict";

var f = require('util').format,
  fs = require('fs');

/**
 * Fail due to illegal authentication mechanism
 *
 * @ignore
 */
exports['should fail due to illegal authentication mechanism'] = {
  metadata: { requires: { topology: ['auth'], mongodb: "<=2.6.x" } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var Db = configuration.require.Db
      , MongoClient = configuration.require.MongoClient
      , Server = configuration.require.Server;

    // restart server
    configuration.manager.restart(true).then(function() {
      var db1 = new Db('mongo-ruby-test-auth1', new Server(configuration.host, configuration.port, {auto_reconnect: true}), {w:1});
      db1.open(function(err, db) {
        test.equal(null, err);

        db.admin().addUser('admin', 'admin', function(err, result) {
          test.equal(null, err);

          // Login the user
          db.admin().authenticate("admin", "admin", {
            authMechanism: 'SCRAM-SHA-1'
          }, function(err, result) {
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
}

/**
 * Retrieve the current replicaset status if the server is running as part of a replicaset using a Promise.
 *
 * @example-class Admin
 * @example-method replSetGetStatus
 * @ignore
 */
exports.shouldCorrectlyRetrieveReplSetGetStatusWithPromises = {
  metadata: { requires: { promises:true, topology: 'replset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});

    db.open().then(function(db) {
    // LINE var MongoClient = require('mongodb').MongoClient,
    // LINE   test = require('assert');
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE restartAndDone
    // REMOVE-LINE test.done();
    // BEGIN
      // Grab a collection object
      var collection = db.collection('test_with_promise');

      // Force the creation of the collection by inserting a document
      // Collections are not created until the first document is inserted
      collection.insertOne({'a':1}, {w: 1}).then(function(doc) {
        // Use the admin database for the operation
        var adminDb = db.admin();

        // Add the new user to the admin database
        adminDb.addUser('admin14', 'admin14').then(function(result) {
          test.ok(result != null);

          // Authenticate using the newly added user
          adminDb.authenticate('admin14', 'admin14', configuration.writeConcernMax()).then(function(result) {
            test.equal(true, result);

            // Retrive the server Info, returns error if we are not
            // running a replicaset
            adminDb.replSetGetStatus().then(function(info) {

              adminDb.removeUser('admin14').then(function(result) {
                test.ok(result);

                db.close();
                test.done();
              });
            }).catch(function(err) {
              console.dir(err)
            });
          }).catch(function(err) {
            console.dir(err)
          });
        });
      });
    });
    // END
  }
}

/**
 * Retrieve the server information for the current
 * instance of the db client
 *
 * @ignore
 */
exports.shouldCorrectlyCallValidateCollectionUsingAuthenticatedMode = {
  metadata: { requires: { topology: ['single', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configure, test) {
    var db = configure.newDbInstance({}, {poolSize:1});
    db.open(function(err, db) {
      var collection = db.collection('shouldCorrectlyCallValidateCollectionUsingAuthenticatedMode');
      collection.insert({'a':1}, {w: 1}, function(err, doc) {
        var adminDb = db.admin();
        adminDb.addUser('admin', 'admin', configure.writeConcernMax(), function(err, result) {
          test.equal(null, err);

          adminDb.authenticate('admin', 'admin', function(err, replies) {
            test.equal(null, err);
            test.equal(true, replies);

            adminDb.validateCollection('shouldCorrectlyCallValidateCollectionUsingAuthenticatedMode', function(err, doc) {
              test.equal(null, err);
              test.ok(doc != null);

              adminDb.removeUser('admin', function(err) {
                test.equal(null, err);

                db.close();
                test.done();
              })
            });
          });
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports['Should correctly issue authenticated event on successful authentication'] = {
  metadata: { requires: { topology: 'single' } },

  // The actual test we wish to run
  test: function(configure, test) {
    var db = configure.newDbInstance({w:1}, {poolSize:1});

    db.once('authenticated', function() {
      test.done();
    });

    // DOC_LINE var db = new Db('test', new Server('localhost', 27017));
    // DOC_START
    // Establish connection to db
    db.open(function(err, db) {
      // Grab a collection object
      var collection = db.collection('test');

      // Force the creation of the collection by inserting a document
      // Collections are not created until the first document is inserted
      collection.insert({'a':1}, {w: 1}, function(err, doc) {

        // Use the admin database for the operation
        var adminDb = db.admin();

        // Add the new user to the admin database
        adminDb.addUser('admin15', 'admin15', function(err, result) {
          test.equal(null, err);
          test.ok(result != null);

          // Authenticate using the newly added user
          adminDb.authenticate('admin15', 'admin15', function(err, result) {
            test.equal(null, err);
            test.equal(true, result);
            db.close();
          });
        });
      });
    });
    // DOC_END
  }
}

exports['Should correctly authenticate against admin db'] = {
  metadata: { requires: { topology: ['auth'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var Db = configuration.require.Db
      , MongoClient = configuration.require.MongoClient
      , Server = configuration.require.Server;

    // restart server
    configuration.manager.restart(true).then(function() {
      var db1 = new Db('mongo-ruby-test-auth1', new Server(configuration.host, configuration.port, {auto_reconnect: true}), {w:1});
      db1.open(function(err, db) {
        test.equal(null, err);

        db.admin().addUser('admin', 'admin', function(err, result) {
          test.equal(null, err);

          // Attempt to save a document
          db.collection('test').insert({a:1}, function(err, result) {
            test.ok(err != null);

            // Login the user
            db.admin().authenticate("admin", "admin", function(err, result) {
              test.equal(null, err);
              test.ok(result);

              db.collection('test').insert({a:1}, function(err, result) {
                test.equal(null, err);

                // Logout the user
                db.admin().logout(function(err, result) {
                  test.equal(null, err);

                  // Attempt to save a document
                  db.collection('test').insert({a:1}, function(err, result) {
                    test.ok(err != null);
                    db1.close();

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
}

exports['Should correctly authenticate against normal db'] = {
  metadata: { requires: { topology: ['auth'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var Db = configuration.require.Db
      , MongoClient = configuration.require.MongoClient
      , Server = configuration.require.Server;

    // restart server
    configuration.manager.restart(true).then(function() {
      var db1 = new Db('mongo-ruby-test-auth1', new Server("127.0.0.1", 27017, {auto_reconnect: true}), {w:1});
      db1.open(function(err, db) {
        test.equal(null, err);

        // An admin user must be defined for db level authentication to work correctly
        db.admin().addUser('admin', 'admin', function(err, result) {

          // Authenticate against admin
          db.admin().authenticate('admin', 'admin', function(err, result) {

            db.addUser('user', 'user', function(err, result) {
              test.equal(null, err);

              // Logout admin
              db.admin().logout(function(err, result) {

                // Attempt to save a document
                db.collection('test').insert({a:1}, function(err, result) {
                  test.ok(err != null);

                  // Login the user
                  db.authenticate("user", "user", function(err, result) {
                    test.equal(null, err);
                    test.ok(result);

                    db.collection('test').insert({a:1}, function(err, result) {
                      test.equal(null, err);

                      // Logout the user
                      db.logout(function(err, result) {
                        test.equal(null, err);

                        // Attempt to save a document
                        db.collection('test').insert({a:1}, function(err, result) {
                          test.ok(err != null);
                          db1.close();

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
        });
      });
    });
  }
}

exports['Should correctly reapply the authentications'] = {
  metadata: { requires: { topology: ['auth'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var Db = configuration.require.Db
      , MongoClient = configuration.require.MongoClient
      , Server = configuration.require.Server;

    // restart server
    configuration.manager.restart(true).then(function() {
      var db1 = new Db('mongo-ruby-test-auth1', new Server('localhost', 27017, {auto_reconnect: true}), {w:1});
      db1.open(function(err, db) {
        test.equal(null, err);

        db.admin().addUser('admin', 'admin', function(err, result) {
          test.equal(null, err);

          // Attempt to save a document
          db.collection('test').insert({a:1}, function(err, result) {
            test.ok(err != null);

            // Login the user
            db.admin().authenticate("admin", "admin", function(err, result) {
              test.equal(null, err);
              test.ok(result);

              db.collection('test').insert({a:1}, function(err, result) {
                test.equal(null, err);

                // Bounce server
                configuration.manager.restart(true).then(function() {

                  // Reconnect should reapply the credentials
                  db.collection('test').insert({a:1}, function(err, result) {
                    // test.equal(null, err);
                    db1.close();

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
}

exports['Ordered bulk operation should fail correctly when not authenticated'] = {
  metadata: { requires: { topology: ['auth'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var Db = configuration.require.Db
      , MongoClient = configuration.require.MongoClient
      , Server = configuration.require.Server;

    // restart server
    configuration.manager.restart(true).then(function() {
      var db1 = new Db('mongo-ruby-test-auth1', new Server("127.0.0.1", 27017, {auto_reconnect: true}), {w:1});
      db1.open(function(err, db) {
        test.equal(null, err);

        db.admin().addUser('admin', 'admin', function(err, result) {
          test.equal(null, err);

          // Attempt to save a document
          var col = db.collection('test');

          // Initialize the Ordered Batch
          var batch = col.initializeOrderedBulkOp();

          // Add some operations to be executed in order
          batch.insert({a:1});
          batch.find({a:1}).updateOne({$set: {b:1}});
          batch.find({a:2}).upsert().updateOne({$set: {b:2}});
          batch.insert({a:3});
          batch.find({a:3}).remove({a:3});

          // Execute the operations
          batch.execute(function(err, result) {
            test.ok(err != null);
            test.ok(err.code != null);
            test.ok(err.errmsg != null);

            configuration.manager.restart(true).then(function() {
              db1.close();
              test.done();
            });
          });
        });
      });
    });
  }
}

exports['Unordered bulk operation should fail correctly when not authenticated'] = {
  metadata: { requires: { topology: ['auth'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var Db = configuration.require.Db
      , MongoClient = configuration.require.MongoClient
      , Server = configuration.require.Server;

    // restart server
    configuration.manager.restart(true).then(function() {
      var db1 = new Db('mongo-ruby-test-auth1', new Server("127.0.0.1", 27017, {auto_reconnect: true}), {w:1});
      db1.open(function(err, db) {
        test.equal(null, err);

        db.admin().addUser('admin', 'admin', function(err, result) {
          test.equal(null, err);

          // Attempt to save a document
          var col = db.collection('test');

          // Initialize the Ordered Batch
          var batch = col.initializeUnorderedBulkOp();

          // Add some operations to be executed in order
          batch.insert({a:1});
          batch.find({a:1}).updateOne({$set: {b:1}});
          batch.find({a:2}).upsert().updateOne({$set: {b:2}});
          batch.insert({a:3});
          batch.find({a:3}).remove({a:3});

          // Execute the operations
          batch.execute(function(err, result) {
            test.ok(err != null);
            test.ok(err.code != null);
            test.ok(err.errmsg != null);

            configuration.manager.restart(true).then(function() {
              db1.close();
              test.done();
            });
          });
        });
      });
    });
  }
}

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
  var ReplSetManager = require('mongodb-topology-manager').ReplSet
    , Db = configuration.require.Db
    , Server = configuration.require.Server
    , MongoClient = configuration.require.MongoClient;

  // Check if we have any options
  if(typeof options == 'function') callback = options, options = null;

  // Override options
  if(options) {
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
    }
  }

  // Set up the nodes
  var nodes = [{
    options: {
      bind_ip: 'localhost', port: 31000,
      dbpath: f('%s/../db/31000', __dirname),
    }
  }, {
    options: {
      bind_ip: 'localhost', port: 31001,
      dbpath: f('%s/../db/31001', __dirname),
    }
  }, {
    options: {
      bind_ip: 'localhost', port: 31002,
      dbpath: f('%s/../db/31002', __dirname),
    }
  }]

  // Merge in any node start up options
  for(var i = 0; i < nodes.length; i++) {
    for(var name in rsOptions.server) {
      nodes[i].options[name] = rsOptions.server[name];
    }
  }

  // Create a manager
  var replicasetManager = new ReplSetManager('mongod', nodes, rsOptions.client);
  // Purge the set
  replicasetManager.purge().then(function() {
    // Start the server
    replicasetManager.start().then(function() {
      setTimeout(function() {
        callback(null, replicasetManager);
      }, 10000);
    }).catch(function(e) {
      console.dir(e);
    });
  });
}

/**
 * @ignore
 */
exports['Should correctly handle replicaset master stepdown and stepup without loosing auth'] = {
  metadata: { requires: { topology: ['auth'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var Db = configuration.require.Db
      , Server = configuration.require.Server
      , ReplSet = configuration.require.ReplSet;

    setUp(configuration, function(err, replicasetManager) {
      var replSet = new ReplSet( [
          new Server( 'localhost', 31000),
          new Server( 'localhost', 31001)
        ],
        {rs_name: 'rs', poolSize:1}
      );

      // Connect
      new Db('replicaset_test_auth', replSet, {w:1}).open(function(err, db) {
        // Add a user
        db.admin().addUser("root", "root", {w:3, wtimeout: 25000}, function(err, result) {
          test.equal(null, err);

          db.admin().authenticate("root", "root", function(err, result) {
            test.equal(null, err);
            test.ok(result);

            // replSetManager.shutdown('primary', function(err, result) {
            replicasetManager.stepDownPrimary(false, {stepDownSecs: 1, force:true}, {
              provider: 'default',
              db: 'admin',
              user: 'root',
              password: 'root'
            }).then(function() {

              db.collection('replicaset_test_auth').insert({a:1}, {w:1}, function(err, result) {
                test.equal(null, err);

                db.close();

                replicasetManager.stop().then(function() {
                  test.done();
                });
              });
            }).catch(function(e) {
              console.log(e.stack);
            });
          });
        });
      });
    })
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyAuthenticateUsingPrimary = {
  metadata: { requires: { topology: ['auth'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient
      , Db = configuration.require.Db
      , Server = configuration.require.Server
      , ReplSet = configuration.require.ReplSet;

    setUp(configuration, function(err, replicasetManager) {
      var replSet = new ReplSet( [
          new Server( 'localhost', 31000),
          new Server( 'localhost', 31001)
        ],
        {rs_name: 'rs', poolSize:1}
      );

      var db = new Db('node-native-test', replSet, {w:1});
      db.open(function(err, p_db) {
        test.equal(null, err);

        // Add a user
        db.admin().addUser("admin", "admin", {w:3, wtimeout: 25000}, function(err, result) {
          // test.equal(null, err);

          // Log in to admin
          db.admin().authenticate("admin", "admin", function(err, result) {
            test.equal(null, err);

            // Add a user to the db
            db.addUser("me", "secret", {w:3, wtimeout: 25000}, function(err, result) {
              // test.equal(null, err);

              // Close the connection
              db.close();

              // connection string
              var config = f("mongodb://me:secret@localhost:%s/node-native-test?replicaSet=%s"
                , 31000, 'rs');
              // Connect
              MongoClient.connect(config, function(error, client) {
                test.equal(null, error);

                client.collections(function(error, names) {
                  test.equal(null, error);

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
}

/**
 * @ignore
 */
exports.shouldCorrectlyAuthenticateWithTwoSeeds = {
  metadata: { requires: { topology: ['auth'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient
      , Db = configuration.require.Db
      , Server = configuration.require.Server
      , ReplSet = configuration.require.ReplSet;

    setUp(configuration, function(err, replicasetManager) {
      var replSet = new ReplSet( [
          new Server( 'localhost', 31000),
          new Server( 'localhost', 31001)
        ],
        {rs_name: 'rs', poolSize:1}
      );

      var db = new Db('node-native-test', replSet, {w:1});
      db.open(function(err, p_db) {
        test.equal(null, err);

        // Add a user
        db.admin().addUser("admin", "admin", {w:3, wtimeout: 25000}, function(err, result) {
          // test.equal(null, err);

          // Log in to admin
          db.admin().authenticate("admin", "admin", function(err, result) {
            test.equal(null, err);

            db.addUser("me", "secret", {w:3, wtimeout: 25000}, function(err, result) {
              // Close the connection
              db.close();

              // connection string
              var config = f("mongodb://me:secret@localhost:%s,localhost:%s/node-native-test?replicaSet=%s"
                  , 31000, 31001, 'rs');
              // Connect
              MongoClient.connect(config, function(error, client) {
                test.equal(null, error);

                client.collections(function(error, names) {
                  test.equal(null, err);

                  client.close();

                  replicasetManager.stop().then(function() {
                    test.done();
                  });
                })
              });
            });
          });
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyAuthenticateWithOnlySecondarySeed = {
  metadata: { requires: { topology: ['auth'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient
      , Db = configuration.require.Db
      , Server = configuration.require.Server
      , ReplSet = configuration.require.ReplSet;

    setUp(configuration, function(err, replicasetManager) {
      var replSet = new ReplSet( [
          new Server( 'localhost', 31000),
          new Server( 'localhost', 31001)
        ],
        {rs_name: 'rs', poolSize:1}
      );

      var p_db = new Db('node-native-test', replSet, {w:1});
      p_db.on('fullsetup', function() {
        test.equal(null, err);

        // Add a user
        p_db.admin().addUser("admin", "admin", {w:3, wtimeout: 25000}, function(err, result) {

          // Log in to admin
          p_db.admin().authenticate("admin", "admin", function(err, result) {
            test.equal(null, err);

            p_db.admin().addUser("me", "secret", {w:3, wtimeout: 25000}, function(err, result) {
              // Close the connection
              p_db.close();

              // connection string
              var config = f("mongodb://me:secret@localhost:%s/node-native-test?authSource=admin&readPreference=secondary&replicaSet=%s&maxPoolSize=1"
                , 31000, 'rs');

              // Connect
              MongoClient.connect(config, function(error, client) {
                client.collection('test').insert({a:1}, function(err, r) {
                  test.equal(null, err);

                  // Logout
                  client.logout(function() {

                    // Should fail
                    client.collection('test').findOne(function(err, r) {
                      test.ok(err != null);

                      // Authenticate
                      client.admin().authenticate("me", "secret", function(err, r) {
                        test.equal(null, err);
                        test.ok(r);

                        replicasetManager.secondaries().then(function(managers) {
                          // Shutdown the first secondary
                          managers[0].stop().then(function(err, result) {

                            // Shutdown the second secondary
                            managers[1].stop().then(function(err, result) {

                              // Let's restart a secondary
                              managers[0].start().then(function(err, result) {

                                // Let's restart a secondary
                                managers[1].start().then(function(err, result) {
                                  // Should fail
                                  client.collection('test').findOne(function(err) {
                                    test.equal(null, err);

                                    client.close();

                                    replicasetManager.stop().then(function() {
                                      test.done();
                                    });
                                  });
                                }).catch(function(e) {
                                  console.log(e.stack);
                                });
                              }).catch(function(e) {
                                console.log(e.stack);
                              });
                            }).catch(function(e) {
                              console.log(e.stack);
                            });
                          }).catch(function(e) {
                            console.log(e.stack);
                          });
                        }).catch(function(e) {
                          console.log(e.stack);
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

      p_db.open(function(err, p_db) {});
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyAuthenticateWithMultipleLoginsAndLogouts = {
  metadata: { requires: { topology: ['auth'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient
      , Db = configuration.require.Db
      , Server = configuration.require.Server
      , ReadPreference = configuration.require.ReadPreference
      , ReplSet = configuration.require.ReplSet;

    setUp(configuration, function(err, replicasetManager) {
      var replSet = new ReplSet( [
          new Server( 'localhost', 31000),
          new Server( 'localhost', 31001)
        ],
        {rs_name: 'rs', poolSize:1}
      );

      // Connect to the replicaset
      var slaveDb = null;
      var db = new Db('foo', replSet, {w:1});
      db.open(function(err, p_db) {

        function ensureFailingInsert(err, result) {
          db.collection("stuff", function(err, collection) {
            collection.insert({a:2}, {w: 3}, authenticate1);
          });
        }

        function authenticate1(err, result) {
          test.ok(err != null);

          db.admin().authenticate("me", "secret", changePassword);
        }

        function changePassword(err, result) {
          test.equal(null, err);
          test.ok(result);

          db.admin().addUser("me2", "secret2", {w:3, wtimeout:25000}, authenticate2);
        }

        function authenticate2(err, result) {
          db.admin().authenticate("me2", "secret2", insertShouldSuccedNow);
        }

        function insertShouldSuccedNow(err, result) {
          test.equal(null, err);
          test.ok(result);

          db.collection("stuff", function(err, collection) {
            collection.insert({a:3}, {w:3, wtimeout:25000}, queryShouldExecuteCorrectly);
          });
        }

        function queryShouldExecuteCorrectly(err, result) {
          test.equal(null, err);

          db.collection("stuff", function(err, collection) {
            collection.findOne(logout);
          });
        }

        function logout(err, item) {
          test.ok(err == null);
          test.equal(3, item.a);

          db.admin().logout(findShouldFailDueToLoggedOut);
        }

        function findShouldFailDueToLoggedOut(err, result) {
          test.equal(null, err);

          db.collection("stuff", function(err, collection) {
            collection.findOne(sameShouldApplyToRandomSecondaryServer);
          });
        }

        function sameShouldApplyToRandomSecondaryServer(err, result) {
          test.ok(err != null);
          // test.ok(replSetManager.secondaries.length > 0);
          replicasetManager.secondaries().then(function(managers) {
            slaveDb = new Db('foo', new Server(managers[0].host
                      , managers[0].port
                      , {auto_reconnect: true, poolSize: 1, rs_name:'rs'})
                      , {w:1, readPreference: ReadPreference.SECONDARY});
            slaveDb.open(function(err, slaveDb) {
              test.equal(null, err);

              slaveDb.collection('stuff', function(err, collection) {
                collection.findOne(shouldCorrectlyAuthenticateAgainstSecondary)
              })
            });
          });
        }

        function shouldCorrectlyAuthenticateAgainstSecondary(err, result) {
          test.ok(err != null)
          slaveDb.admin().authenticate('me2', 'secret2', shouldCorrectlyInsertItem);
        }

        function shouldCorrectlyInsertItem(err, result) {
          test.equal(null, err);
          test.ok(result);

          slaveDb.collection('stuff', function(err, collection) {
            collection.findOne(finishUp)
          })
        }

        function finishUp(err, item) {
          test.ok(err == null);
          test.equal(3, item.a);

          p_db.close();
          slaveDb.close();

          replicasetManager.stop().then(function() {
            test.done();
          });
        }

        db.admin().addUser("me", "secret", {w:3, wtimeout:25000}, ensureFailingInsert);
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyAuthenticateAndEnsureIndex = {
  metadata: { requires: { topology: ['auth'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient
      , Db = configuration.require.Db
      , Server = configuration.require.Server
      , ReadPreference = configuration.require.ReadPreference
      , ReplSet = configuration.require.ReplSet;

    setUp(configuration, function(err, replicasetManager) {
      var replSet = new ReplSet( [
          new Server( 'localhost', 31000),
          new Server( 'localhost', 31001)
        ],
        {rs_name: 'rs', poolSize:1}
      );

      var db = new Db('foo', replSet, {w:1});
      db.open(function(err, db_p) {
        test.equal(null, err);

        db_p.admin().addUser("me", "secret", {w:3}, function runWhatever(err, result) {

          db_p.admin().authenticate("me", "secret", function(err, result) {
            test.equal(null, err);

            db_p.addUser('test', 'test', {w:3, wtimeout:25000}, function(err, result) {

              db_p.authenticate('test', 'test', function(err, replies) {

                db_p.collection('userconfirm', function(err, result ){
                  test.equal(null, err);

                  var userconfirm = result;
                  var ensureIndexOptions = { unique: true, w: 0, background: true };
                  userconfirm.ensureIndex([ [ 'confirmcode', 1 ] ],ensureIndexOptions, function(err, item){
                    test.equal(null, err);

                    db_p.collection('session', function( err, result ){
                      test.equal(null, err);

                      var session = result;
                      session.ensureIndex([ [ 'sid', 1 ] ],ensureIndexOptions, function(err, res){
                        test.equal(null, err);

                        db_p.close();

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
}

/**
 * @ignore
 */
exports.shouldCorrectlyAuthenticateAndUseReadPreference = {
  metadata: { requires: { topology: ['auth'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient
      , Db = configuration.require.Db
      , Server = configuration.require.Server
      , ReadPreference = configuration.require.ReadPreference
      , ReplSet = configuration.require.ReplSet;

    setUp(configuration, function(err, replicasetManager) {
      var replSet = new ReplSet( [
          new Server( 'localhost', 31000),
          new Server( 'localhost', 31001)
        ],
        {rs_name: 'rs', poolSize:1}
      );

      var db = new Db('foo', replSet, {w:1});
      db.open(function(err, db_p) {
        test.equal(null, err);

        db_p.admin().addUser("me", "secret", {w:3, wtimeout:25000}, function runWhatever(err, result) {

          db_p.admin().authenticate("me", "secret", function(err, result) {
            test.equal(null, err);

            db_p.addUser('test', 'test', {w:3, wtimeout:25000}, function(err, result) {

              db_p.authenticate('test', 'test', function(err, replies) {
                test.equal(null, err);

                db_p.collection('userconfirm2').insert({a:1}, {w:1}, function(err, result) {
                  test.equal(null, err);

                  db_p.collection('userconfirm2').findOne(function(err, item) {
                    test.equal(null, err);
                    test.equal(1, item.a);
                    db_p.close();

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
}

/**
 * @ignore
 */
exports.shouldCorrectlyBringReplicasetStepDownPrimaryAndStillReadFromSecondary = {
  metadata: { requires: { topology: ['auth'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient
      , Db = configuration.require.Db
      , Server = configuration.require.Server
      , ReadPreference = configuration.require.ReadPreference
      , ReplSet = configuration.require.ReplSet;

    setUp(configuration, function(err, replicasetManager) {
      var replSet = new ReplSet( [
          new Server( 'localhost', 31000),
          new Server( 'localhost', 31001)
        ],
        {rs_name: 'rs', poolSize:1}
      );

      var db = new Db('foo', replSet, {w:1});
      db.open(function(err, db_p) {});
      db.on('fullsetup', function(err, db_p) {
        test.ok(db_p != null);
        db_p.admin().addUser("me", "secret", {w:3, wtimeout:25000}, function runWhatever(err, result) {
          db_p.admin().authenticate("me", "secret", function(err, result) {
            test.equal(null, err);

            db_p.collection('test').insert({a:1}, {w:1}, function(err, result) {
              test.equal(null, err);

              db_p.addUser('test', 'test', {w:3, wtimeout:25000}, function(err, result) {
                test.equal(null, err);
                test.ok(result != null);

                db.serverConfig.on('joined', function(t, s) {
                  if(t == 'primary') {
                    var counter = 1000;
                    var errors = 0;

                    for(var i = 0; i < counter; i++) {
                      db_p.collection('test').find({a:1}).setReadPreference(ReadPreference.SECONDARY).toArray(function(err, r) {
                        counter = counter - 1;

                        if(err != null) {
                          errors = errors + 1;
                        }

                        if(counter == 0) {
                          test.equal(0, errors)

                          db_p.close();

                          replicasetManager.stop().then(function() {
                            test.done();
                          });
                        }
                      });
                    }
                  }
                });

                db.serverConfig.on('left', function(t, s) {
                });

                // Step down the primary
                replicasetManager.stepDownPrimary(false, {stepDownSecs: 1, force:true}, {
                  provider: 'default',
                  db: 'admin',
                  user: 'me',
                  password: 'secret'
                }).then(function() {
                }).catch(function(e) {
                  console.log(e.stack)
                });
              });
            });
          });
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyAuthWithSecondaryAfterKillPrimary = {
  metadata: { requires: { topology: ['auth'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient
      , Db = configuration.require.Db
      , Server = configuration.require.Server
      , ReadPreference = configuration.require.ReadPreference
      , ReplSet = configuration.require.ReplSet;

    setUp(configuration, function(err, replicasetManager) {
      var replSet = new ReplSet( [
          new Server( 'localhost', 31000),
          new Server( 'localhost', 31001)
        ],
        {rs_name: 'rs', poolSize:1}
      );

      var db = new Db('foo', replSet, {w:1});
      db.open(function(err, db_p) {
        test.equal(null, err);

        // Add a user
        db_p.admin().addUser("admin", "admin", {w:3, wtimeout:25000}, function(err, result) {

          // Log in to admin
          db_p.admin().authenticate("admin", "admin", function(err, result) {
            test.equal(null, err);

            db_p.collection('test').insert({a:1}, {w:1}, function(err, result) {
              test.equal(null, err);

              db_p.addUser('test', 'test', {w:3, wtimeout:25000}, function(err, result) {

                db_p.authenticate('test', 'test', function(err, result) {
                  test.equal(null, err);
                  test.equal(true, result);

                  // shutdown the primary
                  replicasetManager.primary().then(function(primary) {

                    primary.stop().then(function() {

                      db.serverConfig.on('joined', function(t) {
                        if(t == 'primary') {
                          var counter = 1000;
                          var errors = 0;

                          for(var i = 0; i < counter; i++) {
                            db_p.collection('test').find({a:1}).setReadPreference(ReadPreference.SECONDARY).toArray(function(err, r) {
                              test.equal(null, err);
                              counter = counter - 1;

                              if(counter == 0) {
                                test.equal(0, errors)

                                db_p.close();

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
                })
              });
            });
          });
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyAuthAgainstReplicaSetAdminDbUsingMongoClient = {
  metadata: { requires: { topology: ['auth'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient
      , Db = configuration.require.Db
      , Server = configuration.require.Server
      , ReadPreference = configuration.require.ReadPreference
      , ReplSet = configuration.require.ReplSet;

    setUp(configuration, function(err, replicasetManager) {
      var replSet = new ReplSet( [
          new Server( 'localhost', 31000),
          new Server( 'localhost', 31001)
        ],
        {rs_name: 'rs', poolSize:1}
      );

      var dbName = 'admin';
      var db = new Db(dbName, replSet, {w:3});
      db.open(function(err, db_p) {
        test.equal(null, err);

        db_p.admin().addUser("me", "secret", {w:3, wtimeout:25000}, function runWhatever(err, result) {

          db_p.close();

          MongoClient.connect(f("mongodb://me:secret@%s:%s/%s?rs_name=%s&readPreference=secondary&w=3"
            , 'localhost', 31000, dbName, 'rs'), function(err, db) {
              db.on('fullsetup', function(err, db) {
                test.ok(db != null);

                // Insert document
                db.collection('authcollectiontest').insert({a:1}, {w:3, wtimeout: 25000}, function(err, result) {
                  test.equal(null, err);

                  // Find the document
                  db.collection('authcollectiontest').find().toArray(function(err, docs) {
                    test.equal(null, err);
                    test.equal(1, docs.length);
                    test.equal(1, docs[0].a);

                    db.close();

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
}

/**
 * @ignore
 */
exports.shouldCorrectlyAuthAgainstNormalDbUsingMongoClient = {
  metadata: { requires: { topology: ['auth'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient
      , Db = configuration.require.Db
      , Server = configuration.require.Server
      , ReadPreference = configuration.require.ReadPreference
      , ReplSet = configuration.require.ReplSet;

    setUp(configuration, function(err, replicasetManager) {
      var replSet = new ReplSet( [
          new Server( 'localhost', 31000),
          new Server( 'localhost', 31001)
        ],
        {rs_name: 'rs', poolSize:1}
      );

      var dbName = 'foo';

      new Db(dbName, replSet, {w:3}).open(function(err, db_p) {
        db_p.on('fullsetup', function(err, db) {
          // Add a user
          db_p.admin().addUser("admin", "admin", {w:3, wtimeout: 25000}, function(err, result) {

            // Log in to admin
            db_p.admin().authenticate("admin", "admin", function(err, result) {
              test.equal(null, err);

              db_p.addUser("me", "secret", {w:3, wtimeout: 25000}, function runWhatever(err, result) {

                db_p.close();

                MongoClient.connect(f("mongodb://me:secret@%s:%s/%s?rs_name=%s&readPreference=secondary&w=3"
                  , 'localhost', 31000, dbName, 'rs'), function(err, db) {
                    test.equal(null, err);
                    db.on('fullsetup', function(err, db) {
                      test.ok(db != null);

                      // Insert document
                      db.collection('authcollectiontest1').insert({a:1}, {w:3, wtimeout:25000}, function(err, result) {
                        test.equal(null, err);

                        // Find the document
                        db.collection('authcollectiontest1').find().toArray(function(err, docs) {
                          test.equal(null, err);
                          test.equal(1, docs.length);
                          test.equal(1, docs[0].a);

                          db.close();

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
}

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
  var ShardingManager = require('../test_topologies').Sharded
    , Db = configuration.require.Db
    , Server = configuration.require.Server
    , MongoClient = configuration.require.MongoClient
    , path = require('path');

  // Check if we have any options
  if(typeof options == 'function') callback = options, options = null;

  // Create Replicaset Manager
  var shardedManager = new ShardingManager({
    shard: {
      auth:null, keyFile: __dirname + '/data/keyfile.txt'
    },
    config: {
      auth:null, keyFile: __dirname + '/data/keyfile.txt'
    },
    proxy: {
      keyFile: __dirname + '/data/keyfile.txt'
    }
  });

  // Start SSL replicaset manager
  shardedManager.purge().then(function() {
    shardedManager.start().then(function() {
      callback(null, shardedManager);
    }).catch(function(e) {
      console.log(e.stack)
    });
  });
}

/**
 * @ignore
 */
exports['should correctly connect and authenticate against admin database using mongos'] = {
  metadata: { requires: { topology: ['auth'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient
      , Db = configuration.require.Db
      , Server = configuration.require.Server
      , Mongos = configuration.require.Mongos;

    setUpSharded(configuration, function(err, manager) {
      var mongos = new Mongos([
          new Server( 'localhost', 51000),
        ], {poolSize: 1});

      var db = new Db('node-native-test', mongos, {w:1});
      db.open(function(err, p_db) {
        test.equal(null, err);

        // Add a user
        db.admin().addUser("admin", "admin", {w:'majority'}, function(err, result) {
          test.equal(null, err);

          // Log in to admin
          db.admin().authenticate("admin", "admin", function(err, result) {
            test.equal(null, err);

            db.addUser("me", "secret", {w:'majority'}, function(err, result) {
              // Close the connection
              db.close();

              setTimeout(function() {
                // connection string
                var config = f("mongodb://me:secret@localhost:%s/node-native-test"
                  , 51000);
                // Connect
                MongoClient.connect(config, function(error, client) {
                  test.equal(null, error);

                  client.collections(function(error, names) {
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
}

/**
 * @ignore
 */
exports['Should correctly handle proxy stepdown and stepup without loosing auth for sharding'] = {
  metadata: { requires: { topology: ['auth'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient
      , Db = configuration.require.Db
      , Server = configuration.require.Server
      , Mongos = configuration.require.Mongos;

    setUpSharded(configuration, function(err, manager) {
      var mongos = new Mongos([
          new Server( 'localhost', 51000),
        ], {poolSize: 1});

      var db = new Db('node-native-test', mongos, {w:1});
      db.open(function(err, p_db) {
        test.equal(null, err);

        // Add a user
        db.admin().addUser("admin", "admin", {w:'majority'}, function(err, result) {
          test.equal(null, err);

          // Log in to admin
          db.admin().authenticate("admin", "admin", function(err, result) {
            test.equal(null, err);

            db.addUser("me", "secret", {w:'majority'}, function(err, result) {
              // Close the connection
              db.close();

              // connection string
              var config = f("mongodb://me:secret@localhost:%s/node-native-test"
                , 51000);
              // Connect
              MongoClient.connect(config, function(error, client) {
                test.equal(null, error);

                client.collections(function(error, names) {
                  test.equal(null, error);

                  // Get the proxies
                  var proxies = manager.proxies();

                  proxies[0].stop().then(function() {

                    proxies[1].stop().then(function() {

                      client.collections(function(error, names) {
                        test.equal(null, error);
                      });

                      proxies[0].start().then(function() {

                        proxies[1].start().then(function() {

                          client.collections(function(error, names) {
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
}
