exports['should maintain batch size between calls to receive new batches'] = {
  metadata: {
    // MongoDb must be > 2.6.0 as aggregate did not return a cursor before this version
    requires: { generators: true, topology: 'single' , node: ">6.0.0", mongodb: ">=2.6.0" }
  },

  // The actual test we wish to run
  test: function(configure, test) {
    var co = require('co');

    co(function*() {
      var instance = configure.newDbInstance({ w: 1 }, { poolSize: 1 });
      var db = yield instance.open();

      var docs = [ { a: 1 }, { a: 1 }, { a: 1 }, { a: 1 }, { a: 1 }, { a: 1 } ];
      var collection = db.collection('batchSizeContinue');
      yield collection.insertMany(docs, { w: 1 });
      var cursor = collection.aggregate([
          { $match: { a: 1 } }, { $limit: 6 }
        ], {
          cursor: { batchSize: 2 }
        });

      var count = 0;
      while (yield cursor.hasNext()) {
        var data = yield cursor.next();
        test.equal(data.a, 1);

        // ensure batch size is as specified
        test.equal(cursor.cursorState.documents.length, 2);
        count++;
      }

      test.equal(count, 6);
      db.close();
      test.done();
    }).catch(err => {
      console.log(err)
    });
  }
}
