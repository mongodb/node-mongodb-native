/*******************************************************************
 *
 * Ordered
 *
 *******************************************************************/
exports['Should fail with journal write concern due to --nojournal ordered'] = {
  metadata: {
    requires: {
      topology: "single"
    }
  },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcern(), {poolSize:1, auto_reconnect:false});
    db.open(function(err, db) {
      // Get the collection
      var col = db.collection('batch_write_concerns_ops_0');
      // Initialize the Ordered Batch
      var batch = col.initializeOrderedBulkOp();
      // Add some operations to be executed in order
			batch.insert({a:1});
			batch.insert({a:2});

      // Execute the operations
      batch.execute({j: true}, function(err, result) {
        test.ok(err != null);
        test.ok(err.code != null);
        test.ok(err.errmsg != null);

        // Finish up test
        db.close();
        test.done();
      });
    });
  }
}

exports['Should fail with w:2 and wtimeout write concern due single mongod instance ordered'] = {
  metadata: {
    requires: {
      topology: "single"
    }
  },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcern(), {poolSize:1, auto_reconnect:false});
    db.open(function(err, db) {
      // Get the collection
      var col = db.collection('batch_write_concerns_ops_1');
      // Initialize the Ordered Batch
      var batch = col.initializeOrderedBulkOp();
      // Add some operations to be executed in order
			batch.insert({a:1});
			batch.insert({a:2});

      // Execute the operations
      batch.execute({w:2, wtimeout:1000}, function(err, result) {
        test.ok(err != null);
        test.ok(err.code != null);
        test.ok(err.errmsg != null);

        // Finish up test
        db.close();
        test.done();
      });
    });
  }
}

/*******************************************************************
 *
 * Unordered
 *
 *******************************************************************/
exports['Should fail with journal write concern due to --nojournal unordered'] = {
  metadata: {
    requires: {
      topology: "single"
    }
  },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcern(), {poolSize:1, auto_reconnect:false});
    db.open(function(err, db) {
      // Get the collection
      var col = db.collection('batch_write_concerns_ops_0');
      // Initialize the Ordered Batch
      var batch = col.initializeUnorderedBulkOp();
      // Add some operations to be executed in order
      batch.insert({a:1});
      batch.insert({a:2});

      // Execute the operations
      batch.execute({j: true}, function(err, result) {
        test.ok(err != null);
        test.ok(err.code != null);
        test.ok(err.errmsg != null);

        // Finish up test
        db.close();
        test.done();
      });
    });
  }
}

exports['Should fail with w:2 and wtimeout write concern due single mongod instance unordered'] = {
  metadata: {
    requires: {
      topology: "single"
    }
  },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcern(), {poolSize:1, auto_reconnect:false});
    db.open(function(err, db) {
      // Get the collection
      var col = db.collection('batch_write_concerns_ops_1');
      // Initialize the Ordered Batch
      var batch = col.initializeUnorderedBulkOp();
      // Add some operations to be executed in order
      batch.insert({a:1});
      batch.insert({a:2});

      // Execute the operations
      batch.execute({w:2, wtimeout:1000}, function(err, result) {
        test.ok(err != null);
        test.ok(err.code != null);
        test.ok(err.errmsg != null);

        // Finish up test
        db.close();
        test.done();
      });
    });
  }
}