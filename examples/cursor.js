var MongoClient = require('../lib/mongodb').MongoClient
  , format = require('util').format;

var host = process.env['MONGO_NODE_DRIVER_HOST'] != null ? process.env['MONGO_NODE_DRIVER_HOST'] : 'localhost';
var port = process.env['MONGO_NODE_DRIVER_PORT'] != null ? process.env['MONGO_NODE_DRIVER_PORT'] : 27017;

console.log("Connecting to " + host + ":" + port);
MongoClient.connect(format("mongodb://%s:%s/node-mongo-examples?w=1", host, port), function(err, db) {
  var collection = db.collection('test');
  // Erase all records from collection, if any
  collection.remove(function(err, result) {
    
    // Insert 3 records
    for(var i = 0; i < 3; i++) {
      collection.insert({'a':i}, {w:0});
    }
    
    // Cursors don't run their queries until you actually attempt to retrieve data
    // from them.
    
    // Find returns a Cursor, which is Enumerable. You can iterate:
    collection.find().each(function(err, item) {
      if(item != null) console.dir(item);
    });
    
    // You can turn it into an array
    collection.find().toArray(function(err, items) {          
      console.log("count: " + items.length);
    });
    
    // You can iterate after turning it into an array (the cursor will iterate over
    // the copy of the array that it saves internally.)
    var cursor = collection.find();
    cursor.toArray(function(err, items) {          
      cursor.each(function(err, item) {
        if(item != null) console.dir(item);
      });
    });
    
    // You can get the next object    
    collection.find().nextObject(function(err, item) {
      if(item != null) console.dir(item);
    });
    
    // next_object returns null if there are no more objects that match      
    var cursor = collection.find();
    cursor.nextObject(function(err, item) {
      cursor.nextObject(function(err, item) {
        cursor.nextObject(function(err, item) {
          cursor.nextObject(function(err, item) {
            console.log("nextObject returned: ");
            console.dir(item);
            db.close();
          });
        });
      });          
    });
  });
});