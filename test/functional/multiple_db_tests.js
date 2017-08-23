'use strict';

/**
 * @ignore
 */
exports.shouldCorrectlyEmitErrorOnAllDbsOnPoolClose = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: 'single' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    if (process.platform !== 'linux') {
      var client = configuration.newDbInstance({ w: 1 }, { poolSize: 1 });
      // All inserted docs
      var docs = [];
      var errs = [];
      var insertDocs = [];
      var numberOfCloses = 0;

      // Start server
      client.on('close', function(err) {
        numberOfCloses = numberOfCloses + 1;
      });

      client.connect(function(err, client) {
        var db = client.db(configuration.database);

        db.createCollection('shouldCorrectlyErrorOnAllDbs', function(err, collection) {
          test.equal(null, err);

          collection.insert({ a: 1 }, { w: 1 }, function(err, result) {
            test.equal(null, err);
            // Open a second db
            var db2 = client.db('tests_2');
            // Add a close handler
            db2.on('close', function(err) {
              // console.log("--- close 1")
              numberOfCloses = numberOfCloses + 1;
              test.equal(2, numberOfCloses);
            });

            // Open a second db
            var db3 = client.db('tests_3');
            // Add a close handler
            db3.on('close', function(err) {
              // console.log("--- close 2")
              numberOfCloses = numberOfCloses + 1;
              test.equal(3, numberOfCloses);
              test.done();
            });

            client.close();
          });
        });
      });
    } else {
      test.done();
    }
  }
};

/**
 * Test the auto connect functionality of the db
 *
 * @ignore
 */
exports.shouldCorrectlyUseSameConnectionsForTwoDifferentDbs = {
  metadata: {
    requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
  },

  // The actual test we wish to run
  test: function(configuration, test) {
    var client = configuration.newDbInstance({ w: 1 }, { poolSize: 1 });
    var second_test_database_client = configuration.newDbInstance({ w: 1 }, { poolSize: 1 });
    // Just create second database
    client.connect(function(err, client) {
      second_test_database_client.connect(function(err, second_test_database) {
        var db = client.db(configuration.database);
        // Close second database
        second_test_database.close();
        // Let's grab a connection to the different db resusing our connection pools
        var secondDb = client.db(configuration.db_name + '_2');
        secondDb.createCollection('shouldCorrectlyUseSameConnectionsForTwoDifferentDbs', function(
          err,
          collection
        ) {
          // Insert a dummy document
          collection.insert({ a: 20 }, { safe: true }, function(err, r) {
            test.equal(null, err);

            // Query it
            collection.findOne({}, function(err, item) {
              test.equal(20, item.a);

              // Use the other db
              db.createCollection('shouldCorrectlyUseSameConnectionsForTwoDifferentDbs', function(
                err,
                collection
              ) {
                // Insert a dummy document
                collection.insert({ b: 20 }, { safe: true }, function(err, r) {
                  test.equal(null, err);

                  // Query it
                  collection.findOne({}, function(err, item) {
                    test.equal(20, item.b);

                    test.equal(null, err);
                    client.close();
                    second_test_database.close();
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
};

/**
 * @ignore
 */
exports.shouldCorrectlyHandleMultipleDbsFindAndModifies = {
  metadata: {
    requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
  },

  // The actual test we wish to run
  test: function(configuration, test) {
    var client = configuration.newDbInstance(configuration.writeConcernMax(), { poolSize: 1 });
    client.connect(function(err, client) {
      var db_instance = client.db('site1');
      db_instance = client.db('site2');
      db_instance = client.db('rss');

      db_instance.collection('counters', function(err, collection) {
        collection.findAndModify({}, {}, { $inc: { db: 1 } }, { new: true }, function(
          error,
          counters
        ) {
          client.close();
          test.done();
        });
      });
    });
  }
};

/**
 * @ignore
 */
exports['should not leak listeners'] = {
  metadata: {
    requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
  },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    MongoClient.connect(configuration.url(), { server: { sslValidate: false } }, function(
      err,
      client
    ) {
      for (var i = 0; i < 100; i++) {
        client.db('test');
      }

      client.close();
      test.done();
    });
  }
};
