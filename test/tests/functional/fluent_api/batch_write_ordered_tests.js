/******************************************************************
 *
 * Write operations
 *
 ******************************************************************/
exports['Should correctly execute batch with no errors using write commands'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  requires: {serverType: 'Server'},
  // requires: {mongodb: ">2.5.3"},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});
    db.open(function(err, db) {
      // Get the collection
      var col = db.collection('batch_write_ordered_ops_0');
      // Initialize the Ordered Batch
      var batch = col.initializeOrderedBulkOp();

      // Add some operations to be executed in order
      batch.insert({a:1});
      batch.find({a:1}).updateOne({$set: {b:1}});
      batch.find({a:2}).upsert().updateOne({$set: {b:2}});
      batch.insert({a:3});
      batch.find({a:3}).remove({a:3});

      // Execute the operations
      batch.execute(function(err, result) {
        console.log("=============================================")
        console.dir(result.getRawResponse())
        // Check state of result
        test.equal(5, result.n);
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

exports['Should correctly handle single batch api write command error'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  requires: {serverType: 'Server'},
  // requires: {mongodb: ">2.5.3"},
  
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
          test.equal(1, result.n);
          test.equal(true, result.hasErrors());
          test.equal(1, result.getErrorCount());

          // Get the top level error
          var error = result.getSingleError();
          test.equal(65, error.code);
          test.ok(error.errmsg != null);

          // Get the first error
          var error = result.getErrorAt(0);
          test.equal(11000, error.code);
          test.ok(error.errmsg != null);

          // Get the operation that caused the error
          var op = error.getOperation();
          test.equal(2, op.q.b);
          test.equal(1, op.u['$set'].a);
          test.equal(false, op.multi);
          test.equal(true, op.upsert);

          // Get the first error
          var error = result.getErrorAt(1);
          test.equal(null, error);

          // Finish up test
          db.close();
          test.done();
        });
      });
    });
  }
}

exports['Should correctly handle multiple batch api write command error'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  requires: {serverType: 'Server'},
  // requires: {mongodb: ">2.5.3"},
  
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
          test.equal(1, result.n);
          test.equal(true, result.hasErrors());
          test.ok(1, result.getErrorCount());
          test.equal(65, result.getSingleError().code);

          // Individual error checking
          var error = result.getErrorAt(0);
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

exports['Should fail due to document being to big'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  requires: {serverType: 'Server'},
  // requires: {mongodb: ">2.5.3"},
  
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

exports['Should correctly split up messages into more batches'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  requires: {serverType: 'Server'},
  // requires: {mongodb: ">2.5.3"},
  
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
        test.equal(6, result.n);
        test.equal(false, result.hasErrors());

        // Finish up test
        db.close();
        test.done();
      });
    });
  }
}

/******************************************************************
 *
 * Legacy operations
 *
 ******************************************************************/
