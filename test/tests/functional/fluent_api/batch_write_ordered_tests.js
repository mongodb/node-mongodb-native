exports['Should Correctly Fail Ordered Batch Operation due to illegal Delete'] = {
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

      // Add unique index on b field causing all updates to fail
      col.ensureIndex({b:1}, {unique:true, sparse:false}, function(err, result) {
        test.equal(err, null);

        // Initialize the Ordered Batch
        var batch = col.initializeOrderedBulkOp();

        // Add some operations to be executed in order
        batch.insert({a:1});
        batch.find({a:1}).update({$set: {b: 1}});
        batch.find({$set:{a:1}}).removeOne();
        batch.insert({a:1});

        // Execute the operations
        batch.execute(function(err, result) {
          test.equal(null, err);
          test.equal(0, result.ok);
          test.equal(2, result.n);
          test.ok(typeof result.code == 'number');
          test.ok(typeof result.errmsg == 'string');
          test.equal(1, result.errDetails.length);
          test.equal(2, result.errDetails[0].index);
          test.equal(10068, result.errDetails[0].code);
          test.ok(typeof result.errDetails[0].errmsg == 'string');
          db.close();
          test.done();
        });
      });
    });
  }
}

exports['Should Correctly Execute Ordered Batch of Write Operations with duplicate key errors on updates'] = {
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
      col.ensureIndex({b:1}, {unique:true, sparse:false}, function(err, result) {
        test.equal(err, null);

        // Initialize the Ordered Batch
        var batch = col.initializeOrderedBulkOp();

        // Add some operations to be executed in order
        batch.insert({a:1});
        batch.find({a:1}).update({$set: {b: 1}});
        batch.insert({b:1});
        batch.find({a:1}).removeOne();
        batch.insert({a:1, c:1})

        // Execute the operations
        batch.execute(function(err, result) {
          test.equal(null, err);
          test.equal(0, result.ok);
          test.equal(2, result.n);
          test.ok(typeof result.code == 'number');
          test.ok(typeof result.errmsg == 'string');
          test.equal(1, result.errDetails.length);
          test.equal(2, result.errDetails[0].index);
          test.equal(11000, result.errDetails[0].code);
          test.ok(result.errDetails[0].errmsg.indexOf("E11000 duplicate key error index:") != -1);
          db.close();
          test.done();
        });
      });
    });
  }
}

exports['Should Correctly Execute Ordered Batch of Write Operations with upserts causing duplicate key errors on updates'] = {
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
      col.ensureIndex({b:1}, {unique:true, sparse:false}, function(err, result) {
        test.equal(err, null);

        // Initialize the Ordered Batch
        var batch = col.initializeOrderedBulkOp();

        // Add some operations to be executed in order
        batch.insert({a:1});
        batch.find({a:1}).update({$set: {b: 1}});
        batch.find({a:2}).upsert().update({$set: {b: 2}});
        batch.insert({b:1});

        // Execute the operations
        batch.execute(function(err, result) {
          test.equal(null, err);
          test.equal(0, result.ok);
          test.equal(3, result.n);
          test.ok(typeof result.code == 'number');
          test.ok(typeof result.errmsg == 'string');

          test.equal(1, result.errDetails.length);
          test.equal(3, result.errDetails[0].index);
          test.equal(11000, result.errDetails[0].code);
          test.ok(result.errDetails[0].errmsg.indexOf("E11000 duplicate key error index:") != -1);

          test.equal(1, result.upserted.length);
          test.equal(2, result.upserted[0].index);
          test.ok(result.upserted[0]._id);

          db.close();
          test.done();
        });
      });
    });
  }
}

