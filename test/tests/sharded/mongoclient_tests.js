/**
 * Example of a simple url connection string to a shard, with acknowledgement of writes.
 *
 * @_class mongoclient
 * @_function MongoClient.connect
 */
exports['Should connect to mongos proxies using connectiong string'] = function(configuration, test) {
  var MongoClient = configuration.getMongoPackage().MongoClient;

  // DOC_START
  MongoClient.connect('mongodb://localhost:50000,localhost:50001/sharded_test_db?w=1', function(err, db) {
    test.equal(null, err);
    test.ok(db != null);

    db.collection("replicaset_mongo_client_collection").update({a:1}, {b:1}, {upsert:true}, function(err, result) {
      test.equal(null, err);
      test.equal(1, result);

      db.close();
      test.done();
    });    
  });
  // DOC_END
}

/**
 * @ignore
 */
exports['Should connect to mongos proxies using connectiong string and options'] = function(configuration, test) {
  var MongoClient = configuration.getMongoPackage().MongoClient;

  MongoClient.connect('mongodb://localhost:50000,localhost:50001/sharded_test_db?w=1', {
    mongos: {
      haInterval: 500
    }
  }, function(err, db) {
    test.equal(null, err);
    test.ok(db != null);
    test.equal(500, db.serverConfig.mongosStatusCheckInterval);

    db.collection("replicaset_mongo_client_collection").update({a:1}, {b:1}, {upsert:true}, function(err, result) {
      test.equal(null, err);
      test.equal(1, result);

      db.close();
      test.done();
    });    
  });
}

/**
 * @ignore
 */
exports['Should correctly connect with a missing mongos'] = function(configuration, test) {
  var MongoClient = configuration.getMongoPackage().MongoClient;

  MongoClient.connect('mongodb://localhost:50002,localhost:50000,localhost:50001/test', {}, function(err, db) {
    setTimeout(function() {
      test.equal(null, err);
      test.ok(db != null);
      db.close();
      test.done();
    }, 2000)
  });
}

/**
 * @ignore
 */
exports['Should correctly emit open and fullsetup to all db instances'] = function(configuration, test) {
  var Mongos = configuration.getMongoPackage().Mongos
    , Server = configuration.getMongoPackage().Server
    , Db = configuration.getMongoPackage().Db;

  var db_conn = new Db('integration_test_', new Mongos([new Server("localhost", 50000), new Server("localhost", 50001)]), {w:1});
  var db2 = db_conn.db('integration_test_2');

  var close_count = 0;
  var open_count = 0;
  var fullsetup_count = 0;

  db2.on('close', function() {
    close_count = close_count + 1;
  });                                                                             
  
  db_conn.on('close', function() {
    close_count = close_count + 1;
  });                                                                             

  db2.on('open', function(err, db) {
    // console.log("============================================= open 1 :: " + db.databaseName)
    test.equal('integration_test_2', db.databaseName);
    open_count = open_count + 1;
  }); 

  db_conn.on('open', function(err, db) {
    // console.log("============================================= open 2 :: " + db.databaseName)
    test.equal('integration_test_', db.databaseName);
    open_count = open_count + 1;
  });

  db2.on('fullsetup', function(err, db) {
    // console.log("============================================= fullsetup 1 :: " + db.databaseName)
    test.equal('integration_test_2', db.databaseName);
    fullsetup_count = fullsetup_count + 1;
  });

  db_conn.on('fullsetup', function(err, db) {
    // console.log("============================================= fullsetup 2 :: " + db.databaseName)
    test.equal('integration_test_', db.databaseName);
    fullsetup_count = fullsetup_count + 1;
  });

  db_conn.open(function (err) {                                                   
    // console.log("================================================ 0")
    if (err) throw err;                                                           
                                                                                  
    var col1 = db_conn.collection('test');                                        
    var col2 = db2.collection('test');                                            
                                                                                  
    var testData = { value : "something" };                                       
    col1.insert(testData, function (err) {                                        
      // console.log("================================================ 1")
      if (err) throw err;                                                         

      var testData = { value : "something" };                                       
      col2.insert(testData, function (err) {                                      
        // console.log("================================================ 2")
        if (err) throw err;  
        db2.close(function() {
          // console.log("================================================ 3")
          setTimeout(function() {
            // console.log("================================================ 4")
            // console.log("========================================= results")
            // console.dir("close_count :: " + close_count)
            // console.dir("open_count :: " + open_count)
            // console.dir("fullsetup_count :: " + fullsetup_count)

            test.equal(2, close_count);
            test.equal(2, open_count);
            test.equal(2, fullsetup_count);
            test.done();            
          }, 1000);
        });                                                                      
      });                                                                         
    });                                                                           
  });
}