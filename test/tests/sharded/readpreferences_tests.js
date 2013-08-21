/**
 * @ignore
 */
exports['Should correctly perform a Mongos secondary read using the read preferences'] = function(configuration, test) {
  var Mongos = configuration.getMongoPackage().Mongos
    , Server = configuration.getMongoPackage().Server
    , Db = configuration.getMongoPackage().Db
    , ReadPreference = configuration.getMongoPackage().ReadPreference;
  // Set up mongos connection
  var mongos = new Mongos([
      new Server("localhost", 50000, { auto_reconnect: true }),
      new Server("localhost", 50001, { auto_reconnect: true })
    ])

  // Connect using the mongos connections
  var db = new Db('integration_test_', mongos, {w:0});
  db.open(function(err, db) {
    test.equal(null, err);
    test.ok(db != null);

    // Perform a simple insert into a collection
    var collection = db.collection("shard_test1");
    // Insert a simple doc
    collection.insert({test:1}, {w:2, wtimeout:10000}, function(err, result) {
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
exports['Should correctly fail a Mongos read using a unsupported read preference'] = function(configuration, test) {
  var Mongos = configuration.getMongoPackage().Mongos
    , Server = configuration.getMongoPackage().Server
    , Db = configuration.getMongoPackage().Db
    , ReadPreference = configuration.getMongoPackage().ReadPreference;
  // Set up mongos connection
  var mongos = new Mongos([
      new Server("localhost", 50000, { auto_reconnect: true }),
      new Server("localhost", 50001, { auto_reconnect: true })
    ])

  // Connect using the mongos connections
  var db = new Db('integration_test_', mongos, {w:0});
  db.open(function(err, db) {
    test.equal(null, err);
    test.ok(db != null);

    // Perform a simple insert into a collection
    var collection = db.collection("shard_test2");
    // Insert a simple doc
    collection.insert({test:1}, {w:2, wtimeout:10000}, function(err, result) {
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
exports['Should fail a Mongos secondary read using the read preference and tags that dont exist'] = function(configuration, test) {
  var Mongos = configuration.getMongoPackage().Mongos
    , Server = configuration.getMongoPackage().Server
    , Db = configuration.getMongoPackage().Db
    , ReadPreference = configuration.getMongoPackage().ReadPreference;
  // Set up mongos connection
  var mongos = new Mongos([
      new Server("localhost", 50000, { auto_reconnect: true }),
      new Server("localhost", 50001, { auto_reconnect: true })
    ])

  // Connect using the mongos connections
  var db = new Db('integration_test_', mongos, {w:0});
  db.open(function(err, db) {
    test.equal(null, err);
    test.ok(db != null);

    // Perform a simple insert into a collection
    var collection = db.collection("shard_test3");
    // Insert a simple doc
    collection.insert({test:1}, {w:2, wtimeout:10000}, function(err, result) {
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
exports['Should correctly read from a tagged secondary using Mongos'] = function(configuration, test) {
  var Mongos = configuration.getMongoPackage().Mongos
    , Server = configuration.getMongoPackage().Server
    , Db = configuration.getMongoPackage().Db
    , ReadPreference = configuration.getMongoPackage().ReadPreference;
  // Set up mongos connection
  var mongos = new Mongos([
      new Server("localhost", 50000, { auto_reconnect: true }),
      new Server("localhost", 50001, { auto_reconnect: true })
    ])

  // Connect using the mongos connections
  var db = new Db('integration_test_', mongos, {w:0});
  db.open(function(err, db) {
    test.equal(null, err);
    test.ok(db != null);

    // Perform a simple insert into a collection
    var collection = db.collection("shard_test4");
    // Insert a simple doc
    collection.insert({test:1}, {w:2, wtimeout:10000}, function(err, result) {
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
exports['Should correctly perform gridstore read and write'] = function(configuration, test) {
  var Mongos = configuration.getMongoPackage().Mongos
    , Server = configuration.getMongoPackage().Server
    , Db = configuration.getMongoPackage().Db
    , GridStore = configuration.getMongoPackage().GridStore
    , ReadPreference = configuration.getMongoPackage().ReadPreference;
  // Set up mongos connection
  var mongos = new Mongos([
      new Server("localhost", 50000, { auto_reconnect: true }),
      new Server("localhost", 50001, { auto_reconnect: true })
    ])

  // Connect using the mongos connections
  var db = new Db('integration_test_', mongos, {w:0});
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

// /**
//  * @ignore
//  */
// exports['Should correctly connect to MongoS using single server instance'] = function(configuration, test) {
//   var Mongos = configuration.getMongoPackage().Mongos
//     , Server = configuration.getMongoPackage().Server
//     , Db = configuration.getMongoPackage().Db
//     , ReadPreference = configuration.getMongoPackage().ReadPreference;

//   var mongos = new Server("localhost", 50000, { auto_reconnect: true });
//   // Connect using the mongos connections
//   var db = new Db('integration_test_', mongos, {w:0});
//   db.open(function(err, db) {
//     test.equal(null, err);
//     test.ok(db != null);

//     // Perform a simple insert into a collection
//     var collection = db.collection("shard_test5");
//     // Insert a simple doc
//     collection.insert({test:1}, {w:2, wtimeout:10000}, function(err, result) {
//       test.equal(null, err);

//       collection.findOne({test:1}, {}, {readPreference:new ReadPreference(ReadPreference.SECONDARY, [{"dc2":"sf"}, {"dc1":"ny"}])}, function(err, item) {
//         test.equal(null, err);
//         test.equal(1, item.test);

//         db.close();
//         test.done();
//       })
//     });
//   });
// }

// /**
//  * @ignore
//  */
// exports['Should correctly connect to the mongos using Server connection'] = function(configuration, test) {
//   var Mongos = configuration.getMongoPackage().Mongos
//     , Server = configuration.getMongoPackage().Server
//     , Db = configuration.getMongoPackage().Db
//     , ReadPreference = configuration.getMongoPackage().ReadPreference;
//   var db = new Db("test", new Server("localhost", 50000), {w:0});
//   db.open(function(e, db) {
//     test.equal(null, e);

//     db.createCollection("GabeTest", function(e,collection) { 
//       test.equal(null, e);

//       db.close();
//       test.done();
//     });
//   });
// }