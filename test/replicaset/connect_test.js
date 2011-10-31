var testCase = require('../../deps/nodeunit').testCase,
  debug = require('util').debug
  inspect = require('util').inspect,
  ReplicaSetManager = require('../tools/replica_set_manager').ReplicaSetManager,
  Db = require('../../lib/mongodb').Db,
  ReplSetServers = require('../../lib/mongodb').ReplSetServers,
  Server = require('../../lib/mongodb').Server;

// Keep instance of ReplicaSetManager
var serversUp = false;
var retries = 120;

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
    debug("----------------------------------------- ensureConnection :: " + numberOfTries)
    db.close();

    if(err != null) {
      // Wait for a sec and retry
      setTimeout(function() {
        numberOfTries = numberOfTries - 1;
        ensureConnection(test, numberOfTries, callback);
      }, 3000);
    } else {
      return callback(null);
    }    
  })            
}

module.exports = testCase({
  setUp: function(callback) {
    // Create instance of replicaset manager but only for the first call
    if(!serversUp) {
      serversUp = true;
      RS = new ReplicaSetManager({retries:120, passive_count:0});
      RS.startSet(true, function(err, result) {      
        callback();      
      });      
    } else {
      RS.restartKilledNodes(function(err, result) {
        callback();        
      })
    }
  },
  
  tearDown: function(callback) {
    RS.restartKilledNodes(function(err, result) {
      callback();                
    })
  },

  shouldCorrectlyConnectWithDefaultReplicaset : function(test) {
    // Replica configuration
    var replSet = new ReplSetServers([ 
        new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
        new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
        new Server( RS.host, RS.ports[2], { auto_reconnect: true } )
      ], 
      {}
    );
  
    var db = new Db('integration_test_', replSet);
    db.open(function(err, p_db) {
      test.equal(null, err);
      test.done();
    })    
  },  
  
  shouldEmitCloseNoCallback : function(test) {
    debug("=========================================== shouldEmitCloseNoCallback")
    // Replica configuration
    var replSet = new ReplSetServers([ 
        new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
        new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
        new Server( RS.host, RS.ports[2], { auto_reconnect: true } )
      ], {}
    );
  
    new Db('integration_test_', replSet).open(function(err, db) {
      test.equal(null, err);
      var dbCloseCount = 0, serverCloseCount = 0;
      db.on('close', function() { ++dbCloseCount; });
      db.close();
  
      setTimeout(function() {
        debug("=========================================== shouldEmitCloseNoCallback : 1")
        test.equal(dbCloseCount, 1);
        test.done();
      }, 250);
    })
  },
  
  shouldEmitCloseWithCallback : function(test) {
    debug("=========================================== shouldEmitCloseWithCallback")
    // Replica configuration
    var replSet = new ReplSetServers([ 
        new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
        new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
        new Server( RS.host, RS.ports[2], { auto_reconnect: true } )
      ], {}
    );
  
    new Db('integration_test_', replSet).open(function(err, db) {
      debug("=========================================== shouldEmitCloseWithCallback :: 1")
      test.equal(null, err);
      var dbCloseCount = 0;//, serverCloseCount = 0;
      db.on('close', function() { ++dbCloseCount; });
  
      db.close(function() {
        debug("=========================================== shouldEmitCloseWithCallback :: 2")
        // Let all events fire.
        process.nextTick(function() {
          test.equal(dbCloseCount, 1);
          // test.equal(serverCloseCount, db.serverConfig.servers.length);
          test.done();
        });
      });
    })
  },
  
  shouldCorrectlyPassErrorWhenWrongReplicaSet : function(test) {
    debug("=========================================== shouldCorrectlyPassErrorWhenWrongReplicaSet")
    // Replica configuration
    var replSet = new ReplSetServers([ 
        new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
        new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
        new Server( RS.host, RS.ports[2], { auto_reconnect: true } )
      ], 
      {rs_name:RS.name + "-wrong"}
    );
  
    var db = new Db('integration_test_', replSet);
    db.open(function(err, p_db) {
      debug("=========================================== shouldCorrectlyPassErrorWhenWrongReplicaSet : 1")
      test.notEqual(null, err);
      test.done();
    })    
  },  
  
  shouldConnectWithPrimarySteppedDown : function(test) {
    debug("=========================================== shouldConnectWithPrimarySteppedDown")
    var replSet = new ReplSetServers( [ 
        new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
        new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
        new Server( RS.host, RS.ports[2], { auto_reconnect: true } )
      ], 
      {rs_name:RS.name}
    );
  
    // Step down primary server
    RS.stepDownPrimary(function(err, result) {
      debug("=========================================== shouldConnectWithPrimarySteppedDown : 1")
      // Wait for new primary to pop up
      ensureConnection(test, retries, function(err, p_db) {
        debug("=========================================== shouldConnectWithPrimarySteppedDown : 2")
        new Db('integration_test_', replSet).open(function(err, p_db) {    
          debug("=========================================== shouldConnectWithPrimarySteppedDown : 3")
          test.ok(err == null);
          test.equal(true, p_db.serverConfig.isConnected());
  
          p_db.close();
          test.done();          
        })                    
      });        
    });
  },
  
  shouldConnectWithThirdNodeKilled : function(test) {
    debug("=========================================== shouldConnectWithThirdNodeKilled")
    RS.getNodeFromPort(RS.ports[2], function(err, node) {
      debug("=========================================== shouldConnectWithThirdNodeKilled :: 1")
      if(err != null) debug("shouldConnectWithThirdNodeKilled :: " + inspect(err));
  
      RS.kill(node, function(err, result) {
        debug("=========================================== shouldConnectWithThirdNodeKilled :: 2")
        if(err != null) debug("shouldConnectWithThirdNodeKilled :: " + inspect(err));
        // Replica configuration
        var replSet = new ReplSetServers( [ 
            new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
            new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
            new Server( RS.host, RS.ports[2], { auto_reconnect: true } )
          ], 
          {rs_name:RS.name}
        );
    
        // Wait for new primary to pop up
        ensureConnection(test, retries, function(err, p_db) {
          new Db('integration_test_', replSet).open(function(err, p_db) {    
            debug("=========================================== shouldConnectWithThirdNodeKilled : 3")
            test.ok(err == null);
            test.equal(true, p_db.serverConfig.isConnected());
  
            p_db.close();
            test.done();          
          })                    
        });        
      });      
    });
  },
  
  shouldConnectWithSecondaryNodeKilled : function(test) {
    debug("=========================================== shouldConnectWithSecondaryNodeKilled")
    RS.killSecondary(function(node) {
      debug("=========================================== shouldConnectWithSecondaryNodeKilled : 1")
      // debug("------------------------------------------------------------------- killed secondary")
      
      // Replica configuration
      var replSet = new ReplSetServers( [ 
          new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
          new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
          new Server( RS.host, RS.ports[2], { auto_reconnect: true } )
        ], 
        {rs_name:RS.name}
      );
  
      var db = new Db('integration_test_', replSet);
      // Print any errors
      db.on("error", function(err) {
        console.log("============================= caught error")
        console.dir(err)
        if(err.stack != null) console.log(err.stack)
        test.done();
      })
  
      db.open(function(err, p_db) {
        debug("=========================================== shouldConnectWithSecondaryNodeKilled : 2")
        // // debug("-------------------------------------------------------- shouldConnectWithSecondaryNodeKilled :: 0")        
        // 
        // if(err != null) debug("shouldConnectWithSecondaryNodeKilled :: " + inspect(err));
        test.ok(err == null);
        test.equal(true, p_db.serverConfig.isConnected());
  
        // throw "error"
        // db.fuck();
  
        // Close and cleanup
        p_db.close();        
        test.done();          
      })                  
    });
  },
  
  shouldConnectWithPrimaryNodeKilled : function(test) {
    // debug("=========================================== shouldConnectWithPrimaryNodeKilled")
    RS.killPrimary(function(node) {
      // Replica configuration
      var replSet = new ReplSetServers( [ 
          new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
          new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
          new Server( RS.host, RS.ports[2], { auto_reconnect: true } )
        ], 
        {rs_name:RS.name}
      );
          
      var db = new Db('integration_test_', replSet);
      ensureConnection(test, retries, function(err, p_db) {
        // if(err != null) debug("shouldConnectWithPrimaryNodeKilled :: " + inspect(err));
        // test.ok(err == null);
        // test.equal(true, p_db.serverConfig.isConnected());
        console.log("================================================================================== finishing up")
        console.dir(err)
        if(err != null && err.stack != null) console.log(err.stack)
        console.dir(p_db)
      
        // p_db.close();
        test.done();          
      });
    });    
  },
  
  shouldCorrectlyBeAbleToUsePortAccessors : function(test) {
    // debug("=========================================== shouldCorrectlyBeAbleToUsePortAccessors")
    // Replica configuration
    var replSet = new ReplSetServers( [ 
        new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
        new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
        new Server( RS.host, RS.ports[2], { auto_reconnect: true } )
      ], 
      {rs_name:RS.name}
    );
  
    var db = new Db('integration_test_', replSet);
    db.open(function(err, p_db) {
      if(err != null) debug("shouldCorrectlyBeAbleToUsePortAccessors :: " + inspect(err));
      test.equal(replSet.host, p_db.serverConfig.primary.host);
      test.equal(replSet.port, p_db.serverConfig.primary.port);
      
      db.close();
      test.done();
    })            
  },
    
  shouldCorrectlyConnect: function(test) {
    // debug("=========================================== shouldCorrectlyConnect")
    // Replica configuration
    var replSet = new ReplSetServers( [ 
        new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
        new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
        new Server( RS.host, RS.ports[2], { auto_reconnect: true } )
      ], 
      {rs_name:RS.name}
    );
  
    var db = new Db('integration_test_', replSet );
    db.open(function(err, p_db) {
      if(err != null) debug("shouldCorrectlyConnect :: " + inspect(err));
      test.equal(true, p_db.serverConfig.isConnected());
      
      // Test primary
      RS.primary(function(err, primary) {
        if(err != null) debug("shouldCorrectlyConnect :: " + inspect(err));
        
        test.notEqual(null, primary);                
        test.equal(primary, p_db.serverConfig.primary.host + ":" + p_db.serverConfig.primary.port);        
        
        // Perform tests
        RS.secondaries(function(err, items) {
          if(err != null) debug("shouldCorrectlyConnect :: " + inspect(err));
        
          // Test if we have the right secondaries
          test.deepEqual(items.sort(), p_db.serverConfig.allSecondaries.map(function(item) {
                                          return item.host + ":" + item.port;
                                        }).sort());
  
          // Test if we have the right arbiters
          RS.arbiters(function(err, items) {
            if(err != null) debug("shouldCorrectlyConnect :: " + inspect(err));
              
            test.deepEqual(items.sort(), p_db.serverConfig.arbiters.map(function(item) {
                                            return item.host + ":" + item.port;
                                          }).sort());
            // Force new instance 
            var db2 = new Db('integration_test_', replSet );
            db2.open(function(err, p_db2) {
              if(err != null) debug("shouldCorrectlyConnect :: " + inspect(err));
              
              test.equal(true, p_db2.serverConfig.isConnected());
              // Close top instance
              db.close();
              db2.close();
              test.done();
            });            
          });
        });
      })            
    });        
  },  
})
