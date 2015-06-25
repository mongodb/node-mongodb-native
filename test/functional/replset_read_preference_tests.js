"use strict";

var format = require('util').format
  , fs = require('fs');

var restartAndDone = function(configuration, test) {
  configuration.manager.restart({purge:false, kill:true}, function() {
    test.done();
  });
}

// exports.beforeTests = function(configuration, callback) {
//   configuration.restart({purge:false, kill:true}, function() {
//     callback();
//   });
// }

var format = require('util').format;

/**
 * @ignore
 */
exports['Connection to replicaset with primary read preference'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var mongo = configuration.require
      , MongoClient = mongo.MongoClient
      , ReadPreference = mongo.ReadPreference
      , ReplSet = mongo.ReplSet
      , Server = mongo.Server
      , Db = mongo.Db;

    // Replica configuration
    var replSet = new ReplSet( [
        new Server(configuration.host, configuration.port),
        new Server(configuration.host, configuration.port + 1),
        new Server(configuration.host, configuration.port + 2)
      ],
      {rs_name:configuration.replicasetName, debug:true, readPreference:ReadPreference.PRIMARY}
    );

    // Execute flag
    var executedCorrectly = false;
    // Create db instance
    var db = new Db('integration_test_', replSet, {w:0});
    // Trigger test once whole set is up
    db.on("fullsetup", function() {
      // Let's get the primary server and wrap the checkout Method to ensure it's the one called for read
      var checkoutWriterMethod = db.serverConfig._state.master.checkoutWriter;
      // Set up checkoutWriter to catch correct write request
      db.serverConfig._state.master.checkoutWriter = function() {
        executedCorrectly = true;
        return checkoutWriterMethod.apply(this);
      }

      // Grab the collection
      var collection = db.collection("read_preference_replicaset_test_0");
      // Attempt to read (should fail due to the server not being a primary);
      collection.find().toArray(function(err, items) {
        // Does not get called or we don't care
        test.ok(executedCorrectly);
        db.close();
        test.done();
      });
    });

    // Connect to the db
    db.open(function(err, p_db) {
      db = p_db;
    });
  }
}

var identifyServers = function(mongo, manager, dbname, callback) {
  var Server = mongo.Server
    , Db = mongo.Db;

  // Arbiters
  var arbiters = [];
  var secondaries = [];
  var passives = [];
  var primary = null;

  // Get servers
  var servers = manager.secondaries;
  servers = servers.concat(manager.passives);
  servers = servers.concat(manager.arbiters);

  // Total number of servers to query
  var numberOfServersToCheck = servers.length;

  // Get the is master
  manager.getIsMaster(function(err, ismaster) {
    // get primary
    primary = {host: ismaster.primary.split(':')[0], port: parseInt(ismaster.primary.split(':')[1], 10)};

    // map all other values
    secondaries = ismaster.hosts.map(function(x) {
      return {host: x.split(':')[0], port: parseInt(x.split(':')[1], 10)};
    })

    arbiters = ismaster.arbiters.map(function(x) {
      return {host: x.split(':')[0], port: parseInt(x.split(':')[1], 10)};
    })

    passives = ismaster.passives.map(function(x) {
      return {host: x.split(':')[0], port: parseInt(x.split(':')[1], 10)};
    })

    callback(null, {primary:primary, secondaries:secondaries, arbiters:arbiters});
  });
}

/**
 * @ignore
 */
