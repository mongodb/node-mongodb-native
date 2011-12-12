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

// process.on("uncaughtException", function(err) {
//   console.log("================================================================ uncaughtException")
//   console.dir(err)
// })

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
    // Close connections
    db.close();    
    // Process result
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

module.exports = testCase({
  setUp: function(callback) {
    // Create instance of replicaset manager but only for the first call
    if(!serversUp && !noReplicasetStart) {
      serversUp = true;
      RS = new ReplicaSetManager({retries:120, secondary_count:2, passive_count:1, arbiter_count:1});
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
    });
  },

  shouldCorrectlyWaitForReplicationToServersOnInserts : function(test) {
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
    var db = new Db('integration_test_', replSet, {numberOfRetries:20, retryMiliSeconds:5000});
    db.open(function(err, p_db) {
      // Check if we got an error
      if(err != null) debug("shouldCorrectlyWaitForReplicationToServersOnInserts :: " + inspect(err));
  
      // Drop collection on replicaset
      p_db.dropCollection('shouldCorrectlyWaitForReplicationToServersOnInserts', function(err, r) {
        if(err != null) debug("shouldCorrectlyWaitForReplicationToServersOnInserts :: " + inspect(err));
        // Recreate collection on replicaset
        p_db.createCollection('shouldCorrectlyWaitForReplicationToServersOnInserts', function(err, collection) {
          if(err != null) debug("shouldCorrectlyWaitForReplicationToServersOnInserts :: " + inspect(err));  
          // Insert a dummy document
          collection.insert({a:20}, {safe: {w:2, wtimeout: 10000}}, function(err, r) {            
            test.equal(null, err);            
            test.done();
            p_db.close();
          });
        });
      });
    });
  },
  
  shouldCorrectlyThrowTimeoutForReplicationToServersOnInserts : function(test) {
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
    var db = new Db('integration_test_', replSet, {numberOfRetries:20, retryMiliSeconds:5000});
    db.open(function(err, p_db) {
      // Check if we got an error
      if(err != null) debug("shouldCorrectlyWaitForReplicationToServersOnInserts :: " + inspect(err));
  
      // Drop collection on replicaset
      p_db.dropCollection('shouldCorrectlyThrowTimeoutForReplicationToServersOnInserts', function(err, r) {
        if(err != null) debug("shouldCorrectlyWaitForReplicationToServersOnInserts :: " + inspect(err));
        // Recreate collection on replicaset
        p_db.createCollection('shouldCorrectlyThrowTimeoutForReplicationToServersOnInserts', function(err, collection) {
          if(err != null) debug("shouldCorrectlyWaitForReplicationToServersOnInserts :: " + inspect(err));  
          // Insert a dummy document
          collection.insert({a:20}, {safe: {w:7, wtimeout: 10000}}, function(err, r) {            
            test.equal('timeout', err.err);
            test.equal(true, err.wtimeout);
            test.done();
            p_db.close();
          });
        });
      });
    });
  },
  
  shouldCorrectlyExecuteSafeFindAndModify : function(test) {
    // Replica configuration
    var replSet = new ReplSetServers( [ 
        new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
        new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
        new Server( RS.host, RS.ports[2], { auto_reconnect: true } )
      ], 
      {rs_name:RS.name}
    );
  
    // Insert some data
    var db = new Db('integration_test_', replSet, {numberOfRetries:20, retryMiliSeconds:5000});
    db.open(function(err, p_db) {
      // Check if we got an error
      if(err != null) debug("shouldWorkCorrectlyWithInserts :: " + inspect(err));
  
      // Drop collection on replicaset
      p_db.dropCollection('shouldCorrectlyExecuteSafeFindAndModify', function(err, r) {
        if(err != null) debug("shouldWorkCorrectlyWithInserts :: " + inspect(err));
        // Recreate collection on replicaset
        p_db.createCollection('shouldCorrectlyExecuteSafeFindAndModify', function(err, collection) {
          if(err != null) debug("shouldWorkCorrectlyWithInserts :: " + inspect(err));  
          // Insert a dummy document
          collection.insert({a:20}, {safe: {w:2, wtimeout: 10000}}, function(err, r) {            
            // Execute a safe insert with replication to two servers
            collection.findAndModify({'a':20}, [['a', 1]], {'$set':{'b':3}}, {new:true, safe: {w:2, wtimeout: 10000}}, function(err, result) {
              test.equal(20, result.a);
              test.equal(3, result.b);
              test.done();
              p_db.close();
            })
          });
        });
      });
    });
  },  
  
  shouldCorrectlyInsertAfterPrimaryComesBackUp : function(test) {
    // Replica configuration
    var replSet = new ReplSetServers( [ 
        new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
        new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
        new Server( RS.host, RS.ports[2], { auto_reconnect: true } )
      ], 
      // {rs_name:RS.name, socketOptions:{timeout:30000}}
      {rs_name:RS.name}
    );
  
  
    // Insert some data
    var db = new Db('integration_test_', replSet, {numberOfRetries:20, retryMiliSeconds:5000});
  
    // Print any errors
    db.on("error", function(err) {
      console.log("============================= ensureConnection caught error")
      console.dir(err)
      if(err != null && err.stack != null) console.log(err.stack)
      db.close();
    })
    
    var first = false;
    
    // Open db
    db.open(function(err, p_db) {
      if(first) return
      first = true
      // Check if we got an error
      if(err != null) debug("shouldWorkCorrectlyWithInserts :: " + inspect(err));
  
      // Drop collection on replicaset
      p_db.dropCollection('shouldCorrectlyInsertAfterPrimaryComesBackUp', function(err, r) {
        if(err != null) debug("shouldWorkCorrectlyWithInserts :: " + inspect(err));
        // Recreate collection on replicaset
        p_db.createCollection('shouldCorrectlyInsertAfterPrimaryComesBackUp', function(err, collection) {
          if(err != null) debug("shouldWorkCorrectlyWithInserts :: " + inspect(err));  
          // Insert a dummy document
          collection.insert({a:20}, {safe: {w:'majority', wtimeout: 10000}}, function(err, r) {            
            // Kill the primary
            RS.killPrimary(2, {killNodeWaitTime:1}, function(node) {
              // Attempt insert (should fail)
              collection.insert({a:30}, {safe: {w:2, wtimeout: 10000}}, function(err, r) {
                test.ok(err != null)
  
                if(err != null) {
                  collection.insert({a:40}, {safe: {w:2, wtimeout: 10000}}, function(err, r) {  
                    
                    // Peform a count
                    collection.count(function(err, count) {
                      test.equal(2, count);
                      p_db.close();
                      test.done();
                    });
                  });                                          
                } else {
                  p_db.close();
                  test.ok(false)
                  test.done();                          
                }
              });
            });
          });
        });
      });
    });
  },
  
  shouldCorrectlyQueryAfterPrimaryComesBackUp : function(test) {
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
    var db = new Db('integration_test_', replSet, {numberOfRetries:20, retryMiliSeconds:5000});
    // Print any errors
    db.on("error", function(err) {
      console.log("============================= ensureConnection caught error")
      console.dir(err)
      if(err != null && err.stack != null) console.log(err.stack)
      db.close();
    })
    // Open db
    db.open(function(err, p_db) {
      // Check if we got an error
      if(err != null) debug("shouldWorkCorrectlyWithInserts :: " + inspect(err));
  
      // Drop collection on replicaset
      p_db.dropCollection('shouldCorrectlyQueryAfterPrimaryComesBackUp', function(err, r) {
        if(err != null) debug("shouldWorkCorrectlyWithInserts :: " + inspect(err));
        // Recreate collection on replicaset
        p_db.createCollection('shouldCorrectlyQueryAfterPrimaryComesBackUp', function(err, collection) {
          if(err != null) debug("shouldWorkCorrectlyWithInserts :: " + inspect(err));  
          // Insert a dummy document
          collection.insert({a:20}, {safe: {w:'majority', wtimeout: 10000}}, function(err, r) {            
            // Kill the primary
            RS.killPrimary(2, {killNodeWaitTime:1}, function(node) {
              // Ok let's execute same query a couple of times
              collection.find({}).toArray(function(err, items) {
                // console.log("============================================ CALLED :: 0")
                test.ok(err != null);
                // console.dir(err)
                
                collection.find({}).toArray(function(err, items) {
                  // console.log("============================================ CALLED :: 1")
                  // console.dir(err)
                  // console.dir(items)
                  
                  test.ok(err == null);
                  test.equal(1, items.length);
  
                  collection.find({}).toArray(function(err, items) {
                    test.ok(err == null);
                    test.equal(1, items.length);
                    p_db.close();
                    test.done();
                  });
                });
              });
            });
          });
        });
      });
    });
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
    var db = new Db('integration_test_', replSet, {numberOfRetries:20, retryMiliSeconds:5000});
    db.open(function(err, p_db) {
      if(err != null) debug("shouldWorkCorrectlyWithInserts :: " + inspect(err));
      // Drop collection on replicaset
      p_db.dropCollection('shouldWorkCorrectlyWithInserts', function(err, r) {
        if(err != null) debug("shouldWorkCorrectlyWithInserts :: " + inspect(err));
        // Recreate collection on replicaset
        p_db.createCollection('shouldWorkCorrectlyWithInserts', function(err, collection) {
          if(err != null) debug("shouldWorkCorrectlyWithInserts :: " + inspect(err));
          
          // Insert a dummy document
          collection.insert({a:20}, {safe: {w:'majority', wtimeout: 10000}}, function(err, r) {
            if(err != null) debug("shouldWorkCorrectlyWithInserts :: " + inspect(err));
            
            // Execute a count
            collection.count(function(err, c) {
              if(err != null) debug("shouldWorkCorrectlyWithInserts :: " + inspect(err));
              
              test.equal(1, c);
              
              // Kill the primary
              RS.killPrimary(function(node) {
                if(err != null) debug("shouldWorkCorrectlyWithInserts :: " + inspect(err));
          
                test.ok(err == null);
          
                p_db.collection('shouldWorkCorrectlyWithInserts', function(err, collection) {
                  if(err != null) debug("shouldWorkCorrectlyWithInserts :: " + inspect(err));
                  // Execute a set of inserts
                  Step(
                    function inserts() {
                      var group = this.group();
                      collection.save({a:30}, {safe:{w:2, wtimeout: 10000}}, group());
                      collection.save({a:40}, {safe:{w:2, wtimeout: 10000}}, group());
                      collection.save({a:50}, {safe:{w:2, wtimeout: 10000}}, group());
                      collection.save({a:60}, {safe:{w:2, wtimeout: 10000}}, group());
                      collection.save({a:70}, {safe:{w:2, wtimeout: 10000}}, group());
                    },
                                
                    function finishUp(err, values) {   
                      if(err != null) console.log(err.stack)
                      // Restart the old master and wait for the sync to happen
                      RS.restartKilledNodes(function(err, result) {
                        if(err != null) debug("shouldWorkCorrectlyWithInserts :: " + inspect(err));                            
                        // Contains the results
                        var results = [];
                      
                        // Just wait for the results
                        // setTimeout(function() {
                          // Ensure the connection
                          // ensureConnection(test, retries, function(err, p_db) {
                            if(err != null) debug("shouldWorkCorrectlyWithInserts :: " + inspect(err));
                      
                            // Get the collection
                            p_db.collection('shouldWorkCorrectlyWithInserts', function(err, collection) {
                              if(err != null) debug("shouldWorkCorrectlyWithInserts :: " + inspect(err));
                      
                              collection.find().each(function(err, item) {
                                if(err != null) debug("shouldWorkCorrectlyWithInserts :: " + inspect(err));
                      
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
                                    if(err != null) debug("shouldWorkCorrectlyWithInserts :: " + inspect(err));
                                                            
                                    collection.find().toArray(function(err, items) {
                                      if(err != null) debug("shouldWorkCorrectlyWithInserts :: " + inspect(err));
                                                            
                                      // Ensure we have the correct values
                                      test.equal(7, items.length);
                                      
                                      // Sort items by a
                                      items = items.sort(function(a,b) { return a.a > b.a});
                                      // Test all items
                                      test.equal(20, items[0].a);
                                      test.equal(30, items[1].a);
                                      test.equal(40, items[2].a);
                                      test.equal(50, items[3].a);
                                      test.equal(60, items[4].a);
                                      test.equal(70, items[5].a);
                                      test.equal(80, items[6].a);
                                                                                                      
                                      p_db.close();
                                      test.done();                                                    
                                    });
                                  });                                    
                                } else {
                                  results.push(item);
                                }
                              });
                            });
                          // });                            
                        // }, 5000);                          
                      })
                    }                      
                  );
                });
              });
            })
          })
        });
      });
    })                
  },
  
  noGlobalsLeaked : function(test) {
    var leaks = gleak.detectNew();
    test.equal(0, leaks.length, "global var leak detected: " + leaks.join(', '));
    test.done();
  }  
})

















