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
  var executeTests = function(_useLegacyOps, _db, _callback) {
    // Get the collection
    var col = _db.collection('batch_write_ordered_ops_0');

    // Cleanup
    col.remove({}, function(err) {
      test.equal(null, err);

      // ensure index
      col.ensureIndex({a:1}, {unique:true}, function(err) {
        test.equal(null, err);

        // Initialize the Ordered Batch
        var batch = col.initializeOrderedBulkOp({useLegacyOps:_useLegacyOps});
        batch.insert({a:1});
        batch.insert({a:2});

        // Execute the operations
        batch.execute({w:5, wtimeout:1}, function(err, result) {
          // Check state of result
          test.equal(2, result.n);
          test.equal(65, result.getSingleError().code);
          test.ok(typeof result.getSingleError().errmsg == 'string');
          test.equal(true, result.hasErrors());
          test.equal(2, result.getErrorCount());
          test.equal(2, result.getWCErrors().length);

          // Test errors for expected behavior
          test.equal(0, result.getErrorAt(0).index);
          test.equal(64, result.getErrorAt(0).code);
          test.ok(typeof result.getErrorAt(0).errmsg == 'string');
          test.equal(1, result.getErrorAt(0).getOperation().a);

          // Callback
          _callback();
        });
      });
    });    
  }


  MongoClient.connect(url, function(err, db) {
    executeTests(false, db, function() {
      executeTests(true, db, function() {
        // Finish up test
        db.close();
        test.done();
      });
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
  var executeTests = function(_useLegacyOps, _db, _callback) {
    // Get the collection
    var col = _db.collection('batch_write_ordered_ops_1');

    // Cleanup
    col.remove({}, function(err) {
      test.equal(null, err);

      // ensure index
      col.ensureIndex({a:1}, {unique:true}, function(err) {
        test.equal(null, err);

        // Initialize the Ordered Batch
        var batch = col.initializeOrderedBulkOp({useLegacyOps:_useLegacyOps});
        batch.insert({a:1});
        batch.find({a:3}).upsert().updateOne({a:3, b:1})
        batch.insert({a:1})
        batch.insert({a:2});

        // Execute the operations
        batch.execute({w:5, wtimeout:1}, function(err, result) {
          // Check state of result
          test.equal(2, result.n);
          test.equal(65, result.getSingleError().code);
          test.ok(typeof result.getSingleError().errmsg == 'string');
          test.equal(true, result.hasErrors());
          test.equal(3, result.getErrorCount());
          test.equal(2, result.getWCErrors().length);

          // Test errors for expected behavior
          test.equal(0, result.getErrorAt(0).index);
          test.equal(64, result.getErrorAt(0).code);
          test.ok(typeof result.getErrorAt(0).errmsg == 'string');
          test.equal(1, result.getErrorAt(0).getOperation().a);

          test.equal(1, result.getErrorAt(1).index);
          test.equal(64, result.getErrorAt(1).code);
          test.ok(typeof result.getErrorAt(1).errmsg == 'string');
          test.equal(3, result.getErrorAt(1).getOperation().q.a);

          test.equal(2, result.getErrorAt(2).index);
          test.equal(11000, result.getErrorAt(2).code);
          test.ok(typeof result.getErrorAt(2).errmsg == 'string');
          test.equal(1, result.getErrorAt(2).getOperation().a);

          var upserts = result.getUpsertedIds();
          test.equal(1, upserts.length);
          test.equal(1, upserts[0].index);
          test.ok(upserts[0]._id != null);

          // Callback
          _callback();
        });
      });
    });    
  }


  MongoClient.connect(url, function(err, db) {
    executeTests(false, db, function() {
      executeTests(true, db, function() {
        // Finish up test
        db.close();
        test.done();
      });
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
  var executeTests = function(_useLegacyOps, _db, _callback) {
    // Get the collection
    var col = _db.collection('batch_write_unordered_ops_0');

    // Cleanup
    col.remove({}, function(err) {
      test.equal(null, err);

      // ensure index
      col.ensureIndex({a:1}, {unique:true}, function(err) {
        test.equal(null, err);

        // Initialize the Ordered Batch
        var batch = col.initializeUnorderedBulkOp({useLegacyOps:_useLegacyOps});
        batch.insert({a:1});
        batch.find({a:3}).upsert().updateOne({a:3, b:1})
        batch.insert({a:2});

        // Execute the operations
        batch.execute({w:5, wtimeout:1}, function(err, result) {
          // Go over all the errors
          for(var i = 0; i < result.getErrorCount(); i++) {
            var error = result.getErrorAt(i);

            switch(error.index) {
              case 0:
                test.equal(0, error.index);
                test.equal(64, error.code);
                test.ok(typeof error.errmsg == 'string');
                test.equal(1, error.getOperation().a);
                break;
              case 1:
                test.equal(1, error.index);
                test.equal(64, error.code);
                test.ok(typeof error.errmsg == 'string');
                test.equal(3, error.getOperation().q.a);
                break;
              case 2:
                test.equal(2, error.index);
                test.equal(64, error.code);
                test.ok(typeof error.errmsg == 'string');
                test.equal(2, error.getOperation().a);
                break;
              default:
                test.ok(false);
            }
          }

          // Callback
          _callback();
        });
      });
    });    
  }


  MongoClient.connect(url, function(err, db) {
    executeTests(false, db, function() {
      executeTests(true, db, function() {
        // Finish up test
        db.close();
        test.done();
      });
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
  var executeTests = function(_useLegacyOps, _db, _callback) {
    // Get the collection
    var col = _db.collection('batch_write_unordered_ops_1');

    // Cleanup
    col.remove({}, function(err) {
      test.equal(null, err);

      // ensure index
      col.ensureIndex({a:1}, {unique:true}, function(err) {
        test.equal(null, err);

        // Initialize the Ordered Batch
        var batch = col.initializeOrderedBulkOp({useLegacyOps:_useLegacyOps});
        batch.insert({a:1});
        batch.find({a:3}).upsert().updateOne({a:3, b:1})
        batch.insert({a:1})
        batch.insert({a:2});

        // Execute the operations
        batch.execute({w:5, wtimeout:1}, function(err, result) {
          // Check state of result
          test.equal(2, result.n);
          test.equal(65, result.getSingleError().code);
          test.ok(typeof result.getSingleError().errmsg == 'string');
          test.equal(true, result.hasErrors());
          test.equal(3, result.getErrorCount());
          test.equal(2, result.getWCErrors().length);

          // Go over all the errors
          for(var i = 0; i < result.getErrorCount(); i++) {
            var error = result.getErrorAt(i);

            switch(error.index) {
              case 0:
                test.equal(0, error.index);
                test.equal(64, error.code);
                test.ok(typeof error.errmsg == 'string');
                test.equal(1, error.getOperation().a);
                break;
              case 1:
                test.equal(1, error.index);
                test.equal(64, error.code);
                test.ok(typeof error.errmsg == 'string');
                test.equal(3, error.getOperation().q.a);
                break;
              case 2:
                test.equal(2, error.index);
                test.equal(11000, error.code);
                test.ok(typeof error.errmsg == 'string');
                test.equal(1, error.getOperation().a);
                break;
              default:
                test.ok(false);
            }
          }

          var upserts = result.getUpsertedIds();
          test.equal(1, upserts.length);
          test.equal(1, upserts[0].index);
          test.ok(upserts[0]._id != null);

          // Callback
          _callback();
        });
      });
    });    
  }


  MongoClient.connect(url, function(err, db) {
    executeTests(false, db, function() {
      executeTests(true, db, function() {
        // Finish up test
        db.close();
        test.done();
      });
    });
  });
}
