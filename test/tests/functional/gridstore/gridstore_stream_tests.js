var Step = require('step')
  , fs = require('fs');

/** 
 * @ignore
 */
exports.shouldCorrectlyWriteLargeFileStringAndReadBack = function(configuration, test) {
  var GridStore = configuration.getMongoPackage().GridStore
    , ObjectID = configuration.getMongoPackage().ObjectID;

  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {  
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
               db.close();
               test.done();
             });
           });           
         });
       }
     )
    });
  });
}

/** 
 * @ignore
 */
exports.shouldCorrectlyWriteLargeFileBufferAndReadBack = function(configuration, test) {
  var GridStore = configuration.getMongoPackage().GridStore
    , ObjectID = configuration.getMongoPackage().ObjectID;
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
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
               db.close();
               test.done();
             });
           });           
          });
        }
      )
    });
  });
}

/**
 * A simple example showing the usage of the stream method.
 *
 * @_class gridstore
 * @_function stream
 * @ignore
 */
exports.shouldCorrectlyReadFileUsingStream = function(configuration, test) {
  var GridStore = configuration.getMongoPackage().GridStore
    , ObjectID = configuration.getMongoPackage().ObjectID;
  var db = configuration.newDbInstance({w:0}, {poolSize:1});

  // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
  // DOC_START
  // Establish connection to db  
  db.open(function(err, db) {
    // Open a file for reading
    var gridStoreR = new GridStore(db, "test_gs_read_stream", "r");
    // Open a file for writing
    var gridStoreW = new GridStore(db, "test_gs_read_stream", "w");
    // Read in the data of a file
    var data = fs.readFileSync("./test/tests/functional/gridstore/test_gs_weird_bug.png");

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
  // DOC_END
}

/**
 * A simple example showing how to pipe a file stream through from gridfs to a file
 *
 * @_class gridstore
 * @_function stream
 * @ignore
 */
exports.shouldCorrectlyPipeAGridFsToAfile = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  requires: {node: "<0.11.0"},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.getMongoPackage().GridStore;    
    var db = configuration.newDbInstance({w:0}, {poolSize:1});

    // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
    // DOC_START
    // Establish connection to db  
    db.open(function(err, db) {
      // Open a file for writing
      var gridStoreWrite = new GridStore(db, "test_gs_read_stream_pipe", "w", {chunkSize:1024});
      gridStoreWrite.writeFile("./test/tests/functional/gridstore/test_gs_weird_bug.png", function(err, result) {      
        // Ensure we correctly returning a Gridstore object
        test.ok(typeof result.close == 'function');
        // Open the gridStore for reading and pipe to a file
        var gridStore = new GridStore(db, "test_gs_read_stream_pipe", "r");
        gridStore.open(function(err, gridStore) {
          // Grab the read stream
          var stream = gridStore.stream(true);
          // When the stream is finished close the database
          stream.on("end", function(err) {          
            // Read the original content
            var originalData = fs.readFileSync("./test/tests/functional/gridstore/test_gs_weird_bug.png");
            // Ensure we are doing writing before attempting to open the file
            fs.readFile("./test_gs_weird_bug_streamed.tmp", function(err, streamedData) {                      
              // Compare the data
              for(var i = 0; i < originalData.length; i++) {
                test.equal(originalData[i], streamedData[i])
              }
              
              // Close the database
              db.close();
              test.done();          
            });
          })

          // Create a file write stream
          var fileStream = fs.createWriteStream("./test_gs_weird_bug_streamed.tmp");
          // Pipe out the data
          stream.pipe(fileStream);
        })
      })
    });
    // DOC_END
  }
}
  
/** 
 * @ignore
 */
exports['Should return same data for streaming as for direct read'] = function(configuration, test) {
  var GridStore = configuration.getMongoPackage().GridStore;

  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    var gridStoreR = new GridStore(db, "test_gs_read_stream", "r");
    var gridStoreW = new GridStore(db, "test_gs_read_stream", "w", {chunkSize:56});
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
              var gridStoreRead = new GridStore(db, "test_gs_read_stream", "r");
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
                  
                  db.close();
                  test.done();
                })                
              })
            });
          });
        });
      });
    });
  });
}