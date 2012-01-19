// Read Preference behaviour based on Python driver by A. Jesse Jiryu Davis
// https://github.com/mongodb/mongo-python-driver/blob/master/pymongo/__init__.py
// +----------------------+--------------------------------------------------+
// |    Connection type   |                 Read Preference                  |
// +======================+================+================+================+
// |                      |`PRIMARY`       |`SECONDARY`     |`SECONDARY_ONLY`|
// +----------------------+----------------+----------------+----------------+
// |Connection to a single|Queries are     |Queries are     |Same as         |
// |host.                 |allowed if the  |allowed if the  |`SECONDARY`     |
// |                      |connection is to|connection is to|                |
// |                      |the replica set |the replica set |                |
// |                      |primary.        |primary or a    |                |
// |                      |                |secondary.      |                |
// +----------------------+----------------+----------------+----------------+
// |Connection to a       |Queries are sent|Queries are     |Same as         |
// |mongos.               |to the primary  |distributed     |`SECONDARY`     |
// |                      |of a shard.     |among shard     |                |
// |                      |                |secondaries.    |                |
// |                      |                |Queries are sent|                |
// |                      |                |to the primary  |                |
// |                      |                |if no           |                |
// |                      |                |secondaries are |                |
// |                      |                |available.      |                |
// |                      |                |                |                |
// +----------------------+----------------+----------------+----------------+
// |ReplicaSetConnection  |Queries are sent|Queries are     |Queries are     |
// |                      |to the primary  |distributed     |never sent to   |
// |                      |of the replica  |among replica   |the replica set |
// |                      |set.            |set secondaries.|primary. An     |
// |                      |                |Queries are sent|exception is    |
// |                      |                |to the primary  |raised if no    |
// |                      |                |if no           |secondary is    |
// |                      |                |secondaries are |available.      |
// |                      |                |available.      |                |
// |                      |                |                |                |
// +----------------------+----------------+----------------+----------------+
var noReplicasetStart = process.env['NO_REPLICASET_START'] != null ? true : false;

var testCase = require('../../deps/nodeunit').testCase,
  debug = require('util').debug,
  inspect = require('util').inspect,
  gleak = require('../../dev/tools/gleak'),
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

// +----------------------+--------------------------------------------------+
// |    Connection type   |                 Read Preference                  |
// +======================+================+================+================+
// |                      |`PRIMARY`       |`SECONDARY`     |`SECONDARY_ONLY`|
// +----------------------+----------------+----------------+----------------+
// |ReplicaSetConnection  |Queries are sent|Queries are     |Queries are     |
// |                      |to the primary  |distributed     |never sent to   |
// |                      |of the replica  |among replica   |the replica set |
// |                      |set.            |set secondaries.|primary. An     |
// |                      |                |Queries are sent|exception is    |
// |                      |                |to the primary  |raised if no    |
// |                      |                |if no           |secondary is    |
// |                      |                |secondaries are |available.      |
// |                      |                |available.      |                |
// |                      |                |                |                |
// +----------------------+----------------+----------------+----------------+
exports['Connection to replicaset with primary read preference'] = function(test) {
  // Replica configuration
  var replSet = new ReplSetServers( [ 
      new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[2], { auto_reconnect: true } )
    ], 
    {rs_name:RS.name, readPreference:Server.READ_PRIMARY}
  );
  
  // Execute flag
  var executedCorrectly = false;      
  
  // Create db instance
  var db = new Db('integration_test_', replSet, {native_parser: (process.env['TEST_NATIVE'] != null)});
  // Connect to the db
  db.open(function(err, p_db) {
    // Let's get the primary server and wrap the checkout Method to ensure it's the one called for read
    var checkoutWriterMethod = p_db.serverConfig._state.master.checkoutWriter;
    // Set up checkoutWriter to catch correct write request
    p_db.serverConfig._state.master.checkoutWriter = function() {
      executedCorrectly = true;
      return checkoutWriterMethod.apply(this);
    }
    
    // Grab the collection
    db.collection("read_preference_replicaset_test_0", function(err, collection) {
      // Attempt to read (should fail due to the server not being a primary);
      collection.find().toArray(function(err, items) {
        // Does not get called or we don't care
        test.ok(executedCorrectly);
        p_db.close();
        test.done();
      });
    });
  });
}

