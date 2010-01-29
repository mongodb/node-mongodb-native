require.paths.unshift("../lib");

GLOBAL.DEBUG = true;

sys = require("sys");
test = require("mjsunit");

require("mongodb/db");
require("mongodb/bson/bson");
require("mongodb/gridfs/gridstore");

var host = process.ENV['MONGO_NODE_DRIVER_HOST'] != null ? process.ENV['MONGO_NODE_DRIVER_HOST'] : 'localhost';
var port = process.ENV['MONGO_NODE_DRIVER_PORT'] != null ? process.ENV['MONGO_NODE_DRIVER_PORT'] : Connection.DEFAULT_PORT;

sys.puts("Connecting to " + host + ":" + port);
var db = new Db('node-mongo-examples', new Server(host, port, {}), {});
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
              if(item != null) sys.puts(sys.inspect(item.unorderedHash()));
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