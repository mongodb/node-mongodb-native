var MongoClient = require('../lib/mongodb').MongoClient
  , format = require('util').format;

var host = process.env['MONGO_NODE_DRIVER_HOST'] != null ? process.env['MONGO_NODE_DRIVER_HOST'] : 'localhost';
var port = process.env['MONGO_NODE_DRIVER_PORT'] != null ? process.env['MONGO_NODE_DRIVER_PORT'] : 27017;

console.log("Connecting to " + host + ":" + port);
MongoClient.connect(format("mongodb://%s:%s/node-mongo-examples?w=1", host, port), function(err, db) {
  db.dropDatabase(function(err, result){    
    db.dropCollection('test', function(err, result) {
      var collection = db.collection('test');
      // Erase all records in collection
      collection.remove({}, function(err, r) {
        var admin = db.admin();

        // Profiling level set/get
        admin.profilingLevel(function(err, profilingLevel) {
          console.log("Profiling level: " + profilingLevel);
        });

        // Start profiling everything
        admin.setProfilingLevel('all', function(err, level) {
          console.log("Profiling level: " + level);            

          // Read records, creating a profiling event
          collection.find().toArray(function(err, items) {
            // Stop profiling
            admin.setProfilingLevel('off', function(err, level) {
              // Print all profiling info
              admin.profilingInfo(function(err, info) {
                console.dir(info);

                // Validate returns a hash if all is well or return an error hash if there is a
                // problem.
                admin.validateCollection(collection.collectionName, function(err, result) {
                  console.dir(result);
                  db.close();
                });
              });
            });
          });
        });
      });    
    });    
  });
});