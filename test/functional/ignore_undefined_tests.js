'use strict';

/**
 * @ignore
 */
exports['Should correctly insert document ignoring undefined field'] = {
  metadata: { requires: { topology: ['single'] } },
  // The actual test we wish to run
  test: function(configuration, test) {
    var client = configuration.newDbInstance(configuration.writeConcernMax(), {
      poolSize: 1,
      ignoreUndefined: true
    });
    client.connect(function(err, client) {
      var db = client.db(configuration.database);
      var collection = db.collection('shouldCorrectlyIgnoreUndefinedValue');
      // console.log("!!!!!!!!!!!!!!!!! IGNORE")

      // Ignore the undefined field
      collection.insert({ a: 1, b: undefined }, configuration.writeConcernMax(), function(
        err,
        result
      ) {
        // Locate the doument
        collection.findOne(function(err, item) {
          test.equal(1, item.a);
          test.ok(item.b === undefined);
          client.close();
          test.done();
        });
      });
    });
  }
};

/**
 * @ignore
 */
exports[
  'Should correctly connect using MongoClient and perform insert document ignoring undefined field'
] = {
  metadata: { requires: { topology: ['single'] } },
  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    MongoClient.connect(
      configuration.url(),
      {
        db: { bufferMaxEntries: 0, ignoreUndefined: true },
        server: { sslValidate: false }
      },
      function(err, client) {
        var db = client.db(configuration.database);
        var collection = db.collection('shouldCorrectlyIgnoreUndefinedValue1');
        collection.insert({ a: 1, b: undefined }, function(err, result) {
          collection.findOne(function(err, item) {
            test.equal(1, item.a);
            test.ok(item.b === undefined);

            collection.insertOne({ a: 2, b: undefined }, function(err, result) {
              collection.findOne({ a: 2 }, function(err, item) {
                test.equal(2, item.a);
                test.ok(item.b === undefined);

                collection.insertMany([{ a: 3, b: undefined }], function(err, result) {
                  collection.findOne({ a: 3 }, function(err, item) {
                    test.equal(3, item.a);
                    test.ok(item.b === undefined);
                    client.close();
                    test.done();
                  });
                });
              });
            });
          });
        });
      }
    );
  }
};

/**
 * @ignore
 */
exports['Should correctly update document ignoring undefined field'] = {
  metadata: { requires: { topology: ['single'] } },
  // The actual test we wish to run
  test: function(configuration, test) {
    var ObjectId = configuration.require.ObjectID;

    var client = configuration.newDbInstance(configuration.writeConcernMax(), {
      poolSize: 1,
      ignoreUndefined: true
    });
    client.connect(function(err, client) {
      var db = client.db(configuration.database);
      var collection = db.collection('shouldCorrectlyIgnoreUndefinedValue2');
      var id = new ObjectId();

      collection.updateOne(
        { _id: id, a: 1, b: undefined },
        { $set: { a: 1, b: undefined } },
        { upsert: true },
        function(err, result) {
          collection.findOne({ _id: id }, function(err, item) {
            test.equal(1, item.a);
            test.ok(item.b === undefined);
            var id = new ObjectId();

            collection.updateMany(
              { _id: id, a: 1, b: undefined },
              { $set: { a: 1, b: undefined } },
              { upsert: true },
              function(err, result) {
                collection.findOne({ _id: id }, function(err, item) {
                  test.equal(1, item.a);
                  test.ok(item.b === undefined);
                  var id = new ObjectId();

                  collection.update(
                    { _id: id, a: 1, b: undefined },
                    { $set: { a: 1, b: undefined } },
                    { upsert: true },
                    function(err, result) {
                      collection.findOne({ _id: id }, function(err, item) {
                        test.equal(1, item.a);
                        test.ok(item.b === undefined);
                        client.close();
                        test.done();
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
};
