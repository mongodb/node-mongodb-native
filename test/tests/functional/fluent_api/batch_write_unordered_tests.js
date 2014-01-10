/******************************************************************
 *
 * Write operations
 *
 ******************************************************************/
exports['Should correctly execute unordered batch with no errors'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  requires: {serverType: 'Server'},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});
    db.open(function(err, db) {
      // Get the collection
      var col = db.collection('batch_write_unordered_ops_legacy_0');
      // Initialize the unordered Batch
      var batch = col.initializeUnorderedBulkOp({useLegacyOps: true});

      // Add some operations to be executed in order
      batch.insert({a:1});
      batch.find({a:1}).updateOne({$set: {b:1}});
      batch.find({a:2}).upsert().updateOne({$set: {b:2}});
      batch.insert({a:3});
      batch.find({a:3}).remove({a:3});

      // Execute the operations
      batch.execute(function(err, result) {
        // Check state of result
        test.equal(2, result.nInserted);
        test.equal(1, result.nUpserted);
        test.equal(1, result.nUpdated);
        test.equal(1, result.nModified);
        test.equal(1, result.nRemoved);

        var upserts = result.getUpsertedIds();
        test.equal(1, upserts.length);
        test.equal(2, upserts[0].index);
        test.ok(upserts[0]._id != null);
        
        var upsert = result.getUpsertedIdAt(0);
        test.equal(2, upsert.index);
        test.ok(upsert._id != null);

        // Finish up test
        db.close();
        test.done();
      });
    });
  }
}

exports['Should correctly handle single unordered batch API'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  requires: {serverType: 'Server'},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});
    db.open(function(err, db) {
      // Get the collection
      var col = db.collection('batch_write_unordered_ops_legacy_1');

      // Add unique index on b field causing all updates to fail
      col.ensureIndex({a:1}, {unique:true, sparse:false}, function(err, result) {
        test.equal(err, null);

        // Initialize the unordered Batch
        var batch = col.initializeUnorderedBulkOp({useLegacyOps: true});

        // Add some operations to be executed in order
        batch.insert({b:1, a:1});
        batch.find({b:2}).upsert().updateOne({$set: {a:1}});
        batch.insert({b:3, a:2});

        // Execute the operations
        batch.execute(function(err, result) {
          // Basic properties check
          test.equal(2, result.nInserted);
          test.equal(0, result.nUpserted);
          test.equal(0, result.nUpdated);
          test.equal(0, result.nModified);
          test.equal(true, result.hasWriteErrors());
          test.equal(1, result.getWriteErrorCount());

          // Get the first error
          var error = result.getWriteErrorAt(0);
          test.equal(11000, error.code);
          test.ok(error.errmsg != null);

          // Get the operation that caused the error
          var op = error.getOperation();
          test.equal(2, op.q.b);
          test.equal(1, op.u['$set'].a);
          test.equal(false, op.multi);
          test.equal(true, op.upsert);

          // Get the first error
          var error = result.getWriteErrorAt(1);
          test.equal(null, error);

          // Finish up test
          db.close();
          test.done();
        });
      });
    });
  }
}

exports['Should correctly handle multiple unordered batch API'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  requires: {serverType: 'Server'},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});
    db.open(function(err, db) {
      // Get the collection
      var col = db.collection('batch_write_unordered_ops_legacy_2');

      // Add unique index on b field causing all updates to fail
      col.ensureIndex({a:1}, {unique:true, sparse:false}, function(err, result) {
        test.equal(err, null);

        // Initialize the unordered Batch
        var batch = col.initializeUnorderedBulkOp({useLegacyOps: true});

        // Add some operations to be executed in order
        batch.insert({b:1, a:1});
        batch.find({b:2}).upsert().updateOne({$set: {a:1}});
        batch.find({b:3}).upsert().updateOne({$set: {a:2}});
        batch.find({b:2}).upsert().updateOne({$set: {a:1}});
        batch.insert({b:4, a:3});
        batch.insert({b:5, a:1});

        // Execute the operations
        batch.execute(function(err, result) {
          // Basic properties check
          test.equal(2, result.nInserted);
          test.equal(true, result.hasWriteErrors());
          test.ok(3, result.getWriteErrorCount());

          // Go over all the errors
          for(var i = 0; i < result.getWriteErrorCount(); i++) {
            var error = result.getWriteErrorAt(i);

            switch(error.index) {
              case 1:
                test.equal(11000, error.code);
                test.ok(error.errmsg != null);
                test.equal(2, error.getOperation().q.b);
                test.equal(1, error.getOperation().u['$set'].a);
                test.equal(false, error.getOperation().multi);
                test.equal(true, error.getOperation().upsert);              
                break;
              case 3:
                test.equal(11000, error.code);
                test.ok(error.errmsg != null);
                test.equal(2, error.getOperation().q.b);
                test.equal(1, error.getOperation().u['$set'].a);
                test.equal(false, error.getOperation().multi);
                test.equal(true, error.getOperation().upsert);
                break;
              case 2:              
                test.equal(11000, error.code);
                test.ok(error.errmsg != null);
                test.equal(5, error.getOperation().b);
                test.equal(1, error.getOperation().a);
                break
              case 5:
                test.equal(11000, error.code);
                test.ok(error.errmsg != null);
                test.equal(5, error.getOperation().b);
                test.equal(1, error.getOperation().a);
                break
              default:
                test.ok(false);
            }
          }

          // Finish up test
          db.close();
          test.done();
        });
      });
    });
  }
}

