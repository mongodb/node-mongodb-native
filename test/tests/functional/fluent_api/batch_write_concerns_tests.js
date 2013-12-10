/*******************************************************************
 *
 * Ordered
 *
 *******************************************************************/
exports['Should fail with journal write concern due to --nojournal'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  requires: {serverType: 'Server'},
  // requires: {mongodb: ">2.4.3"},
  
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

        // Finish up test
        db.close();
        test.done();
      });
    });
  }
}

exports['Should fail with w:2 and wtimeout write concern due single mongod instance'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  requires: {serverType: 'Server'},
  // requires: {mongodb: ">2.4.3"},
  
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
				test.ok(result.getErrorAt(0).errmsg.indexOf("no replication") != -1);
				test.equal(1, result.getErrorAt(0).getOperation().a);

        // Finish up test
        db.close();
        test.done();
      });
    });
  }
}

// exports['Should fail with journal write concern due to --nojournal legacy ops'] = {
//   // Add a tag that our runner can trigger on
//   // in this case we are setting that node needs to be higher than 0.10.X to run
//   requires: {serverType: 'Server'},
//   requires: {mongodb: ">2.4.3"},
  
//   // The actual test we wish to run
//   test: function(configuration, test) {
//     var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});
//     db.open(function(err, db) {
//       // Get the collection
//       var col = db.collection('batch_write_concerns_ops_2');
//       // Initialize the Ordered Batch
//       var batch = col.initializeOrderedBulkOp({useLegacyOps:true});
//       // Add some operations to be executed in order
// 			batch.insert({a:1});
// 			batch.insert({a:2});

//       // Execute the operations
//       batch.execute({j: true}, function(err, result) {
//         // Check state of result
// 				test.equal(2, result.n);
// 				test.equal(65, result.getSingleError().code);
// 				test.ok(typeof result.getSingleError().errmsg == 'string');
// 				test.equal(true, result.hasErrors());
// 				test.equal(2, result.getErrorCount());
// 				test.equal(2, result.getWCErrors().length);

// 				// Test errors for expected behavior
// 				test.equal(0, result.getErrorAt(0).index);
// 				test.equal(64, result.getErrorAt(0).code);
// 				test.ok(typeof result.getErrorAt(0).errmsg == 'string');
// 				test.equal(1, result.getErrorAt(0).getOperation().a);

//         // Finish up test
//         db.close();
//         test.done();
//       });
//     });
//   }
// }

// exports['Should fail with w:2 and wtimeout write concern due single mongod instance legacy ops'] = {
//   // Add a tag that our runner can trigger on
//   // in this case we are setting that node needs to be higher than 0.10.X to run
//   requires: {serverType: 'Server'},
//   requires: {mongodb: ">2.4.3"},
  
//   // The actual test we wish to run
//   test: function(configuration, test) {
//     var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});
//     db.open(function(err, db) {
//       // Get the collection
//       var col = db.collection('batch_write_concerns_ops_3');
//       // Initialize the Ordered Batch
//       var batch = col.initializeOrderedBulkOp({useLegacyOps:true});
//       // Add some operations to be executed in order
// 			batch.insert({a:1});
// 			batch.insert({a:2});

//       // Execute the operations
//       batch.execute({w:2, wtimeout:1000}, function(err, result) {
//         // Check state of result
// 				test.equal(2, result.n);
// 				test.equal(65, result.getSingleError().code);
// 				test.ok(typeof result.getSingleError().errmsg == 'string');
// 				test.equal(true, result.hasErrors());
// 				test.equal(2, result.getErrorCount());
// 				test.equal(2, result.getWCErrors().length);

// 				// Test errors for expected behavior
// 				test.equal(0, result.getErrorAt(0).index);
// 				test.equal(64, result.getErrorAt(0).code);
// 				test.ok(result.getErrorAt(0).errmsg.indexOf("no replication") != -1);
// 				test.equal(1, result.getErrorAt(0).getOperation().a);

//         // Finish up test
//         db.close();
//         test.done();
//       });
//     });
//   }
// }

/*******************************************************************
 *
 * Unordered
 *
 *******************************************************************/
