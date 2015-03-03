"use strict";

exports['Should correctly handle ordered single batch api write command error'] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});
    db.open(function(err, db) {
      // Get the collection
      var col = db.collection('batch_write_ordered_ops_1');

      // Add unique index on b field causing all updates to fail
      col.ensureIndex({a:1}, {unique:true, sparse:false}, function(err, result) {
        test.equal(err, null);

        // Initialize the Ordered Batch
        var batch = col.initializeOrderedBulkOp();

        // Add some operations to be executed in order
        batch.insert({b:1, a:1});
        batch.find({b:2}).upsert().updateOne({$set: {a:1}});
        batch.insert({b:3, a:2});

        // Execute the operations
        batch.execute(function(err, result) {
          // Basic properties check
          test.equal(1, result.nInserted);
          test.equal(true, result.hasWriteErrors());
          test.equal(1, result.getWriteErrorCount());

          // Get the write error
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

exports['Should correctly handle ordered multiple batch api write command error'] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});
    db.open(function(err, db) {
      // Get the collection
      var col = db.collection('batch_write_ordered_ops_2');

      // Add unique index on b field causing all updates to fail
      col.ensureIndex({a:1}, {unique:true, sparse:false}, function(err, result) {
        test.equal(err, null);

        // Initialize the Ordered Batch
        var batch = col.initializeOrderedBulkOp();

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
          test.equal(1, result.nInserted);
          test.equal(true, result.hasWriteErrors());
          test.ok(1, result.getWriteErrorCount());

          // Individual error checking
          var error = result.getWriteErrorAt(0);
          test.equal(1, error.index);
          test.equal(11000, error.code);
          test.ok(error.errmsg != null);
          test.equal(2, error.getOperation().q.b);
          test.equal(1, error.getOperation().u['$set'].a);
          test.equal(false, error.getOperation().multi);
          test.equal(true, error.getOperation().upsert);

          // Finish up test
          db.close();
          test.done();
        });
      });
    });
  }
}

