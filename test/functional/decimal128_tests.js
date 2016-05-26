/**
 * @ignore
 */
exports['should correctly insert decimal128 value'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: {
    requires: {
      mongodb: ">=3.3.6",
      topology: ['single']
    }
  },

  // The actual test we wish to run
  test: function(configuration, test) {
    var Decimal128 = configuration.require.Decimal128;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      var object = {
        id: 1,
        value: Decimal128.fromString("1")
      };

      db.collection('decimal128').insertOne(object, function(err, r) {
        test.equal(null, err);

        db.collection('decimal128').findOne({
          id: 1
        }, function(err, doc)  {
          console.dir(doc)
          test.equal(null, err);
          test.ok(doc.value instanceof Decimal128);
          test.equal("1", doc.value.toString());

          db.close();
          test.done();
        });
      });
    });
  }
}