exports['Connection to replicaset with secondary read preference with no secondaries should return primary'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var mongo = configuration.require
      , MongoClient = mongo.MongoClient
      , ReadPreference = mongo.ReadPreference
      , ReplSet = mongo.ReplSet
      , Server = mongo.Server
      , Db = mongo.Db;

    // Fetch all the identity servers
    identifyServers(mongo, configuration.manager, 'integration_test_', function(err, servers) {
      // Replica configuration
      var replSet = new ReplSet( [
          new Server(configuration.host, configuration.port),
          new Server(configuration.host, configuration.port + 1),
          new Server(configuration.host, configuration.port + 2)
        ],
        {rs_name:configuration.replicasetName, debug:true, readPreference:ReadPreference.SECONDARY_PREFERRED}
      );

      // Create db instance
      var db = new Db('integration_test_', replSet, {w:0});
      // Trigger test once whole set is up
      db.on("fullsetup", function() {
        // Rip out secondaries forcing an attempt to read from the primary
        db.serverConfig._state.secondaries = {};

        // Let's get the primary server and wrap the checkout Method to ensure it's the one called for read
        var checkoutWriterMethod = db.serverConfig._state.master.checkoutWriter;
        // Set up checkoutWriter to catch correct write request
        db.serverConfig._state.master.checkoutWriter = function() {
          var r = checkoutWriterMethod.apply(db.serverConfig._state.master);
          test.equal(servers.primary.host, r.socketOptions.host);
          test.equal(servers.primary.port, r.socketOptions.port);
          return r;
        }

        // Grab the collection
        var collection = db.collection("read_preference_replicaset_test_0");
        // Attempt to read (should fail due to the server not being a primary);
        collection.find().toArray(function(err, items) {
          // Does not get called or we don't care
          db.close();
          test.done();
        });
      });

      // Connect to the db
      db.open(function(err, p_db) {
        db = p_db;
      });
    });
  }
}

/**
 * @ignore
 */
exports['Connection to replicaset with secondary only read preference should return secondary server'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var mongo = configuration.require
      , MongoClient = mongo.MongoClient
      , ReadPreference = mongo.ReadPreference
      , ReplSet = mongo.ReplSet
      , Server = mongo.Server
      , Db = mongo.Db;

    // Fetch all the identity servers
    identifyServers(mongo, configuration.manager, 'integration_test_', function(err, servers) {
      // Replica configuration
      var replSet = new ReplSet( [
          new Server(configuration.host, configuration.port),
          new Server(configuration.host, configuration.port + 1),
          new Server(configuration.host, configuration.port + 2)
        ],
        {rs_name:configuration.replicasetName, debug:true, readPreference:ReadPreference.SECONDARY}
      );

      // Execute flag
      var executedCorrectly = false;

      // Create db instance
      var db = new Db('integration_test_', replSet, {w:0, native_parser: (process.env['TEST_NATIVE'] != null)});
      // Trigger test once whole set is up
      db.on("fullsetup", function() {
        // Let's set up all the secondaries
        var keys = Object.keys(db.serverConfig._state.secondaries);

        // Set up checkoutReaders
        for(var i = 0; i < keys.length; i++) {
          var checkoutReader = db.serverConfig._state.secondaries[keys[i]].checkoutReader;
          db.serverConfig._state.secondaries[keys[i]].checkoutReader = function() {
            executedCorrectly = true;
          }
        }

        // Grab the collection
        var collection = db.collection("read_preference_replicaset_test_0");
        // Attempt to read (should fail due to the server not being a primary);
        collection.find().toArray(function(err, items) {
          // Does not get called or we don't care
          test.ok(executedCorrectly);
          db.close();
          test.done();
        });
      });
      // Connect to the db
      db.open(function(err, p_db) {
        db = p_db;
      });
    });
  }
}

/**
 * @ignore
 */