exports['Should fail due to document being to big for unordered batch'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  requires: {serverType: 'Server'},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});
    db.open(function(err, db) {
      // Get the collection
      var coll = db.collection('batch_write_unordered_ops_legacy_3');
      // Set up a giant string to blow through the max message size
      var hugeString = "";
      // Create it bigger than 16MB
      for(var i = 0; i < (1024 * 1100); i++) {
        hugeString = hugeString + "1234567890123456"
      }

      // Set up the batch
      var batch = coll.initializeUnorderedBulkOp();
      batch.insert({b:1, a:1});
      // Should fail on insert due to string being to big
      try {
        batch.insert({string: hugeString});
        test.ok(false);
      } catch(err) {}

      // Finish up test
      db.close();
      test.done();
    });
  }
}

exports['Should correctly split up messages into more batches for unordered batches'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  requires: {serverType: 'Server'},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});
    db.open(function(err, db) {
      // Get the collection
      var coll = db.collection('batch_write_unordered_ops_legacy_4');

      // Set up a giant string to blow through the max message size
      var hugeString = "";
      // Create it bigger than 16MB
      for(var i = 0; i < (1024 * 256); i++) {
        hugeString = hugeString + "1234567890123456"
      }

      // Insert the string a couple of times, should force split into multiple batches
      var batch = coll.initializeUnorderedBulkOp();
      batch.insert({a:1, b: hugeString});
      batch.insert({a:2, b: hugeString});
      batch.insert({a:3, b: hugeString});
      batch.insert({a:4, b: hugeString});
      batch.insert({a:5, b: hugeString});
      batch.insert({a:6, b: hugeString});

      // Execute the operations
      batch.execute(function(err, result) {
        // Basic properties check
        test.equal(6, result.nInserted);
        test.equal(false, result.hasWriteErrors());

        // Finish up test
        db.close();
        test.done();
      });
    });
  }
}

