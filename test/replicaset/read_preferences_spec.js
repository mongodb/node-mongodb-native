var mongodb = process.env['TEST_NATIVE'] != null ? require('../../lib/mongodb').native() : require('../../lib/mongodb').pure();
var noReplicasetStart = process.env['NO_REPLICASET_START'] != null ? true : false;

var testCase = require('nodeunit').testCase,
  debug = require('util').debug,
  inspect = require('util').inspect,
  gleak = require('../../dev/tools/gleak'),
  ReplicaSetManager = require('../tools/replica_set_manager').ReplicaSetManager,
  Db = mongodb.Db,
  ReplSetServers = mongodb.ReplSetServers,
  PingStrategy = require('../../lib/mongodb/connection/strategies/ping_strategy').PingStrategy,
  StatisticsStrategy = require('../../lib/mongodb/connection/strategies/statistics_strategy').StatisticsStrategy,
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

var waitForReplicaset = function(callback) {    
  // Replica configuration
  var replSet = new ReplSetServers([ 
      new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[2], { auto_reconnect: true } )
    ], {});
    
  var db = new Db('integration_test_', replSet);    
  replSet.on("fullsetup", function() {
    db.close();
    callback();
  });
  
  db.open(function(err, p_db) {
    db = p_db;
  });
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
    RS = new ReplicaSetManager({retries:120, passive_count:0, secondary_count:2, tags:[{"dc1":"ny", "rack": "1", "slow": "true"}, {"dc1":"ny", "rack": "2"}, {"dc2":"sf"}]});    
    RS.startSet(true, function(err, result) {      
      if(err != null) throw err;
      waitForReplicaset(callback);      
    });      
  } else {    
    RS.restartKilledNodes(function(err, result) {
      if(err != null) throw err;
      waitForReplicaset(callback);
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

exports['Should Correctly Checkout Readers'] = function(test) {
  // Replica configuration
  var replSet = new ReplSetServers([ 
      new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[2], { auto_reconnect: true } )
    ], 
    {}
  );
  
  // Open the database
  var db = new Db('integration_test_', replSet, {recordQueryStats:true});
  // Trigger test once whole set is up
  replSet.on("fullsetup", function() {
    
    /**
     * Read using PRIMARY
     **/

    var connection = db.serverConfig.checkoutReader(Server.PRIMARY);
    // Locate connection
    test.ok(locateConnection(connection, db.serverConfig._state.master.allRawConnections()));
        
    /**
     * Read using PRIMARY_PREFERRED
     **/

    //
    // Read using PRIMARY_PREFERRED, pick the primary
    connection = db.serverConfig.checkoutReader(Server.PRIMARY_PREFERRED);
    // Locate connection
    test.ok(locateConnection(connection, db.serverConfig._state.master.allRawConnections()));
    
    // 
    // Remove the access to the primary
    var master = db.serverConfig._state.master;
    db.serverConfig._state.master = null;

    //
    // Read from secondary when primary not available
    connection = db.serverConfig.checkoutReader(Server.PRIMARY_PREFERRED);

    // Build a list of all secondary connections
    var keys = Object.keys(db.serverConfig._state.secondaries);
    var connections = [];

    for(var i = 0; i < keys.length; i++) {
      connections = connections.concat(db.serverConfig._state.secondaries[keys[i]].allRawConnections());
    }

    // Locate connection
    test.ok(locateConnection(connection, connections));

    // Clean up
    db.serverConfig._state.master = master;

    /**
     * Read using SECONDARY
     **/

    // Read with secondaries available
    connection = db.serverConfig.checkoutReader(Server.SECONDARY);

    // Locate connection
    test.ok(locateConnection(connection, connections));

    //
    // Remove the secondaries, we should now fail
    var secondaries = db.serverConfig._state.secondaries;
    db.serverConfig._state.secondaries = {};

    // Read with no secondaries available
    connection = db.serverConfig.checkoutReader(Server.SECONDARY);
    // No connection should be found
    test.equal(null, connection);

    // Return the set to the correct state
    db.serverConfig._state.secondaries = secondaries;

    /**
     * Read using SECONDARY_PREFERRED
     **/

    // Read with secondaries available
    connection = db.serverConfig.checkoutReader(Server.SECONDARY_PREFERRED);
    // Locate connection
    test.ok(locateConnection(connection, connections));

    //
    // Remove the secondaries, we should now return the primary
    var secondaries = db.serverConfig._state.secondaries;
    db.serverConfig._state.secondaries = {};

    // Read with secondaries available
    connection = db.serverConfig.checkoutReader(Server.SECONDARY_PREFERRED);

    // Locate connection
    test.ok(locateConnection(connection, db.serverConfig._state.master.allRawConnections()));    

    // Return the set to the correct state
    db.serverConfig._state.secondaries = secondaries;

    // Finish up test
    test.done();
    db.close();
  });

  db.open(function(err, p_db) {
    db = p_db;
  })    
}

exports['Should Correctly Use Server.NEAREST read preference'] = function(test) {
  // Replica configuration
  var replSet = new ReplSetServers([ 
      new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[2], { auto_reconnect: true } )
    ], 
    {strategy:'ping'}
  );
  
  // Open the database
  var db = new Db('integration_test_', replSet, {recordQueryStats:true});
  // Trigger test once whole set is up
  replSet.on("fullsetup", function() {
    // Wait for a bit, let ping happen
    setTimeout(function() {
      var lowestPingTime = 1000000;
      var lowestPingTimeServer = null;
      var keys = Object.keys(db.serverConfig._state.addresses);

      for(var i = 0; i < keys.length; i++) {
        var server = db.serverConfig._state.addresses[keys[i]];
        // Get the lowest ping time
        if(server.runtimeStats['pingMs'] < lowestPingTime) {
          lowestPingTime = server.runtimeStats['pingMs'];
          lowestPingTimeServer = server;
        }
      }

      // Build a list of all secondary connections
      var keys = Object.keys(db.serverConfig._state.secondaries);
      var connections = [];

      for(var i = 0; i < keys.length; i++) {
        connections = connections.concat(db.serverConfig._state.secondaries[keys[i]].allRawConnections());
      }

      // Fetch my nearest
      var connection = db.serverConfig.checkoutReader(Server.NEAREST);

      // verify that we have picked the lowest connection
      test.ok(locateConnection(connection, lowestPingTimeServer.allRawConnections()));      

      // Should not be null
      test.ok(connection != null);

      // 
      // Remove the access to the primary
      var master = db.serverConfig._state.master;
      db.serverConfig._state.master = null;

      // Find fastest secondary
      var lowestPingTime = 1000000;
      var lowestPingTimeServer = null;
      var keys = Object.keys(db.serverConfig._state.secondaries);

      for(var i = 0; i < keys.length; i++) {
        var server = db.serverConfig._state.secondaries[keys[i]];
        // Get the lowest ping time
        if(server.runtimeStats['pingMs'] < lowestPingTime) {
          lowestPingTime = server.runtimeStats['pingMs'];
          lowestPingTimeServer = server;
        }
      }

      var connections = [];
      var keys = Object.keys(db.serverConfig._state.secondaries);

      for(var i = 0; i < keys.length; i++) {
        var server = db.serverConfig._state.secondaries[keys[i]];

        if(server.runtimeStats['pingMs'] == lowestPingTime) {
          connections = connections.concat(server.allRawConnections());
        }
      }

      // Fetch a secondary
      connection = db.serverConfig.checkoutReader(Server.NEAREST);
      // verify that we have picked the lowest connection
      test.ok(locateConnection(connection, connections));

      // Locate connection
      test.ok(locateConnection(connection, connections));

      // Clean up
      db.serverConfig._state.master = master;

      // Finish up test
      test.done();
      db.close();      
    }, 5000);
  });

  db.open(function(err, p_db) {
    db = p_db;
  })    
}

exports['Should Correctly Use Preferences by tags no strategy'] = function(test) {
  // Replica configuration
  var replSet = new ReplSetServers([ 
      new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[2], { auto_reconnect: true } )
    ]);
  
  // Open the database
  var db = new Db('integration_test_', replSet, {recordQueryStats:true});
  // Trigger test once whole set is up
  replSet.on("fullsetup", function() {
    // Wait for a bit, let ping happen
    setTimeout(function() {    
      /**
       * Read using PRIMARY
       **/

      var connection = db.serverConfig.checkoutReader(Server.PRIMARY, {"dc1":"ny"});
      // Validate the error
      test.ok(connection instanceof Error);
      test.equal("PRIMARY cannot be combined with tags", connection.message);

      /**
       * Read using PRIMARY_PREFERRED
       **/

      //
      // Read using PRIMARY_PREFERRED, pick the primary
      connection = db.serverConfig.checkoutReader(Server.PRIMARY_PREFERRED, {"dc1":"ny"});
      // Locate connection
      test.ok(locateConnection(connection, db.serverConfig._state.master.allRawConnections()));
      
      // 
      // Remove the access to the primary
      var master = db.serverConfig._state.master;
      db.serverConfig._state.master = null;

      //
      // Read from secondary when primary not available
      connection = db.serverConfig.checkoutReader(Server.PRIMARY_PREFERRED, {"dc2":"sf"});

      // Build a list of all secondary connections
      var keys = Object.keys(db.serverConfig._state.secondaries);
      var connections = [];

      for(var i = 0; i < keys.length; i++) {
        if(db.serverConfig._state.secondaries[keys[i]].tags["dc2"] == "sf") {
          connections = connections.concat(db.serverConfig._state.secondaries[keys[i]].allRawConnections());          
        }
      }

      // Locate connection
      test.ok(locateConnection(connection, connections));

      //
      // Read from secondary when primary not available
      connection = db.serverConfig.checkoutReader(Server.PRIMARY_PREFERRED, {"dc3":"sf"});

      // Validate the error
      test.ok(connection instanceof Error);
      test.equal("No replica set members available for query", connection.message);

      // Clean up
      db.serverConfig._state.master = master;

      // /**
      //  * Read using SECONDARY
      //  **/

      // // Read with secondaries available
      // connection = db.serverConfig.checkoutReader(Server.SECONDARY);

      // // Locate connection
      // test.ok(locateConnection(connection, connections));

      // //
      // // Remove the secondaries, we should now fail
      // var secondaries = db.serverConfig._state.secondaries;
      // db.serverConfig._state.secondaries = {};

      // // Read with no secondaries available
      // connection = db.serverConfig.checkoutReader(Server.SECONDARY);
      // // No connection should be found
      // test.equal(null, connection);

      // // Return the set to the correct state
      // db.serverConfig._state.secondaries = secondaries;

      // /**
      //  * Read using SECONDARY_PREFERRED
      //  **/

      // // Read with secondaries available
      // connection = db.serverConfig.checkoutReader(Server.SECONDARY_PREFERRED);
      // // Locate connection
      // test.ok(locateConnection(connection, connections));

      // //
      // // Remove the secondaries, we should now return the primary
      // var secondaries = db.serverConfig._state.secondaries;
      // db.serverConfig._state.secondaries = {};

      // // Read with secondaries available
      // connection = db.serverConfig.checkoutReader(Server.SECONDARY_PREFERRED);

      // // Locate connection
      // test.ok(locateConnection(connection, db.serverConfig._state.master.allRawConnections()));    

      // // Return the set to the correct state
      // db.serverConfig._state.secondaries = secondaries;

      // // Finish up test
      // test.done();
      // db.close();

      // Finish up test
      test.done();
      db.close();      
    }, 5000);
  });

  db.open(function(err, p_db) {
    db = p_db;
  })    
}

var locateConnection = function(connection, connections) {
  // Locate one
  for(var i = 0; i < connections.length; i++) {
    if(connections[i].id == connection.id) {
      return true;
    }
  }  
  
  return false;
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