exports['Should fail due to ordered document being to big'] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});
    db.open(function(err, db) {
      // Get the collection
      var coll = db.collection('batch_write_ordered_ops_3');
      // Set up a giant string to blow through the max message size
      var hugeString = "";
      // Create it bigger than 16MB
      for(var i = 0; i < (1024 * 1100); i++) {
        hugeString = hugeString + "1234567890123456"
      }

      // Set up the batch
      var batch = coll.initializeOrderedBulkOp();
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

exports['Should correctly split up ordered messages into more batches'] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});
    db.open(function(err, db) {
      // Get the collection
      var coll = db.collection('batch_write_ordered_ops_4');

      // Set up a giant string to blow through the max message size
      var hugeString = "";
      // Create it bigger than 16MB
      for(var i = 0; i < (1024 * 256); i++) {
        hugeString = hugeString + "1234567890123456"
      }

      // Insert the string a couple of times, should force split into multiple batches
      var batch = coll.initializeOrderedBulkOp();
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

exports['Should Correctly Fail Ordered Batch Operation due to illegal Operations using write commands'] = {
  metadata: { requires: { mongodb: '>2.5.4', topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});
    db.open(function(err, db) {
      // Get the collection
      var col = db.collection('batch_write_ordered_ops_5');

      // Add unique index on b field causing all updates to fail
      col.ensureIndex({b:1}, {unique:true, sparse:false}, function(err, result) {
        test.equal(err, null);

        // Initialize the Ordered Batch
        var batch = col.initializeOrderedBulkOp();

        // Add illegal insert operation
        batch.insert({$set:{a:1}});

        // Execute the operations
        batch.execute(function(err, result) {
          // Test basic settings
          test.equal(0, result.nInserted);
          test.equal(true, result.hasWriteErrors());
          test.ok(1, result.getWriteErrorCount());

          // Individual error checking
          var error = result.getWriteErrorAt(0);
          test.equal(0, error.index);
          test.ok(typeof error.code == 'number');
          test.ok(error.errmsg != null);
          test.equal(1, error.getOperation()['$set'].a);

          // Initialize the Ordered Batch
          var batch = col.initializeOrderedBulkOp();
          // Add illegal remove
          batch.find({$set:{a:1}}).removeOne();
          // Execute the operations
          batch.execute(function(err, result) {
            // Test basic settings
            test.equal(0, result.nRemoved);
            test.equal(true, result.hasWriteErrors());
            test.ok(1, result.getWriteErrorCount());

            // Individual error checking
            var error = result.getWriteErrorAt(0);
            test.equal(0, error.index);
            test.ok(typeof error.code == 'number');
            test.ok(error.errmsg != null);
            test.equal(1, error.getOperation().q['$set'].a);

            // Initialize the Ordered Batch
            var batch = col.initializeOrderedBulkOp();
            // Add illegal update
            batch.find({a:{$set2:1}}).updateOne({c: {$set:{a:1}}});
            // Execute the operations
            batch.execute(function(err, result) {
              // Test basic settings
              test.equal(0, result.nMatched);
              test.ok(0 == result.nModified || result.nModified == null);
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

exports['Should Correctly Execute Ordered Batch of Write Operations with duplicate key errors on updates'] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});
    db.open(function(err, db) {
      // Get the collection
      var col = db.collection('batch_write_ordered_ops_6');

      // Add unique index on b field causing all updates to fail
      col.ensureIndex({b:1}, {unique:true, sparse:false}, function(err, result) {
        test.equal(err, null);

        // Initialize the Ordered Batch
        var batch = col.initializeOrderedBulkOp();

        // Add some operations to be executed in order
        batch.insert({a:1});
        batch.find({a:1}).update({$set: {b: 1}});
        batch.insert({b:1});

        // Execute the operations
        batch.execute(function(err, result) {
          // Test basic settings
          test.equal(1, result.nInserted);
          test.equal(1, result.nMatched);
          test.ok(1 == result.nModified || result.nModified == null);
          test.equal(true, result.hasWriteErrors());
          test.ok(1, result.getWriteErrorCount());

          // Individual error checking
          var error = result.getWriteErrorAt(0);
          test.equal(2, error.index);
          test.equal(11000, error.code);
          test.ok(error.errmsg != null);
          test.equal(1, error.getOperation().b);

          db.close();
          test.done();
        });
      });
    });
  }
}

exports['Should Correctly Execute Ordered Batch of Write Operations with upserts causing duplicate key errors on updates'] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});
    db.open(function(err, db) {
      // Get the collection
      var col = db.collection('batch_write_ordered_ops_7');

      // Add unique index on b field causing all updates to fail
      col.ensureIndex({b:1}, {unique:true, sparse:false}, function(err, result) {
        test.equal(err, null);

        // Initialize the Ordered Batch
        var batch = col.initializeOrderedBulkOp();

        // Add some operations to be executed in order
        batch.insert({a:1});
        batch.find({a:1}).update({$set: {b: 1}});
        batch.find({a:2}).upsert().update({$set: {b: 2}});
        batch.find({a:3}).upsert().update({$set: {b: 3}});
        batch.insert({b:1});

        // Execute the operations
        batch.execute(function(err, result) {
          // Test basic settings
          test.equal(1, result.nInserted);
          test.equal(2, result.nUpserted);
          test.equal(1, result.nMatched);
          test.ok(1 == result.nModified || result.nModified == null);
          test.equal(true, result.hasWriteErrors());
          test.ok(1, result.getWriteErrorCount());

          // Individual error checking
          var error = result.getWriteErrorAt(0);
          test.equal(4, error.index);
          test.equal(11000, error.code);
          test.ok(error.errmsg != null);
          test.equal(1, error.getOperation().b);

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

exports['Should correctly perform ordered upsert with custom _id'] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});
    db.open(function(err, db) {
      // Get the collection
      var col = db.collection('batch_write_ordered_ops_8');
      // Initialize the Ordered Batch
      var batch = col.initializeOrderedBulkOp();

      // Add some operations to be executed in order
      batch.find({_id:2}).upsert().updateOne({$set: {b:2}});

      // Execute the operations
      batch.execute(function(err, result) {
        // Check state of result
        test.equal(1, result.nUpserted);
        test.equal(0, result.nInserted);
        test.equal(0, result.nMatched);
        test.ok(0 == result.nModified || result.nModified == null);
        test.equal(0, result.nRemoved);
        
        var upserts = result.getUpsertedIds();
        test.equal(1, upserts.length);
        test.equal(0, upserts[0].index);
        test.equal(2, upserts[0]._id);

        // Finish up test
        db.close();
        test.done();
      });
    });
  }
}

exports['Should throw an error when no operations in ordered batch'] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});
    db.open(function(err, db) {
      // Get the collection
      var col = db.collection('batch_write_ordered_ops_8');
      var threw = false;

      try {
        // Initialize the Ordered Batch
        col.initializeOrderedBulkOp().execute(function(err, result) {});
      } catch(err) {
        threw = true;
      }

      test.equal(true, threw);
      db.close();
      test.done();        
    });
  }
}

exports['Should correctly execute ordered batch using w:0'] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});
    db.open(function(err, db) {
      // Get the collection
      var col = db.collection('batch_write_ordered_ops_9');
      var threw = false;

      var bulk = col.initializeOrderedBulkOp();
      for(var i = 0; i < 100; i++) {
        bulk.insert({a:1});
      }

      bulk.find({b:1}).upsert().update({b:1});
      bulk.find({c:1}).remove();

      bulk.execute({w:0}, function(err, result) {
        test.equal(null, err);
        // Check state of result
        test.equal(0, result.nUpserted);
        test.equal(0, result.nInserted);
        test.equal(0, result.nMatched);
        test.ok(0 == result.nModified || result.nModified == null);
        test.equal(0, result.nRemoved);
        test.equal(false, result.hasWriteErrors());

        db.close();
        test.done();        
      });
    });
  }
}

exports['Should correctly handle single unordered batch API'] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },
  
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
          test.equal(0, result.nMatched);
          test.ok(0 == result.nModified || result.nModified == null);
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
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },
  
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
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },
  
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
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },
  
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
  metadata: { requires: { mongodb: '>2.5.4', topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },
  
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
          test.equal(0, result.nMatched);
          test.equal(0, result.nUpserted);
          test.ok(0 == result.nModified || result.nModified == null);
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
            test.equal(0, result.nMatched);
            test.equal(0, result.nUpserted);
            test.ok(0 == result.nModified || result.nModified == null);
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
              test.equal(0, result.nMatched);
              test.equal(0, result.nUpserted);
              test.ok(0 == result.nModified || result.nModified == null);
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
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },
  
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
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },
  
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
          test.ok(0 == result.nModified || result.nModified == null);
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

