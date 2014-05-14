/**
 * @ignore
 */
exports['Should correctly execute insert using fullResult'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  requires: {mongodb: ">2.5.5"},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});

    // Establish connection to db
    db.open(function(err, db) {

      // Create a collection to hold our documents
      db.createCollection('test_full_result_1', function(err, collection) {

        // Insert a test document
        collection.insert({a:1}, {w:1, fullResult:true}, function(err, result) {
          test.equal(null, err);
          test.equal(true, result.ok);
          test.ok(result.lastOp != null);

          db.close();
          test.done();
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports['Should correctly execute multiple documents insert using fullResult'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  requires: {mongodb: ">2.5.5"},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});

    // Establish connection to db
    db.open(function(err, db) {

      // Create a collection to hold our documents
      db.createCollection('test_full_result_1', function(err, collection) {

        // Insert a test document
        collection.insert([{a:1}, {a:1}], {w:1, fullResult:true}, function(err, result) {
          test.equal(null, err);
          test.equal(true, result.ok);
          test.ok(result.lastOp != null);

          db.close();
          test.done();
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports['Should correctly execute update using fullResult'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  requires: {mongodb: ">2.5.5"},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});

    // Establish connection to db
    db.open(function(err, db) {

      // Create a collection to hold our documents
      db.createCollection('test_full_result_1', function(err, collection) {

        // Insert a test document
        collection.update({a:1}, {b:1}, {w:1, fullResult:true}, function(err, result) {
          test.equal(null, err);
          test.equal(true, result.ok);
          test.ok(result.lastOp != null);

          db.close();
          test.done();
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports['Should correctly execute remove using fullResult'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  requires: {mongodb: ">2.5.5"},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});

    // Establish connection to db
    db.open(function(err, db) {

      // Create a collection to hold our documents
      db.createCollection('test_full_result_1', function(err, collection) {

        // Insert a test document
        collection.update({a:1}, {b:1}, {w:1, fullResult:true}, function(err, result) {
          test.equal(null, err);
          test.equal(true, result.ok);
          test.ok(result.lastOp != null);

          db.close();
          test.done();
        });
      });
    });
  }
}