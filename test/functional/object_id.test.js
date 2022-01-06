'use strict';
var test = require('./shared').assert;
const { expect } = require('chai');
var setupDatabase = require('./shared').setupDatabase;
const { ObjectId } = require('../../src');

describe('ObjectId', function () {
  before(function () {
    return setupDatabase(this.configuration);
  });

  it('shouldCorrectlyGenerateObjectId', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        var db = client.db(configuration.db);
        var number_of_tests_done = 0;

        var collection = db.collection('test_object_id_generation.data');
        // Insert test documents (creates collections and test fetch by query)
        collection.insert({ name: 'Fred', age: 42 }, { writeConcern: { w: 1 } }, function (err, r) {
          expect(r).property('insertedCount').to.equal(1);

          const id = r.insertedIds[0];
          expect(id.toHexString().length).to.equal(24);
          // Locate the first document inserted
          collection.findOne({ name: 'Fred' }, function (err, document) {
            expect(err).to.not.exist;
            expect(id.toHexString()).to.equal(document._id.toHexString());
            number_of_tests_done++;
          });
        });

        // Insert another test document and collect using ObjectId
        collection.insert({ name: 'Pat', age: 21 }, { writeConcern: { w: 1 } }, function (err, r) {
          expect(r).property('insertedCount').to.equal(1);

          const id = r.insertedIds[0];
          expect(id.toHexString().length).to.equal(24);

          // Locate the first document inserted
          collection.findOne(id, function (err, document) {
            expect(err).to.not.exist;
            expect(id.toHexString()).to.equal(document._id.toHexString());
            number_of_tests_done++;
          });
        });

        // Manually created id
        var objectId = new ObjectId(null);
        // Insert a manually created document with generated oid
        collection.insert(
          { _id: objectId, name: 'Donald', age: 95 },
          { writeConcern: { w: 1 } },
          function (err, r) {
            expect(err).to.not.exist;
            expect(r).property('insertedCount').to.equal(1);

            const id = r.insertedIds[0];
            expect(id.toHexString().length).to.equal(24);
            expect(id.toHexString()).to.equal(objectId.toHexString());

            // Locate the first document inserted
            collection.findOne(id, function (err, document) {
              expect(err).to.not.exist;
              expect(id.toHexString()).to.equal(document._id.toHexString());
              expect(objectId.toHexString()).to.equal(document._id.toHexString());
              number_of_tests_done++;
            });
          }
        );

        var intervalId = setInterval(function () {
          if (number_of_tests_done === 3) {
            clearInterval(intervalId);
            client.close(done);
          }
        }, 100);
      });
    }
  });

  it('shouldCorrectlyRetrieve24CharacterHexStringFromToString', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      // Create a new ObjectId
      var objectId = new ObjectId();
      // Verify that the hex string is 24 characters long
      test.equal(24, objectId.toString().length);
      done();
    }
  });

  it('shouldCorrectlyRetrieve24CharacterHexStringFromToJSON', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      // Create a new ObjectId
      var objectId = new ObjectId();
      // Verify that the hex string is 24 characters long
      test.equal(24, objectId.toJSON().length);
      done();
    }
  });

  it('shouldCorrectlyCreateOIDNotUsingObjectId', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        var db = client.db(configuration.db);
        var collection = db.collection('test_non_oid_id');
        var date = new Date();
        date.setUTCDate(12);
        date.setUTCFullYear(2009);
        date.setUTCMonth(11 - 1);
        date.setUTCHours(12);
        date.setUTCMinutes(0);
        date.setUTCSeconds(30);

        collection.insert({ _id: date }, { writeConcern: { w: 1 } }, function (err) {
          expect(err).to.not.exist;
          collection.find({ _id: date }).toArray(function (err, items) {
            test.equal('' + date, '' + items[0]._id);

            // Let's close the db
            client.close(done);
          });
        });
      });
    }
  });

  it('shouldCorrectlyGenerateObjectIdFromTimestamp', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var timestamp = Math.floor(new Date().getTime() / 1000);
      var objectID = new ObjectId(timestamp);
      var time2 = objectID.generationTime;
      test.equal(timestamp, time2);
      done();
    }
  });

  it('shouldCorrectlyCreateAnObjectIdAndOverrideTheTimestamp', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var timestamp = 1000;
      var objectID = new ObjectId();
      var id1 = objectID.id;
      // Override the timestamp
      objectID.generationTime = timestamp;
      var id2 = objectID.id;

      // Check the timestamp
      if (id1 instanceof Buffer && id2 instanceof Buffer) {
        test.deepEqual(id1.slice(0, 4), id2.slice(0, 4));
      } else {
        test.equal(id1.substr(4), id2.substr(4));
      }

      done();
    }
  });

  it('shouldCorrectlyInsertWithObjectId', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        expect(err).to.not.exist;

        var db = client.db(configuration.db);
        var collection = db.collection('shouldCorrectlyInsertWithObjectId');
        collection.insert({}, { writeConcern: { w: 1 } }, function (err) {
          expect(err).to.not.exist;
          const firstCompareDate = new Date();

          setTimeout(function () {
            collection.insert({}, { writeConcern: { w: 1 } }, function (err) {
              expect(err).to.not.exist;
              const secondCompareDate = new Date();

              collection.find().toArray(function (err, items) {
                expect(err).to.not.exist;

                // Date 1
                var date1 = new Date();
                date1.setTime(items[0]._id.generationTime * 1000);
                // Date 2
                var date2 = new Date();
                date2.setTime(items[1]._id.generationTime * 1000);

                // Compare
                test.equal(firstCompareDate.getFullYear(), date1.getFullYear());
                test.equal(firstCompareDate.getDate(), date1.getDate());
                test.equal(firstCompareDate.getMonth(), date1.getMonth());
                test.equal(firstCompareDate.getHours(), date1.getHours());

                test.equal(secondCompareDate.getFullYear(), date2.getFullYear());
                test.equal(secondCompareDate.getDate(), date2.getDate());
                test.equal(secondCompareDate.getMonth(), date2.getMonth());
                test.equal(secondCompareDate.getHours(), date2.getHours());
                // Let's close the db
                client.close(done);
              });
            });
          }, 2000);
        });
      });
    }
  });
});
