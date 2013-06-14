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

  // console.log("=============================================== 0")

  // Ensure we have the right strategy
  test.ok(replSet.strategyInstance instanceof StatisticsStrategy);

  // Set read preference
  replSet.setReadPreference(ReadPreference.SECONDARY);
  // Open the database
  var db = new Db('integration_test_', replSet, {w:0});
  // Trigger test once whole set is up
  db.on("fullsetup", function() {
    // console.log("=============================================== 1")
    db.createCollection('testsets2', function(err, collection) {
      // if(err){
      //   console.dir(err)
      // }
      // console.log("=============================================== 2")

      // Insert a bunch of documents
      collection.insert([{a:20}, {b:30}, {c:40}, {d:50}], {safe: {w:'majority'}}, function(err, r) {
        // console.log("=============================================== 3")
        // Select all documents
        // collection.find().setReadPreference(ReadPreference.SECONDARY).toArray(function(err, items) {
        collection.find().toArray(function(err, items) {
          // console.log("=============================================== 4")
          // collection.find().setReadPreference(ReadPreference.SECONDARY).toArray(function(err, items) {
          collection.find().toArray(function(err, items) {
            // console.log("=============================================== 5")
            // collection.find().setReadPreference(ReadPreference.SECONDARY).toArray(function(err, items) {
            collection.find().toArray(function(err, items) {
              // console.log("=============================================== 6")
              // console.dir(err)
              // console.dir(items)
              test.equal(null, err);
              test.equal(4, items.length);

              // Total number of entries done
              var totalNumberOfStrategyEntries = 0;
              
              // Check that we have correct strategy objects
              var keys = Object.keys(replSet._state.secondaries);
              // console.dir("===== keys")
              // console.dir(keys)
              for(var i = 0; i < keys.length; i++) {
                var server = replSet._state.secondaries[keys[i]];
                // console.dir(server.queryStats)
                // console.dir("server.queryStats.numDataValues = " + server.queryStats.numDataValues)
                totalNumberOfStrategyEntries += server.queryStats.numDataValues;
              }

                // console.dir(replSet._state.master.queryStats)
              // console.dir("replSet._state.master.queryStats.numDataValues = " + replSet._state.master.queryStats.numDataValues)

              db.close();
              // console.dir(totalNumberOfStrategyEntries)
              test.ok(totalNumberOfStrategyEntries >= 4);
              test.done();
            });
          });
        });
      });
    });
  });

  db.open(function(err, p_db) {
    // console.log("=============================================== 0 : 1")
    db = p_db;
  })
}
