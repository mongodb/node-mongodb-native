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