var format = require('util').format;

/*******************************************************************
 *
 * Ordered
 *
 *******************************************************************/

/**
 * @ignore
 */
exports['Should fail due to w:5 and wtimeout:1 with ordered batch api'] = function(configuration, test) {
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

  // legacy tests
  var executeTests = function(_db, _callback) {
    // Get the collection
    var col = _db.collection('batch_write_ordered_ops_0');

    // Cleanup
    col.remove({}, function(err) {
      test.equal(null, err);

      // ensure index
      col.ensureIndex({a:1}, {unique:true}, function(err) {
        test.equal(null, err);

        // Initialize the Ordered Batch
        var batch = col.initializeOrderedBulkOp();
        batch.insert({a:1});
        batch.insert({a:2});

        // Execute the operations
        batch.execute({w:5, wtimeout:1}, function(err, result) {
          test.equal(2, result.nInserted);
          test.equal(0, result.nMatched);
          test.equal(0, result.nUpserted);
          test.equal(0, result.nRemoved);
          test.ok(result.nModified == null || result.nModified == 0);
          
          var writeConcernError = result.getWriteConcernError();
          test.ok(writeConcernError != null);
          test.ok(writeConcernError.code != null);
          test.ok(writeConcernError.errmsg != null);

          test.equal(0, result.getWriteErrorCount());

          // Callback
          _callback();          
        });
      });
    });    
  }

  MongoClient.connect(url, function(err, db) {
    executeTests(db, function() {
      // Finish up test
      db.close();
      test.done();
    });
  });
}

/**
 * @ignore
 */
exports['Should fail due to w:5 and wtimeout:1 combined with duplicate key errors with ordered batch api'] = function(configuration, test) {
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

  // legacy tests
  var executeTests = function(_db, _callback) {
    // Get the collection
    var col = _db.collection('batch_write_ordered_ops_1');

    // Cleanup
    col.remove({}, function(err) {
      test.equal(null, err);

      // ensure index
      col.ensureIndex({a:1}, {unique:true}, function(err) {
        test.equal(null, err);

        // Initialize the Ordered Batch
        var batch = col.initializeOrderedBulkOp();
        batch.insert({a:1});
        batch.find({a:3}).upsert().updateOne({a:3, b:1})
        batch.insert({a:1})
        batch.insert({a:2});

        // Execute the operations
        batch.execute({w:5, wtimeout:1}, function(err, result) {
          test.equal(1, result.nInserted);
          test.equal(0, result.nMatched);
          test.equal(1, result.nUpserted);
          test.equal(0, result.nRemoved);
          test.ok(result.nModified == null || result.nModified == 0);
          
          var writeConcernError = result.getWriteConcernError();
          test.ok(writeConcernError != null);
          test.ok(writeConcernError.code != null);
          test.ok(writeConcernError.errmsg != null);

          test.equal(1, result.getWriteErrorCount());

          // Individual error checking
          var error = result.getWriteErrorAt(0);
          test.equal(2, error.index);
          test.equal(11000, error.code);
          test.ok(error.errmsg != null);
          test.equal(1, error.getOperation().a);

          // Callback
          _callback();          
        });
      });
    });    
  }

  MongoClient.connect(url, function(err, db) {
    executeTests(db, function() {
      // Finish up test
      db.close();
      test.done();
    });
  });
}

/*******************************************************************
 *
 * Unordered
 *
 *******************************************************************/

/**
 * @ignore
 */
exports['Should fail due to w:5 and wtimeout:1 with unordered batch api'] = function(configuration, test) {
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

  // legacy tests
  var executeTests = function(_db, _callback) {
    // Get the collection
    var col = _db.collection('batch_write_unordered_ops_0');

    // Cleanup
    col.remove({}, function(err) {
      test.equal(null, err);

      // ensure index
      col.ensureIndex({a:1}, {unique:true}, function(err) {
        test.equal(null, err);

        // Initialize the Ordered Batch
        var batch = col.initializeUnorderedBulkOp();
        batch.insert({a:1});
        batch.find({a:3}).upsert().updateOne({a:3, b:1})
        batch.insert({a:2});

        // Execute the operations
        batch.execute({w:5, wtimeout:1}, function(err, result) {
          test.equal(2, result.nInserted);
          test.equal(0, result.nMatched);
          test.equal(1, result.nUpserted);
          test.equal(0, result.nRemoved);
          test.ok(result.nModified == null || result.nModified == 0);
          
          var writeConcernError = result.getWriteConcernError();
          test.ok(writeConcernError != null);
          test.ok(writeConcernError.code != null);
          test.ok(writeConcernError.errmsg != null);

          test.equal(0, result.getWriteErrorCount());

          // Callback
          _callback();          
        });
      });
    });    
  }

  MongoClient.connect(url, function(err, db) {
    executeTests(db, function() {
      // Finish up test
      db.close();
      test.done();
    });
  });
}

/**
 * @ignore
 */
exports['Should fail due to w:5 and wtimeout:1 combined with duplicate key errors with unordered batch api'] = function(configuration, test) {
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

  // legacy tests
  var executeTests = function(_db, _callback) {
    // Get the collection
    var col = _db.collection('batch_write_unordered_ops_1');

    // Cleanup
    col.remove({}, function(err) {
      test.equal(null, err);

      // ensure index
      col.ensureIndex({a:1}, {unique:true}, function(err) {
        test.equal(null, err);

        // Initialize the Ordered Batch
        var batch = col.initializeOrderedBulkOp();
        batch.insert({a:1});
        batch.find({a:3}).upsert().updateOne({a:3, b:1})
        batch.insert({a:1})
        batch.insert({a:2});

        // Execute the operations
        batch.execute({w:5, wtimeout:1}, function(err, result) {
          test.equal(1, result.nInserted);
          test.equal(0, result.nMatched);
          test.equal(1, result.nUpserted);
          test.equal(0, result.nRemoved);
          test.ok(result.nModified == null || result.nModified == 0);
          
          var writeConcernError = result.getWriteConcernError();
          test.ok(writeConcernError != null);
          test.ok(writeConcernError.code != null);
          test.ok(writeConcernError.errmsg != null);

          // Might or might not have a write error depending on
          // Unordered execution order
          test.ok(result.getWriteErrorCount() == 0 || result.getWriteErrorCount() == 1);
          
          // If we have an error it should be a duplicate key error
          if(result.getWriteErrorCount() == 1) {
            var error = result.getWriteErrorAt(0);
            test.ok(error.index == 0 || error.index == 2);
            test.equal(11000, error.code);
            test.ok(error.errmsg != null);
            test.equal(1, error.getOperation().a);            
          }

          // Callback
          _callback();          
        });
      });
    });    
  }

  MongoClient.connect(url, function(err, db) {
    executeTests(db, function() {
      // Finish up test
      db.close();
      test.done();
    });
  });
}
