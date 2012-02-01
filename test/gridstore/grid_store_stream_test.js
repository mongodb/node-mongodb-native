var mongodb = process.env['TEST_NATIVE'] != null ? require('../../lib/mongodb').native() : require('../../lib/mongodb').pure();

var testCase = require('../../deps/nodeunit').testCase,
  debug = require('util').debug,
  inspect = require('util').inspect,
  nodeunit = require('../../deps/nodeunit'),
  gleak = require('../../dev/tools/gleak'),
  fs = require('fs'),
  ObjectID = require('../../lib/mongodb/bson/objectid').ObjectID,
  Db = mongodb.Db,
  Cursor = mongodb.Cursor,
  Collection = mongodb.Collection,
  GridStore = mongodb.GridStore,
  Chunk = mongodb.Chunk,
  Step = require("../../deps/step/lib/step"),
  Server = mongodb.Server;

var MONGODB = 'integration_tests';
var client = new Db(MONGODB, new Server("127.0.0.1", 27017, {auto_reconnect: true, poolSize: 4}), {native_parser: (process.env['TEST_NATIVE'] != null)});
var useSSL = process.env['USE_SSL'] != null ? true : false;
var native_parser = (process.env['TEST_NATIVE'] != null);

/**
 * Retrieve the server information for the current
 * instance of the db client
 * 
 * @ignore
 */
exports.setUp = function(callback) {
  var self = exports;  
  client.open(function(err, db_p) {
    if(numberOfTestsRun == (Object.keys(self).length)) {
      // If first test drop the db
      client.dropDatabase(function(err, done) {
        callback();
      });
    } else {
      return callback();
    }
  });
}

/**
 * Retrieve the server information for the current
 * instance of the db client
 * 
 * @ignore
 */
exports.tearDown = function(callback) {
  var self = this;
  numberOfTestsRun = numberOfTestsRun - 1;
  // Close connection
  client.close();
  callback();
}

/** 
 * @ignore
 */
exports.shouldCorrectlyWriteLargeFileStringAndReadBack = function(test) {
  var db = client;
  var fileId = new ObjectID();
  var gridStore = new GridStore(db, fileId, "w", {root:'fs'});
  gridStore.chunkSize = 5000;

  gridStore.open(function(err, gridStore) {
   Step(
     function writeData() {
       var group = this.group();
       var d = '';
       for(var j = 0; j < 5000;j++) {
         d = d + '+';
       }

       for(var i = 0; i < 15000; i += 5000) {
         gridStore.write(d, false, group());
       }   
     },

     function readAsStream() {
       gridStore.close(function(err, result) {
         var gotEnd = false;           
         var endLen = 0;

         var gridStore = new GridStore(db, fileId, "r");
         gridStore.open(function(err, gridStore) {
           var stream = gridStore.stream(true);

           stream.on("data", function(chunk) {
             endLen += chunk.length
             // Test length of chunk
             test.equal(5000, chunk.length);
             // Check each chunk's data
             for(var i = 0; i < 5000; i++) test.equal('+', String.fromCharCode(chunk[i]));
           });

           stream.on("end", function() {
             gotEnd = true;
           });

           stream.on("close", function() {
             test.equal(15000, endLen);
             test.equal(true, gotEnd);
             test.done();
           });
         });           
       });
     }
   )
  });    
}

/** 
 * @ignore
 */
exports.shouldCorrectlyWriteLargeFileBufferAndReadBack = function(test) {
  var db = client;
  var fileId = new ObjectID();
  var gridStore = new GridStore(db, fileId, "w", {root:'fs'});
  gridStore.chunkSize = 5000;

  gridStore.open(function(err, gridStore) {
    Step(
      function writeData() {
        var group = this.group();
        var d = new Buffer(5000);
        for(var j = 0; j < 5000;j++) {
          d[j] = 43;
        }         

        for(var i = 0; i < 15000; i += 5000) {
          gridStore.write(d, false, group());
        }   
      },

      function readAsStream() {
        gridStore.close(function(err, result) {
         var gotEnd = false;           
         var endLen = 0;

         var gridStore = new GridStore(db, fileId, "r");
         gridStore.open(function(err, gridStore) {
           var stream = gridStore.stream(true);

           stream.on("data", function(chunk) {
             endLen += chunk.length
             // Test length of chunk
             test.equal(5000, chunk.length);
             // Check each chunk's data
             for(var i = 0; i < 5000; i++) test.equal('+', String.fromCharCode(chunk[i]));
           });

           stream.on("end", function() {
             gotEnd = true;
           });

           stream.on("close", function() {
             test.equal(15000, endLen);
             test.equal(true, gotEnd);
             test.done();
           });
         });           
        });
      }
    )
  });    
}

