var noReplicasetStart = process.env['NO_REPLICASET_START'] != null ? true : false;

var testCase = require('nodeunit').testCase,
  debug = require('util').debug
  inspect = require('util').inspect,
  ReplicaSetManager = require('../tools/replica_set_manager').ReplicaSetManager,
  Db = require('../../lib/mongodb').Db,
  ReplSetServers = require('../../lib/mongodb').ReplSetServers,
  Server = require('../../lib/mongodb').Server,
  Step = require("step");  

// Keep instance of ReplicaSetManager
var serversUp = false;
// var RS = null;

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
  db.open(function(err, p_db) {
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
    if(!serversUp && !noReplicasetStart) {
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

  shouldWorkCorrectlyWithInserts : function(test) {
    // debug("=========================================== shouldWorkCorrectlyWithInserts")
    // Replica configuration
    var replSet = new ReplSetServers( [ 
        new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
        new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
        new Server( RS.host, RS.ports[2], { auto_reconnect: true } )
      ], 
      {rs_name:RS.name}
    );

    // Insert some data
    var db = new Db('integration_test_', replSet);
    db.open(function(err, p_db) {
      // Drop collection on replicaset
      p_db.dropCollection('testsets', function(err, r) {
        // Recreate collection on replicaset
        p_db.createCollection('testsets', function(err, collection) {
          
          // Insert a dummy document
          collection.insert({a:20}, {safe: {w:2, wtimeout: 10000}}, function(err, r) {
            
            // Execute a count
            collection.count(function(err, c) {
              test.equal(1, c);
              // Close starting connection
              p_db.close();
              
              // Kill the primary
              RS.killPrimary(function(node) {
                
                // Ensure valid connection
                // Do inserts
                ensureConnection(test, 60, function(err, p_db) {
                  test.ok(err == null);
                  test.equal(true, p_db.serverConfig.isConnected());

                  p_db.collection('testsets', function(err, collection) {
                    // Execute a set of inserts
                    Step(
                      function inserts() {
                        var group = this.group();
                        collection.save({a:30}, {safe:true}, group());
                        collection.save({a:40}, {safe:true}, group());
                        collection.save({a:50}, {safe:true}, group());
                        collection.save({a:60}, {safe:true}, group());
                        collection.save({a:70}, {safe:true}, group());
                      },
                      
                      function finishUp(err, values) {                        
                        // Restart the old master and wait for the sync to happen
                        RS.restartKilledNodes(function(err, result) {
                          if(err != null) throw err;
                          // Contains the results
                          var results = [];
                          
                          // Just wait for the results
                          setTimeout(function() {
                    
                            // Ensure the connection
                            ensureConnection(test, 60, function(err, p_db) {
                              
                              // Get the collection
                              p_db.collection('testsets', function(err, collection) {
                                collection.find().each(function(err, item) {
                                  if(item == null) {
                                    // Ensure we have the correct values
                                    test.equal(6, results.length);
                                    [20, 30, 40, 50, 60, 70].forEach(function(a) {
                                      test.equal(1, results.filter(function(element) {
                                        return element.a == a;
                                      }).length);
                                    });                                    
                                    
                                    // Run second check
                                    collection.save({a:80}, {safe:true}, function(err, r) {
                                      collection.find().toArray(function(err, items) {
                                        // Ensure we have the correct values
                                        test.equal(7, items.length);

                                        [20, 30, 40, 50, 60, 70, 80].forEach(function(a) {
                                          test.equal(1, items.filter(function(element) {
                                            return element.a == a;
                                          }).length);
                                        });                                                                              

                                        p_db.close();
                                        test.done();                                                    
                                      });
                                    });                                    
                                  } else {
                                    results.push(item);
                                  }
                                });
                              });
                            });                            
                          }, 1000);                          
                        })
                      }                      
                    );
                  });
                });        
              });              
            })
          })
        });
      });
    })                
  }
})

















