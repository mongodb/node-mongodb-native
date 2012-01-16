var noReplicasetStart = process.env['NO_REPLICASET_START'] != null ? true : false;

var testCase = require('../../deps/nodeunit').testCase,
  debug = require('util').debug,
  inspect = require('util').inspect,
  gleak = require('../../tools/gleak'),
  ReplicaSetManager = require('../tools/replica_set_manager').ReplicaSetManager,
  Db = require('../../lib/mongodb').Db,
  ReplSetServers = require('../../lib/mongodb').ReplSetServers,
  Server = require('../../lib/mongodb').Server,
  Step = require("../../deps/step/lib/step");  

// Keep instance of ReplicaSetManager
var serversUp = false;
var retries = 120;
var RS = RS == null ? null : RS;

var ensureConnection = function(test, numberOfTries, callback) {
  // Replica configuration
  var replSet = new ReplSetServers( [ 
      new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[2], { auto_reconnect: true } )
    ], 
    {rs_name:RS.name}
  );
  
  if(numberOfTries <= 0) return callback(new Error("could not connect correctly"), null);

  var db = new Db('integration_test_', replSet);
  // Print any errors
  db.on("error", function(err) {
    console.log("============================= ensureConnection caught error")
    console.dir(err)
    if(err != null && err.stack != null) console.log(err.stack)
    db.close();
  })

  // Open the db
  db.open(function(err, p_db) {
    db.close();
    if(err != null) {
      // Wait for a sec and retry
      setTimeout(function() {
        numberOfTries = numberOfTries - 1;
        ensureConnection(test, numberOfTries, callback);
      }, 1000);
    } else {
      return callback(null, p_db);
    }    
  })            
}

var identifyServers = function(rs, dbname, callback) {
  // Total number of servers to query
  var numberOfServersToCheck = Object.keys(rs.mongods).length;
  
  // Arbiters
  var arbiters = [];
  var secondaries = [];
  var primary = null;
  
  // Let's establish what all servers so we can pick targets for our queries
  var keys = Object.keys(rs.mongods);
  for(var i = 0; i < keys.length; i++) {
    var host = rs.mongods[keys[i]].host;
    var port = rs.mongods[keys[i]].port;
    
    // Connect to the db and query the state
    var server = new Server(host, port,{auto_reconnect: true});
    // Create db instance
    var db = new Db(dbname, server, {native_parser: (process.env['TEST_NATIVE'] != null)});
    // Connect to the db
    db.open(function(err, db) {
      numberOfServersToCheck = numberOfServersToCheck - 1;
      if(db.serverConfig.isMasterDoc.ismaster) {
        primary = {host:db.serverConfig.host, port:db.serverConfig.port};
      } else if(db.serverConfig.isMasterDoc.secondary) {
        secondaries.push({host:db.serverConfig.host, port:db.serverConfig.port});
      } else if(db.serverConfig.isMasterDoc.arbiterOnly) {
        arbiters.push({host:db.serverConfig.host, port:db.serverConfig.port});          
      }
            
      // Close the db
      db.close();
      // If we are done perform the callback
      if(numberOfServersToCheck <= 0) {
        callback(null, {primary:primary, secondaries:secondaries, arbiters:arbiters});
      }
    })
  }  
}

