require.paths.unshift("../lib");

GLOBAL.DEBUG = true;

sys = require("sys");
test = require("mjsunit");

require("mongodb/db");
require("mongodb/bson/bson");
require("mongodb/gridfs/gridstore");

var host = process.env['MONGO_NODE_DRIVER_HOST'] != null ? process.env['MONGO_NODE_DRIVER_HOST'] : 'localhost';
var port = process.env['MONGO_NODE_DRIVER_PORT'] != null ? process.env['MONGO_NODE_DRIVER_PORT'] : Connection.DEFAULT_PORT;

sys.puts("Connecting to " + host + ":" + port);
var db = new Db('node-mongo-examples', new Server(host, port, {}), {});
db.open(function(db) {
  db.dropCollection(function(result) {
    db.createCollection(function(collection) {
      db.strict = true;
      
      // Can't reference collections that does not exist in strict mode
      db.collection(function(collection) {
        if(collection.err == true) {
          sys.puts("expected error: " + collection.errmsg);
        }

        // Can't create collections that does not exist in strict mode
        db.createCollection(function(collection) {
          if(collection.err == true) {
            sys.puts("expected error: " + collection.errmsg);
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