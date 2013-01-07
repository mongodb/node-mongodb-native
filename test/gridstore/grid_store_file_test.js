var mongodb = process.env['TEST_NATIVE'] != null ? require('../../lib/mongodb').native() : require('../../lib/mongodb').pure();

var testCase = require('nodeunit').testCase,
  debug = require('util').debug,
  inspect = require('util').inspect,
  nodeunit = require('nodeunit'),
  Step = require('step'),
  gleak = require('../../dev/tools/gleak'),
  ObjectID = mongodb.ObjectID,
  Db = mongodb.Db,
  Cursor = mongodb.Cursor,
  Long = mongodb.Long,
  Collection = mongodb.Collection,
  GridStore = mongodb.GridStore,
  Chunk = mongodb.Chunk,
  Server = mongodb.Server;

var MONGODB = 'integration_tests';
var client = new Db(MONGODB, new Server("127.0.0.1", 27017, {auto_reconnect: true, poolSize: 4}), {w:0, native_parser: (process.env['TEST_NATIVE'] != null)});
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
exports.shouldCorrectlyFailDueToMissingChunks = function(test) {
  var FILE = "empty.test.file";
  client.collection('fs.files', function(err, collection) {
    collection.insert({filename: FILE,
      "contentType" : "application/json; charset=UTF-8",
      "length" : 91,
      "chunkSize" : 262144,
      "aliases" : null,
      "metadata" : {},
      "md5" : "4e638392b289870da9291a242e474930"},
      {w:1}, function(err, result) {
        new mongodb.GridStore(client, FILE, "r").open(function (err, gs) {
          gs.read(function(err, data) {
            test.ok(err != null);
            gs.close(function (){});
            test.done();
          });
        });
      });
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyWriteASmallPayload = function(test) {
  var gridStore = new GridStore(client, "test_gs_small_write", "w");
  gridStore.open(function(err, gridStore) {

    gridStore.write("hello world!", function(err, gridStore) {

      gridStore.close(function(err, result) {

        client.collection('fs.files', function(err, collection) {

          collection.find({'filename':'test_gs_small_write'}).toArray(function(err, items) {
            test.equal(1, items.length);
            var item = items[0];
            test.ok(item._id instanceof ObjectID || Object.prototype.toString.call(item._id) === '[object ObjectID]');

            client.collection('fs.chunks', function(err, collection) {
              var id = ObjectID.createFromHexString(item._id.toHexString());

              collection.find({'files_id':id}).toArray(function(err, items) {
                test.equal(1, items.length);
                test.done();
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
exports.shouldCorrectlyWriteSmallFileUsingABuffer = function(test) {
  var gridStore = new GridStore(client, "test_gs_small_write_with_buffer", "w");
  gridStore.open(function(err, gridStore) {
    var data = new Buffer("hello world", "utf8");

    gridStore.write(data, function(err, gridStore) {
      gridStore.close(function(err, result) {
        client.collection('fs.files', function(err, collection) {
          collection.find({'filename':'test_gs_small_write_with_buffer'}).toArray(function(err, items) {
            test.equal(1, items.length);
            var item = items[0];
            test.ok(item._id instanceof ObjectID || Object.prototype.toString.call(item._id) === '[object ObjectID]');

            client.collection('fs.chunks', function(err, collection) {
              collection.find({'files_id':item._id}).toArray(function(err, items) {
                test.equal(1, items.length);
                test.done();
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
exports.shouldSaveSmallFileToGridStore = function(test) {
  var gridStore = new GridStore(client, "test_gs_small_file", "w");
  gridStore.open(function(err, gridStore) {
    gridStore.write("hello world!", function(err, gridStore) {
      gridStore.close(function(err, result) {
        client.collection('fs.files', function(err, collection) {

          collection.find({'filename':'test_gs_small_file'}).toArray(function(err, items) {
            test.equal(1, items.length);

            // Read test of the file
            GridStore.read(client, 'test_gs_small_file', function(err, data) {
              test.equal('hello world!', data);
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
exports.shouldCorrectlyOverwriteFile = function(test) {
  var gridStore = new GridStore(client, "test_gs_overwrite", "w");
  gridStore.open(function(err, gridStore) {
    gridStore.write("hello world!", function(err, gridStore) {
      gridStore.close(function(err, result) {
        var gridStore2 = new GridStore(client, "test_gs_overwrite", "w");
        gridStore2.open(function(err, gridStore) {
          gridStore2.write("overwrite", function(err, gridStore) {
            gridStore2.close(function(err, result) {

              // Assert that we have overwriten the data
              GridStore.read(client, 'test_gs_overwrite', function(err, data) {
                test.equal('overwrite', data);
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
 * A simple example showing the usage of the seek method.
 *
 * @_class gridstore
 * @_function seek
 * @ignore
 */
exports.shouldCorrectlySeekWithBuffer = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017,
   {auto_reconnect: false, poolSize: 1, ssl:useSSL}), {w:0, native_parser: native_parser});

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
}

/**
 * @ignore
 */
exports.shouldCorrectlySeekWithString = function(test) {
  var gridStore = new GridStore(client, "test_gs_seek", "w");
  gridStore.open(function(err, gridStore) {
    gridStore.write("hello, world!", function(err, gridStore) {
      gridStore.close(function(result) {
        var gridStore2 = new GridStore(client, "test_gs_seek", "r");
        gridStore2.open(function(err, gridStore) {
          gridStore.seek(0, function(err, gridStore) {
            gridStore.getc(function(err, chr) {
              test.equal('h', chr);
            });
          });
        });

        var gridStore3 = new GridStore(client, "test_gs_seek", "r");
        gridStore3.open(function(err, gridStore) {
          gridStore.seek(7, function(err, gridStore) {
            gridStore.getc(function(err, chr) {
              test.equal('w', chr);
            });
          });
        });

        var gridStore4 = new GridStore(client, "test_gs_seek", "r");
        gridStore4.open(function(err, gridStore) {
          gridStore.seek(4, function(err, gridStore) {
            gridStore.getc(function(err, chr) {
              test.equal('o', chr);
            });
          });
        });

        var gridStore5 = new GridStore(client, "test_gs_seek", "r");
        gridStore5.open(function(err, gridStore) {
          gridStore.seek(-1, GridStore.IO_SEEK_END, function(err, gridStore) {
            gridStore.getc(function(err, chr) {
              test.equal('!', chr);
            });
          });
        });

        var gridStore6 = new GridStore(client, "test_gs_seek", "r");
        gridStore6.open(function(err, gridStore) {
          gridStore.seek(-6, GridStore.IO_SEEK_END, function(err, gridStore) {
            gridStore.getc(function(err, chr) {
              test.equal('w', chr);
            });
          });
        });

        var gridStore7 = new GridStore(client, "test_gs_seek", "r");
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
}

/**
 * @ignore
 */
exports.shouldCorrectlySeekAcrossChunks = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017,
   {auto_reconnect: false, poolSize: 1, ssl:useSSL}), {w:0, native_parser: native_parser});

  test.expect(2);
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

/**
 * @ignore
 */
exports.shouldCorrectlyAppendToFile = function(test) {
  var fs_client = new Db(MONGODB, new Server("127.0.0.1", 27017, {auto_reconnect: false}), {w:0, native_parser: (process.env['TEST_NATIVE'] != null)});
  fs_client.open(function(err, fs_client) {
    fs_client.dropDatabase(function(err, done) {
      var id = new ObjectID();

      var gridStore = new GridStore(fs_client, "test_gs_append", "w");
      gridStore.open(function(err, gridStore) {
        gridStore.write("hello, world!", function(err, gridStore) {
          gridStore.close(function(err, result) {

            var gridStore2 = new GridStore(fs_client, "test_gs_append", "w+");
            gridStore2.open(function(err, gridStore) {
              gridStore2.write(" how are you?", function(err, gridStore) {
                gridStore2.close(function(err, result) {

                  fs_client.collection('fs.chunks', function(err, collection) {
                    collection.count(function(err, count) {
                      test.equal(1, count);

                      GridStore.read(fs_client, 'test_gs_append', function(err, data) {
                        test.equal("hello, world! how are you?", data.toString('ascii'));

                        fs_client.close();
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

/**
 * A simple example showing how to rewind and overwrite the file.
 *
 * @_class gridstore
 * @_function rewind
 * @ignore
 */
exports.shouldCorrectlyRewingAndTruncateOnWrite = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017,
   {auto_reconnect: false, poolSize: 1, ssl:useSSL}), {w:0, native_parser: native_parser});

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
}

/**
 * @ignore
 */
exports.shouldCorrectlySaveEmptyFile = function(test) {
  var fs_client = new Db(MONGODB, new Server("127.0.0.1", 27017, {auto_reconnect: false}), {w:0, native_parser: (process.env['TEST_NATIVE'] != null)});
  fs_client.open(function(err, fs_client) {
    fs_client.dropDatabase(function(err, done) {
      var gridStore = new GridStore(fs_client, "test_gs_save_empty_file", "w");
      gridStore.open(function(err, gridStore) {
        gridStore.write("", function(err, gridStore) {
          gridStore.close(function(err, result) {
            fs_client.collection('fs.files', function(err, collection) {
              collection.count(function(err, count) {
                test.equal(1, count);
              });
            });

            fs_client.collection('fs.chunks', function(err, collection) {
              collection.count(function(err, count) {
                test.equal(0, count);

                fs_client.close();
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
 * A simple example showing the usage of the eof method.
 *
 * @_class gridstore
 * @_function eof
 * @ignore
 */
exports.shouldCorrectlyDetectEOF = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017,
   {auto_reconnect: false, poolSize: 1, ssl:useSSL}), {w:0, native_parser: native_parser});

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
}

/**
 * @ignore
 */
exports.shouldEnsureThatChunkSizeCannotBeChangedDuringRead = function(test) {
  var gridStore = new GridStore(client, "test_gs_cannot_change_chunk_size_on_read", "w");
  gridStore.open(function(err, gridStore) {
    gridStore.write("hello, world!", function(err, gridStore) {
      gridStore.close(function(err, result) {

        var gridStore2 = new GridStore(client, "test_gs_cannot_change_chunk_size_on_read", "r");
        gridStore2.open(function(err, gridStore) {
          gridStore.chunkSize = 42;
          test.equal(Chunk.DEFAULT_CHUNK_SIZE, gridStore.chunkSize);
          test.done();
        });
      });
    });
  });
}

/**
 * @ignore
 */
exports.shouldEnsureChunkSizeCannotChangeAfterDataHasBeenWritten = function(test) {
  var gridStore = new GridStore(client, "test_gs_cannot_change_chunk_size_after_data_written", "w");
  gridStore.open(function(err, gridStore) {
    gridStore.write("hello, world!", function(err, gridStore) {
      gridStore.chunkSize = 42;
      test.equal(Chunk.DEFAULT_CHUNK_SIZE, gridStore.chunkSize);
      test.done();
    });
  });
}

/**
 * checks if 8 bit values will be preserved in gridstore
 *
 * @ignore
 */
exports.shouldCorrectlyStore8bitValues = function(test) {
  var gridStore = new GridStore(client, "test_gs_check_high_bits", "w");
  var data = new Buffer(255);
  for(var i=0; i<255; i++){
      data[i] = i;
  }

  gridStore.open(function(err, gridStore) {
    gridStore.write(data, function(err, gridStore) {
      gridStore.close(function(err, result) {
        // Assert that we have overwriten the data
        GridStore.read(client, 'test_gs_check_high_bits', function(err, fileData) {
          // change testvalue into a string like "0,1,2,...,255"
          test.equal(Array.prototype.join.call(data),
                  Array.prototype.join.call(new Buffer(fileData, "binary")));
          test.done();
        });
      });
    });
  });
}

/**
 * @ignore
 */
exports.shouldAllowChangingChunkSize = function(test) {
  var gridStore = new GridStore(client, "test_change_chunk_size", "w");
  gridStore.open(function(err, gridStore) {
    gridStore.chunkSize = 42

    gridStore.write('foo', function(err, gridStore) {
      gridStore.close(function(err, result) {
        var gridStore2 = new GridStore(client, "test_change_chunk_size", "r");
        gridStore2.open(function(err, gridStore) {
          test.equal(42, gridStore.chunkSize);
          test.done();
        });
      });
    });
  });
}

/**
 * @ignore
 */
exports.shouldAllowChangingChunkSizeAtCreationOfGridStore = function(test) {
  var gridStore = new GridStore(client, "test_change_chunk_size", "w", {'chunk_size':42});
  gridStore.open(function(err, gridStore) {
    gridStore.write('foo', function(err, gridStore) {
      gridStore.close(function(err, result) {
        var gridStore2 = new GridStore(client, "test_change_chunk_size", "r");
        gridStore2.open(function(err, gridStore) {
          test.equal(42, gridStore.chunkSize);
          test.done();
        });
      });
    });
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyCalculateMD5 = function(test) {
  var gridStore = new GridStore(client, "new-file", "w");
  gridStore.open(function(err, gridStore) {
    gridStore.write('hello world\n', function(err, gridStore) {
      gridStore.close(function(err, result) {
        var gridStore2 = new GridStore(client, "new-file", "r");
        gridStore2.open(function(err, gridStore) {
          test.equal("6f5902ac237024bdd0c176cb93063dc4", gridStore.md5);
          try {
            gridStore.md5 = "can't do this";
          } catch(err) {
            test.ok(err != null);
          }
          test.equal("6f5902ac237024bdd0c176cb93063dc4", gridStore.md5);

          var gridStore2 = new GridStore(client, "new-file", "w");
          gridStore2.open(function(err, gridStore) {
            gridStore.close(function(err, result) {
              var gridStore3 = new GridStore(client, "new-file", "r");
              gridStore3.open(function(err, gridStore) {
                test.equal("d41d8cd98f00b204e9800998ecf8427e", gridStore.md5);
                test.done();
              });
            })
          })
        });
      });
    });
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyUpdateUploadDate = function(test) {
  var now = new Date();
  var originalFileUploadDate = null;

  var gridStore = new GridStore(client, "test_gs_upload_date", "w");
  gridStore.open(function(err, gridStore) {
    gridStore.write('hello world\n', function(err, gridStore) {
      gridStore.close(function(err, result) {

        var gridStore2 = new GridStore(client, "test_gs_upload_date", "r");
        gridStore2.open(function(err, gridStore) {
          test.ok(gridStore.uploadDate != null);
          originalFileUploadDate = gridStore.uploadDate;

          gridStore2.close(function(err, result) {
            var gridStore3 = new GridStore(client, "test_gs_upload_date", "w");
            gridStore3.open(function(err, gridStore) {
              gridStore3.write('new data', function(err, gridStore) {
                gridStore3.close(function(err, result) {
                  var fileUploadDate = null;

                  var gridStore4 = new GridStore(client, "test_gs_upload_date", "r");
                  gridStore4.open(function(err, gridStore) {
                    test.equal(originalFileUploadDate.getTime(), gridStore.uploadDate.getTime());
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
exports.shouldCorrectlySaveContentType = function(test) {
  var ct = null;

  var gridStore = new GridStore(client, "test_gs_content_type", "w");
  gridStore.open(function(err, gridStore) {
    gridStore.write('hello world\n', function(err, gridStore) {
      gridStore.close(function(err, result) {

        var gridStore2 = new GridStore(client, "test_gs_content_type", "r");
        gridStore2.open(function(err, gridStore) {
          ct = gridStore.contentType;
          test.equal(GridStore.DEFAULT_CONTENT_TYPE, ct);

          var gridStore3 = new GridStore(client, "test_gs_content_type", "w+");
          gridStore3.open(function(err, gridStore) {
            gridStore.contentType = "text/html";
            gridStore.close(function(err, result) {
              var gridStore4 = new GridStore(client, "test_gs_content_type", "r");
              gridStore4.open(function(err, gridStore) {
                test.equal("text/html", gridStore.contentType);
                test.done();
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
exports.shouldCorrectlySaveContentTypeWhenPassedInAtGridStoreCreation = function(test) {
  var gridStore = new GridStore(client, "test_gs_content_type_option", "w", {'content_type':'image/jpg'});
  gridStore.open(function(err, gridStore) {
    gridStore.write('hello world\n', function(err, gridStore) {
      gridStore.close(function(result) {

        var gridStore2 = new GridStore(client, "test_gs_content_type_option", "r");
        gridStore2.open(function(err, gridStore) {
          test.equal('image/jpg', gridStore.contentType);
          test.done();
        });
      });
    });
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyReportIllegalMode = function(test) {
  var gridStore = new GridStore(client, "test_gs_unknown_mode", "x");
  gridStore.open(function(err, gridStore) {
    test.ok(err instanceof Error);
    test.equal("Illegal mode x", err.message);
    test.done();
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlySaveAndRetrieveFileMetadata = function(test) {
  var gridStore = new GridStore(client, "test_gs_metadata", "w", {'content_type':'image/jpg'});
  gridStore.open(function(err, gridStore) {
    gridStore.write('hello world\n', function(err, gridStore) {
      gridStore.close(function(err, result) {

        var gridStore2 = new GridStore(client, "test_gs_metadata", "r");
        gridStore2.open(function(err, gridStore) {
          test.equal(null, gridStore.metadata);

          var gridStore3 = new GridStore(client, "test_gs_metadata", "w+");
          gridStore3.open(function(err, gridStore) {
            gridStore.metadata = {'a':1};
            gridStore.close(function(err, result) {

              var gridStore4 = new GridStore(client, "test_gs_metadata", "r");
              gridStore4.open(function(err, gridStore) {
                test.equal(1, gridStore.metadata.a);
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
exports.shouldNotThrowErrorOnClose = function(test) {
  var gridStore = new GridStore(client, "test_gs_metadata", "w", {'content_type':'image/jpg'});
  gridStore.open(function(err, gridStore) {
    gridStore.write('hello world\n', function(err, gridStore) {
      gridStore.close(function(err, result) {

        var gridStore2 = new GridStore(client, "test_gs_metadata", "r");
        gridStore2.open(function(err, gridStore) {
          gridStore.close(function(err, fo) {
            test.ok(err == null);
            test.ok(fo == null);
            test.done();
          })
        });
      });
    });
  });
}

/**
 * A simple example showing the usage of the tell method.
 *
 * @_class gridstore
 * @_function tell
 * @ignore
 */
exports.shouldCorrectlyExecuteGridstoreTell = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017,
   {auto_reconnect: false, poolSize: 1, ssl:useSSL}), {w:0, native_parser: native_parser});

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
}

/**
 * A simple example showing the usage of the seek method.
 *
 * @_class gridstore
 * @_function getc
 * @ignore
 */
exports.shouldCorrectlyRetrieveSingleCharacterUsingGetC = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017,
   {auto_reconnect: false, poolSize: 1, ssl:useSSL}), {w:0, native_parser: native_parser});

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
}

/**
 * @ignore
 */
exports.shouldNotThrowErrorOnClose = function(test) {
  var fieldId = new ObjectID();
  var gridStore = new GridStore(client, fieldId, "w", {root:'fs'});
  gridStore.chunkSize = 1024 * 256;
  gridStore.open(function(err, gridStore) {
    Step(
      function writeData() {
        var group = this.group();
        for(var i = 0; i < 1000000; i += 5000) {
            gridStore.write(new Buffer(5000), group());
        }
      },

      function doneWithWrite() {
        gridStore.close(function(err, result) {
          test.done();
        });
      }
    )
  });
}

/**
 * A simple example showing how to save a file with a filename allowing for multiple files with the same name
 *
 * @_class gridstore
 * @_function open
 * @ignore
 */
exports.shouldCorrectlyRetrieveSingleCharacterUsingGetC = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017,
   {auto_reconnect: false, poolSize: 1, ssl:useSSL}), {w:0, native_parser: native_parser});

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
}

/**
 * @ignore
 */
exports.shouldCorrectlySafeFileUsingIntAsIdKey = function(test) {
  var gridStore = new GridStore(client, 500, "test_gs_small_write", "w");
  gridStore.open(function(err, gridStore) {

    gridStore.write("hello world!", function(err, gridStore) {

      gridStore.close(function(err, result) {

        client.collection('fs.files', function(err, collection) {

          collection.find({'filename':'test_gs_small_write'}).toArray(function(err, items) {
            test.equal(1, items.length);
            var item = items[0];
            test.ok(typeof item._id == 'number');

            client.collection('fs.chunks', function(err, collection) {

              collection.find({'files_id':item._id}).toArray(function(err, items) {
                test.equal(null, err);
                test.equal(1, items.length);

                // Read the file
                var gridStore = new GridStore(client, 500, "test_gs_small_write", "r");
                gridStore.open(function(err, gridStore) {
                  gridStore.read(function(err, data) {
                    test.equal(null, err);
                    test.equal('hello world!', data.toString('ascii'));

                    GridStore.read(client, "test_gs_small_write", function(err, data) {
                      test.equal(null, err);
                      test.equal('hello world!', data.toString('ascii'));
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
}

/**
 * @ignore
 */
exports.shouldCorrectlyReadWithPositionOffset = function(test) {
  // Massive data Buffer
  var data = new Buffer(1024*512);
  // Set some data in the buffer at a point we want to read in the next chunk
  data.write('Hello world!', 1024*256);

  var gridStore = new GridStore(client, Long.fromNumber(100), "test_gs_small_write", "w");
  gridStore.open(function(err, gridStore) {
    gridStore.write(data, function(err, gridStore) {
      gridStore.close(function(err, result) {

        // Reopen the gridstore in read only mode, seek and then attempt read
        gridStore = new GridStore(client, Long.fromNumber(100), "test_gs_small_write", "r");
        gridStore.open(function(err, gridStore) {
          // Seek to middle
          gridStore.seek(1024*256 + 6, function(err, gridStore) {
            // Read
            gridStore.read(5, function(err, data) {
              test.equal('world', data.toString('ascii'))
              test.done();
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
exports.shouldCorrectlyWrite = function(test) {
  var mystr = '';
  var sizestr = 1024*25;
  for( var j = 0; j < sizestr; j++ ) {
      mystr = mystr + '+';
  }

  var fname = 'test_large_str';
  var my_chunkSize = 1024*10
  GridStore.unlink(client, fname, function(err, gs) {
    var gs = new GridStore(client, fname, "w");
    gs.chunkSize = my_chunkSize;
    gs.open(function(err, gs) {
      gs.write(mystr, function(err, gs) {
        gs.close(function(err, gs) {

          var gs2 = new GridStore(client, fname, "r");
          gs2.open(function(err, gs) {
            gs2.seek(0, function() {
              gs2.read(function(err, datar) {
                test.equal(mystr.length, datar.length);
                test.equal(mystr, datar.toString('ascii'));
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
exports.shouldCorrectlyReturnErrorMessageOnNoFileExisting = function(test) {
  var gridStore = new GridStore(client, "_i_shouldCorrectlyWriteASmallPayload", "r");
  gridStore.open(function(err, gridStore) {
    test.ok(err != null);
    test.done();
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
