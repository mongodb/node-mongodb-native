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
  Server = mongodb.Server;

var MONGODB = 'integration_tests';
// var MONGODB = 'ruby-test-db';
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
 * A simple example showing the usage of the Gridstore.exist method.
 *
 * @_class gridstore
 * @_function GridStore.exist
 * @ignore
 */
exports.shouldCorrectlyExecuteGridStoreExistsByObjectId = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
   {auto_reconnect: false, poolSize: 1, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {
    
    // Open a file for writing
    var gridStore = new GridStore(db, null, "w");    
    gridStore.open(function(err, gridStore) {
      
      // Writing some content to the file
      gridStore.write("hello world!", function(err, gridStore) {
        
        // Flush the file to GridFS
        gridStore.close(function(err, result) {          
          
          // Check if the file exists using the id returned from the close function
          GridStore.exist(db, result._id, function(err, result) {
            test.equal(true, result);
          })

          // Show that the file does not exist for a random ObjectID
          GridStore.exist(db, new ObjectID(), function(err, result) {
            test.equal(false, result);
          });
          
          // Show that the file does not exist for a different file root
          GridStore.exist(db, result._id, 'another_root', function(err, result) {
            test.equal(false, result);

            db.close();
            test.done();
          });
        });
      });
    });
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlySafeFileAndReadFileByObjectId = function(test) {
  var gridStore = new GridStore(client, null, "w");
  gridStore.open(function(err, gridStore) {
    gridStore.write("hello world!", function(err, gridStore) {
      gridStore.close(function(err, result) {          
        
        // Let's read the file using object Id
        GridStore.read(client, result._id, function(err, data) {
          test.equal('hello world!', data);
          test.done();
        });          
      });
    });
  });    
}

/**
 * @ignore
 */
exports.shouldCorrectlyExecuteGridStoreExists = function(test) {
  var gridStore = new GridStore(client, "foobar", "w");
  gridStore.open(function(err, gridStore) {
    gridStore.write("hello world!", function(err, gridStore) {
      gridStore.close(function(err, result) {          
        GridStore.exist(client, 'foobar', function(err, result) {
          test.equal(true, result);
        });

        GridStore.exist(client, 'does_not_exist', function(err, result) {
          test.equal(false, result);
        });

        GridStore.exist(client, 'foobar', 'another_root', function(err, result) {
          test.equal(false, result);
          test.done();
        });
      });
    });
  });
}

/**
 * A simple example showing the usage of the eof method.
 *
 * @_class gridstore
 * @_function GridStore.list
 * @ignore
 */
exports.shouldCorrectlyExecuteGridStoreList = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
   {auto_reconnect: false, poolSize: 1, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {
    
    // Open a file for writing
    var gridStore = new GridStore(db, "foobar2", "w");
    gridStore.open(function(err, gridStore) {
      
      // Write some content to the file
      gridStore.write("hello world!", function(err, gridStore) {
        // Flush to GridFS
        gridStore.close(function(err, result) {
          
          // List the existing files
          GridStore.list(db, function(err, items) {
            var found = false;
            items.forEach(function(filename) {
              if(filename == 'foobar2') found = true;
            });

            test.ok(items.length >= 1);
            test.ok(found);
          });
        
          // List the existing files but return only the file ids
          GridStore.list(db, {id:true}, function(err, items) {
            var found = false;
            items.forEach(function(id) {
              test.ok(typeof id == 'object');
            });

            test.ok(items.length >= 1);
          });          

          // List the existing files in a specific root collection
          GridStore.list(db, 'fs', function(err, items) {
            var found = false;
            items.forEach(function(filename) {
              if(filename == 'foobar2') found = true;
            });

            test.ok(items.length >= 1);
            test.ok(found);
          });

          // List the existing files in a different root collection where the file is not located
          GridStore.list(client, 'my_fs', function(err, items) {
            var found = false;
            items.forEach(function(filename) {
              if(filename == 'foobar2') found = true;
            });

            test.ok(items.length >= 0);
            test.ok(!found);

            // Write another file to GridFS
            var gridStore2 = new GridStore(db, "foobar3", "w");
            gridStore2.open(function(err, gridStore) {
              // Write the content
              gridStore2.write('my file', function(err, gridStore) {
                // Flush to GridFS
                gridStore.close(function(err, result) {
                  
                  // List all the available files and verify that our files are there
                  GridStore.list(db, function(err, items) {
                    var found = false;
                    var found2 = false;

                    items.forEach(function(filename) {
                      if(filename == 'foobar2') found = true;
                      if(filename == 'foobar3') found2 = true;
                    });

                    test.ok(items.length >= 2);
                    test.ok(found);
                    test.ok(found2);
                  
                    db.close();
                    test.done();
                  });
                });
              });
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
exports.shouldCorrectlyPeformGridStoreReadLength = function(test) {
  var gridStore = new GridStore(client, "test_gs_read_length", "w");
  gridStore.open(function(err, gridStore) {
    gridStore.write("hello world!", function(err, gridStore) {
      gridStore.close(function(err, result) {
        // Assert that we have overwriten the data
        GridStore.read(client, 'test_gs_read_length', 5, function(err, data) {
          test.equal('hello', data);
          test.done();
        });
      });
    });
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyReadFromFileWithOffset = function(test) {
  var gridStore = new GridStore(client, "test_gs_read_with_offset", "w");
  gridStore.open(function(err, gridStore) {
    gridStore.write("hello, world!", function(err, gridStore) {
      gridStore.close(function(err, result) {
        // Assert that we have overwriten the data
        GridStore.read(client, 'test_gs_read_with_offset', 5, 7, function(err, data) {
          test.equal('world', data);
        });

        GridStore.read(client, 'test_gs_read_with_offset', null, 7, function(err, data) {
          test.equal('world!', data);
          test.done();
        });
      });
    });
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyHandleMultipleChunkGridStore = function(test) {
  var fs_client = new Db(MONGODB, new Server("127.0.0.1", 27017, {auto_reconnect: false}), {native_parser: (process.env['TEST_NATIVE'] != null)});
  fs_client.open(function(err, fs_client) {
    fs_client.dropDatabase(function(err, done) {
      var gridStore = new GridStore(fs_client, "test_gs_multi_chunk", "w");
      gridStore.open(function(err, gridStore) {
        gridStore.chunkSize = 512;
        var file1 = ''; var file2 = ''; var file3 = '';
        for(var i = 0; i < gridStore.chunkSize; i++) { file1 = file1 + 'x'; }
        for(var i = 0; i < gridStore.chunkSize; i++) { file2 = file2 + 'y'; }
        for(var i = 0; i < gridStore.chunkSize; i++) { file3 = file3 + 'z'; }

        gridStore.write(file1, function(err, gridStore) {
          gridStore.write(file2, function(err, gridStore) {
            gridStore.write(file3, function(err, gridStore) {
              gridStore.close(function(err, result) {
                fs_client.collection('fs.chunks', function(err, collection) {
                  collection.count(function(err, count) {
                    test.equal(3, count);

                    GridStore.read(fs_client, 'test_gs_multi_chunk', function(err, data) {
                      test.equal(512*3, data.length);                        
                      fs_client.close();
                      
                      test.done();
                    });
                  })
                });
              });
            });
          });
        });
      });
    });
  });
}

/**
 * A simple example showing the usage of the puts method.
 *
 * @_class gridstore
 * @_function puts
 * @ignore
 */
exports.shouldCorrectlyReadlinesAndPutLines = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
   {auto_reconnect: false, poolSize: 1, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {
    // Open a file for writing
    var gridStore = new GridStore(db, "test_gs_puts_and_readlines", "w");    
    gridStore.open(function(err, gridStore) {
      
      // Write a line to the file using the puts method
      gridStore.puts("line one", function(err, gridStore) {
        
        // Flush the file to GridFS
        gridStore.close(function(err, result) {
          
          // Read in the entire contents
          GridStore.read(db, 'test_gs_puts_and_readlines', function(err, data) {
            test.equal("line one\n", data.toString());

            db.close();
            test.done();
          });
        });        
      });
    });
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyHandleUnlinkingWeirdName = function(test) {
  var fs_client = new Db(MONGODB, new Server("127.0.0.1", 27017, {auto_reconnect: false}), {native_parser: (process.env['TEST_NATIVE'] != null)});
  fs_client.open(function(err, fs_client) {
    fs_client.dropDatabase(function(err, done) {
      var gridStore = new GridStore(fs_client, "9476700.937375426_1271170118964-clipped.png", "w", {'root':'articles'});
      gridStore.open(function(err, gridStore) {
        gridStore.write("hello, world!", function(err, gridStore) {
          gridStore.close(function(err, result) {
            fs_client.collection('articles.files', function(err, collection) {
              collection.count(function(err, count) {
                test.equal(1, count);
              })
            });

            fs_client.collection('articles.chunks', function(err, collection) {
              collection.count(function(err, count) {
                test.equal(1, count);

                // Unlink the file
                GridStore.unlink(fs_client, '9476700.937375426_1271170118964-clipped.png', {'root':'articles'}, function(err, gridStore) {
                  fs_client.collection('articles.files', function(err, collection) {
                    collection.count(function(err, count) {
                      test.equal(0, count);
                    })
                  });

                  fs_client.collection('articles.chunks', function(err, collection) {
                    collection.count(function(err, count) {
                      test.equal(0, count);

                      fs_client.close();
                      test.done();
                    })
                  });
                });
              })
            });
          });
        });
      });
    });
  });
}

/**
 * A simple example showing the usage of the GridStore.unlink method.
 *
 * @_class gridstore
 * @_function GridStore.unlink
 * @ignore
 */
exports.shouldCorrectlyUnlink = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
   {auto_reconnect: false, poolSize: 1, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {
    
    // Open a new file for writing
    var gridStore = new GridStore(db, "test_gs_unlink", "w");
    gridStore.open(function(err, gridStore) {
      
      // Write some content
      gridStore.write("hello, world!", function(err, gridStore) {
        
        // Flush file to GridFS
        gridStore.close(function(err, result) {
          
          // Verify the existance of the fs.files document
          db.collection('fs.files', function(err, collection) {
            collection.count(function(err, count) {
              test.equal(1, count);
            })
          });

          // Verify the existance of the fs.chunks chunk document
          db.collection('fs.chunks', function(err, collection) {
            collection.count(function(err, count) {
              test.equal(1, count);

              // Unlink the file (removing it)
              GridStore.unlink(db, 'test_gs_unlink', function(err, gridStore) {
                
                // Verify that fs.files document is gone
                db.collection('fs.files', function(err, collection) {
                  collection.count(function(err, count) {
                    test.equal(0, count);
                  })
                });

                // Verify that fs.chunks chunk documents are gone
                db.collection('fs.chunks', function(err, collection) {
                  collection.count(function(err, count) {
                    test.equal(0, count);
                    
                    db.close();
                    test.done();
                  })
                });
              });
            })
          });
        });
      });
    });
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyUnlinkAnArrayOfFiles = function(test) {
  var fs_client = new Db(MONGODB, new Server("127.0.0.1", 27017, {auto_reconnect: false}), {native_parser: (process.env['TEST_NATIVE'] != null)});
  fs_client.open(function(err, fs_client) {
    fs_client.dropDatabase(function(err, done) {
      var gridStore = new GridStore(fs_client, "test_gs_unlink_as_array", "w");
      gridStore.open(function(err, gridStore) {
        gridStore.write("hello, world!", function(err, gridStore) {
          gridStore.close(function(err, result) {
            fs_client.collection('fs.files', function(err, collection) {
              collection.count(function(err, count) {
                test.equal(1, count);
              })
            });

            fs_client.collection('fs.chunks', function(err, collection) {
              collection.count(function(err, count) {
                test.equal(1, count);

                // Unlink the file
                GridStore.unlink(fs_client, ['test_gs_unlink_as_array'], function(err, gridStore) {
                  fs_client.collection('fs.files', function(err, collection) {
                    collection.count(function(err, count) {
                      test.equal(0, count);
                    })
                  });

                  fs_client.collection('fs.chunks', function(err, collection) {
                    collection.count(function(err, count) {
                      test.equal(0, count);
                      fs_client.close();
                      
                      test.done();
                    })
                  });
                });
              })
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
exports.shouldCorrectlyWriteFileToGridStore= function(test) {
  var gridStore = new GridStore(client, 'test_gs_writing_file', 'w');
  var fileSize = fs.statSync('./test/gridstore/test_gs_weird_bug.png').size;
  var data = fs.readFileSync('./test/gridstore/test_gs_weird_bug.png');
  
  gridStore.open(function(err, gridStore) {
    gridStore.writeFile('./test/gridstore/test_gs_weird_bug.png', function(err, doc) {
      GridStore.read(client, 'test_gs_writing_file', function(err, fileData) {
        test.equal(data.toString('hex'), fileData.toString('hex'));        
        test.equal(fileSize, fileData.length);
        
        // Ensure we have a md5
        var gridStore2 = new GridStore(client, 'test_gs_writing_file', 'r');
        gridStore2.open(function(err, gridStore2) {
          test.ok(gridStore2.md5 != null)            
          test.done();
        });          
      });
    });
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyWriteFileToGridStoreUsingObjectId= function(test) {
  var gridStore = new GridStore(client, null, 'w');
  var fileSize = fs.statSync('./test/gridstore/test_gs_weird_bug.png').size;
  var data = fs.readFileSync('./test/gridstore/test_gs_weird_bug.png');
  
  gridStore.open(function(err, gridStore) {
    gridStore.writeFile('./test/gridstore/test_gs_weird_bug.png', function(err, doc) {
      
      GridStore.read(client, doc._id, function(err, fileData) {
        test.equal(data.toString('hex'), fileData.toString('hex'));
        test.equal(fileSize, fileData.length);
        
        // Ensure we have a md5
        var gridStore2 = new GridStore(client, doc._id, 'r');
        gridStore2.open(function(err, gridStore2) {
          test.ok(gridStore2.md5 != null)            
          test.done();
        });          
      });
    });
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyPerformWorkingFiledRead = function(test) {
  var gridStore = new GridStore(client, "test_gs_working_field_read", "w");
  var data = fs.readFileSync("./test/gridstore/test_gs_working_field_read.pdf", 'binary');

  gridStore.open(function(err, gridStore) {
    gridStore.write(data, function(err, gridStore) {
      gridStore.close(function(err, result) {
        // Assert that we have overwriten the data
        GridStore.read(client, 'test_gs_working_field_read', function(err, fileData) {
          test.equal(data.length, fileData.length);
          test.done();
        });
      });
    });
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyReadAndWriteFile = function(test) {
  var gridStore = new GridStore(client, "test_gs_weird_bug", "w");
  var data = fs.readFileSync("./test/gridstore/test_gs_weird_bug.png", 'binary');

  gridStore.open(function(err, gridStore) {
    gridStore.write(data, function(err, gridStore) {
      gridStore.close(function(err, result) {
        // Assert that we have overwriten the data
        GridStore.read(client, 'test_gs_weird_bug', function(err, fileData) {
          test.equal(data.length, fileData.length);
          test.done();
        });
      });
    });
  });
}


/**
 * A simple example showing the usage of the read method.
 *
 * @_class gridstore
 * @_function read
 * @ignore
 */
exports.shouldCorrectlyWriteAndReadJpgImage = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
   {auto_reconnect: false, poolSize: 1, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {
    // Read in the content of a file
    var data = fs.readFileSync('./test/gridstore/iya_logo_final_bw.jpg');
    // Create a new file
    var gs = new GridStore(db, "test", "w");
    // Open the file
    gs.open(function(err, gs) {
      // Write the file to GridFS
      gs.write(data, function(err, gs) {
        // Flush to the GridFS
        gs.close(function(err, gs) {
        
          // Define the file we wish to read
          var gs2 = new GridStore(db, "test", "r");
          // Open the file
          gs2.open(function(err, gs) {
            // Set the pointer of the read head to the start of the gridstored file
            gs2.seek(0, function() {
              // Read the entire file
              gs2.read(function(err, data2) {
                // Compare the file content against the orgiinal
                test.equal(data.toString('hex'), data2.toString('hex'));

                db.close();
                test.done();
              });
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
exports.shouldCorrectlyReadAndWriteBuffersMultipleChunks = function(test) {
  var gridStore = new GridStore(client, null, 'w');
  // Force multiple chunks to be stored
  gridStore.chunkSize = 5000;
  var fileSize = fs.statSync('./test/gridstore/test_gs_weird_bug.png').size;
  var data = fs.readFileSync('./test/gridstore/test_gs_weird_bug.png');
  
  gridStore.open(function(err, gridStore) {
      
    // Write the file using write
    gridStore.write(data, function(err, doc) {
      gridStore.close(function(err, doc) {

        // Read the file using readBuffer
        new GridStore(client, doc._id, 'r').open(function(err, gridStore) {
          gridStore.read(function(err, data2) {
            test.equal(data.toString('base64'), data2.toString('base64'));
            test.done();            
          })
        });          
      });
    })        
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyReadAndWriteBuffersSingleChunks = function(test) {
  var gridStore = new GridStore(client, null, 'w');
  // Force multiple chunks to be stored
  var fileSize = fs.statSync('./test/gridstore/test_gs_weird_bug.png').size;
  var data = fs.readFileSync('./test/gridstore/test_gs_weird_bug.png');
  
  gridStore.open(function(err, gridStore) {
      
    // Write the file using writeBuffer
    gridStore.write(data, function(err, doc) {
      gridStore.close(function(err, doc) {

        // Read the file using readBuffer
        new GridStore(client, doc._id, 'r').open(function(err, gridStore) {
          gridStore.read(function(err, data2) {
            test.equal(data.toString('base64'), data2.toString('base64'));
            test.done();            
          })
        });          
      });
    })        
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyReadAndWriteBuffersUsingNormalWriteWithMultipleChunks = function(test) {
  var gridStore = new GridStore(client, null, 'w');
  // Force multiple chunks to be stored
  gridStore.chunkSize = 5000;
  var fileSize = fs.statSync('./test/gridstore/test_gs_weird_bug.png').size;
  var data = fs.readFileSync('./test/gridstore/test_gs_weird_bug.png');
  
  gridStore.open(function(err, gridStore) {
      
    // Write the buffer using the .write method that should use writeBuffer correctly
    gridStore.write(data, function(err, doc) {
      gridStore.close(function(err, doc) {

        // Read the file using readBuffer
        new GridStore(client, doc._id, 'r').open(function(err, gridStore) {
          gridStore.read(function(err, data2) {
            test.equal(data.toString('base64'), data2.toString('base64'));
            test.done();            
          })
        });          
      });
    })        
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyReadAndWriteBuffersSingleChunksAndVerifyExistance = function(test) {
  var gridStore = new GridStore(client, null, 'w');
  // Force multiple chunks to be stored
  var fileSize = fs.statSync('./test/gridstore/test_gs_weird_bug.png').size;
  var data = fs.readFileSync('./test/gridstore/test_gs_weird_bug.png');
  
  gridStore.open(function(err, gridStore) {
      
    // Write the file using writeBuffer
    gridStore.write(data, function(err, doc) {
      gridStore.close(function(err, doc) {

        // Read the file using readBuffer
        GridStore.exist(client, doc._id, function(err, result) {
          test.equal(null, err);
          test.equal(true, result);

          client.close();
          test.done();
        });          
      });
    })        
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlySaveDataByObjectID = function(test) {
  var id = new ObjectID();
  var gridStore = new GridStore(client, id, 'w');

  gridStore.open(function(err, gridStore) {
    gridStore.write('bar', function(err, gridStore) {
      gridStore.close(function(err, result) {

        GridStore.exist(client, id, function(err, result) {
          test.equal(null, err);
          test.equal(true, result);

          client.close();
          test.done();
        });
      });
    });
  });    
}

/**
 * @ignore
 */
exports.shouldCheckExistsByUsingRegexp = function(test) {
  var gridStore = new GridStore(client, 'shouldCheckExistsByUsingRegexp.txt', 'w');

  gridStore.open(function(err, gridStore) {
    gridStore.write('bar', function(err, gridStore) {
      gridStore.close(function(err, result) {

        GridStore.exist(client, /shouldCheck/, function(err, result) {
          test.equal(null, err);
          test.equal(true, result);

          client.close();
          test.done();
        });
      });
    });
  });    
}

/**
 * A simple example showing opening a file using a filename, writing to it and saving it.
 *
 * @_class gridstore
 * @_function open
 * @ignore
 */
exports.shouldCorrectlySaveSimpleFileToGridStoreUsingFilename = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
   {auto_reconnect: false, poolSize: 1, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {
    // Create a new instance of the gridstore
    var gridStore = new GridStore(db, 'ourexamplefiletowrite.txt', 'w');

    // Open the file
    gridStore.open(function(err, gridStore) {
      
      // Write some data to the file
      gridStore.write('bar', function(err, gridStore) {
        test.equal(null, err);
        
        // Close (Flushes the data to MongoDB)
        gridStore.close(function(err, result) {
          test.equal(null, err);

          // Verify that the file exists
          GridStore.exist(db, 'ourexamplefiletowrite.txt', function(err, result) {
            test.equal(null, err);
            test.equal(true, result);

            db.close();
            test.done();
          });
        });
      });
    });
  });
}

/**
 * A simple example showing opening a file using an ObjectID, writing to it and saving it.
 *
 * @_class gridstore
 * @_function open
 * @ignore
 */
exports.shouldCorrectlySaveSimpleFileToGridStoreUsingObjectID = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
   {auto_reconnect: false, poolSize: 1, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {
    // Our file ID
    var fileId = new ObjectID();
    
    // Create a new instance of the gridstore
    var gridStore = new GridStore(db, fileId, 'w');

    // Open the file
    gridStore.open(function(err, gridStore) {
      
      // Write some data to the file
      gridStore.write('bar', function(err, gridStore) {
        test.equal(null, err);
        
        // Close (Flushes the data to MongoDB)
        gridStore.close(function(err, result) {
          test.equal(null, err);

          // Verify that the file exists
          GridStore.exist(db, fileId, function(err, result) {
            test.equal(null, err);
            test.equal(true, result);

            db.close();
            test.done();
          });
        });
      });
    });
  });
}

/**
 * A simple example showing how to write a file to Gridstore using file location path.
 *
 * @_class gridstore
 * @_function writeFile
 * @ignore
 */
exports.shouldCorrectlySaveSimpleFileToGridStoreUsingWriteFile = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
   {auto_reconnect: false, poolSize: 1, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {
    // Our file ID
    var fileId = new ObjectID();

    // Open a new file
    var gridStore = new GridStore(db, fileId, 'w');
    
    // Read the filesize of file on disk (provide your own)
    var fileSize = fs.statSync('./test/gridstore/test_gs_weird_bug.png').size;
    // Read the buffered data for comparision reasons
    var data = fs.readFileSync('./test/gridstore/test_gs_weird_bug.png');

    // Open the new file
    gridStore.open(function(err, gridStore) {
      
      // Write the file to gridFS
      gridStore.writeFile('./test/gridstore/test_gs_weird_bug.png', function(err, doc) {
        
        // Read back all the written content and verify the correctness
        GridStore.read(db, fileId, function(err, fileData) {
          test.equal(data.toString('hex'), fileData.toString('hex'))
          test.equal(fileSize, fileData.length);

          db.close();
          test.done();
        });
      });
    });
  });
}   

/**
 * A simple example showing how to write a file to Gridstore using a file handle.
 *
 * @_class gridstore
 * @_function writeFile
 * @ignore
 */
exports.shouldCorrectlySaveSimpleFileToGridStoreUsingWriteFileWithHandle = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
   {auto_reconnect: false, poolSize: 1, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {
    // Our file ID
    var fileId = new ObjectID();

    // Open a new file
    var gridStore = new GridStore(db, fileId, 'w');
    
    // Read the filesize of file on disk (provide your own)
    var fileSize = fs.statSync('./test/gridstore/test_gs_weird_bug.png').size;
    // Read the buffered data for comparision reasons
    var data = fs.readFileSync('./test/gridstore/test_gs_weird_bug.png');

    // Open a file handle for reading the file
    var fd = fs.openSync('./test/gridstore/test_gs_weird_bug.png', 'r', 0666);

    // Open the new file
    gridStore.open(function(err, gridStore) {
      
      // Write the file to gridFS using the file handle
      gridStore.writeFile(fd, function(err, doc) {
        
        // Read back all the written content and verify the correctness
        GridStore.read(db, fileId, function(err, fileData) {
          test.equal(data.toString('hex'), fileData.toString('hex'));
          test.equal(fileSize, fileData.length);

          db.close();
          test.done();
        });
      });
    });
  });
}   

/**
 * A simple example showing how to use the write command with strings and Buffers.
 *
 * @_class gridstore
 * @_function write
 * @ignore
 */
exports.shouldCorrectlySaveSimpleFileToGridStoreUsingWriteWithStringsAndBuffers = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
   {auto_reconnect: false, poolSize: 1, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {
    // Our file ID
    var fileId = new ObjectID();

    // Open a new file
    var gridStore = new GridStore(db, fileId, 'w');
    
    // Open the new file
    gridStore.open(function(err, gridStore) {
      
      // Write a text string
      gridStore.write('Hello world', function(err, gridStore) {
        
        // Write a buffer
        gridStore.write(new Buffer('Buffer Hello world'), function(err, gridStore) {

          // Close the 
          gridStore.close(function(err, result) {
            
            // Read back all the written content and verify the correctness
            GridStore.read(db, fileId, function(err, fileData) {
              test.equal('Hello worldBuffer Hello world', fileData.toString());

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
 * A simple example showing how to use the write command with strings and Buffers.
 *
 * @_class gridstore
 * @_function close
 * @ignore
 */
exports.shouldCorrectlySaveSimpleFileToGridStoreUsingClose = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
   {auto_reconnect: false, poolSize: 1, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {
    // Our file ID
    var fileId = new ObjectID();

    // Open a new file
    var gridStore = new GridStore(db, fileId, 'w');
    
    // Open the new file
    gridStore.open(function(err, gridStore) {
      
      // Write a text string
      gridStore.write('Hello world', function(err, gridStore) {
        
        // Close the 
        gridStore.close(function(err, result) {
          test.equal(err, null);
                    
          db.close();
          test.done();
        });
      });
    });
  });
}   

/**
 * A simple example showing how to access the chunks collection object.
 *
 * @_class gridstore
 * @_function chunkCollection
 * @ignore
 */
exports.shouldCorrectlyAccessChunkCollection = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
   {auto_reconnect: false, poolSize: 1, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {
    // Our file ID
    var fileId = new ObjectID();

    // Open a new file
    var gridStore = new GridStore(db, fileId, 'w');
    
    // Open the new file
    gridStore.open(function(err, gridStore) {
      
      // Access the Chunk collection
      gridStore.chunkCollection(function(err, collection) {
        test.equal(err, null);
        test.ok(collection instanceof Collection);
        
        db.close();
        test.done();
      });      
    });
  });
} 

/**
 * A simple example showing how to use the instance level unlink command to delete a gridstore item.
 *
 * @_class gridstore
 * @_function unlink
 * @ignore
 */
exports.shouldCorrectlySaveSimpleFileToGridStoreUsingCloseAndThenUnlinkIt = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
   {auto_reconnect: false, poolSize: 1, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {
    // Our file ID
    var fileId = new ObjectID();

    // Open a new file
    var gridStore = new GridStore(db, fileId, 'w');
    
    // Open the new file
    gridStore.open(function(err, gridStore) {
      
      // Write a text string
      gridStore.write('Hello world', function(err, gridStore) {
        
        // Close the 
        gridStore.close(function(err, result) {
          test.equal(err, null);
          
          // Open the file again and unlin it
          new GridStore(db, fileId, 'r').open(function(err, gridStore) {
            
            // Unlink the file
            gridStore.unlink(function(err, result) {
              test.equal(null, err);
              
              // Verify that the file no longer exists
              GridStore.exist(db, fileId, function(err, result) {
                test.equal(null, err);
                test.equal(false, result);

                db.close();
                test.done();
              });
            });            
          });                    
        });
      });
    });
  });
}   

/**
 * A simple example showing how to access the files collection object.
 *
 * @_class gridstore
 * @_function collection
 * @ignore
 */
exports.shouldCorrectlyAccessFilesCollection = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
   {auto_reconnect: false, poolSize: 1, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {
    // Our file ID
    var fileId = new ObjectID();

    // Open a new file
    var gridStore = new GridStore(db, fileId, 'w');
    
    // Open the new file
    gridStore.open(function(err, gridStore) {
      
      // Access the Chunk collection
      gridStore.collection(function(err, collection) {
        test.equal(err, null);
        test.ok(collection instanceof Collection);
        
        db.close();
        test.done();
      });      
    });
  });
} 

/**
 * A simple example showing reading back using readlines to split the text into lines by the seperator provided.
 *
 * @_class gridstore
 * @_function GridStore.readlines
 * @ignore
 */
exports.shouldCorrectlyPutACoupleOfLinesInGridStoreAndUseReadlines = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
   {auto_reconnect: false, poolSize: 1, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {
    // Our file ID
    var fileId = new ObjectID();

    // Open a new file
    var gridStore = new GridStore(db, fileId, 'w');

    // Open the new file
    gridStore.open(function(err, gridStore) {

      // Write one line to gridStore
      gridStore.puts("line one", function(err, gridStore) {

        // Write second line to gridStore
        gridStore.puts("line two", function(err, gridStore) {

          // Write third line to gridStore
          gridStore.puts("line three", function(err, gridStore) {

            // Flush file to disk
            gridStore.close(function(err, result) {

              // Read back all the lines
              GridStore.readlines(db, fileId, function(err, lines) {
                test.deepEqual(["line one\n", "line two\n", "line three\n"], lines);

                db.close();
                test.done();
              });
            });
          });
        });
      });
    });
  });
}

/**
 * A simple example showing reading back using readlines to split the text into lines by the seperator provided.
 *
 * @_class gridstore
 * @_function readlines
 * @ignore
 */
exports.shouldCorrectlyPutACoupleOfLinesInGridStoreAndUseInstanceReadlines = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
   {auto_reconnect: false, poolSize: 1, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {
    // Our file ID
    var fileId = new ObjectID();

    // Open a new file
    var gridStore = new GridStore(db, fileId, 'w');

    // Open the new file
    gridStore.open(function(err, gridStore) {

      // Write one line to gridStore
      gridStore.puts("line one", function(err, gridStore) {

        // Write second line to gridStore
        gridStore.puts("line two", function(err, gridStore) {

          // Write third line to gridStore
          gridStore.puts("line three", function(err, gridStore) {

            // Flush file to disk
            gridStore.close(function(err, result) {

              // Open file for reading
              gridStore = new GridStore(db, fileId, 'r');
              gridStore.open(function(err, gridStore) {
                
                // Read all the lines and verify correctness
                gridStore.readlines(function(err, lines) {                  
                  test.deepEqual(["line one\n", "line two\n", "line three\n"], lines);

                  db.close();
                  test.done();
                });
              });
            });
          });
        });
      });
    });
  });
}

/**
 * A simple example showing the usage of the read method.
 *
 * @_class gridstore
 * @_function GridStore.read
 * @ignore
 */
exports.shouldCorrectlyPutACoupleOfLinesInGridStoreRead = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
   {auto_reconnect: false, poolSize: 1, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {
    // Create a new file
    var gridStore = new GridStore(db, null, "w");
    // Read in the content from a file, replace with your own
    var data = fs.readFileSync("./test/gridstore/test_gs_weird_bug.png");

    // Open the file
    gridStore.open(function(err, gridStore) {
      // Write the binary file data to GridFS
      gridStore.write(data, function(err, gridStore) {
        // Flush the remaining data to GridFS
        gridStore.close(function(err, result) {
          
          // Read in the whole file and check that it's the same content
          GridStore.read(client, result._id, function(err, fileData) {
            test.equal(data.length, fileData.length);

            db.close();
            test.done();
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