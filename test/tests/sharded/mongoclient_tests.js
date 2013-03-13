/**
 * Example of a simple url connection string to a shard, with acknowledgement of writes.
 *
 * @_class mongoclient
 * @_function MongoClient.connect
 */
exports['Should connect to mongos proxies using connectiong string'] = function(configuration, test) {
  var MongoClient = configuration.getMongoPackage().MongoClient;

  // DOC_START
  MongoClient.connect('mongodb://localhost:50000,localhost:50001/sharded_test_db?w=1', function(err, db) {
    test.equal(null, err);
    test.ok(db != null);

    db.collection("replicaset_mongo_client_collection").update({a:1}, {b:1}, {upsert:true}, function(err, result) {
      test.equal(null, err);
      test.equal(1, result);

      db.close();
      test.done();
    });    
  });
  // DOC_END
}

/**
 * @ignore
 */
exports['Should connect to mongos proxies using connectiong string and options'] = function(configuration, test) {
  var MongoClient = configuration.getMongoPackage().MongoClient;

  MongoClient.connect('mongodb://localhost:50000,localhost:50001/sharded_test_db?w=1', {
    mongos: {
      haInterval: 500
    }
  }, function(err, db) {
    test.equal(null, err);
    test.ok(db != null);
    test.equal(500, db.serverConfig.mongosStatusCheckInterval);

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
exports['Should correctly connect with a missing mongos'] = function(configuration, test) {
  var MongoClient = configuration.getMongoPackage().MongoClient;

  MongoClient.connect('mongodb://localhost:50002,localhost:50000,localhost:50001/test', {}, function(err, db) {
    setTimeout(function() {
      test.equal(null, err);
      test.ok(db != null);
      db.close();
      test.done();
    }, 2000)
  });
}