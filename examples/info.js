require.paths.unshift("../lib");

GLOBAL.DEBUG = true;

sys = require("sys");
test = require("mjsunit");

var mongo = require('mongodb/db');
process.mixin(mongo, require('mongodb/connection'));
process.mixin(mongo, require('mongodb/bson/bson'));

var host = process.env['MONGO_NODE_DRIVER_HOST'] != null ? process.env['MONGO_NODE_DRIVER_HOST'] : 'localhost';
var port = process.env['MONGO_NODE_DRIVER_PORT'] != null ? process.env['MONGO_NODE_DRIVER_PORT'] : mongo.Connection.DEFAULT_PORT;

sys.puts("Connecting to " + host + ":" + port);
var db = new mongo.Db('node-mongo-examples', new mongo.Server(host, port, {}), {});
db.open(function(db) {
  db.collection(function(collection) {
    
    // Remove all existing documents in collection
    collection.remove(function(collection) {
      
      // Insert 3 records
      for(var i = 0; i < 3; i++) {
        collection.insert({'a':i});
      }
      
      // Show collection names in the database
      db.collectionNames(function(names) {
        names.forEach(function(name) {
          sys.puts(sys.inspect(name));          
        });
      });
      
      // More information about each collection
      db.collectionsInfo(function(cursor) {
        cursor.toArray(function(items) {
          items.forEach(function(item) {
            sys.puts(sys.inspect(item));          
          });        
        });
      })  
      
      // Index information
      db.createIndex(function(indexName) {
        db.indexInformation(function(doc) {
          sys.puts(sys.inspect(doc));                    
          collection.drop(function(result) {
            db.close();
          });
        }, 'test');
      }, 'test', 'a');
    });
  }, 'test');
});