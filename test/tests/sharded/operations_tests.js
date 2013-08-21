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
      , new Server("localhost", 50001, { auto_reconnect: true })
    ])

  // Set up a bunch of documents
  var docs = [];
  for(var i = 0; i < 1000; i++) {
    docs.push({a:i, data:new Buffer(1024)});
  }

  // Connect using the mongos connections
  var db = new Db('integration_test_', mongos, {w:0});
  db.open(function(err, db) {
    test.equal(null, err);
    test.ok(db != null);

    var collection = db.collection("shard_all_operations_test");
    collection.insert(docs, {safe:{w:1, wtimeout:1000}}, function(err, result) {
      test.equal(null, err);

      // Perform an update
      collection.update({a:0}, {$set: {c:1}}, {w:1}, function(err, result) {
        test.equal(null, err);
        var numberOfRecords = 0;

        // Perform a find and each
        collection.find().each(function(err, item) {
          if(err) console.dir(err)

          if(item == null) {
            test.equal(1000, numberOfRecords);

            // Perform a find and toArray
            collection.find().toArray(function(err, items) {
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

/**
 * @ignore
 */
exports.shouldCorrectlyHandleSwitchOver = function(configuration, test) {
  var Mongos = configuration.getMongoPackage().Mongos
    , Server = configuration.getMongoPackage().Server
    , Db = configuration.getMongoPackage().Db;

  // Set up mongos connection
  var mongos = new Mongos([
        new Server("localhost", 50000, { auto_reconnect: true, socketOptions: {connectTimeoutMS: 3000, socketTimeoutMS: 3000, keepAlive:100}})
      , new Server("localhost", 50001, { auto_reconnect: true, socketOptions: {connectTimeoutMS: 3000, socketTimeoutMS: 3000, keepAlive:100}})
    ], {socketOptions: {connectTimeoutMS: 3000, socketTimeoutMS: 3000, keepAlive:100}});

  // Var number of iterations
  var iterations = 0;
  var mongosUp = false;

  // Connect using the mongos connections
  var db = new Db('integration_test_', mongos, {w:0});
  db.open(function(err, db) {
    var intervalId = setInterval(function() {
      db.collection('some_collection').update({a:1}, {$inc: {counter:1}}, {w:1, upsert:true}, function(err, result) {
        iterations = iterations + 1;
        
        if(iterations == 4) {
          configuration.killMongoS(50000, function() {});
        } else if(mongosUp) {
          var connection = db.serverConfig.checkoutWriter();
          if(connection != null && connection.socketOptions) {
            
            // Check that we have the right fail over connection
            if(connection.socketOptions.port == 50000) {
              clearInterval(intervalId);
              db.close();
              test.done();
            }
          }
        } else if(iterations > 4) {
          var connection = db.serverConfig.checkoutWriter();
          if(connection != null && connection.socketOptions) {
            
            // Check that we have the right fail over connection
            if(connection.socketOptions.port == 50001) {
              mongosUp = true;
              // Restart the 50000 server
              configuration.restartMongoS(50000, function(err, result) {
                configuration.killMongoS(50001, function(err, result) {                
                })
              });
            }
          }
        }
      });
    }, 1000);
  });
}

exports.shouldCorrectlyAggregate = function(configuration, test) {
  var mongodb = configuration.getMongoPackage();
  var uri = 'mongodb://localhost:50000,localhost:50001/integration_test_';

  var newMovie = {
    title: 'Star Wars 7',
    director: 'grobot'
  }

  var pipe = [{$match: {director: 'grobot'}}];

  mongodb.connect(uri, function(err, db) {
    test.equal(null, err);

    var collection = db.collection('movie')
    collection.insert(newMovie, function(err, res) {
      collection.aggregate(pipe, function(err, res) {
        test.equal(null, err);
        db.close();
        test.done();
      });
    });
  });  
}