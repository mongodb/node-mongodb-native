var mongodb = process.env['TEST_NATIVE'] != null ? require('../../lib/mongodb').native() : require('../../lib/mongodb').pure();
var noReplicasetStart = process.env['NO_REPLICASET_START'] != null ? true : false;

var testCase = require('nodeunit').testCase,
  debug = require('util').debug,
  inspect = require('util').inspect,
  gleak = require('../../dev/tools/gleak'),
  ReplicaSetManager = require('../tools/replica_set_manager').ReplicaSetManager,
  Db = mongodb.Db,
  ReplSetServers = mongodb.ReplSetServers,
  Server = mongodb.Server;

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
      }, 3000);
    } else {
      return callback(null);
    }    
  })            
}

/**
 * Retrieve the server information for the current
 * instance of the db client
 * 
 * @ignore
 */
exports.setUp = function(callback) {
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
}

/**
 * Retrieve the server information for the current
 * instance of the db client
 * 
 * @ignore
 */
exports.tearDown = function(callback) {
  numberOfTestsRun = numberOfTestsRun - 1;
  if(numberOfTestsRun == 0) {
    // Finished kill all instances
    RS.killAll(function() {
      callback();              
    })
  } else {
    callback();            
  }  
}

/**
 * @ignore
 */
exports.shouldContinueToQueryWithPrimaryNodeSteppedDown = function(test) {
  var replSet = new ReplSetServers( [ 
      new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[2], { auto_reconnect: true } )
    ], 
    {rs_name:RS.name, read_secondary:true}
  );

  ensureConnection(test, retries, function(err) {
    test.ok(err == null);
    
    new Db('integration_test_', replSet).open(function(err, p_db) {    
      test.ok(err == null);
      test.equal(true, p_db.serverConfig.isConnected());
      
      p_db.createCollection('empty', function (err, collection) {
        // Run a simple query
        collection.findOne(function (err, doc) {
          test.ok(err == null);
          test.ok(doc == null);

          // Step down primary server
          RS.stepDownPrimary(function (err, result) {
            // Run a simple query
            collection.findOne(function (err, doc) {
              if (err) {
                console.log("============================= caught error");
                console.dir(err);
                if (err.stack != null) console.log(err.stack);
              }
              test.ok(err == null);
              test.ok(doc == null);

              p_db.close();
              test.done();
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
exports.shouldContinueToQueryWithPrimaryNodeShutdown = function(test) {
  var replSet = new ReplSetServers( [ 
      new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[2], { auto_reconnect: true } )
    ], 
    {rs_name:RS.name, read_secondary:true}
  );

  ensureConnection(test, retries, function(err) {
    test.ok(err == null);
    
    new Db('integration_test_', replSet).open(function(err, p_db) {    
      test.ok(err == null);
      test.equal(true, p_db.serverConfig.isConnected());
      
      p_db.createCollection('empty', function (err, collection) {
        // Run a simple query
        collection.findOne(function (err, doc) {
          test.ok(err == null);
          test.ok(doc == null);

          // Shut down primary server
          RS.killPrimary(function (err, result) {
            // Run a simple query
            collection.findOne(function (err, doc) {
              if (err) {
                console.log("============================= caught error");
                console.dir(err);
                if (err.stack != null) console.log(err.stack);
              }
              test.ok(err == null);
              test.ok(doc == null);

              p_db.close();
              test.done();
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
exports.shouldContinueToQueryWithSecondaryNodeShutdown = function(test) {
  var replSet = new ReplSetServers( [ 
      new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[2], { auto_reconnect: true } )
    ], 
    {rs_name:RS.name, read_secondary:true}
  );

  ensureConnection(test, retries, function(err) {
    test.ok(err == null);
    
    new Db('integration_test_', replSet).open(function(err, p_db) {    
      test.ok(err == null);
      test.equal(true, p_db.serverConfig.isConnected());
      
      p_db.createCollection('empty', function (err, collection) {
        // Run a simple query
        collection.findOne(function (err, doc) {
          test.ok(err == null);
          test.ok(doc == null);

          // Shut down secondary server
          RS.killSecondary(function (err, result) {
            // Run a simple query
            collection.findOne(function (err, doc) {
              if (err) {
                console.log("============================= caught error");
                console.dir(err);
                if (err.stack != null) console.log(err.stack);
              }
              test.ok(err == null);
              test.ok(doc == null);

              p_db.close();
              test.done();
            });
          });
        });
      });
    });        
  });
}

/**
 * Retrieve the server information for the current
 * instance of the db client
 * 
 * @ignore
 */
exports.noGlobalsLeaked = function(test) {
  var leaks = gleak.detectNew();
  test.equal(0, leaks.length, "global var leak detected: " + leaks.join(', '));
  test.done();
}

/**
 * Retrieve the server information for the current
 * instance of the db client
 * 
 * @ignore
 */
var numberOfTestsRun = Object.keys(this).length - 2;
