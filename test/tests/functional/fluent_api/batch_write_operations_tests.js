var fs = require('fs')
	, stream = require('stream');

exports['Should Correctly Execute Unordered Batch of Write Operations with duplicate key errors on updates'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  requires: {serverType: 'Server'},
  requires: {mongodb: ">2.5.3"},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:0}, {poolSize:1, auto_reconnect:false});
    db.open(function(err, db) {
      // Get the collection
      var col = db.collection('batch_write_ops_1');
      // Add unique index on b field causing all updates to fail
      col.ensureIndex({b:1}, {unique:true, sparse:true}, function(err, result) {
        test.equal(err, null);

        // Initialize the unOrdered Batch
        var batch = col.initializeBulkOp();
        // Perform some operations
        for(var i = 0; i < 2; i++) {
          batch.insert({a:i});
        }

        // Perform some operations
        for(var i = 0; i < 2; i++) {
          batch.find({a:i}).upsert().update({$set: {b: 10}});
        }

        // Remove a couple of operations
        for(var i = 0; i < 2; i++) {
          batch.find({a:i}).removeOne()
        }

        // Execute the batch
        batch.execute(function(err, result) {
          test.equal(err, null);
          test.equal(false, result.ok);
          test.equal(5, result.n);
          test.equal(0, result.upserted);
          test.equal(99999, result.errCode);
          test.equal('batch op errors occurred', result.errMessage);
          test.equal('', result.errmsg);
          test.equal(1, result.errDetails.length);
          test.equal(3, result.errDetails[0].index);
          test.equal(11000, result.errDetails[0].errCode);
          test.ok(result.errDetails[0].errMessage.indexOf('Update validation failed: DuplicateKey E11000 duplicate') != -1);
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
  requires: {mongodb: ">2.5.3"},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:0}, {poolSize:1, auto_reconnect:false});
    db.open(function(err, db) {
      // Get the collection
      var col = db.collection('batch_write_ops_2');

      // Add unique index on b field causing all updates to fail
      col.ensureIndex({b:1}, {unique:true, sparse:true}, function(err, result) {
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
          test.equal(false, result.ok);
          test.equal(4, result.n);
          test.equal(0, result.upserted);
          test.equal(11000, result.errCode);
          test.ok(result.errMessage.indexOf("E11000 duplicate key error index:") != -1);
          test.equal("", result.errmsg);
          test.equal(1, result.errDetails.length);
          test.equal(2, result.errDetails[0].index);
          test.equal(11000, result.errDetails[0].errCode);
          test.ok(result.errDetails[0].errMessage.indexOf("E11000 duplicate key error index:") != -1);
          db.close();
          test.done();
        });
      });
    });
  }
}


