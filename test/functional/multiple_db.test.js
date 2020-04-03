'use strict';
var test = require('./shared').assert;
var setupDatabase = require('./shared').setupDatabase;

describe('Multiple Databases', function() {
  before(function() {
    return setupDatabase(this.configuration);
  });

  /**
   * Test the auto connect functionality of the db
   */
  it('shouldCorrectlyUseSameConnectionsForTwoDifferentDbs', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient({ w: 1 }, { poolSize: 1 });
      var second_test_database_client = configuration.newClient({ w: 1 }, { poolSize: 1 });
      // Just create second database
      client.connect(function(err, client) {
        second_test_database_client.connect(function(err, second_test_database) {
          var db = client.db(configuration.db);
          // Close second database
          second_test_database.close();
          // Let's grab a connection to the different db resusing our connection pools
          var secondDb = client.db(configuration.db_name + '_2');
          secondDb.createCollection('shouldCorrectlyUseSameConnectionsForTwoDifferentDbs', function(
            err,
            collection
          ) {
            // Insert a dummy document
            collection.insert({ a: 20 }, { safe: true }, function(err) {
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
                  collection.insert({ b: 20 }, { safe: true }, function(err) {
                    test.equal(null, err);

                    // Query it
                    collection.findOne({}, function(err, item) {
                      test.equal(20, item.b);

                      test.equal(null, err);
                      second_test_database.close(() => client.close(done));
                    });
                  });
                });
              });
            });
          });
        });
      });
    }
  });

  it('shouldCorrectlyHandleMultipleDbsFindAndModifies', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db_instance = client.db('site1');
        db_instance = client.db('site2');
        db_instance = client.db('rss');

        db_instance.collection('counters', function(err, collection) {
          collection.findAndModify({}, {}, { $inc: { db: 1 } }, { new: true }, function(err) {
            test.equal(null, err);
            client.close(done);
          });
        });
      });
    }
  });

  it('should not leak listeners', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function(done) {
      var configuration = this.configuration;
      const client = configuration.newClient({}, { sslValidate: false });
      client.connect(function(err, client) {
        for (var i = 0; i < 100; i++) {
          client.db('test');
        }

        client.close(done);
      });
    }
  });
});
