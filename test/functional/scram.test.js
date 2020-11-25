'use strict';
var test = require('./shared').assert;
var setupDatabase = require('./shared').setupDatabase;
const { MongoClient } = require('../../src');
const { expect } = require('chai');

describe('SCRAM', function () {
  before(function () {
    return setupDatabase(this.configuration);
  });

  /**
   * rm -rf data; mkdir data; mongod --dbpath=./data --setParameter authenticationMechanisms=SCRAM-SHA-1 --auth
   */
  it('Should correctly authenticate against scram', {
    metadata: { requires: { topology: 'scram', mongodb: '>=3.2.0' } },

    test: function (done) {
      // User and password
      var user = 'test';
      var password = 'test';

      // Connect to the server
      MongoClient.connect('mongodb://localhost:27017/test', function (err, db) {
        expect(err).to.not.exist;

        // Create an admin user
        db.admin().addUser(user, password, function (err) {
          expect(err).to.not.exist;
          db.close();

          // Attempt to reconnect authenticating against the admin database
          MongoClient.connect(
            'mongodb://test:test@localhost:27017/test?authMechanism=SCRAM-SHA-1&authSource=admin&maxPoolSize=5',
            function (err, client) {
              expect(err).to.not.exist;

              db.collection('test').insert({ a: 1 }, function (err, r) {
                expect(err).to.not.exist;
                test.ok(r != null);

                // Wait for a reconnect to happen
                client.topology.once('reconnect', function () {
                  // Perform an insert after reconnect
                  db.collection('test').insert({ a: 1 }, function (err, r) {
                    expect(err).to.not.exist;
                    test.ok(r != null);

                    // Attempt to reconnect authenticating against the admin database
                    MongoClient.connect(
                      'mongodb://test:test@localhost:27017/test?authMechanism=SCRAM-SHA-1&authSource=admin&maxPoolSize=5',
                      function (err) {
                        expect(err).to.not.exist;

                        // Remove the user
                        db.admin().removeUser(user, function (err) {
                          expect(err).to.not.exist;

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
