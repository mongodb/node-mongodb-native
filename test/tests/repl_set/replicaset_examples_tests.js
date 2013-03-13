/**
 * Example of a simple url connection string to a replicaset, with acknowledgement of writes.
 *
 * @_class mongoclient
 * @_function MongoClient.connect
 */
exports['Should correctly connect to a replicaset'] = function(configuration, test) {
  var mongo = configuration.getMongoPackage()
    MongoClient = mongo.MongoClient;

  MongoClient.connect("mongodb://localhost:30000,localhost:30001,localhost:30002/integration_test_?w=1", function(err, db) {
    test.equal(null, err);
    test.ok(db != null);

    db.collection("replicaset_mongo_client_collection").update({a:1}, {b:1}, {upsert:true}, function(err, result) {
      test.equal(null, err);
      test.equal(1, result);

      db.close();
      test.done();
    });
  });
}

/**
 * Example of Read Preference usage at the query level.
 *
 * @_class db
 * @_function open
 * @ignore
 */
exports['Connection to replicaset with secondary only read preference no secondaries should not return a connection'] = function(test) {
  // Replica configuration
  var replSet = new ReplSetServers( [
      new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[2], { auto_reconnect: true } )
    ],
    {rs_name:RS.name}
  );

  // Create db instance
  var db = new Db('integration_test_', replSet, {w:0, native_parser: (process.env['TEST_NATIVE'] != null)});
  // Trigger test once whole set is up
  db.on("fullsetup", function() {
    // Rip out secondaries forcing an attempt to read from the primary
    db.serverConfig._state.secondaries = {};

    // Grab the collection
    db.collection("read_preference_replicaset_test_0", function(err, collection) {
      // Attempt to read (should fail due to the server not being a primary);
      collection.find().setReadPreference(ReadPreference.SECONDARY).toArray(function(err, items) {
        test.ok(err != null);
        test.equal("No replica set secondary available for query with ReadPreference SECONDARY", err.message);
        // Does not get called or we don't care
        db.close();
        test.done();
      });
    });
  });

  // Connect to the db
  db.open(function(err, p_db) {
    db = p_db;
  });
}