exports['Connection to replicaset with secondary read preference with no secondaries should return primary'] = function(test) {
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
  
    // Create db instance
    var db = new Db('integration_test_', replSet, {native_parser: (process.env['TEST_NATIVE'] != null)});
    // Connect to the db
    db.open(function(err, p_db) {
      // Rip out secondaries forcing an attempt to read from the primary
      p_db.serverConfig._state.secondaries = {};

      // Let's get the primary server and wrap the checkout Method to ensure it's the one called for read
      var checkoutWriterMethod = p_db.serverConfig._state.master.checkoutWriter;
      // Set up checkoutWriter to catch correct write request
      p_db.serverConfig._state.master.checkoutWriter = function() {        
        var r = checkoutWriterMethod.apply(p_db.serverConfig._state.master);
        test.equal(servers.primary.host, r.socketOptions.host);
        test.equal(servers.primary.port, r.socketOptions.port);
        return r;
      }
    
      // Grab the collection
      p_db.collection("read_preference_replicaset_test_0", function(err, collection) {
        // Attempt to read (should fail due to the server not being a primary);
        collection.find().toArray(function(err, items) {
          // Does not get called or we don't care
          p_db.close();
          test.done();
        });
      });
    });
  });
}

exports['Connection to replicaset with secondary only read preference no secondaries should not return a connection'] = function(test) {
  // Fetch all the identity servers
  identifyServers(RS, 'integration_test_', function(err, servers) {
    // Replica configuration
    var replSet = new ReplSetServers( [ 
        new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
        new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
        new Server( RS.host, RS.ports[2], { auto_reconnect: true } )
      ], 
      {rs_name:RS.name, readPreference:Server.READ_SECONDARY_ONLY}
    );
  
    // Create db instance
    var db = new Db('integration_test_', replSet, {native_parser: (process.env['TEST_NATIVE'] != null)});
    // Connect to the db
    db.open(function(err, p_db) {
      // Rip out secondaries forcing an attempt to read from the primary
      p_db.serverConfig._state.secondaries = {};
    
      // Grab the collection
      p_db.collection("read_preference_replicaset_test_0", function(err, collection) {
        // Attempt to read (should fail due to the server not being a primary);
        collection.find().toArray(function(err, items) {
          test.ok(err != null);
          test.equal("no open connections", err.message);
          // Does not get called or we don't care
          p_db.close();
          test.done();
        });
      });
    });
  });
}

exports['Connection to replicaset with secondary only read preference should return secondary server'] = function(test) {
  // Fetch all the identity servers
  identifyServers(RS, 'integration_test_', function(err, servers) {
    // Replica configuration
    var replSet = new ReplSetServers( [ 
        new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
        new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
        new Server( RS.host, RS.ports[2], { auto_reconnect: true } )
      ], 
      {rs_name:RS.name, readPreference:Server.READ_SECONDARY_ONLY}
    );
    
    // Execute flag
    var executedCorrectly = false;      
  
    // Create db instance
    var db = new Db('integration_test_', replSet, {native_parser: (process.env['TEST_NATIVE'] != null)});
    // Connect to the db
    db.open(function(err, p_db) {        
      // Let's set up all the secondaries
      var keys = Object.keys(p_db.serverConfig._state.secondaries);
      
      // Set up checkoutReaders
      for(var i = 0; i < keys.length; i++) {
        var checkoutReader = p_db.serverConfig._state.secondaries[keys[i]].checkoutReader;
        p_db.serverConfig._state.secondaries[keys[i]].checkoutReader = function() {
          executedCorrectly = true;
        }
      }
      
      // Grab the collection
      p_db.collection("read_preference_replicaset_test_0", function(err, collection) {
        // Attempt to read (should fail due to the server not being a primary);
        collection.find().toArray(function(err, items) {
          // Does not get called or we don't care
          test.ok(executedCorrectly);
          p_db.close();
          test.done();
        });
      });
    });
  });
}

exports['Connection to replicaset with secondary read preference should return secondary server'] = function(test) {
  // Fetch all the identity servers
  identifyServers(RS, 'integration_test_', function(err, servers) {
    // Replica configuration
    var replSet = new ReplSetServers( [ 
        new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
        new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
        new Server( RS.host, RS.ports[2], { auto_reconnect: true } )
      ], 
      {rs_name:RS.name, readPreference:Server.READ_SECONDARY_ONLY}
    );
    
    // Execute flag
    var executedCorrectly = false;
  
    // Create db instance
    var db = new Db('integration_test_', replSet, {native_parser: (process.env['TEST_NATIVE'] != null)});
    // Connect to the db
    db.open(function(err, p_db) {        
      // Let's set up all the secondaries
      var keys = Object.keys(p_db.serverConfig._state.secondaries);
      
      // Set up checkoutReaders
      for(var i = 0; i < keys.length; i++) {
        var checkoutReader = p_db.serverConfig._state.secondaries[keys[i]].checkoutReader;
        p_db.serverConfig._state.secondaries[keys[i]].checkoutReader = function() {
          executedCorrectly = true;
          return checkoutReader.apply(this);
        }
      }
      
      // Grab the collection
      p_db.collection("read_preference_replicaset_test_0", function(err, collection) {
        // Attempt to read (should fail due to the server not being a primary);
        collection.find().toArray(function(err, items) {
          // Does not get called or we don't care
          test.ok(executedCorrectly);
          p_db.close();
          test.done();
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