module.exports = testCase({
  setUp: function(callback) {
    // Create instance of replicaset manager but only for the first call
    if(!serversUp && !noReplicasetStart) {
      serversUp = true;
      RS = new ReplicaSetManager({retries:120, secondary_count:2, passive_count:1, arbiter_count:1});
      RS.startSet(true, function(err, result) {      
        if(err != null) throw err;
        // Finish setup
        callback();      
      });      
    } else {
      RS.restartKilledNodes(function(err, result) {
        if(err != null) throw err;
        callback();        
      })
    }
  },
  
  tearDown: function(callback) {
    callback();        
  },

  'Basic replicaset changes removing a secondary server from the set, should be reflected in the driver' : function(test) {
    // test.done();
    // return;
    
    // Fetch all the identity servers
    identifyServers(RS, 'integration_test_', function(err, servers) {
      // Replica configuration
      var replSet = new ReplSetServers( [ 
          new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
          new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
          new Server( RS.host, RS.ports[2], { auto_reconnect: true } )
        ], 
        {rs_name:RS.name, readPreference:Server.READ_SECONDARY}
      );
    
      // Are we done processing
      var timeoutInterval = 1000;
      var numberOfStepsDone = 0;
      var newConfig = null;
            
      // Replicaset server setup
      var replDb = new Db('integration_test_', replSet, {native_parser: (process.env['TEST_NATIVE'] != null)});
      replDb.open(function(err, replDb) {
        // Var checking function
        var checking = function() {
          // First step let's do a reconfig of the replicaset
          if(numberOfStepsDone == 0) {
            // Update to the next step
            numberOfStepsDone = numberOfStepsDone + 1;
            // Connect directly to the primary server to change the config setup
            var _server = new Server(servers.primary.host, servers.primary.port, {auto_reconnect: true});
            // Create db instance
            var _db = new Db('integration_test_', _server, {native_parser: (process.env['TEST_NATIVE'] != null)});
            _db.open(function(err, _db) {
              // The number of members to remove
              var numberOfMembersToRemove = 1;
              
              // Let's change the configuration set and update the replicaset
              newConfig = JSON.parse(JSON.stringify(RS.config));
              var members = newConfig.members;
              // Remove one of the secondaries
              for(var i = 0; i < members.length; i++) {
                if(members[i].arbiterOnly == null && (servers.primary.host + ":" + servers.primary.port) != members[i].host) {
                  numberOfMembersToRemove = numberOfMembersToRemove - 1;
                  members.splice(i, 1);
                  
                  // Stop removing members
                  if(numberOfMembersToRemove == 0) {
                    break;                    
                  }
                }
              }
  
              // Reassign the array
              newConfig.members = members;
              // Adjust version
              newConfig.version = newConfig.version + 1;
  
              // Issue replicaset reconfig command to server
              _db.admin().command({replSetReconfig:newConfig}, function(err, result) {
                // test.equal(null, err);
                // Close the db connection
                _db.close();
                
                // Let's do some queries
                setTimeout(checking, timeoutInterval);
              });
            });
          } else if(numberOfStepsDone < 10) {
            replDb.collection('somecollection').find().toArray(function(err, items) {
              numberOfStepsDone = numberOfStepsDone + 1;
              setTimeout(checking, timeoutInterval);
            });
          } else if(numberOfStepsDone == 10) {
            // Check that we have the right setup
            test.ok(replDb.serverConfig._state.master != null);
            test.equal(1, Object.keys(replDb.serverConfig._state.arbiters).length);
            test.equal(2, Object.keys(replDb.serverConfig._state.secondaries).length 
              + Object.keys(replDb.serverConfig._state.passives).length)
              
            // Restore the original setup
            numberOfStepsDone = numberOfStepsDone + 1;
            // Connect directly to the primary server to change the config setup
            var _server = new Server(servers.primary.host, servers.primary.port, {auto_reconnect: true});
            // Create db instance
            var _db = new Db('integration_test_', _server, {native_parser: (process.env['TEST_NATIVE'] != null)});
            _db.open(function(err, _db) {
              var version = newConfig.version;
              // Let's change the configuration set and update the replicaset
              newConfig = JSON.parse(JSON.stringify(RS.config));
              // Adjust version
              newConfig.version = version + 1;
  
              // Issue replicaset reconfig command to server
              _db.admin().command({replSetReconfig:newConfig}, function(err, result) {
                test.equal(null, err);
                // Close the db connection
                _db.close();
                // Let's do some queries
                setTimeout(checking, timeoutInterval);
              });
            });     
          } else if(numberOfStepsDone < 20) {
            replDb.collection('somecollection').find().toArray(function(err, items) {
              numberOfStepsDone = numberOfStepsDone + 1;
              setTimeout(checking, timeoutInterval);
            });                   
          } else {
            // Check that we have the right setup
            test.ok(replDb.serverConfig._state.master != null);
            test.equal(1, Object.keys(replDb.serverConfig._state.arbiters).length);
            test.equal(3, Object.keys(replDb.serverConfig._state.secondaries).length 
              + Object.keys(replDb.serverConfig._state.passives).length)
            
            replDb.close();
            test.done();
          }
        }
  
        // Let's boot up a checking loop
        var intervalId = setTimeout(checking, timeoutInterval);        
      })    
    });
  },

  // 'Inflight queries should be finished even after the reconnect is performed' : function(test) {
  //   // Fetch all the identity servers
  //   identifyServers(RS, 'integration_test_', function(err, servers) {
  //     console.log("------------------------------------------------------------ 0")
  //     // Replica configuration
  //     var replSet = new ReplSetServers( [ 
  //         new Server( RS.host, RS.ports[1], { auto_reconnect: true, poolSize: 4 } ),
  //         new Server( RS.host, RS.ports[0], { auto_reconnect: true, poolSize: 4 } ),
  //         new Server( RS.host, RS.ports[2], { auto_reconnect: true, poolSize: 4 } )
  //       ], 
  //       {rs_name:RS.name, readPreference:Server.READ_SECONDARY, replicaSetCheckInterval:100, poolSize:4}
  //     );
  //               
  //     // Replicaset server setup
  //     var replDb = new Db('integration_test_', replSet, {native_parser: (process.env['TEST_NATIVE'] != null)});
  //     replDb.open(function(err, replDb) {
  //       console.log("------------------------------------------------------------ 1")
  //       // Are we done processing
  //       var timeoutInterval = 1000;
  //       var numberOfStepsDone = 0;
  //       var newConfig = null;
  //       var step = 0;
  // 
  //       // Var checking function
  //       var checking = function() {
  //         console.log("------------------------------------------------------------ 2")
  //         console.log("numberOfStepsDone = " + numberOfStepsDone)
  // 
  //         // First step let's do a reconfig of the replicaset
  //         if(numberOfStepsDone == 0) {
  //           console.log("------------------------------------------------------------ 3")
  //           numberOfStepsDone = numberOfStepsDone + 1;
  //           var collection = replDb.collection('inflight_collection');
  //           // Fire a bunch of messages, attempting to have stuff in flight
  //           for(var i = 0; i < 10000; i++) {
  //             collection.insert({a:1, b:'hello world', c:i});
  //           }
  //           
  //           process.nextTick(checking);
  //         } else if(numberOfStepsDone == 1) {
  //           console.log("------------------------------------------------------------ 4")
  //           // Update to the next step
  //           numberOfStepsDone = numberOfStepsDone + 1;
  //           // Connect directly to the primary server to change the config setup
  //           var _server = new Server(servers.primary.host, servers.primary.port, {auto_reconnect: true});
  //           // Create db instance
  //           var _db = new Db('integration_test_', _server, {native_parser: (process.env['TEST_NATIVE'] != null)});
  //           _db.open(function(err, _db) {
  //             // The number of members to remove
  //             var numberOfMembersToRemove = 1;
  //             
  //             // Let's change the configuration set and update the replicaset
  //             newConfig = JSON.parse(JSON.stringify(RS.config));
  //             var members = newConfig.members;
  //             // Remove one of the secondaries
  //             for(var i = 0; i < members.length; i++) {
  //               if(members[i].arbiterOnly == null && (servers.primary.host + ":" + servers.primary.port) != members[i].host) {
  //                 numberOfMembersToRemove = numberOfMembersToRemove - 1;
  //                 members.splice(i, 1);
  //                 
  //                 // Stop removing members
  //                 if(numberOfMembersToRemove == 0) {
  //                   break;                    
  //                 }
  //               }
  //             }
  // 
  //             // // Reassign the array
  //             // newConfig.members = members;
  //             // // Adjust version
  //             // newConfig.version = newConfig.version + 1;
  //             // 
  //             // // Issue replicaset reconfig command to server
  //             // _db.admin().command({replSetReconfig:newConfig}, function(err, result) {
  //             //   console.log("============================================================")
  //             //   console.dir(err)
  //             //   console.dir(result)
  //             //   
  //             //   test.equal(null, err);
  //             //   // Close the db connection
  //             //   _db.close();
  //             //   // Let's do some queries
  //             //   setTimeout(checking, timeoutInterval);
  //             // });
  //           });
  //         } else if(numberOfStepsDone < 10) {
  //           numberOfStepsDone = numberOfStepsDone + 1;
  //           setTimeout(checking, timeoutInterval);
  //         } else {
  //           replDb.close();
  //           test.done();            
  //         }
  //       }
  // 
  //       console.log("------------------------------------------------------------ 5");
  //       // Let's fire off the method
  //       process.nextTick(checking);
  //     })    
  //   });
  // },
  
  noGlobalsLeaked : function(test) {
    var leaks = gleak.detectNew();
    test.equal(0, leaks.length, "global var leak detected: " + leaks.join(', '));
    test.done();
  }  
})
















