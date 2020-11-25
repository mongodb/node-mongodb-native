'use strict';
var test = require('./shared').assert;
var setupDatabase = require('./shared').setupDatabase;
const { expect } = require('chai');

describe('Multiple Databases', function () {
  before(function () {
    return setupDatabase(this.configuration, ['integration_tests2']);
  });

  /**
   * Test the auto connect functionality of the db
   */
  it('shouldCorrectlyUseSameConnectionsForTwoDifferentDbs', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient({ w: 1 }, { maxPoolSize: 1 });
      var second_test_database_client = configuration.newClient({ w: 1 }, { maxPoolSize: 1 });
      // Just create second database
      client.connect(function (err, client) {
        second_test_database_client.connect(function (err, second_test_database) {
          var db = client.db(configuration.db);
          // Close second database
          second_test_database.close();
          // Let's grab a connection to the different db resusing our connection pools
          var secondDb = client.db('integration_tests2');
          secondDb.createCollection('same_connection_two_dbs', function (err, collection) {
            // Insert a dummy document
            collection.insert({ a: 20 }, { safe: true }, function (err) {
              expect(err).to.not.exist;

              // Query it
              collection.findOne({}, function (err, item) {
                test.equal(20, item.a);

                // Use the other db
                db.createCollection('same_connection_two_dbs', function (err, collection) {
                  expect(err).to.not.exist;

                  // Insert a dummy document
                  collection.insert({ b: 20 }, { safe: true }, function (err) {
                    expect(err).to.not.exist;

                    // Query it
                    collection.findOne({}, function (err, item) {
                      test.equal(20, item.b);

                      expect(err).to.not.exist;
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

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        expect(err).to.not.exist;
        var db_instance = client.db('site1');
        db_instance = client.db('site2');
        db_instance = client.db('rss');

        db_instance.collection('counters', function (err, collection) {
          expect(err).to.not.exist;
          collection.findAndModify({}, {}, { $inc: { db: 1 } }, { new: true }, function (err) {
            expect(err).to.not.exist;
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

    test: function (done) {
      var configuration = this.configuration;
      const client = configuration.newClient({}, { sslValidate: false });
      client.connect(function (err, client) {
        for (var i = 0; i < 100; i++) {
          client.db('test');
        }

        client.close(done);
      });
    }
  });
});
