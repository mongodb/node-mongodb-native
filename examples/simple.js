require.paths.unshift("../lib");

GLOBAL.DEBUG = true;

sys = require("sys");
test = require("mjsunit");

var mongo = require('mongodb/db');
process.mixin(mongo, require('mongodb/connection'));

var host = process.env['MONGO_NODE_DRIVER_HOST'] != null ? process.env['MONGO_NODE_DRIVER_HOST'] : 'localhost';
var port = process.env['MONGO_NODE_DRIVER_PORT'] != null ? process.env['MONGO_NODE_DRIVER_PORT'] : mongo.Connection.DEFAULT_PORT;

sys.puts("Connecting to " + host + ":" + port);
var db = new mongo.Db('node-mongo-examples', new mongo.Server(host, port, {}), {});
db.open(function(db) {
  db.dropDatabase(function() {
    db.collection(function(collection) {
      // Erase all records from the collection, if any
      collection.remove(function(collection) {
        // Insert 3 records
        for(var i = 0; i < 3; i++) {
          collection.insert({'a':i});
        }
        
        collection.count(function(count) {
          sys.puts("There are " + count + " records in the test collection. Here they are:");

          collection.find(function(cursor) {
            cursor.each(function(item) {
              if(item != null) sys.puts(sys.inspect(item));
              // Null signifies end of iterator
              if(item == null) {                
                // Destory the collection
                collection.drop(function(collection) {
                  db.close();
                });
              }
            });
          });          
        });
      });      
    }, 'test');
  });
});