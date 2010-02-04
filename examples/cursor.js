require.paths.unshift("../lib");

GLOBAL.DEBUG = true;

sys = require("sys");
test = require("mjsunit");

var mongo = require('mongodb/db');
process.mixin(mongo, require('mongodb/connection'));
process.mixin(mongo, require('mongodb/bson/bson'));
process.mixin(mongo, require('mongodb/cursor'));

var host = process.env['MONGO_NODE_DRIVER_HOST'] != null ? process.env['MONGO_NODE_DRIVER_HOST'] : 'localhost';
var port = process.env['MONGO_NODE_DRIVER_PORT'] != null ? process.env['MONGO_NODE_DRIVER_PORT'] : mongo.Connection.DEFAULT_PORT;

sys.puts("Connecting to " + host + ":" + port);
var db = new mongo.Db('node-mongo-examples', new mongo.Server(host, port, {}), {});
db.open(function(db) {
  db.collection(function(collection) {
    // Erase all records from collection, if any
    collection.remove(function(collection) {
      
      // Insert 3 records
      for(var i = 0; i < 3; i++) {
        collection.insert({'a':i});
      }
      
      // Cursors don't run their queries until you actually attempt to retrieve data
      // from them.
      
      // Find returns a Cursor, which is Enumerable. You can iterate:
      collection.find(function(cursor) {
        cursor.each(function(item) {
          if(item != null) sys.puts(sys.inspect(item.unorderedHash()));
        });
      });
      
      // You can turn it into an array
      collection.find(function(cursor) {
        cursor.toArray(function(items) {          
          sys.puts("count: " + items.length);
        });
      });
      
      // You can iterate after turning it into an array (the cursor will iterate over
      // the copy of the array that it saves internally.)
      collection.find(function(cursor) {
        cursor.toArray(function(items) {          
          cursor.each(function(item) {
            if(item != null) sys.puts(sys.inspect(item.unorderedHash()));            
          });
        });
      });  
      
      // You can get the next object    
      collection.find(function(cursor) {
        cursor.nextObject(function(item) {
          if(item != null) sys.puts(sys.inspect(item.unorderedHash()));                      
        });
      });
      
      // next_object returns null if there are no more objects that match
      collection.find(function(cursor) {
        cursor.nextObject(function(item) {
          cursor.nextObject(function(item) {
            cursor.nextObject(function(item) {
              cursor.nextObject(function(item) {
                sys.puts("nextObject returned: " + item);
                db.close();
              });
            });
          });          
        });
      });      
    });
  }, 'test');
});