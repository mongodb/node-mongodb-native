var format = require('util').format;

/**
 * @ignore
 */
exports['shouldStillQuerySecondaryWhenNoPrimaryAvailable'] = function(configuration, test) {
  var mongo = configuration.getMongoPackage()
    , MongoClient = mongo.MongoClient
    , ReadPreference = mongo.ReadPreference;

  var replMan = configuration.getReplicasetManager();

  // Connect using the MongoClient
  MongoClient.connect(format("mongodb://localhost:%s,localhost:%s,localhost:%s/integration_test_"
    , replMan.ports[0], replMan.ports[1], replMan.ports[2]), { 
      db: { native_parser: false },
      replSet: {
          //set replset check interval to be much smaller than our querying interval
          haInterval: 50,
          socketOptions: {
            connectTimeoutMS: 500
          }
      }
    }, function(err,db){
      test.equal(null, err);
      test.ok(db != null);
      // console.log("========================================================== 0")

      db.collection("replicaset_readpref_test").insert({testfield:123}, function(err, result) {
        test.equal(null, err);
        
        // console.log("========================================================== 1")
        db.collection("replicaset_readpref_test").findOne({}, function(err, result){
          test.equal(null, err);
          test.equal(result.testfield, 123);
          // console.log("========================================================== 2")

          // wait five seconds, then kill 2 of the 3 nodes that are up.
          setTimeout(function(){
            replMan.kill(0, function(){console.log("killed replica set member 0.")});
            replMan.kill(1, function(){console.log("killed replica set member 1.")});
          }, 5000);


          // we should be able to continue querying for a full minute
          var counter = 0;
          var callbacksWaiting = 0;
          var intervalid = setInterval(function() {

            if(counter++ >= 30){
              clearInterval(intervalid);
              console.log("after", counter, "seconds callbacks check:");
              // test.ok(callbacksWaiting < 3);
              console.log("callbacks not returned", callbacksWaiting, "times in a row");
              db.close();
              test.done();
              return;
            }

            callbacksWaiting++;

            db.collection("replicaset_readpref_test").findOne({},
              {readPreference: ReadPreference.SECONDARY_PREFERRED},
              function(err, result){
                // console.log("===================================== EXECUTE")
                // console.dir(err)
                // console.dir(result)
                callbacksWaiting--;
            });
            // console.log("counter:", counter, callbacksWaiting);
          }, 1000);
        });
      });
    });
};

/**
 * @ignore
 */
