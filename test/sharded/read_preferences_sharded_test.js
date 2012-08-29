var mongodb = process.env['TEST_NATIVE'] != null ? require('../../lib/mongodb').native() : require('../../lib/mongodb').pure();
var noReplicasetStart = process.env['NO_REPLICASET_START'] != null ? true : false;

var testCase = require('nodeunit').testCase,
  debug = require('util').debug,
  inspect = require('util').inspect,
  gleak = require('../../dev/tools/gleak'),
  ShardedManager = require('../tools/sharded_manager').ShardedManager,
  Db = mongodb.Db,
  Mongos = mongodb.Mongos,
  ReadPreference = mongodb.ReadPreference,
  GridStore = mongodb.GridStore,
  Server = mongodb.Server;

// Keep instance of ReplicaSetManager
var serversUp = false;
var retries = 120;
var Shard = Shard == null ? null : Shard;

/**
 * Retrieve the server information for the current
 * instance of the db client
 *
 * @ignore
 */
exports.setUp = function(callback) {
  Shard = new ShardedManager({
    // A single replicaset in our sharded system
    numberOfReplicaSets:2,
    replPortRangeSet:30000,
    // A single configuration server
    numberOfConfigServers:1,
    configPortRangeSet:40000,
    // Two mongos proxies to ensure correct failover
    numberOfMongosServers:2,
    mongosRangeSet:50000,
    // Collection and shard key setup
    db:"sharded_test_db",
    collection:"sharded_test_db_collection",
    shardKey: "_id",
    // Additional settings
    replicasetOptions: [
      {tags: [{"dc1":"ny"}, {"dc2":"sf"}]},
      {tags: [{"dc1":"ny"}, {"dc2":"sf"}]}
    ]
  })

  // Start the shard
  Shard.start(function(err, result) {
    callback();
  });
}

/**
 * Retrieve the server information for the current
 * instance of the db client
 *
 * @ignore
 */
exports.tearDown = function(callback) {
  Shard.killAll(function() {
    callback();
  });
}

/**
 * @ignore
 */
exports['Should correctly perform a Mongos secondary read using the read preferences'] = function(test) {
  // Set up mongos connection
  var mongos = new Mongos([
      new Server("localhost", 50000, { auto_reconnect: true }),
      new Server("localhost", 50001, { auto_reconnect: true })
    ])

  // Connect using the mongos connections
  var db = new Db('integration_test_', mongos);
  db.open(function(err, db) {
    test.equal(null, err);
    test.ok(db != null);

    // Perform a simple insert into a collection
    var collection = db.collection("shard_test");
    // Insert a simple doc
    collection.insert({test:1}, {safe:{w:2, wtimeout:10000}}, function(err, result) {
      test.equal(null, err);

      var save = db._executeQueryCommand;
      db._executeQueryCommand = function(db_command, options, callback) {
        var _callback = function(err, result, r) {
          // Check correct read preference object
          test.deepEqual({'$query':{test:1}, '$readPreference':{mode:'secondary'}}, db_command.query);
          // Continue call
          callback(err, result, r);
        }

        save.apply(db, [db_command, options, _callback]);
      }

      collection.findOne({test:1}, {}, {readPreference:new ReadPreference(ReadPreference.SECONDARY)}, function(err, item) {
        test.equal(null, err);
        test.equal(1, item.test);

        db.close();
        test.done();
      })
    });
  });
}

/**
 * @ignore
 */
exports['Should correctly fail a Mongos read using a unsupported read preference'] = function(test) {
  // Set up mongos connection
  var mongos = new Mongos([
      new Server("localhost", 50000, { auto_reconnect: true }),
      new Server("localhost", 50001, { auto_reconnect: true })
    ])

  // Connect using the mongos connections
  var db = new Db('integration_test_', mongos);
  db.open(function(err, db) {
    test.equal(null, err);
    test.ok(db != null);

    // Perform a simple insert into a collection
    var collection = db.collection("shard_test");
    // Insert a simple doc
    collection.insert({test:1}, {safe:{w:2, wtimeout:10000}}, function(err, result) {
      test.equal(null, err);

      var save = db._executeQueryCommand;
      db._executeQueryCommand = function(db_command, options, callback) {
        var _callback = function(err, result, r) {
          // Check correct read preference object
          test.deepEqual({'$query':{test:1}, '$readPreference':{mode:'notsupported'}}, db_command.query);
          // Continue call
          callback(err, result, r);
        }

        save.apply(db, [db_command, options, _callback]);
      }

      collection.findOne({test:1}, {}, {readPreference:new ReadPreference('notsupported')}, function(err, item) {
        test.ok(err != null);
        db.close();
        test.done();
      })
    });
  });
}

