"use strict";

/**
 * @ignore
 */
exports['Should correct connect to snitest1.10gen.cc'] = {
  metadata: { requires: { topology: 'sni', os: "!win32"  } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient

    // Let's write the actual connection code
    MongoClient.connect("mongodb://snitest2.mongodb.com:27777/?ssl=true", {
      servername: 'snitest1.10gen.cc',
    }, function(err, db) {
      test.equal(null, err);
      db.close();
      test.done();
    });
  }
}

/**
 * @ignore
 */
exports['Should correct connect to snitest2.mongodb.com'] = {
  metadata: { requires: { topology: 'sni', os: "!win32"  } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient

    // Let's write the actual connection code
    MongoClient.connect("mongodb://snitest2.mongodb.com:27777/?ssl=true", {
      servername: 'snitest2.mongodb.com',
    }, function(err, db) {
      test.equal(null, err);
      db.close();
      test.done();
    });
  }
}
