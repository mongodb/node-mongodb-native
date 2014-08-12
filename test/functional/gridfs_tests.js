var fs = require('fs')
  , format = require('util').format
  , child_process = require('child_process');

/**
 * @ignore
 */
exports.shouldCreateNewGridStoreObject = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;
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
  }
}

/**
 * @ignore
 */
exports.shouldCreateNewGridStoreObjectWithIntId = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;
    var db = configuration.newDbInstance({w:0}, {poolSize:1});
    db.open(function(err, db) {
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
    });
  }
}

/**
 * @ignore
 */
exports.shouldCreateNewGridStoreObjectWithStringId = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;
    var db = configuration.newDbInstance({w:0}, {poolSize:1});
    db.open(function(err, db) {
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
    });
  }
}

/**
 * A simple example showing the usage of the Gridstore.exist method.
 *
 * @_class gridstore
 * @_function GridStore.exist
 * @ignore
 */
exports.shouldCorrectlyExecuteGridStoreExistsByObjectId = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;
    var db = configuration.newDbInstance({w:0}, {poolSize:1});

    // DOC_LINE var db = new Db('test', new Server('localhost', 27017));
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
}

/**
 * @ignore
 */
exports.shouldCorrectlySafeFileAndReadFileByObjectId = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;

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
}

/**
 * @ignore
 */
exports.shouldCorrectlyExecuteGridStoreExists = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;

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
}

/**
 * A simple example showing the usage of the eof method.
 *
 * @_class gridstore
 * @_function GridStore.list
 * @ignore
 */
exports.shouldCorrectlyExecuteGridStoreList = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;
    var db = configuration.newDbInstance({w:0}, {poolSize:1});

    // DOC_LINE var db = new Db('test', new Server('localhost', 27017));
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
}

/**
 * @ignore
 */
exports.shouldCorrectlyPeformGridStoreReadLength = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;

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
}

/**
 * @ignore
 */
exports.shouldCorrectlyReadFromFileWithOffset = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;

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
}

/**
 * @ignore
 */
exports.shouldCorrectlyHandleMultipleChunkGridStore = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;
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
}

/**
 * A simple example showing the usage of the puts method.
 *
 * @_class gridstore
 * @_function puts
 * @ignore
 */
exports.shouldCorrectlyReadlinesAndPutLines = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;
    var db = configuration.newDbInstance({w:0}, {poolSize:1});

    // DOC_LINE var db = new Db('test', new Server('localhost', 27017));
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
}

/**
 * @ignore
 */
exports.shouldCorrectlyHandleUnlinkingWeirdName = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;
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
}

/**
 * A simple example showing the usage of the GridStore.unlink method.
 *
 * @_class gridstore
 * @_function GridStore.unlink
 * @ignore
 */
exports.shouldCorrectlyUnlink = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;
    var db = configuration.newDbInstance({w:0}, {poolSize:1});

    // DOC_LINE var db = new Db('test', new Server('localhost', 27017));
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
}

/**
 * @ignore
 */
exports.shouldCorrectlyUnlinkAnArrayOfFiles = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;
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
}

/**
 * @ignore
 */
exports.shouldCorrectlyWriteFileToGridStore = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;

    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      var gridStore = new GridStore(db, 'test_gs_writing_file', 'w');
      var fileSize = fs.statSync('./test/functional/data/test_gs_weird_bug.png').size;
      var data = fs.readFileSync('./test/functional/data/test_gs_weird_bug.png');

      gridStore.open(function(err, gridStore) {
        gridStore.writeFile('./test/functional/data/test_gs_weird_bug.png', function(err, doc) {
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
}

/**
 * @ignore
 */
exports.shouldCorrectlyWriteFileToGridStoreUsingObjectId = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;

    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      var gridStore = new GridStore(db, null, 'w');
      var fileSize = fs.statSync('./test/functional/data/test_gs_weird_bug.png').size;
      var data = fs.readFileSync('./test/functional/data/test_gs_weird_bug.png');

      gridStore.open(function(err, gridStore) {
        gridStore.writeFile('./test/functional/data/test_gs_weird_bug.png', function(err, doc) {

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
}

/**
 * @ignore
 */
exports.shouldCorrectlyPerformWorkingFiledRead = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;

    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      var gridStore = new GridStore(db, "test_gs_working_field_read", "w");
      var data = fs.readFileSync("./test/functional/data/test_gs_working_field_read.pdf", 'binary');

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
}

/**
 * @ignore
 */
exports.shouldCorrectlyPerformWorkingFiledReadWithChunkSizeLessThanFileSize = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;

    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      // Create a new file
      var gridStore = new GridStore(db, "test.txt", "w");

      // This shouldnt have to be set higher than the file...
      gridStore.chunkSize = 40960;

      // Open the file
      gridStore.open(function(err, gridStore) {
        var file = fs.createReadStream('./test/functional/data/test_gs_working_field_read.pdf');
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
              var data = fs.readFileSync('./test/functional/data/test_gs_working_field_read.pdf');
              test.equal(data.toString('base64'), fileData.toString('base64'));
              db.close();
              test.done();
            });
          });
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyPerformWorkingFiledWithBigFile = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;
    var client = configuration.newDbInstance({w:1});
    client.open(function(err, client) {
      // Prepare fake big file
      var data = fs.readFileSync("./test/functional/data/test_gs_working_field_read.pdf", 'binary');
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
}

/**
 * @ignore
 */
exports.shouldCorrectlyPerformWorkingFiledWriteWithDifferentChunkSizes = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;

    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      // Prepare fake big file
      var data = fs.readFileSync("./test/functional/data/test_gs_working_field_read.pdf", 'binary');
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
}

/**
 * @ignore
 */
exports.shouldCorrectlyReadAndWriteFile = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;

    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      var gridStore = new GridStore(db, "test_gs_weird_bug", "w");
      var data = fs.readFileSync("./test/functional/data/test_gs_weird_bug.png", 'binary');

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
}

/**
 * A simple example showing the usage of the read method.
 *
 * @_class gridstore
 * @_function read
 * @ignore
 */
exports.shouldCorrectlyWriteAndReadJpgImage = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;
    var db = configuration.newDbInstance({w:0}, {poolSize:1});

    // DOC_LINE var db = new Db('test', new Server('localhost', 27017));
    // DOC_START
    // Establish connection to db
    db.open(function(err, db) {
      // Read in the content of a file
      var data = fs.readFileSync('./test/functional/data/iya_logo_final_bw.jpg');
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
}

/**
 * @ignore
 */
exports.shouldCorrectlyReadAndWriteBuffersMultipleChunks = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;

    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      var gridStore = new GridStore(db, null, 'w');
      // Force multiple chunks to be stored
      gridStore.chunkSize = 5000;
      var fileSize = fs.statSync('./test/functional/data/test_gs_weird_bug.png').size;
      var data = fs.readFileSync('./test/functional/data/test_gs_weird_bug.png');

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
}

/**
 * @ignore
 */
exports.shouldCorrectlyReadAndWriteBuffersSingleChunks = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;

    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      var gridStore = new GridStore(db, null, 'w');
      // Force multiple chunks to be stored
      var fileSize = fs.statSync('./test/functional/data/test_gs_weird_bug.png').size;
      var data = fs.readFileSync('./test/functional/data/test_gs_weird_bug.png');

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
}

/**
 * @ignore
 */
exports.shouldCorrectlyReadAndWriteBuffersUsingNormalWriteWithMultipleChunks = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;

    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      var gridStore = new GridStore(db, null, 'w');
      // Force multiple chunks to be stored
      gridStore.chunkSize = 5000;
      var fileSize = fs.statSync('./test/functional/data/test_gs_weird_bug.png').size;
      var data = fs.readFileSync('./test/functional/data/test_gs_weird_bug.png');

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
}

/**
 * @ignore
 */
