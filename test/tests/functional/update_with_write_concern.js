/**
 * Test the update with write concern at 0 (fire & forget) setting it through
 * the connection string options instead of the options object.
 */
exports["Should Update with Write Concern at 0 in Connection String"] = function(configuration, test) {
  var connect = configuration.getMongoPackage().connect;
  // pass the write concern in the connection string options
  connect(configuration.url() + "&w=0", function (err, db) {
    // setup document
    var acollection = db.collection("acollection");
    acollection.insert({"key": "value", "count": 0}, {"w": 1}, function(err, result) {
      var _id = result[0]._id;
      // update with no write concern
      acollection.update({"_id": _id}, {"$inc": {"count": 1}});
      setTimeout(function() {
        // read document after a while
        acollection.findOne({"_id": _id}, function(err, data) {
          // property count should be 1
          test.equal(data.count, 1);
          test.done();
        });
      }, 1000); // arbitrary delay
    });
  });
};
