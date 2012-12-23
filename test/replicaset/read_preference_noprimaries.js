var mongodb = process.env['TEST_NATIVE'] != null ? require('../../lib/mongodb').native() : require('../../lib/mongodb').pure();
var MongoClient = mongodb.MongoClient;
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

  var db = new Db('integration_test_', replSet, {w:0});
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
    var db = new Db(dbname, server, {w:0, native_parser: (process.env['TEST_NATIVE'] != null)});
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
    RS = new ReplicaSetManager({retries:120, secondary_count:2, arbiter_count:0, passive_count:0});

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
  RS.killAll(function() {
      callback();
  })
}


exports['shouldStillQuerySecondaryWhenNoPrimaryAvailable'] = function(test) {
  MongoClient.connect("mongodb://localhost:30000,localhost:30001,localhost:30002/integration_test_", { 
      db: { native_parser: false },
      replSet: {
          //set replset check interval to be much smaller than our querying interval
          haInterval: 50,
          socketOptions: {
            connectTimeoutMS: 500
          }
      }
    }, function(err,db){
      test.equal(null, err);
      test.ok(db != null);

      db.collection("replicaset_readpref_test").insert({testfield:123}, function(err, result) {
        test.equal(null, err);
        db.collection("replicaset_readpref_test").findOne({}, function(err, result){
          test.equal(null, err);
          test.equal(result.testfield, 123);

          // wait five seconds, then kill 2 of the 3 nodes that are up.
          setTimeout(function(){
            RS.kill(0, function(){console.log("killed replica set member 0.")});
            RS.kill(1, function(){console.log("killed replica set member 1.")});
          }, 5000);


          // we should be able to continue querying for a full minute
          var counter = 0;
          var callbacksWaiting = 0;
          var intervalid = setInterval(function() {

            if(counter++ >= 30){
              clearInterval(intervalid);
              // console.log("after", counter, "seconds callbacks check:");
              test.ok(callbacksWaiting < 3);
              // console.log("callbacks not returned", callbacksWaiting, "times in a row");
              db.close();
              test.done();
              return;
            }

            callbacksWaiting++;

            db.collection("replicaset_readpref_test").findOne({},
              {readPreference: ReadPreference.SECONDARY_PREFERRED},
              function(err, result){
                  callbacksWaiting--;
              });

            // console.log("counter:", counter, callbacksWaiting);
          }, 1000);
        });
      });
    });
};

/**
 * Retrieve the server information for the current
 * instance of the db client
 *
 * @ignore
 */
var numberOfTestsRun = Object.keys(this).length - 2;















