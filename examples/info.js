var MongoClient = require('../lib/mongodb').MongoClient
  , format = require('util').format;

var host = process.env['MONGO_NODE_DRIVER_HOST'] != null ? process.env['MONGO_NODE_DRIVER_HOST'] : 'localhost';
var port = process.env['MONGO_NODE_DRIVER_PORT'] != null ? process.env['MONGO_NODE_DRIVER_PORT'] : 27017;

console.log("Connecting to " + host + ":" + port);
MongoClient.connect(format("mongodb://%s:%s/node-mongo-examples?w=1", host, port), function(err, db) {
  var collection = db.collection('test');
    
  // Remove all existing documents in collection
  collection.remove({}, {w:1}, function(err, result) {
    
    // Insert 3 records
    for(var i = 0; i < 3; i++) {
      collection.insert({'a':i}, {w:0});
    }
    
    // Show collection names in the database
    db.collectionNames(function(err, names) {
      names.forEach(function(name) {
        console.dir(name);          
      });
    });
    
    // More information about each collection
    db.collectionsInfo().toArray(function(err, items) {
      items.forEach(function(item) {
        console.dir(item);
      });        
    });
    
    // Index information
    db.createIndex('test', 'a', function(err, indexName) {
      db.indexInformation('test', function(err, doc) {
        console.dir(doc);
        collection.drop(function(err, result) {
          db.close();
        });
      });
    });
  });
});