"use strict";

/**
 * @ignore
 */
exports.shouldCorrectlyClearOutCollection = {
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      test.equal(null, err);
  
      db.createCollection('test_clear', function(err, r) {
        test.equal(null, err);

        db.collection('test_clear', function(err, collection) {
          test.equal(null, err);

          collection.insert({i:1}, {w:1}, function(err, ids) {
            test.equal(null, err);
  
            collection.insert({i:2}, {w:1}, function(err, ids) {
              test.equal(null, err);
    
              collection.count(function(err, count) {
                test.equal(null, err);
                test.equal(2, count);
                // Clear the collection
                collection.remove({}, {w:1}, function(err, r) {
                  test.equal(null, err);
                  test.equal(2, r);
                  
                  collection.count(function(err, count) {
                    test.equal(null, err);
                    test.equal(0, count);
                    // Let's close the db
                    db.close();
                    test.done();
                  });
                });
              });
            });
          });
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyRemoveDocumentUsingRegExp = {
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      test.equal(null, err);

      db.createCollection('test_remove_regexp', function(err, r) {
        test.equal(null, err);

        db.collection('test_remove_regexp', function(err, collection) {
          test.equal(null, err);

          collection.insert({address:'485 7th ave new york'}, {w:1}, function(err, ids) {
            test.equal(null, err);

            // Clear the collection
            collection.remove({address:/485 7th ave/}, {w:1}, function(err, r) {
              test.equal(1, r);
              
              collection.count(function(err, count) {
                test.equal(0, count);
                // Let's close the db
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

/**
 * @ignore
 */
exports.shouldCorrectlyRemoveOnlyFirstDocument = {
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      test.equal(null, err);

      db.createCollection('shouldCorrectlyRemoveOnlyFirstDocument', function(err, r) {
        test.equal(null, err);

        db.collection('shouldCorrectlyRemoveOnlyFirstDocument', function(err, collection) {
          test.equal(null, err);

          collection.insert([{a:1}, {a:1}, {a:1}, {a:1}], {w:1}, function(err, result) {
            test.equal(null, err);
            
            // Remove the first
            collection.remove({a:1}, {w:1, single:true}, function(err, r) {
              test.equal(1, r);
              
              collection.find({a:1}).count(function(err, result) {
                test.equal(3, result);
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