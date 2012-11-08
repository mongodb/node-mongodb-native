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

  var db = new Db('integration_test_', replSet, {w:0});
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
    RS = new ReplicaSetManager({retries:120, passive_count:0, secondary_count:2, tags:[{"dc1":"ny"}, {"dc1":"ny"}, {"dc2":"sf"}]});
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

exports['Should Correctly Collect ping information from servers'] = function(test) {
  // Replica configuration
  var replSet = new ReplSetServers([
      new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[2], { auto_reconnect: true } )
    ],
    {}
  );

  // Set read preference
  replSet.setReadPreference({'dc3':'pa', 'dc2':'sf', 'dc1':'ny'});
  // Open the database
  var db = new Db('integration_test_', replSet, {w:0, recordQueryStats:true});
  // Trigger test once whole set is up
  db.on("fullsetup", function() {
    setTimeout(function() {
      var keys = Object.keys(replSet._state.addresses);
      for(var i = 0; i < keys.length; i++) {
        var server = replSet._state.addresses[keys[i]];
        test.ok(server.queryStats.numDataValues >= 0);
        test.ok(server.queryStats.mean >= 0);
        test.ok(server.queryStats.variance >= 0);
        test.ok(server.queryStats.standardDeviation >= 0);
      }

      db.close();
      test.done();
    }, 5000)
  });

  db.open(function(err, p_db) {
    db = p_db;
  })
}

exports['Should correctly pick a ping strategy for secondary'] = function(test) {
  // Replica configuration
  var replSet = new ReplSetServers([
      new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[2], { auto_reconnect: true } )
    ],
    {}
  );

  // Set read preference
  replSet.setReadPreference(Server.READ_SECONDARY);
  // Open the database
  var db = new Db('integration_test_', replSet, {w:0, recordQueryStats:true});
  // Trigger test once whole set is up
  db.on("fullsetup", function() {
    db.createCollection('testsets3', function(err, collection) {
      if(err != null) debug("shouldCorrectlyWaitForReplicationToServersOnInserts :: " + inspect(err));

      // Insert a bunch of documents
      collection.insert([{a:20}, {b:30}, {c:40}, {d:50}], {safe: {w:'majority'}}, function(err, r) {

        // Select all documents
        collection.find().toArray(function(err, items) {
          test.equal(null, err);
          test.equal(4, items.length);
          db.close();
          test.done();
        });
      });
    });
  });

  db.open(function(err, p_db) {
    db = p_db;
  })
}

exports['Should correctly pick a statistics strategy for secondary'] = function(test) {
  // Replica configuration
  var replSet = new ReplSetServers([
      new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[2], { auto_reconnect: true } )
    ],
    {strategy:'statistical'}
  );

  // Ensure we have the right strategy
  test.ok(replSet.strategyInstance instanceof StatisticsStrategy);

  // Set read preference
  replSet.setReadPreference(Server.READ_SECONDARY);
  // Open the database
  var db = new Db('integration_test_', replSet, {w:0});
  // Trigger test once whole set is up
  db.on("fullsetup", function() {
    db.createCollection('testsets2', function(err, collection) {
      if(err != null) debug("shouldCorrectlyWaitForReplicationToServersOnInserts :: " + inspect(err));

      // Insert a bunch of documents
      collection.insert([{a:20}, {b:30}, {c:40}, {d:50}], {safe: {w:'majority'}}, function(err, r) {
        // Select all documents
        collection.find().toArray(function(err, items) {
          collection.find().toArray(function(err, items) {
            collection.find().toArray(function(err, items) {
              test.equal(null, err);
              test.equal(4, items.length);

              // Total number of entries done
              var totalNumberOfStrategyEntries = 0;
              // Check that we have correct strategy objects
              var keys = Object.keys(replSet._state.secondaries);
              for(var i = 0; i < keys.length; i++) {
                var server = replSet._state.secondaries[keys[i]];
                totalNumberOfStrategyEntries += server.queryStats.numDataValues;
              }

              db.close();
              test.equal(5, totalNumberOfStrategyEntries);
              test.done();
            });
          });
        });
      });
    });
  });

  db.open(function(err, p_db) {
    db = p_db;
  })
},

exports['Should correctly create and start a ping strategy'] = function(test) {
  // Replica configuration
  var replSet = new ReplSetServers([
      new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[2], { auto_reconnect: true } )
    ],
    {strategy:'ping'}
  );

  // Ensure we have the right strategy
  test.ok(replSet.strategyInstance instanceof PingStrategy);

  // Set read preference
  replSet.setReadPreference(Server.READ_SECONDARY);

  // Open the database
  var db = new Db('integration_test_', replSet, {w:0});

  // Trigger test once whole set is up
  db.on("fullsetup", function() {
    test.equal('connected', replSet.strategyInstance.state);
    db.close();
    test.done();
  });

  db.open(function(err, p_db) {
    db = p_db;
  })
},

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
