var mongodb = process.env['TEST_NATIVE'] != null ? require('../../lib/mongodb').native() : require('../../lib/mongodb').pure();
var noReplicasetStart = process.env['NO_REPLICASET_START'] != null ? true : false;

var testCase = require('nodeunit').testCase,
  debug = require('util').debug,
  inspect = require('util').inspect,
  gleak = require('../../dev/tools/gleak'),
  ReplicaSetManager = require('../tools/replica_set_manager').ReplicaSetManager,
  Db = mongodb.Db,
  ReplSetServers = mongodb.ReplSetServers,
  ReadPreference = mongodb.ReadPreference,
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

exports['Ensure tag read goes only to the correct server'] = function(test) {
  // Replica configuration
  var replSet = new ReplSetServers([
      new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[2], { auto_reconnect: true } )
    ],
    {}
  );

  // Set read preference
  replSet.setReadPreference(new ReadPreference(ReadPreference.SECONDARY, {"dc2":"sf"}));
  // Open the database
  var db = new Db('local', replSet, {w:0});
  // Trigger test once whole set is up
  db.on("fullsetup", function() {
    // Checkout a reader and make sure it's the primary
    var _readPreference;
    var _tags;
    var _connections = [];
    var backup = replSet.checkoutReader;
    var _member;
    
    replSet.checkoutReader = function(readPreference, tags) {
      _readPreference = readPreference;
      _tags = tags;

      var _connection = backup.apply(replSet, [readPreference, tags]);
      _connections.push(_connection);
      return _connection;
    }

    db.db('local').collection('system.replset').find().toArray(function(err, doc) {
      var members = doc[0].members;
      for(var i = 0; i < members.length; i++) {
        if(members[i].tags && members[i].tags['dc2']) {
          _member = members[i];
          break;
        }
      }

      // Check that the connections all went to the correct read
      for(var i = 0; i < _connections.length; i++) {
        var port = _connections[i].socketOptions.port.toString();
        test.ok(_member.host.match(port) != null);
      }

      // Restore the method
      replSet.checkoutReader = backup;
      db.close();
      test.done();
    });
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
