var mongodb = process.env['TEST_NATIVE'] != null ? require('../../lib/mongodb').native() : require('../../lib/mongodb').pure();
var noReplicasetStart = process.env['NO_REPLICASET_START'] != null ? true : false;

var testCase = require('nodeunit').testCase,
  debug = require('util').debug,
  inspect = require('util').inspect,
  gleak = require('../../dev/tools/gleak'),
  ReplicaSetManager = require('../tools/replica_set_manager').ReplicaSetManager,
  Db = mongodb.Db,
  ReadPreference = mongodb.ReadPreference,
  ReplSetServers = mongodb.ReplSetServers,
  Server = mongodb.Server,
  Step = require("step");

// Keep instance of ReplicaSetManager
var serversUp = false;
var retries = 120;
var RS = RS == null ? null : RS;

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

exports.shouldCorrectlyHandleActiveReaper = function(test) {
  // Replica configuration
  var replSet = new ReplSetServers( [
      new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[2], { auto_reconnect: true } )
    ],
    {rs_name:RS.name}
  );

  // Insert some data
  var db = new Db('integration_test_', replSet, 
    {
      w:0,
      numberOfRetries:20, 
      retryMiliSeconds:5000,
      reaper:true,
      reaperInterval:1,
      reaperTimeout:1
    });
  db.open(function(err, p_db) {
    // Drop collection on replicaset
    p_db.dropCollection('shouldCorrectlyHandleActiveReaper', function(err, r) {
      // Recreate collection on replicaset
      p_db.createCollection('shouldCorrectlyHandleActiveReaper', function(err, collection) {
        // Insert a dummy document
        collection.insert({a:20}, {safe: {w:2, wtimeout: 10000}}, function(err, r) {
          for(var i = 0; i < 1000; i++) {
            // Do a query
            collection.find().setReadPreference(ReadPreference.SECONDARY_PREFERRED).toArray(function(err, items) {});            
          }

          // Do a query
          collection.find().setReadPreference(ReadPreference.SECONDARY_PREFERRED).toArray(function(err, items) {            
            test.equal(null, err);
            test.done();
            p_db.close();
          })
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















