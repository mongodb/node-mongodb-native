var fs = require('fs')
  , format = require('util').format
  , child_process = require('child_process');

/**
 * @ignore
 */
exports.shouldCreateNewGridStoreObject = function(configuration, test) {
  var GridStore = configuration.getMongoPackage().GridStore
    , ObjectID = configuration.getMongoPackage().ObjectID;
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
	  var gs1
	    , gs2
	    , id = new ObjectID()
	    , filename = 'test_create_gridstore';

	  var gs = new GridStore(db, id, filename, "w");
	  test.ok(gs instanceof GridStore);
	  test.equal(id, gs.fileId);
	  test.equal(filename, gs.filename);

	  var gs = GridStore(db, id, filename, "w");
	  test.ok(gs instanceof GridStore);
	  test.equal(id, gs.fileId);
	  test.equal(filename, gs.filename);
	  db.close();
	  test.done();
	});
};

/**
 * @ignore
 */
exports.shouldCreateNewGridStoreObjectWithIntId = function(configuration, test) {
  var GridStore = configuration.getMongoPackage().GridStore
    , ObjectID = configuration.getMongoPackage().ObjectID;
  var db = configuration.newDbInstance({w:0}, {poolSize:1});

  var gs1
    , gs2
    , id = 123
    , filename = 'test_create_gridstore';

  var gs = new GridStore(db, id, filename, "w");
  test.ok(gs instanceof GridStore);
  test.equal(id, gs.fileId);
  test.equal(filename, gs.filename);

  var gs = GridStore(db, id, filename, "w");
  test.ok(gs instanceof GridStore);
  test.equal(id, gs.fileId);
  test.equal(filename, gs.filename);

  db.close();
  test.done();
};

/**
 * @ignore
 */
exports.shouldCreateNewGridStoreObjectWithStringId = function(configuration, test) {
  var GridStore = configuration.getMongoPackage().GridStore
    , ObjectID = configuration.getMongoPackage().ObjectID;
  var db = configuration.newDbInstance({w:0}, {poolSize:1});

  var gs1
    , gs2
    , id = 'test'
    , filename = 'test_create_gridstore';

  var gs = new GridStore(db, id, filename, "w");
  test.ok(gs instanceof GridStore);
  test.equal(id, gs.fileId);
  test.equal(filename, gs.filename);

  var gs = GridStore(db, id, filename, "w");
  test.ok(gs instanceof GridStore);
  test.equal(id, gs.fileId);
  test.equal(filename, gs.filename);

  db.close();
  test.done();
};

/**
 * A simple example showing the usage of the Gridstore.exist method.
 *
 * @_class gridstore
 * @_function GridStore.exist
 * @ignore
 */
exports.shouldCorrectlyExecuteGridStoreExistsByObjectId = function(configuration, test) {
  var GridStore = configuration.getMongoPackage().GridStore
    , ObjectID = configuration.getMongoPackage().ObjectID;
  var db = configuration.newDbInstance({w:0}, {poolSize:1});

  // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
  // DOC_START
  // Establish connection to db
  db.open(function(err, db) {

    // Open a file for writing
    var gridStore = new GridStore(db, null, "w");
    gridStore.open(function(err, gridStore) {
      test.equal(null, err);

      // Writing some content to the file
      gridStore.write("hello world!", function(err, gridStore) {
        test.equal(null, err);

        // Flush the file to GridFS
        gridStore.close(function(err, result) {
          test.equal(null, err);

          // Check if the file exists using the id returned from the close function
          GridStore.exist(db, result._id, function(err, result) {
            test.equal(null, err);
            test.equal(true, result);
          })

          // Show that the file does not exist for a random ObjectID
          GridStore.exist(db, new ObjectID(), function(err, result) {
            test.equal(null, err);
            test.equal(false, result);
          });

          // Show that the file does not exist for a different file root
          GridStore.exist(db, result._id, 'another_root', function(err, result) {
            test.equal(null, err);
            test.equal(false, result);

            db.close();
            test.done();
          });
        });
      });
    });
  });
  // DOC_END
}

/**
 * @ignore
 */
