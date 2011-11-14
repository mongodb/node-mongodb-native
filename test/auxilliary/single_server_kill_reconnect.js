var mongodb = process.env['TEST_NATIVE'] != null ? require('../../lib/mongodb').native() : require('../../lib/mongodb').pure();

var testCase = require('../../deps/nodeunit').testCase,
  debug = require('util').debug,
  inspect = require('util').inspect,
  nodeunit = require('../../deps/nodeunit'),
  gleak = require('../../tools/gleak'),
  Db = mongodb.Db,
  Cursor = mongodb.Cursor,
  Collection = mongodb.Collection,
  Server = mongodb.Server,
  ServerManager = require('../../test/tools/server_manager').ServerManager,
  Step = require("../../deps/step/lib/step");  

var MONGODB = 'integration_tests';
var client = new Db(MONGODB, new Server("127.0.0.1", 27017, {auto_reconnect: true, poolSize: 1}), {native_parser: (process.env['TEST_NATIVE'] != null)});
var serverManager = null;

// Define the tests, we want them to run as a nested test so we only clean up the 
// db connection once
var tests = testCase({
  setUp: function(callback) {
    callback();
  },
  
  tearDown: function(callback) {
    // serverManager.stop(9, function(err, result) {
      callback();
    // });
  },

  shouldCorrectlyKeepInsertingDocumentsWhenServerDiesAndComesUp : function(test) {
    var db1 = new Db('mongo-ruby-test-single-server', new Server("127.0.0.1", 27017, {auto_reconnect: true}), {native_parser: (process.env['TEST_NATIVE'] != null)});
    // All inserted docs
    var docs = [];
    var errs = [];
    var insertDocs = [];
    // Start server
    serverManager = new ServerManager({auth:false, purgedirectories:true, journal:true})
    serverManager.start(true, function() {
      db1.open(function(err, db) {        
        // Add an error handler
        db.on("error", function(err) {
          console.log("----------------------------------------------- received error")
          console.dir(err)
          errs.push(err);
        });
        
        // Startup the insert of documents
        var intervalId = setInterval(function() {
          db.collection('inserts', function(err, collection) {
            var doc = {timestamp:new Date().getTime()};
            insertDocs.push(doc);
            // Insert document
            collection.insert(doc, {safe:{fsync:true}}, function(err, result) {
              // Save errors
              if(err != null) errs.push(err);
              if(err == null) {
                docs.push(result[0]);                
              }
            })
          });        
        }, 500);        

        // Wait for a second and then kill the server
        setTimeout(function() {
          // Kill server instance
          serverManager.stop(9, function(err, result) {
            // Server down for 1 second
            setTimeout(function() {
              // Restart server
              serverManager = new ServerManager({auth:false, purgedirectories:false, journal:true});
              serverManager.start(true, function() {
                // Wait for it
                setTimeout(function() {
                  // Drop db
                  db.dropDatabase(function(err, result) {
                    // Close db
                    db.close();
                    // Check that we got at least one error
                    test.ok(errs.length > 0);
                    test.ok(docs.length > 0);
                    test.ok(insertDocs.length > 0);
                    // Finish up
                    test.done();                  
                  });
                }, 5000)
              })
            }, 1000);
          });
        }, 3000);
      })      
    });

    
    // Step(
    //   function bootTheServerWithNoAuth() {
    //     serverManager = new ServerManager({auth:false, purgedirectories:true})
    //     serverManager.start(true, this);
    //   },
    //   
    //   function openDbs() {
    //     db1.open(this.parallel());
    //     db2.open(this.parallel());
    //     admin.open(this.parallel());
    //   },
    //   
    //   function addAdminUserToDatabase(err, db1, db2, admin) {
    //     test.equal(null, err);        
    //     admin.addUser('admin', 'admin', this);
    //   },
    //   
    //   function restartServerInAuthMode(err, result) {
    //     test.equal(null, err);
    //     test.equal('7c67ef13bbd4cae106d959320af3f704', result.shift().pwd);
    // 
    //     db1.close();
    //     db2.close();
    //     admin.close();
    // 
    //     serverManager = new ServerManager({auth:true, purgedirectories:false})
    //     serverManager.start(true, this);
    //   },
    //   
    //   function openDbs() {
    //     db1.open(this.parallel());
    //     db2.open(this.parallel());
    //     admin.open(this.parallel());
    //   },
    //   
    //   function authenticateAdminUser(err) {
    //     test.equal(null, err);        
    // 
    //     admin.authenticate('admin', 'admin', this.parallel());
    //     db1.admin().authenticate('admin', 'admin', this.parallel());
    //     db2.admin().authenticate('admin', 'admin', this.parallel());
    //   },
    //   
    //   function addDbUsersForAuthentication(err, result1, result2, result3) {
    //     test.equal(null, err);
    //     test.ok(result1);
    //     test.ok(result2);
    //     test.ok(result3);
    //     
    //     db1.addUser('user1', 'secret', this.parallel());
    //     db2.addUser('user2', 'secret', this.parallel());
    //   },
    //   
    //   function closeAdminConnection(err, result1, result2) {
    //     test.ok(err == null);
    //     test.ok(result1 != null);
    //     test.ok(result2 != null);
    //     admin.logout(this.parallel());
    //     db1.admin().logout(this.parallel());
    //     db2.admin().logout(this.parallel());
    //   },
    //   
    //   function failAuthenticationWithDbs(err, result) {
    //     var self = this;
    // 
    //     db1.collection('stuff', function(err, collection) {
    //       collection.insert({a:2}, {safe:true}, self.parallel());
    //     });        
    // 
    //     db2.collection('stuff', function(err, collection) {
    //       collection.insert({a:2}, {safe:true}, self.parallel());
    //     });        
    //   },
    //   
    //   function authenticateAgainstDbs(err, result) {
    //     test.ok(err != null);
    //             
    //     db1.authenticate('user1', 'secret', this.parallel());
    //     db2.authenticate('user2', 'secret', this.parallel());        
    //   },
    //   
    //   function correctlyInsertRowToDbs(err, result1, result2) {
    //     var self = this;
    //     test.ok(err == null);
    //     test.ok(result1);
    //     test.ok(result2);
    //     
    //     db1.collection('stuff', function(err, collection) {
    //       collection.insert({a:2}, {safe:true}, self.parallel());
    //     });        
    //     
    //     db2.collection('stuff', function(err, collection) {
    //       collection.insert({a:2}, {safe:true}, self.parallel());
    //     });                
    //   },
    //   
    //   function validateCorrectInsertsAndBounceServer(err, result1, result2) {
    //     test.ok(err == null);
    //     test.ok(result1 != null);
    //     test.ok(result2 != null);
    //     
    //     serverManager = new ServerManager({auth:true, purgedirectories:false})
    //     serverManager.start(true, this);
    //   },
    //   
    //   function reconnectAndVerifyThatAuthIsAutomaticallyApplied() {
    //     var self = this;
    //     db1.collection('stuff', function(err, collection) {
    //       
    //       collection.find().toArray(function(err, items) {
    //         test.ok(err == null);
    //         test.equal(1, items.length);
    //         
    //         db1.collection('stuff', function(err, collection) {
    //           collection.insert({a:2}, {safe:true}, self.parallel());
    //         });        
    //         
    //         db2.collection('stuff', function(err, collection) {
    //           collection.insert({a:2}, {safe:true}, self.parallel());
    //         });                            
    //       })
    //     });        
    //   },
    //   
    //   function logoutDb1(err, result1, result2) {
    //     test.ok(err == null);
    //     test.ok(result1 != null);
    //     test.ok(result2 != null);
    //     
    //     db1.logout(this);
    //   },
    //   
    //   function insertShouldFail(err, result) {
    //     var self = this;
    //     db1.collection('stuff', function(err, collection) {
    //       collection.insert({a:2}, {safe:true}, self.parallel());
    //     });                      
    //   },
    //   
    //   function logoutDb2(err, result) {
    //     test.ok(err != null);      
    //     db2.logout(this);
    //   },
    //   
    //   function insertShouldFail(err, result) {        
    //     var self = this;
    //     db2.collection('stuff', function(err, collection) {
    //       collection.insert({a:2}, {safe:true}, function(err, result) {
    //         test.ok(err != null);
    //         test.done();
    //         // Close all connections
    //         db1.close();
    //         db2.close();
    //         admin.close();
    //       });
    //     });                      
    //   }
    // )
  },
  
  noGlobalsLeaked : function(test) {
    var leaks = gleak.detectNew();
    test.equal(0, leaks.length, "global var leak detected: " + leaks.join(', '));
    test.done();
  }  
})

// Assign out tests
module.exports = tests;