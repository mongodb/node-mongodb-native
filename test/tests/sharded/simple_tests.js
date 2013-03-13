/**
 * A Simple example off connecting to Mongos with a list of alternative proxies.
 *
 * @_class db
 * @_function open
 */
exports.shouldCorrectlyConnectToMongoSShardedSetup = function(configuration, test) {
  var Mongos = configuration.getMongoPackage().Mongos
    , MongoClient = configuration.getMongoPackage().MongoClient
    , Server = configuration.getMongoPackage().Server
    , Db = configuration.getMongoPackage().Db
    , ReadPreference = configuration.getMongoPackage().ReadPreference;

  // DOC_START
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
    var collection = db.collection("shard_test");
    // Insert a simple doc
    collection.insert({test:1}, {w:1}, function(err, result) {
      test.equal(null, err);

      collection.findOne({test:1}, {}, {readPreference:new ReadPreference(ReadPreference.SECONDARY)}, function(err, item) {
        test.equal(null, err);
        test.equal(1, item.test);

        db.close();
        test.done();
      })
    });
  });
  // DOC_END
}

/**
 *
 * @ignore
 */
exports.shouldCorrectlyEmitOpenEvent = function(configuration, test) {
  var Mongos = configuration.getMongoPackage().Mongos
    , MongoClient = configuration.getMongoPackage().MongoClient
    , Server = configuration.getMongoPackage().Server
    , Db = configuration.getMongoPackage().Db
    , ReadPreference = configuration.getMongoPackage().ReadPreference;

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