exports['Should correctly perform unordered upsert with custom _id'] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});
    db.open(function(err, db) {
      // Get the collection
      var col = db.collection('batch_write_unordered_ops_legacy_8');
      // Initialize the Ordered Batch
      var batch = col.initializeUnorderedBulkOp();

      // Add some operations to be executed in order
      batch.find({_id:2}).upsert().updateOne({$set: {b:2}});

      // Execute the operations
      batch.execute(function(err, result) {
        // Check state of result
        test.equal(1, result.nUpserted);
        test.equal(0, result.nInserted);
        test.equal(0, result.nMatched);
        test.ok(0 == result.nModified || result.nModified == null);
        test.equal(0, result.nRemoved);
        
        var upserts = result.getUpsertedIds();
        test.equal(1, upserts.length);
        test.equal(0, upserts[0].index);
        test.equal(2, upserts[0]._id);

        // Finish up test
        db.close();
        test.done();
      });
    });
  }
}

exports['Should prohibit batch finds with no selector'] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});
    db.open(function(err, db) {
      // Get the collection
      var col = db.collection('batch_write_unordered_ops_legacy_9');

      var unorderedBatch = col.initializeUnorderedBulkOp();
      var orderedBatch = col.initializeOrderedBulkOp();

      try {
        unorderedBatch.find();
        test.ok(false);
      } catch(e) {
        test.equal("MongoError: Bulk find operation must specify a selector", e.toString());
      }

      try {
        orderedBatch.find();
        test.ok(false);
      } catch(e) {
        test.equal("MongoError: Bulk find operation must specify a selector", e.toString());
      }

      db.close();
      test.done();
    });
  }
}

