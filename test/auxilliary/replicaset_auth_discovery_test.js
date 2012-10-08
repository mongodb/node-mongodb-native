var mongodb = process.env['TEST_NATIVE'] != null ? require('../../lib/mongodb').native() : require('../../lib/mongodb').pure();

var testCase = require('nodeunit').testCase,
  debug = require('util').debug,
  inspect = require('util').inspect,
  nodeunit = require('nodeunit'),
  gleak = require('../../dev/tools/gleak'),
  Db = mongodb.Db,
  Cursor = mongodb.Cursor,
  Collection = mongodb.Collection,
  Server = mongodb.Server,
  ReplSetServers = mongodb.ReplSetServers,
  ReplicaSetManager = require('../../test/tools/replica_set_manager').ReplicaSetManager,
  Step = require("step");  

var MONGODB = 'integration_tests';
var serverManager = null;
var RS = RS == null ? null : RS;

/**
 * Retrieve the server information for the current
 * instance of the db client
 * 
 * @ignore
 */
exports.setUp = function(callback) {
  RS = new ReplicaSetManager({retries:120, 
    auth:true, 
    arbiter_count:0,
    secondary_count:2,
    passive_count:0});
  RS.startSet(true, function(err, result) {      
    if(err != null) throw err;

    var replSet = new ReplSetServers( [ 
        new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
        new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
      ], 
      {rs_name:RS.name, read_secondary:true}
    );
    
    // Connect to the replicaset
    var db = new Db('node-native-test', replSet, {safe:false});
    db.open(function(err, p_db) {
      db.addUser("me", "secret", function() {
        db.close();
        callback();
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
exports.tearDown = function(callback) {
  callback();
}

exports.shouldCorrectlyAuthenticateUsingPrimary = function(test) {
  // connection string
  var config = "mongodb://me:secret@localhost:30000/node-native-test";
  // Connect
  Db.connect(config, function(error, client) {
    if (error) {
      console.log("Received connection error (" + error + ") with " + config)
    } else {
      // console.log("Connected with " + config)
      client.collectionNames(function(error, names) {
        if (error) {
          console.log("Error querying (" + error + ") with " + config)
        } else {
          // console.log("Queried with " + config)
        }
        
        client.close();
        test.done();
      })
    }
  });
}

exports.shouldCorrectlyAuthenticateWithTwoSeeds = function(test) {
  // connection string
  var config = "mongodb://me:secret@localhost:30001,localhost:30000/node-native-test";
  // Connect
  Db.connect(config, function(error, client) {
    if (error) {
      console.log("Received connection error (" + error + ") with " + config)
    } else {
      // console.log("Connected with " + config)
      client.collectionNames(function(error, names) {
        if (error) {
          console.log("Error querying (" + error + ") with " + config)
        } else {
          // console.log("Queried with " + config)
        }
        
        client.close();
        test.done();
      })
    }
  });
}

exports.shouldCorrectlyAuthenticateWithOnlySecondarySeed = function(test) {
  // connection string
  var config = "mongodb://me:secret@localhost:30001/node-native-test?slaveOk=true";
  // Connect
  Db.connect(config, function(error, client) {
    if (error) {
      console.log("Received connection error (" + error + ") with " + config)
    } else {
      // console.log("Connected with " + config)
      client.collectionNames(function(error, names) {
        if (error) {
          console.log("Error querying (" + error + ") with " + config)
        } else {
          // console.log("Queried with " + config)
        }
        
        client.close();
        test.done();
      })
    }
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