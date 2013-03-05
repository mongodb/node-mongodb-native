exports['Should retrieve correct count after primary killed'] = function(configuration, test) {
  var db = configuration.db;

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
  var db = configuration.db;

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