exports['Connection to replicaset with primary read preference'] = function(configuration, test) {
  var mongo = configuration.getMongoPackage()
    , MongoClient = mongo.MongoClient
    , ReadPreference = mongo.ReadPreference
    , ReplSetServers = mongo.ReplSetServers
    , Server = mongo.Server
    , Db = mongo.Db;

  var replicasetManager = configuration.getReplicasetManager();

  // Replica configuration
  var replSet = new ReplSetServers( [
      new Server(replicasetManager.host, replicasetManager.ports[0]),
      new Server(replicasetManager.host, replicasetManager.ports[1]),
      new Server(replicasetManager.host, replicasetManager.ports[2])
    ],
    {rs_name:replicasetManager.name, readPreference:ReadPreference.PRIMARY}
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

var identifyServers = function(mongo, rs, dbname, callback) {
  var Server = mongo.Server
    , Db = mongo.Db;
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
    var db = new Db(dbname, server, {w:0});
    // Connect to the db
    db.open(function(err, db) {
      // if(err)
      //   console.log(callback.toString())

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
 * @ignore
 */
exports['Connection to replicaset with secondary read preference with no secondaries should return primary'] = function(configuration, test) {
  var mongo = configuration.getMongoPackage()
    , MongoClient = mongo.MongoClient
    , ReadPreference = mongo.ReadPreference
    , ReplSetServers = mongo.ReplSetServers
    , Server = mongo.Server
    , Db = mongo.Db;

  // console.log("**** 'Connection to replicaset with secondary read preference with no secondaries should return primary'");
  var replicasetManager = configuration.getReplicasetManager();

  // Fetch all the identity servers
  identifyServers(mongo, replicasetManager, 'integration_test_', function(err, servers) {
    // Replica configuration
    var replSet = new ReplSetServers( [
        new Server(replicasetManager.host, replicasetManager.ports[0]),
        new Server(replicasetManager.host, replicasetManager.ports[1]),
        new Server(replicasetManager.host, replicasetManager.ports[2])
      ],
      {rs_name:replicasetManager.name, readPreference:ReadPreference.SECONDARY_PREFERRED}
    );

    // Create db instance
    var db = new Db('integration_test_', replSet, {w:0});
    // Trigger test once whole set is up
    db.on("fullsetup", function() {
      // console.log("====================================================== 0")
      // Rip out secondaries forcing an attempt to read from the primary
      db.serverConfig._state.secondaries = {};

      // Let's get the primary server and wrap the checkout Method to ensure it's the one called for read
      var checkoutWriterMethod = db.serverConfig._state.master.checkoutWriter;
      // Set up checkoutWriter to catch correct write request
      db.serverConfig._state.master.checkoutWriter = function() {
        // console.log("====================================================== 2")
        var r = checkoutWriterMethod.apply(db.serverConfig._state.master);
        test.equal(servers.primary.host, r.socketOptions.host);
        test.equal(servers.primary.port, r.socketOptions.port);
        return r;
      }

      // Grab the collection
      var collection = db.collection("read_preference_replicaset_test_0");
      // console.log("====================================================== 1")
      // Attempt to read (should fail due to the server not being a primary);
      collection.find().toArray(function(err, items) {
        // console.log("====================================================== 3")
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

/**
 * @ignore
 */
exports['Connection to replicaset with secondary only read preference should return secondary server'] = function(configuration, test) {
  var mongo = configuration.getMongoPackage()
    , MongoClient = mongo.MongoClient
    , ReadPreference = mongo.ReadPreference
    , ReplSetServers = mongo.ReplSetServers
    , Server = mongo.Server
    , Db = mongo.Db;

  var replicasetManager = configuration.getReplicasetManager();

  // Fetch all the identity servers
  identifyServers(mongo, replicasetManager, 'integration_test_', function(err, servers) {
    // Replica configuration
    var replSet = new ReplSetServers( [
        new Server(replicasetManager.host, replicasetManager.ports[0]),
        new Server(replicasetManager.host, replicasetManager.ports[1]),
        new Server(replicasetManager.host, replicasetManager.ports[2])
      ],
      {rs_name:replicasetManager.name, readPreference:ReadPreference.SECONDARY}
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

/**
 * @ignore
 */
exports['Connection to replicaset with secondary read preference should return secondary server'] = function(configuration, test) {
  var mongo = configuration.getMongoPackage()
    , MongoClient = mongo.MongoClient
    , ReadPreference = mongo.ReadPreference
    , ReplSetServers = mongo.ReplSetServers
    , Server = mongo.Server
    , Db = mongo.Db;

  var replicasetManager = configuration.getReplicasetManager();
  // console.log("+++ 'Connection to replicaset with secondary read preference should return secondary server'");

  // Fetch all the identity servers
  identifyServers(mongo, replicasetManager, 'integration_test_', function(err, servers) {
    // Replica configuration
    var replSet = new ReplSetServers( [
        new Server(replicasetManager.host, replicasetManager.ports[0]),
        new Server(replicasetManager.host, replicasetManager.ports[1]),
        new Server(replicasetManager.host, replicasetManager.ports[2])
      ],
      {rs_name:replicasetManager.name, readPreference:ReadPreference.SECONDARY_PREFERRED}
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

/**
 * @ignore
 */
exports['Should Set read preference at collection level using collection method'] = function(configuration, test) {
  var mongo = configuration.getMongoPackage()
    , MongoClient = mongo.MongoClient
    , ReadPreference = mongo.ReadPreference
    , ReplSetServers = mongo.ReplSetServers
    , Server = mongo.Server
    , Db = mongo.Db;

  var replicasetManager = configuration.getReplicasetManager();

  // Replica configuration
  var replSet = new ReplSetServers( [
      new Server(replicasetManager.host, replicasetManager.ports[0]),
      new Server(replicasetManager.host, replicasetManager.ports[1]),
      new Server(replicasetManager.host, replicasetManager.ports[2])
    ],
    {rs_name:replicasetManager.name}
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
      test.equal(Server.READ_SECONDARY_ONLY, cursor.read)
      p_db.close();
      test.done();
    });
  });
}

/**
 * @ignore
 */
exports['Should Set read preference at collection level using createCollection method'] = function(configuration, test) {
  var mongo = configuration.getMongoPackage()
    , MongoClient = mongo.MongoClient
    , ReadPreference = mongo.ReadPreference
    , ReplSetServers = mongo.ReplSetServers
    , Server = mongo.Server
    , Db = mongo.Db;

  var replicasetManager = configuration.getReplicasetManager();

  // Replica configuration
  var replSet = new ReplSetServers( [
      new Server(replicasetManager.host, replicasetManager.ports[0]),
      new Server(replicasetManager.host, replicasetManager.ports[1]),
      new Server(replicasetManager.host, replicasetManager.ports[2])
    ],
    {rs_name:replicasetManager.name}
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
        test.equal(Server.READ_SECONDARY_ONLY, cursor.read)
        p_db.close();
        test.done();
      });
    });
  });
}

/**
 * @ignore
 */
exports['Should Set read preference at cursor level'] = function(configuration, test) {
  var mongo = configuration.getMongoPackage()
    , MongoClient = mongo.MongoClient
    , ReadPreference = mongo.ReadPreference
    , ReplSetServers = mongo.ReplSetServers
    , Server = mongo.Server
    , Db = mongo.Db;

  var replicasetManager = configuration.getReplicasetManager();

  // Replica configuration
  var replSet = new ReplSetServers( [
      new Server(replicasetManager.host, replicasetManager.ports[0]),
      new Server(replicasetManager.host, replicasetManager.ports[1]),
      new Server(replicasetManager.host, replicasetManager.ports[2])
    ],
    {rs_name:replicasetManager.name}
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

/**
 * @ignore
 */
exports['Attempt to change read preference at cursor level after object read legacy'] = function(configuration, test) {
  var mongo = configuration.getMongoPackage()
    , MongoClient = mongo.MongoClient
    , ReadPreference = mongo.ReadPreference
    , ReplSetServers = mongo.ReplSetServers
    , Server = mongo.Server
    , Db = mongo.Db;

  var replicasetManager = configuration.getReplicasetManager();

  // Replica configuration
  var replSet = new ReplSetServers( [
      new Server(replicasetManager.host, replicasetManager.ports[0]),
      new Server(replicasetManager.host, replicasetManager.ports[1]),
      new Server(replicasetManager.host, replicasetManager.ports[2])
    ],
    {rs_name:replicasetManager.name}
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
          test.equal(Server.READ_SECONDARY_ONLY, cursor.read);
        }
      });
    });
  });
}

/**
 * @ignore
 */
exports['Set read preference at db level'] = function(configuration, test) {
  var mongo = configuration.getMongoPackage()
    , MongoClient = mongo.MongoClient
    , ReadPreference = mongo.ReadPreference
    , ReplSetServers = mongo.ReplSetServers
    , Server = mongo.Server
    , Db = mongo.Db;

  var replicasetManager = configuration.getReplicasetManager();

  // Replica configuration
  var replSet = new ReplSetServers( [
      new Server(replicasetManager.host, replicasetManager.ports[0]),
      new Server(replicasetManager.host, replicasetManager.ports[1]),
      new Server(replicasetManager.host, replicasetManager.ports[2])
    ],
    {rs_name:replicasetManager.name}
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
      test.equal(ReadPreference.SECONDARY, cursor.read.mode)
      p_db.close();
      test.done();
    });
  });
}

/**
 * @ignore
 */
exports['Set read preference at collection level using collection method'] = function(configuration, test) {
  var mongo = configuration.getMongoPackage()
    , MongoClient = mongo.MongoClient
    , ReadPreference = mongo.ReadPreference
    , ReplSetServers = mongo.ReplSetServers
    , Server = mongo.Server
    , Db = mongo.Db;

  var replicasetManager = configuration.getReplicasetManager();

  // Replica configuration
  var replSet = new ReplSetServers( [
      new Server(replicasetManager.host, replicasetManager.ports[0]),
      new Server(replicasetManager.host, replicasetManager.ports[1]),
      new Server(replicasetManager.host, replicasetManager.ports[2])
    ],
    {rs_name:replicasetManager.name}
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
      test.equal(ReadPreference.SECONDARY, cursor.read.mode)
      p_db.close();
      test.done();
    });
  });
}

/**
 * @ignore
 */
exports['Set read preference at collection level using createCollection method'] = function(configuration, test) {
  var mongo = configuration.getMongoPackage()
    , MongoClient = mongo.MongoClient
    , ReadPreference = mongo.ReadPreference
    , ReplSetServers = mongo.ReplSetServers
    , Server = mongo.Server
    , Db = mongo.Db;

  var replicasetManager = configuration.getReplicasetManager();

  // Replica configuration
  var replSet = new ReplSetServers( [
      new Server(replicasetManager.host, replicasetManager.ports[0]),
      new Server(replicasetManager.host, replicasetManager.ports[1]),
      new Server(replicasetManager.host, replicasetManager.ports[2])
    ],
    {rs_name:replicasetManager.name}
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
        test.equal(ReadPreference.SECONDARY, cursor.read.mode)
        p_db.close();
        test.done();
      });
    });
  });
}

