var mongodb = process.env['TEST_NATIVE'] != null ? require('../../lib/mongodb').native() : require('../../lib/mongodb').pure();
var noReplicasetStart = process.env['NO_REPLICASET_START'] != null ? true : false;

var testCase = require('nodeunit').testCase,
  format = require('util').format,
  debug = require('util').debug,
  inspect = require('util').inspect,
  gleak = require('../../dev/tools/gleak'),
  ReplicaSetManager = require('../tools/replica_set_manager').ReplicaSetManager,
  Db = mongodb.Db,
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

  var db = new Db('integration_test_', replSet, {safe:false});
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

var waitForReplicaset = function(callback) {
  // Replica configuration
  var replSet = new ReplSetServers([
      new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
    ], {});

  var db = new Db('integration_test_', replSet, {safe:false});
  db.on("fullsetup", function() {
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
    RS = new ReplicaSetManager({retries:120, arbiter_count:0, secondary_count:1, passive_count:0});
    RS.startSet(true, function(err, result) {
      if(err != null) throw err;
      // Finish setup
      // waitForReplicaset(callback);
      callback();
    });
  } else {
    RS.restartKilledNodes(function(err, result) {
      if(err != null) throw err;
      // waitForReplicaset(callback);
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

exports['Should correctly connect to a repliaset'] = function(test) {
  Db.connect(format("mongodb://%s:%s,%s:%s/integration_test_?replicaSet=%s"
      , RS.host, RS.ports[1]
      , RS.host, RS.ports[0]
      , RS.name), function(err, db) {
    db.close();
    test.done();
  });
}

exports['Should correctly connect to a repliaset with a read preference'] = function(test) {
  Db.connect(format("mongodb://%s:%s,%s:%s/integration_test_?replicaSet=%s&readPreference=secondary"
      , RS.host, RS.ports[1]
      , RS.host, RS.ports[0]
      , RS.name), function(err, db) {
    test.equal('secondary', db.readPreference.mode);
    db.close();
    test.done();
  });
}

exports['Should correctly connect to a repliaset with a read preference and socket parameters'] = function(test) {
  Db.connect(format("mongodb://%s:%s,%s:%s/integration_test_?" 
    + "replicaSet=%s&readPreference=secondary&journal=true&readPreferenceTags=dc:ny,rack:1&connectTimeoutMS=10000&socketTimeoutMS=20000&ssl=false&slaveOk=true"
      , RS.host, RS.ports[1]
      , RS.host, RS.ports[0]
      , RS.name), function(err, db) {
    test.equal('secondary', db.readPreference.mode);
    test.equal(true, db.safe.j);
    test.equal(10000, db.serverConfig.socketOptions.connectTimeoutMS);
    test.equal(20000, db.serverConfig.socketOptions.socketTimeoutMS);
    test.equal(true, db.slaveOk);
    db.close();
    test.done();
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
















