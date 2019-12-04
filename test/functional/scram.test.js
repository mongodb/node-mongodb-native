'use strict';
var test = require('./shared').assert;
var setupDatabase = require('./shared').setupDatabase;

describe('SCRAM', function() {
  before(function() {
    return setupDatabase(this.configuration);
  });

  /**
   * rm -rf data; mkdir data; mongod --dbpath=./data --setParameter authenticationMechanisms=SCRAM-SHA-1 --auth
   * @ignore
   */
  it('Should correctly authenticate against scram', {
    metadata: { requires: { topology: 'scram', mongodb: '>=3.2.0' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var MongoClient = configuration.require.MongoClient;

      // User and password
      var user = 'test';
      var password = 'test';

      // Connect to the server
      MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
        test.equal(null, err);

        // Create an admin user
        db.admin().addUser(user, password, function(err) {
          test.equal(null, err);
          db.close();

          // Attempt to reconnect authenticating against the admin database
          MongoClient.connect(
            'mongodb://test:test@localhost:27017/test?authMechanism=SCRAM-SHA-1&authSource=admin&maxPoolSize=5',
            function(err, client) {
              test.equal(null, err);

              db.collection('test').insert({ a: 1 }, function(err, r) {
                test.equal(null, err);
                test.ok(r != null);

                // Wait for a reconnect to happen
                client.topology.once('reconnect', function() {
                  // Perform an insert after reconnect
                  db.collection('test').insert({ a: 1 }, function(err, r) {
                    test.equal(null, err);
                    test.ok(r != null);

                    // Attempt to reconnect authenticating against the admin database
                    MongoClient.connect(
                      'mongodb://test:test@localhost:27017/test?authMechanism=SCRAM-SHA-1&authSource=admin&maxPoolSize=5',
                      function(err) {
                        test.equal(null, err);

                        // Remove the user
                        db.admin().removeUser(user, function(err) {
                          test.equal(null, err);

                          db.close();
                          done();
                        });
                      }
                    );
                  });
                });

                // Attempt disconnect again
                client.topology.connections()[0].destroy();
              });
            }
          );
        });
      });
    }
  });
});
