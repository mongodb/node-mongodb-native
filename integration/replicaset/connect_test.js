var testCase = require('nodeunit').testCase,
  debug = require('sys').debug
  inspect = require('sys').inspect,
  ReplicaSetManager = require('../tools/replica_set_manager').ReplicaSetManager,
  Db = require('../../lib/mongodb').Db,
  ReplSetServers = require('../../lib/mongodb').ReplSetServers,
  Server = require('../../lib/mongodb').Server;

// Keep instance of ReplicaSetManager
var serversUp = false;
var RS = null;

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

  var db = new Db('connect_test', replSet);
  db.open(function(err, p_db) {
    // debug("============================================================ :: " + numberOfTries);
    // debug("err :: " + inspect(err));
    
    if(err != null) {
      db.close();
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

module.exports = testCase({
  setUp: function(callback) {
    // Create instance of replicaset manager but only for the first call
    if(!serversUp) {
      serversUp = true;
      RS = new ReplicaSetManager();
      RS.startSet(function(err, result) {      
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
    RS.restartKilledNodes(function(err, result) {
      if(err != null) throw err;
      callback();        
    })
  },
  
  shouldConnectWithPrimaryNodeKilled : function(test) {
    RS.killPrimary(function(node) {
      // Replica configuration
      var replSet = new ReplSetServers( [ 
          new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
          new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
          new Server( RS.host, RS.ports[2], { auto_reconnect: true } )
        ], 
        {rs_name:RS.name}
      );
    
      var db = new Db('connect_test', replSet);
      db.open(function(err, p_db) {
        test.ok(err != null);
        test.equal("No master available", err.message);
        db.close();
        
        ensureConnection(test, 60, function(err, p_db) {
          test.ok(err == null);
          test.done();          
        });        
      })            
    });    
  },
  
  shouldCorrectlyBeAbleToUsePortAccessors : function(test) {
    // Replica configuration
    var replSet = new ReplSetServers( [ 
        new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
        new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
        new Server( RS.host, RS.ports[2], { auto_reconnect: true } )
      ], 
      {rs_name:RS.name}
    );
  
    var db = new Db('connect_test', replSet);
    db.open(function(err, p_db) {
      test.equal(replSet.host, p_db.serverConfig.primary.host);
      test.equal(replSet.port, p_db.serverConfig.primary.port);
      
      db.close();
      test.done();
    })            
  },
  
  shouldCorrectlyHandleBadName : function(test) {
    // Replica configuration
    var replSet = new ReplSetServers([ 
        new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
        new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
        new Server( RS.host, RS.ports[2], { auto_reconnect: true } )
      ], 
      {rs_name:RS.name + "-wrong"}
    );
  
    var db = new Db('connect_test', replSet );
    db.open(function(err, p_db) {
      test.notEqual(null, err);
      db.close();
      test.done();
    })    
  },
  
  shouldCorrectlyConnect: function(test) {
    // Replica configuration
    var replSet = new ReplSetServers( [ 
        new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
        new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
        new Server( RS.host, RS.ports[2], { auto_reconnect: true } )
      ], 
      {rs_name:RS.name}
    );
  
    var db = new Db('connect_test', replSet );
    db.open(function(err, p_db) {
      test.equal(true, p_db.serverConfig.isConnected());
      
      // Test primary
      RS.primary(function(err, primary) {
        test.notEqual(null, primary);                
        test.equal(primary, p_db.serverConfig.primary.host + ":" + p_db.serverConfig.primary.port);
  
        // Perform tests
        RS.secondaries(function(err, items) {
          // Test if we have the right secondaries
          test.deepEqual(items.sort(), p_db.serverConfig.secondaries.map(function(item) {
                                          return item.host + ":" + item.port;
                                        }).sort());
  
          // Test if we have the right arbiters
          RS.arbiters(function(err, items) {
            test.deepEqual(items.sort(), p_db.serverConfig.arbiters.map(function(item) {
                                            return item.host + ":" + item.port;
                                          }).sort());
  
            // Force new instance 
            var db2 = new Db('connect_test', replSet );
            db2.open(function(err, p_db2) {
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
  }  
})