exports.shouldCorrectlySafeFileAndReadFileByObjectId = function(configuration, test) {
  var GridStore = configuration.getMongoPackage().GridStore
    , ObjectID = configuration.getMongoPackage().ObjectID;

  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
	  var gridStore = new GridStore(db, null, "w");
	  gridStore.open(function(err, gridStore) {
	    gridStore.write("hello world!", function(err, gridStore) {
	      gridStore.close(function(err, result) {

	        // Let's read the file using object Id
	        GridStore.read(db, result._id, function(err, data) {
	          test.equal('hello world!', data);
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
exports.shouldCorrectlyExecuteGridStoreExists = function(configuration, test) {
  var GridStore = configuration.getMongoPackage().GridStore
    , ObjectID = configuration.getMongoPackage().ObjectID;

  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
	  var gridStore = new GridStore(db, "foobar", "w");
	  gridStore.open(function(err, gridStore) {
	    gridStore.write("hello world!", function(err, gridStore) {
	      gridStore.close(function(err, result) {
	        GridStore.exist(db, 'foobar', function(err, result) {
	          test.equal(true, result);
	        });

	        GridStore.exist(db, 'does_not_exist', function(err, result) {
	          test.equal(false, result);
	        });

	        GridStore.exist(db, 'foobar', 'another_root', function(err, result) {
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
 * A simple example showing the usage of the eof method.
 *
 * @_class gridstore
 * @_function GridStore.list
 * @ignore
 */
exports.shouldCorrectlyExecuteGridStoreList = function(configuration, test) {
  var GridStore = configuration.getMongoPackage().GridStore
    , ObjectID = configuration.getMongoPackage().ObjectID;
  var db = configuration.newDbInstance({w:0}, {poolSize:1});

  // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
  // DOC_START
  // Establish connection to db
  db.open(function(err, db) {
    // Our file id
    var fileId = new ObjectID();

    // Open a file for writing
    var gridStore = new GridStore(db, fileId, "foobar2", "w");
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
          GridStore.list(db, 'my_fs', function(err, items) {
            var found = false;
            items.forEach(function(filename) {
              if(filename == 'foobar2') found = true;
            });

            test.ok(items.length >= 0);
            test.ok(!found);

            // Specify seperate id
            var fileId2 = new ObjectID();
            // Write another file to GridFS
            var gridStore2 = new GridStore(db, fileId2, "foobar3", "w");
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
  // DOC_END
}

/**
 * @ignore
 */
exports.shouldCorrectlyPeformGridStoreReadLength = function(configuration, test) {
  var GridStore = configuration.getMongoPackage().GridStore
    , ObjectID = configuration.getMongoPackage().ObjectID;

  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
	  var gridStore = new GridStore(db, "test_gs_read_length", "w");
	  gridStore.open(function(err, gridStore) {
	    gridStore.write("hello world!", function(err, gridStore) {
	      gridStore.close(function(err, result) {
	        // Assert that we have overwriten the data
	        GridStore.read(db, 'test_gs_read_length', 5, function(err, data) {
	          test.equal('hello', data);
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
exports.shouldCorrectlyReadFromFileWithOffset = function(configuration, test) {
  var GridStore = configuration.getMongoPackage().GridStore
    , ObjectID = configuration.getMongoPackage().ObjectID;

  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
	  var gridStore = new GridStore(db, "test_gs_read_with_offset", "w");
	  gridStore.open(function(err, gridStore) {
	    gridStore.write("hello, world!", function(err, gridStore) {
	      gridStore.close(function(err, result) {
	        // Assert that we have overwriten the data
	        GridStore.read(db, 'test_gs_read_with_offset', 5, 7, function(err, data) {
	          test.equal('world', data);
	        });

	        GridStore.read(db, 'test_gs_read_with_offset', null, 7, function(err, data) {
	          test.equal('world!', data);
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
exports.shouldCorrectlyHandleMultipleChunkGridStore = function(configuration, test) {
  var GridStore = configuration.getMongoPackage().GridStore
    , ObjectID = configuration.getMongoPackage().ObjectID;
  var fs_client = configuration.newDbInstance({w:0}, {poolSize:1});

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
exports.shouldCorrectlyReadlinesAndPutLines = function(configuration, test) {
  var GridStore = configuration.getMongoPackage().GridStore
    , ObjectID = configuration.getMongoPackage().ObjectID;
  var db = configuration.newDbInstance({w:0}, {poolSize:1});

  // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
  // DOC_START
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
  // DOC_END
}

/**
 * @ignore
 */
exports.shouldCorrectlyHandleUnlinkingWeirdName = function(configuration, test) {
  var GridStore = configuration.getMongoPackage().GridStore
    , ObjectID = configuration.getMongoPackage().ObjectID;
  var fs_client = configuration.newDbInstance({w:0}, {poolSize:1});

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
exports.shouldCorrectlyUnlink = function(configuration, test) {
  var GridStore = configuration.getMongoPackage().GridStore
    , ObjectID = configuration.getMongoPackage().ObjectID;
  var db = configuration.newDbInstance({w:0}, {poolSize:1});

  // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
  // DOC_START
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
  // DOC_END
}

/**
 * @ignore
 */
exports.shouldCorrectlyUnlinkAnArrayOfFiles = function(configuration, test) {
  var GridStore = configuration.getMongoPackage().GridStore
    , ObjectID = configuration.getMongoPackage().ObjectID;
  var fs_client = configuration.newDbInstance({w:0}, {poolSize:1});

  fs_client.open(function(err, fs_client) {
    fs_client.dropDatabase(function(err, done) {
      test.equal(null, err)

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
exports.shouldCorrectlyWriteFileToGridStore= function(configuration, test) {
  var GridStore = configuration.getMongoPackage().GridStore
    , ObjectID = configuration.getMongoPackage().ObjectID;

  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
	  var gridStore = new GridStore(db, 'test_gs_writing_file', 'w');
	  var fileSize = fs.statSync('./test/tests/functional/gridstore/test_gs_weird_bug.png').size;
	  var data = fs.readFileSync('./test/tests/functional/gridstore/test_gs_weird_bug.png');

	  gridStore.open(function(err, gridStore) {
	    gridStore.writeFile('./test/tests/functional/gridstore/test_gs_weird_bug.png', function(err, doc) {
	      GridStore.read(db, 'test_gs_writing_file', function(err, fileData) {
	        test.equal(data.toString('base64'), fileData.toString('base64'));
	        test.equal(fileSize, fileData.length);

	        // Ensure we have a md5
	        var gridStore2 = new GridStore(db, 'test_gs_writing_file', 'r');
	        gridStore2.open(function(err, gridStore2) {
	          test.ok(gridStore2.md5 != null)
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
exports.shouldCorrectlyWriteFileToGridStoreUsingObjectId= function(configuration, test) {
  var GridStore = configuration.getMongoPackage().GridStore
    , ObjectID = configuration.getMongoPackage().ObjectID;

  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
	  var gridStore = new GridStore(db, null, 'w');
	  var fileSize = fs.statSync('./test/tests/functional/gridstore/test_gs_weird_bug.png').size;
	  var data = fs.readFileSync('./test/tests/functional/gridstore/test_gs_weird_bug.png');

	  gridStore.open(function(err, gridStore) {
	    gridStore.writeFile('./test/tests/functional/gridstore/test_gs_weird_bug.png', function(err, doc) {

	      GridStore.read(db, doc._id, function(err, fileData) {
	        test.equal(data.toString('base64'), fileData.toString('base64'));
	        test.equal(fileSize, fileData.length);

	        // Ensure we have a md5
	        var gridStore2 = new GridStore(db, doc._id, 'r');
	        gridStore2.open(function(err, gridStore2) {
	          test.ok(gridStore2.md5 != null)
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
exports.shouldCorrectlyPerformWorkingFiledRead = function(configuration, test) {
  var GridStore = configuration.getMongoPackage().GridStore
    , ObjectID = configuration.getMongoPackage().ObjectID;

  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
	  var gridStore = new GridStore(db, "test_gs_working_field_read", "w");
	  var data = fs.readFileSync("./test/tests/functional/gridstore/test_gs_working_field_read.pdf", 'binary');

	  gridStore.open(function(err, gridStore) {
	    gridStore.write(data, function(err, gridStore) {
	      gridStore.close(function(err, result) {
	        // Assert that we have overwriten the data
	        GridStore.read(db, 'test_gs_working_field_read', function(err, fileData) {
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
 * @ignore
 */
exports.shouldCorrectlyPerformWorkingFiledReadWithChunkSizeLessThanFileSize = function(configuration, test) {
  var GridStore = configuration.getMongoPackage().GridStore
    , ObjectID = configuration.getMongoPackage().ObjectID;

  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
	  // Create a new file
	  var gridStore = new GridStore(db, "test.txt", "w");

	  // This shouldnt have to be set higher than the file...
	  gridStore.chunkSize = 40960;

	  // Open the file
	  gridStore.open(function(err, gridStore) {
	    var file = fs.createReadStream('./test/tests/functional/gridstore/test_gs_working_field_read.pdf');
	    var dataSize = 0;

	    // Write the binary file data to GridFS
	    file.on('data', function (chunk) {
	      dataSize += chunk.length;

	      gridStore.write(chunk, function(err, gridStore) {
	        if(err) {
	          test.ok(false);
	        }
	      });
	    });

	    file.on('close', function () {
	      // Flush the remaining data to GridFS
	      gridStore.close(function(err, result) {
	        // Read in the whole file and check that it's the same content
	        GridStore.read(db, result._id, function(err, fileData) {
	          var data = fs.readFileSync('./test/tests/functional/gridstore/test_gs_working_field_read.pdf');
	          test.equal(data.toString('base64'), fileData.toString('base64'));
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
exports.shouldCorrectlyPerformWorkingFiledWithBigFile = function(configuration, test) {
  var GridStore = configuration.getMongoPackage().GridStore
    , ObjectID = configuration.getMongoPackage().ObjectID;
  var client = configuration.newDbInstance({w:1});
  client.open(function(err, client) {
    // Prepare fake big file
    var data = fs.readFileSync("./test/tests/functional/gridstore/test_gs_working_field_read.pdf", 'binary');
    // Write the data multiple times
    var fd = fs.openSync("./test_gs_working_field_read.tmp", 'w');
    // Write the data 10 times to create a big file
    for(var i = 0; i < 10; i++) {
      fs.writeSync(fd, data);
    }
    // Close the file
    fs.close(fd);

    // Create a new file
    var gridStore = new GridStore(client, null, "w");

    // This shouldnt have to be set higher than the file...
    gridStore.chunkSize = 80960;

    // Open the file
    gridStore.open(function(err, gridStore) {
      var file = fs.createReadStream('./test_gs_working_field_read.tmp');
      var dataSize = 0;

      // Write the binary file data to GridFS
      file.on('data', function (chunk) {
        dataSize += chunk.length;

        gridStore.write(chunk, function(err, gridStore) {
          if(err) {
            test.ok(false);
          }
        });
      });

      file.on('close', function () {
        // Flush the remaining data to GridFS
        gridStore.close(function(err, result) {
          // Read in the whole file and check that it's the same content
          GridStore.read(client, result._id, function(err, fileData) {
            var data = fs.readFileSync('./test_gs_working_field_read.tmp');
            // test.equal(data.toString('base64'), fileData.toString('base64'));
            // console.log(data.length)
            // console.log(fileData.length)
            // for(var i = 0; i < data.length; i++) {
            //   if(data[i] != fileData[i]) console.log("error at :: " + i)
            // }

            test.deepEqual(data, fileData);
            client.close();
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
exports.shouldCorrectlyPerformWorkingFiledWriteWithDifferentChunkSizes = function(configuration, test) {
  var GridStore = configuration.getMongoPackage().GridStore
    , ObjectID = configuration.getMongoPackage().ObjectID;

  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
	  // Prepare fake big file
	  var data = fs.readFileSync("./test/tests/functional/gridstore/test_gs_working_field_read.pdf", 'binary');
	  // Write the data multiple times
	  var fd = fs.openSync("./test_gs_working_field_read.tmp", 'w');
	  // Write the data 10 times to create a big file
	  for(var i = 0; i < 10; i++) {
	    fs.writeSync(fd, data);
	  }
	  // Close the file
	  fs.close(fd);
	  // File Size
	  var fileSize = fs.statSync('./test_gs_working_field_read.tmp').size;

	  var executeTest = function(_chunkSize, _test, callback) {
	    // Create a new file
	    var gridStore = new GridStore(db, null, "w");

	    // This shouldnt have to be set higher than the file...
	    gridStore.chunkSize = _chunkSize;

	    // Open the file
	    gridStore.open(function(err, gridStore) {
	      var file = fs.createReadStream('./test_gs_working_field_read.tmp');
	      var dataSize = 0;

	      // Write the binary file data to GridFS
	      file.on('data', function (chunk) {
	        dataSize += chunk.length;

	        gridStore.write(chunk, function(err, gridStore) {
	          if(err) {
	            test.ok(false);
	          }
	        });
	      });

	      file.on('close', function () {
	        // Flush the remaining data to GridFS
	        gridStore.close(function(err, result) {
	          // Read in the whole file and check that it's the same content
	          GridStore.read(db, result._id, function(err, fileData) {
	            var data = fs.readFileSync('./test_gs_working_field_read.tmp');
	            // for(var i = 0; i < data.length; i++) {
	            //   if(data[i] != fileData[i]) console.log("=============== WRONG :: " + i)
	            // }
	            test.deepEqual(data, fileData);
	            callback(null, null);
	          });
	        });
	      });
	    });
	  }

	  // Execute big chunk size
	  executeTest(80960, test, function(err, result) {
	    // Execute small chunk size
	    executeTest(5000, test, function(err, result) {
	      // Execute chunksize larger than file
	      executeTest(fileSize+100, test, function(err, result) {
	      	db.close();
	        test.done();
	      });
	    });
	  });
	});
}

/**
 * @ignore
 */
exports.shouldCorrectlyReadAndWriteFile = function(configuration, test) {
  var GridStore = configuration.getMongoPackage().GridStore
    , ObjectID = configuration.getMongoPackage().ObjectID;

  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
	  var gridStore = new GridStore(db, "test_gs_weird_bug", "w");
	  var data = fs.readFileSync("./test/tests/functional/gridstore/test_gs_weird_bug.png", 'binary');

	  gridStore.open(function(err, gridStore) {
	    gridStore.write(data, function(err, gridStore) {
	      gridStore.close(function(err, result) {
	        // Assert that we have overwriten the data
	        GridStore.read(db, 'test_gs_weird_bug', function(err, fileData) {
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
 * A simple example showing the usage of the read method.
 *
 * @_class gridstore
 * @_function read
 * @ignore
 */
exports.shouldCorrectlyWriteAndReadJpgImage = function(configuration, test) {
  var GridStore = configuration.getMongoPackage().GridStore
    , ObjectID = configuration.getMongoPackage().ObjectID;
  var db = configuration.newDbInstance({w:0}, {poolSize:1});

  // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
  // DOC_START
  // Establish connection to db
  db.open(function(err, db) {
    // Read in the content of a file
    var data = fs.readFileSync('./test/tests/functional/gridstore/iya_logo_final_bw.jpg');
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
                test.equal(data.toString('base64'), data2.toString('base64'));

                db.close();
                test.done();
              });
            });
          });
        });
      });
    });
  });
  // DOC_END
}

/**
 * @ignore
 */
exports.shouldCorrectlyReadAndWriteBuffersMultipleChunks = function(configuration, test) {
  var GridStore = configuration.getMongoPackage().GridStore
    , ObjectID = configuration.getMongoPackage().ObjectID;

  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
	  var gridStore = new GridStore(db, null, 'w');
	  // Force multiple chunks to be stored
	  gridStore.chunkSize = 5000;
	  var fileSize = fs.statSync('./test/tests/functional/gridstore/test_gs_weird_bug.png').size;
	  var data = fs.readFileSync('./test/tests/functional/gridstore/test_gs_weird_bug.png');

	  gridStore.open(function(err, gridStore) {

	    // Write the file using write
	    gridStore.write(data, function(err, doc) {
	      gridStore.close(function(err, doc) {

	        // Read the file using readBuffer
	        new GridStore(db, doc._id, 'r').open(function(err, gridStore) {
	          gridStore.read(function(err, data2) {
	            test.equal(data.toString('base64'), data2.toString('base64'));
	            db.close();
	            test.done();
	          })
	        });
	      });
	    })
	  });
	});
}

/**
 * @ignore
 */
exports.shouldCorrectlyReadAndWriteBuffersSingleChunks = function(configuration, test) {
  var GridStore = configuration.getMongoPackage().GridStore
    , ObjectID = configuration.getMongoPackage().ObjectID;

  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
	  var gridStore = new GridStore(db, null, 'w');
	  // Force multiple chunks to be stored
	  var fileSize = fs.statSync('./test/tests/functional/gridstore/test_gs_weird_bug.png').size;
	  var data = fs.readFileSync('./test/tests/functional/gridstore/test_gs_weird_bug.png');

	  gridStore.open(function(err, gridStore) {

	    // Write the file using writeBuffer
	    gridStore.write(data, function(err, doc) {
	      gridStore.close(function(err, doc) {

	        // Read the file using readBuffer
	        new GridStore(db, doc._id, 'r').open(function(err, gridStore) {
	          gridStore.read(function(err, data2) {
	            test.equal(data.toString('base64'), data2.toString('base64'));
	            db.close();
	            test.done();
	          })
	        });
	      });
	    })
	  });
	});
}

/**
 * @ignore
 */
exports.shouldCorrectlyReadAndWriteBuffersUsingNormalWriteWithMultipleChunks = function(configuration, test) {
  var GridStore = configuration.getMongoPackage().GridStore
    , ObjectID = configuration.getMongoPackage().ObjectID;

  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
	  var gridStore = new GridStore(db, null, 'w');
	  // Force multiple chunks to be stored
	  gridStore.chunkSize = 5000;
	  var fileSize = fs.statSync('./test/tests/functional/gridstore/test_gs_weird_bug.png').size;
	  var data = fs.readFileSync('./test/tests/functional/gridstore/test_gs_weird_bug.png');

	  gridStore.open(function(err, gridStore) {

	    // Write the buffer using the .write method that should use writeBuffer correctly
	    gridStore.write(data, function(err, doc) {
	      gridStore.close(function(err, doc) {

	        // Read the file using readBuffer
	        new GridStore(db, doc._id, 'r').open(function(err, gridStore) {
	          gridStore.read(function(err, data2) {
	            test.equal(data.toString('base64'), data2.toString('base64'));
	            db.close();
	            test.done();
	          })
	        });
	      });
	    })
	  });
	});
}

/**
 * @ignore
 */
exports.shouldCorrectlyReadAndWriteBuffersSingleChunksAndVerifyExistance = function(configuration, test) {
  var GridStore = configuration.getMongoPackage().GridStore
    , ObjectID = configuration.getMongoPackage().ObjectID;

  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
	  var gridStore = new GridStore(db, null, 'w');
	  // Force multiple chunks to be stored
	  var fileSize = fs.statSync('./test/tests/functional/gridstore/test_gs_weird_bug.png').size;
	  var data = fs.readFileSync('./test/tests/functional/gridstore/test_gs_weird_bug.png');

	  gridStore.open(function(err, gridStore) {

	    // Write the file using writeBuffer
	    gridStore.write(data, function(err, doc) {
	      gridStore.close(function(err, doc) {

	        // Read the file using readBuffer
	        GridStore.exist(db, doc._id, function(err, result) {
	          test.equal(null, err);
	          test.equal(true, result);

	          db.close();
	          test.done();
	        });
	      });
	    })
	  });
	});
}

/**
 * @ignore
 */
exports.shouldCorrectlySaveDataByObjectID = function(configuration, test) {
  var GridStore = configuration.getMongoPackage().GridStore
    , ObjectID = configuration.getMongoPackage().ObjectID;

  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
	  var id = new ObjectID();
	  var gridStore = new GridStore(db, id, 'w');

	  gridStore.open(function(err, gridStore) {
	    gridStore.write('bar', function(err, gridStore) {
	      gridStore.close(function(err, result) {

	        GridStore.exist(db, id, function(err, result) {
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
 * @ignore
 */
exports.shouldCheckExistsByUsingRegexp = function(configuration, test) {
  var GridStore = configuration.getMongoPackage().GridStore
    , ObjectID = configuration.getMongoPackage().ObjectID;

  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
	  var gridStore = new GridStore(db, 'shouldCheckExistsByUsingRegexp.txt', 'w');

	  gridStore.open(function(err, gridStore) {
	    gridStore.write('bar', function(err, gridStore) {
	      gridStore.close(function(err, result) {

	        GridStore.exist(db, /shouldCheck/, function(err, result) {
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
 * A simple example showing opening a file using a filename, writing to it and saving it.
 *
 * @_class gridstore
 * @_function open
 * @ignore
 */
exports.shouldCorrectlySaveSimpleFileToGridStoreUsingFilename = function(configuration, test) {
  var GridStore = configuration.getMongoPackage().GridStore
    , ObjectID = configuration.getMongoPackage().ObjectID;
  var db = configuration.newDbInstance({w:0}, {poolSize:1});

  // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
  // DOC_START
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
  // DOC_END
}

/**
 * A simple example showing opening a file using an ObjectID, writing to it and saving it.
 *
 * @_class gridstore
 * @_function open
 * @ignore
 */
exports.shouldCorrectlySaveSimpleFileToGridStoreUsingObjectID = function(configuration, test) {
  var GridStore = configuration.getMongoPackage().GridStore
    , ObjectID = configuration.getMongoPackage().ObjectID;
  var db = configuration.newDbInstance({w:0}, {poolSize:1});

  // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
  // DOC_START
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
  // DOC_END
}

/**
 * A simple example showing how to write a file to Gridstore using file location path.
 *
 * @_class gridstore
 * @_function writeFile
 * @ignore
 */
exports.shouldCorrectlySaveSimpleFileToGridStoreUsingWriteFile = function(configuration, test) {
  var GridStore = configuration.getMongoPackage().GridStore
    , ObjectID = configuration.getMongoPackage().ObjectID;
  var db = configuration.newDbInstance({w:0}, {poolSize:1});

  // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
  // DOC_START
  // Establish connection to db
  db.open(function(err, db) {
    // Our file ID
    var fileId = new ObjectID();

    // Open a new file
    var gridStore = new GridStore(db, fileId, 'w');

    // Read the filesize of file on disk (provide your own)
    var fileSize = fs.statSync('./test/tests/functional/gridstore/test_gs_weird_bug.png').size;
    // Read the buffered data for comparision reasons
    var data = fs.readFileSync('./test/tests/functional/gridstore/test_gs_weird_bug.png');

    // Open the new file
    gridStore.open(function(err, gridStore) {

      // Write the file to gridFS
      gridStore.writeFile('./test/tests/functional/gridstore/test_gs_weird_bug.png', function(err, doc) {

        // Read back all the written content and verify the correctness
        GridStore.read(db, fileId, function(err, fileData) {
          test.equal(data.toString('base64'), fileData.toString('base64'))
          test.equal(fileSize, fileData.length);

          db.close();
          test.done();
        });
      });
    });
  });
  // DOC_END
}

/**
 * A simple example showing how to write a file to Gridstore using a file handle.
 *
 * @_class gridstore
 * @_function writeFile
 * @ignore
 */
exports.shouldCorrectlySaveSimpleFileToGridStoreUsingWriteFileWithHandle = function(configuration, test) {
  var GridStore = configuration.getMongoPackage().GridStore
    , ObjectID = configuration.getMongoPackage().ObjectID;
  var db = configuration.newDbInstance({w:0}, {poolSize:1});

  // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
  // DOC_START
  // Establish connection to db
  db.open(function(err, db) {
    // Our file ID
    var fileId = new ObjectID();

    // Open a new file
    var gridStore = new GridStore(db, fileId, 'w');

    // Read the filesize of file on disk (provide your own)
    var fileSize = fs.statSync('./test/tests/functional/gridstore/test_gs_weird_bug.png').size;
    // Read the buffered data for comparision reasons
    var data = fs.readFileSync('./test/tests/functional/gridstore/test_gs_weird_bug.png');

    // Open a file handle for reading the file
    var fd = fs.openSync('./test/tests/functional/gridstore/test_gs_weird_bug.png', 'r', 0666);

    // Open the new file
    gridStore.open(function(err, gridStore) {

      // Write the file to gridFS using the file handle
      gridStore.writeFile(fd, function(err, doc) {

        // Read back all the written content and verify the correctness
        GridStore.read(db, fileId, function(err, fileData) {
          test.equal(data.toString('base64'), fileData.toString('base64'));
          test.equal(fileSize, fileData.length);

          db.close();
          test.done();
        });
      });
    });
  });
  // DOC_END
}

/**
 * A simple example showing how to use the write command with strings and Buffers.
 *
 * @_class gridstore
 * @_function write
 * @ignore
 */
exports.shouldCorrectlySaveSimpleFileToGridStoreUsingWriteWithStringsAndBuffers = function(configuration, test) {
  var GridStore = configuration.getMongoPackage().GridStore
    , ObjectID = configuration.getMongoPackage().ObjectID;
  var db = configuration.newDbInstance({w:0}, {poolSize:1});

  // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
  // DOC_START
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
  // DOC_END
}

/**
 * A simple example showing how to use the write command with strings and Buffers.
 *
 * @_class gridstore
 * @_function close
 * @ignore
 */
exports.shouldCorrectlySaveSimpleFileToGridStoreUsingClose = function(configuration, test) {
  var GridStore = configuration.getMongoPackage().GridStore
    , ObjectID = configuration.getMongoPackage().ObjectID;
  var db = configuration.newDbInstance({w:0}, {poolSize:1});

  // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
  // DOC_START
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
  // DOC_END
}

/**
 * A simple example showing how to access the chunks collection object.
 *
 * @_class gridstore
 * @_function chunkCollection
 * @ignore
 */
exports.shouldCorrectlyAccessChunkCollection = function(configuration, test) {
  var GridStore = configuration.getMongoPackage().GridStore
    , ObjectID = configuration.getMongoPackage().ObjectID;
  var db = configuration.newDbInstance({w:0}, {poolSize:1});

  // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
  // DOC_START
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

        db.close();
        test.done();
      });
    });
  });
  // DOC_END
}

/**
 * A simple example showing how to use the instance level unlink command to delete a gridstore item.
 *
 * @_class gridstore
 * @_function unlink
 * @ignore
 */
exports.shouldCorrectlySaveSimpleFileToGridStoreUsingCloseAndThenUnlinkIt = function(configuration, test) {
  var GridStore = configuration.getMongoPackage().GridStore
    , ObjectID = configuration.getMongoPackage().ObjectID;
  var db = configuration.newDbInstance({w:0}, {poolSize:1});

  // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
  // DOC_START
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
  // DOC_END
}

/**
 * A simple example showing how to access the files collection object.
 *
 * @_class gridstore
 * @_function collection
 * @ignore
 */
exports.shouldCorrectlyAccessFilesCollection = function(configuration, test) {
  var GridStore = configuration.getMongoPackage().GridStore
    , ObjectID = configuration.getMongoPackage().ObjectID;
  var db = configuration.newDbInstance({w:0}, {poolSize:1});

  // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
  // DOC_START
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

        db.close();
        test.done();
      });
    });
  });
  // DOC_END
}

/**
 * A simple example showing reading back using readlines to split the text into lines by the seperator provided.
 *
 * @_class gridstore
 * @_function GridStore.readlines
 * @ignore
 */
exports.shouldCorrectlyPutACoupleOfLinesInGridStoreAndUseReadlines = function(configuration, test) {
  var GridStore = configuration.getMongoPackage().GridStore
    , ObjectID = configuration.getMongoPackage().ObjectID;
  var db = configuration.newDbInstance({w:0}, {poolSize:1});

  // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
  // DOC_START
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
  // DOC_END
}

/**
 * A simple example showing reading back using readlines to split the text into lines by the seperator provided.
 *
 * @_class gridstore
 * @_function readlines
 * @ignore
 */
exports.shouldCorrectlyPutACoupleOfLinesInGridStoreAndUseInstanceReadlines = function(configuration, test) {
  var GridStore = configuration.getMongoPackage().GridStore
    , ObjectID = configuration.getMongoPackage().ObjectID;
  var db = configuration.newDbInstance({w:0}, {poolSize:1});

  // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
  // DOC_START
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
  // DOC_END
}

/**
 * A simple example showing the usage of the read method.
 *
 * @_class gridstore
 * @_function GridStore.read
 * @ignore
 */
exports.shouldCorrectlyPutACoupleOfLinesInGridStoreRead = function(configuration, test) {
  var GridStore = configuration.getMongoPackage().GridStore
    , ObjectID = configuration.getMongoPackage().ObjectID;
  var db = configuration.newDbInstance({w:0}, {poolSize:1});

  // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
  // DOC_START
  // Establish connection to db
  db.open(function(err, db) {
    // Create a new file
    var gridStore = new GridStore(db, null, "w");
    // Read in the content from a file, replace with your own
    var data = fs.readFileSync("./test/tests/functional/gridstore/test_gs_weird_bug.png");

    // Open the file
    gridStore.open(function(err, gridStore) {
      // Write the binary file data to GridFS
      gridStore.write(data, function(err, gridStore) {
        // Flush the remaining data to GridFS
        gridStore.close(function(err, result) {

          // Read in the whole file and check that it's the same content
          GridStore.read(db, result._id, function(err, fileData) {
            test.equal(data.length, fileData.length);

            db.close();
            test.done();
          });
        });
      });
    });
  });
  // DOC_END
}

/**
 * @ignore
 */
exports.shouldCorrectlyOpenGridStoreWithDifferentRoot = function(configuration, test) {
  var GridStore = configuration.getMongoPackage().GridStore
    , ObjectID = configuration.getMongoPackage().ObjectID;
  var db = configuration.newDbInstance({w:0}, {poolSize:1});
  var asset = {source:new ObjectID()};

  // Establish connection to db
  db.open(function(err, db) {
    var store = new GridStore(db, new ObjectID( asset.source.toString() ), 'w', {root: 'store'});
    store.open(function(err, gridStore) {
      test.equal(null, err);

      db.close();
      test.done();
    })
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlySetFilenameForGridstoreOpen = function(configuration, test) {
  var GridStore = configuration.getMongoPackage().GridStore
    , ObjectID = configuration.getMongoPackage().ObjectID;

  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
	  var id = new ObjectID();
	  var gridStore = new GridStore(db, id, "test_gs_read_length", "w");
	  gridStore.open(function(err, gridStore) {
	    gridStore.write("hello world!", function(err, gridStore) {
	      gridStore.close(function(err, result) {
	        // Open the gridstore
	        gridStore = new GridStore(db, id, "r");
	        gridStore.open(function(err, gridStore) {
	          test.equal(null, err);
	          test.equal("test_gs_read_length", gridStore.filename);
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
exports.shouldCorrectlyAppendToFileCorrectly = function(configuration, test) {
  var GridStore = configuration.getMongoPackage().GridStore
    , ObjectID = configuration.getMongoPackage().ObjectID;

  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
	  var id = new ObjectID();
	  var gridStore = new GridStore(db, id, "test_gs_read_length", "w", {chunk_size:5});
	  gridStore.open(function(err, gridStore) {
	    gridStore.write("hello world!", function(err, gridStore) {
	      gridStore.close(function(err, result) {

	        // Open in append mode and keep writing
	        gridStore = new GridStore(db, id, "test_gs_read_length", "w+", {chunk_size:5});
	        gridStore.open(function(err, gridStore) {
	          gridStore.write("again again!", function(err, gridStore) {
	            gridStore.close(function(err, result) {

	              // Open the gridstore
	              gridStore = new GridStore(db, id, "r");
	              gridStore.open(function(err, gridStore) {
	                test.equal(null, err);
	                test.equal("test_gs_read_length", gridStore.filename);

	                gridStore.read(function(err, data) {
	                  test.equal("hello world!again again!", data.toString());
	                  db.close();
	                  test.done();
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
 * @ignore
 */
exports.shouldCorrectlySaveFileAndThenOpenChangeContentTypeAndSaveAgain = function(configuration, test) {
  var GridStore = configuration.getMongoPackage().GridStore
    , ObjectID = configuration.getMongoPackage().ObjectID;

  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
	  var id = new ObjectID();
	  var gridStore = new GridStore(db, id, "test_gs_read_length", "w", {content_type: "image/jpeg"});
	  gridStore.open(function(err, gridStore) {
	    gridStore.write("hello world!", function(err, gridStore) {
	      gridStore.close(function(err, result) {
	        // Open the gridstore
	        new GridStore(db, id, "w+").open(function(err, gridStore) {
	          gridStore.contentType = "html/text";
	          gridStore.close(function(err, result) {

	            new GridStore(db, id, "r").open(function(err, gridStore) {
	              test.equal(null, err);
	              test.equal("html/text", gridStore.contentType);

	              gridStore.read(function(err, data) {
	                test.equal(null, err);
	                test.equal("hello world!", data.toString('utf8'));
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
 * @ignore
 */
exports.shouldCorrectlyHandleSeekWithStream = function(configuration, test) {
  var GridStore = configuration.getMongoPackage().GridStore
    , ObjectID = configuration.getMongoPackage().ObjectID;

  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
	  var id = new ObjectID();
	  var gridStore = new GridStore(db, id, "test_gs_read_length", "w", {content_type: "image/jpeg"});
	  gridStore.open(function(err, gridStore) {
	    gridStore.write("hello world!", function(err, gridStore) {
	      gridStore.close(function(err, result) {
	        // Open the gridstore
	        new GridStore(db, id, "r").open(function(err, gridStore) {
	          test.equal(null, err);

	          gridStore.pause();

	          gridStore.seek(2, function(err, gstore) {
	            test.equal(null, err);

	            var stream = gridStore.stream(true);

	            stream.on('data', function(chunk) {
	              test.equal("llo world!", chunk.toString());
	            }).on('end', function() {
	            	db.close();
	              test.done();
	            }).resume();
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
exports.shouldCorrectlyHandleSeekIntoSecondChunkWithStream = function(configuration, test) {
  var GridStore = configuration.getMongoPackage().GridStore
    , ObjectID = configuration.getMongoPackage().ObjectID;

  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
	  var id = new ObjectID();
	  var gridStore = new GridStore(db, id, "test_gs_read_length", "w", {content_type: "image/jpeg", chunk_size:5});
	  gridStore.open(function(err, gridStore) {
	    gridStore.write("hello world!", function(err, gridStore) {
	      gridStore.close(function(err, result) {
	        // Open the gridstore
	        new GridStore(db, id, "r").open(function(err, gridStore) {
	          test.equal(null, err);

	          gridStore.pause();

	          gridStore.seek(7, function(err, gstore) {
	            test.equal(null, err);

	            var stream = gridStore.stream(true);
	            var data = '';

	            stream.on('data', function(chunk) {
	              data = data + chunk.toString();
	            }).on('end', function() {
	              test.equal("orld!", data);
	              db.close();
	              test.done();
	            }).resume();
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
exports['Should correctly handle multiple seeks'] = function(configuration, test) {
  var GridStore = configuration.getMongoPackage().GridStore
    , ObjectID = configuration.getMongoPackage().ObjectID;

  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
	  var gridStore = new GridStore(db, "test_gs_seek_with_buffer", "w");
	  gridStore.open(function(err, gridStore) {
	    gridStore.write(new Buffer("012345678901234567890", "utf8"), function(err, gridStore) {
	      gridStore.close(function(result) {
	        var gridStore2 = new GridStore(db, "test_gs_seek_with_buffer", "r");
	        gridStore2.open(function(err, gridStore2) {
	          
	          gridStore2.read( 5, function(err, data) {
	            test.equal("01234", data.toString());
	            
	            gridStore2.seek(-2, GridStore.IO_SEEK_CUR, function(err, gridStore2) {
	              
	              gridStore2.read( 5, function(err, data) {
	                test.equal("34567", data.toString());
	                
	                gridStore2.seek(-2, GridStore.IO_SEEK_CUR, function(err, gridStore2) {

	                  gridStore2.read( 5, function(err, data) {
	                    test.equal("67890", data.toString());
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
	});
}

/**
 * @ignore
 */
exports['Should correctly handle multiple seeks over several chunks'] = function(configuration, test) {
  var GridStore = configuration.getMongoPackage().GridStore
    , ObjectID = configuration.getMongoPackage().ObjectID;

  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
	  var gridStore = new GridStore(db, "test_gs_seek_with_buffer", "w", {chunk_size:4});
	  gridStore.open(function(err, gridStore) {
	    gridStore.write(new Buffer("012345678901234567890", "utf8"), function(err, gridStore) {
	      gridStore.close(function(result) {
	        var gridStore2 = new GridStore(db, "test_gs_seek_with_buffer", "r");
	        gridStore2.open(function(err, gridStore2) {
	          
	          gridStore2.read( 5, function(err, data) {
	            test.equal("01234", data.toString());
	            
	            gridStore2.seek(-2, GridStore.IO_SEEK_CUR, function(err, gridStore2) {
	              
	              gridStore2.read( 5, function(err, data) {
	                test.equal("34567", data.toString());
	                
	                gridStore2.seek(-2, GridStore.IO_SEEK_CUR, function(err, gridStore2) {

	                  gridStore2.read( 5, function(err, data) {
	                    test.equal("67890", data.toString());
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
	});
}

/**
 * @ignore
 */
exports.shouldWriteFileWithMongofilesAndReadWithNodeJS = function(configuration, test) {
  var GridStore = configuration.getMongoPackage().GridStore
    , ObjectID = configuration.getMongoPackage().ObjectID;

  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
	  var id = new ObjectID();

	  console.dir(__dirname + "/iya_logo_final_bw.jpg")

	  // Execute function
	  var exec_function = format("mongofiles --host localhost --port 27017 --db %s put %s", configuration.db_name, __dirname + "/iya_logo_final_bw.jpg");
	  var exec = child_process.exec;
	  // Read the data to compare
	  var originalData = fs.readFileSync(__dirname + "/iya_logo_final_bw.jpg");
	  // Upload using the mongofiles
	  exec(exec_function, function(error, stdout, stderr) {
	    test.ok(stdout.match(/added file/) != -1);

	    GridStore.list(db, function(err, items) {
	      // Load the file using MongoDB
	      var gridStore = new GridStore(db, __dirname + "/iya_logo_final_bw.jpg", "r", {});
	      gridStore.open(function(err, gridStore) {
	        test.equal(null, err);

	        gridStore.read(function(err, data) {
	          test.equal(null, err);
	          test.deepEqual(originalData, data);
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
exports['Should correctly append content to file and have correct chunk numbers'] = function(configuration, test) {
  var GridStore = configuration.getMongoPackage().GridStore
    , ObjectID = configuration.getMongoPackage().ObjectID;

  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    test.equal(null, err);
    var chunkSize = 256*1024;  // Standard 256KB chunks
    // Our file ID
    var fileId = new ObjectID();

    // Open a new file
    var gridStore = new GridStore(db, fileId, 'w', { chunkSize: chunkSize, root: "chunkCheck" });

    // Open the new file
    gridStore.open(function(err, gridStore) {
      test.equal(null, err);

      // Create a chunkSize Buffer
      var buffer = new Buffer(chunkSize); 

      // Write the buffer
      gridStore.write(buffer, function(err, gridStore) {
        test.equal(null, err);

        // Close the file
        gridStore.close(function(err, result) {
          test.equal(null, err);

          // Open the same file, this time for appending data
          // No need to specify chunkSize...
          gridStore = new GridStore(db, fileId, 'w+', {root: "chunkCheck"});

          // Open the file again
          gridStore.open(function(err, gridStore) {
            test.equal(null, err);

            // Write the buffer again
            gridStore.write(buffer, function(err, gridStore) {
              test.equal(null, err);

              // Close the file again
              gridStore.close(function(err, result) {
                test.equal(null, err);

                var chunkCollection = gridStore.chunkCollection();
                chunkCollection.find({files_id: fileId}, {data:0}).sort({n: 1}).toArray(function(err, chunks) {
                  test.equal(null, err);
                  test.equal(2, chunks.length);
                  test.equal(0, chunks[0].n);
                  test.equal(1, chunks[1].n);

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
