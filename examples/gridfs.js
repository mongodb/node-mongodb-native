var MongoClient = require('../lib/mongodb').MongoClient
  , GridStore = require('../lib/mongodb').GridStore
  , format = require('util').format;

var host = process.env['MONGO_NODE_DRIVER_HOST'] != null ? process.env['MONGO_NODE_DRIVER_HOST'] : 'localhost';
var port = process.env['MONGO_NODE_DRIVER_PORT'] != null ? process.env['MONGO_NODE_DRIVER_PORT'] : 27017;

console.log(">> Connecting to " + host + ":" + port);
MongoClient.connect(format("mongodb://%s:%s/node-mongo-examples?w=1", host, port), function(err, db) {
  // Write a new file
  new GridStore(db, "foobar", "w").open(function(err, gridStore) {    
    gridStore.write("hello world!", function(err, gridStore) {
      gridStore.close(function(err, result) {
        // Read the file and dump the contents
        dump(db, 'foobar');
  
        // Append more data
        new GridStore(db, 'foobar', "w+").open(function(err, gridStore) {
          gridStore.write('\n', function(err, gridStore) {
            gridStore.puts('line two', function(err, gridStore) {
              gridStore.close(function(err, result) {
                dump(db, 'foobar');          
  
                // Overwrite
                new GridStore(db, 'foobar', "w").open(function(err, gridStore) {
                  gridStore.write('hello, sailor!', function(err, gridStore) {
                    gridStore.close(function(err, result) {
                      dump(db, 'foobar', function() {
                        db.close();                        
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  });
});

MongoClient.connect(format("mongodb://%s:%s/node-mongo-examples?w=1", host, port), {native_parser:true}, function(err, db) {
  // File existence tests
  new GridStore(db, "foobar2", "w").open(function(err, gridStore) {    
    gridStore.write( 'hello sailor', function(err, gridStore) {
      gridStore.close(function(err, result) {
        GridStore.exist(db, 'foobar2', function(err, result) {
          console.log("File 'foobar2' exists: " + result);
        });
        
        GridStore.exist(db, 'does-not-exist', function(err, result) {
          console.log("File 'does-not-exist' exists: " + result);
        });
        
        // Read with offset(uses seek)
        GridStore.read(db, 'foobar2', 6, 7, function(err, data) {
          console.log(data);
        });

        // Rewind/seek/tell
        new GridStore(db, 'foobar2', 'w').open(function(err, gridStore) {
          gridStore.write('hello, world!', function(err, gridStore){});
          gridStore.rewind(function(){});
          gridStore.write('xyzzz', function(err, gridStore){});
          gridStore.tell(function(tell) {
            console.log("tell: " + tell);       // Should be 5
          });
          gridStore.seek(4, function(err, gridStore){});
          gridStore.write('y', function(){});
          gridStore.close(function() {
            dump(db, 'foobar2');

            // Unlink file (delete)
            GridStore.unlink(db, 'foobar2', function(err, gridStore) {
              GridStore.exist(db, 'foobar2', function(err, result) {
                console.log("File 'foobar2' exists: " + result);
                db.close();
              });
            });
          });
        });
      });
    });
  });
});

MongoClient.connect(format("mongodb://%s:%s/node-mongo-examples?w=1", host, port), {native_parser:true}, function(err, db) {
  // Metadata
  new GridStore(db, "foobar3", "w").open(function(err, gridStore) {    
    gridStore.write('hello, world!', function(err, gridStore){});
    gridStore.close(function(err, gridStore) {
      gridStore = new GridStore(db, 'foobar3', "r");
      gridStore.open(function(err, gridStore) {
        console.log("contentType: " + gridStore.contentType);
        console.log("uploadDate: " + gridStore.uploadDate);
        console.log("chunkSize: " + gridStore.chunkSize);
        console.log("metadata: " + gridStore.metadata);          
      });
      
      // Add some metadata
      new GridStore(db, 'foobar3', "w+").open(function(err, gridStore) {
        gridStore.contentType = 'text/xml';
        gridStore.metadata = {'a':1};
        gridStore.close(function(err, gridStore) {
          // Print the metadata
          new GridStore(db, 'foobar3', "r").open(function(err, gridStore) {
            console.log("contentType: " + gridStore.contentType);
            console.log("uploadDate: " + gridStore.uploadDate);
            console.log("chunkSize: " + gridStore.chunkSize);
            console.log("metadata: " + gridStore.metadata);          
            db.close();
          });            
        });
      });        
    });
  });
  
  // You can also set meta data when initially writing to a file
  // setting root means that the file and its chunks are stored in a different root
  // collection: instead of gridfs.files and gridfs.chunks, here we use
  // my_files.files and my_files.chunks      
  var gridStore = new GridStore(db, "foobar3", "w", {'content_type':'text/plain', 
    'metadata':{'a':1}, 'chunk_size': 1024*4, 'root':'my_files'}).open(function(err, gridStore) {    
    gridStore.write('hello, world!', function(err, gridStore){});
    gridStore.close(function() {
    });
  });
});

function dump(db, filename, callback) {
  GridStore.read(db, filename, function(err, data) {
    console.log(data);
    if(callback != null) callback();
  }); 
}