exports['Should Correctly Fail Unordered Batch Operation due to illegal Operations'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  requires: {serverType: 'Server'},
  requires: {mongodb: ">2.5.4"},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});
    db.open(function(err, db) {
      // Get the collection
      var col = db.collection('batch_write_unordered_ops_legacy_5');

      // Add unique index on b field causing all updates to fail
      col.ensureIndex({b:1}, {unique:true, sparse:false}, function(err, result) {
        test.equal(err, null);

        // Initialize the unordered Batch
        var batch = col.initializeUnorderedBulkOp();

        // Add illegal insert operation
        batch.insert({$set:{a:1}});

        // Execute the operations
        batch.execute(function(err, result) {
          // Test basic settings
          test.equal(0, result.nInserted);
          test.equal(0, result.nUpdated);
          test.equal(0, result.nUpserted);
          test.equal(0, result.nModified);
          test.equal(true, result.hasWriteErrors());
          test.ok(1, result.getWriteErrorCount());

          // Individual error checking
          var error = result.getWriteErrorAt(0);
          test.equal(0, error.index);
          test.ok(typeof error.code == 'number');
          test.ok(error.errmsg != null);
          test.equal(1, error.getOperation()['$set'].a);

          // Initialize the unordered Batch
          var batch = col.initializeUnorderedBulkOp();
          // Add illegal remove
          batch.find({$set:{a:1}}).removeOne();
          // Execute the operations
          batch.execute(function(err, result) {            
            // Test basic settings
            test.equal(0, result.nInserted);
            test.equal(0, result.nUpdated);
            test.equal(0, result.nUpserted);
            test.equal(0, result.nModified);
            test.equal(true, result.hasWriteErrors());
            test.ok(1, result.getWriteErrorCount());

            // Individual error checking
            var error = result.getWriteErrorAt(0);
            test.equal(0, error.index);
            test.ok(typeof error.code == 'number');
            test.ok(error.errmsg != null);
            test.equal(1, error.getOperation().q['$set'].a);

            // Initialize the unordered Batch
            var batch = col.initializeUnorderedBulkOp();
            // Add illegal update
            batch.find({$set:{a:1}}).updateOne({c: {$set:{a:1}}});
            // Execute the operations
            batch.execute(function(err, result) {
              test.equal(0, result.nInserted);
              test.equal(0, result.nUpdated);
              test.equal(0, result.nUpserted);
              test.equal(0, result.nModified);
              test.equal(true, result.hasWriteErrors());
              test.ok(1, result.getWriteErrorCount());

              // Individual error checking
              var error = result.getWriteErrorAt(0);
              test.equal(0, error.index);
              test.ok(typeof error.code == 'number');
              test.ok(error.errmsg != null);
              test.equal(1, error.getOperation().u.c['$set'].a);

              db.close();
              test.done();
            });
          });
        });
      });
    });
  }
}

exports['Should Correctly Execute Unordered Batch with duplicate key errors on updates'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  requires: {serverType: 'Server'},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});
    db.open(function(err, db) {
      // Get the collection
      var col = db.collection('batch_write_unordered_ops_legacy_6');

      // Add unique index on b field causing all updates to fail
      col.ensureIndex({b:1}, {unique:true, sparse:false}, function(err, result) {
        test.equal(err, null);

        // Initialize the unordered Batch
        var batch = col.initializeUnorderedBulkOp();

        // Add some operations to be executed in order
        batch.insert({a:1});
        batch.find({a:1}).update({$set: {b: 1}});
        batch.insert({b:1});

        // Execute the operations
        batch.execute(function(err, result) {
          // Test basic settings
          test.equal(2, result.nInserted);
          test.equal(true, result.hasWriteErrors());
          test.ok(1, result.getWriteErrorCount());

          // Individual error checking
          var error = result.getWriteErrorAt(0);
          test.equal(1, error.index);
          test.ok(error.code == 11000 || error.code == 11001);
          test.ok(error.errmsg != null);
          test.equal(1, error.getOperation().u['$set'].b);

          db.close();
          test.done();
        });
      });
    });
  }
}

exports['Should Correctly Execute Unordered Batch of with upserts causing duplicate key errors on updates'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  requires: {serverType: 'Server'},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});
    db.open(function(err, db) {
      // Get the collection
      var col = db.collection('batch_write_unordered_ops_legacy_7');

      // Add unique index on b field causing all updates to fail
      col.ensureIndex({b:1}, {unique:true, sparse:false}, function(err, result) {
        test.equal(err, null);

        // Initialize the unordered Batch
        var batch = col.initializeUnorderedBulkOp();

        // Add some operations to be executed in order
        batch.insert({a:1});
        batch.find({a:1}).update({$set: {b: 1}});
        batch.find({a:2}).upsert().update({$set: {b: 2}});
        batch.find({a:3}).upsert().update({$set: {b: 3}});
        batch.insert({b:1});

        // Execute the operations
        batch.execute(function(err, result) {
          // Test basic settings
          test.equal(2, result.nInserted);
          test.equal(2, result.nUpserted);
          test.equal(0, result.nModified);
          test.equal(0, result.nRemoved);
          test.equal(true, result.hasWriteErrors());
          test.ok(1, result.getWriteErrorCount());

          // Individual error checking
          var error = result.getWriteErrorAt(0);
          test.equal(1, error.index);
          test.ok(error.code == 11000 || error.code == 11001);
          test.ok(error.errmsg != null);
          test.equal(1, error.getOperation().u['$set'].b);

          // Check for upserted values
          var ids = result.getUpsertedIds();
          test.equal(2, ids.length);
          test.equal(2, ids[0].index);
          test.ok(ids[0]._id != null);
          test.equal(3, ids[1].index);
          test.ok(ids[1]._id != null);

          db.close();
          test.done();
        });
      });
    });
  }
}