/**
 * @ignore
 */
exports['Set read preference at cursor level'] = function(configuration, test) {
  var mongo = configuration.getMongoPackage()
    , MongoClient = mongo.MongoClient
    , ReadPreference = mongo.ReadPreference
    , ReplSetServers = mongo.ReplSetServers
    , Server = mongo.Server
    , Db = mongo.Db;

  var replicasetManager = configuration.getReplicasetManager();

  // Replica configuration
  var replSet = new ReplSetServers( [
      new Server(replicasetManager.host, replicasetManager.ports[0]),
      new Server(replicasetManager.host, replicasetManager.ports[1]),
      new Server(replicasetManager.host, replicasetManager.ports[2])
    ],
    {rs_name:replicasetManager.name}
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

/**
 * @ignore
 */
exports['Attempt to change read preference at cursor level after object read'] = function(configuration, test) {
  var mongo = configuration.getMongoPackage()
    , MongoClient = mongo.MongoClient
    , ReadPreference = mongo.ReadPreference
    , ReplSetServers = mongo.ReplSetServers
    , Server = mongo.Server
    , Db = mongo.Db;

  var replicasetManager = configuration.getReplicasetManager();

  // Replica configuration
  var replSet = new ReplSetServers( [
      new Server(replicasetManager.host, replicasetManager.ports[0]),
      new Server(replicasetManager.host, replicasetManager.ports[1]),
      new Server(replicasetManager.host, replicasetManager.ports[2])
    ],
    {rs_name:replicasetManager.name}
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
          test.equal(ReadPreference.SECONDARY, cursor.read.mode);
        }
      });
    });
  });
}

