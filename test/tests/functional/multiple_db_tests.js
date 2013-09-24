/**
 * @ignore
 */
exports.shouldCorrectlyEmitErrorOnAllDbsOnPoolClose = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  requires: {serverType: 'Server'},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    if(process.platform !== 'linux') {
      var db = configuration.newDbInstance({w:1}, {poolSize:1});
      // All inserted docs
      var docs = [];
      var errs = [];
      var insertDocs = [];
      var numberOfCloses = 0;

      // Start server
      db.on("close", function(err) {
        // console.log("+++++++++++++++++++++++++++++++++++++++++++++++ 1 :: " + this.databaseName)
        numberOfCloses = numberOfCloses + 1;
      })
      
      db.open(function(err, db) {
        db.createCollection('shouldCorrectlyErrorOnAllDbs', function(err, collection) {
          test.equal(null, err);

          collection.insert({a:1}, {w:1}, function(err, result) {
            test.equal(null, err);

            // Open a second db
            var db2 = db.db('tests_2');
            // Add a close handler
            db2.on("close", function(err) {
              // console.log("+++++++++++++++++++++++++++++++++++++++++++++++ 0 :: " + this.databaseName)
              numberOfCloses = numberOfCloses + 1;              
              test.equal(2, numberOfCloses)
              test.done();          
            });

            db.close();
                                
            // // Kill server and end test
            // db.serverConfig.connectionPool.openConnections[0].connection.destroy();
          });
        });
      });      
    } else {
      test.done();
    }
  }
}

/**
 * Test the auto connect functionality of the db
 * 
 * @ignore
 */
exports.shouldCorrectlyUseSameConnectionsForTwoDifferentDbs = function(configuration, test) {
  var client = configuration.newDbInstance({w:1}, {poolSize:1});
  var second_test_database = configuration.newDbInstance({w:1}, {poolSize:1});
  // Just create second database
  client.open(function(err, client) {
    second_test_database.open(function(err, second_test_database) {
      // Close second database
      second_test_database.close();
      // Let's grab a connection to the different db resusing our connection pools
      var secondDb = client.db(configuration.db_name + "_2");
      secondDb.createCollection('shouldCorrectlyUseSameConnectionsForTwoDifferentDbs', function(err, collection) {
        // Insert a dummy document
        collection.insert({a:20}, {safe: true}, function(err, r) {            
          test.equal(null, err);

          // Query it
          collection.findOne({}, function(err, item) {
            test.equal(20, item.a);

            // Use the other db
            client.createCollection('shouldCorrectlyUseSameConnectionsForTwoDifferentDbs', function(err, collection) {
              // Insert a dummy document
              collection.insert({b:20}, {safe: true}, function(err, r) {            
                test.equal(null, err);            

                // Query it
                collection.findOne({}, function(err, item) {
                  test.equal(20, item.b);

                  test.equal(null, err);
                  client.close();
                  second_test_database.close();            
                  test.done();                
                });              
              });
            });
          });              
        });
      });
    });
  });
}

/**
 * Simple example connecting to two different databases sharing the socket connections below.
 *
 * @_class db
 * @_function db
 */
exports.shouldCorrectlyShareConnectionPoolsAcrossMultipleDbInstances = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});

  // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
  // DOC_START
  // Establish connection to db  
  db.open(function(err, db) {
    test.equal(null, err);
    
    // Reference a different database sharing the same connections
    // for the data transfer
    var secondDb = db.db("integration_tests_2");
    
    // Fetch the collections
    var multipleColl1 = db.collection("multiple_db_instances");
    var multipleColl2 = secondDb.collection("multiple_db_instances");
    
    // Write a record into each and then count the records stored
    multipleColl1.insert({a:1}, {w:1}, function(err, result) {      
      multipleColl2.insert({a:1}, {w:1}, function(err, result) {
        
        // Count over the results ensuring only on record in each collection
        multipleColl1.count(function(err, count) {
          test.equal(1, count);

          multipleColl2.count(function(err, count) {
            test.equal(1, count);

            db.close();
            test.done();
          });
        });
      });
    });
  });
  // DOC_END
}

/**
 * @ignore
 */
exports.shouldCorrectlyHandleMultipleDbsFindAndModifies = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    var db_instance = db.db('site1');
    db_instance = db.db('site2');
    db_instance = db.db('rss');

    db_instance.collection('counters', function(err, collection) {
      collection.findAndModify({}, {}, {'$inc': {'db': 1}}, {new:true}, function(error, counters) {
        db.close();
        test.done();
      });
    });
  });
}