exports['Should correctly execute batch with no errors using legacy operations'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  requires: {serverType: 'Server'},
  // requires: {mongodb: ">2.5.3"},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});
    db.open(function(err, db) {
      // Get the collection
      var col = db.collection('batch_write_ordered_ops_legacy_0');
      // Initialize the Ordered Batch
      var batch = col.initializeOrderedBulkOp({useLegacyOps: true});

      // Add some operations to be executed in order
      batch.insert({a:1});
      batch.find({a:1}).updateOne({$set: {b:1}});
      batch.find({a:2}).upsert().updateOne({$set: {b:2}});
      batch.insert({a:3});
      batch.find({a:3}).remove({a:3});

      // Execute the operations
      batch.execute(function(err, result) {
        // console.log("=============================================")
        // console.dir(result.getRawResponse())
        // Check state of result
        test.equal(5, result.n);
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


// exports['Should Correctly Fail Ordered Batch Operation due to illegal Delete'] = {
//   // Add a tag that our runner can trigger on
//   // in this case we are setting that node needs to be higher than 0.10.X to run
//   requires: {serverType: 'Server'},
//   // requires: {mongodb: ">2.5.3"},
  
//   // The actual test we wish to run
//   test: function(configuration, test) {
//     var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});
//     db.open(function(err, db) {
//       // Get the collection
//       var col = db.collection('batch_write_ordered_ops_0');

//       // Add unique index on b field causing all updates to fail
//       col.ensureIndex({b:1}, {unique:true, sparse:false}, function(err, result) {
//         test.equal(err, null);

//         // Initialize the Ordered Batch
//         var batch = col.initializeOrderedBulkOp();

//         // Add some operations to be executed in order
//         batch.insert({a:1});
//         batch.find({a:1}).update({$set: {b: 1}});
//         batch.find({$set:{a:1}}).removeOne();
//         batch.insert({a:1});

//         // Execute the operations
//         batch.execute(function(err, result) {
//           test.equal(null, err);
//           test.equal(0, result.ok);
//           test.equal(2, result.n);
//           test.ok(typeof result.code == 'number');
//           test.ok(typeof result.errmsg == 'string');
//           test.equal(1, result.errDetails.length);
//           test.equal(2, result.errDetails[0].index);
//           test.ok(typeof result.errDetails[0].code == 'number');
//           test.ok(typeof result.errDetails[0].errmsg == 'string');
//           db.close();
//           test.done();
//         });
//       });
//     });
//   }
// }

// exports['Should Correctly Execute Ordered Batch of Write Operations with duplicate key errors on updates'] = {
//   // Add a tag that our runner can trigger on
//   // in this case we are setting that node needs to be higher than 0.10.X to run
//   requires: {serverType: 'Server'},
//   // requires: {mongodb: ">2.5.3"},
  
//   // The actual test we wish to run
//   test: function(configuration, test) {
//     var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});
//     db.open(function(err, db) {
//       // Get the collection
//       var col = db.collection('batch_write_ordered_ops_1');

//       // Add unique index on b field causing all updates to fail
//       col.ensureIndex({b:1}, {unique:true, sparse:false}, function(err, result) {
//         test.equal(err, null);

//         // Initialize the Ordered Batch
//         var batch = col.initializeOrderedBulkOp();

//         // Add some operations to be executed in order
//         batch.insert({a:1});
//         batch.find({a:1}).update({$set: {b: 1}});
//         batch.insert({b:1});
//         batch.find({a:1}).removeOne();
//         batch.insert({a:1, c:1})

//         // Execute the operations
//         batch.execute(function(err, result) {
//           test.equal(null, err);
//           test.equal(0, result.ok);
//           test.equal(2, result.n);
//           test.ok(typeof result.code == 'number');
//           test.ok(typeof result.errmsg == 'string');
//           test.equal(1, result.errDetails.length);
//           test.equal(2, result.errDetails[0].index);
//           test.equal(11000, result.errDetails[0].code);
//           test.ok(result.errDetails[0].errmsg.indexOf("E11000 duplicate key error index:") != -1);
//           db.close();
//           test.done();
//         });
//       });
//     });
//   }
// }

// exports['Should Correctly Execute Ordered Batch of Write Operations with upserts causing duplicate key errors on updates'] = {
//   // Add a tag that our runner can trigger on
//   // in this case we are setting that node needs to be higher than 0.10.X to run
//   requires: {serverType: 'Server'},
//   // requires: {mongodb: ">2.5.3"},
  
//   // The actual test we wish to run
//   test: function(configuration, test) {
//     var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});
//     db.open(function(err, db) {
//       // Get the collection
//       var col = db.collection('batch_write_ordered_ops_2');

//       // Add unique index on b field causing all updates to fail
//       col.ensureIndex({b:1}, {unique:true, sparse:false}, function(err, result) {
//         test.equal(err, null);

//         // Initialize the Ordered Batch
//         var batch = col.initializeOrderedBulkOp();

//         // Add some operations to be executed in order
//         batch.insert({a:1});
//         batch.find({a:1}).update({$set: {b: 1}});
//         batch.find({a:2}).upsert().update({$set: {b: 2}});
//         batch.insert({b:1});

//         // Execute the operations
//         batch.execute(function(err, result) {
//           test.equal(null, err);
//           test.equal(0, result.ok);
//           test.equal(3, result.n);
//           test.ok(typeof result.code == 'number');
//           test.ok(typeof result.errmsg == 'string');

//           test.equal(1, result.errDetails.length);
//           test.equal(3, result.errDetails[0].index);
//           test.equal(11000, result.errDetails[0].code);
//           test.ok(result.errDetails[0].errmsg.indexOf("E11000 duplicate key error index:") != -1);

//           test.equal(1, result.upserted.length);
//           test.equal(2, result.upserted[0].index);
//           test.ok(result.upserted[0]._id);

//           db.close();
//           test.done();
//         });
//       });
//     });
//   }
// }

// exports['Should Correctly Execute Ordered Batch of Write Operations with mixed multi upserts causing duplicate key errors on updates'] = {
//   // Add a tag that our runner can trigger on
//   // in this case we are setting that node needs to be higher than 0.10.X to run
//   requires: {serverType: 'Server'},
//   // requires: {mongodb: ">2.5.3"},
  
//   // The actual test we wish to run
//   test: function(configuration, test) {
//     var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});
//     db.open(function(err, db) {
//       // Get the collection
//       var col = db.collection('batch_write_ordered_ops_3');

//       // Add unique index on b field causing all updates to fail
//       col.ensureIndex({b:1}, {unique:true, sparse:false}, function(err, result) {
//         test.equal(err, null);

//         // Initialize the Ordered Batch
//         var batch = col.initializeOrderedBulkOp();

//         // Add some operations to be executed in order
//         batch.insert({a:1});
//         batch.find({a:1}).update({$set: {b: 1}});
//         batch.find({a:2}).upsert().update({$set: {b: 2}});
//         batch.find({a:3}).upsert().update({$set: {b: 3}});
//         batch.insert({c:5});
//         batch.insert({b:6});
//         batch.insert({b:1});

//         // Execute the operations
//         batch.execute(function(err, result) {
//           test.equal(null, err);
//           test.equal(0, result.ok);
//           test.equal(6, result.n);
//           test.equal(99999, result.code);
//           test.ok(result.errmsg.indexOf("batch op errors occurred") != -1);

//           test.equal(1, result.errDetails.length);
//           test.equal(6, result.errDetails[0].index);
//           test.ok(typeof result.errDetails[0].code == 'number');
//           test.ok(typeof result.errDetails[0].errmsg == 'string');

//           test.equal(2, result.upserted.length);
//           test.equal(2, result.upserted[0].index);
//           test.ok(result.upserted[0]._id);
//           test.equal(3, result.upserted[1].index);
//           test.ok(result.upserted[1]._id);

//           db.close();
//           test.done();
//         });
//       });
//     });
//   }
// }

// exports['Should Correctly perform update, updateOne and replaceOne ordered batch operations'] = {
//   // Add a tag that our runner can trigger on
//   // in this case we are setting that node needs to be higher than 0.10.X to run
//   requires: {serverType: 'Server'},
//   // requires: {mongodb: ">2.5.3"},
  
//   // The actual test we wish to run
//   test: function(configuration, test) {
//     var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});
//     db.open(function(err, db) {
//       test.equal(err, null);

//       // Get the collection
//       var col = db.collection('batch_write_ordered_ops_4');

//       // Initialize the unOrdered Batch
//       var batch = col.initializeOrderedBulkOp();
//       // Perform some inserts then exercise all the operations available
//       batch.insert([{a:1}, {a:1}, {a:2}, {a:3}]);
//       batch.execute(function(err, result) {
//         test.equal(null, err);
//         test.equal(1, result.ok);
//         test.equal(4, result.n);

//         // Update using updateOne, update and replaceOne
//         var batch = col.initializeOrderedBulkOp();
//         batch.find({a:1}).update({$set: {b:1}});
//         batch.find({a:2}).updateOne({$set: {b:2}});
//         batch.find({a:3}).replaceOne({a:3, b:3});

//         // Execute the batch
//         batch.execute(function(err, result) {
//           test.equal(null, err);
//           test.equal(1, result.ok);
//           test.equal(4, result.n);

//           // Get all the items and check for the validity
//           col.find({a:1, b:1}).count(function(err, c) {
//             test.equal(null, err);
//             test.equal(2, c);

//             col.find({a:2, b:2}).count(function(err, c) {
//               test.equal(null, err);
//               test.equal(1, c);

//               col.find({a:3, b:3}).count(function(err, c) {
//                 test.equal(null, err);
//                 test.equal(1, c);

//                 // Should fail
//                 try {
//                   batch.execute(function(err, result) {});
//                   test.ok(false);
//                 } catch(err) {}

//                 db.close();
//                 test.done();
//               });
//             });
//           });
//         });
//       });
//     });
//   }
// }

// exports['Should Correctly perform upsert with update, updateOne and replaceOne ordered batch operations'] = {
//   // Add a tag that our runner can trigger on
//   // in this case we are setting that node needs to be higher than 0.10.X to run
//   requires: {serverType: 'Server'},
//   // requires: {mongodb: ">2.5.3"},
  
//   // The actual test we wish to run
//   test: function(configuration, test) {
//     var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});
//     db.open(function(err, db) {
//       test.equal(err, null);

//       // Get the collection
//       var col = db.collection('batch_write_ordered_ops_5');

//       // Update using updateOne, update and replaceOne
//       var batch = col.initializeOrderedBulkOp();
//       batch.find({a:1}).upsert().update({$set: {b:1}});
//       batch.find({a:2}).upsert().updateOne({$set: {b:2}});
//       batch.find({a:3}).upsert().replaceOne({a:3, b:3});

//       // Execute the batch
//       batch.execute(function(err, result) {
//         test.equal(null, err);
//         test.equal(1, result.ok);

//         test.equal(3, result.upserted.length);
//         test.equal(0, result.upserted[0].index);
//         test.ok(result.upserted[0]._id != null);
//         test.equal(1, result.upserted[1].index);
//         test.ok(result.upserted[1]._id != null);
//         test.equal(2, result.upserted[2].index);
//         test.ok(result.upserted[2]._id != null);

//         // Get all the items and check for the validity
//         col.find({a:1, b:1}).count(function(err, c) {
//           test.equal(null, err);
//           test.equal(1, c);

//           col.find({a:2, b:2}).count(function(err, c) {
//             test.equal(null, err);
//             test.equal(1, c);

//             col.find({a:3, b:3}).count(function(err, c) {
//               test.equal(null, err);
//               test.equal(1, c);

//               db.close();
//               test.done();
//             });
//           });
//         });
//       });
//     });
//   }
// }
