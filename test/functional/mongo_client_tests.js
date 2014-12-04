"use strict";

exports['Should Correctly Do MongoClient with bufferMaxEntries:0'] = {
  metadata: {
    requires: {
      node: ">0.8.0",
      topology: ['single', 'ssl', 'wiredtiger']
    }
  },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    MongoClient.connect(configuration.url(), {
      db: {bufferMaxEntries:0},
    }, function(err, db) {
      // Listener for closing event
      var closeListener = function(has_error) {
        // Let's insert a document
        var collection = db.collection('test_object_id_generation.data2');
        // Insert another test document and collect using ObjectId
        collection.insert({"name":"Patty", "age":34}, configuration.writeConcern(), function(err, ids) {
          test.ok(err != null);
          test.ok(err.message.indexOf("0") != -1)
          // Let's close the db
          db.close();
          test.done();
        });
      };

      // Add listener to close event
      db.once("close", closeListener);
      // Ensure death of server instance
      db.serverConfig.connectionPool.openConnections[0].connection.destroy();
    });
  }
}

