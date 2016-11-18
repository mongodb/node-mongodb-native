"use strict";

/**
 * @ignore
 */
exports['Should correct connect to snitest1.10gen.cc'] = {
  metadata: { requires: { topology: 'sni', os: "!win32"  } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient

    console.log("====================================================== 0")
    // Let's write the actual connection code
    // MongoClient.connect("mongodb://snitest1.10gen.cc:27777/tests?ssl=true&maxPoolSize=1", {
    MongoClient.connect("mongodb://snitest2.mongodb.com:27777/?ssl=true", {
    // MongoClient.connect("mongodb://snitest2.cloudmanager.mongodb.com:27777/tests?ssl=true&maxPoolSize=1", {
      servername: 'cloudmanager.mongodb.com',
    }, function(err, db) {
      console.log("====================================================== 1")
      console.dir(err)
      test.equal(null, err);
      // test.ok(db != null);

      // db.collection('test').find().toArray(function(err, docs) {
      //   test.equal(null, err);

      //   test.ok(true, docs[0].kerberos);
        db.close();
        test.done();
      // });
    });
  }
}
