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
  db.dropDatabase(function(){
    db.dropCollection(function() {
      db.createCollection(function(collection) {

        // Erase all records in collection
        collection.remove(function(collection) {
          db.admin(function(admin) {

            // Profiling level set/get
            admin.profilingLevel(function(profilingLevel) {
              sys.puts("Profiling level: " + profilingLevel);
            });

            // Start profiling everything
            admin.setProfilingLevel(function(level) {
              sys.puts("Profiling level: " + level);            

              // Read records, creating a profiling event
              collection.find(function(cursor) {
                cursor.toArray(function(items) {

                  // Stop profiling
                  admin.setProfilingLevel(function(level) {
                    // Print all profiling info
                    admin.profilingInfo(function(info) {
                      sys.puts(sys.inspect(info));

                      // Validate returns a hash if all is well or return an error has if there is a
                      // problem.
                      admin.validatCollection(function(result) {
                        sys.puts(result.get('result'));
                        db.close();
                      }, collection.collectionName);
                    });
                  }, 'off');
                });
              });            
            }, 'all');
          });
        });
      }, 'test');    
    }, 'test');    
  });
});