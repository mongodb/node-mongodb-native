var MongoClient = require('../lib/mongodb').MongoClient
  , format = require('util').format;

var host = process.env['MONGO_NODE_DRIVER_HOST'] != null ? process.env['MONGO_NODE_DRIVER_HOST'] : 'localhost';
var port = process.env['MONGO_NODE_DRIVER_PORT'] != null ? process.env['MONGO_NODE_DRIVER_PORT'] : 27017;

console.log("Connecting to " + host + ":" + port);
MongoClient.connect(format("mongodb://%s:%s/node-mongo-examples?w=1", host, port), function(err, db) {
  db.dropCollection('test', function(err, result) {
    // A capped collection has a max size and optionally a max number of records.
    // Old records get pushed out by new ones once the size or max num records is
    // reached.
    db.createCollection('test', {'capped':true, 'size':1024, 'max':12}, function(err, collection) {      
      for(var i = 0; i < 100; i++) { collection.insert({'a':i}, {w:0}); }
      
      // We will only see the last 12 records
      collection.find().toArray(function(err, items) {
        console.log("The number of records: " + items.length);
        db.close();
      })
    });    
  });
});