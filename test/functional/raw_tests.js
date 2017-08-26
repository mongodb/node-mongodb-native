'use strict';
var test = require('./shared').assert;
var setupDatabase = require('./shared').setupDatabase;
var Buffer = require('buffer').Buffer;

var BSON = require('mongodb-core').BSON;
var bson = new BSON([
  BSON.Binary,
  BSON.Code,
  BSON.DBRef,
  BSON.Decimal128,
  BSON.Double,
  BSON.Int32,
  BSON.Long,
  BSON.Map,
  BSON.MaxKey,
  BSON.MinKey,
  BSON.ObjectId,
  BSON.BSONRegExp,
  BSON.Symbol,
  BSON.Timestamp
]);

describe('Raw', function() {
  before(function() {
    return setupDatabase(this.configuration);
  });

  /**
   * @ignore
   */
  it('shouldCorrectlySaveDocumentsAndReturnAsRaw', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        db.createCollection('shouldCorrectlySaveDocumentsAndReturnAsRaw', function(
          err,
          collection
        ) {
          test.equal(null, err);
          // Insert some documents
          collection.insert([{ a: 1 }, { b: 2000 }, { c: 2.3 }], { w: 1 }, function(err) {
            test.equal(null, err);
            // You have to pass at least query + fields before passing options
            collection.find({}, null, { raw: true, batchSize: 2 }).toArray(function(err, items) {
              var objects = [];

              for (var i = 0; i < items.length; i++) {
                test.ok(Buffer.isBuffer(items[i]));
                objects.push(bson.deserialize(items[i]));
              }

              test.equal(1, objects[0].a);
              test.equal(2000, objects[1].b);
              test.equal(2.3, objects[2].c);

              // Execute findOne
              collection.findOne({ a: 1 }, { raw: true }, function(err, item) {
                test.ok(Buffer.isBuffer(item));
                var object = bson.deserialize(item);
                test.equal(1, object.a);
                client.close();
                done();
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
  it('shouldCorrectlySaveDocumentsAndReturnAsRawWithRawSetAtCollectionLevel', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] }
    },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { poolSize: 1 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        db.createCollection('shouldCorrectlySaveDocumentsAndReturnAsRaw_2', { raw: true }, function(
          err,
          collection
        ) {
          // Insert some documents
          collection.insert([{ a: 1 }, { b: 2000 }, { c: 2.3 }], { w: 1 }, function(err) {
            test.equal(null, err);
            // You have to pass at least query + fields before passing options
            collection.find({}, null, { batchSize: 2 }).toArray(function(err, items) {
              var objects = [];
              for (var i = 0; i < items.length; i++) {
                test.ok(Buffer.isBuffer(items[i]));
                objects.push(bson.deserialize(items[i]));
              }

              test.equal(1, objects[0].a);
              test.equal(2000, objects[1].b);
              test.equal(2.3, objects[2].c);

              // Execute findOne
              collection.findOne({ a: 1 }, { raw: true }, function(err, item) {
                test.ok(Buffer.isBuffer(item));
                var object = bson.deserialize(item);
                test.equal(1, object.a);
                client.close();
                done();
              });
            });
          });
        });
      });
    }
  });
});
