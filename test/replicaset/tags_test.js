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

exports['Should Correctly Connect With Default Replicaset And Insert Document For Tag Dc:NY'] = function(test) {
  // Replica configuration
  var replSet = new ReplSetServers([
      new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[2], { auto_reconnect: true } )
    ],
    {}
  );

  var db = new Db('integration_test_', replSet);
  // Trigger test once whole set is up
  replSet.on("fullsetup", function() {
    // Recreate collection on replicaset
    db.createCollection('testsets', function(err, collection) {
      if(err != null) debug("shouldCorrectlyWaitForReplicationToServersOnInserts :: " + inspect(err));

      // Insert a dummy document
      collection.insert({a:20}, {safe: {w:'majority'}}, function(err, r) {
        // Should have no error
        test.equal(null, err);

        // Do a read for the value
        collection.findOne({a:20}, function(err, item) {
          db.close();
          test.equal(20, item.a);
          test.done();
        })
      });
    });
  });

  db.open(function(err, p_db) {
    db = p_db;
  })
}

exports['Should Honor setReadPreference primary'] = function(test) {
  // Replica configuration
  var replSet = new ReplSetServers([
      new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[2], { auto_reconnect: true } )
    ],
    {}
  );

  // Set read preference
  replSet.setReadPreference(Server.READ_PRIMARY);
  // Open the database
  var db = new Db('integration_test_', replSet);
  // Trigger test once whole set is up
  replSet.on("fullsetup", function() {
    // Checkout a reader and make sure it's the primary
    var reader = replSet.checkoutReader();
    var readerAddress = reader.socketOptions['host'] + ":" + reader.socketOptions['port'];
    // Locate server instance associated with this id
    var serverInstance = replSet._state.addresses[readerAddress];
    // Check that it's the primary instance
    test.equal(true, serverInstance.master);
    // Check that it's in the list of primary servers
    var primaryAddress = replSet._state.master.host + ":" + replSet._state.master.port;
    test.equal(primaryAddress, readerAddress);
    // End test and close db
    db.close();
    test.done();
  });

  db.open(function(err, p_db) {
    db = p_db;
  })
}

exports['Should Honor setReadPreference secondary'] = function(test) {
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
  var db = new Db('integration_test_', replSet);
  // Trigger test once whole set is up
  replSet.on("fullsetup", function() {
    // Checkout a reader and make sure it's the primary
    var reader = replSet.checkoutReader();
    var readerAddress = reader.socketOptions['host'] + ":" + reader.socketOptions['port'];
    // Locate server instance associated with this id
    var serverInstance = replSet._state.addresses[readerAddress];
    // Check that it's the primary instance
    test.equal(false, serverInstance.master);
    // Check that it's in the list of primary servers
    test.ok(replSet._state.secondaries[readerAddress] != null);
    // End test and close db
    db.close();
    test.done();
  });

  db.open(function(err, p_db) {
    db = p_db;
  })
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