// exports['Should fail unordered batch with journal write concern due to --nojournal'] = {
//   // Add a tag that our runner can trigger on
//   // in this case we are setting that node needs to be higher than 0.10.X to run
//   requires: {serverType: 'Server'},
//   requires: {mongodb: ">2.4.3"},
  
//   // The actual test we wish to run
//   test: function(configuration, test) {
//     var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});
//     db.open(function(err, db) {
//       // Get the collection
//       var col = db.collection('batch_write_concerns_ops_4');
//       // Initialize the Ordered Batch
//       var batch = col.initializeUnorderedBulkOp();
//       // Add some operations to be executed in order
//       batch.insert({a:1});
//       batch.find({a:3}).upsert().updateOne({a:3, b:1})
//       batch.insert({a:2});

//       // Execute the operations
//       batch.execute({j: true}, function(err, result) {
//         // Check state of result
//         test.equal(3, result.n);
//         test.equal(65, result.getSingleError().code);
//         test.ok(typeof result.getSingleError().errmsg == 'string');
//         test.equal(true, result.hasErrors());
//         test.equal(3, result.getErrorCount());
//         test.equal(3, result.getWCErrors().length);

//         // Go over all the errors
//         for(var i = 0; i < result.getErrorCount(); i++) {
//           var error = result.getErrorAt(i);

//           switch(error.index) {
//             case 0:
//               test.equal(0, error.index);
//               test.equal(64, error.code);
//               test.ok(typeof error.errmsg == 'string');
//               test.equal(1, error.getOperation().a);
//               break;
//             case 1:
//               test.equal(1, error.index);
//               test.equal(64, error.code);
//               test.ok(typeof error.errmsg == 'string');
//               test.equal(3, error.getOperation().q.a);
//               break;
//             case 2:
//               test.equal(2, error.index);
//               test.equal(64, error.code);
//               test.ok(typeof error.errmsg == 'string');
//               test.equal(2, error.getOperation().a);
//               break;
//             default:
//               test.ok(false);
//           }
//         }

//         // Finish up test
//         db.close();
//         test.done();
//       });
//     });
//   }
// }

exports['Should fail unordered batch with w:2 and wtimeout write concern due single mongod instance'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  requires: {serverType: 'Server'},
  // requires: {mongodb: ">2.4.3"},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});
    db.open(function(err, db) {
      // Get the collection
      var col = db.collection('batch_write_concerns_ops_5');
      // Initialize the Ordered Batch
      var batch = col.initializeUnorderedBulkOp();
      // Add some operations to be executed in order
      batch.insert({a:1});
      batch.find({a:3}).upsert().updateOne({a:3, b:1})
      batch.insert({a:2});

      // Execute the operations
      batch.execute({w:2, wtimeout:1000}, function(err, result) {
        // console.log("========================================================")
        // console.dir(result.getRawResponse())
        // Check state of result
        test.equal(3, result.n);
        test.equal(65, result.getSingleError().code);
        test.ok(typeof result.getSingleError().errmsg == 'string');
        test.equal(true, result.hasErrors());
        test.equal(3, result.getErrorCount());
        test.equal(3, result.getWCErrors().length);

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

        // Finish up test
        db.close();
        test.done();
      });
    });
  }
}

// exports['Should fail unordered batch with journal write concern due to --nojournal legacy ops'] = {
//   // Add a tag that our runner can trigger on
//   // in this case we are setting that node needs to be higher than 0.10.X to run
//   requires: {serverType: 'Server'},
//   requires: {mongodb: ">2.4.3"},
  
//   // The actual test we wish to run
//   test: function(configuration, test) {
//     var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});
//     db.open(function(err, db) {
//       // Get the collection
//       var col = db.collection('batch_write_concerns_ops_6');
//       // Initialize the Ordered Batch
//       var batch = col.initializeOrderedBulkOp({useLegacyOps:true});
//       // Add some operations to be executed in order
//       batch.insert({a:1});
//       batch.find({a:3}).upsert().updateOne({a:3, b:1})
//       batch.insert({a:2});

//       // Execute the operations
//       batch.execute({j: true}, function(err, result) {
//         // console.log("=========================================================")
//         // console.dir(result.getRawResponse())

