'use strict';
const { expect } = require('chai');
const { assert: test, setupDatabase } = require('../shared');

describe('Multiple Databases', function () {
  before(function () {
    return setupDatabase(this.configuration, ['integration_tests2']);
  });

  it('should be able to use the same connection for two different databases in a MongoClient', function (done) {
    const configuration = this.configuration;
    const client = configuration.newClient({ w: 1 }, { maxPoolSize: 1 });
    const second_test_database_client = configuration.newClient({ w: 1 }, { maxPoolSize: 1 });
    // Just create second database
    client.connect(function (err, client) {
      second_test_database_client.connect(function (err, second_test_database) {
        const db = client.db(configuration.db);
        // Close second database
        second_test_database.close();
        // Let's grab a connection to the different db resusing our connection pools
        const secondDb = client.db('integration_tests2');
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
  });
});