exports['Should throw an error when no operations in unordered batch'] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});
    db.open(function(err, db) {
      // Get the collection
      var col = db.collection('batch_write_ordered_ops_8');
      var threw = false;

      try {
        // Initialize the Ordered Batch
        col.initializeUnorderedBulkOp().execute(function(err, result) {});
      } catch(err) {
        threw = true;
      }

      test.equal(true, threw);
      db.close();
      test.done();        
    });
  }
}

exports['Should correctly execute unordered batch using w:0'] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});
    db.open(function(err, db) {
      // Get the collection
      var col = db.collection('batch_write_ordered_ops_9');
      var threw = false;

      var bulk = col.initializeUnorderedBulkOp();
      for(var i = 0; i < 100; i++) {
        bulk.insert({a:1});
      }

      bulk.find({b:1}).upsert().update({b:1});
      bulk.find({c:1}).remove();

      bulk.execute({w:0}, function(err, result) {
        test.equal(null, err);
        // Check state of result
        test.equal(0, result.nUpserted);
        test.equal(0, result.nInserted);
        test.equal(0, result.nMatched);
        test.ok(0 == result.nModified || result.nModified == null);
        test.equal(0, result.nRemoved);
        test.equal(false, result.hasWriteErrors());

        db.close();
        test.done();        
      });
    });
  }
}

/*******************************************************************
 *
 * Ordered
 *
 *******************************************************************/
exports['Should fail with journal write concern due to --nojournal ordered'] = {
  metadata: { requires: { topology: 'single', mongodb: '>2.5.4' }},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});
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
  metadata: { requires: { topology: 'single', mongodb: '>2.5.4' }},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});
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
  metadata: { requires: { topology: 'single', mongodb: '>2.5.4' }},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});
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
  metadata: { requires: { topology: 'single', mongodb: '>2.5.4' }},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});
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

exports['should correctly split unordered bulk batch'] = {
  metadata: { requires: { topology: 'single', mongodb: '>2.5.4' }},

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});
    db.open(function(err, db) {
      var insertFirst = false;
      var batchSize = 1000;
      // Get the collection
      var collection = db.collection('batch_write_unordered_split_test');
      // Create an unordered bulk
      var operation = collection.initializeUnorderedBulkOp(),
          documents = [];

      for(var i = 0; i < 10000; i++) {
        var document = { name: 'bob' + i };
        documents.push(document);
        operation.insert(document);
      }

      operation.execute(function(err, result) {
        test.equal(null, err);

        operation = collection.initializeUnorderedBulkOp();

        if(insertFirst) {
          // if you add the inserts to the batch first, it works fine.
          insertDocuments();
          replaceDocuments();
        } else {
          // if you add the updates to the batch first, it fails with the error "insert must contain at least one document"
          replaceDocuments();
          insertDocuments();
        }

        operation.execute(function(err, result) {
          test.equal(null, err);
          
          db.close();
          test.done();
        });
      });

      function insertDocuments() {
        for(i = 10000; i < 10200; i++) {
          operation.insert({name: 'bob' + i});
        }
      }

      function replaceDocuments() {
        for(var i = 0; i < batchSize; i++) {
          operation.find({_id: documents[i]._id}).replaceOne({name: 'joe' + i});
        }
      }
    });
  }
}
