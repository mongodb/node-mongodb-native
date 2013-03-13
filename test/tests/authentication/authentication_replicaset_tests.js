var format = require('util').format
  Step = require('step');

/**
 * @ignore
 */
exports['Should correctly handle replicaset master stepdown and stepup without loosing auth'] = function(configuration, test) {
  var Db = configuration.getMongoPackage().Db
    , Server = configuration.getMongoPackage().Server
    , ReplSetServers = configuration.getMongoPackage().ReplSetServers;

  var replSet = new ReplSetServers( [
      new Server( 'localhost', configuration.startPort),
      new Server( 'localhost', configuration.startPort + 1)
    ],
    {rs_name:"replica-set-foo", poolSize:1}
  );

  // Connect
  new Db('replicaset_test_auth', replSet, {w:0}).open(function(err, db) {    
    // Just set auths for the manager to handle it correctly
    configuration.setAuths("root", "root");
    // Add a user
    db.admin().addUser("root", "root", {w:3}, function(err, result) {
      test.equal(null, err);

      db.admin().authenticate("root", "root", function(err, result) {
        test.equal(null, err);
        test.ok(result);

        configuration.killPrimary(9, function(err, result) {
          db.collection('replicaset_test_auth').insert({a:1}, {w:1}, function(err, result) {
            test.equal(null, err);

            db.close();
            test.done();
          });
        });
      });
    });
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyAuthenticateUsingPrimary = function(configuration, test) {
  var Db = configuration.getMongoPackage().Db;  
  // connection string
  var config = format("mongodb://me:secret@localhost:%s/node-native-test", configuration.startPort);
  // Connect
  Db.connect(config, function(error, client) {
    if (error) {
      console.log("Received connection error (" + error + ") with " + config)
    } else {
      // console.log("Connected with " + config)
      client.collectionNames(function(error, names) {
        if (error) {
          console.log("Error querying (" + error + ") with " + config)
        } else {
          // console.log("Queried with " + config)
        }
        
        client.close();
        test.done();
      })
    }
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyAuthenticateWithTwoSeeds = function(configuration, test) {
  var Db = configuration.getMongoPackage().Db;  
  // connection string
  var config = format("mongodb://me:secret@localhost:%s,localhost:%s/node-native-test", configuration.startPort, configuration.startPort + 1);
  // Connect
  Db.connect(config, function(error, client) {
    if (error) {
      console.log("Received connection error (" + error + ") with " + config)
    } else {
      // console.log("Connected with " + config)
      client.collectionNames(function(error, names) {
        if (error) {
          console.log("Error querying (" + error + ") with " + config)
        } else {
          // console.log("Queried with " + config)
        }
        
        client.close();
        test.done();
      })
    }
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyAuthenticateWithOnlySecondarySeed = function(configuration, test) {
  var Db = configuration.getMongoPackage().Db;  
  // connection string
  var config = format("mongodb://me:secret@localhost:%s/node-native-test?slaveOk=true", configuration.startPort);
  // Connect
  Db.connect(config, function(error, client) {
    if (error) {
      console.log("Received connection error (" + error + ") with " + config)
    } else {
      // console.log("Connected with " + config)
      client.collectionNames(function(error, names) {
        if (error) {
          console.log("Error querying (" + error + ") with " + config)
        } else {
          // console.log("Queried with " + config)
        }
        
        client.close();
        test.done();
      })
    }
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyAuthenticateWithMultipleLoginsAndLogouts = function(configuration, test) {
  var Db = configuration.getMongoPackage().Db
    , Server = configuration.getMongoPackage().Server
    , ReplSetServers = configuration.getMongoPackage().ReplSetServers;

  var replicaset = configuration.getReplicasetManager();

  var replSet = new ReplSetServers( [
      new Server( replicaset.host, replicaset.ports[1]),
      new Server( replicaset.host, replicaset.ports[0]),
    ],
    {rs_name:replicaset.name}
  );

  // Connect to the replicaset
  var slaveDb = null;
  var db = new Db('foo', replSet, {w:0, native_parser: (process.env['TEST_NATIVE'] != null)});
  db.open(function(err, p_db) {
    Step(
      function addUser() {
        db.admin().addUser("me", "secret", {w:3}, this);
      },

      function ensureFailingInsert(err, result) {
        // return
        var self = this;
        test.equal(null, err);
        test.ok(result != null);

        db.collection("stuff", function(err, collection) {
          collection.insert({a:2}, {safe: {w: 3}}, self);
        });
      },

      function authenticate(err, result) {
        test.ok(err != null);

        db.admin().authenticate("me", "secret", this);
      },

      function changePassword(err, result) {
        var self = this;
        test.equal(null, err);
        test.ok(result);

        db.admin().addUser("me", "secret2", {w:3}, this);
      },

      function authenticate(err, result) {
        db.admin().authenticate("me", "secret2", this);
      },

      function insertShouldSuccedNow(err, result) {
        var self = this;
        test.equal(null, err);
        test.ok(result);

        db.collection("stuff", function(err, collection) {
          collection.insert({a:3}, {safe: true}, self);
        });
      },

      function queryShouldExecuteCorrectly(err, result) {
        var self = this;
        test.equal(null, err);

        db.collection("stuff", function(err, collection) {
          collection.findOne(self);
        });
      },

      function logout(err, item) {
        test.ok(err == null);
        test.equal(3, item.a);

        db.admin().logout(this);
      },

      function findShouldFailDueToLoggedOut(err, result) {
        var self = this;
        test.equal(null, err);

        db.collection("stuff", function(err, collection) {
          collection.findOne(self);
        });
      },

      function sameShouldApplyToRandomSecondaryServer(err, result) {
        var self = this;
        test.ok(err != null);

        slaveDb = new Db('foo', new Server(db.serverConfig.secondaries[0].host
                  , db.serverConfig.secondaries[0].port, {auto_reconnect: true, poolSize: 1}), {w:0, native_parser: (process.env['TEST_NATIVE'] != null), slave_ok:true});
        slaveDb.open(function(err, slaveDb) {
          slaveDb.collection('stuff', function(err, collection) {
            collection.findOne(self)
          })
        });
      },

      function shouldCorrectlyAuthenticateAgainstSecondary(err, result) {
        test.ok(err != null)
        slaveDb.admin().authenticate('me', 'secret2', this);
      },

      function shouldCorrectlyInsertItem(err, result) {
        var self = this;
        test.equal(null, err);
        test.ok(result);

        slaveDb.collection('stuff', function(err, collection) {
          collection.findOne(self)
        })
      },

      function finishUp(err, item) {
        test.ok(err == null);
        test.equal(3, item.a);

        test.done();
        p_db.close();
        slaveDb.close();
      }
    )
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyAuthenticate = function(configuration, test) {
  var Db = configuration.getMongoPackage().Db
    , Server = configuration.getMongoPackage().Server
    , ReplSetServers = configuration.getMongoPackage().ReplSetServers;

  var replicaset = configuration.getReplicasetManager();

  var replSet = new ReplSetServers( [
      new Server( replicaset.host, replicaset.ports[1]),
      new Server( replicaset.host, replicaset.ports[0]),
    ],
    {rs_name:replicaset.name, read_secondary:true, poolSize:1}
  );

  // Connect to the replicaset
  var slaveDb = null;
  var db = new Db('foo', replSet, {w:0});
  db.open(function(err, p_db) {
    Step(
      function addUser() {
        db.admin().addUser("me", "secret", {w:3}, this);
      },

      function ensureFailingInsert(err, result) {
        var self = this;
        test.equal(null, err);
        test.ok(result != null);

        db.collection("stuff", function(err, collection) {
          collection.insert({a:2}, {safe: {w: 2, wtimeout: 10000}}, self);
        });
      },

      function authenticate(err, result) {
        test.ok(err != null);

        db.admin().authenticate("me", "secret", this);
      },

      function insertShouldSuccedNow(err, result) {
        var self = this;
        test.equal(null, err);
        test.ok(result);

        db.collection("stuff", function(err, collection) {
          collection.insert({a:2}, {safe: {w: 2, wtimeout: 10000}}, self);
        });
      },

      function queryShouldExecuteCorrectly(err, result) {
        var self = this;
        test.equal(null, err);

        db.collection("stuff", function(err, collection) {
          collection.findOne(self);
        });
      },

      function finishUp(err, item) {
        test.ok(err == null);
        test.equal(2, item.a);
        p_db.close();
        test.done();
      }
    )
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyAuthenticateAndEnsureIndex = function(configuration, test) {
  var Db = configuration.getMongoPackage().Db
    , Server = configuration.getMongoPackage().Server
    , ReplSetServers = configuration.getMongoPackage().ReplSetServers;

  var replicaset = configuration.getReplicasetManager();

  var replSet = new ReplSetServers( [
      new Server( replicaset.host, replicaset.ports[1]),
      new Server( replicaset.host, replicaset.ports[0]),
    ],
    {rs_name:replicaset.name, poolSize:1}
  );

  var db = new Db(configuration.db_name, replSet, {w:0, native_parser: false});
  db.open(function(err, db_p) {
    if (err){
      console.log('ERR:'+err);
      console.log('DB:'+db_p);
    }

    db_p.addUser('test', 'test', {w:3}, function(err, result) {
      if (err){
        console.log('ERR AUTH:'+err);
        console.log('replies:'+result);
      }

      db_p.authenticate('test', 'test', function(err, replies) {
        if (err){
          console.log('ERR AUTH:'+err);
          console.log('replies:'+replies);
        }

        db_p.collection('userconfirm', function( err, result ){
          if (err){
            console.log('Collection ERR:'+err);
          }

          var userconfirm = result;
          var ensureIndexOptions = { unique: true, safe: false, background: true };
          userconfirm.ensureIndex([ [ 'confirmcode', 1 ] ],ensureIndexOptions, function(err, item){

            if (err){
              console.log('Userconfirm ensure index failed:'+err);
            }

            db_p.collection('session', function( err, result ){
              if (err){
                console.log('Collection SESSION ERR:'+err);
              }

              var session = result;
              session.ensureIndex([ [ 'sid', 1 ] ],ensureIndexOptions, function(err, res){
                if(err){
                  console.log('Session ensure index failed'+err);
                }

                db_p.close();
                test.done();
              });
            });
          });
        });
      });
    });
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyAuthenticateAndUseReadPreference = function(configuration, test) {
  var Db = configuration.getMongoPackage().Db
    , Server = configuration.getMongoPackage().Server
    , ReplSetServers = configuration.getMongoPackage().ReplSetServers;

  var replicaset = configuration.getReplicasetManager();

  var replSet = new ReplSetServers( [
      new Server( replicaset.host, replicaset.ports[1]),
      new Server( replicaset.host, replicaset.ports[0]),
    ],
    {rs_name:replicaset.name, poolSize:1}
  );

  var db = new Db(configuration.db_name, replSet, {w:0, native_parser: false});
  db.open(function(err, db_p) {
    test.equal(null, err);

    db_p.addUser('test', 'test', {w:3}, function(err, result) {
      test.equal(null, err);

      db_p.authenticate('test', 'test', function(err, replies) {
        test.equal(null, err);

        db_p.collection('userconfirm2').insert({a:1}, {w:1}, function(err, result) {
          test.equal(null, err);

          db_p.collection('userconfirm2').findOne(function(err, item) {            
            test.equal(null, err);
            test.equal(1, item.a);
            db_p.close();
            test.done();
          });
        });
      });
    });
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyBringReplicasetStepDownPrimaryAndStillReadFromSecondary = function(configuration, test) {
  var Db = configuration.getMongoPackage().Db
    , Server = configuration.getMongoPackage().Server
    , ReplSetServers = configuration.getMongoPackage().ReplSetServers
    , ReadPreference = configuration.getMongoPackage().ReadPreference;

  var replicaset = configuration.getReplicasetManager();

  var replSet = new ReplSetServers( [
      new Server( replicaset.host, replicaset.ports[1]),
      new Server( replicaset.host, replicaset.ports[0]),
    ],
    {rs_name:replicaset.name, poolSize:1}
  );

  var db = new Db(configuration.db_name, replSet, {w:1, native_parser: false});
  db.open(function(err, db_p) {
    test.equal(null, err);

    db.collection('test').insert({a:1}, {w:1}, function(err, result) {
      test.equal(null, err);

      db_p.addUser('test', 'test', {w:3}, function(err, result) {
        test.equal(null, err);
        test.ok(result != null);

        db_p.authenticate('test', 'test', function(err, result) {
          test.equal(null, err);
          test.equal(true, result);

          // Step down the primary
          configuration.stepDownPrimary(function(err, result) {

            // Wait for the secondary to recover
            setTimeout(function(e) {
              var counter = 1000;
              var errors = 0;

              for(var i = 0; i < counter; i++) {
                db_p.collection('test').find({a:1}).setReadPreference(ReadPreference.SECONDARY).toArray(function(err, r) {
                  counter = counter - 1;

                  if(err != null) {
                    errors = errors + 1;
                    console.dir(err)
                  }

                  if(counter == 0) {
                    test.equal(0, errors)

                    db_p.close();
                    test.done();
                  }
                });
              }
            }, 30000);
          });
        });
      });
    });
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyAuthWithSecondaryAfterKillPrimary = function(configuration, test) {
  var Db = configuration.getMongoPackage().Db
    , Server = configuration.getMongoPackage().Server
    , ReplSetServers = configuration.getMongoPackage().ReplSetServers
    , ReadPreference = configuration.getMongoPackage().ReadPreference;

  var replicaset = configuration.getReplicasetManager();

  var replSet = new ReplSetServers( [
      new Server( replicaset.host, replicaset.ports[1]),
      new Server( replicaset.host, replicaset.ports[0]),
    ],
    {rs_name:replicaset.name, poolSize:1, read_secondary: true}
  );

  var db = new Db(configuration.db_name, replSet, { w: 1 });
  db.open(function(err, db) {
    db.admin().addUser("me", "secret", {w:3}, function runWhatever(err, result) {
      test.equal(null, err);
      //create an admin account so that authentication is required on collections
      db.admin().authenticate("me", "secret", function(err, result) {

        //add a non-admin user
        db.addUser('test', 'test', {w:3}, function(err, result) {
          test.equal(null, err);

          db.authenticate('test', 'test', function(err, result) {
            //insert, just to give us something to find
            db.collection('test').insert({a: 1}, {w: 1}, function(err, result) {
          
              db.collection('test').find({a: 1}).toArray(function(err, r) {
                test.equal(null, err);

                configuration.setAuths("me", "secret");

                configuration.killPrimary(function(err, result) {

                  // Wait for the primary to come back up, as a secondary.
                  setTimeout(function(e) {
                    var counter = 20;
                    var errors = 0;
                    for(var i = 0; i < counter; i++) {
                      db.collection('test').find({a: 1}).toArray(
                      function(err, r) {
                        counter = counter - 1;
                        if(err != null) {
                          errors = errors + 1;
                          console.dir(err)
                        }

                        if(counter == 0) {
                          test.equal(0, errors)
                          db.close();
                          test.done();
                        }
                      });
                    }
                  }, 30000);
                });
              });
            });
          });
        });
      });
    });
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyAuthAgainstReplicaSetAdminDbUsingMongoClient = function(configuration, test) {
  var Db = configuration.getMongoPackage().Db
    , Server = configuration.getMongoPackage().Server
    , MongoClient = configuration.getMongoPackage().MongoClient
    , ReplSetServers = configuration.getMongoPackage().ReplSetServers
    , ReadPreference = configuration.getMongoPackage().ReadPreference;

  var replicaset = configuration.getReplicasetManager();

  var replSet = new ReplSetServers( [
      new Server( replicaset.host, replicaset.ports[1]),
      new Server( replicaset.host, replicaset.ports[0]),
    ],
    {rs_name:replicaset.name, poolSize:1, read_secondary: true}
  );

  var dbName = 'admin';

  new Db(dbName, replSet, {w:3}).open(function(err, db_p) {
    db_p.admin().addUser("me", "secret", {w:3}, function runWhatever(err, result) {
      test.equal(null, err);
      test.ok(result != null);
      db_p.close();

      MongoClient.connect(format("mongodb://me:secret@%s:%s/%s?rs_name=%s&readPreference=secondary&w=3"
        , replicaset.host, replicaset.ports[0], dbName, replicaset.name), function(err, db) {
          test.equal(null, err);

          // Insert document
          db.collection('authcollectiontest').insert({a:1}, function(err, result) {
            test.equal(null, err);

            // Find the document
            db.collection('authcollectiontest').find().toArray(function(err, docs) {
              test.equal(null, err);
              test.equal(1, docs.length);
              test.equal(1, docs[0].a);

              db.close();
              test.done();
            });
          });
      });
    });
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyAuthAgainstNormalDbUsingMongoClient = function(configuration, test) {
  var Db = configuration.getMongoPackage().Db
    , Server = configuration.getMongoPackage().Server
    , MongoClient = configuration.getMongoPackage().MongoClient
    , ReplSetServers = configuration.getMongoPackage().ReplSetServers
    , ReadPreference = configuration.getMongoPackage().ReadPreference;

  var replicaset = configuration.getReplicasetManager();

  var replSet = new ReplSetServers( [
      new Server( replicaset.host, replicaset.ports[1]),
      new Server( replicaset.host, replicaset.ports[0]),
    ],
    {rs_name:replicaset.name, poolSize:1, read_secondary: true}
  );

  var dbName = configuration.db_name;

  new Db(dbName, replSet, {w:3}).open(function(err, db_p) {
    db_p.addUser("me", "secret", {w:3}, function runWhatever(err, result) {
      test.equal(null, err);
      test.ok(result != null);
      db_p.close();

      MongoClient.connect(format("mongodb://me:secret@%s:%s/%s?rs_name=%s&readPreference=secondary&w=3"
        , replicaset.host, replicaset.ports[0], dbName, replicaset.name), function(err, db) {
          test.equal(null, err);

          // Insert document
          db.collection('authcollectiontest').insert({a:1}, function(err, result) {
            test.equal(null, err);

            // Find the document
            db.collection('authcollectiontest').find().toArray(function(err, docs) {
              test.equal(null, err);
              test.equal(1, docs.length);
              test.equal(1, docs[0].a);

              db.close();
              test.done();
            });
          });
      });
    });
  });
}
