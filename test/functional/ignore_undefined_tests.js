'use strict';
var test = require('./shared').assert;
var setupDatabase = require('./shared').setupDatabase;
var assign = require('../../lib/utils').assign;

describe('Ignore Undefined', function() {
  before(function() {
    return setupDatabase(this.configuration);
  });

  /**
   * @ignore
   */
  it('Should correctly insert document ignoring undefined field', {
    metadata: { requires: { topology: ['single'] } },

    test: function(done) {
      var configuration = this.configuration;
      var client = configuration.newClient(
        assign({}, configuration.writeConcernMax(), {
          poolSize: 1,
          ignoreUndefined: true
        })
      );

      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        var collection = db.collection('shouldCorrectlyIgnoreUndefinedValue');

        // Ignore the undefined field
        collection.insert({ a: 1, b: undefined }, configuration.writeConcernMax(), function(err) {
          test.equal(null, err);

          // Locate the doument
          collection.findOne(function(err, item) {
            test.equal(1, item.a);
            test.ok(item.b === undefined);
            client.close();
            done();
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it(
    'Should correctly connect using MongoClient and perform insert document ignoring undefined field',
    {
      metadata: { requires: { topology: ['single'] } },

      test: function(done) {
        var configuration = this.configuration;
        var MongoClient = configuration.require.MongoClient;

        MongoClient.connect(
          configuration.url(),
          {
            db: { bufferMaxEntries: 0, ignoreUndefined: true },
            server: { sslValidate: false }
          },
          function(err, client) {
            var db = client.db(configuration.db);
            var collection = db.collection('shouldCorrectlyIgnoreUndefinedValue1');
            collection.insert({ a: 1, b: undefined }, function(err) {
              test.equal(null, err);

              collection.findOne(function(err, item) {
                test.equal(1, item.a);
                test.ok(item.b === undefined);

                collection.insertOne({ a: 2, b: undefined }, function(err) {
                  test.equal(null, err);

                  collection.findOne({ a: 2 }, function(err, item) {
                    test.equal(2, item.a);
                    test.ok(item.b === undefined);

                    collection.insertMany([{ a: 3, b: undefined }], function(err) {
                      test.equal(null, err);

                      collection.findOne({ a: 3 }, function(err, item) {
                        test.equal(3, item.a);
                        test.ok(item.b === undefined);
                        client.close();
                        done();
                      });
                    });
                  });
                });
              });
            });
          }
        );
      }
    }
  );

  /**
   * @ignore
   */
  it('Should correctly update document ignoring undefined field', {
    metadata: { requires: { topology: ['single'] } },

    test: function(done) {
      var configuration = this.configuration;
      var ObjectId = configuration.require.ObjectID;

      var client = configuration.newClient(
        assign({}, configuration.writeConcernMax(), {
          poolSize: 1,
          ignoreUndefined: true
        })
      );

      client.connect(function(err, client) {
        var db = client.db(configuration.db);
        var collection = db.collection('shouldCorrectlyIgnoreUndefinedValue2');
        var id = new ObjectId();

        collection.updateOne(
          { _id: id, a: 1, b: undefined },
          { $set: { a: 1, b: undefined } },
          { upsert: true },
          function(err) {
            test.equal(null, err);
            collection.findOne({ _id: id }, function(err, item) {
              test.equal(1, item.a);
              test.ok(item.b === undefined);
              var id = new ObjectId();

              collection.updateMany(
                { _id: id, a: 1, b: undefined },
                { $set: { a: 1, b: undefined } },
                { upsert: true },
                function(err) {
                  test.equal(null, err);
                  collection.findOne({ _id: id }, function(err, item) {
                    test.equal(1, item.a);
                    test.ok(item.b === undefined);
                    var id = new ObjectId();

                    collection.update(
                      { _id: id, a: 1, b: undefined },
                      { $set: { a: 1, b: undefined } },
                      { upsert: true },
                      function(err) {
                        test.equal(null, err);
                        collection.findOne({ _id: id }, function(err, item) {
                          test.equal(1, item.a);
                          test.ok(item.b === undefined);
                          client.close();
                          done();
                        });
                      }
                    );
                  });
                }
              );
            });
          }
        );
      });
    }
  });
});
