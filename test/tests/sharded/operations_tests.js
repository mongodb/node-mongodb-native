/**
 * @ignore
 */
exports.shouldCorrectlyPerformAllOperationsAgainstShardedSystem = function(configuration, test) {
  var Mongos = configuration.getMongoPackage().Mongos
    , Server = configuration.getMongoPackage().Server
    , Db = configuration.getMongoPackage().Db;

  // Set up mongos connection
  var mongos = new Mongos([
      new Server("localhost", 50000, { auto_reconnect: true })
    ])

  // var mongos = new Server("localhost", 27017, { auto_reconnect: true })
  // var mongos = new Server("localhost", 50000, { auto_reconnect: true, poolSize:1 });

  // Set up a bunch of documents
  var docs = [];
  for(var i = 0; i < 1000; i++) {
    docs.push({a:i, data:new Buffer(1024)});
  }

  // Connect using the mongos connections
  var db = new Db('integration_test_', mongos, {w:0});
  db.open(function(err, db) {
    // console.log("================================================ 0")
    test.equal(null, err);
    test.ok(db != null);

    var collection = db.collection("shard_all_operations_test");
    collection.insert(docs, {safe:{w:1, wtimeout:1000}}, function(err, result) {
      // console.log("================================================ 1")
      test.equal(null, err);

      // Perform an update
      collection.update({a:0}, {$set: {c:1}}, {w:1}, function(err, result) {
        // console.log("================================================ 2")
        test.equal(null, err);
        var numberOfRecords = 0;

        // Perform a find and each
        collection.find().each(function(err, item) {
          if(err) console.dir(err)

          if(item == null) {
            test.equal(1000, numberOfRecords);
            // console.log("================================================ 3")

            // Perform a find and each
            collection.find().toArray(function(err, items) {
              // console.log("================================================ 4")
              if(err) console.dir(err)
              test.equal(1000, items.length);

              db.close();
              test.done();
            })
          } else {
            numberOfRecords = numberOfRecords + 1;
          }
        });
      });
    });
  });
}