/**
 * @ignore
 */
exports['Connection to a arbiter host with primary preference should give error'] = function(configuration, test) {
  var mongo = configuration.getMongoPackage()
    , MongoClient = mongo.MongoClient
    , ReadPreference = mongo.ReadPreference
    , ReplSetServers = mongo.ReplSetServers
    , Server = mongo.Server
    , Db = mongo.Db;

  var replicasetManager = configuration.getReplicasetManager();
  // Fetch all the identity servers
  identifyServers(mongo, replicasetManager, 'integration_test_', function(err, servers) {
    // Let's grab an arbiter, connect and attempt a query
    var host = servers.arbiters[0].host;
    var port = servers.arbiters[0].port;

    // Connect to the db
    var server = new Server(host, port,{auto_reconnect: true});
    // Create db instance
    var db = new Db('integration_test_', server, {w:0});
    db.open(function(err, p_db) {
      // Grab a collection
      p_db.createCollection('read_preference_single_test_0', function(err, collection) {
        test.ok(err instanceof Error);
        test.equal('Cannot write to an arbiter', err.message);
        p_db.close();
        test.done();
      });
    });
  });
}

/**
 * @ignore
 */
exports['Connection to a single primary host with different read preferences'] = function(configuration, test) {
  var mongo = configuration.getMongoPackage()
    , MongoClient = mongo.MongoClient
    , ReadPreference = mongo.ReadPreference
    , ReplSetServers = mongo.ReplSetServers
    , Server = mongo.Server
    , Db = mongo.Db;

  var replicasetManager = configuration.getReplicasetManager();
  // Fetch all the identity servers
  identifyServers(mongo, replicasetManager, 'integration_test_', function(err, servers) {
    // Select a secondary server, but specify read_primary (should fail)
    // Let's grab a secondary server
    var host = servers.primary.host;
    var port = servers.primary.port;

    // Connect to the db
    var server = new Server(host, port,{auto_reconnect: true, readPreference:Server.READ_PRIMARY});
    // Create db instance
    var db = new Db('integration_test_', server, {w:0, native_parser: (process.env['TEST_NATIVE'] != null)});
    db.open(function(err, p_db) {
      // Grab the collection
      var collection = p_db.collection("read_preference_single_test_0");
      // Attempt to read (should fail due to the server not being a primary);
      collection.find().toArray(function(err, items) {
        test.equal(null, err);
        p_db.close();

        // Connect to the db
        var server = new Server(host, port,{auto_reconnect: true, readPreference:Server.READ_SECONDARY});
        // Create db instance
        var db = new Db('integration_test_', server, {w:0, native_parser: (process.env['TEST_NATIVE'] != null)});
        db.open(function(err, p_db) {
          // Grab the collection
          var collection = db.collection("read_preference_single_test_0");
          // Attempt to read (should fail due to the server not being a primary);
          collection.find().toArray(function(err, items) {
            test.equal(null, err);
            test.equal(0, items.length);
            p_db.close();

            // Connect to the db
            var server = new Server(host, port,{auto_reconnect: true, readPreference:Server.READ_SECONDARY_ONLY});
            // Create db instance
            var db = new Db('integration_test_', server, {w:0, native_parser: (process.env['TEST_NATIVE'] != null)});
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

/**
 * @ignore
 */
exports['Connection to a single secondary host with different read preferences'] = function(configuration, test) {
  var mongo = configuration.getMongoPackage()
    , MongoClient = mongo.MongoClient
    , ReadPreference = mongo.ReadPreference
    , ReplSetServers = mongo.ReplSetServers
    , Server = mongo.Server
    , Db = mongo.Db;

  var replicasetManager = configuration.getReplicasetManager();
  // Fetch all the identity servers
  identifyServers(mongo, replicasetManager, 'integration_test_', function(err, servers) {
    // Select a secondary server, but specify read_primary (should fail)
    // Let's grab a secondary server
    var host = servers.secondaries[0].host;
    var port = servers.secondaries[0].port;

    // Connect to the db
    var server = new Server(host, port,{auto_reconnect: true, readPreference:Server.READ_PRIMARY});
    // Create db instance
    var db = new Db('integration_test_', server, {w:0, native_parser: (process.env['TEST_NATIVE'] != null)});
    db.open(function(err, p_db) {
      // Grab the collection
      var collection = p_db.collection("read_preference_single_test_1");
      // Attempt to read (should fail due to the server not being a primary);
      collection.find().toArray(function(err, items) {
        test.ok(err instanceof Error);
        test.equal("Read preference is Server.PRIMARY and server is not master", err.message);
        p_db.close();

        // Connect to the db
        var server = new Server(host, port,{auto_reconnect: true, readPreference:Server.READ_SECONDARY});
        // Create db instance
        var db = new Db('integration_test_', server, {w:0, native_parser: (process.env['TEST_NATIVE'] != null)});
        db.open(function(err, p_db) {
          // Grab the collection
          var collection = db.collection("read_preference_single_test_1");
          // Attempt to read (should fail due to the server not being a primary);
          collection.find().toArray(function(err, items) {
            test.equal(null, err);
            test.equal(0, items.length);
            p_db.close();

            // Connect to the db
            var server = new Server(host, port,{auto_reconnect: true, readPreference:Server.READ_SECONDARY_ONLY});
            // Create db instance
            var db = new Db('integration_test_', server, {w:0, native_parser: (process.env['TEST_NATIVE'] != null)});
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

/**
 * @ignore
 */
exports['Ensure tag read goes only to the correct server'] = function(configuration, test) {
  var mongo = configuration.getMongoPackage()
    , MongoClient = mongo.MongoClient
    , ReadPreference = mongo.ReadPreference
    , ReplSetServers = mongo.ReplSetServers
    , Server = mongo.Server
    , Db = mongo.Db;

  var replicasetManager = configuration.getReplicasetManager();

  // Replica configuration
  var replSet = new ReplSetServers( [
      new Server(replicasetManager.host, replicasetManager.ports[0]),
      new Server(replicasetManager.host, replicasetManager.ports[1]),
      new Server(replicasetManager.host, replicasetManager.ports[2])
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


