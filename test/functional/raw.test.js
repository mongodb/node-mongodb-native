'use strict';
const { assert: test, setupDatabase } = require('./shared');
const { Buffer } = require('buffer');
const { expect } = require('chai');

const BSON = require('bson');

describe('Raw', function () {
  before(function () {
    return setupDatabase(this.configuration);
  });

  it('shouldCorrectlySaveDocumentsAndReturnAsRaw', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        var db = client.db(configuration.db);
        db.createCollection('shouldCorrectlySaveDocumentsAndReturnAsRaw', function (
          err,
          collection
        ) {
          expect(err).to.not.exist;
          // Insert some documents
          collection.insert(
            [{ a: 1 }, { b: 2000 }, { c: 2.3 }],
            { writeConcern: { w: 1 } },
            function (err) {
              expect(err).to.not.exist;
              // You have to pass at least query + fields before passing options
              collection.find({}, { raw: true, batchSize: 2 }).toArray(function (err, items) {
                var objects = [];

                for (var i = 0; i < items.length; i++) {
                  test.ok(Buffer.isBuffer(items[i]));
                  objects.push(BSON.deserialize(items[i]));
                }

                test.equal(1, objects[0].a);
                test.equal(2000, objects[1].b);
                test.equal(2.3, objects[2].c);

                // Execute findOne
                collection.findOne({ a: 1 }, { raw: true }, function (err, item) {
                  test.ok(Buffer.isBuffer(item));
                  var object = BSON.deserialize(item);
                  test.equal(1, object.a);
                  client.close(done);
                });
              });
            }
          );
        });
      });
    }
  });

  it('shouldCorrectlySaveDocumentsAndReturnAsRawWithRawSetAtCollectionLevel', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        var db = client.db(configuration.db);
        db.createCollection(
          'shouldCorrectlySaveDocumentsAndReturnAsRaw_2',
          { raw: true },
          function (err, collection) {
            // Insert some documents
            collection.insert(
              [{ a: 1 }, { b: 2000 }, { c: 2.3 }],
              { writeConcern: { w: 1 } },
              function (err) {
                expect(err).to.not.exist;

                collection.find({}, { batchSize: 2 }).toArray(function (err, items) {
                  var objects = [];
                  for (var i = 0; i < items.length; i++) {
                    test.ok(Buffer.isBuffer(items[i]));
                    objects.push(BSON.deserialize(items[i]));
                  }

                  test.equal(1, objects[0].a);
                  test.equal(2000, objects[1].b);
                  test.equal(2.3, objects[2].c);

                  // Execute findOne
                  collection.findOne({ a: 1 }, { raw: true }, function (err, item) {
                    test.ok(Buffer.isBuffer(item));
                    var object = BSON.deserialize(item);
                    test.equal(1, object.a);
                    client.close(done);
                  });
                });
              }
            );
          }
        );
      });
    }
  });
});
