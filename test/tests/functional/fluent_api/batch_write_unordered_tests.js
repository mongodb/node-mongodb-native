var fs = require('fs')
	, stream = require('stream');

/******************************************************************
 *
 * Write operations
 *
 ******************************************************************/
exports['Should correctly execute batch with no errors using write commands'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  requires: {serverType: 'Server'},
  requires: {mongodb: ">2.5.4"},
  
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

/******************************************************************
 *
 * Legacy operations
 *
 ******************************************************************/

// exports['Should Correctly Execute Unordered Batch of Write Operations with remove taking out existing writes'] = {
//   // Add a tag that our runner can trigger on
//   // in this case we are setting that node needs to be higher than 0.10.X to run
//   requires: {serverType: 'Server'},
//   // requires: {mongodb: ">2.5.3"},
  
//   // The actual test we wish to run
//   test: function(configuration, test) {
//     var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});
//     db.open(function(err, db) {
//       // Get the collection
//       var col = db.collection('batch_write_unordered_ops_0');
//       // Insert some records to allow for removal
//       col.insert([{d:1, e:1}, {d:2, e:1}], function(err, docs) {
//         test.equal(err, null);
  
//         // Add unique index on b field causing all updates to fail
//         col.ensureIndex({b:1}, {unique:true, sparse:true}, function(err, result) {
//           test.equal(err, null);

//           // Initialize the unOrdered Batch
//           var batch = col.initializeBulkOp();
//           // Perform some operations
//           for(var i = 0; i < 2; i++) {
//             batch.insert({a:i, b:10});
//           }

//           // Illegal remove
//           batch.find({e: 1}).remove();

//           // Perform some operations
//           for(var i = 0; i < 2; i++) {
//             batch.find({c:i}).upsert().update({$set: {b: 11}});
//           }

//           // Execute the batch
//           batch.execute(function(err, result) {
//             test.equal(err, null);
//             test.equal(99999, result.code);
//             test.equal('batch op errors occurred', result.errmsg);
//             test.equal(0, result.ok);
//             test.equal(4, result.n);
//             test.equal(2, result.errDetails.length);
            
//             test.equal(1, result.errDetails[0].index);
//             test.equal(11000, result.errDetails[0].code);
//             test.equal('string', typeof result.errDetails[0].errmsg);
            
//             test.equal(4, result.errDetails[1].index);
//             test.equal(11000, result.errDetails[1].code);
//             test.equal('string', typeof result.errDetails[1].errmsg);

//             test.equal(1, result.upserted.length);
//             test.equal(3, result.upserted[0].index);
//             test.ok(result.upserted[0]._id != null);

//             col.find({e:1}).toArray(function(err, docs) {
//               test.equal(null, err);
//               test.equal(0, docs.length);
//               db.close();
//               test.done();
//             });
//           });
//         });
//       });
//     });
//   }
// }

// exports['Should Correctly Execute Unordered Batch of Write Operations with duplicate key errors on updates bypassing the upsert issue'] = {
//   // Add a tag that our runner can trigger on
//   // in this case we are setting that node needs to be higher than 0.10.X to run
//   requires: {serverType: 'Server'},
//   // requires: {mongodb: ">2.5.3"},
  
//   // The actual test we wish to run
//   test: function(configuration, test) {
//     var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});
//     db.open(function(err, db) {
//       // Get the collection
//       var col = db.collection('batch_write_unordered_ops_1');
//       // Add unique index on b field causing all updates to fail
//       col.ensureIndex({b:1}, {unique:true, sparse:true}, function(err, result) {
//         test.equal(err, null);

//         // Initialize the unOrdered Batch
//         var batch = col.initializeBulkOp();
//         // Perform some operations
//         for(var i = 0; i < 2; i++) {
//           batch.insert({a:i, b:10});
//         }

//         // Perform some operations
//         for(var i = 0; i < 2; i++) {
//           batch.find({c:i}).upsert().update({$set: {b: 11}});
//         }

//         // Execute the batch
//         batch.execute(function(err, result) {
//           test.equal(err, null);
//           test.equal(99999, result.code);
//           test.equal('batch op errors occurred', result.errmsg);
//           test.equal(0, result.ok);
//           test.equal(2, result.n);
//           test.equal(2, result.errDetails.length);
          
//           test.equal(1, result.errDetails[0].index);
//           test.equal(11000, result.errDetails[0].code);
//           test.equal('string', typeof result.errDetails[0].errmsg);
          
//           test.equal(3, result.errDetails[1].index);
//           test.equal(11000, result.errDetails[1].code);
//           test.equal('string', typeof result.errDetails[1].errmsg);

//           test.equal(1, result.upserted.length);
//           test.equal(2, result.upserted[0].index);
//           test.ok(result.upserted[0]._id != null);

//           db.close();
//           test.done();
//         });
//       });
//     });
//   }
// }

// exports['Should Correctly perform update, updateOne and replaceOne unordered batch operations'] = {
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
//       var col = db.collection('batch_write_unordered_ops_2');

//       // Initialize the unOrdered Batch
//       var batch = col.initializeBulkOp();
//       // Perform some inserts then exercise all the operations available
//       batch.insert([{a:1}, {a:1}, {a:2}, {a:3}]);
//       batch.execute(function(err, result) {
//         test.equal(null, err);
//         test.equal(1, result.ok);
//         test.equal(4, result.n);

//         // Update using updateOne, update and replaceOne
//         var batch = col.initializeBulkOp();
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

// exports['Should Correctly perform upsert with update, updateOne and replaceOne unordered batch operations'] = {
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
//       var col = db.collection('batch_write_unordered_ops_3');

//       // Update using updateOne, update and replaceOne
//       var batch = col.initializeBulkOp();
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

//               // Should fail
//               try {
//                 batch.execute(function(err, result) {});
//                 test.ok(false);
//               } catch(err) {}

//               db.close();
//               test.done();
//             });
//           });
//         });
//       });
//     });
//   }
// }