exports['Connection to replicaset with secondary read preference should return secondary server'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var mongo = configuration.require
      , MongoClient = mongo.MongoClient
      , ReadPreference = mongo.ReadPreference
      , ReplSet = mongo.ReplSet
      , Server = mongo.Server
      , Db = mongo.Db;

    // Fetch all the identity servers
    identifyServers(mongo, configuration.manager, 'integration_test_', function(err, servers) {
      // Replica configuration
      var replSet = new ReplSet( [
          new Server(configuration.host, configuration.port),
          new Server(configuration.host, configuration.port + 1),
          new Server(configuration.host, configuration.port + 2)
        ],
        {rs_name:configuration.replicasetName, debug:true, readPreference:ReadPreference.SECONDARY_PREFERRED}
      );

      // Execute flag
      var executedCorrectly = false;

      // Create db instance
      var db = new Db('integration_test_', replSet, {w:0});
      // Trigger test once whole set is up
      db.on("fullsetup", function() {
        // Let's set up all the secondaries
        var keys = Object.keys(db.serverConfig._state.secondaries);

        // Set up checkoutReaders
        for(var i = 0; i < keys.length; i++) {
          var checkoutReader = db.serverConfig._state.secondaries[keys[i]].checkoutReader;
          db.serverConfig._state.secondaries[keys[i]].checkoutReader = function() {
            executedCorrectly = true;
            return checkoutReader.apply(this);
          }
        }

        // Grab the collection
        var collection = db.collection("read_preference_replicaset_test_0");
        // Attempt to read (should fail due to the server not being a primary);
        collection.find().toArray(function(err, items) {
          // Does not get called or we don't care
          test.ok(executedCorrectly);
          db.close();
          test.done();
        });
      });
      // Connect to the db
      db.open(function(err, p_db) {
        db = p_db;
      });
    });
  }
}

/**
 * @ignore
 */
exports['Should Set read preference at collection level using collection method'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var mongo = configuration.require
      , MongoClient = mongo.MongoClient
      , ReadPreference = mongo.ReadPreference
      , ReplSet = mongo.ReplSet
      , Server = mongo.Server
      , Db = mongo.Db;

    // Replica configuration
    var replSet = new ReplSet( [
        new Server(configuration.host, configuration.port),
        new Server(configuration.host, configuration.port + 1),
        new Server(configuration.host, configuration.port + 2)
      ],
      {rs_name:configuration.replicasetName, debug:true}
    );

    // Execute flag
    var executedCorrectlyWrite = false;
    var executedCorrectlyRead = false;

    // Create db instance
    var db = new Db('integration_test_', replSet, {w:0});
    // Connect to the db
    db.open(function(err, p_db) {
      // Let's get the primary server and wrap the checkout Method to ensure it's the one called for read
      var checkoutReaderMethod = p_db.serverConfig.checkoutReader;

      p_db.serverConfig.checkoutReader = function(readPreference) {
        executedCorrectlyRead = true;
        return checkoutReaderMethod.apply(this, [readPreference]);
      }

      // Grab the collection
      var collection = db.collection("read_preferences_all_levels_0", {readPreference:Server.READ_SECONDARY_ONLY});
      // Attempt to read (should fail due to the server not being a primary);
      var cursor = collection.find()
      cursor.toArray(function(err, items) {
        // Does not get called or we don't care
        test.ok(executedCorrectlyRead);
        test.equal(Server.READ_SECONDARY_ONLY, cursor.readPreference)
        p_db.close();
        test.done();
      });
    });
  }
}

/**
 * @ignore
 */