//         // Check state of result
//         test.equal(3, result.n);
//         test.equal(65, result.getSingleError().code);
//         test.ok(typeof result.getSingleError().errmsg == 'string');
//         test.equal(true, result.hasErrors());
//         test.equal(3, result.getErrorCount());
//         test.equal(3, result.getWCErrors().length);

//         // Go over all the errors
//         for(var i = 0; i < result.getErrorCount(); i++) {
//           var error = result.getErrorAt(i);

//           switch(error.index) {
//             case 0:
//               test.equal(0, error.index);
//               test.equal(64, error.code);
//               test.ok(typeof error.errmsg == 'string');
//               test.equal(1, error.getOperation().a);
//               break;
//             case 1:
//               test.equal(1, error.index);
//               test.equal(64, error.code);
//               test.ok(typeof error.errmsg == 'string');
//               test.equal(3, error.getOperation().q.a);
//               break;
//             case 2:
//               test.equal(2, error.index);
//               test.equal(64, error.code);
//               test.ok(typeof error.errmsg == 'string');
//               test.equal(2, error.getOperation().a);
//               break;
//             default:
//               test.ok(false);
//           }
//         }

//         // Finish up test
//         db.close();
//         test.done();
//       });
//     });
//   }
// }

// exports['Should fail unordered batch with w:2 and wtimeout write concern due single mongod instance legacy ops'] = {
//   // Add a tag that our runner can trigger on
//   // in this case we are setting that node needs to be higher than 0.10.X to run
//   requires: {serverType: 'Server'},
//   requires: {mongodb: ">2.4.3"},
  
//   // The actual test we wish to run
//   test: function(configuration, test) {
//     var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});
//     db.open(function(err, db) {
//       // Get the collection
//       var col = db.collection('batch_write_concerns_ops_7');
//       // Initialize the Ordered Batch
//       var batch = col.initializeOrderedBulkOp({useLegacyOps:true});
//       // Add some operations to be executed in order
//       batch.insert({a:1});
//       batch.find({a:3}).upsert().updateOne({a:3, b:1})
//       batch.insert({a:2});

//       // Execute the operations
//       batch.execute({w:2, wtimeout:1000}, function(err, result) {
//         // Check state of result
//         test.equal(3, result.n);
//         test.equal(65, result.getSingleError().code);
//         test.ok(typeof result.getSingleError().errmsg == 'string');
//         test.equal(true, result.hasErrors());
//         test.equal(3, result.getErrorCount());
//         test.equal(3, result.getWCErrors().length);

//         // Go over all the errors
//         for(var i = 0; i < result.getErrorCount(); i++) {
//           var error = result.getErrorAt(i);

//           switch(error.index) {
//             case 0:
//               test.equal(0, error.index);
//               test.equal(64, error.code);
//               test.ok(typeof error.errmsg == 'string');
//               test.equal(1, error.getOperation().a);
//               break;
//             case 1:
//               test.equal(1, error.index);
//               test.equal(64, error.code);
//               test.ok(typeof error.errmsg == 'string');
//               test.equal(3, error.getOperation().q.a);
//               break;
//             case 2:
//               test.equal(2, error.index);
//               test.equal(64, error.code);
//               test.ok(typeof error.errmsg == 'string');
//               test.equal(2, error.getOperation().a);
//               break;
//             default:
//               test.ok(false);
//           }
//         }

//         // // Check state of result
//         // test.equal(2, result.n);
//         // test.equal(65, result.getSingleError().code);
//         // test.ok(typeof result.getSingleError().errmsg == 'string');
//         // test.equal(true, result.hasErrors());
//         // test.equal(2, result.getErrorCount());
//         // test.equal(2, result.getWCErrors().length);

//         // // Test errors for expected behavior
//         // test.equal(0, result.getErrorAt(0).index);
//         // test.equal(64, result.getErrorAt(0).code);
//         // test.ok(result.getErrorAt(0).errmsg.indexOf("no replication") != -1);
//         // test.equal(1, result.getErrorAt(0).getOperation().a);

//         // Finish up test
//         db.close();
//         test.done();
//       });
//     });
//   }
// }
