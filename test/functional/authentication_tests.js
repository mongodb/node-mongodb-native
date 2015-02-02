"use strict";

var f = require('util').format;

exports['Should correctly authenticate against admin db'] = {
  metadata: { requires: { topology: ['auth'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var Db = configuration.require.Db
      , MongoClient = configuration.require.MongoClient
      , Server = configuration.require.Server;
    // restart server
    configuration.restart({purge:true, kill:true}, function() {
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
                    configuration.restart(function() {
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
    configuration.restart(function() {
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
                          configuration.restart(function() {
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
    configuration.restart(function() {
      var db1 = new Db('mongo-ruby-test-auth1', new Server("127.0.0.1", 27017, {auto_reconnect: true}), {w:1});
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
                configuration.restart({purge: false}, function() {

            // // Login the user
            // db.admin().authenticate("admin", "admin", function(err, result) {
                  // Reconnect should reapply the credentials
                  db.collection('test').insert({a:1}, function(err, result) {
                    // test.equal(null, err);
                    db1.close();

                    // restart server
                    configuration.restart(function() {
                      test.done();
                    });
                  });
                });
              // });
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
    configuration.restart(function() {
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

            db1.close();
            test.done();
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
    configuration.restart({purge:true, kill:true}, function() {
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

            db1.close();
            test.done();
          });
        });
      });
    });
  }
}

/**********************************************************************************************
                                                                                               
  ReplsetRep    ReplsetRepl  tReplsetRe   etRepl          Repl  t  plsetReplse  eplsetReplse   
  setReplsetR   setReplsetRe  setReplset  plsetR        plsetRepls tReplsetRepl etReplsetRep   
   pls    pls   epls    plse  epls    pls   epl        etRep  etRe lset    setR pls  Rep  et   
   tReplsetRe    tRe          etReplsetRe   et         plset        epl              set       
   lsetRepls     lsetRe       plsetRepls    pl          Repls       etRepl           epl       
   ReplsetR      Replset      tReplsetR     tR             Repls    plsetRe          et        
   setReplse     setRepl      lse           lse             etRe    tReplse          pls       
   epl   Rep  e  epl          Rep          tRep    Re        lset   lse              tRe       
   etR   setRep  etRe    tRe  set           set    se  epls  Repl   Repl    epl      lse       
  eplse  eplset eplsetR plse Replse       tReplsetRep  etReplsetR  lsetRep setR    etRepls     
  etRep   tRep  etReplsetRep setRep       lsetReplset  plsetRepl   ReplsetRepls    plsetRe     
                                                                                                                                                                                              
**********************************************************************************************/
                                                                                                                                    
var replSetManager;

var setUp = function(configuration, options, callback) {
  var ReplSetManager = require('mongodb-tools').ReplSetManager
    , Db = configuration.require.Db
    , Server = configuration.require.Server
    , MongoClient = configuration.require.MongoClient;

  // Check if we have any options
  if(typeof options == 'function') callback = options, options = null;

  // Default rs options
  var rsOptions = {
      auth: null
    , keyFile: __dirname + '/data/keyfile.txt'
      // ReplSet settings
    , secondaries: 2
  }

  // Override options
  if(options) rsOptions = options;

  // Create Replicaset Manager
  replSetManager = new ReplSetManager(rsOptions);

  // Start SSL replicaset manager
  replSetManager.start({kill: true, purge:true, signal: -9}, function(err, result) {      
    if(err != null) throw err;
    // Finish setup
    callback();      
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

    setUp(configuration, function(err) {
      var replSet = new ReplSet( [
          new Server( 'localhost', replSetManager.startPort),
          new Server( 'localhost', replSetManager.startPort + 1)
        ],
        {rs_name: replSetManager.replicasetName, poolSize:1}
      );

      // Connect
      new Db('replicaset_test_auth', replSet, {w:1}).open(function(err, db) {    
        // Just set auths for the manager to handle it correctly
        replSetManager.setCredentials("mongocr", "admin", "root", "root");
        // Add a user
        db.admin().addUser("root", "root", {w:4, wtimeout: 25000}, function(err, result) {
          // test.equal(null, err);

          db.admin().authenticate("root", "root", function(err, result) {
            test.equal(null, err);
            test.ok(result);

            replSetManager.shutdown('primary', function(err, result) {
              
              db.collection('replicaset_test_auth').insert({a:1}, {w:1}, function(err, result) {
                test.equal(null, err);

                db.close();

                replSetManager.stop(function() {
                  test.done();
                });
              });
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

    setUp(configuration, function(err) {
      var replSet = new ReplSet( [
          new Server( 'localhost', replSetManager.startPort),
          new Server( 'localhost', replSetManager.startPort + 1)
        ],
        {rs_name: replSetManager.replicasetName, poolSize:1}
      );

      var db = new Db('node-native-test', replSet, {w:1});
      db.open(function(err, p_db) {
        test.equal(null, err);

        // Add a user
        db.admin().addUser("admin", "admin", {w:4, wtimeout: 25000}, function(err, result) {
          // test.equal(null, err);

          // Log in to admin
          db.admin().authenticate("admin", "admin", function(err, result) {
            test.equal(null, err);

            // Add a user to the db
            db.addUser("me", "secret", {w:4, wtimeout: 25000}, function(err, result) {
              // test.equal(null, err);

              // Just set auths for the manager to handle it correctly
              replSetManager.setCredentials("mongocr", "node-native-test", "me", "secret");

              // Close the connection
              db.close();

              // connection string
              var config = f("mongodb://me:secret@localhost:%s/node-native-test?replicaSet=%s"
                , replSetManager.startPort, replSetManager.replicasetName);
              // Connect
              MongoClient.connect(config, function(error, client) {
                test.equal(null, error);

                client.collections(function(error, names) {
                  test.equal(null, error);
                  
                  client.close();

                  replSetManager.stop(function() {
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

    setUp(configuration, function(err) {
      var replSet = new ReplSet( [
          new Server( 'localhost', replSetManager.startPort),
          new Server( 'localhost', replSetManager.startPort + 1)
        ],
        {rs_name: replSetManager.replicasetName, poolSize:1}
      );

      var db = new Db('node-native-test', replSet, {w:1});
      db.open(function(err, p_db) {
        test.equal(null, err);

        // Add a user
        db.admin().addUser("admin", "admin", {w:4, wtimeout: 25000}, function(err, result) {
          // test.equal(null, err);

          // Log in to admin
          db.admin().authenticate("admin", "admin", function(err, result) {
            test.equal(null, err);

            db.addUser("me", "secret", {w:4, wtimeout: 25000}, function(err, result) {
              // Just set auths for the manager to handle it correctly
              replSetManager.setCredentials("mongocr", "node-native-test", "me", "secret");

              // Close the connection
              db.close();

              // connection string
              var config = f("mongodb://me:secret@localhost:%s,localhost:%s/node-native-test?replicaSet=%s"
                  , replSetManager.startPort, replSetManager.startPort + 1, replSetManager.replicasetName);
              // Connect
              MongoClient.connect(config, function(error, client) {
                test.equal(null, error);

                client.collections(function(error, names) {
                  test.equal(null, err);
                  
                  client.close();

                  replSetManager.stop(function() {
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

    setUp(configuration, function(err) {
      var replSet = new ReplSet( [
          new Server( 'localhost', replSetManager.startPort),
          new Server( 'localhost', replSetManager.startPort + 1)
        ],
        {rs_name: replSetManager.replicasetName, poolSize:1}
      );

      var p_db = new Db('node-native-test', replSet, {w:1});
      p_db.on('fullsetup', function() {
        test.equal(null, err);

        // Add a user
        p_db.admin().addUser("admin", "admin", {w:4, wtimeout: 25000}, function(err, result) {

          // Log in to admin
          p_db.admin().authenticate("admin", "admin", function(err, result) {
            test.equal(null, err);

            p_db.admin().addUser("me", "secret", {w:4, wtimeout: 25000}, function(err, result) {

              // Close the connection
              p_db.close();

              // Just set auths for the manager to handle it correctly
              replSetManager.setCredentials("mongocr", "admin", "me", "secret");

              // connection string
              var config = f("mongodb://me:secret@localhost:%s/node-native-test?authSource=admin&readPreference=secondaryPreferred&replicaSet=%s&maxPoolSize=1"
                , replSetManager.startPort, replSetManager.replicasetName);
              
              // Connect
              MongoClient.connect(config, function(error, client) {
                client.collection('test').insert({a:1}, function(err, r) {
                  test.equal(null, err);
                  
                  // Logout
                  client.logout({authdb: 'admin'}, function() {

                    // Should fail
                    client.collection('test').findOne(function(err, r) {
                      test.ok(err != null);

                      // Authenticate
                      client.admin().authenticate("me", "secret", function(err, r) {
                        test.equal(null, err);
                        test.ok(r);

                        // Shutdown the first secondary
                        replSetManager.shutdown('secondary', {signal:-9}, function(err, result) {

                          // Shutdown the second secondary
                          replSetManager.shutdown('secondary', {signal:-9}, function(err, result) {

                            // Let's restart a secondary
                            replSetManager.restartServer('secondary', function(err, result) {
                              
                              // Let's restart a secondary
                              replSetManager.restartServer('secondary', function(err, result) {
                                // Should fail
                                client.collection('test').findOne(function(err) {
                                  test.equal(null, err);

                                  client.close();

                                  replSetManager.stop(function() {
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

    setUp(configuration, function(err) {
      var replSet = new ReplSet( [
          new Server( 'localhost', replSetManager.startPort),
          new Server( 'localhost', replSetManager.startPort + 1)
        ],
        {rs_name: replSetManager.replicasetName, poolSize:1}
      );

      // Connect to the replicaset
      var slaveDb = null;
      var db = new Db('foo', replSet, {w:1});
      db.open(function(err, p_db) {

        function ensureFailingInsert(err, result) {
          // return
          // test.equal(null, err);
          // test.ok(result != null);

          // Just set auths for the manager to handle it correctly
          replSetManager.setCredentials("mongocr", "admin", "me", "secret");

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

          db.admin().addUser("me2", "secret2", {w:4, wtimeout:25000}, authenticate2);
        }

        function authenticate2(err, result) {
          db.admin().authenticate("me2", "secret2", insertShouldSuccedNow);
        }

        function insertShouldSuccedNow(err, result) {
          test.equal(null, err);
          test.ok(result);

          db.collection("stuff", function(err, collection) {
            collection.insert({a:3}, {w:4, wtimeout:25000}, queryShouldExecuteCorrectly);
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
          test.ok(replSetManager.secondaries.length > 0);
          var secondaryItem = replSetManager.secondaries[0];
          var secondary = secondaryItem.split(":");

          slaveDb = new Db('foo', new Server(secondary[0]
                    , parseInt(secondary[1], 10)
                    , {auto_reconnect: true, poolSize: 1, rs_name:replSetManager.replicasetName})
                    , {w:1, readPreference: ReadPreference.SECONDARY});
          slaveDb.open(function(err, slaveDb) {
            test.equal(null, err);

            slaveDb.collection('stuff', function(err, collection) {
              collection.findOne(shouldCorrectlyAuthenticateAgainstSecondary)
            })
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

          replSetManager.stop(function() {
            test.done();
          });          
        }
        
        db.admin().addUser("me", "secret", {w:4, wtimeout:25000}, ensureFailingInsert);
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

    setUp(configuration, function(err) {
      var replSet = new ReplSet( [
          new Server( 'localhost', replSetManager.startPort),
          new Server( 'localhost', replSetManager.startPort + 1)
        ],
        {rs_name: replSetManager.replicasetName, poolSize:1}
      );

      var db = new Db('foo', replSet, {w:1});
      db.open(function(err, db_p) {
        test.equal(null, err);

        db_p.admin().addUser("me", "secret", {w:4}, function runWhatever(err, result) {
          // Just set auths for the manager to handle it correctly
          replSetManager.setCredentials("mongocr", "admin", "me", "secret");

          db_p.admin().authenticate("me", "secret", function(err, result) {
            test.equal(null, err);

            db_p.addUser('test', 'test', {w:4, wtimeout:25000}, function(err, result) {

              // Just set auths for the manager to handle it correctly
              replSetManager.setCredentials("mongocr", "admin", "test", "test");

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

                        replSetManager.stop(function() {
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

    setUp(configuration, function(err) {
      var replSet = new ReplSet( [
          new Server( 'localhost', replSetManager.startPort),
          new Server( 'localhost', replSetManager.startPort + 1)
        ],
        {rs_name: replSetManager.replicasetName, poolSize:1}
      );

      var db = new Db('foo', replSet, {w:1});
      db.open(function(err, db_p) {
        test.equal(null, err);

        db_p.admin().addUser("me", "secret", {w:4, wtimeout:25000}, function runWhatever(err, result) {
          // Just set auths for the manager to handle it correctly
          replSetManager.setCredentials("mongocr", "admin", "me", "secret");

          db_p.admin().authenticate("me", "secret", function(err, result) {
            test.equal(null, err);

            db_p.addUser('test', 'test', {w:4, wtimeout:25000}, function(err, result) {

              // Just set auths for the manager to handle it correctly
              replSetManager.setCredentials("mongocr", "admin", "test", "test");

              db_p.authenticate('test', 'test', function(err, replies) {
                test.equal(null, err);

                db_p.collection('userconfirm2').insert({a:1}, {w:1}, function(err, result) {
                  test.equal(null, err);

                  db_p.collection('userconfirm2').findOne(function(err, item) {            
                    test.equal(null, err);
                    test.equal(1, item.a);
                    db_p.close();

                    replSetManager.stop(function() {
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

    setUp(configuration, function(err) {
      var replSet = new ReplSet( [
          new Server( 'localhost', replSetManager.startPort),
          new Server( 'localhost', replSetManager.startPort + 1)
        ],
        {rs_name: replSetManager.replicasetName, poolSize:1}
      );

      var db = new Db('foo', replSet, {w:1});
      db.open(function(err, db_p) {});
      db.on('fullsetup', function(err, db_p) {
        test.ok(db_p != null);

        db_p.admin().addUser("me", "secret", {w:4, wtimeout:25000}, function runWhatever(err, result) {
          // Just set auths for the manager to handle it correctly
          replSetManager.setCredentials("mongocr", "admin", "me", "secret");

          db_p.admin().authenticate("me", "secret", function(err, result) {
            test.equal(null, err);

            db_p.collection('test').insert({a:1}, {w:1}, function(err, result) {
              test.equal(null, err);

              db_p.addUser('test', 'test', {w:4, wtimeout:25000}, function(err, result) {
                test.equal(null, err);                
                test.ok(result != null);

                // Step down the primary
                replSetManager.stepDown({force:true}, function(err, result) {
                  db.serverConfig.on('joined', function(t) {
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

                            replSetManager.stop(function() {
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

    setUp(configuration, function(err) {
      var replSet = new ReplSet( [
          new Server( 'localhost', replSetManager.startPort),
          new Server( 'localhost', replSetManager.startPort + 1)
        ],
        {rs_name: replSetManager.replicasetName, poolSize:1}
      );

      var db = new Db('foo', replSet, {w:1});
      db.open(function(err, db_p) {
        test.equal(null, err);

        // Add a user
        db_p.admin().addUser("admin", "admin", {w:4, wtimeout:25000}, function(err, result) {

          // Log in to admin
          db_p.admin().authenticate("admin", "admin", function(err, result) {
            test.equal(null, err);

            // Just set auths for the manager to handle it correctly
            replSetManager.setCredentials("mongocr", "test", "me", "secret");

            db_p.collection('test').insert({a:1}, {w:1}, function(err, result) {
              test.equal(null, err);

              db_p.addUser('test', 'test', {w:4, wtimeout:25000}, function(err, result) {

                db_p.authenticate('test', 'test', function(err, result) {
                  test.equal(null, err);
                  test.equal(true, result);

                  // Step down the primary
                  replSetManager.shutdown('primary', function(err, result) {

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

                              replSetManager.stop(function() {
                                test.done();
                              });
                            }
                          });
                        }                        
                      }
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

    setUp(configuration, function(err) {
      var replSet = new ReplSet( [
          new Server( 'localhost', replSetManager.startPort),
          new Server( 'localhost', replSetManager.startPort + 1)
        ],
        {rs_name: replSetManager.replicasetName, poolSize:1}
      );

      var dbName = 'admin';
      var db = new Db(dbName, replSet, {w:3});
      db.open(function(err, db_p) {
        test.equal(null, err);

        db_p.admin().addUser("me", "secret", {w:4, wtimeout:25000}, function runWhatever(err, result) {
          // Just set auths for the manager to handle it correctly
          replSetManager.setCredentials("mongocr", "admin", "me", "secret");

          db_p.close();

          MongoClient.connect(f("mongodb://me:secret@%s:%s/%s?rs_name=%s&readPreference=secondary&w=3"
            , 'localhost', replSetManager.startPort, dbName, replSetManager.replicasetName), function(err, db) {
              test.ok(db != null);

              // Insert document
              db.collection('authcollectiontest').insert({a:1}, {w:4, wtimeout: 25000}, function(err, result) {
                test.equal(null, err);

                // Find the document
                db.collection('authcollectiontest').find().toArray(function(err, docs) {
                  test.equal(null, err);
                  test.equal(1, docs.length);
                  test.equal(1, docs[0].a);

                  db.close();

                  replSetManager.stop(function() {
                    test.done();
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

    setUp(configuration, function(err) {
      var replSet = new ReplSet( [
          new Server( 'localhost', replSetManager.startPort),
          new Server( 'localhost', replSetManager.startPort + 1)
        ],
        {rs_name: replSetManager.replicasetName, poolSize:1}
      );

      var dbName = 'foo';

      new Db(dbName, replSet, {w:'majority'}).open(function(err, db_p) {
        // Add a user
        db_p.admin().addUser("admin", "admin", {w:4, wtimeout: 25000}, function(err, result) {

          // Log in to admin
          db_p.admin().authenticate("admin", "admin", function(err, result) {
            test.equal(null, err);

            db_p.addUser("me", "secret", {w:4, wtimeout: 25000}, function runWhatever(err, result) {
              // Just set auths for the manager to handle it correctly
              replSetManager.setCredentials("mongocr", "admin", "me", "secret");
              
              db_p.close();

              MongoClient.connect(f("mongodb://me:secret@%s:%s/%s?rs_name=%s&readPreference=secondary&w=3"
                , 'localhost', replSetManager.startPort, dbName, replSetManager.replicasetName), function(err, db) {
                  test.equal(null, err);
                  test.ok(db != null);

                  // Insert document
                  db.collection('authcollectiontest1').insert({a:1}, {w:4, wtimeout:25000}, function(err, result) {
                    test.equal(null, err);

                    // Find the document
                    db.collection('authcollectiontest1').find().toArray(function(err, docs) {
                      test.equal(null, err);
                      test.equal(1, docs.length);
                      test.equal(1, docs[0].a);

                      db.close();

                      replSetManager.stop(function() {
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

/*************************************************************************************
                                                                                       
  sMong       sMong    ngosMo   sMong   ongosM    sMong         ongosM       ngos  n   
  ngosM       ngosM   osMongos  ngosM   osMong   ongosMongo    gosMongo    gosMongosM  
    ongo      sMo    Mong  Mong  Mongo   ngos   gosM  gosM    sMon  sMon  sMong  Mong  
    osMon    ongo    gos    osM  gosMon  sMo   sMon    ong    ngo    gos  ngosM        
    ongos    o Mo   sMon    ongo MongosM ngo   ngo           osMo    Mong  Mongo       
    osMong  Mo go   ngos    osMo gosMong sMo   sMo           ongo    gosM     Mongo    
    on osMo go Mo    Mon    ong  Mon osMongo   ngo   ngosMo   sMo    Mon       osMo    
    os ongosM  gos   gos    osM  gos ongosMo    Mo    Mongo   ngo    gos        ngos   
    ong sMong sMon   Mong  Mong  Mon  sMongo    gos   gosM    sMon  sMon  sMon  sMon   
  ngosMo gos ongosM   osMongos  ngosM  gosMo     ongosMon      gosMongo   ngosMongos   
   Mongo Mo  osMong    ngosMo   sMong   ongo      sMongosM      ongosM    sMongosMo    

**************************************************************************************/

var shardedManager;

var setUpSharded = function(configuration, options, callback) {
  var ShardingManager = require('mongodb-tools').ShardingManager
    , Db = configuration.require.Db
    , Server = configuration.require.Server
    , MongoClient = configuration.require.MongoClient
    , path = require('path');

  // Check if we have any options
  if(typeof options == 'function') callback = options, options = null;

  // Sharding options
  var shOptions = {
      mongosStartPort: 50000
    , replsetStartPort: 31000
    , dbpath: path.join(path.resolve('db'))
    , logpath: path.join(path.resolve('db'))
    , replicasetOptions: {
        auth: null
      , keyFile: __dirname + '/data/keyfile.txt'
        // ReplSet settings
      , secondaries: 2      
    }
    , mongosOptions: {
      keyFile: __dirname + '/data/keyfile.txt'      
    }
    , configsOptions: {
        auth: null
      , keyFile: __dirname + '/data/keyfile.txt'      
    }
  }

  // Override options
  if(options) shOptions = options;

  // Create Replicaset Manager
  shardedManager = new ShardingManager(shOptions);

  // Start SSL replicaset manager
  shardedManager.start({kill: true, purge:true, signal: -9}, function(err, result) {      
    if(err != null) throw err;
    // Finish setup
    callback();      
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

    setUpSharded(configuration, function(err) {
      var mongos = new Mongos([
          new Server( 'localhost', shardedManager.mongosStartPort),
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
              // Just set auths for the manager to handle it correctly
              shardedManager.setCredentials("mongocr", "node-native-test", "me", "secret");

              // Close the connection
              db.close();

              setTimeout(function() {
                // connection string
                var config = f("mongodb://me:secret@localhost:%s/node-native-test"
                  , shardedManager.mongosStartPort);
                // Connect
                MongoClient.connect(config, function(error, client) {
                  test.equal(null, error);

                  client.collections(function(error, names) {
                    test.equal(null, error);
                    
                    client.close();

                    shardedManager.stop(function() {
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
exports['Should correctly handle replicaset master stepdown and stepup without loosing auth for sharding'] = {
  metadata: { requires: { topology: ['auth'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient
      , Db = configuration.require.Db
      , Server = configuration.require.Server
      , Mongos = configuration.require.Mongos;

    setUpSharded(configuration, function(err) {
      var mongos = new Mongos([
          new Server( 'localhost', shardedManager.mongosStartPort),
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

              // Just set auths for the manager to handle it correctly
              shardedManager.setCredentials("mongocr", "admin", "me", "secret");

              // Close the connection
              db.close();

              // connection string
              var config = f("mongodb://me:secret@localhost:%s/node-native-test"
                , shardedManager.mongosStartPort);
              // Connect
              MongoClient.connect(config, function(error, client) {
                test.equal(null, error);

                client.collections(function(error, names) {
                  test.equal(null, error);

                  // Kill the mongos proxy
                  shardedManager.remove('mongos', {index: 0}, function(err, serverDetails1) {

                    shardedManager.remove('mongos', {index: 1}, function(err, serverDetails2) {

                      client.collections(function(error, names) {
                        test.equal(null, error);
                      });

                      shardedManager.add(serverDetails1, function(err, result) {
                        
                        shardedManager.add(serverDetails2, function(err, result) {
                          
                          client.collections(function(error, names) {
                            test.equal(null, error);

                            client.close();

                            shardedManager.stop(function() {
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