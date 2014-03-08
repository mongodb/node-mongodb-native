/**
 * @ignore
 */
exports['insert with w=1 db level'] = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcern(), {poolSize:1});

    db.open(function(err, db) {
      db.collection('insert_with_w_1').update({a:1}, {a:1}, {upsert:true}, function(err, result) {
        test.equal(null, err);
        test.equal(1, result);
        test.done();
        db.close();
      });
    });
  }
}

/**
 * @ignore
 */
exports['insert with w=1 collection level'] = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcern(), {poolSize:1});

    db.open(function(err, db) {
      db.collection('insert_with_w_1', configuration.writeConcern()).update({a:1}, {a:1}, {upsert:true}, function(err, result) {
        test.equal(null, err);
        test.equal(1, result);
        test.done();
        db.close();
      });
    });
  }
}

/**
 * @ignore
 */
exports['insert with w=1 operation level'] = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcern(), {poolSize:1});

    db.open(function(err, db) {
      db.collection('insert_with_w_1').update({a:1}, {a:1}, {upsert:true, w:1}, function(err, result) {
        test.equal(null, err);
        test.equal(1, result);
        test.done();
        db.close();
      });
    });
  }
}

/**
 * @ignore
 */
exports['insert with journal db level'] = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({journal:true}, {poolSize:1});

    db.open(function(err, db) {
      db.collection('insert_with_w_1').update({a:1}, {a:1}, {upsert:true}, function(err, result) {
        test.ok(err != null);
        test.done();
        db.close();
      });
    });
  }
}

/**
 * @ignore
 */
exports['insert with journal collection level'] = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcern(), {poolSize:1});

    db.open(function(err, db) {
      db.collection('insert_with_w_1', {journal:true}).update({a:1}, {a:1}, {upsert:true}, function(err, result) {
        test.ok(err != null);
        test.done();
        db.close();
      });
    });
  }
}

/**
 * @ignore
 */
exports['insert with journal and w == 1 at db level'] = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1, wtimeout:1000}, {poolSize:1});

    db.open(function(err, db) {
      db.collection('insert_with_w_1').update({a:1}, {a:1}, {upsert:true}, function(err, result) {
        test.equal(null, err);
        test.equal(1, result);
        test.done();
        db.close();
      });
    });
  }
}

/**
 * @ignore
 */
exports['throw error when combining w:0 and journal'] = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:0, journal:true, wtimeout:1000}, {poolSize:1});

    db.open(function(err, db) {
      test.throws(function() { 
        db.collection('insert_with_w_1').update({a:1}, {a:1}, {upsert:true}, function(err, result) {
          test.equal(null, err);
          test.equal(1, result);
        });
      }, "No acknowlegement using w < 1 cannot be combined with journal:true or fsync:true");

      test.done();
      db.close();
    });
  }
}