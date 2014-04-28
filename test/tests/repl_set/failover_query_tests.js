  var PingStrategy = require('../../../lib/mongodb/connection/repl_set/strategies/ping_strategy').PingStrategy
  , StatisticsStrategy = require('../../../lib/mongodb/connection/repl_set/strategies/statistics_strategy').StatisticsStrategy;

/**
 * @ignore
 */
exports['Should Correctly Collect ping information from servers'] = function(configuration, test) {
  var mongo = configuration.getMongoPackage()
    , ReplSetServers = mongo.ReplSetServers
    , Server = mongo.Server
    , Db = mongo.Db;

  // Replset start port
  var replicasetManager = configuration.getReplicasetManager();

  // Replica configuration
  var replSet = new ReplSetServers( [
      new Server(replicasetManager.host, replicasetManager.ports[0]),
      new Server(replicasetManager.host, replicasetManager.ports[1]),
      new Server(replicasetManager.host, replicasetManager.ports[2])
    ],
    {rs_name:replicasetManager.name}
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

/**
 * @ignore
 */
exports['Should correctly pick a statistics strategy for secondary'] = function(configuration, test) {
  var mongo = configuration.getMongoPackage()
    , ReplSetServers = mongo.ReplSetServers
    , ReadPreference = mongo.ReadPreference
    , Server = mongo.Server
    , Db = mongo.Db;

  // Replset start port
  var replicasetManager = configuration.getReplicasetManager();

  // Replica configuration
  var replSet = new ReplSetServers( [
      new Server(replicasetManager.host, replicasetManager.ports[0]),
      new Server(replicasetManager.host, replicasetManager.ports[1]),
      new Server(replicasetManager.host, replicasetManager.ports[2])
    ],
    {strategy:'statistical', rs_name:replicasetManager.name}
  );

  // Ensure we have the right strategy
  test.ok(replSet.strategyInstance instanceof StatisticsStrategy);

  // Set read preference
  replSet.setReadPreference(ReadPreference.SECONDARY);
  // Open the database
  var db = new Db('integration_test_', replSet, {w:0});
  // Trigger test once whole set is up
  db.on("fullsetup", function() {
    db.createCollection('testsets2', function(err, collection) {
      test.equal(null, err);

      // Insert a bunch of documents
      collection.insert([{a:20}, {b:30}, {c:40}, {d:50}], {safe: {w:'majority'}}, function(err, r) {
        test.equal(null, err);

        // Select all documents
        collection.find().setReadPreference(ReadPreference.SECONDARY).toArray(function(err, items) {
          test.equal(null, err);

          collection.find().setReadPreference(ReadPreference.SECONDARY).toArray(function(err, items) {
            test.equal(null, err);
  
            collection.find().setReadPreference(ReadPreference.SECONDARY).toArray(function(err, items) {
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
              test.ok(totalNumberOfStrategyEntries > 0);
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
}
