var mongodb = process.env['TEST_NATIVE'] != null ? require('../../lib/mongodb').native() : require('../../lib/mongodb').pure();
if(process.env['TEST_COVERAGE']) var mongodb = process.env['TEST_NATIVE'] != null ? require('../../lib-cov/mongodb').native() : require('../../lib-cov/mongodb').pure();
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

exports['Set read preference at db level'] = function(test) {
  // Replica configuration
  var replSet = new ReplSetServers( [
      new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[2], { auto_reconnect: true } )
    ],
    {rs_name:RS.name}
  );

  // Execute flag
  var executedCorrectlyWrite = false;
  var executedCorrectlyRead = false;

  // Create db instance
  var db = new Db('integration_test_', replSet, {native_parser: (process.env['TEST_NATIVE'] != null), readPreference:new ReadPreference(ReadPreference.SECONDARY)});
  // Connect to the db
  db.open(function(err, p_db) {
    // Let's get the primary server and wrap the checkout Method to ensure it's the one called for read
    var checkoutReaderMethod = p_db.serverConfig.checkoutReader;

    p_db.serverConfig.checkoutReader = function(readPreference) {
      executedCorrectlyRead = true;
      return checkoutReaderMethod.apply(this, [readPreference]);
    }

    // Grab the collection
    db.collection("read_preferences_all_levels_0", function(err, collection) {
      // Attempt to read (should fail due to the server not being a primary);
      var cursor = collection.find()
      cursor.toArray(function(err, items) {
        // Does not get called or we don't care
        test.ok(executedCorrectlyRead);
        test.equal(ReadPreference.SECONDARY, cursor.read.mode)
        p_db.close();
        test.done();
      });
    });
  });
}

exports['Set read preference at collection level using collection method'] = function(test) {
  // Replica configuration
  var replSet = new ReplSetServers( [
      new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[2], { auto_reconnect: true } )
    ],
    {rs_name:RS.name}
  );

  // Execute flag
  var executedCorrectlyWrite = false;
  var executedCorrectlyRead = false;

  // Create db instance
  var db = new Db('integration_test_', replSet, {native_parser: (process.env['TEST_NATIVE'] != null)});
  // Connect to the db
  db.open(function(err, p_db) {
    // Let's get the primary server and wrap the checkout Method to ensure it's the one called for read
    var checkoutReaderMethod = p_db.serverConfig.checkoutReader;

    p_db.serverConfig.checkoutReader = function(readPreference) {
      executedCorrectlyRead = true;
      return checkoutReaderMethod.apply(this, [readPreference]);
    }

    // Grab the collection
    db.collection("read_preferences_all_levels_0", {readPreference:new ReadPreference(ReadPreference.SECONDARY)}, function(err, collection) {
      // Attempt to read (should fail due to the server not being a primary);
      var cursor = collection.find()
      cursor.toArray(function(err, items) {
        // Does not get called or we don't care
        test.ok(executedCorrectlyRead);
        test.equal(ReadPreference.SECONDARY, cursor.read.mode)
        p_db.close();
        test.done();
      });
    });
  });
}

exports['Set read preference at collection level using createCollection method'] = function(test) {
  // Replica configuration
  var replSet = new ReplSetServers( [
      new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[2], { auto_reconnect: true } )
    ],
    {rs_name:RS.name}
  );

  // Execute flag
  var executedCorrectlyWrite = false;
  var executedCorrectlyRead = false;

  // Create db instance
  var db = new Db('integration_test_', replSet, {native_parser: (process.env['TEST_NATIVE'] != null)});
  // Connect to the db
  db.open(function(err, p_db) {
    // Let's get the primary server and wrap the checkout Method to ensure it's the one called for read
    var checkoutReaderMethod = p_db.serverConfig.checkoutReader;

    p_db.serverConfig.checkoutReader = function(readPreference) {
      executedCorrectlyRead = true;
      return checkoutReaderMethod.apply(this, [readPreference]);
    }

    // Grab the collection
    db.createCollection("read_preferences_all_levels_0", {readPreference:new ReadPreference(ReadPreference.SECONDARY)}, function(err, collection) {
      var cursor = collection.find();
      // Attempt to read (should fail due to the server not being a primary);
      cursor.toArray(function(err, items) {
        // Does not get called or we don't care
        test.ok(executedCorrectlyRead);
        test.equal(ReadPreference.SECONDARY, cursor.read.mode)
        p_db.close();
        test.done();
      });
    });
  });
}

exports['Set read preference at cursor level'] = function(test) {
  // Replica configuration
  var replSet = new ReplSetServers( [
      new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[2], { auto_reconnect: true } )
    ],
    {rs_name:RS.name}
  );

  // Execute flag
  var executedCorrectlyWrite = false;
  var executedCorrectlyRead = false;

  // Create db instance
  var db = new Db('integration_test_', replSet, {native_parser: (process.env['TEST_NATIVE'] != null)});
  // Connect to the db
  db.open(function(err, p_db) {
    // Let's get the primary server and wrap the checkout Method to ensure it's the one called for read
    var checkoutReaderMethod = p_db.serverConfig.checkoutReader;

    // Set up checkoutReader to catch correct write request
    p_db.serverConfig.checkoutReader = function(readPreference) {
      executedCorrectlyRead = true;
      return checkoutReaderMethod.apply(this, [readPreference]);
    }

    // Grab the collection
    p_db.collection("read_preferences_all_levels_1", {}, function(err, collection) {
      // Attempt to read (should fail due to the server not being a primary);
      collection.find().setReadPreference(new ReadPreference(ReadPreference.SECONDARY)).toArray(function(err, items) {
        // Does not get called or we don't care
        test.ok(executedCorrectlyRead);
        p_db.close();
        test.done();
      });
    });
  });
}

exports['Attempt to change read preference at cursor level after object read'] = function(test) {
  // Replica configuration
  var replSet = new ReplSetServers( [
      new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[2], { auto_reconnect: true } )
    ],
    {rs_name:RS.name}
  );

  // Execute flag
  var executedCorrectlyWrite = false;
  var executedCorrectlyRead = false;

  // Create db instance
  var db = new Db('integration_test_', replSet, {native_parser: (process.env['TEST_NATIVE'] != null)});
  // Connect to the db
  db.open(function(err, p_db) {
    // Let's get the primary server and wrap the checkout Method to ensure it's the one called for read
    var checkoutReaderMethod = p_db.serverConfig.checkoutReader;
    // Set up checkoutReader to catch correct write request
    p_db.serverConfig.checkoutReader = function(readPreference) {
      executedCorrectlyRead = true;
      return checkoutReaderMethod.apply(this, [readPreference]);
    }

    // Grab the collection
    db.collection("read_preferences_all_levels_2", {}, function(err, collection) {
      // Insert a bunch of documents
      collection.insert([{a:1}, {b:1}, {c:1}], {safe:true}, function(err) {
        test.equal(null, err);

        // Set up cursor
        var cursor = collection.find().setReadPreference(new ReadPreference(ReadPreference.SECONDARY));
        cursor.each(function(err, result) {
          if(result == null) {
            test.equal(executedCorrectlyRead, true);

            p_db.close();
            test.done();
          } else {
            // Try to change the read preference it should not work as the query was executed
            cursor.setReadPreference(new ReadPreference(ReadPreference.PRIMARY));
            // With callback
            cursor.setReadPreference(new ReadPreference(ReadPreference.PRIMARY), function(err) {
              test.ok(err != null)
            })

            // Assert it's the same
            test.equal(ReadPreference.SECONDARY, cursor.read.mode);
          }
        })
      })
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















