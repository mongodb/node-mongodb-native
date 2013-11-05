exports['Should Correctly Pass Logger Object'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  requires: {node: ">0.8.0"},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.getMongoPackage().MongoClient;
    var loggingHappened = false;

    var logit = function(msg, obj){
      loggingHappened = true;
    }

    var logger = {
      error: logit,
      debug: logit,
      log: logit,
      doDebug:true,
      doError:true,
      doLog:true,
    }    

    MongoClient.connect(configuration.url(), {
      db: {logger:logger},
    }, function(err, db) {
      test.ok(loggingHappened);
      db.close();
      test.done();
    });
  }
}

exports['Should Correctly Do MongoClient with bufferMaxEntries:0'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  requires: {node: ">0.8.0"},

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.getMongoPackage().MongoClient;


    MongoClient.connect(configuration.url(), {
      db: {bufferMaxEntries:0},
    }, function(err, db) {
      // Listener for closing event
      var closeListener = function(has_error) {
        // Let's insert a document
        var collection = db.collection('test_object_id_generation.data2');
        // Insert another test document and collect using ObjectId
        collection.insert({"name":"Patty", "age":34}, {w:1}, function(err, ids) {
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

