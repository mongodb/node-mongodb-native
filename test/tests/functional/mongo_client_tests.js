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
