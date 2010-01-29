require.paths.unshift("../lib");

GLOBAL.DEBUG = true;

sys = require("sys");
test = require("mjsunit");

require("mongodb/db");
require("mongodb/bson/bson");
require("mongodb/gridfs/gridstore");

var host = process.ENV['MONGO_NODE_DRIVER_HOST'] != null ? process.ENV['MONGO_NODE_DRIVER_HOST'] : 'localhost';
var port = process.ENV['MONGO_NODE_DRIVER_PORT'] != null ? process.ENV['MONGO_NODE_DRIVER_PORT'] : Connection.DEFAULT_PORT;

sys.debug(">> Connecting to " + host + ":" + port);
var db = new Db('node-mongo-examples', new Server(host, port, {}), {});
db.open(function(db) {
  // Write a new file
  var gridStore = new GridStore(db, "foobar", "w");
  gridStore.open(function(gridStore) {    
    gridStore.write(function(gridStore) {
      gridStore.close(function(result) {
        // Read the file and dump the contents
        dump(db, 'foobar');
  
        // Append more data
        gridStore = new GridStore(db, 'foobar', "w+");
        gridStore.open(function(gridStore) {
          gridStore.write(function(gridStore) {
            gridStore.puts(function(gridStore) {
              gridStore.close(function(result) {
                dump(db, 'foobar');          
  
                // Overwrite
                gridStore = new GridStore(db, 'foobar', "w");
                gridStore.open(function(gridStore) {
                  gridStore.write(function(gridStore) {
                    gridStore.close(function(result) {
                      dump(db, 'foobar');          
                    });
                  }, 'hello, sailor!');
                });
              });
            }, 'line two');
          }, '\n');
        });
      });
    }, "hello world!");
  });

  // File existence tests
  var gridStore = new GridStore(db, "foobar2", "w");
  gridStore.open(function(gridStore) {    
    gridStore.write(function(gridStore) {
      gridStore.close(function(result) {
        GridStore.exist(function(result) {
          sys.debug("File 'foobar' exists: " + result);
        }, db, 'foobar2');
        
        GridStore.exist(function(result) {
          sys.debug("File 'does-not-exist' exists: " + result);
        }, db, 'does-not-exist');
        
        // Read with offset(uses seek)
        GridStore.read(function(data) {
          sys.debug(data);
        }, db, 'foobar2', 6, 7);
        
        // Rewind/seek/tell
        var gridStore2 = new GridStore(db, 'foobar2', 'w');
        gridStore2.open(function(gridStore) {
          gridStore.write(function(){}, 'hello, world!');
          gridStore.rewind(function(){});
          gridStore.write(function(){}, 'xyzzz');
          gridStore.tell(function(tell) {
            sys.debug("tell: " + tell);       // Should be 5
          });
          gridStore.seek(function(gridStore){}, 4);
          gridStore.write(function(){}, 'y');
          gridStore.close(function() {
            dump(db, 'foobar2');
          });
        });
      });
    }, 'hello sailor');
  });
});

function dump(db, filename) {
  GridStore.read(function(data) {
    sys.debug(data);
  }, db, filename); 
}