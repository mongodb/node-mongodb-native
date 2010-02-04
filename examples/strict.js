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
  db.dropCollection(function(result) {
    db.createCollection(function(collection) {
      db.strict = true;
      
      // Can't reference collections that does not exist in strict mode
      db.collection(function(collection) {
        if(collection instanceof Error) {
          sys.puts("expected error: " + collection.message);
        }

        // Can't create collections that does not exist in strict mode
        db.createCollection(function(collection) {
          if(collection instanceof Error) {
            sys.puts("expected error: " + collection.message);
          }        

          // Remove the strict mode
          db.strict = false;
          db.dropCollection(function(collection) {
            db.close();
          }, 'test');
        }, 'test');
      }, 'does-not-exist');
    }, 'test');
  }, 'does-not-exist');
});