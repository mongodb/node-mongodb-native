"use strict";

/**
 * @ignore
 */
exports['Should correctly perform a Mongos secondary read using the read preferences'] = {
  metadata: { requires: { topology: 'sharded' } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var Mongos = configuration.require.Mongos
      , Server = configuration.require.Server
      , Db = configuration.require.Db
      , Logger = configuration.require.Logger
      , ReadPreference = configuration.require.ReadPreference;
    // Set up mongos connection
    var mongos = new Mongos([
        new Server(configuration.host, configuration.port, { auto_reconnect: true }),
        new Server(configuration.host, configuration.port + 1, { auto_reconnect: true })
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
    // db.open(function(err, db) {
    //   test.equal(null, err);
    //   test.ok(db != null);

    //   // Perform a simple insert into a collection
    //   var collection = db.collection("shard_test1");
    //   // Insert a simple doc
    //   collection.insert({test:1}, {w:2, wtimeout:10000}, function(err, result) {
    //     test.equal(null, err);

    //     collection.findOne({test:1}, {}, {readPreference:new ReadPreference(ReadPreference.SECONDARY)}, function(err, item) {
    //       test.equal(null, err);
    //       test.equal(1, item.test);

    //       // Close db connection
    //       db.close();
    //     })
    //   });
    // });
  }
}

/**
 * @ignore
 */
exports['Should correctly fail a Mongos read using a unsupported read preference'] = {
  metadata: { requires: { topology: 'sharded' } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var Mongos = configuration.require.Mongos
      , Server = configuration.require.Server
      , Db = configuration.require.Db
      , Logger = configuration.require.Logger
      , ReadPreference = configuration.require.ReadPreference;
    // Set up mongos connection
    var mongos = new Mongos([
        new Server(configuration.host, configuration.port, { auto_reconnect: true }),
        new Server(configuration.host, configuration.port + 1, { auto_reconnect: true })
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
    // db.open(function(err, db) {
    //   test.equal(null, err);
    //   test.ok(db != null);

    //   // Perform a simple insert into a collection
    //   var collection = db.collection("shard_test2");
    //   // Insert a simple doc
    //   collection.insert({test:1}, {w:2, wtimeout:10000}, function(err, result) {
    //     test.equal(null, err);

    //     // Set debug level for the driver
    //     Logger.setLevel('debug');

    //     // Get the current logger
    //     var logger = Logger.currentLogger();
    //     // console.dir(Logger.currentLogger)
    //     Logger.setCurrentLogger(function(message, options) {
    //       if(options.type =='debug' && options.className == 'Cursor'
    //         && options.message.indexOf('"mode":"notsupported"') != -1) {
    //         test.done();
    //       }
    //     });

    //     collection.findOne({test:1}, {}, {readPreference:new ReadPreference('notsupported')}, function(err, item) {
    //       test.ok(err != null);

    //       // Set error level for the driver
    //       Logger.setLevel('error');
    //       // Close db connection
    //       db.close();
    //     })
    //   });
    // });
  }
}

/**
 * @ignore
 */
exports['Should fail a Mongos secondary read using the read preference and tags that dont exist'] = {
  metadata: { requires: { topology: 'sharded' } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var Mongos = configuration.require.Mongos
      , Server = configuration.require.Server
      , Logger = configuration.require.Logger
      , Db = configuration.require.Db
      , ReadPreference = configuration.require.ReadPreference;
    // Set up mongos connection
    var mongos = new Mongos([
        new Server(configuration.host, configuration.port, { auto_reconnect: true }),
        new Server(configuration.host, configuration.port + 1, { auto_reconnect: true })
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
    // db.open(function(err, db) {
    //   test.equal(null, err);
    //   test.ok(db != null);

    //   // Perform a simple insert into a collection
    //   var collection = db.collection("shard_test3");
    //   // Insert a simple doc
    //   collection.insert({test:1}, {w:2, wtimeout:10000}, function(err, result) {
    //     test.equal(null, err);

    //     // Set debug level for the driver
    //     Logger.setLevel('debug');

    //     // Get the current logger
    //     var logger = Logger.currentLogger();
    //     // console.dir(Logger.currentLogger)
    //     Logger.setCurrentLogger(function(message, options) {
    //       if(options.type =='debug' && options.className == 'Cursor'
    //         && options.message.indexOf('{"mode":"secondary","tags":[{"dc":"sf","s":"1"},{"dc":"ma","s":"2"}]}') != -1) {
    //         test.done();
    //       }
    //     });

    //     collection.findOne({test:1}, {}, {readPreference:new ReadPreference(ReadPreference.SECONDARY, [{dc:'sf',s:"1"},{dc:'ma',s:"2"}])}, function(err, item) {
    //       test.ok(err != null);
    //       // Set error level for the driver
    //       Logger.setLevel('error');
    //       // Close db connection
    //       db.close();
    //     })
    //   });
    // });
  }
}

/**
 * @ignore
 */
exports['Should correctly read from a tagged secondary using Mongos'] = {
  metadata: { requires: { topology: 'sharded' } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var Mongos = configuration.require.Mongos
      , Server = configuration.require.Server
      , Logger = configuration.require.Logger
      , Db = configuration.require.Db
      , ReadPreference = configuration.require.ReadPreference;
    // Set up mongos connection
    var mongos = new Mongos([
        new Server(configuration.host, configuration.port, { auto_reconnect: true }),
        new Server(configuration.host, configuration.port + 1, { auto_reconnect: true })
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
            test.deepEqual({'$query':{test:1}, '$readPreference':{mode:'secondary', tags: [{"loc":"sf"}, {"loc":"ny"}]}}, db_command.query);
            // Continue call
            callback(err, result, r);
          }

          save.apply(db, [db_command, options, _callback]);
        }

        collection.findOne({test:1}, {}, {readPreference:new ReadPreference(ReadPreference.SECONDARY, [{"loc":"sf"}, {"loc":"ny"}])}, function(err, item) {
          test.equal(null, err);
          test.equal(1, item.test);

          db.close();
          test.done();
        })
      });
    });
    // db.open(function(err, db) {
    //   test.equal(null, err);
    //   test.ok(db != null);

    //   // Perform a simple insert into a collection
    //   var collection = db.collection("shard_test4");
    //   // Insert a simple doc
    //   collection.insert({test:1}, {w:2, wtimeout:10000}, function(err, result) {
    //     test.equal(null, err);

    //     // Set debug level for the driver
    //     Logger.setLevel('debug');

    //     // Get the current logger
    //     var logger = Logger.currentLogger();
    //     // console.dir(Logger.currentLogger)
    //     Logger.setCurrentLogger(function(message, options) {
    //       if(options.type =='debug' && options.className == 'Cursor'
    //         && options.message.indexOf('{"mode":"secondary","tags":[{"loc":"ny"},{"loc":"sf"}]}') != -1) {
    //         test.done();
    //       }
    //     });

    //     collection.findOne({test:1}, {}, {readPreference:new ReadPreference(ReadPreference.SECONDARY, [{loc: "ny"}, {loc: "sf"}])}, function(err, item) {
    //       test.equal(null, err);
    //       test.equal(1, item.test);
    //       // Set error level for the driver
    //       Logger.setLevel('error');
    //       // Close db connection
    //       db.close();
    //     })
    //   });
    // });
  }
}

/**
 * @ignore
 */
exports['Should correctly connect to MongoS using single server instance'] = {
  metadata: { requires: { topology: 'sharded' } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var Mongos = configuration.require.Mongos
      , Server = configuration.require.Server
      , GridStore = configuration.require.GridStore
      , Db = configuration.require.Db
      , ReadPreference = configuration.require.ReadPreference;

    var mongos = new Server(configuration.host, configuration.port, { auto_reconnect: true });
    // Connect using the mongos connections
    var db = new Db('integration_test_', mongos, {w:1});
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
    // db.open(function(err, db) {
    //   test.equal(null, err);
    //   test.ok(db != null);

    //   // Perform a simple insert into a collection
    //   var collection = db.collection("shard_test5");
    //   // Insert a simple doc
    //   collection.insert({test:1}, {w:2, wtimeout:10000}, function(err, result) {
    //     test.equal(null, err);

    //     collection.findOne({test:1}, {}, {readPreference:new ReadPreference(ReadPreference.SECONDARY, [{"loc":"sf"}, {"loc":"ny"}])}, function(err, item) {
    //       test.equal(null, err);
    //       test.equal(1, item.test);

    //       db.close();
    //       test.done();
    //     })
    //   });
    // });
  }
}

/**
 * @ignore
 */
exports['Should correctly connect to the mongos using Server connection'] = {
  metadata: { requires: { topology: 'sharded' } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var Mongos = configuration.require.Mongos
      , Server = configuration.require.Server
      , Db = configuration.require.Db
      , ReadPreference = configuration.require.ReadPreference;
    var db = new Db("test", new Server(configuration.host, configuration.port), {w:0});
    db.open(function(e, db) {
      test.equal(null, e);

      db.createCollection("GabeTest", function(e,collection) { 
        test.equal(null, e);

        db.close();
        test.done();
      });
    });
  }
}

/**
 *
 * @ignore
 */
exports.shouldCorrectlyEmitOpenEvent = {
  metadata: { requires: { topology: 'sharded' } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var Mongos = configuration.require.Mongos
      , MongoClient = configuration.require.MongoClient
      , Server = configuration.require.Server
      , Db = configuration.require.Db
      , ReadPreference = configuration.require.ReadPreference;

    // Set up mongos connection
    var mongos = new Mongos([
        new Server("localhost", 50000, { auto_reconnect: true }),
        new Server("localhost", 50001, { auto_reconnect: true })
      ])

    var openCalled = false;
    // Connect using the mongos connections
    var db = new Db('integration_test_', mongos, {w:0});
    db.once("open", function(_err, _db) {
      openCalled = true;
    })

    db.open(function(err, db) {
      test.equal(null, err);
      test.ok(db != null);
      test.equal(true, openCalled);

      db.close();
      test.done();
    });
  }
}