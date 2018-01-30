'use strict';
var test = require('./shared').assert;
var setupDatabsae = require('./shared').setupDatabase;

describe('Remove', function() {
  before(function() {
    return setupDatabsae(this.configuration);
  });

  /**
   * @ignore
   */
  it('should correctly clear out collection', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var self = this;
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function(err, client) {
        var db = client.db(self.configuration.db);
        test.equal(null, err);

        db.createCollection('test_clear', function(err) {
          test.equal(null, err);

          db.collection('test_clear', function(err, collection) {
            test.equal(null, err);

            collection.insert({ i: 1 }, { w: 1 }, function(err) {
              test.equal(null, err);

              collection.insert({ i: 2 }, { w: 1 }, function(err) {
                test.equal(null, err);

                collection.count(function(err, count) {
                  test.equal(null, err);
                  test.equal(2, count);
                  // Clear the collection
                  collection.remove({}, { w: 1 }, function(err, r) {
                    test.equal(null, err);
                    test.equal(2, r.result.n);

                    collection.count(function(err, count) {
                      test.equal(null, err);
                      test.equal(0, count);
                      // Let's close the db
                      client.close();
                      done();
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

  /**
   * @ignore
   */
  it('should correctly remove document using RegExp', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var self = this;
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function(err, client) {
        var db = client.db(self.configuration.db);
        test.equal(null, err);

        db.createCollection('test_remove_regexp', function(err) {
          test.equal(null, err);

          db.collection('test_remove_regexp', function(err, collection) {
            test.equal(null, err);

            collection.insert({ address: '485 7th ave new york' }, { w: 1 }, function(err) {
              test.equal(null, err);

              // Clear the collection
              collection.remove({ address: /485 7th ave/ }, { w: 1 }, function(err, r) {
                test.equal(1, r.result.n);

                collection.count(function(err, count) {
                  test.equal(0, count);
                  // Let's close the db
                  client.close();
                  done();
                });
              });
            });
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('should correctly remove only first document', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var self = this;
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function(err, client) {
        var db = client.db(self.configuration.db);
        test.equal(null, err);

        db.createCollection('shouldCorrectlyRemoveOnlyFirstDocument', function(err) {
          test.equal(null, err);

          db.collection('shouldCorrectlyRemoveOnlyFirstDocument', function(err, collection) {
            test.equal(null, err);

            collection.insert([{ a: 1 }, { a: 1 }, { a: 1 }, { a: 1 }], { w: 1 }, function(err) {
              test.equal(null, err);

              // Remove the first
              collection.remove({ a: 1 }, { w: 1, single: true }, function(err, r) {
                test.equal(1, r.result.n);

                collection.find({ a: 1 }).count(function(err, result) {
                  test.equal(3, result);
                  client.close();
                  done();
                });
              });
            });
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('should not error on empty remove', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var self = this;
      var client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function(err, client) {
        var db = client.db(self.configuration.db);
        test.equal(null, err);
        const collection = db.collection('remove_test');

        collection.remove().then(
          () => {
            client.close();
            done();
          },
          err => {
            client.close();
            done(err);
          }
        );
      });
    }
  });
});