/**
 * A simple example showing the usage of the stream method.
 *
 * @_class gridstore
 * @_function stream
 * @ignore
 */
exports.shouldCorrectlyReadFileUsingStream = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
   {auto_reconnect: false, poolSize: 1, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {
    // Open a file for reading
    var gridStoreR = new GridStore(db, "test_gs_read_stream", "r");
    // Open a file for writing
    var gridStoreW = new GridStore(db, "test_gs_read_stream", "w");
    // Read in the data of a file
    var data = fs.readFileSync("./test/gridstore/test_gs_weird_bug.png");

    var readLen = 0;
    var gotEnd = 0;
    
    // Open the file we are writting to
    gridStoreW.open(function(err, gs) {
      // Write the file content
      gs.write(data, function(err, gs) {
        // Flush the file to GridFS
        gs.close(function(err, result) {
          
          // Open the read file
          gridStoreR.open(function(err, gs) {
            
            // Create a stream to the file
            var stream = gs.stream(true);
            
            // Register events
            stream.on("data", function(chunk) {              
              // Record the length of the file
              readLen += chunk.length;
            });

            stream.on("end", function() {              
              // Record the end was called
              ++gotEnd;
            });

            stream.on("close", function() {
              // Verify the correctness of the read data
              test.equal(data.length, readLen);
              test.equal(1, gotEnd);
              
              db.close();
              test.done();
            });
          });
        });
      });
    });
  });
}
  
/** 
 * @ignore
 */
exports['Should return same data for streaming as for direct read'] = function(test) {
  var gridStoreR = new GridStore(client, "test_gs_read_stream", "r");
  var gridStoreW = new GridStore(client, "test_gs_read_stream", "w", {chunkSize:56});
  // var data = fs.readFileSync("./test/gridstore/test_gs_weird_bug.png");
  var data = new Buffer(100);
  for(var i = 0; i < 100; i++) {
    data[i] = i;
  }

  var readLen = 0;
  var gotEnd = 0;

  gridStoreW.open(function(err, gs) {
    gs.write(data, function(err, gs) {
      gs.close(function(err, result) {
        gridStoreR.open(function(err, gs) {
          var chunks = [];
          
          var stream = gs.stream(true);
          stream.on("data", function(chunk) {
            readLen += chunk.length;
            chunks.push(chunk);
          });
          stream.on("end", function() {
            ++gotEnd;
          });
          stream.on("close", function() {
            test.equal(data.length, readLen);
            test.equal(1, gotEnd);

            // Read entire file in one go and compare
            var gridStoreRead = new GridStore(client, "test_gs_read_stream", "r");
            gridStoreRead.open(function(err, gs) {
              gridStoreRead.read(function(err, data2) {
                // Put together all the chunks
                var streamData = new Buffer(data.length);
                var index = 0;
                for(var i = 0; i < chunks.length; i++) {
                  chunks[i].copy(streamData, index, 0);
                  index = index + chunks[i].length;
                }
                
                // Compare data
                for(var i = 0; i < data.length; i++) {
                  test.equal(data2[i], data[i])
                  test.equal(streamData[i], data[i])
                }
                
                test.done();
              })                
            })
          });
        });
      });
    });
  });    
}

/**
 * Retrieve the server information for the current
 * instance of the db client
 * 
 * @ignore
 */
exports.noGlobalsLeaked = function(test) {
  var leaks = gleak.detectNew();
  test.equal(0, leaks.length, "global var leak detected: " + leaks.join(', '));
  test.done();
}

/**
 * Retrieve the server information for the current
 * instance of the db client
 * 
 * @ignore
 */
var numberOfTestsRun = Object.keys(this).length - 2;