exports['Should Set read preference at collection level using createCollection method'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var mongo = configuration.require
      , MongoClient = mongo.MongoClient
      , ReadPreference = mongo.ReadPreference
      , ReplSet = mongo.ReplSet
      , Server = mongo.Server
      , Db = mongo.Db;

    // Replica configuration
    var replSet = new ReplSet( [
        new Server(configuration.host, configuration.port),
        new Server(configuration.host, configuration.port + 1),
        new Server(configuration.host, configuration.port + 2)
      ],
      {rs_name:configuration.replicasetName, debug:true}
    );

    // Execute flag
    var executedCorrectlyWrite = false;
    var executedCorrectlyRead = false;

    // Create db instance
    var db = new Db('integration_test_', replSet, {w:0});
    // Connect to the db
    db.open(function(err, p_db) {
      // Let's get the primary server and wrap the checkout Method to ensure it's the one called for read
      var checkoutReaderMethod = p_db.serverConfig.checkoutReader;

      p_db.serverConfig.checkoutReader = function(readPreference) {
        executedCorrectlyRead = true;
        return checkoutReaderMethod.apply(this, [readPreference]);
      }

      // Grab the collection
      db.createCollection("read_preferences_all_levels_0", {readPreference:Server.READ_SECONDARY_ONLY}, function(err, collection) {
        test.equal(null, err);

        var cursor = collection.find();
        // Attempt to read (should fail due to the server not being a primary);
        cursor.toArray(function(err, items) {
          // Does not get called or we don't care
          test.ok(executedCorrectlyRead);
          test.equal(Server.READ_SECONDARY_ONLY, cursor.readPreference)
          p_db.close();
          test.done();
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports['Should Set read preference at cursor level'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var mongo = configuration.require
      , MongoClient = mongo.MongoClient
      , ReadPreference = mongo.ReadPreference
      , ReplSet = mongo.ReplSet
      , Server = mongo.Server
      , Db = mongo.Db;

    // Replica configuration
    var replSet = new ReplSet( [
        new Server(configuration.host, configuration.port),
        new Server(configuration.host, configuration.port + 1),
        new Server(configuration.host, configuration.port + 2)
      ],
      {rs_name:configuration.replicasetName}
    );

    // Execute flag
    var executedCorrectlyWrite = false;
    var executedCorrectlyRead = false;

    // Create db instance
    var db = new Db('integration_test_', replSet, {w:0});
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
      var collection = db.collection("read_preferences_all_levels_1");
      // Attempt to read (should fail due to the server not being a primary);
      collection.find().setReadPreference(Server.READ_SECONDARY_ONLY).toArray(function(err, items) {
        // Does not get called or we don't care
        test.ok(executedCorrectlyRead);
        p_db.close();
        test.done();
      });
    });
  }
}

/**
 * @ignore
 */
exports['Attempt to change read preference at cursor level after object read legacy'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var mongo = configuration.require
      , MongoClient = mongo.MongoClient
      , ReadPreference = mongo.ReadPreference
      , ReplSet = mongo.ReplSet
      , Server = mongo.Server
      , Db = mongo.Db;

    // Replica configuration
    var replSet = new ReplSet( [
        new Server(configuration.host, configuration.port),
        new Server(configuration.host, configuration.port + 1),
        new Server(configuration.host, configuration.port + 2)
      ],
      {rs_name:configuration.replicasetName}
    );

    // Execute flag
    var executedCorrectlyWrite = false;
    var executedCorrectlyRead = false;

    // Create db instance
    var db = new Db('integration_test_', replSet, {w:0});
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
      var collection = db.collection("read_preferences_all_levels_2");
      // Insert a bunch of documents
      collection.insert([{a:1}, {b:1}, {c:1}], {w:1}, function(err) {
        test.equal(null, err);

        // Set up cursor
        var cursor = collection.find().setReadPreference(Server.READ_SECONDARY_ONLY);
        cursor.each(function(err, result) {
          if(result == null) {
            test.equal(executedCorrectlyRead, true);

            p_db.close();
            test.done();
          } else {
            try {
              // Try to change the read preference it should not work as the query was executed
              cursor.setReadPreference(Server.READ_PRIMARY);
              test.ok(false);
            } catch(err) {}
            // With callback
            cursor.setReadPreference(Server.READ_PRIMARY, function(err) {
              test.ok(err != null)
            })

            // Assert it's the same
            test.equal(Server.READ_SECONDARY_ONLY, cursor.readPreference);
          }
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports['Set read preference at db level'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var mongo = configuration.require
      , MongoClient = mongo.MongoClient
      , ReadPreference = mongo.ReadPreference
      , ReplSet = mongo.ReplSet
      , Server = mongo.Server
      , Db = mongo.Db;

    // Replica configuration
    var replSet = new ReplSet( [
        new Server(configuration.host, configuration.port),
        new Server(configuration.host, configuration.port + 1),
        new Server(configuration.host, configuration.port + 2)
      ],
      {rs_name:configuration.replicasetName}
    );

    // Execute flag
    var executedCorrectlyWrite = false;
    var executedCorrectlyRead = false;

    // Create db instance
    var db = new Db('integration_test_', replSet, {w:0, readPreference:new ReadPreference(ReadPreference.SECONDARY)});
    // Connect to the db
    db.open(function(err, p_db) {
      // Let's get the primary server and wrap the checkout Method to ensure it's the one called for read
      var checkoutReaderMethod = p_db.serverConfig.checkoutReader;

      p_db.serverConfig.checkoutReader = function(readPreference) {
        executedCorrectlyRead = true;
        return checkoutReaderMethod.apply(this, [readPreference]);
      }

      // Grab the collection
      var collection = db.collection("read_preferences_all_levels_0");
      // Attempt to read (should fail due to the server not being a primary);
      var cursor = collection.find()
      cursor.toArray(function(err, items) {
        // Does not get called or we don't care
        test.ok(executedCorrectlyRead);
        test.equal(ReadPreference.SECONDARY, cursor.readPreference.mode)
        p_db.close();
        test.done();
      });
    });
  }
}

/**
 * @ignore
 */
exports['Set read preference at collection level using collection method'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var mongo = configuration.require
      , MongoClient = mongo.MongoClient
      , ReadPreference = mongo.ReadPreference
      , ReplSet = mongo.ReplSet
      , Server = mongo.Server
      , Db = mongo.Db;

    // Replica configuration
    var replSet = new ReplSet( [
        new Server(configuration.host, configuration.port),
        new Server(configuration.host, configuration.port + 1),
        new Server(configuration.host, configuration.port + 2)
      ],
      {rs_name:configuration.replicasetName}
    );

    // Execute flag
    var executedCorrectlyWrite = false;
    var executedCorrectlyRead = false;

    // Create db instance
    var db = new Db('integration_test_', replSet, {w:0});
    // Connect to the db
    db.open(function(err, p_db) {
      // Let's get the primary server and wrap the checkout Method to ensure it's the one called for read
      var checkoutReaderMethod = p_db.serverConfig.checkoutReader;

      p_db.serverConfig.checkoutReader = function(readPreference) {
        executedCorrectlyRead = true;
        return checkoutReaderMethod.apply(this, [readPreference]);
      }

      // Grab the collection
      var collection = db.collection("read_preferences_all_levels_0", {readPreference:new ReadPreference(ReadPreference.SECONDARY)});
      // Attempt to read (should fail due to the server not being a primary);
      var cursor = collection.find()
      cursor.toArray(function(err, items) {
        // Does not get called or we don't care
        test.ok(executedCorrectlyRead);
        test.equal(ReadPreference.SECONDARY, cursor.readPreference.mode)
        p_db.close();
        test.done();
      });
    });
  }
}

/**
 * @ignore
 */
exports['Set read preference at collection level using createCollection method'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var mongo = configuration.require
      , MongoClient = mongo.MongoClient
      , ReadPreference = mongo.ReadPreference
      , ReplSet = mongo.ReplSet
      , Server = mongo.Server
      , Db = mongo.Db;

    // Replica configuration
    var replSet = new ReplSet( [
        new Server(configuration.host, configuration.port),
        new Server(configuration.host, configuration.port + 1),
        new Server(configuration.host, configuration.port + 2)
      ],
      {rs_name:configuration.replicasetName}
    );

    // Execute flag
    var executedCorrectlyWrite = false;
    var executedCorrectlyRead = false;

    // Create db instance
    var db = new Db('integration_test_', replSet, {w:0});
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
          // test.equal(ReadPreference.SECONDARY, cursor.readPreference.mode)
          p_db.close();
          test.done();
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports['Set read preference at cursor level'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var mongo = configuration.require
      , MongoClient = mongo.MongoClient
      , ReadPreference = mongo.ReadPreference
      , ReplSet = mongo.ReplSet
      , Server = mongo.Server
      , Db = mongo.Db;

    // Replica configuration
    var replSet = new ReplSet( [
        new Server(configuration.host, configuration.port),
        new Server(configuration.host, configuration.port + 1),
        new Server(configuration.host, configuration.port + 2)
      ],
      {rs_name:configuration.replicasetName}
    );

    // Execute flag
    var executedCorrectlyWrite = false;
    var executedCorrectlyRead = false;

    // Create db instance
    var db = new Db('integration_test_', replSet, {w:0});
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
      var collection = p_db.collection("read_preferences_all_levels_1");
      // Attempt to read (should fail due to the server not being a primary);
      collection.find().setReadPreference(new ReadPreference(ReadPreference.SECONDARY)).toArray(function(err, items) {
        // Does not get called or we don't care
        test.ok(executedCorrectlyRead);
        p_db.close();
        test.done();
      });
    });
  }
}

/**
 * @ignore
 */
exports['Attempt to change read preference at cursor level after object read'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var mongo = configuration.require
      , MongoClient = mongo.MongoClient
      , ReadPreference = mongo.ReadPreference
      , ReplSet = mongo.ReplSet
      , Server = mongo.Server
      , Db = mongo.Db;

    // Replica configuration
    var replSet = new ReplSet( [
        new Server(configuration.host, configuration.port),
        new Server(configuration.host, configuration.port + 1),
        new Server(configuration.host, configuration.port + 2)
      ],
      {rs_name:configuration.replicasetName}
    );

    // Execute flag
    var executedCorrectlyWrite = false;
    var executedCorrectlyRead = false;

    // Create db instance
    var db = new Db('integration_test_', replSet, {w:0});
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
      var collection = db.collection("read_preferences_all_levels_2");
      // Insert a bunch of documents
      collection.insert([{a:1}, {b:1}, {c:1}], {w:1}, function(err) {
        test.equal(null, err);

        // Set up cursor
        var cursor = collection.find().setReadPreference(new ReadPreference(ReadPreference.SECONDARY));
        cursor.each(function(err, result) {
          if(result == null) {
            test.equal(executedCorrectlyRead, true);

            p_db.close();
            test.done();
          } else {
            try {
              // Try to change the read preference it should not work as the query was executed
              cursor.setReadPreference(new ReadPreference(ReadPreference.PRIMARY));
              test.ok(false);
            } catch(err) {}

            // With callback
            cursor.setReadPreference(new ReadPreference(ReadPreference.PRIMARY), function(err) {
              test.ok(err != null)
            })

            // Assert it's the same
            test.equal(ReadPreference.SECONDARY, cursor.readPreference.mode);
          }
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports['Connection to a arbiter host with primary preference should give error'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var mongo = configuration.require
      , MongoClient = mongo.MongoClient
      , ReadPreference = mongo.ReadPreference
      , ReplSet = mongo.ReplSet
      , Server = mongo.Server
      , Db = mongo.Db;

    // Fetch all the identity servers
    identifyServers(mongo, configuration.manager, 'integration_test_', function(err, servers) {
      // Let's grab an arbiter, connect and attempt a query
      var host = servers.arbiters[0].host;
      var port = servers.arbiters[0].port;

      // Connect to the db
      var server = new Server(host, port,{auto_reconnect: true});
      // Create db instance
      var db = new Db('integration_test_', server, {w:0});
      db.open(function(err, p_db) {
        // Grab a collection
        p_db.collection('t').insert({a:1}, function(err, r) {

          p_db.collection('t').findOne({}, function(err, doc) {
            test.ok(err instanceof Error);
            test.equal('string', typeof err.message);
            p_db.close();
            test.done();
          });
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports['Connection to a single primary host with different read preferences'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var mongo = configuration.require
      , MongoClient = mongo.MongoClient
      , ReadPreference = mongo.ReadPreference
      , ReplSet = mongo.ReplSet
      , Server = mongo.Server
      , Db = mongo.Db;

    // Fetch all the identity servers
    identifyServers(mongo, configuration.manager, 'integration_test_', function(err, servers) {
      // Select a secondary server, but specify read_primary (should fail)
      // Let's grab a secondary server
      var host = servers.primary.host;
      var port = servers.primary.port;

      // Connect to the db
      var server = new Server(host, port,{auto_reconnect: true});
      // Create db instance
      var db = new Db('integration_test_', server, {w:1});
      db.open(function(err, p_db) {
        // Grab the collection
        var collection = p_db.collection("read_preference_single_test_0");
        // Attempt to read (should fail due to the server not being a primary);
        collection.find().toArray(function(err, items) {
          test.equal(null, err);
          p_db.close();

          // Connect to the db
          var server = new Server(host, port,{auto_reconnect: true, readPreference:ReadPreference.SECONDARY_PREFERRED});
          // Create db instance
          var db = new Db('integration_test_', server, {w:1});
          db.open(function(err, p_db) {
            // Grab the collection
            var collection = db.collection("read_preference_single_test_0");
            // Attempt to read (should fail due to the server not being a primary);
            collection.find().toArray(function(err, items) {
              test.equal(null, err);
              test.equal(0, items.length);
              p_db.close();

              // Connect to the db
              var server = new Server(host, port,{auto_reconnect: true, readPreference:ReadPreference.SECONDARY});
              // Create db instance
              var db = new Db('integration_test_', server, {w:1});
              db.open(function(err, p_db) {
                // Grab the collection
                var collection = db.collection("read_preference_single_test_0");

                // Attempt to read (should fail due to the server not being a primary);
                collection.find().toArray(function(err, items) {
                  test.ok(err instanceof Error);
                  test.equal("Cannot read from primary when secondary only specified", err.message);

                  p_db.close();
                  test.done();
                });
              });
            });
          });
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports['Connection to a single secondary host with different read preferences'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var mongo = configuration.require
      , MongoClient = mongo.MongoClient
      , ReadPreference = mongo.ReadPreference
      , ReplSet = mongo.ReplSet
      , Server = mongo.Server
      , Db = mongo.Db;

    // Fetch all the identity servers
    identifyServers(mongo, configuration.manager, 'integration_test_', function(err, servers) {
      // Select a secondary server, but specify read_primary (should fail)
      // Let's grab a secondary server
      var host = servers.secondaries[1].host;
      var port = servers.secondaries[1].port;

      // Connect to the db
      var server = new Server(host, port,{auto_reconnect: true});
      // Create db instance
      var db = new Db('integration_test_', server, {w:0, readPreference:ReadPreference.PRIMARY});
      db.open(function(err, p_db) {
        // Grab the collection
        var collection = p_db.collection("read_preference_single_test_1");
        // Attempt to read (should fail due to the server not being a primary);
        collection.find().toArray(function(err, items) {
          test.ok(err instanceof Error);
          test.equal("Read preference is Server.PRIMARY and server is not master", err.message);
          p_db.close();

          // Connect to the db
          var server = new Server(host, port,{auto_reconnect: true});
          // Create db instance
          var db = new Db('integration_test_', server, {w:0});
          db.open(function(err, p_db) {
            // Grab the collection
            var collection = db.collection("read_preference_single_test_1");
            // Attempt to read (should fail due to the server not being a primary);
            collection.find().toArray(function(err, items) {
              test.ok(err != null);
              p_db.close();

              // Connect to the db
              var server = new Server(host, port,{auto_reconnect: true});
              // Create db instance
              var db = new Db('integration_test_', server, {w:0, readPreference:ReadPreference.SECONDARY});
              db.open(function(err, p_db) {
                // Grab the collection
                var collection = db.collection("read_preference_single_test_1");
                // Attempt to read (should fail due to the server not being a primary);
                collection.find().toArray(function(err, items) {
                  test.equal(null, err);
                  test.equal(0, items.length);

                  p_db.close();
                  test.done();
                });
              });
            });
          });
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports['Ensure tag read goes only to the correct server'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var mongo = configuration.require
      , MongoClient = mongo.MongoClient
      , ReadPreference = mongo.ReadPreference
      , ReplSet = mongo.ReplSet
      , Server = mongo.Server
      , Db = mongo.Db;

    // Replica configuration
    var replSet = new ReplSet( [
        new Server(configuration.host, configuration.port),
        new Server(configuration.host, configuration.port + 1),
        new Server(configuration.host, configuration.port + 2)
      ],
      {rs_name:configuration.replicasetName}
    );

    // Set read preference
    replSet.setReadPreference(new ReadPreference(ReadPreference.SECONDARY_PREFERRED, {"loc":"ny"}));
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
        test.equal(null, err);
        var members = doc[0].members;
        for(var i = 0; i < members.length; i++) {
          if(members[i].tags && members[i].tags['loc'] == 'ny') {
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
}

/**
 * @ignore
 */
exports['should select correct connection using statistics strategy'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var mongo = configuration.require
      , MongoClient = mongo.MongoClient
      , ReadPreference = mongo.ReadPreference
      , ReplSet = mongo.ReplSet
      , Server = mongo.Server
      , Db = mongo.Db;

    // Replica configuration
    var replSet = new ReplSet( [
        new Server(configuration.host, configuration.port),
        new Server(configuration.host, configuration.port + 1),
        new Server(configuration.host, configuration.port + 2)
      ],
      {rs_name:configuration.replicasetName, strategy:'statistical' }
    );

    var db = new Db('statistics_strategy', replSet, { w:0 });
    db.open(function(error, db) {
      var checkoutReaderMethod = db.serverConfig.checkoutReader;
      var readerReturnValues = [];

      db.serverConfig.checkoutReader = function(readPreference) {
        var ret = checkoutReaderMethod.apply(this, [readPreference]);
        readerReturnValues.push({ connection : ret });
        return ret;
      };

      var collection = db.collection("statistics_strategy");
      var keys = Object.keys(replSet._state.secondaries);
      test.equal(3, keys.length);
      test.equal(replSet._state.secondaries[keys[0]].runtimeStats.queryStats.sScore, 0);
      test.equal(replSet._state.secondaries[keys[1]].runtimeStats.queryStats.sScore, 0);

      collection.insert({ a : 1 }, function(error) {
        collection.find({ $where : "sleep(1000)" }).setReadPreference(ReadPreference.SECONDARY).toArray(function(error, items) {
          test.equal(1, readerReturnValues.length);
          test.ok(replSet._state.secondaries[keys[0]].allRawConnections().indexOf(readerReturnValues[0].connection) != -1 ||
              replSet._state.secondaries[keys[1]].allRawConnections().indexOf(readerReturnValues[0].connection) != -1);

          var expectedServer;

          if (replSet._state.secondaries[keys[0]].allRawConnections().indexOf(readerReturnValues[0].connection) != -1) {
            expectedServer = replSet._state.secondaries[keys[1]];
            test.ok(replSet._state.secondaries[keys[0]].runtimeStats.queryStats.sScore >= 0);
          } else if (replSet._state.secondaries[keys[1]].allRawConnections().indexOf(readerReturnValues[0].connection) != -1) {
            expectedServer = replSet._state.secondaries[keys[0]];
            test.ok(replSet._state.secondaries[keys[1]].runtimeStats.queryStats.sScore >= 0);
          }

          collection.find({ $where : "sleep(10)" }).setReadPreference(ReadPreference.SECONDARY).toArray(function(error, items) {
            test.equal(2, readerReturnValues.length);
            test.ok(readerReturnValues[0].connection !== readerReturnValues[1].connection);

            keys = Object.keys(replSet._state.secondaries);
            test.equal(3, keys.length);

            test.ok(replSet._state.secondaries[keys[0]].runtimeStats.queryStats.sScore >= 0);
            test.ok(replSet._state.secondaries[keys[1]].runtimeStats.queryStats.sScore >= 0);

            db.close();
            test.done();
          });
        });
      });
    });
  }
}
