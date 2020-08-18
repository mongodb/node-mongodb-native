'use strict';
const { expect } = require('chai');
const { setupDatabase } = require('./shared');

describe('Remove', function () {
  before(function () {
    return setupDatabase(this.configuration);
  });

  it('should correctly clear out collection', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      const self = this;
      const client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function (err, client) {
        const db = client.db(self.configuration.db);
        expect(err).to.not.exist;

        db.createCollection('test_clear', function (err) {
          expect(err).to.not.exist;

          db.collection('test_clear', function (err, collection) {
            expect(err).to.not.exist;

            collection.insert({ i: 1 }, { w: 1 }, function (err) {
              expect(err).to.not.exist;

              collection.insert({ i: 2 }, { w: 1 }, function (err) {
                expect(err).to.not.exist;

                collection.count(function (err, count) {
                  expect(err).to.not.exist;
                  expect(count).to.equal(2);

                  // Clear the collection
                  collection.remove({}, { w: 1 }, function (err, r) {
                    expect(err).to.not.exist;
                    expect(r).property('deletedCount').to.equal(2);

                    collection.count(function (err, count) {
                      expect(err).to.not.exist;
                      expect(count).to.equal(0);

                      // Let's close the db
                      client.close(done);
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

  it('should correctly remove document using RegExp', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      const self = this;
      const client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function (err, client) {
        const db = client.db(self.configuration.db);
        expect(err).to.not.exist;

        db.createCollection('test_remove_regexp', function (err) {
          expect(err).to.not.exist;

          db.collection('test_remove_regexp', function (err, collection) {
            expect(err).to.not.exist;

            collection.insert({ address: '485 7th ave new york' }, { w: 1 }, function (err) {
              expect(err).to.not.exist;

              // Clear the collection
              collection.remove({ address: /485 7th ave/ }, { w: 1 }, function (err, r) {
                expect(r).property('deletedCount').to.equal(1);

                collection.count(function (err, count) {
                  expect(err).to.not.exist;
                  expect(count).to.equal(0);

                  // Let's close the db
                  client.close(done);
                });
              });
            });
          });
        });
      });
    }
  });

  it('should correctly remove only first document', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      const self = this;
      const client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function (err, client) {
        const db = client.db(self.configuration.db);
        expect(err).to.not.exist;

        db.createCollection('shouldCorrectlyRemoveOnlyFirstDocument', function (err) {
          expect(err).to.not.exist;

          db.collection('shouldCorrectlyRemoveOnlyFirstDocument', function (err, collection) {
            expect(err).to.not.exist;

            collection.insert([{ a: 1 }, { a: 1 }, { a: 1 }, { a: 1 }], { w: 1 }, function (err) {
              expect(err).to.not.exist;

              // Remove the first
              collection.remove({ a: 1 }, { w: 1, single: true }, function (err, r) {
                expect(r).property('deletedCount').to.equal(1);

                collection.find({ a: 1 }).count(function (err, result) {
                  expect(result).to.equal(3);
                  client.close(done);
                });
              });
            });
          });
        });
      });
    }
  });

  it('should not error on empty remove', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      const self = this;
      const client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        poolSize: 1
      });

      client.connect(function (err, client) {
        const db = client.db(self.configuration.db);
        expect(err).to.not.exist;
        const collection = db.collection('remove_test');

        collection.deleteMany({}).then(
          () => {
            client.close(done);
          },
          err => {
            client.close(err2 => done(err || err2));
          }
        );
      });
    }
  });
});
