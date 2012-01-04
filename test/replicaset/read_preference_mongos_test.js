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
    // RS.restartKilledNodes(function(err, result) {
    //   if(err != null) throw err;
      callback();        
    // })
  },

  // +----------------------+--------------------------------------------------+
  // |    Connection type   |                 Read Preference                  |
  // +======================+================+================+================+
  // |                      |`PRIMARY`       |`SECONDARY`     |`SECONDARY_ONLY`|
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
  'Connection to mongos with primary preference' : function(test) {
    test.done();
  },
  
  'Connection to mongos with secondary preference' : function(test) {
    test.done();
  },

  'Connection to mongos with secondary only preference' : function(test) {
    test.done();
  },
  
  noGlobalsLeaked : function(test) {
    var leaks = gleak.detectNew();
    test.equal(0, leaks.length, "global var leak detected: " + leaks.join(', '));
    test.done();
  }  
})
















