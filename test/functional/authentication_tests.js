exports['Should correctly authenticate against admin db'] = {
  metadata: { requires: { topology: ['auth'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var Db = configuration.require.Db
      , MongoClient = configuration.require.MongoClient
      , Server = configuration.require.Server;

    // restart server
    configuration.restart(function() {
      var db1 = new Db('mongo-ruby-test-auth1', new Server(configuration.host, configuration.port, {auto_reconnect: true}), {w:1});
      db1.open(function(err, db) {
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

// exports['Should correctly authenticate against normal db'] = {
//   metadata: { requires: { topology: ['auth'] } },
  
//   // The actual test we wish to run
//   test: function(configuration, test) {
//     var Db = configuration.require.Db
//       , MongoClient = configuration.require.MongoClient
//       , Server = configuration.require.Server;

//     // restart server
//     configuration.restart({purgedirectories: true}, function() {
//       var db1 = new Db('mongo-ruby-test-auth1', new Server("127.0.0.1", 27017, {auto_reconnect: true}), {w:1});
//       db1.open(function(err, db) {
//         db.addUser('user', 'user', function(err, result) {
//           test.equal(null, err);

//           // An admin user must be defined for db level authentication to work correctly
//           db.admin().addUser('admin', 'admin', function(err, result) {

//             // Attempt to save a document
//             db.collection('test').insert({a:1}, function(err, result) {
//               test.ok(err != null);

//               // Login the user
//               db.authenticate("user", "user", function(err, result) {
//                 test.equal(null, err);
//                 test.ok(result);

//                 db.collection('test').insert({a:1}, function(err, result) {
//                   test.equal(null, err);

//                   // Logout the user
//                   db.logout(function(err, result) {
//                     test.equal(null, err);

//                     // Attempt to save a document
//                     db.collection('test').insert({a:1}, function(err, result) {
//                       test.ok(err != null);

//                       // restart server
//                       configuration.restart({purgedirectories: true}, function() {
//                         db1.close();
//                         test.done();
//                       });
//                     });
//                   });
//                 });
//               });
//             });
//           });
//         });
//       });
//     });
//   }
// }

// exports['Should correctly reapply the authentications'] = {
//   metadata: { requires: { topology: ['auth'] } },
  
//   // The actual test we wish to run
//   test: function(configuration, test) {
//     var Db = configuration.require.Db
//       , MongoClient = configuration.require.MongoClient
//       , Server = configuration.require.Server;

//     // restart server
//     configuration.restart({purgedirectories: true}, function() {
//       var db1 = new Db('mongo-ruby-test-auth1', new Server("127.0.0.1", 27017, {auto_reconnect: true}), {w:1});
//       db1.open(function(err, db) {
//         db.admin().addUser('admin', 'admin', function(err, result) {
//           test.equal(null, err);

//           // Attempt to save a document
//           db.collection('test').insert({a:1}, function(err, result) {
//             test.ok(err != null);

//             // Login the user
//             db.admin().authenticate("admin", "admin", function(err, result) {
//               test.equal(null, err);
//               test.ok(result);

//               db.collection('test').insert({a:1}, function(err, result) {
//                 test.equal(null, err);

//                 // Bounce server
//                 configuration.restart({purgedirectories: false}, function() {

//                   // Reconnect should reapply the credentials
//                   db.collection('test').insert({a:1}, function(err, result) {
//                     test.equal(null, err);

//                     // restart server
//                     configuration.restart({purgedirectories: true}, function() {
//                       db1.close();
//                       test.done();
//                     });
//                   });
//                 });
//               });
//             });
//           });
//         });
//       });
//     });
//   }
// }

// exports['Ordered bulk operation should fail correctly when not authenticated'] = {
//   metadata: { requires: { topology: ['auth'] } },
  
//   // The actual test we wish to run
//   test: function(configuration, test) {
//     var Db = configuration.require.Db
//       , MongoClient = configuration.require.MongoClient
//       , Server = configuration.require.Server;

//     // restart server
//     configuration.restart({purgedirectories: true}, function() {
//       var db1 = new Db('mongo-ruby-test-auth1', new Server("127.0.0.1", 27017, {auto_reconnect: true}), {w:1});
//       db1.open(function(err, db) {
//         db.admin().addUser('admin', 'admin', function(err, result) {
//           test.equal(null, err);

//           // Attempt to save a document
//           var col = db.collection('test');

//           // Initialize the Ordered Batch
//           var batch = col.initializeOrderedBulkOp();

//           // Add some operations to be executed in order
//           batch.insert({a:1});
//           batch.find({a:1}).updateOne({$set: {b:1}});
//           batch.find({a:2}).upsert().updateOne({$set: {b:2}});
//           batch.insert({a:3});
//           batch.find({a:3}).remove({a:3});

//           // Execute the operations
//           batch.execute(function(err, result) {
//             test.ok(err != null);
//             test.ok(err.code != null);
//             test.ok(err.errmsg != null);

//             db1.close();
//             test.done();
//           });
//         });
//       });
//     });
//   }
// }

// exports['Unordered bulk operation should fail correctly when not authenticated'] = {
//   metadata: { requires: { topology: ['auth'] } },
  
//   // The actual test we wish to run
//   test: function(configuration, test) {
//     var Db = configuration.require.Db
//       , MongoClient = configuration.require.MongoClient
//       , Server = configuration.require.Server;

//     // restart server
//     configuration.restart({purgedirectories: true}, function() {
//       var db1 = new Db('mongo-ruby-test-auth1', new Server("127.0.0.1", 27017, {auto_reconnect: true}), {w:1});
//       db1.open(function(err, db) {
//         db.admin().addUser('admin', 'admin', function(err, result) {
//           test.equal(null, err);

//           // Attempt to save a document
//           var col = db.collection('test');

//           // Initialize the Ordered Batch
//           var batch = col.initializeUnorderedBulkOp();

//           // Add some operations to be executed in order
//           batch.insert({a:1});
//           batch.find({a:1}).updateOne({$set: {b:1}});
//           batch.find({a:2}).upsert().updateOne({$set: {b:2}});
//           batch.insert({a:3});
//           batch.find({a:3}).remove({a:3});

//           // Execute the operations
//           batch.execute(function(err, result) {
//             test.ok(err != null);
//             test.ok(err.code != null);
//             test.ok(err.errmsg != null);

//             db1.close();
//             test.done();
//           });
//         });
//       });
//     });
//   }
// }






















// /**
//  * @ignore
//  */
// exports['Should correctly handle replicaset master stepdown and stepup without loosing auth'] = {
//   metadata: { requires: { topology: ['auth'] } },
  
//   // The actual test we wish to run
//   test: function(configuration, test) {
//     var Db = configuration.require.Db
//       , Server = configuration.require.Server
//       , ReplSetServers = configuration.require.ReplSetServers;

//     var replSet = new ReplSetServers( [
//         new Server( 'localhost', configuration.startPort),
//         new Server( 'localhost', configuration.startPort + 1)
//       ],
//       {rs_name:"replica-set-foo", poolSize:1}
//     );

//     // Connect
//     new Db('replicaset_test_auth', replSet, {w:0}).open(function(err, db) {    
//       // Just set auths for the manager to handle it correctly
//       configuration.setAuths("root", "root");
//       // Add a user
//       db.admin().addUser("root", "root", {w:3}, function(err, result) {
//         test.equal(null, err);

//         db.admin().authenticate("root", "root", function(err, result) {
//           test.equal(null, err);
//           test.ok(result);

//           configuration.killPrimary(9, function(err, result) {
//             db.collection('replicaset_test_auth').insert({a:1}, {w:1}, function(err, result) {
//               test.equal(null, err);

//               db.close();
//               test.done();
//             });
//           });
//         });
//       });
//     });
//   }
// }

// /**
//  * @ignore
//  */
// exports.shouldCorrectlyAuthenticateUsingPrimary = {
//   metadata: { requires: { topology: ['auth'] } },
  
//   // The actual test we wish to run
//   test: function(configuration, test) {
//     var Db = configuration.require.Db
//       , Server = configuration.require.Server
//       , ReplSetServers = configuration.require.ReplSetServers;

//     var replicaset = configuration.getReplicasetManager();

//     var replSet = new ReplSetServers( [
//         new Server( replicaset.host, replicaset.ports[1]),
//         new Server( replicaset.host, replicaset.ports[0]),
//       ],
//       {rs_name:replicaset.name}
//     );

//     var db = new Db('node-native-test', replSet, {w:1, native_parser: (process.env['TEST_NATIVE'] != null)});
//     db.open(function(err, p_db) {
//       db.addUser("me", "secret", {w:3}, function(err, result) {
//         replicaset.setAuths("me", "secret");
//         db.close();

//         // connection string
//         var config = format("mongodb://me:secret@localhost:%s/node-native-test", configuration.startPort);
//         // Connect
//         Db.connect(config, function(error, client) {
//           if (error) {
//             console.log("Received connection error (" + error + ") with " + config)
//           } else {
//             // console.log("Connected with " + config)
//             client.collectionNames(function(error, names) {
//               if (error) {
//                 console.log("Error querying (" + error + ") with " + config)
//               } else {
//                 // console.log("Queried with " + config)
//               }
              
//               client.close();
//               test.done();
//             })
//           }
//         });
//       });
//     });
//   }
// }

// /**
//  * @ignore
//  */
// exports.shouldCorrectlyAuthenticateWithTwoSeeds = {
//   metadata: { requires: { topology: ['auth'] } },
  
//   // The actual test we wish to run
//   test: function(configuration, test) {
//     var Db = configuration.require.Db
//       , Server = configuration.require.Server
//       , ReplSetServers = configuration.require.ReplSetServers;

//     var replicaset = configuration.getReplicasetManager();

//     var replSet = new ReplSetServers( [
//         new Server( replicaset.host, replicaset.ports[1]),
//         new Server( replicaset.host, replicaset.ports[0]),
//       ],
//       {rs_name:replicaset.name}
//     );

//     var db = new Db('node-native-test', replSet, {w:1, native_parser: (process.env['TEST_NATIVE'] != null)});
//     db.open(function(err, p_db) {
//       db.addUser("me", "secret", {w:3}, function(err, result) {
//         replicaset.setAuths("me", "secret");
//         db.close();

//         // connection string
//         var config = format("mongodb://me:secret@localhost:%s,localhost:%s/node-native-test", configuration.startPort, configuration.startPort + 1);
//         // Connect
//         Db.connect(config, function(error, client) {
//           if (error) {
//             console.log("Received connection error (" + error + ") with " + config)
//           } else {
//             // console.log("Connected with " + config)
//             client.collectionNames(function(error, names) {
//               if (error) {
//                 console.log("Error querying (" + error + ") with " + config)
//               } else {
//                 // console.log("Queried with " + config)
//               }
              
//               client.close();
//               test.done();
//             })
//           }
//         });
//       });
//     });
//   }
// }

// /**
//  * @ignore
//  */
// exports.shouldCorrectlyAuthenticateWithOnlySecondarySeed = {
//   metadata: { requires: { topology: ['auth'] } },
  
//   // The actual test we wish to run
//   test: function(configuration, test) {
//     var Db = configuration.require.Db
//       , Server = configuration.require.Server
//       , ReplSetServers = configuration.require.ReplSetServers;

//     var replicaset = configuration.getReplicasetManager();

//     var replSet = new ReplSetServers( [
//         new Server( replicaset.host, replicaset.ports[1]),
//         new Server( replicaset.host, replicaset.ports[0]),
//       ],
//       {rs_name:replicaset.name}
//     );

//     var db = new Db('node-native-test', replSet, {w:1, native_parser: (process.env['TEST_NATIVE'] != null)});
//     db.open(function(err, p_db) {
//       db.addUser("me", "secret", {w:3}, function(err, result) {
//         replicaset.setAuths("me", "secret");
//         // Close the connection
//         db.close();

//         // connection string
//         var config = format("mongodb://me:secret@localhost:%s/node-native-test?slaveOk=true", configuration.startPort);
//         // Connect
//         Db.connect(config, function(error, client) {
//           if (error) {
//             console.log("Received connection error (" + error + ") with " + config)
//           } else {
//             // console.log("Connected with " + config)
//             client.collectionNames(function(error, names) {
//               if (error) {
//                 console.log("Error querying (" + error + ") with " + config)
//               } else {
//                 // console.log("Queried with " + config)
//               }
              
//               client.close();
//               test.done();
//             })
//           }
//         });
//       });
//     });
//   }
// }

// /**
//  * @ignore
//  */
// exports.shouldCorrectlyAuthenticateWithMultipleLoginsAndLogouts = {
//   metadata: { requires: { topology: ['auth'] } },
  
//   // The actual test we wish to run
//   test: function(configuration, test) {
//     var Db = configuration.require.Db
//       , Server = configuration.require.Server
//       , ReplSetServers = configuration.require.ReplSetServers;

//     var replicaset = configuration.getReplicasetManager();

//     var replSet = new ReplSetServers( [
//         new Server( replicaset.host, replicaset.ports[1]),
//         new Server( replicaset.host, replicaset.ports[0]),
//       ],
//       {rs_name:replicaset.name}
//     );

//     // Connect to the replicaset
//     var slaveDb = null;
//     var db = new Db('foo', replSet, {w:0, native_parser: (process.env['TEST_NATIVE'] != null)});
//     db.open(function(err, p_db) {
//       Step(
//         function addUser() {
//           db.admin().addUser("me", "secret", {w:3}, this);
//         },

//         function ensureFailingInsert(err, result) {
//           // return
//           var self = this;
//           test.equal(null, err);
//           test.ok(result != null);
//           replicaset.setAuths("me", "secret");

//           db.collection("stuff", function(err, collection) {
//             collection.insert({a:2}, {safe: {w: 3}}, self);
//           });
//         },

//         function authenticate(err, result) {
//           test.ok(err != null);

//           db.admin().authenticate("me", "secret", this);
//         },

//         function changePassword(err, result) {
//           var self = this;
//           test.equal(null, err);
//           test.ok(result);

//           db.admin().addUser("me2", "secret2", {w:3}, this);
//         },

//         function authenticate(err, result) {
//           db.admin().authenticate("me2", "secret2", this);
//         },

//         function insertShouldSuccedNow(err, result) {
//           var self = this;
//           test.equal(null, err);
//           test.ok(result);

//           db.collection("stuff", function(err, collection) {
//             collection.insert({a:3}, {safe: true}, self);
//           });
//         },

//         function queryShouldExecuteCorrectly(err, result) {
//           var self = this;
//           test.equal(null, err);

//           db.collection("stuff", function(err, collection) {
//             collection.findOne(self);
//           });
//         },

//         function logout(err, item) {
//           test.ok(err == null);
//           test.equal(3, item.a);

//           db.admin().logout(this);
//         },

//         function findShouldFailDueToLoggedOut(err, result) {
//           var self = this;
//           test.equal(null, err);

//           db.collection("stuff", function(err, collection) {
//             collection.findOne(self);
//           });
//         },

//         function sameShouldApplyToRandomSecondaryServer(err, result) {
//           var self = this;
//           test.ok(err != null);

//           slaveDb = new Db('foo', new Server(db.serverConfig.secondaries[0].host
//                     , db.serverConfig.secondaries[0].port, {auto_reconnect: true, poolSize: 1}), {w:0, native_parser: (process.env['TEST_NATIVE'] != null), slaveOk:true});
//           slaveDb.open(function(err, slaveDb) {
//             slaveDb.collection('stuff', function(err, collection) {
//               collection.findOne(self)
//             })
//           });
//         },

//         function shouldCorrectlyAuthenticateAgainstSecondary(err, result) {
//           test.ok(err != null)
//           slaveDb.admin().authenticate('me2', 'secret2', this);
//         },

//         function shouldCorrectlyInsertItem(err, result) {
//           var self = this;
//           test.equal(null, err);
//           test.ok(result);

//           slaveDb.collection('stuff', function(err, collection) {
//             collection.findOne(self)
//           })
//         },

//         function finishUp(err, item) {
//           test.ok(err == null);
//           test.equal(3, item.a);

//           test.done();
//           p_db.close();
//           slaveDb.close();
//         }
//       )
//     });
//   }
// }

// /**
//  * @ignore
//  */
// exports.shouldCorrectlyAuthenticateReplicaset = {
//   metadata: { requires: { topology: ['auth'] } },
  
//   // The actual test we wish to run
//   test: function(configuration, test) {
//     var Db = configuration.require.Db
//       , Server = configuration.require.Server
//       , ReplSetServers = configuration.require.ReplSetServers;

//     var replicaset = configuration.getReplicasetManager();

//     var replSet = new ReplSetServers( [
//         new Server( replicaset.host, replicaset.ports[1]),
//         new Server( replicaset.host, replicaset.ports[0]),
//       ],
//       {rs_name:replicaset.name, read_secondary:true, poolSize:1}
//     );

//     // Connect to the replicaset
//     var slaveDb = null;
//     var db = new Db('foo', replSet, {w:0});
//     db.open(function(err, p_db) {
//       Step(
//         function addUser() {
//           db.admin().addUser("me", "secret", {w:3}, this);
//         },

//         function ensureFailingInsert(err, result) {
//           var self = this;
//           test.equal(null, err);
//           test.ok(result != null);
//           replicaset.setAuths("me", "secret");

//           db.collection("stuff", function(err, collection) {
//             collection.insert({a:2}, {safe: {w: 2, wtimeout: 10000}}, self);
//           });
//         },

//         function authenticate(err, result) {
//           test.ok(err != null);

//           db.admin().authenticate("me", "secret", this);
//         },

//         function insertShouldSuccedNow(err, result) {
//           var self = this;
//           test.equal(null, err);
//           test.ok(result);

//           db.collection("stuff", function(err, collection) {
//             collection.insert({a:2}, {safe: {w: 2, wtimeout: 10000}}, self);
//           });
//         },

//         function queryShouldExecuteCorrectly(err, result) {
//           var self = this;
//           test.equal(null, err);

//           db.collection("stuff", function(err, collection) {
//             collection.findOne(self);
//           });
//         },

//         function finishUp(err, item) {
//           test.ok(err == null);
//           test.equal(2, item.a);
//           p_db.close();
//           test.done();
//         }
//       )
//     });
//   }
// }

// /**
//  * @ignore
//  */
// exports.shouldCorrectlyAuthenticateAndEnsureIndex = {
//   metadata: { requires: { topology: ['auth'] } },
  
//   // The actual test we wish to run
//   test: function(configuration, test) {
//     var Db = configuration.require.Db
//       , Server = configuration.require.Server
//       , ReplSetServers = configuration.require.ReplSetServers;

//     var replicaset = configuration.getReplicasetManager();

//     var replSet = new ReplSetServers( [
//         new Server( replicaset.host, replicaset.ports[1]),
//         new Server( replicaset.host, replicaset.ports[0]),
//       ],
//       {rs_name:replicaset.name, poolSize:1}
//     );

//     var db = new Db(configuration.db_name, replSet, {w:0, native_parser: false});
//     db.open(function(err, db_p) {
//       db_p.admin().addUser("me", "secret", {w:3}, function runWhatever(err, result) {
//         replicaset.setAuths("me", "secret");

//         db_p.admin().authenticate("me", "secret", function(err, result) {
//           test.equal(null, err);

//           if (err){
//             console.log('ERR:'+err);
//             console.log('DB:'+db_p);
//           }

//           db_p.addUser('test', 'test', {w:3}, function(err, result) {
//             if (err){
//               console.log('ERR AUTH:'+err);
//               console.log('replies:'+result);
//             }

//             replicaset.setAuths("test", "test");

//             db_p.authenticate('test', 'test', function(err, replies) {
//               if (err){
//                 console.log('ERR AUTH:'+err);
//                 console.log('replies:'+replies);
//               }

//               db_p.collection('userconfirm', function( err, result ){
//                 if (err){
//                   console.log('Collection ERR:'+err);
//                 }

//                 var userconfirm = result;
//                 var ensureIndexOptions = { unique: true, safe: false, background: true };
//                 userconfirm.ensureIndex([ [ 'confirmcode', 1 ] ],ensureIndexOptions, function(err, item){

//                   if (err){
//                     console.log('Userconfirm ensure index failed:'+err);
//                   }

//                   db_p.collection('session', function( err, result ){
//                     if (err){
//                       console.log('Collection SESSION ERR:'+err);
//                     }

//                     var session = result;
//                     session.ensureIndex([ [ 'sid', 1 ] ],ensureIndexOptions, function(err, res){
//                       if(err){
//                         console.log('Session ensure index failed'+err);
//                       }

//                       db_p.close();
//                       test.done();
//                     });
//                   });
//                 });
//               });
//             });
//           });
//         });
//       });
//     });
//   }
// }

// /**
//  * @ignore
//  */
// exports.shouldCorrectlyAuthenticateAndUseReadPreference = {
//   metadata: { requires: { topology: ['auth'] } },
  
//   // The actual test we wish to run
//   test: function(configuration, test) {
//     var Db = configuration.require.Db
//       , Server = configuration.require.Server
//       , ReplSetServers = configuration.require.ReplSetServers;

//     var replicaset = configuration.getReplicasetManager();

//     var replSet = new ReplSetServers( [
//         new Server( replicaset.host, replicaset.ports[1]),
//         new Server( replicaset.host, replicaset.ports[0]),
//       ],
//       {rs_name:replicaset.name, poolSize:1}
//     );

//     var db = new Db(configuration.db_name, replSet, {w:0, native_parser: false});
//     db.open(function(err, db_p) {
//       test.equal(null, err);

//       db_p.admin().addUser("me", "secret", {w:3}, function runWhatever(err, result) {
//         replicaset.setAuths("me", "secret");

//         db_p.admin().authenticate("me", "secret", function(err, result) {
//           test.equal(null, err);

//           db_p.addUser('test', 'test', {w:3}, function(err, result) {
//             test.equal(null, err);
//             replicaset.setAuths("test", "test");

//             db_p.authenticate('test', 'test', function(err, replies) {
//               test.equal(null, err);

//               db_p.collection('userconfirm2').insert({a:1}, {w:1}, function(err, result) {
//                 test.equal(null, err);

//                 db_p.collection('userconfirm2').findOne(function(err, item) {            
//                   test.equal(null, err);
//                   test.equal(1, item.a);
//                   db_p.close();
//                   test.done();
//                 });
//               });
//             });
//           });
//         });
//       });
//     });
//   }
// }

// /**
//  * @ignore
//  */
// exports.shouldCorrectlyBringReplicasetStepDownPrimaryAndStillReadFromSecondary = {
//   metadata: { requires: { topology: ['auth'] } },
  
//   // The actual test we wish to run
//   test: function(configuration, test) {
//     var Db = configuration.require.Db
//       , Server = configuration.require.Server
//       , ReplSetServers = configuration.require.ReplSetServers
//       , ReadPreference = configuration.require.ReadPreference;

//     var replicaset = configuration.getReplicasetManager();

//     var replSet = new ReplSetServers( [
//         new Server( replicaset.host, replicaset.ports[1]),
//         new Server( replicaset.host, replicaset.ports[0]),
//       ],
//       {rs_name:replicaset.name, poolSize:1}
//     );

//     var db = new Db(configuration.db_name, replSet, {w:1, native_parser: false});
//     db.open(function(err, db_p) {
//       test.equal(null, err);

//       db_p.admin().addUser("me", "secret", {w:3}, function runWhatever(err, result) {
//         replicaset.setAuths("me", "secret");

//         db_p.admin().authenticate("me", "secret", function(err, result) {

//           db_p.collection('test').insert({a:1}, {w:1}, function(err, result) {
//             test.equal(null, err);

//             db_p.addUser('test', 'test', {w:3}, function(err, result) {
//               test.equal(null, err);
//               test.ok(result != null);

//               db_p.authenticate('test', 'test', function(err, result) {
//                 test.equal(null, err);
//                 test.equal(true, result);

//                 // Step down the primary
//                 configuration.stepDownPrimary(function(err, result) {

//                   // Wait for the secondary to recover
//                   setTimeout(function(e) {
//                     var counter = 1000;
//                     var errors = 0;

//                     for(var i = 0; i < counter; i++) {
//                       db_p.collection('test').find({a:1}).setReadPreference(ReadPreference.SECONDARY).toArray(function(err, r) {
//                         counter = counter - 1;

//                         if(err != null) {
//                           errors = errors + 1;
//                           console.dir(err)
//                         }

//                         if(counter == 0) {
//                           test.equal(0, errors)

//                           db_p.close();
//                           test.done();
//                         }
//                       });
//                     }
//                   }, 30000);
//                 });
//               });
//             });
//           });
//         });
//       });
//     });
//   }
// }

// /**
//  * @ignore
//  */
// exports.shouldCorrectlyAuthWithSecondaryAfterKillPrimary = {
//   metadata: { requires: { topology: ['auth'] } },
  
//   // The actual test we wish to run
//   test: function(configuration, test) {
//     var Db = configuration.require.Db
//       , Server = configuration.require.Server
//       , ReplSetServers = configuration.require.ReplSetServers
//       , ReadPreference = configuration.require.ReadPreference;

//     var replicaset = configuration.getReplicasetManager();

//     var replSet = new ReplSetServers( [
//         new Server( replicaset.host, replicaset.ports[1]),
//         new Server( replicaset.host, replicaset.ports[0]),
//       ],
//       {rs_name:replicaset.name, poolSize:1, read_secondary: true}
//     );

//     var db = new Db(configuration.db_name, replSet, { w: 1 });
//     db.open(function(err, db) {
//       db.admin().addUser("me", "secret", {w:3}, function runWhatever(err, result) {
//         replicaset.setAuths("me", "secret");
//         test.equal(null, err);
//         //create an admin account so that authentication is required on collections
//         db.admin().authenticate("me", "secret", function(err, result) {

//           //add a non-admin user
//           db.addUser('test', 'test', {w:3}, function(err, result) {
//             test.equal(null, err);

//             db.authenticate('test', 'test', function(err, result) {
//               //insert, just to give us something to find
//               db.collection('test').insert({a: 1}, {w: 1}, function(err, result) {
            
//                 db.collection('test').find({a: 1}).toArray(function(err, r) {
//                   test.equal(null, err);

//                   configuration.setAuths("me", "secret");

//                   configuration.killPrimary(function(err, result) {

//                     // Wait for the primary to come back up, as a secondary.
//                     setTimeout(function(e) {
//                       var counter = 20;
//                       var errors = 0;
//                       for(var i = 0; i < counter; i++) {
//                         db.collection('test').find({a: 1}).toArray(
//                         function(err, r) {
//                           counter = counter - 1;
//                           if(err != null) {
//                             errors = errors + 1;
//                             console.dir(err)
//                           }

//                           if(counter == 0) {
//                             test.equal(0, errors)
//                             db.close();
//                             test.done();
//                           }
//                         });
//                       }
//                     }, 30000);
//                   });
//                 });
//               });
//             });
//           });
//         });
//       });
//     });
//   }
// }

// /**
//  * @ignore
//  */
// exports.shouldCorrectlyAuthAgainstReplicaSetAdminDbUsingMongoClient = {
//   metadata: { requires: { topology: ['auth'] } },
  
//   // The actual test we wish to run
//   test: function(configuration, test) {
//     var Db = configuration.require.Db
//       , Server = configuration.require.Server
//       , MongoClient = configuration.require.MongoClient
//       , ReplSetServers = configuration.require.ReplSetServers
//       , ReadPreference = configuration.require.ReadPreference;

//     var replicaset = configuration.getReplicasetManager();

//     var replSet = new ReplSetServers( [
//         new Server( replicaset.host, replicaset.ports[1]),
//         new Server( replicaset.host, replicaset.ports[0]),
//       ],
//       {rs_name:replicaset.name, poolSize:1, read_secondary: true}
//     );

//     var dbName = 'admin';

//     new Db(dbName, replSet, {w:3}).open(function(err, db_p) {
//       db_p.admin().addUser("me", "secret", {w:3}, function runWhatever(err, result) {
//         replicaset.setAuths("me", "secret");
//         test.equal(null, err);
//         test.ok(result != null);
//         db_p.close();

//         MongoClient.connect(format("mongodb://me:secret@%s:%s/%s?rs_name=%s&readPreference=secondary&w=3"
//           , replicaset.host, replicaset.ports[0], dbName, replicaset.name), function(err, db) {
//             test.equal(null, err);

//             // Insert document
//             db.collection('authcollectiontest').insert({a:1}, {w:'majority'}, function(err, result) {
//               test.equal(null, err);

//               // Find the document
//               db.collection('authcollectiontest').find().toArray(function(err, docs) {
//                 test.equal(null, err);
//                 test.equal(1, docs.length);
//                 test.equal(1, docs[0].a);

//                 db.close();
//                 test.done();
//               });
//             });
//         });
//       });
//     });
//   }
// }

// /**
//  * @ignore
//  */
// exports.shouldCorrectlyAuthAgainstNormalDbUsingMongoClient = {
//   metadata: { requires: { topology: ['auth'] } },
  
//   // The actual test we wish to run
//   test: function(configuration, test) {
//     var Db = configuration.require.Db
//       , Server = configuration.require.Server
//       , MongoClient = configuration.require.MongoClient
//       , ReplSetServers = configuration.require.ReplSetServers
//       , ReadPreference = configuration.require.ReadPreference;

//     var replicaset = configuration.getReplicasetManager();

//     var replSet = new ReplSetServers( [
//         new Server( replicaset.host, replicaset.ports[1]),
//         new Server( replicaset.host, replicaset.ports[0]),
//       ],
//       {rs_name:replicaset.name, poolSize:1, read_secondary: true}
//     );

//     var dbName = configuration.db_name;

//     new Db(dbName, replSet, {w:3}).open(function(err, db_p) {
//       db_p.addUser("me", "secret", {w:3}, function runWhatever(err, result) {
//         replicaset.setAuths("me", "secret");

//         test.equal(null, err);
//         test.ok(result != null);
//         db_p.close();

//         MongoClient.connect(format("mongodb://me:secret@%s:%s/%s?rs_name=%s&readPreference=secondary&w=3"
//           , replicaset.host, replicaset.ports[0], dbName, replicaset.name), function(err, db) {
//             test.equal(null, err);

//             // Insert document
//             db.collection('authcollectiontest').insert({a:1}, {w:'majority'}, function(err, result) {
//               test.equal(null, err);

//               // Find the document
//               db.collection('authcollectiontest').find().toArray(function(err, docs) {
//                 test.equal(null, err);
//                 test.equal(1, docs.length);
//                 test.equal(1, docs[0].a);

//                 db.close();
//                 test.done();
//               });
//             });
//         });
//       });
//     });
//   }
// }

// /**
//  * @ignore
//  */
// exports['Should Correctly Authenticate using different user source database and MongoClient on a replicaset'] = {
//   // Add a tag that our runner can trigger on
//   // in this case we are setting that node needs to be higher than 0.10.X to run
//   metadata: { requires: { topology: ['auth'], mongodb: "=2.4.x" } },
  
//   // The actual test we wish to run
//   test: function(configuration, test) {
//     var Db = configuration.require.Db
//       , Server = configuration.require.Server
//       , MongoClient = configuration.require.MongoClient
//       , ReplSetServers = configuration.require.ReplSetServers
//       , ReadPreference = configuration.require.ReadPreference;

//     var replicaset = configuration.getReplicasetManager();

//     var replSet1 = new ReplSetServers( [
//         new Server( replicaset.host, replicaset.ports[1]),
//         new Server( replicaset.host, replicaset.ports[0]),
//       ],
//       {rs_name:replicaset.name, poolSize:1, readPreference: ReadPreference.SECONDARY}
//     );

//     var replSet2 = new ReplSetServers( [
//         new Server( replicaset.host, replicaset.ports[1]),
//         new Server( replicaset.host, replicaset.ports[0]),
//       ],
//       {rs_name:replicaset.name, poolSize:1, readPreference: ReadPreference.SECONDARY}
//     );

//     var dbName = 'foo';
//     var connectTimeoutMS = 100;

//     // Kill server and restart
//     var auth_db = new Db(dbName, replSet1, {w:1});
//     var db = new Db('users', replSet2, {w:1});
//     db.open(function(err, db) {

//       // Add admin user
//       db.admin().addUser('admin', 'admin', function(err, result) {
//         test.equal(null, err);
//         test.ok(result != null);

//         // Authenticate
//         db.admin().authenticate('admin', 'admin', function(err, result) {
//           test.equal(null, err);
//           test.equal(true, result);

//           db.addUser('mallory', 'a', function(err, result) {
//             test.equal(null, err);
//             test.ok(result != null);

//             db.db(dbName).collection('system.users').insert({user:"mallory", roles: ["readWrite"], userSource: "users"}, function(err, result) {
//               test.equal(null, err);

//               // Exit
//               db.close();

//               //
//               // Authenticate using MongoClient
//               MongoClient.connect(format("mongodb://mallory:a@%s:%s/%s?rs_name=%s&authSource=users&readPreference=secondary&w=3&connectTimeoutMS=%s"
//                 , replicaset.host, replicaset.ports[0], dbName, replicaset.name, connectTimeoutMS), function(err, db) {
//                   test.equal(null, err);

//                   // Should work correctly
//                   db.collection('t').insert({a:1}, function(err, result) {
//                     test.equal(null, err);
//                     db.close();

//                     //
//                     // Authenticate using db.authenticate against alternative source
//                     auth_db.open(function(err, db) {

//                       db.authenticate('mallory', 'a', {authSource:'users'}, function(err, result) {
//                         test.equal(null, err);
//                         test.equal(true, result);

//                         db.collection('t').insert({a:1}, function(err, result) {
//                           test.equal(null, err);
//                           test.ok(result != null);

//                           // Force close
//                           db.serverConfig._state.master.connectionPool.openConnections[0].connection.destroy();

//                           db.collection('t').insert({a:1}, function(err, result) {                          
//                             test.equal(null, err);
//                             test.ok(result != null);
//                             // console.dir("========================================== 0")
                            
//                             // console.dir(err)
//                             // console.dir(result)
//                             // test.ok(err != null);

//                             db.collection('t').insert({a:1}, function(err, result) {                          
//                               // console.dir("========================================== 1")
//                               // console.dir(err)
//                               // console.dir(result)
//                               test.equal(null, err);
//                               test.ok(result != null);

//                               db.logout(function(err, result) {
//                                 // console.dir("========================================== 2")
//                                 // console.dir(err)
//                                 // console.dir(result)
//                                 test.equal(null, err);
//                                 test.equal(true, result);
//                                 test.equal(0, db.serverConfig.auth.length());

//                                 db.close();
//                                 test.done(); 
//                               });
//                             });
//                           });
//                         });
//                       });
//                     });
//                   });
//               });
//             });
//           });
//         });
//       });
//     });
//   }
// }

// /**
//  * @ignore
//  */
// exports['Should correctly connect to the mongoses using the connection string and auth'] = {
//   metadata: { requires: { topology: ['auth'] } },
  
//   // The actual test we wish to run
//   test: function(configuration, test) {
//     var Db = configuration.require.Db
//       , Server = configuration.require.Server
//       , Mongos = configuration.require.Mongos;

//     // Set up mongos connection
//     var mongos = new Mongos([
//         new Server("localhost", 50000, { auto_reconnect: true })
//       , new Server("localhost", 50001, { auto_reconnect: true })
//     ]);

//     // Connect using the mongos connections
//     new Db('integration_test_', mongos, {w:1}).open(function(err, db) {
//       db.admin().addUser("root", "root", function(err, result) {
//         test.equal(null, err);
    
//         db.admin().authenticate("root", "root", function(err, result) {
//           test.equal(null, err);
//           test.ok(result);

//           // Kill the mongos server
//           configuration.killMongoS(50000, function(err, result) {
//             test.equal(null, err);

//             db.collection('t').findOne({}, function(err, doc) {
//               test.equal(null, err);

//               // Restart a mongos
//               configuration.restartMongoS(50000, function(err, result) {

//                 // Get all the connections
//                 var connections = db.serverConfig.allRawConnections();
//                 var totalLength = connections.length;
//                 var totalErrors = 0;

//                 setTimeout(function() {
//                   for(var i = 0; i < connections.length; i++) {
//                     var cursor = db.collection('t').find({});
//                     // Force the connection
//                     cursor.connection = connections[i];
//                     // Execute toArray
//                     cursor.toArray(function(err, docs) {
//                       totalLength = totalLength - 1;

//                       if(totalLength == 0) {
//                         test.equal(0, totalErrors);

//                         db.admin().removeUser("root", function(err, result) {
//                           test.equal(null, err);
//                           test.ok(result);

//                           db.close();                              
//                           test.done();
//                         })
//                       }
//                     });
//                   }
//                 }, 5000);
//               });
//             });
//           });
//         });
//       });
//     });
//   }
// }