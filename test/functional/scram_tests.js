"use strict";

/**
 * rm -rf data; mkdir data; mongod --dbpath=./data --setParameter authenticationMechanisms=SCRAM-SHA-1 --auth
 * @ignore
 */
exports['Should correctly authenticate against scram'] = {
  metadata: { requires: { topology: 'scram', mongodb: '>=2.7.5' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var Db = configuration.require.Db
      , MongoClient = configuration.require.MongoClient
      , Server = configuration.require.Server;

    // User and password
    var user = 'test';
    var password = 'test';

    // Connect to the server
    MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
      test.equal(null, err);

      // Create an admin user
      db.admin().addUser(user, password, function(err, result) {
        test.equal(null, err);
        db.close();

        // Attempt to reconnect authenticating against the admin database
        MongoClient.connect('mongodb://test:test@localhost:27017/test?authMechanism=SCRAM-SHA-1&authSource=admin&maxPoolSize=5', function(err, db) {
          test.equal(null, err);

          db.collection('test').insert({a:1}, function(err, r) {
            test.equal(null, err);
            test.ok(r != null);

            // Wait for a reconnect to happen
            db.serverConfig.once('reconnect', function() {

              // Perform an insert after reconnect
              db.collection('test').insert({a:1}, function(err, r) {
                test.equal(null, err);
                test.ok(r != null);

                // Attempt to reconnect authenticating against the admin database
                MongoClient.connect('mongodb://test:test2@localhost:27017/test?authMechanism=SCRAM-SHA-1&authSource=admin&maxPoolSize=5', function(err, db2) {
                  test.ok(err != null);
                  test.equal(null, err);

                  // Remove the user
                  db.admin().removeUser(user, function(err, r) {
                    test.equal(null, err);

                    db.close();
                    test.done();
                  });
                });
              });
            });

            // Attempt disconnect again
            db.serverConfig.connections()[0].destroy();
          });
        });
      });
    });
  }
}
