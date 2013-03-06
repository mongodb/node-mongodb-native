exports['Should retrieve correct count after primary killed'] = function(configuration, test) {
  var db = configuration.db();

  // Drop collection on replicaset
  db.dropCollection('testsets', function(err, r) {

    db.createCollection('testsets', function(err, collection) {
      test.equal(null, err);
      test.ok(collection != null);
  
      // Insert a dummy document
      collection.insert({a:20}, {safe: {w:2, wtimeout: 10000}}, function(err, r) {
        test.equal(null, err);
  
        // Execute a count
        collection.count(function(err, c) {
          test.equal(null, err);
          test.equal(1, c);
           
          // Close starting connection
          db.close();

          // Ensure replication happened in time
          setTimeout(function() {
            // Kill the primary
            configuration.killPrimary(function(node) {
              db.collection('testsets', function(err, collection) {
                test.equal(null, err);

                collection.insert({a:30}, {w:1}, function(err, r) {
                  test.equal(null, err);

                  collection.insert({a:40}, {w:1}, function(err, r) {
                    test.equal(null, err);

                    // Execute count
                    collection.count(function(err, c) {
                      test.equal(null, err);
                      test.equal(3, c);
                      test.done();
                    });
                  });
                });
              });
            });
          }, 2000);
        })
      })
    });
  });
}

exports['Should correctly throw timeout for replication to servers on inserts'] = function(configuration, test) {
  var db = configuration.db();

  // Drop collection on replicaset
  db.dropCollection('shouldCorrectlyThrowTimeoutForReplicationToServersOnInserts', function(err, r) {

    // Recreate collection on replicaset
    db.createCollection('shouldCorrectlyThrowTimeoutForReplicationToServersOnInserts', function(err, collection) {
      test.equal(null, err);

      // Insert a dummy document
      collection.insert({a:20}, {safe: {w:7, wtimeout: 10000}}, function(err, r) {
        test.equal('timeout', err.err);
        test.equal(true, err.wtimeout);
        test.done();
      });
    });
  });
}

exports['Should correctly execute safe findAndModify'] = function(configuration, test) {
  var db = configuration.db();

  // Drop collection on replicaset
  db.dropCollection('shouldCorrectlyExecuteSafeFindAndModify', function(err, r) {

    // Recreate collection on replicaset
    db.createCollection('shouldCorrectlyExecuteSafeFindAndModify', function(err, collection) {
      test.equal(null, err);

      // Insert a dummy document
      collection.insert({a:20}, {safe: {w:2, wtimeout: 10000}}, function(err, r) {
        test.equal(null, err);
  
        // Execute a safe insert with replication to two servers
        collection.findAndModify({'a':20}, [['a', 1]], {'$set':{'b':3}}, {new:true, safe: {w:2, wtimeout: 10000}}, function(err, result) {
          test.equal(20, result.a);
          test.equal(3, result.b);
          test.done();
        })
      });
    });
  });
}

exports['Should correctly insert after primary comes back up'] = function(configuration, test) {
  var db = configuration.db();
  // Drop collection on replicaset
  db.dropCollection('shouldCorrectlyInsertAfterPrimaryComesBackUp', function(err, r) {

    // Recreate collection on replicaset
    db.createCollection('shouldCorrectlyInsertAfterPrimaryComesBackUp', function(err, collection) {
      test.equal(null, err);

      // Insert a dummy document
      collection.insert({a:20}, {safe: {w:2, wtimeout: 10000}}, function(err, r) {
        test.equal(null, err);

        // Kill the primary
        configuration.killPrimary(9, {killNodeWaitTime:0}, function(node) {
          
          // Attempt insert (should fail)
          collection.insert({a:30}, {safe: {w:2, wtimeout: 10000}}, function(err, r) {
            // test.equal(null, err);

            if(err != null) {
              console.log("----------------------------------- 0")
              collection.insert({a:40}, {safe: {w:2, wtimeout: 10000}}, function(err, r) {
                // Peform a count
                collection.count(function(err, count) {
                  test.equal(2, count);
                  test.done();
                });
              });
            } else {
              console.log("----------------------------------- 1")
              collection.insert({a:40}, {safe: {w:2, wtimeout: 10000}}, function(err, r) {
                // Peform a count
                collection.count(function(err, count) {
                  test.equal(2, count);
                  test.done();
                });
              });
            }
          });
        });
      });
    });
  });
}