exports.shouldCorrectlyReadAndWriteBuffersSingleChunksAndVerifyExistance = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;

    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      var gridStore = new GridStore(db, null, 'w');
      // Force multiple chunks to be stored
      var fileSize = fs.statSync('./test/functional/data/test_gs_weird_bug.png').size;
      var data = fs.readFileSync('./test/functional/data/test_gs_weird_bug.png');

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
}

/**
 * @ignore
 */
exports.shouldCorrectlySaveDataByObjectID = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;

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
}

/**
 * @ignore
 */
exports.shouldCheckExistsByUsingRegexp = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;

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
}

/**
 * A simple example showing opening a file using a filename, writing to it and saving it.
 *
 * @_class gridstore
 * @_function open
 * @ignore
 */
exports.shouldCorrectlySaveSimpleFileToGridStoreUsingFilename = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;
    var db = configuration.newDbInstance({w:0}, {poolSize:1});

    // DOC_LINE var db = new Db('test', new Server('localhost', 27017));
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
}

/**
 * A simple example showing opening a file using an ObjectID, writing to it and saving it.
 *
 * @_class gridstore
 * @_function open
 * @ignore
 */
exports.shouldCorrectlySaveSimpleFileToGridStoreUsingObjectID = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;
    var db = configuration.newDbInstance({w:0}, {poolSize:1});

    // DOC_LINE var db = new Db('test', new Server('localhost', 27017));
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
}

/**
 * A simple example showing how to write a file to Gridstore using file location path.
 *
 * @_class gridstore
 * @_function writeFile
 * @ignore
 */
exports.shouldCorrectlySaveSimpleFileToGridStoreUsingWriteFile = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;
    var db = configuration.newDbInstance({w:0}, {poolSize:1});

    // DOC_LINE var db = new Db('test', new Server('localhost', 27017));
    // DOC_START
    // Establish connection to db
    db.open(function(err, db) {
      // Our file ID
      var fileId = new ObjectID();

      // Open a new file
      var gridStore = new GridStore(db, fileId, 'w');

      // Read the filesize of file on disk (provide your own)
      var fileSize = fs.statSync('./test/functional/data/test_gs_weird_bug.png').size;
      // Read the buffered data for comparision reasons
      var data = fs.readFileSync('./test/functional/data/test_gs_weird_bug.png');

      // Open the new file
      gridStore.open(function(err, gridStore) {

        // Write the file to gridFS
        gridStore.writeFile('./test/functional/data/test_gs_weird_bug.png', function(err, doc) {

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
}

/**
 * A simple example showing how to write a file to Gridstore using a file handle.
 *
 * @_class gridstore
 * @_function writeFile
 * @ignore
 */
exports.shouldCorrectlySaveSimpleFileToGridStoreUsingWriteFileWithHandle = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;
    var db = configuration.newDbInstance({w:0}, {poolSize:1});

    // DOC_LINE var db = new Db('test', new Server('localhost', 27017));
    // DOC_START
    // Establish connection to db
    db.open(function(err, db) {
      // Our file ID
      var fileId = new ObjectID();

      // Open a new file
      var gridStore = new GridStore(db, fileId, 'w');

      // Read the filesize of file on disk (provide your own)
      var fileSize = fs.statSync('./test/functional/data/test_gs_weird_bug.png').size;
      // Read the buffered data for comparision reasons
      var data = fs.readFileSync('./test/functional/data/test_gs_weird_bug.png');

      // Open a file handle for reading the file
      var fd = fs.openSync('./test/functional/data/test_gs_weird_bug.png', 'r', 0666);

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
}

/**
 * A simple example showing how to use the write command with strings and Buffers.
 *
 * @_class gridstore
 * @_function write
 * @ignore
 */
exports.shouldCorrectlySaveSimpleFileToGridStoreUsingWriteWithStringsAndBuffers = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;
    var db = configuration.newDbInstance({w:0}, {poolSize:1});

    // DOC_LINE var db = new Db('test', new Server('localhost', 27017));
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
}

/**
 * A simple example showing how to use the write command with strings and Buffers.
 *
 * @_class gridstore
 * @_function close
 * @ignore
 */
exports.shouldCorrectlySaveSimpleFileToGridStoreUsingClose = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;
    var db = configuration.newDbInstance({w:0}, {poolSize:1});

    // DOC_LINE var db = new Db('test', new Server('localhost', 27017));
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
}

/**
 * A simple example showing how to access the chunks collection object.
 *
 * @_class gridstore
 * @_function chunkCollection
 * @ignore
 */
exports.shouldCorrectlyAccessChunkCollection = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;
    var db = configuration.newDbInstance({w:0}, {poolSize:1});

    // DOC_LINE var db = new Db('test', new Server('localhost', 27017));
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
}

/**
 * A simple example showing how to use the instance level unlink command to delete a gridstore item.
 *
 * @_class gridstore
 * @_function unlink
 * @ignore
 */
exports.shouldCorrectlySaveSimpleFileToGridStoreUsingCloseAndThenUnlinkIt = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;
    var db = configuration.newDbInstance({w:0}, {poolSize:1});

    // DOC_LINE var db = new Db('test', new Server('localhost', 27017));
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
}

/**
 * A simple example showing how to access the files collection object.
 *
 * @_class gridstore
 * @_function collection
 * @ignore
 */
exports.shouldCorrectlyAccessFilesCollection = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;
    var db = configuration.newDbInstance({w:0}, {poolSize:1});

    // DOC_LINE var db = new Db('test', new Server('localhost', 27017));
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
}

/**
 * A simple example showing reading back using readlines to split the text into lines by the seperator provided.
 *
 * @_class gridstore
 * @_function GridStore.readlines
 * @ignore
 */
exports.shouldCorrectlyPutACoupleOfLinesInGridStoreAndUseReadlines = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;
    var db = configuration.newDbInstance({w:0}, {poolSize:1});

    // DOC_LINE var db = new Db('test', new Server('localhost', 27017));
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
}

/**
 * A simple example showing reading back using readlines to split the text into lines by the seperator provided.
 *
 * @_class gridstore
 * @_function readlines
 * @ignore
 */
exports.shouldCorrectlyPutACoupleOfLinesInGridStoreAndUseInstanceReadlines = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;
    var db = configuration.newDbInstance({w:0}, {poolSize:1});

    // DOC_LINE var db = new Db('test', new Server('localhost', 27017));
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
}

/**
 * A simple example showing the usage of the read method.
 *
 * @_class gridstore
 * @_function GridStore.read
 * @ignore
 */
exports.shouldCorrectlyPutACoupleOfLinesInGridStoreRead = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;
    var db = configuration.newDbInstance({w:0}, {poolSize:1});

    // DOC_LINE var db = new Db('test', new Server('localhost', 27017));
    // DOC_START
    // Establish connection to db
    db.open(function(err, db) {
      // Create a new file
      var gridStore = new GridStore(db, null, "w");
      // Read in the content from a file, replace with your own
      var data = fs.readFileSync("./test/functional/data/test_gs_weird_bug.png");

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
}

/**
 * @ignore
 */
exports.shouldCorrectlyOpenGridStoreWithDifferentRoot = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;
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
}

/**
 * @ignore
 */
exports.shouldCorrectlySetFilenameForGridstoreOpen = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;

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
}

/**
 * @ignore
 */
exports.shouldCorrectlyAppendToFileCorrectly = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;

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
}

/**
 * @ignore
 */
exports.shouldCorrectlySaveFileAndThenOpenChangeContentTypeAndSaveAgain = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;

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
}

/**
 * @ignore
 */