exports['Should Correctly Execute Ordered Batch of Write Operations with mixed multi upserts causing duplicate key errors on updates'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  requires: {serverType: 'Server'},
  // requires: {mongodb: ">2.5.3"},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});
    db.open(function(err, db) {
      // Get the collection
      var col = db.collection('batch_write_ordered_ops_3');

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
        batch.insert({c:5});
        batch.insert({b:6});
        batch.insert({b:1});

        // Execute the operations
        batch.execute(function(err, result) {
          test.equal(null, err);
          test.equal(0, result.ok);
          test.equal(6, result.n);
          test.equal(99999, result.code);
          test.ok(result.errmsg.indexOf("batch op errors occurred") != -1);

          test.equal(1, result.errDetails.length);
          test.equal(6, result.errDetails[0].index);
          test.ok(typeof result.errDetails[0].code == 'number');
          test.ok(typeof result.errDetails[0].errmsg == 'string');

          test.equal(2, result.upserted.length);
          test.equal(2, result.upserted[0].index);
          test.ok(result.upserted[0]._id);
          test.equal(3, result.upserted[1].index);
          test.ok(result.upserted[1]._id);

          db.close();
          test.done();
        });
      });
    });
  }
}

exports['Should Correctly perform update, updateOne and replaceOne ordered batch operations'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  requires: {serverType: 'Server'},
  // requires: {mongodb: ">2.5.3"},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});
    db.open(function(err, db) {
      test.equal(err, null);

      // Get the collection
      var col = db.collection('batch_write_ordered_ops_4');

      // Initialize the unOrdered Batch
      var batch = col.initializeOrderedBulkOp();
      // Perform some inserts then exercise all the operations available
      batch.insert([{a:1}, {a:1}, {a:2}, {a:3}]);
      batch.execute(function(err, result) {
        test.equal(null, err);
        test.equal(1, result.ok);
        test.equal(4, result.n);

        // Update using updateOne, update and replaceOne
        var batch = col.initializeOrderedBulkOp();
        batch.find({a:1}).update({$set: {b:1}});
        batch.find({a:2}).updateOne({$set: {b:2}});
        batch.find({a:3}).replaceOne({a:3, b:3});

        // Execute the batch
        batch.execute(function(err, result) {
          test.equal(null, err);
          test.equal(1, result.ok);
          test.equal(4, result.n);

          // Get all the items and check for the validity
          col.find({a:1, b:1}).count(function(err, c) {
            test.equal(null, err);
            test.equal(2, c);

            col.find({a:2, b:2}).count(function(err, c) {
              test.equal(null, err);
              test.equal(1, c);

              col.find({a:3, b:3}).count(function(err, c) {
                test.equal(null, err);
                test.equal(1, c);

                db.close();
                test.done();
              });
            });
          });
        });
      });
    });
  }
}

exports['Should Correctly perform upsert with update, updateOne and replaceOne ordered batch operations'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  requires: {serverType: 'Server'},
  // requires: {mongodb: ">2.5.3"},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});
    db.open(function(err, db) {
      test.equal(err, null);

      // Get the collection
      var col = db.collection('batch_write_ordered_ops_5');

      // Update using updateOne, update and replaceOne
      var batch = col.initializeOrderedBulkOp();
      batch.find({a:1}).upsert().update({$set: {b:1}});
      batch.find({a:2}).upsert().updateOne({$set: {b:2}});
      batch.find({a:3}).upsert().replaceOne({a:3, b:3});

      // Execute the batch
      batch.execute(function(err, result) {
        test.equal(null, err);
        test.equal(1, result.ok);

        test.equal(3, result.upserted.length);
        test.equal(0, result.upserted[0].index);
        test.ok(result.upserted[0]._id != null);
        test.equal(1, result.upserted[1].index);
        test.ok(result.upserted[1]._id != null);
        test.equal(2, result.upserted[2].index);
        test.ok(result.upserted[2]._id != null);

        // Get all the items and check for the validity
        col.find({a:1, b:1}).count(function(err, c) {
          test.equal(null, err);
          test.equal(1, c);

          col.find({a:2, b:2}).count(function(err, c) {
            test.equal(null, err);
            test.equal(1, c);

            col.find({a:3, b:3}).count(function(err, c) {
              test.equal(null, err);
              test.equal(1, c);

              db.close();
              test.done();
            });
          });
        });
      });
    });
  }
}
