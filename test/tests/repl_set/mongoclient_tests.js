var format = require('util').format;

/**
 * @ignore
 */
exports['Should correctly connect to a replicaset with additional options'] = function(configuration, test) {
  var mongo = configuration.getMongoPackage()
    MongoClient = mongo.MongoClient;

  var replMan = configuration.getReplicasetManager();
  var url = format("mongodb://localhost:%s,localhost:%s,localhost:%s/integration_test_"
    , replMan.ports[0], replMan.ports[1], replMan.ports[2])

  MongoClient.connect(url, {
    db: {
      native_parser: false
    },

    replSet: {
      haInterval: 500,
      socketOptions: {
        connectTimeoutMS: 500
      }
    }
  }, function(err, db) {
    test.equal(null, err);
    test.ok(db != null);
    test.equal(500, db.serverConfig.options.socketOptions.connectTimeoutMS);
    test.equal(0, db.serverConfig.options.socketOptions.socketTimeoutMS);
    test.equal(0, db.serverConfig.socketTimeoutMS);
    test.equal(false, db.native_parser);
    test.equal(500, db.serverConfig.options.haInterval)

    db.collection("replicaset_mongo_client_collection").update({a:1}, {b:1}, {upsert:true}, function(err, result) {
      test.equal(null, err);
      test.equal(1, result);

      db.close();
      test.done();
    });
  });
}


/**
 * @ignore
 */
exports['Should correctly connect to a replicaset with readPreference set'] = function(configuration, test) {
  var mongo = configuration.getMongoPackage()
    MongoClient = mongo.MongoClient;

  var replMan = configuration.getReplicasetManager();

  // Create url
  var url = format("mongodb://%s,%s/%s?replicaSet=%s&readPreference=%s"
    , format("%s:%s", replMan.host, replMan.ports[0])
    , format("%s:%s", replMan.host, replMan.ports[1])
    , "integration_test_"
    , configuration.getReplicasetManager().name
    , "primary");

  MongoClient.connect(url, function(err, db) {
    db.collection("test_collection").insert({a:1}, function(err, result) {
      test.equal(null, err);

      db.close();
      test.done();
    });
  });
}

/**
 * @ignore
 */
exports['Should give an error for non-existing servers'] = function(configuration, test) {
  var mongo = configuration.getMongoPackage()
    MongoClient = mongo.MongoClient;

  var url = format("mongodb://%s,%s/%s?replicaSet=%s&readPreference=%s"
    , "nolocalhost:30000"
    , "nolocalhost:30001"
    , "integration_test_"
    , configuration.getReplicasetManager().name
    , "primary");

  MongoClient.connect(url, function(err, db) {
    test.ok(err != null);
    test.done();
  });
}

/**
 * @ignore
 */
exports['Should correctly connect to a replicaset with writeConcern specified and GridStore should inherit correctly'] = function(configuration, test) {
  var mongo = configuration.getMongoPackage()
    , MongoClient = mongo.MongoClient
    , GridStore = mongo.GridStore
    , ObjectID = mongo.ObjectID;

  var replMan = configuration.getReplicasetManager();

  // Create url
  var url = format("mongodb://%s,%s/%s?replicaSet=%s&w=%s&wtimeoutMS=5000"
    , format("%s:%s", replMan.host, replMan.ports[0])
    , format("%s:%s", replMan.host, replMan.ports[1])
    , "integration_test_"
    , configuration.getReplicasetManager().name
    , "majority");

  MongoClient.connect(url, function(err, db) {
    var gs = new GridStore(db, new ObjectID());
    test.equal('majority', gs.writeConcern.w);
    test.equal(5000, gs.writeConcern.wtimeout);
    db.close();
    test.done();
  });
}