/**
 * @ignore
 */
exports['Should fail a Mongos secondary read using the read preference and tags that dont exist'] = function(test) {
  // Set up mongos connection
  var mongos = new Mongos([
      new Server("localhost", 50000, { auto_reconnect: true }),
      new Server("localhost", 50001, { auto_reconnect: true })
    ])

  // Connect using the mongos connections
  var db = new Db('integration_test_', mongos);
  db.open(function(err, db) {
    test.equal(null, err);
    test.ok(db != null);

    // Perform a simple insert into a collection
    var collection = db.collection("shard_test");
    // Insert a simple doc
    collection.insert({test:1}, {safe:{w:2, wtimeout:10000}}, function(err, result) {
      test.equal(null, err);

      var save = db._executeQueryCommand;
      db._executeQueryCommand = function(db_command, options, callback) {
        var _callback = function(err, result, r) {
          // Check correct read preference object
          test.deepEqual({'$query':{test:1}, '$readPreference':{mode:'secondary', tags: [{dc:'sf',s:"1"},{dc:'ma',s:"2"}]}}, db_command.query);
          // Continue call
          callback(err, result, r);
        }

        save.apply(db, [db_command, options, _callback]);
      }

      collection.findOne({test:1}, {}, {readPreference:new ReadPreference(ReadPreference.SECONDARY, [{dc:'sf',s:"1"},{dc:'ma',s:"2"}])}, function(err, item) {
        test.ok(err != null);
        db.close();
        test.done();
      })
    });
  });
}

/**
 * @ignore
 */
exports['Should correctly read from a tagged secondary using Mongos'] = function(test) {
  // Set up mongos connection
  var mongos = new Mongos([
      new Server("localhost", 50000, { auto_reconnect: true }),
      new Server("localhost", 50001, { auto_reconnect: true })
    ])

  // Connect using the mongos connections
  var db = new Db('integration_test_', mongos);
  db.open(function(err, db) {
    test.equal(null, err);
    test.ok(db != null);

    // Perform a simple insert into a collection
    var collection = db.collection("shard_test");
    // Insert a simple doc
    collection.insert({test:1}, {safe:{w:2, wtimeout:10000}}, function(err, result) {
      test.equal(null, err);

      var save = db._executeQueryCommand;
      db._executeQueryCommand = function(db_command, options, callback) {
        var _callback = function(err, result, r) {
          // Check correct read preference object
          test.deepEqual({'$query':{test:1}, '$readPreference':{mode:'secondary', tags: [{"dc2":"sf"}, {"dc1":"ny"}]}}, db_command.query);
          // Continue call
          callback(err, result, r);
        }

        save.apply(db, [db_command, options, _callback]);
      }

      collection.findOne({test:1}, {}, {readPreference:new ReadPreference(ReadPreference.SECONDARY, [{"dc2":"sf"}, {"dc1":"ny"}])}, function(err, item) {
        test.equal(null, err);
        test.equal(1, item.test);

        db.close();
        test.done();
      })
    });
  });
}

/**
 * @ignore
 */
exports['Should correctly perform gridstore read and write'] = function(test) {
  // Set up mongos connection
  var mongos = new Mongos([
      new Server("localhost", 50000, { auto_reconnect: true }),
      new Server("localhost", 50001, { auto_reconnect: true })
    ])

  // Connect using the mongos connections
  var db = new Db('integration_test_', mongos);
  db.open(function(err, db) {
    test.equal(null, err);
    test.ok(db != null);

    GridStore(db, "test_gs_small_file", "w").open(function(err, gridStore) {
      gridStore.write("hello world!", function(err, gridStore) {
        gridStore.close(function(err, result) {
          // Read test of the file
          GridStore.read(db, 'test_gs_small_file', function(err, data) {
            test.equal('hello world!', data);

            db.close();
            test.done();
          });
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
