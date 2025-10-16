import { expect } from 'chai';

import { type MongoClient } from '../../mongodb';

describe('Remove', function () {
  let client: MongoClient;

  beforeEach(async function () {
    client = this.configuration.newClient();
  });

  afterEach(async function () {
    await client.close();
  });

  it('should correctly clear out collection', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      const db = client.db();

      db.createCollection('test_clear', function (err) {
        expect(err).to.not.exist;

        const collection = db.collection('test_clear');

        collection.insert({ i: 1 }, { writeConcern: { w: 1 } }, function (err) {
          expect(err).to.not.exist;

          collection.insert({ i: 2 }, { writeConcern: { w: 1 } }, function (err) {
            expect(err).to.not.exist;

            collection.count(function (err, count) {
              expect(err).to.not.exist;
              expect(count).to.equal(2);

              // Clear the collection
              collection.deleteMany({}, { writeConcern: { w: 1 } }, function (err, r) {
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
    }
  });

  it('should correctly remove document using RegExp', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      const self = this;
      const client = self.configuration.newClient(self.configuration.writeConcernMax(), {
        maxPoolSize: 1
      });

      client.connect(function (err, client) {
        const db = client.db(self.configuration.db);
        expect(err).to.not.exist;

        db.createCollection('test_remove_regexp', function (err) {
          expect(err).to.not.exist;

          const collection = db.collection('test_remove_regexp');

          collection.insert(
            { address: '485 7th ave new york' },
            { writeConcern: { w: 1 } },
            function (err) {
              expect(err).to.not.exist;

              // Clear the collection
              collection.deleteMany(
                { address: /485 7th ave/ },
                { writeConcern: { w: 1 } },
                function (err, r) {
                  expect(r).property('deletedCount').to.equal(1);

                  collection.count(function (err, count) {
                    expect(err).to.not.exist;
                    expect(count).to.equal(0);

                    // Let's close the db
                    client.close(done);
                  });
                }
              );
            }
          );
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
        maxPoolSize: 1
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