exports.shouldCorrectlySaveFileWithoutFilenameAndThenOpenAddFilenameAndSaveAgain = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;

    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      var id = new ObjectID();
      var gridStore = new GridStore(db, id, "w", {content_type: "image/jpeg"});
      gridStore.open(function(err, gridStore) {
        gridStore.write("hello world!", function(err, gridStore) {
          gridStore.close(function(err, result) {
            // Open the gridstore
            new GridStore(db, id, "test_gs_filename", "w").open(function(err, gridStore) {
              gridStore.contentType = "html/text";
              gridStore.write("<h1>hello world!</h1>", function(err, gridStore) {
                gridStore.close(function(err, result) {

                  new GridStore(db, id, "r").open(function(err, gridStore) {
                    test.equal(null, err);
                    console.log("2", gridStore.filename);
                    test.equal("test_gs_filename", gridStore.filename);

                    gridStore.read(function(err, data) {
                      test.equal(null, err);
                      test.equal("<h1>hello world!</h1>", data.toString('utf8'));
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
}

/**
 * @ignore
 */
exports.shouldCorrectlySaveFileAndThenOpenChangeFilenameAndSaveAgain = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;

    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      var id = new ObjectID();
      var gridStore = new GridStore(db, id, "test_gs_filename3", "w", {content_type: "image/jpeg"});
      gridStore.open(function(err, gridStore) {
        gridStore.write("hello world!", function(err, gridStore) {
          gridStore.close(function(err, result) {
            // Open the gridstore
            new GridStore(db, id, "test_gs_filename4", "w").open(function(err, gridStore) {
              gridStore.contentType = "html/text";
              gridStore.write("<h1>hello world!</h1>", function(err, gridStore) {
                gridStore.close(function(err, result) {

                  new GridStore(db, id, "r").open(function(err, gridStore) {
                    test.equal(null, err);
                    console.log("2", gridStore.filename);
                    test.equal("test_gs_filename4", gridStore.filename);

                    gridStore.read(function(err, data) {
                      test.equal(null, err);
                      test.equal("<h1>hello world!</h1>", data.toString('utf8'));
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
}

/**
 * @ignore
 */
exports.shouldCorrectlySaveFileAndThenAppendChangeFilenameAndSaveAgain = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;

    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      var id = new ObjectID();
      var gridStore = new GridStore(db, id, "test_gs_filename1", "w", {content_type: "image/jpeg"});
      gridStore.open(function(err, gridStore) {
        gridStore.write("hello world!", function(err, gridStore) {
          gridStore.close(function(err, result) {
            // Open the gridstore
            new GridStore(db, id, "test_gs_filename2", "w+").open(function(err, gridStore) {
              gridStore.contentType = "html/text";
              gridStore.close(function(err, result) {

                new GridStore(db, id, "r").open(function(err, gridStore) {
                  test.equal(null, err);
                  console.log("3", gridStore.filename);
                  test.equal("test_gs_filename2", gridStore.filename);

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
}

/**
 * @ignore
 */
exports.shouldCorrectlyHandleSeekWithStream = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;

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

              gridStore.seek(2, function(err, gstore) {
                test.equal(null, err);

                var stream = gridStore.stream(true);

                stream.on('data', function(chunk) {
                  test.equal("llo world!", chunk.toString());
                });

                stream.on('readable', function(chunk) {
                });

                stream.on('end', function() {
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
}

/**
 * @ignore
 */
exports.shouldCorrectlyHandleSeekIntoSecondChunkWithStream = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;

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

              gridStore.seek(7, function(err, gstore) {
                test.equal(null, err);

                var stream = gridStore.stream(true);
                var data = '';

                stream.on('data', function(chunk) {
                  data = data + chunk.toString();
                });

                stream.on('end', function() {
                  test.equal("orld!", data);
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
}

/**
 * @ignore
 */
exports['Should correctly handle multiple seeks'] = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;

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
}

/**
 * @ignore
 */
exports['Should correctly handle multiple seeks over several chunks'] = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;

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
}

/**
 * @ignore
 */
exports.shouldWriteFileWithMongofilesAndReadWithNodeJS = {
  metadata: { requires: { topology: 'single' } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;

    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      var id = new ObjectID();

      // Execute function
      var exec_function = format("mongofiles --host localhost --port 27017 --db %s put %s", configuration.database, __dirname + "/data/iya_logo_final_bw.jpg");
      var exec = child_process.exec;
      // Read the data to compare
      var originalData = fs.readFileSync(__dirname + "/data/iya_logo_final_bw.jpg");
      // Upload using the mongofiles
      exec(exec_function, function(error, stdout, stderr) {
        test.ok(stdout.match(/added file/) != -1);

        GridStore.list(db, function(err, items) {
          // Load the file using MongoDB
          var gridStore = new GridStore(db, __dirname + "/data/iya_logo_final_bw.jpg", "r", {});
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
}

/**
 * @ignore
 */
exports['Should correctly append content to file and have correct chunk numbers'] = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;

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
}

/**
 * @ignore
 */
exports.shouldCorrectlyStreamWriteToGridStoreObject = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;
    var client = configuration.newDbInstance({w:0}, {poolSize:1});
    client.open(function(err, client) {      
      // Set up gridStore
      var gridStore = new GridStore(client, "test_stream_write", "w");
      var stream = gridStore.stream();
      // Create a file reader stream to an object
      var fileStream = fs.createReadStream("./test/functional/data/test_gs_working_field_read.pdf");
      stream.on("end", function(err) {
        // Just read the content and compare to the raw binary
        GridStore.read(client, "test_stream_write", function(err, gridData) {
          var fileData = fs.readFileSync("./test/functional/data/test_gs_working_field_read.pdf");
          test.equal(fileData.toString('hex'), gridData.toString('hex'));
          client.close();
          test.done();
        })
      });

      // Pipe it through to the gridStore
      fileStream.pipe(stream);
    })
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyStreamReadFromGridStoreObject = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;
    var client = configuration.newDbInstance({w:0}, {poolSize:1});
    client.open(function(err, client) {      
      // Set up gridStore
      var gridStore = new GridStore(client, "test_stream_write_2", "w");
      gridStore.writeFile("./test/functional/data/test_gs_working_field_read.pdf", function(err, result) {   
        // Open a readable gridStore
        gridStore = new GridStore(client, "test_stream_write_2", "r");    
        
        // Create a file write stream
        var fileStream = fs.createWriteStream("./test_stream_write_2.tmp");
        fileStream.on("close", function(err) {     
          // Read the temp file and compare
          var compareData = fs.readFileSync("./test_stream_write_2.tmp");
          var originalData = fs.readFileSync("./test/functional/data/test_gs_working_field_read.pdf");
          test.deepEqual(originalData, compareData);      
          client.close();
          test.done();      
        })
        
        // Pipe out the data
        var pipeResult = gridStore.stream().pipe(fileStream);
      });
    });
  }
}





/** 
 * @ignore
 */
exports.shouldCorrectlyWriteLargeFileStringAndReadBack = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;

    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {  
      var fileId = new ObjectID();
      var gridStore = new GridStore(db, fileId, "w", {root:'fs'});
      gridStore.chunkSize = 5000;

      gridStore.open(function(err, gridStore) {
        var d = '';
        for(var j = 0; j < 5000;j++) {
          d = d + '+';
        }

        // Write 3 chunks
        var done = 3;
        for(var i = 0; i < 3; i++) {
          gridStore.write(d, false, function() {
            done = done - 1;

            if(done == 0) {
              gridStore.close(function(err, result) {
                var gotEnd = false;           
                var endLen = 0;

                var gridStore = new GridStore(db, fileId, "r");
                gridStore.open(function(err, gridStore) {
                  var stream = gridStore.stream();

                  stream.on("data", function(chunk) {
                    endLen += chunk.length
                    // Test length of chunk
                    test.equal(5000, chunk.length);
                    // Check each chunk's data
                    for(var i = 0; i < 5000; i++) test.equal('+', String.fromCharCode(chunk[i]));
                  });

                  stream.on("end", function() {
                    test.equal(15000, endLen);
                    db.close();
                    test.done();
                  });
                });           
              });
            }
          });
        }
      });
    });
  }
}

/** 
 * @ignore
 */
exports.shouldCorrectlyWriteLargeFileBufferAndReadBack = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;

    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {  
      var fileId = new ObjectID();
      var gridStore = new GridStore(db, fileId, "w", {root:'fs'});
      gridStore.chunkSize = 5000;

      gridStore.open(function(err, gridStore) {
        var d = new Buffer(5000);
        for(var j = 0; j < 5000;j++) {
          d[j] = 43;
        }

        // Write 3 chunks
        var done = 3;
        for(var i = 0; i < 3; i++) {
          gridStore.write(d, false, function() {
            done = done - 1;

            if(done == 0) {
              gridStore.close(function(err, result) {
                var gotEnd = false;           
                var endLen = 0;

                var gridStore = new GridStore(db, fileId, "r");
                gridStore.open(function(err, gridStore) {
                  var stream = gridStore.stream();

                  stream.on("data", function(chunk) {
                    endLen += chunk.length
                    // Test length of chunk
                    test.equal(5000, chunk.length);
                    // Check each chunk's data
                    for(var i = 0; i < 5000; i++) test.equal('+', String.fromCharCode(chunk[i]));
                  });

                  stream.on("end", function() {
                    test.equal(15000, endLen);
                    db.close();
                    test.done();
                  });
                });           
              });
            }
          });
        }
      });
    });
  }
}

/**
 * A simple example showing the usage of the stream method.
 *
 * @_class gridstore
 * @_function stream
 * @ignore
 */
exports.shouldCorrectlyReadFileUsingStream = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;
    var db = configuration.newDbInstance({w:0}, {poolSize:1});

    // DOC_LINE var db = new Db('test', new Server('localhost', 27017));
    // DOC_START
    // Establish connection to db  
    db.open(function(err, db) {
      // Open a file for reading
      var gridStoreR = new GridStore(db, "test_gs_read_stream", "r");
      // Open a file for writing
      var gridStoreW = new GridStore(db, "test_gs_read_stream", "w");
      // Read in the data of a file
      var data = fs.readFileSync("./test/functional/data/test_gs_weird_bug.png");

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
              var stream = gs.stream();
              
              // Register events
              stream.on("data", function(chunk) {
                // Record the length of the file
                readLen += chunk.length;
              });

              stream.on("end", function() {              
                // Verify the correctness of the read data
                test.equal(data.length, readLen);              
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
}

/**
 * A simple example showing how to pipe a file stream through from gridfs to a file
 *
 * @_class gridstore
 * @_function stream
 * @ignore
 */
exports.shouldCorrectlyPipeAGridFsToAfile = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore;    
    var db = configuration.newDbInstance({w:0}, {poolSize:1});

    // DOC_LINE var db = new Db('test', new Server('localhost', 27017));
    // DOC_START
    // Establish connection to db  
    db.open(function(err, db) {
      // Open a file for writing
      var gridStoreWrite = new GridStore(db, "test_gs_read_stream_pipe", "w", {chunkSize:1024});
      gridStoreWrite.writeFile("./test/functional/data/test_gs_weird_bug.png", function(err, result) {
        test.equal(null, err);
        test.ok(result != null);        
        // Open the gridStore for reading and pipe to a file
        var gridStore = new GridStore(db, "test_gs_read_stream_pipe", "r");
        gridStore.open(function(err, gridStore) {
          // Create a file write stream
          var fileStream = fs.createWriteStream("./test_gs_weird_bug_streamed.tmp");
          // Grab the read stream
          var stream = gridStore.stream();
          // When the stream is finished close the database
          fileStream.on("close", function(err) {
            // Read the original content
            var originalData = fs.readFileSync("./test/functional/data/test_gs_weird_bug.png");
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
          });

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
exports['Should return same data for streaming as for direct read'] = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore;

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
              
              var stream = gs.stream();
              stream.on("data", function(chunk) {
                readLen += chunk.length;
                chunks.push(chunk);
              });

              stream.on("end", function() {
                test.equal(data.length, readLen);

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
}

/**
 * @ignore
 */
exports.shouldCorrectlyFailDueToMissingChunks = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore;

    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      var FILE = "empty.test.file";
      db.collection('fs.files', function(err, collection) {
        collection.insert({filename: FILE,
          "contentType" : "application/json; charset=UTF-8",
          "length" : 91,
          "chunkSize" : 262144,
          "aliases" : null,
          "metadata" : {},
          "md5" : "4e638392b289870da9291a242e474930"},
          {w:1}, function(err, result) {
            new GridStore(db, FILE, "r").open(function (err, gs) {
              gs.read(function(err, data) {
                test.ok(err != null);
                gs.close(function (){});
                db.close();
                test.done();
              });
            });
          });
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyWriteASmallPayload = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;

    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      var gridStore = new GridStore(db, "test_gs_small_write4", "w");
      gridStore.open(function(err, gridStore) {

        gridStore.write("hello world!", function(err, gridStore) {

          gridStore.close(function(err, result) {

            db.collection('fs.files', function(err, collection) {

              collection.find({'filename':'test_gs_small_write4'}).toArray(function(err, items) {
                test.equal(1, items.length);
                var item = items[0];
                test.ok(item._id instanceof ObjectID || Object.prototype.toString.call(item._id) === '[object ObjectID]');

                db.collection('fs.chunks', function(err, collection) {
                  var id = ObjectID.createFromHexString(item._id.toHexString());

                  collection.find({'files_id':id}).toArray(function(err, items) {
                    test.equal(1, items.length);
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
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyWriteSmallFileUsingABuffer = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore;

    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      var gridStore = new GridStore(db, "test_gs_small_write_with_buffer", "w");
      gridStore.open(function(err, gridStore) {
        var data = new Buffer("hello world", "utf8");

        gridStore.write(data, function(err, gridStore) {
          gridStore.close(function(err, result) {
            db.collection('fs.files', function(err, collection) {
              collection.find({'filename':'test_gs_small_write_with_buffer'}).toArray(function(err, items) {
                test.equal(1, items.length);
                var item = items[0];

                db.collection('fs.chunks', function(err, collection) {
                  collection.find({'files_id':item._id}).toArray(function(err, items) {
                    test.equal(1, items.length);
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
  }
}

/**
 * @ignore
 */
exports.shouldSaveSmallFileToGridStore = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore;

    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      var gridStore = new GridStore(db, "test_gs_small_file", "w");
      gridStore.open(function(err, gridStore) {
        gridStore.write("hello world!", function(err, gridStore) {
          gridStore.close(function(err, result) {
            db.collection('fs.files', function(err, collection) {

              collection.find({'filename':'test_gs_small_file'}).toArray(function(err, items) {
                test.equal(1, items.length);

                // Read test of the file
                GridStore.read(db, 'test_gs_small_file', function(err, data) {
                  test.equal('hello world!', data);
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
}

/**
 * @ignore
 */
exports.shouldCorrectlyOverwriteFile = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore;

    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      var gridStore = new GridStore(db, "test_gs_overwrite", "w");
      gridStore.open(function(err, gridStore) {
        gridStore.write("hello world!", function(err, gridStore) {
          gridStore.close(function(err, result) {
            var gridStore2 = new GridStore(db, "test_gs_overwrite", "w");
            gridStore2.open(function(err, gridStore) {
              gridStore2.write("overwrite", function(err, gridStore) {
                gridStore2.close(function(err, result) {

                  // Assert that we have overwriten the data
                  GridStore.read(db, 'test_gs_overwrite', function(err, data) {
                    test.equal('overwrite', data);
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
}

/**
 * A simple example showing the usage of the seek method.
 *
 * @_class gridstore
 * @_function seek
 * @ignore
 */
exports.shouldCorrectlySeekWithBuffer = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore;
    var db = configuration.newDbInstance({w:0}, {poolSize:1});

    // DOC_LINE var db = new Db('test', new Server('localhost', 27017));
    // DOC_START
    // Establish connection to db
    db.open(function(err, db) {
      // Create a file and open it
      var gridStore = new GridStore(db, "test_gs_seek_with_buffer", "w");
      gridStore.open(function(err, gridStore) {
        // Write some content to the file
        gridStore.write(new Buffer("hello, world!", "utf8"), function(err, gridStore) {
          // Flush the file to GridFS
          gridStore.close(function(result) {

            // Open the file in read mode
            var gridStore2 = new GridStore(db, "test_gs_seek_with_buffer", "r");
            gridStore2.open(function(err, gridStore) {
              // Seek to start
              gridStore.seek(0, function(err, gridStore) {
                // Read first character and verify
                gridStore.getc(function(err, chr) {
                  test.equal('h', chr);
                });
              });
            });

            // Open the file in read mode
            var gridStore3 = new GridStore(db, "test_gs_seek_with_buffer", "r");
            gridStore3.open(function(err, gridStore) {
              // Seek to 7 characters from the beginning off the file and verify
              gridStore.seek(7, function(err, gridStore) {
                gridStore.getc(function(err, chr) {
                  test.equal('w', chr);
                });
              });
            });

            // Open the file in read mode
            var gridStore5 = new GridStore(db, "test_gs_seek_with_buffer", "r");
            gridStore5.open(function(err, gridStore) {
              // Seek to -1 characters from the end off the file and verify
              gridStore.seek(-1, GridStore.IO_SEEK_END, function(err, gridStore) {
                gridStore.getc(function(err, chr) {
                  test.equal('!', chr);
                });
              });
            });

            // Open the file in read mode
            var gridStore6 = new GridStore(db, "test_gs_seek_with_buffer", "r");
            gridStore6.open(function(err, gridStore) {
              // Seek to -6 characters from the end off the file and verify
              gridStore.seek(-6, GridStore.IO_SEEK_END, function(err, gridStore) {
                gridStore.getc(function(err, chr) {
                  test.equal('w', chr);
                });
              });
            });

            // Open the file in read mode
            var gridStore7 = new GridStore(db, "test_gs_seek_with_buffer", "r");
            gridStore7.open(function(err, gridStore) {

              // Seek forward 7 characters from the current read position and verify
              gridStore.seek(7, GridStore.IO_SEEK_CUR, function(err, gridStore) {
                gridStore.getc(function(err, chr) {
                  test.equal('w', chr);

                  // Seek forward -1 characters from the current read position and verify
                  gridStore.seek(-1, GridStore.IO_SEEK_CUR, function(err, gridStore) {
                    gridStore.getc(function(err, chr) {
                      test.equal('w', chr);

                      // Seek forward -4 characters from the current read position and verify
                      gridStore.seek(-4, GridStore.IO_SEEK_CUR, function(err, gridStore) {
                        gridStore.getc(function(err, chr) {
                          test.equal('o', chr);

                          // Seek forward 3 characters from the current read position and verify
                          gridStore.seek(3, GridStore.IO_SEEK_CUR, function(err, gridStore) {
                            gridStore.getc(function(err, chr) {
                              test.equal('o', chr);

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
        });
      });
    });
    // DOC_END
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlySeekWithString = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore;

    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      var gridStore = new GridStore(db, "test_gs_seek", "w");
      gridStore.open(function(err, gridStore) {
        gridStore.write("hello, world!", function(err, gridStore) {
          gridStore.close(function(result) {
            var gridStore2 = new GridStore(db, "test_gs_seek", "r");
            gridStore2.open(function(err, gridStore) {
              gridStore.seek(0, function(err, gridStore) {
                gridStore.getc(function(err, chr) {
                  test.equal('h', chr);

                  var gridStore3 = new GridStore(db, "test_gs_seek", "r");
                  gridStore3.open(function(err, gridStore) {
                    gridStore.seek(7, function(err, gridStore) {
                      gridStore.getc(function(err, chr) {
                        test.equal('w', chr);

                        var gridStore4 = new GridStore(db, "test_gs_seek", "r");
                        gridStore4.open(function(err, gridStore) {
                          gridStore.seek(4, function(err, gridStore) {
                            gridStore.getc(function(err, chr) {
                              test.equal('o', chr);

                              var gridStore5 = new GridStore(db, "test_gs_seek", "r");
                              gridStore5.open(function(err, gridStore) {
                                gridStore.seek(-1, GridStore.IO_SEEK_END, function(err, gridStore) {
                                  gridStore.getc(function(err, chr) {
                                    test.equal('!', chr);

                                    var gridStore6 = new GridStore(db, "test_gs_seek", "r");
                                    gridStore6.open(function(err, gridStore) {
                                      gridStore.seek(-6, GridStore.IO_SEEK_END, function(err, gridStore) {
                                        gridStore.getc(function(err, chr) {
                                          test.equal('w', chr);

                                          var gridStore7 = new GridStore(db, "test_gs_seek", "r");
                                          gridStore7.open(function(err, gridStore) {
                                            gridStore.seek(7, GridStore.IO_SEEK_CUR, function(err, gridStore) {
                                              gridStore.getc(function(err, chr) {
                                                test.equal('w', chr);

                                                gridStore.seek(-1, GridStore.IO_SEEK_CUR, function(err, gridStore) {
                                                  gridStore.getc(function(err, chr) {
                                                    test.equal('w', chr);

                                                    gridStore.seek(-4, GridStore.IO_SEEK_CUR, function(err, gridStore) {
                                                      gridStore.getc(function(err, chr) {
                                                        test.equal('o', chr);

                                                        gridStore.seek(3, GridStore.IO_SEEK_CUR, function(err, gridStore) {
                                                          gridStore.getc(function(err, chr) {
                                                            test.equal('o', chr);
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
              });
            });
          });
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlySeekAcrossChunks = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore;
    var db = configuration.newDbInstance({w:0}, {poolSize:1});

    // Establish connection to db
    db.open(function(err, db) {
      // Create a new file
      var gridStore = new GridStore(db, "test_gs_seek_across_chunks", "w");
      // Open the file
      gridStore.open(function(err, gridStore) {
        var data = new Buffer(gridStore.chunkSize*3)
        // Write the binary file data to GridFS
        gridStore.write(data, function(err, gridStore) {
          // Flush the remaining data to GridFS
          gridStore.close(function(err, result) {

            var gridStore = new GridStore(db, "test_gs_seek_across_chunks", "r");
            // Read in the whole file and check that it's the same content
            gridStore.open(function(err, gridStore) {

              var timeout = setTimeout(function() {
                test.ok(false, "Didn't complete in expected timeframe");
                test.done();
              }, 2000);

              gridStore.seek(gridStore.chunkSize+1, function(err, gridStore) {
                test.equal(null, err);
                gridStore.tell(function(err, position) {
                  test.equal(gridStore.chunkSize+1, position);
                  clearTimeout(timeout);

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
}

/**
 * @ignore
 */
exports.shouldCorrectlyAppendToFile = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;
    var fs_db = configuration.newDbInstance({w:0}, {poolSize:1});

    fs_db.open(function(err, fs_db) {
      fs_db.dropDatabase(function(err, done) {
        var id = new ObjectID();

        var gridStore = new GridStore(fs_db, "test_gs_append", "w");
        gridStore.open(function(err, gridStore) {
          gridStore.write("hello, world!", function(err, gridStore) {
            gridStore.close(function(err, result) {

              var gridStore2 = new GridStore(fs_db, "test_gs_append", "w+");
              gridStore2.open(function(err, gridStore) {
                gridStore2.write(" how are you?", function(err, gridStore) {
                  gridStore2.close(function(err, result) {

                    fs_db.collection('fs.chunks', function(err, collection) {
                      collection.count(function(err, count) {
                        test.equal(1, count);

                        GridStore.read(fs_db, 'test_gs_append', function(err, data) {
                          test.equal("hello, world! how are you?", data.toString('ascii'));

                          fs_db.close();
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
    });
  }
}

/**
 * A simple example showing how to rewind and overwrite the file.
 *
 * @_class gridstore
 * @_function rewind
 * @ignore
 */
exports.shouldCorrectlyRewingAndTruncateOnWrite = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;
    var db = configuration.newDbInstance({w:0}, {poolSize:1});

    // DOC_LINE var db = new Db('test', new Server('localhost', 27017));
    // DOC_START
    // Establish connection to db
    db.open(function(err, db) {
      // Our file ID
      var fileId = new ObjectID();

      // Create a new file
      var gridStore = new GridStore(db, fileId, "w");
      // Open the file
      gridStore.open(function(err, gridStore) {
        // Write to the file
        gridStore.write("hello, world!", function(err, gridStore) {
          // Flush the file to disk
          gridStore.close(function(err, result) {

            // Reopen the file
            gridStore = new GridStore(db, fileId, "w");
            gridStore.open(function(err, gridStore) {
              // Write some more text to the file
              gridStore.write('some text is inserted here', function(err, gridStore) {

                // Let's rewind to truncate the file
                gridStore.rewind(function(err, gridStore) {

                  // Write something from the start
                  gridStore.write('abc', function(err, gridStore) {

                    // Flush the data to mongodb
                    gridStore.close(function(err, result) {

                      // Verify that the new data was written
                      GridStore.read(db, fileId, function(err, data) {
                        test.equal("abc", data);

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
    // DOC_END
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlySaveEmptyFile = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore;
    var fs_db = configuration.newDbInstance({w:0}, {poolSize:1});

    fs_db.open(function(err, fs_db) {
      fs_db.dropDatabase(function(err, done) {
        var gridStore = new GridStore(fs_db, "test_gs_save_empty_file", "w");
        gridStore.open(function(err, gridStore) {
          gridStore.write("", function(err, gridStore) {
            gridStore.close(function(err, result) {
              fs_db.collection('fs.files', function(err, collection) {
                collection.count(function(err, count) {
                  test.equal(1, count);
                });
              });

              fs_db.collection('fs.chunks', function(err, collection) {
                collection.count(function(err, count) {
                  test.equal(0, count);

                  fs_db.close();
                  test.done();
                });
              });
            });
          });
        });
      });
    });
  }
}

/**
 * A simple example showing the usage of the eof method.
 *
 * @_class gridstore
 * @_function eof
 * @ignore
 */
exports.shouldCorrectlyDetectEOF = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore;
    var db = configuration.newDbInstance({w:0}, {poolSize:1});

    // DOC_LINE var db = new Db('test', new Server('localhost', 27017));
    // DOC_START
    // Establish connection to db
    db.open(function(err, db) {

      // Open the file in write mode
      var gridStore = new GridStore(db, 'test_gs_empty_file_eof', "w");
      gridStore.open(function(err, gridStore) {
        // Flush the empty file to GridFS
        gridStore.close(function(err, gridStore) {

          // Open the file in read mode
          var gridStore2 = new GridStore(db, 'test_gs_empty_file_eof', "r");
          gridStore2.open(function(err, gridStore) {
            // Verify that we are at the end of the file
            test.equal(true, gridStore.eof());

            db.close();
            test.done();
          })
        });
      });
    });
    // DOC_END
  }
}

/**
 * @ignore
 */
exports.shouldEnsureThatChunkSizeCannotBeChangedDuringRead = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , Chunk = configuration.require.Chunk;  

    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      var gridStore = new GridStore(db, "test_gs_cannot_change_chunk_size_on_read", "w");
      gridStore.open(function(err, gridStore) {
        gridStore.write("hello, world!", function(err, gridStore) {
          gridStore.close(function(err, result) {

            var gridStore2 = new GridStore(db, "test_gs_cannot_change_chunk_size_on_read", "r");
            gridStore2.open(function(err, gridStore) {
              gridStore.chunkSize = 42;
              test.equal(Chunk.DEFAULT_CHUNK_SIZE, gridStore.chunkSize);
              db.close();
              test.done();
            });
          });
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldEnsureChunkSizeCannotChangeAfterDataHasBeenWritten = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , Chunk = configuration.require.Chunk;

    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      var gridStore = new GridStore(db, "test_gs_cannot_change_chunk_size_after_data_written", "w");
      gridStore.open(function(err, gridStore) {
        gridStore.write("hello, world!", function(err, gridStore) {
          gridStore.chunkSize = 42;
          test.equal(Chunk.DEFAULT_CHUNK_SIZE, gridStore.chunkSize);
          db.close();
          test.done();
        });
      });
    });
  }
}

/*
 * checks if 8 bit values will be preserved in gridstore
 *
 * @ignore
 */
exports.shouldCorrectlyStore8bitValues = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore;

    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      var gridStore = new GridStore(db, "test_gs_check_high_bits", "w");
      var data = new Buffer(255);
      for(var i=0; i<255; i++){
          data[i] = i;
      }

      gridStore.open(function(err, gridStore) {
        gridStore.write(data, function(err, gridStore) {
          gridStore.close(function(err, result) {
            // Assert that we have overwriten the data
            GridStore.read(db, 'test_gs_check_high_bits', function(err, fileData) {
              // change testvalue into a string like "0,1,2,...,255"
              test.equal(data.toString('hex'), fileData.toString('hex'));
              // test.equal(Array.prototype.join.call(data),
              //         Array.prototype.join.call(new Buffer(fileData, "binary")));
              db.close();
              test.done();
            });
          });
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldAllowChangingChunkSize = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore;

    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      var gridStore = new GridStore(db, "test_change_chunk_size", "w");
      gridStore.open(function(err, gridStore) {
        gridStore.chunkSize = 42

        gridStore.write('foo', function(err, gridStore) {
          gridStore.close(function(err, result) {
            var gridStore2 = new GridStore(db, "test_change_chunk_size", "r");
            gridStore2.open(function(err, gridStore) {
              test.equal(42, gridStore.chunkSize);
              db.close();
              test.done();
            });
          });
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldAllowChangingChunkSizeAtCreationOfGridStore = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore;

    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      var gridStore = new GridStore(db, "test_change_chunk_size", "w", {'chunk_size':42});
      gridStore.open(function(err, gridStore) {
        gridStore.write('foo', function(err, gridStore) {
          gridStore.close(function(err, result) {
            var gridStore2 = new GridStore(db, "test_change_chunk_size", "r");
            gridStore2.open(function(err, gridStore) {
              test.equal(42, gridStore.chunkSize);
              db.close();
              test.done();
            });
          });
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyCalculateMD5 = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore;

    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      var gridStore = new GridStore(db, "new-file", "w");
      gridStore.open(function(err, gridStore) {
        gridStore.write('hello world\n', function(err, gridStore) {
          gridStore.close(function(err, result) {
            var gridStore2 = new GridStore(db, "new-file", "r");
            gridStore2.open(function(err, gridStore) {
              test.equal("6f5902ac237024bdd0c176cb93063dc4", gridStore.md5);
              try {
                gridStore.md5 = "can't do this";
              } catch(err) {
                test.ok(err != null);
              }
              test.equal("6f5902ac237024bdd0c176cb93063dc4", gridStore.md5);

              var gridStore2 = new GridStore(db, "new-file", "w");
              gridStore2.open(function(err, gridStore) {
                gridStore.close(function(err, result) {
                  var gridStore3 = new GridStore(db, "new-file", "r");
                  gridStore3.open(function(err, gridStore) {
                    test.equal("d41d8cd98f00b204e9800998ecf8427e", gridStore.md5);
                    db.close();
                    test.done();
                  });
                })
              })
            });
          });
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyUpdateUploadDate = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore;

    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      var now = new Date();
      var originalFileUploadDate = null;

      var gridStore = new GridStore(db, "test_gs_upload_date", "w");
      gridStore.open(function(err, gridStore) {
        gridStore.write('hello world\n', function(err, gridStore) {
          gridStore.close(function(err, result) {

            var gridStore2 = new GridStore(db, "test_gs_upload_date", "r");
            gridStore2.open(function(err, gridStore) {
              test.ok(gridStore.uploadDate != null);
              originalFileUploadDate = gridStore.uploadDate;

              gridStore2.close(function(err, result) {
                var gridStore3 = new GridStore(db, "test_gs_upload_date", "w");
                gridStore3.open(function(err, gridStore) {
                  gridStore3.write('new data', function(err, gridStore) {
                    gridStore3.close(function(err, result) {
                      var fileUploadDate = null;

                      var gridStore4 = new GridStore(db, "test_gs_upload_date", "r");
                      gridStore4.open(function(err, gridStore) {
                        test.equal(originalFileUploadDate.getTime(), gridStore.uploadDate.getTime());
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
}

/**
 * @ignore
 */
exports.shouldCorrectlySaveContentType = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore;

    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      var ct = null;

      var gridStore = new GridStore(db, "test_gs_content_type", "w");
      gridStore.open(function(err, gridStore) {
        gridStore.write('hello world\n', function(err, gridStore) {
          gridStore.close(function(err, result) {

            var gridStore2 = new GridStore(db, "test_gs_content_type", "r");
            gridStore2.open(function(err, gridStore) {
              ct = gridStore.contentType;
              test.equal(GridStore.DEFAULT_CONTENT_TYPE, ct);

              var gridStore3 = new GridStore(db, "test_gs_content_type", "w+");
              gridStore3.open(function(err, gridStore) {
                gridStore.contentType = "text/html";
                gridStore.close(function(err, result) {
                  var gridStore4 = new GridStore(db, "test_gs_content_type", "r");
                  gridStore4.open(function(err, gridStore) {
                    test.equal("text/html", gridStore.contentType);
                    db.close();
                    test.done();
                  });
                })
              });
            });
          });
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlySaveContentTypeWhenPassedInAtGridStoreCreation = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore;

    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      var gridStore = new GridStore(db, "test_gs_content_type_option", "w", {'content_type':'image/jpg'});
      gridStore.open(function(err, gridStore) {
        gridStore.write('hello world\n', function(err, gridStore) {
          gridStore.close(function(result) {

            var gridStore2 = new GridStore(db, "test_gs_content_type_option", "r");
            gridStore2.open(function(err, gridStore) {
              test.equal('image/jpg', gridStore.contentType);
              db.close();
              test.done();
            });
          });
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyReportIllegalMode = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore;

    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      var gridStore = new GridStore(db, "test_gs_unknown_mode", "x");
      gridStore.open(function(err, gridStore) {
        test.ok(err instanceof Error);
        test.equal("Illegal mode x", err.message);
        db.close();
        test.done();
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlySaveAndRetrieveFileMetadata = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore;

    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      var gridStore = new GridStore(db, "test_gs_metadata", "w", {'content_type':'image/jpg'});
      gridStore.open(function(err, gridStore) {
        gridStore.write('hello world\n', function(err, gridStore) {
          gridStore.close(function(err, result) {

            var gridStore2 = new GridStore(db, "test_gs_metadata", "r");
            gridStore2.open(function(err, gridStore) {
              test.equal(null, gridStore.metadata);

              var gridStore3 = new GridStore(db, "test_gs_metadata", "w+");
              gridStore3.open(function(err, gridStore) {
                gridStore.metadata = {'a':1};
                gridStore.close(function(err, result) {

                  var gridStore4 = new GridStore(db, "test_gs_metadata", "r");
                  gridStore4.open(function(err, gridStore) {
                    test.equal(1, gridStore.metadata.a);
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
}

/**
 * @ignore
 */
exports.shouldNotThrowErrorOnClosingOfGridObject = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore;

    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      var gridStore = new GridStore(db, "test_gs_metadata", "w", {'content_type':'image/jpg'});
      gridStore.open(function(err, gridStore) {
        gridStore.write('hello world\n', function(err, gridStore) {
          gridStore.close(function(err, result) {

            var gridStore2 = new GridStore(db, "test_gs_metadata", "r");
            gridStore2.open(function(err, gridStore) {
              gridStore.close(function(err, fo) {
                test.ok(err == null);
                test.ok(fo == null);
                db.close();
                test.done();
              })
            });
          });
        });
      });
    });
  }
}

/**
 * A simple example showing the usage of the tell method.
 *
 * @_class gridstore
 * @_function tell
 * @ignore
 */
exports.shouldCorrectlyExecuteGridstoreTell = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore;
    var db = configuration.newDbInstance({w:0}, {poolSize:1});

    // DOC_LINE var db = new Db('test', new Server('localhost', 27017));
    // DOC_START
    // Establish connection to db
    db.open(function(err, db) {
      // Create a new file
      var gridStore = new GridStore(db, "test_gs_tell", "w");
      // Open the file
      gridStore.open(function(err, gridStore) {
        // Write a string to the file
        gridStore.write("hello, world!", function(err, gridStore) {
          // Flush the file to GridFS
          gridStore.close(function(err, result) {

            // Open the file in read only mode
            var gridStore2 = new GridStore(db, "test_gs_tell", "r");
            gridStore2.open(function(err, gridStore) {

              // Read the first 5 characters
              gridStore.read(5, function(err, data) {
                test.equal("hello", data);

                // Get the current position of the read head
                gridStore.tell(function(err, position) {
                  test.equal(5, position);

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
}

/**
 * A simple example showing the usage of the seek method.
 *
 * @_class gridstore
 * @_function getc
 * @ignore
 */
exports.shouldCorrectlyRetrieveSingleCharacterUsingGetC = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore;
    var db = configuration.newDbInstance({w:0}, {poolSize:1});

    // DOC_LINE var db = new Db('test', new Server('localhost', 27017));
    // DOC_START
    // Establish connection to db
    db.open(function(err, db) {
      // Create a file and open it
      var gridStore = new GridStore(db, "test_gs_getc_file", "w");
      gridStore.open(function(err, gridStore) {
        // Write some content to the file
        gridStore.write(new Buffer("hello, world!", "utf8"), function(err, gridStore) {
          // Flush the file to GridFS
          gridStore.close(function(result) {

            // Open the file in read mode
            var gridStore2 = new GridStore(db, "test_gs_getc_file", "r");
            gridStore2.open(function(err, gridStore) {

              // Read first character and verify
              gridStore.getc(function(err, chr) {
                test.equal('h', chr);

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
}

/**
 * @ignore
 */
exports.shouldNotThrowErrorOnClose = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;

    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      var fieldId = new ObjectID();
      var gridStore = new GridStore(db, fieldId, "w", {root:'fs'});
      gridStore.chunkSize = 1024 * 256;
      gridStore.open(function(err, gridStore) {
        var numberOfWrites = (1000000/5000);
        // console.dir(numberOfWrites)

        var write = function(left, callback) {
          if(left == 0) return callback();
          gridStore.write(new Buffer(5000), function() {
            left = left - 1;
            write(left, callback);
          });
        }

        write(numberOfWrites, function() {
          gridStore.close(function(err, result) {
            db.close();
            test.done();
          });              
        });
      });
    });
  }
}

/**
 * A simple example showing how to save a file with a filename allowing for multiple files with the same name
 *
 * @_class gridstore
 * @_function open
 * @ignore
 */
exports.shouldCorrectlyRetrieveSingleCharacterUsingGetC = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;
    var db = configuration.newDbInstance({w:0}, {poolSize:1});

    // DOC_LINE var db = new Db('test', new Server('localhost', 27017));
    // DOC_START
    // Establish connection to db
    db.open(function(err, db) {
      // Create a file and open it
      var gridStore = new GridStore(db, new ObjectID(), "test_gs_getc_file", "w");
      gridStore.open(function(err, gridStore) {
        // Write some content to the file
        gridStore.write(new Buffer("hello, world!", "utf8"), function(err, gridStore) {
          // Flush the file to GridFS
          gridStore.close(function(err, fileData) {
            test.equal(null, err);

            // Create another file with same name and and save content to it
            gridStore = new GridStore(db, new ObjectID(), "test_gs_getc_file", "w");
            gridStore.open(function(err, gridStore) {
              // Write some content to the file
              gridStore.write(new Buffer("hello, world!", "utf8"), function(err, gridStore) {
                // Flush the file to GridFS
                gridStore.close(function(err, fileData) {
                  test.equal(null, err);

                  // Open the file in read mode using the filename
                  var gridStore2 = new GridStore(db, "test_gs_getc_file", "r");
                  gridStore2.open(function(err, gridStore) {

                    // Read first character and verify
                    gridStore.getc(function(err, chr) {
                      test.equal('h', chr);

                      // Open the file using an object id
                      gridStore2 = new GridStore(db, fileData._id, "r");
                      gridStore2.open(function(err, gridStore) {

                        // Read first character and verify
                        gridStore.getc(function(err, chr) {
                          test.equal('h', chr);

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
      });
    });
    // DOC_END
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlySafeFileUsingIntAsIdKey = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore;

    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      var gridStore = new GridStore(db, 500, "test_gs_small_write2", "w");
      gridStore.open(function(err, gridStore) {

        gridStore.write("hello world!", function(err, gridStore) {

          gridStore.close(function(err, result) {

            db.collection('fs.files', function(err, collection) {

              collection.find({'filename':'test_gs_small_write2'}).toArray(function(err, items) {
                test.equal(1, items.length);
                var item = items[0];
                test.ok(typeof item._id == 'number');

                db.collection('fs.chunks', function(err, collection) {

                  collection.find({'files_id':item._id}).toArray(function(err, items) {
                    test.equal(null, err);
                    test.equal(1, items.length);

                    // Read the file
                    var gridStore = new GridStore(db, 500, "test_gs_small_write2", "r");
                    gridStore.open(function(err, gridStore) {
                      gridStore.read(function(err, data) {
                        test.equal(null, err);
                        test.equal('hello world!', data.toString('ascii'));

                        GridStore.read(db, "test_gs_small_write2", function(err, data) {
                          test.equal(null, err);
                          test.equal('hello world!', data.toString('ascii'));
                          db.close();
                          test.done();
                        })
                      })
                    });
                  })
                });
              });
            });
          });
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyReadWithPositionOffset = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , Long = configuration.require.Long;

    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      // Massive data Buffer
      var data = new Buffer(1024*512);
      // Set some data in the buffer at a point we want to read in the next chunk
      data.write('Hello world!', 1024*256);

      var gridStore = new GridStore(db, Long.fromNumber(100), "test_gs_small_write3", "w");
      gridStore.open(function(err, gridStore) {
        gridStore.write(data, function(err, gridStore) {
          gridStore.close(function(err, result) {

            // Reopen the gridstore in read only mode, seek and then attempt read
            gridStore = new GridStore(db, Long.fromNumber(100), "test_gs_small_write3", "r");
            gridStore.open(function(err, gridStore) {
              // Seek to middle
              gridStore.seek(1024*256 + 6, function(err, gridStore) {
                // Read
                gridStore.read(5, function(err, data) {
                  test.equal('world', data.toString('ascii'))
                  db.close();
                  test.done();
                })
              });
            });
          });
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyWrite = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore;

    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      var mystr = '';
      var sizestr = 1024*25;
      for( var j = 0; j < sizestr; j++ ) {
          mystr = mystr + '+';
      }

      var fname = 'test_large_str';
      var my_chunkSize = 1024*10
      GridStore.unlink(db, fname, function(err, gs) {    
        var gs = new GridStore(db, fname, "w");
        gs.chunkSize = my_chunkSize;
        gs.open(function(err, gs) {
          gs.write(mystr, function(err, gs) {
            gs.close(function(err, gs) {

              var gs2 = new GridStore(db, fname, "r");
              gs2.open(function(err, gs) {
                gs2.seek(0, function() {
                  gs2.read(function(err, datar) {
                    test.equal(mystr.length, datar.length);
                    test.equal(mystr, datar.toString('ascii'));
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
}

/**
 * @ignore
 */
exports.shouldCorrectlyReturnErrorMessageOnNoFileExisting = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore;

    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      var gridStore = new GridStore(db, "_i_shouldCorrectlyWriteASmallPayload", "r");
      gridStore.open(function(err, gridStore) {
        test.ok(err != null);
        db.close();
        test.done();
      });
    });
  }
}

/**
 * A simple example showing the use of the readstream pause function.
 *
 * @_class readstream
 * @_function pause
 * @ignore
 */
exports.shouldStreamDocumentsUsingTheReadStreamPauseFunction = function(configuration, test) {
  var GridStore = configuration.require.GridStore
    , ObjectID = configuration.require.ObjectID;
  var db = configuration.newDbInstance({w:0}, {poolSize:1});

  // DOC_LINE var db = new Db('test', new Server('localhost', 27017));
  // DOC_START
  // Establish connection to db  
  db.open(function(err, db) {
    // File id
    var fileId = new ObjectID();
    // Create a file
    var file = new GridStore(db, fileId, "w", {chunk_size:5});
    file.open(function(err, file) {      
      // Write some content and flush to disk
      file.write('Hello world', function(err, file) {        
        file.close(function(err, result) {
          
          // Let's create a read file
          file = new GridStore(db, fileId, "r");
          // Open the file
          file.open(function(err, file) {            
            // Peform a find to get a cursor
            var stream = file.stream();

            // For each data item
            stream.on("data", function(item) {
              // Pause stream
              stream.pause();
              // Restart the stream after 1 miliscecond
              setTimeout(function() {
                stream.resume();
              }, 100);          
            });

            // For each data item
            stream.on("end", function(item) {
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
 * A simple example showing the use of the readstream resume function.
 *
 * @_class readstream
 * @_function resume
 * @ignore
 */
exports.shouldStreamDocumentsUsingTheReadStreamResumeFunction = function(configuration, test) {
  var GridStore = configuration.require.GridStore
    , ObjectID = configuration.require.ObjectID;
  var db = configuration.newDbInstance({w:0}, {poolSize:1});

  // DOC_LINE var db = new Db('test', new Server('localhost', 27017));
  // DOC_START
  // Establish connection to db  
  db.open(function(err, db) {
    // File id
    var fileId = new ObjectID();
    // Create a file
    var file = new GridStore(db, fileId, "w", {chunk_size:5});
    file.open(function(err, file) {      
      // Write some content and flush to disk
      var fileBody = 'Hello world';
      file.write(fileBody, function(err, file) {        
        file.close(function(err, result) {
          // Let's create a read file
          file = new GridStore(db, fileId, "r");

          // Open the file
          file.open(function(err, file) {            
            // Peform a find to get a cursor
            var stream = file.stream(true);

            // Pause the stream initially
            stream.pause();

            // Save read content here
            var fileBuffer = '';

            // For each data item
            stream.on("data", function(item) {
              // Pause stream
              stream.pause();

              fileBuffer += item.toString('utf8');

              // Restart the stream after 1 miliscecond
              setTimeout(function() {
                stream.resume();
              }, 100);
            });

            // For each data item
            stream.on("end", function(item) {
              // Have we received the same file back?
              test.equal(fileBuffer, fileBody);
              db.close();
              test.done();          
            });

            // Resume the stream
            stream.resume();
          });
        });        
      });      
    });
  });
  // DOC_END
}

/**
 * A simple example showing the use of the readstream destroy function.
 *
 * @_class readstream
 * @_function destroy
 * @ignore
 */
exports.shouldStreamDocumentsUsingTheReadStreamDestroyFunction = function(configuration, test) {
  var GridStore = configuration.require.GridStore
    , ObjectID = configuration.require.ObjectID;
  var db = configuration.newDbInstance({w:0}, {poolSize:1});

  // DOC_LINE var db = new Db('test', new Server('localhost', 27017));
  // DOC_START
  // Establish connection to db  
  db.open(function(err, db) {
    // File id
    var fileId = new ObjectID();
    // Create a file
    var file = new GridStore(db, fileId, "w");
    file.open(function(err, file) {      
      // Write some content and flush to disk
      file.write('Hello world', function(err, file) {        
        file.close(function(err, result) {
          
          // Let's create a read file
          file = new GridStore(db, fileId, "r");
          // Open the file
          file.open(function(err, file) {            
            // Peform a find to get a cursor
            var stream = file.stream();

            // For each data item
            stream.on("data", function(item) {
              // Destroy the stream
              stream.destroy();
            });

            // When the stream is done
            stream.on("end", function() {
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