"use strict";

var fs = require('fs')
  , format = require('util').format
  , child_process = require('child_process');

/**
 * @ignore
 */
exports.shouldCreateNewGridStoreObject = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
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
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
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
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
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
 * @ignore
 */
exports.shouldCorrectlySafeFileAndReadFileByObjectId = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
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
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
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
 * @ignore
 */
exports.shouldCorrectlyPeformGridStoreReadLength = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
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
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
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
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;
    var fs_client = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});

    fs_client.open(function(err, fs_client) {
      test.equal(null, err);

      fs_client.dropDatabase(function(err, done) {
        test.equal(null, err);

        var gridStore = new GridStore(fs_client, "test_gs_multi_chunk", "w");
        gridStore.open(function(err, gridStore) {
          test.equal(null, err);

          gridStore.chunkSize = 512;
          var file1 = ''; var file2 = ''; var file3 = '';
          for(var i = 0; i < gridStore.chunkSize; i++) { file1 = file1 + 'x'; }
          for(var i = 0; i < gridStore.chunkSize; i++) { file2 = file2 + 'y'; }
          for(var i = 0; i < gridStore.chunkSize; i++) { file3 = file3 + 'z'; }

          gridStore.write(file1, function(err, gridStore) {
            console.dir(err)
            test.equal(null, err);

            gridStore.write(file2, function(err, gridStore) {
              test.equal(null, err);
  
              gridStore.write(file3, function(err, gridStore) {
                test.equal(null, err);
    
                gridStore.close(function(err, result) {
                  test.equal(null, err);
      
                  fs_client.collection('fs.chunks', function(err, collection) {
                    test.equal(null, err);

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
 * @ignore
 */
exports.shouldCorrectlyHandleUnlinkingWeirdName = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;
    var fs_client = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});

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
 * @ignore
 */
exports.shouldCorrectlyUnlinkAnArrayOfFiles = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;
    var fs_client = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});

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
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
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
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
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
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
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
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
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
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;
    var client = configuration.newDbInstance(configuration.writeConcernMax());
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
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
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

          file.on('end', function () {
            // Flush the remaining data to GridFS
            gridStore.close(function(err, result) {
              test.equal(null, err);
              test.ok(result != null);

              // Read in the whole file and check that it's the same content
              GridStore.read(db, result._id, function(err, fileData) {
                var data = fs.readFileSync('./test_gs_working_field_read.tmp');
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
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
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
 * @ignore
 */
exports.shouldCorrectlyReadAndWriteBuffersMultipleChunks = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
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
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
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
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
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
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
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
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
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
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
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
 * @ignore
 */
exports.shouldCorrectlyOpenGridStoreWithDifferentRoot = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
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
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
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
exports.shouldCorrectlySaveFileAndThenOpenChangeContentTypeAndSaveAgain = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
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
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
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
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
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
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
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
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
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
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
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
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
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
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
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

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
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
exports['Should fail when attempting to append to a file'] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
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
                test.ok(err != null);

                db.close();
                test.done();
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
exports.shouldCorrectlyStreamReadFromGridStoreObject = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;
    var client = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
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
exports.shouldCorrectlyStreamReadFromGridStoreObjectNoGridStoreOpenCalled = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },
  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;

    var client = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    client.open(function(err, client) {
      // Set up gridStore
      var gridStore = new GridStore(client, "test_stream_write_2", "w");
      gridStore.writeFile("./test/functional/data/test_gs_working_field_read.pdf", function(err, result) {
        // Open a readable gridStore
        gridStore = new GridStore(client, "test_stream_write_2", "r");
        var gotData = false;

        // Pipe out the data
        var stream = gridStore.stream();
        stream.on('data', function(data) {
          gotData = true;
        });

        stream.on('end', function() {
          test.ok(gotData);

          client.close();
          test.done();
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyStreamWriteFromGridStoreObject = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;
    var client = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    client.open(function(err, client) {
      var filename = "test_stream_write_2";
      var filepath = "./test/functional/data/test_gs_working_field_read.pdf";
      // Set up streams
      var fileStream = fs.createReadStream(filepath);
      var storeStream = new GridStore(client, filename, "w").stream();

      // Finish up once the file has been all read
      storeStream.on("end", function(err) {

        // Just read the content and compare to the raw binary
        GridStore.read(client, filename, function(err, gridData) {
          test.equal(null, err);
          var fileData = fs.readFileSync(filepath);
          test.equal(fileData.toString('hex'), gridData.toString('hex'));
          client.close();
          test.done();
        });

      });

      // Pipe it through to the gridStore
      fileStream.pipe(storeStream);
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyWriteLargeFileStringAndReadBack = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
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
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
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
 * @ignore
 */
exports['Should return same data for streaming as for direct read'] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
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
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
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
          configuration.writeConcernMax(), function(err, result) {
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
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
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
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
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
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
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
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
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
 * @ignore
 */
exports.shouldCorrectlySeekWithString = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
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
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore;
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});

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
exports.shouldCorrectlySaveEmptyFile = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore;
    var fs_db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});

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
 * @ignore
 */
exports.shouldEnsureThatChunkSizeCannotBeChangedDuringRead = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , Chunk = configuration.require.Chunk;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
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
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , Chunk = configuration.require.Chunk;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
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
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
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
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
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
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
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
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
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
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
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
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
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
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
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
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      var gridStore = new GridStore(db, "test_gs_unknown_mode", "x");
      try {
        gridStore.open(function(err, gridStore) {});        
      } catch(err) {
        test.ok(err instanceof Error);
        test.equal("Illegal mode x", err.message);
        db.close();
        test.done();        
      }
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlySaveAndRetrieveFileMetadata = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
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
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
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
 * @ignore
 */
exports.shouldNotThrowErrorOnClose = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      var fieldId = new ObjectID();
      var gridStore = new GridStore(db, fieldId, "w", {root:'fs'});
      gridStore.chunkSize = 1024 * 256;
      gridStore.open(function(err, gridStore) {
        var numberOfWrites = (1000000/5000);

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
 * @ignore
 */
exports.shouldCorrectlySafeFileUsingIntAsIdKey = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
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
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , Long = configuration.require.Long;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
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
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
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
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
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
 * @ignore
 */
exports['should fail when seeking on a write enabled gridstore object'] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      var gridStore = new GridStore(db, "test_gs_metadata", "w", {'content_type':'image/jpg'});
      gridStore.open(function(err, gridStore) {
        gridStore.seek(0, function(err, g) {
          test.ok(err != null);
          db.close();
          test.done();
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports['should correctly handle filename as ObjectId'] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      var id = new ObjectID();
      var gridStore = new GridStore(db, id, id, "w");
      gridStore.open(function(err, gridStore) {
        gridStore.write("hello world!", function(err, gridStore) {
          gridStore.close(function(err, result) {

            // Check if file exists
            GridStore.exist(db, {filename: id}, function(err, r) {
              test.equal(true, r);

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
exports['should correctly pipe through multiple pipelines'] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient
      , GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID
      , fs = require('fs')
      , assert = require('assert');

    // Connection URL
    var url = 'mongodb://localhost:27017/myproject';
    // Use connect method to connect to the Server
    MongoClient.connect(configuration.url(), function(err, db) {
      assert.equal(null, err);

      // Set up gridStore
      var stream = new GridStore(db, 'simple_100_document_toArray.png', 'w').stream();
      // File we want to write to GridFS
      var filename = './test/functional/data/test_gs_working_field_read.pdf';
      // Create a file reader stream to an object
      var fileStream = fs.createReadStream(filename);

      // Finish up once the file has been all read
      stream.on("end", function(err) {

        // Just read the content and compare to the raw binary
        GridStore.read(db, 'simple_100_document_toArray.png', function(err, gridData) {
          test.equal(null, err);
          var fileData = fs.readFileSync(filename);
          test.equal(fileData.toString('hex'), gridData.toString('hex'));
          db.close();
          test.done();
        })
      });

      // Pipe it through to the gridStore
      fileStream.pipe(stream);
    });
  }
}

/**
 * @ignore
 */
exports['should correctly seek on file where size of file is a multiple of the chunk size'] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient
      , GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID
      , fs = require('fs')
      , assert = require('assert');

    // Connection URL
    var url = 'mongodb://localhost:27017/myproject';
    // Use connect method to connect to the Server
    MongoClient.connect(configuration.url(), function(err, db) {
      assert.equal(null, err);

      var gridStore = new GridStore(db, "test_gs_multi_chunk_exact_size", "w");
      gridStore.open(function(err, gridStore) {
        gridStore.chunkSize = 512;

        // Write multiple of chunk size
        gridStore.write(new Buffer(gridStore.chunkSize * 4), function(err, r) {
          test.equal(null, err);

          gridStore.close(function(err) {
            test.equal(null, err);

            var gridStore = new GridStore(db, "test_gs_multi_chunk_exact_size", "r");
            gridStore.open(function(err, store) {
              test.equal(null, err);

              store.seek(0, GridStore.IO_SEEK_END, function (err) {
                test.equal(null, err);

                store.tell(function (err, pos) {
                  test.equal(null, err);
                  test.equal(512 * 4, pos);

                  store.seek(0, GridStore.IO_SEEK_SET, function (err) {
                    test.equal(null, err);

                    store.tell(function (err, pos) {
                      test.equal(null, err);
                      test.equal(0, pos);

                      store.read(function(err, data) {
                        test.equal(null, err);
                        test.equal(512 * 4, data.length);

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
exports['should correctly seek on file where size of file is a multiple of the chunk size and then stream'] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient
      , GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID
      , fs = require('fs')
      , assert = require('assert');

    // Connection URL
    var url = 'mongodb://localhost:27017/myproject';
    var id = new ObjectID();

    // Use connect method to connect to the Server
    MongoClient.connect(configuration.url(), function(err, db) {
      assert.equal(null, err);

      var gridStore = new GridStore(db, id, "w");
      gridStore.open(function(err, gridStore) {
        gridStore.chunkSize = 512;

        // Get the data
        var data = new Buffer(gridStore.chunkSize * 2);
        for(var i = 0; i < (gridStore.chunkSize) * 2; i++) {
          data[i] = 0;
        }

        // Write multiple of chunk size
        gridStore.write(data, function(err, r) {
          test.equal(null, err);

          gridStore.close(function(err) {
            test.equal(null, err);

            var gridStore = new GridStore(db, id, "r");
            gridStore.open(function(err, store) {
              test.equal(null, err);

              store.seek(0, GridStore.IO_SEEK_END, function (err) {
                test.equal(null, err);

                store.tell(function (err, pos) {
                  test.equal(null, err);
                  test.equal(512 * 2, pos);

                  store.seek(0, GridStore.IO_SEEK_SET, function (err) {
                    test.equal(null, err);

                    store.tell(function (err, pos) {
                      test.equal(null, err);
                      test.equal(0, pos);

                      // Get the stream
                      var stream = store.stream();
                      var retrieved = '';

                      stream.on('data', function(d) {
                        retrieved += d.toString('hex');
                      });

                      stream.on('end', function() {
                        test.equal(data.toString('hex'), retrieved)

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
exports['should correctly write fake png to gridstore'] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient
      , GridStore = configuration.require.GridStore
      , ObjectID = configuration.require.ObjectID
      , fs = require('fs')
      , assert = require('assert');

    // Connection URL
    var url = 'mongodb://localhost:27017/myproject';
    var id = new ObjectID();

    // Create a test buffer
    var buffer = new Buffer(200033);

    // Use connect method to connect to the Server
    MongoClient.connect(configuration.url(), function(err, db) {
      assert.equal(null, err);

      var gridStore = new GridStore(db, new ObjectID(), 'w', { "content_type": "image/png", "chunk_size": 1024*4 });
      gridStore.open(function(err, gridStore) {
        test.equal(null, err);

        gridStore.write(buffer, function(err, result) {
          test.equal(null, err);
  
          gridStore.close(function(err, result) { 
            test.equal(null, err);

            db.close();
            test.done();
          });
        });
      });
    });
  }
}