GLOBAL.DEBUG = true;

debug = require("sys").debug,
inspect = require("sys").inspect;
test = require("assert");
var Db = require('../lib/mongodb').Db,
  GridStore = require('../lib/mongodb').GridStore,
  Chunk = require('../lib/mongodb').Chunk,
  Server = require('../lib/mongodb').Server,
  ServerPair = require('../lib/mongodb').ServerPair,
  ServerCluster = require('../lib/mongodb').ServerCluster,
  Code = require('../lib/mongodb/bson/bson').Code;
  Binary = require('../lib/mongodb/bson/bson').Binary;
  ObjectID = require('../lib/mongodb/bson/bson').ObjectID,
  DBRef = require('../lib/mongodb/bson/bson').DBRef,
  Cursor = require('../lib/mongodb/cursor').Cursor,
  Collection = require('../lib/mongodb/collection').Collection,
  BinaryParser = require('../lib/mongodb/bson/binary_parser').BinaryParser,
  Buffer = require('buffer').Buffer,
  fs = require('fs'),
  Script = require('vm');

/*******************************************************************************************************
  Integration Tests
*******************************************************************************************************/
var all_tests = {
  
  // Test the count result on a collection that does not exist
  test_count_on_nonexisting : function() {
    client.collection('test_multiple_insert_2', function(err, collection) {
      collection.count(function(err, count) {
        test.equal(0, count);
        // Let's close the db
        finished_test({test_count_on_nonexisting:'ok'});
      });
    });
  },
                        
  test_save : function() {
    client.createCollection('test_save', function(err, collection) {
      var doc = {'hello':'world'};
      collection.save(doc, function(err, docs) {
        test.ok(docs._id instanceof ObjectID || Object.prototype.toString.call(docs._id) === '[object ObjectID]');
        collection.count(function(err, count) {
          test.equal(1, count);
          doc = docs;
  
          collection.save(doc, function(err, doc) {
            collection.count(function(err, count) {
              test.equal(1, count);
            });
  
            collection.findOne(function(err, doc) {
              test.equal('world', doc.hello);
  
              // Modify doc and save
              doc.hello = 'mike';
              collection.save(doc, function(err, doc) {
                collection.count(function(err, count) {
                  test.equal(1, count);
                });
  
                collection.findOne(function(err, doc) {
                  test.equal('mike', doc.hello);
  
                  // Save another document
                  collection.save({hello:'world'}, function(err, doc) {
                    collection.count(function(err, count) {
                      test.equal(2, count);
                      // Let's close the db
                      finished_test({test_save:'ok'});
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  },
  
  test_save_long : function() {
    client.createCollection('test_save_long', function(err, collection) {
      collection.insert({'x':client.bson_serializer.Long.fromNumber(9223372036854775807)});
      collection.findOne(function(err, doc) {
        test.ok(client.bson_serializer.Long.fromNumber(9223372036854775807).equals(doc.x));
        // Let's close the db
        finished_test({test_save_long:'ok'});
      });
    });
  },
    
  test_save_with_object_that_has_id_but_does_not_actually_exist_in_collection : function() {
    client.createCollection('test_save_with_object_that_has_id_but_does_not_actually_exist_in_collection', function(err, collection) {
      var a = {'_id':'1', 'hello':'world'};
      collection.save(a, function(err, docs) {
        collection.count(function(err, count) {
          test.equal(1, count);
  
          collection.findOne(function(err, doc) {
            test.equal('world', doc.hello);
  
            doc.hello = 'mike';
            collection.save(doc, function(err, doc) {
              collection.count(function(err, count) {
                test.equal(1, count);
              });
  
              collection.findOne(function(err, doc) {
                test.equal('mike', doc.hello);
                // Let's close the db
                finished_test({test_save_with_object_that_has_id_but_does_not_actually_exist_in_collection:'ok'});
              });
            });
          });
        });
      });
    });
  },
              
  // test_kill_cursors : function() {
  //   var test_kill_cursors_client = new Db('integration_tests4_', new Server("127.0.0.1", 27017, {auto_reconnect: true}), {});
  //   test_kill_cursors_client.bson_deserializer = client.bson_deserializer;
  //   test_kill_cursors_client.bson_serializer = client.bson_serializer;
  //   test_kill_cursors_client.pkFactory = client.pkFactory;
  //
  //   test_kill_cursors_client.open(function(err, test_kill_cursors_client) {
  //     var number_of_tests_done = 0;
  //
  //     test_kill_cursors_client.dropCollection('test_kill_cursors', function(err, collection) {
  //       test_kill_cursors_client.createCollection('test_kill_cursors', function(err, collection) {
  //         test_kill_cursors_client.cursorInfo(function(err, cursorInfo) {
  //           var clientCursors = cursorInfo.clientCursors_size;
  //           var byLocation = cursorInfo.byLocation_size;
  //
  //           for(var i = 0; i < 1000; i++) {
  //             collection.save({'i': i}, function(err, doc) {});
  //           }
  //
  //           test_kill_cursors_client.cursorInfo(function(err, cursorInfo) {
  //             test.equal(clientCursors, cursorInfo.clientCursors_size);
  //             test.equal(byLocation, cursorInfo.byLocation_size);
  //
  //             for(var i = 0; i < 10; i++) {
  //               collection.findOne(function(err, item) {});
  //             }
  //
  //             test_kill_cursors_client.cursorInfo(function(err, cursorInfo) {
  //               test.equal(clientCursors, cursorInfo.clientCursors_size);
  //               test.equal(byLocation, cursorInfo.byLocation_size);
  //
  //               for(var i = 0; i < 10; i++) {
  //                 collection.find(function(err, cursor) {
  //                   cursor.nextObject(function(err, item) {
  //                     cursor.close(function(err, cursor) {});
  //
  //                     if(i == 10) {
  //                       test_kill_cursors_client.cursorInfo(function(err, cursorInfo) {
  //                         test.equal(clientCursors, cursorInfo.clientCursors_size);
  //                         test.equal(byLocation, cursorInfo.byLocation_size);
  //
  //                         collection.find(function(err, cursor) {
  //                           cursor.nextObject(function(err, item) {
  //                             test_kill_cursors_client.cursorInfo(function(err, cursorInfo) {
  //                               test.equal(clientCursors, cursorInfo.clientCursors_size);
  //                               test.equal(byLocation, cursorInfo.byLocation_size);
  //
  //                               cursor.close(function(err, cursor) {
  //                                 test_kill_cursors_client.cursorInfo(function(err, cursorInfo) {
  //                                   test.equal(clientCursors, cursorInfo.clientCursors_size);
  //                                   test.equal(byLocation, cursorInfo.byLocation_size);
  //
  //                                   collection.find({}, {'limit':10}, function(err, cursor) {
  //                                     cursor.nextObject(function(err, item) {
  //                                       test_kill_cursors_client.cursorInfo(function(err, cursorInfo) {
  //                                         test_kill_cursors_client.cursorInfo(function(err, cursorInfo) {
  //                                           sys.puts("===================================== err: " + err)
  //                                           sys.puts("===================================== cursorInfo: " + sys.inspect(cursorInfo))
  //
  //
  //                                           test.equal(clientCursors, cursorInfo.clientCursors_size);
  //                                           test.equal(byLocation, cursorInfo.byLocation_size);
  //                                           number_of_tests_done = 1;
  //                                         });
  //                                       });
  //                                     });
  //                                   });
  //                                 });
  //                               });
  //                             });
  //                           });
  //                         });
  //                       });
  //                     }
  //                   });
  //                 });
  //               }
  //             });
  //           });
  //         });
  //       });
  //     });
  //
  //     var intervalId = setInterval(function() {
  //       if(number_of_tests_done == 1) {
  //         clearInterval(intervalId);
  //         finished_test({test_kill_cursors:'ok'});
  //         test_kill_cursors_client.close();
  //       }
  //     }, 100);
  //   });
  // },
  
  // Gridstore tests
  test_gs_exist : function() {
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
            finished_test({test_gs_exist:'ok'});
          });
        });
      });
    });
  },
  
  test_gs_list : function() {
    var gridStore = new GridStore(client, "foobar2", "w");
    gridStore.open(function(err, gridStore) {
      gridStore.write("hello world!", function(err, gridStore) {
        gridStore.close(function(err, result) {
          GridStore.list(client, function(err, items) {
            var found = false;
            items.forEach(function(filename) {
              if(filename == 'foobar2') found = true;
            });
  
            test.ok(items.length >= 1);
            test.ok(found);
          });
  
          GridStore.list(client, 'fs', function(err, items) {
            var found = false;
            items.forEach(function(filename) {
              if(filename == 'foobar2') found = true;
            });
  
            test.ok(items.length >= 1);
            test.ok(found);
          });
  
          GridStore.list(client, 'my_fs', function(err, items) {
            var found = false;
            items.forEach(function(filename) {
              if(filename == 'foobar2') found = true;
            });
  
            test.ok(items.length >= 0);
            test.ok(!found);
  
            var gridStore2 = new GridStore(client, "foobar3", "w");
            gridStore2.open(function(err, gridStore) {
              gridStore2.write('my file', function(err, gridStore) {
                gridStore.close(function(err, result) {
                  GridStore.list(client, function(err, items) {
                    var found = false;
                    var found2 = false;
                    items.forEach(function(filename) {
                      if(filename == 'foobar2') found = true;
                      if(filename == 'foobar3') found2 = true;
                    });
  
                    test.ok(items.length >= 2);
                    test.ok(found);
                    test.ok(found2);
                    finished_test({test_gs_list:'ok'});
                  });
                });
              });
            });
          });
        });
      });
    });
  },
  
  test_gs_small_write : function() {
    var gridStore = new GridStore(client, "test_gs_small_write", "w");
    gridStore.open(function(err, gridStore) {
      gridStore.write("hello world!", function(err, gridStore) {
        gridStore.close(function(err, result) {
          client.collection('fs.files', function(err, collection) {
            collection.find({'filename':'test_gs_small_write'}, function(err, cursor) {
              cursor.toArray(function(err, items) {
                test.equal(1, items.length);
                var item = items[0];
                test.ok(item._id instanceof ObjectID || Object.prototype.toString.call(item._id) === '[object ObjectID]');
  
                client.collection('fs.chunks', function(err, collection) {
                  collection.find({'files_id':item._id}, function(err, cursor) {
                    cursor.toArray(function(err, items) {
                      test.equal(1, items.length);
                      finished_test({test_gs_small_write:'ok'});
                    })
                  });
                });
              });
            });
          });
        });
      });
    });
  },
  
  test_gs_small_write_with_buffer : function() {
    var gridStore = new GridStore(client, "test_gs_small_write_with_buffer", "w");
    gridStore.open(function(err, gridStore) {
      var data = new Buffer("hello world", "utf8");
    
      gridStore.writeBuffer(data, function(err, gridStore) {
        gridStore.close(function(err, result) {
          client.collection('fs.files', function(err, collection) {
            collection.find({'filename':'test_gs_small_write_with_buffer'}, function(err, cursor) {
              cursor.toArray(function(err, items) {
                test.equal(1, items.length);
                var item = items[0];
                test.ok(item._id instanceof ObjectID || Object.prototype.toString.call(item._id) === '[object ObjectID]');
  
                client.collection('fs.chunks', function(err, collection) {
                  collection.find({'files_id':item._id}, function(err, cursor) {
                    cursor.toArray(function(err, items) {
                      test.equal(1, items.length);
                      finished_test({test_gs_small_write_with_buffer:'ok'});
                    })
                  });
                });
              });
            });
          });
        });
      });
    });
  },
  
  test_gs_small_file : function() {
    var gridStore = new GridStore(client, "test_gs_small_file", "w");
    gridStore.open(function(err, gridStore) {
      gridStore.write("hello world!", function(err, gridStore) {
        gridStore.close(function(err, result) {
          client.collection('fs.files', function(err, collection) {
            collection.find({'filename':'test_gs_small_file'}, function(err, cursor) {
              cursor.toArray(function(err, items) {
                test.equal(1, items.length);
  
                // Read test of the file
                GridStore.read(client, 'test_gs_small_file', function(err, data) {
                  test.equal('hello world!', data);
                  finished_test({test_gs_small_file:'ok'});
                });
              });
            });
          });
        });
      });
    });
  },
  
  test_gs_overwrite : function() {
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
                  finished_test({test_gs_overwrite:'ok'});
                });
              });
            });
          });
        });
      });
    });
  },
  
  test_gs_read_length : function() {
    var gridStore = new GridStore(client, "test_gs_read_length", "w");
    gridStore.open(function(err, gridStore) {
      gridStore.write("hello world!", function(err, gridStore) {
        gridStore.close(function(err, result) {
          // Assert that we have overwriten the data
          GridStore.read(client, 'test_gs_read_length', 5, function(err, data) {
            test.equal('hello', data);
            finished_test({test_gs_read_length:'ok'});
          });
        });
      });
    });
  },
  
  test_gs_read_with_offset : function() {
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
            finished_test({test_gs_read_with_offset:'ok'});
          });
        });
      });
    });
  },
  
  test_gs_seek_with_buffer : function() {
    var gridStore = new GridStore(client, "test_gs_seek_with_buffer", "w");
    gridStore.open(function(err, gridStore) {
      var data = new Buffer("hello, world!", "utf8");
      gridStore.writeBuffer(data, function(err, gridStore) {
        gridStore.close(function(result) {
          var gridStore2 = new GridStore(client, "test_gs_seek_with_buffer", "r");
          gridStore2.open(function(err, gridStore) {
            gridStore.seek(0, function(err, gridStore) {
              gridStore.getc(function(err, chr) {
                test.equal('h', chr);
              });
            });
          });
  
          var gridStore3 = new GridStore(client, "test_gs_seek_with_buffer", "r");
          gridStore3.open(function(err, gridStore) {
            gridStore.seek(7, function(err, gridStore) {
              gridStore.getc(function(err, chr) {
                test.equal('w', chr);
              });
            });
          });
  
          var gridStore4 = new GridStore(client, "test_gs_seek_with_buffer", "r");
          gridStore4.open(function(err, gridStore) {
            gridStore.seek(4, function(err, gridStore) {
              gridStore.getc(function(err, chr) {
                test.equal('o', chr);
              });
            });
          });
  
          var gridStore5 = new GridStore(client, "test_gs_seek_with_buffer", "r");
          gridStore5.open(function(err, gridStore) {
            gridStore.seek(-1, GridStore.IO_SEEK_END, function(err, gridStore) {
              gridStore.getc(function(err, chr) {
                test.equal('!', chr);
              });
            });
          });
  
          var gridStore6 = new GridStore(client, "test_gs_seek_with_buffer", "r");
          gridStore6.open(function(err, gridStore) {
            gridStore.seek(-6, GridStore.IO_SEEK_END, function(err, gridStore) {
              gridStore.getc(function(err, chr) {
                test.equal('w', chr);
              });
            });
          });
  
          var gridStore7 = new GridStore(client, "test_gs_seek_with_buffer", "r");
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
                            finished_test({test_gs_seek_with_buffer:'ok'});
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
  },
  
  test_gs_seek : function() {
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
                            finished_test({test_gs_seek:'ok'});
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
  },
  
  test_gs_multi_chunk : function() {
    var fs_client = new Db('integration_tests_10', new Server("127.0.0.1", 27017, {auto_reconnect: false}));
    fs_client.bson_deserializer = client.bson_deserializer;
    fs_client.bson_serializer = client.bson_serializer;
    fs_client.pkFactory = client.pkFactory;
  
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
                        finished_test({test_gs_multi_chunk:'ok'});
                        fs_client.close();
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
  },
  
  test_gs_puts_and_readlines : function() {
    var gridStore = new GridStore(client, "test_gs_puts_and_readlines", "w");
    gridStore.open(function(err, gridStore) {
      gridStore.puts("line one", function(err, gridStore) {
        gridStore.puts("line two\n", function(err, gridStore) {
          gridStore.puts("line three", function(err, gridStore) {
            gridStore.close(function(err, result) {
              GridStore.readlines(client, 'test_gs_puts_and_readlines', function(err, lines) {
                test.deepEqual(["line one\n", "line two\n", "line three\n"], lines);
                finished_test({test_gs_puts_and_readlines:'ok'});
              });
            });
          });
        });
      });
    });
  },
  
  test_gs_weird_name_unlink : function() {
    var fs_client = new Db('awesome_f0eabd4b52e30b223c010000', new Server("127.0.0.1", 27017, {auto_reconnect: false}));
    fs_client.bson_deserializer = client.bson_deserializer;
    fs_client.bson_serializer = client.bson_serializer;
    fs_client.pkFactory = client.pkFactory;
  
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
  
                        finished_test({test_gs_weird_name_unlink:'ok'});
                        fs_client.close();
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
  },
  
  test_gs_unlink : function() {
    var fs_client = new Db('integration_tests_11', new Server("127.0.0.1", 27017, {auto_reconnect: false}));
    fs_client.bson_deserializer = client.bson_deserializer;
    fs_client.bson_serializer = client.bson_serializer;
    fs_client.pkFactory = client.pkFactory;
  
    fs_client.open(function(err, fs_client) {
      fs_client.dropDatabase(function(err, done) {
        var gridStore = new GridStore(fs_client, "test_gs_unlink", "w");
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
                  GridStore.unlink(fs_client, 'test_gs_unlink', function(err, gridStore) {
                    fs_client.collection('fs.files', function(err, collection) {
                      collection.count(function(err, count) {
                        test.equal(0, count);
                      })
                    });
  
                    fs_client.collection('fs.chunks', function(err, collection) {
                      collection.count(function(err, count) {
                        test.equal(0, count);
  
                        finished_test({test_gs_unlink:'ok'});
                        fs_client.close();
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
  },
  
  test_gs_unlink_as_array : function() {
    var fs_client = new Db('integration_tests_11', new Server("127.0.0.1", 27017, {auto_reconnect: false}));
    fs_client.bson_deserializer = client.bson_deserializer;
    fs_client.bson_serializer = client.bson_serializer;
    fs_client.pkFactory = client.pkFactory;

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

                        finished_test({test_gs_unlink_as_array:'ok'});
                        fs_client.close();
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
  },

  test_gs_append : function() {
    var fs_client = new Db('integration_tests_12', new Server("127.0.0.1", 27017, {auto_reconnect: false}));
    fs_client.bson_deserializer = client.bson_deserializer;
    fs_client.bson_serializer = client.bson_serializer;
    fs_client.pkFactory = client.pkFactory;
  
    fs_client.open(function(err, fs_client) {
      fs_client.dropDatabase(function(err, done) {
        var gridStore = new GridStore(fs_client, "test_gs_append", "w");
        gridStore.open(function(err, gridStore) {
          gridStore.write("hello, world!", function(err, gridStore) {
            gridStore.close(function(err, result) {
  
              var gridStore2 = new GridStore(fs_client, "test_gs_append", "w+");
              gridStore2.open(function(err, gridStore) {
                gridStore.write(" how are you?", function(err, gridStore) {
                  gridStore.close(function(err, result) {
  
                    fs_client.collection('fs.chunks', function(err, collection) {
                      collection.count(function(err, count) {
                        test.equal(1, count);
  
                        GridStore.read(fs_client, 'test_gs_append', function(err, data) {
                          test.equal("hello, world! how are you?", data);
                          finished_test({test_gs_append:'ok'});
                          fs_client.close();
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
  },
  
  test_gs_rewind_and_truncate_on_write : function() {
    var gridStore = new GridStore(client, "test_gs_rewind_and_truncate_on_write", "w");
    gridStore.open(function(err, gridStore) {
      gridStore.write("hello, world!", function(err, gridStore) {
        gridStore.close(function(err, result) {
          var gridStore2 = new GridStore(client, "test_gs_rewind_and_truncate_on_write", "w");
          gridStore2.open(function(err, gridStore) {
            gridStore.write('some text is inserted here', function(err, gridStore) {
              gridStore.rewind(function(err, gridStore) {
                gridStore.write('abc', function(err, gridStore) {
                  gridStore.close(function(err, result) {
                    GridStore.read(client, 'test_gs_rewind_and_truncate_on_write', function(err, data) {
                      test.equal("abc", data);
                      finished_test({test_gs_rewind_and_truncate_on_write:'ok'});
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  },
  
  test_gs_tell : function() {
    var gridStore = new GridStore(client, "test_gs_tell", "w");
    gridStore.open(function(err, gridStore) {
      gridStore.write("hello, world!", function(err, gridStore) {
        gridStore.close(function(err, result) {
          var gridStore2 = new GridStore(client, "test_gs_tell", "r");
          gridStore2.open(function(err, gridStore) {
            gridStore.read(5, function(err, data) {
              test.equal("hello", data);
  
              gridStore.tell(function(err, position) {
                test.equal(5, position);
                finished_test({test_gs_tell:'ok'});
              })
            });
          });
        });
      });
    });
  },
  
  test_gs_save_empty_file : function() {
    var fs_client = new Db('integration_tests_13', new Server("127.0.0.1", 27017, {auto_reconnect: false}));
    fs_client.bson_deserializer = client.bson_deserializer;
    fs_client.bson_serializer = client.bson_serializer;
    fs_client.pkFactory = client.pkFactory;
  
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
  
                  finished_test({test_gs_save_empty_file:'ok'});
                  fs_client.close();
                });
              });
            });
          });
        });
      });
    });
  },
  
  test_gs_empty_file_eof : function() {
    var gridStore = new GridStore(client, 'test_gs_empty_file_eof', "w");
    gridStore.open(function(err, gridStore) {
      gridStore.close(function(err, gridStore) {
        var gridStore2 = new GridStore(client, 'test_gs_empty_file_eof', "r");
        gridStore2.open(function(err, gridStore) {
          test.equal(true, gridStore.eof());
          finished_test({test_gs_empty_file_eof:'ok'});
        })
      });
    });
  },
  
  test_gs_cannot_change_chunk_size_on_read : function() {
    var gridStore = new GridStore(client, "test_gs_cannot_change_chunk_size_on_read", "w");
    gridStore.open(function(err, gridStore) {
      gridStore.write("hello, world!", function(err, gridStore) {
        gridStore.close(function(err, result) {
  
          var gridStore2 = new GridStore(client, "test_gs_cannot_change_chunk_size_on_read", "r");
          gridStore2.open(function(err, gridStore) {
            gridStore.chunkSize = 42;
            test.equal(Chunk.DEFAULT_CHUNK_SIZE, gridStore.chunkSize);
            finished_test({test_gs_cannot_change_chunk_size_on_read:'ok'});
          });
        });
      });
    });
  },
  
  test_gs_cannot_change_chunk_size_after_data_written : function() {
    var gridStore = new GridStore(client, "test_gs_cannot_change_chunk_size_after_data_written", "w");
    gridStore.open(function(err, gridStore) {
      gridStore.write("hello, world!", function(err, gridStore) {
        gridStore.chunkSize = 42;
        test.equal(Chunk.DEFAULT_CHUNK_SIZE, gridStore.chunkSize);
        finished_test({test_gs_cannot_change_chunk_size_after_data_written:'ok'});
      });
    });
  },
  
  // checks if 8 bit values will be preserved in gridstore
  test_gs_check_high_bits : function() {
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
              finished_test({test_gs_check_high_bits:'ok'});
            });
          });
        });
      });
    },
  
  test_change_chunk_size : function() {
    var gridStore = new GridStore(client, "test_change_chunk_size", "w");
    gridStore.open(function(err, gridStore) {
      gridStore.chunkSize = 42
  
      gridStore.write('foo', function(err, gridStore) {
        gridStore.close(function(err, result) {
          var gridStore2 = new GridStore(client, "test_change_chunk_size", "r");
          gridStore2.open(function(err, gridStore) {
            test.equal(42, gridStore.chunkSize);
            finished_test({test_change_chunk_size:'ok'});
          });
        });
      });
    });
  },
  
  test_gs_chunk_size_in_option : function() {
    var gridStore = new GridStore(client, "test_change_chunk_size", "w", {'chunk_size':42});
    gridStore.open(function(err, gridStore) {
      gridStore.write('foo', function(err, gridStore) {
        gridStore.close(function(err, result) {
          var gridStore2 = new GridStore(client, "test_change_chunk_size", "r");
          gridStore2.open(function(err, gridStore) {
            test.equal(42, gridStore.chunkSize);
            finished_test({test_gs_chunk_size_in_option:'ok'});
          });
        });
      });
    });
  },
  
  test_gs_md5 : function() {
    var gridStore = new GridStore(client, "new-file", "w");
    gridStore.open(function(err, gridStore) {
      gridStore.write('hello world\n', function(err, gridStore) {
        gridStore.close(function(err, result) {
          var gridStore2 = new GridStore(client, "new-file", "r");
          gridStore2.open(function(err, gridStore) {
            test.equal("41ca11b48009a1cf1ce60dbddf81194a", gridStore.md5);
            gridStore.md5 = "can't do this";
            test.equal("41ca11b48009a1cf1ce60dbddf81194a", gridStore.md5);
  
            var gridStore2 = new GridStore(client, "new-file", "w");
            gridStore2.open(function(err, gridStore) {
              gridStore.close(function(err, result) {
                var gridStore3 = new GridStore(client, "new-file", "r");
                gridStore3.open(function(err, gridStore) {
                  test.equal("d41d8cd98f00b204e9800998ecf8427e", gridStore.md5);
  
                  finished_test({test_gs_chunk_size_in_option:'ok'});
                });
              })
            })
          });
        });
      });
    });
  },
  
  test_gs_upload_date : function() {
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
                      finished_test({test_gs_upload_date:'ok'});
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  },
  
  test_gs_content_type : function() {
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
                  finished_test({test_gs_content_type:'ok'});
                });
              })
            });
          });
        });
      });
    });
  },
  
  test_gs_content_type_option : function() {
    var gridStore = new GridStore(client, "test_gs_content_type_option", "w", {'content_type':'image/jpg'});
    gridStore.open(function(err, gridStore) {
      gridStore.write('hello world\n', function(err, gridStore) {
        gridStore.close(function(result) {
  
          var gridStore2 = new GridStore(client, "test_gs_content_type_option", "r");
          gridStore2.open(function(err, gridStore) {
            test.equal('image/jpg', gridStore.contentType);
            finished_test({test_gs_content_type_option:'ok'});
          });
        });
      });
    });
  },
  
  test_gs_unknown_mode : function() {
    var gridStore = new GridStore(client, "test_gs_unknown_mode", "x");
    gridStore.open(function(err, gridStore) {
      test.ok(err instanceof Error);
      test.equal("Illegal mode x", err.message);
      finished_test({test_gs_unknown_mode:'ok'});
    });
  },
  
  test_gs_metadata : function() {
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
                  finished_test({test_gs_metadata:'ok'});
                });
              });
            });
          });
        });
      });
    });
  },
                  
  // test_force_binary_error : function() {
  //   client.createCollection('test_force_binary_error', function(err, collection) {
  //     // Try to fetch an object using a totally invalid and wrong hex string... what we're interested in here
  //     // is the error handling of the findOne Method
  //     var result= "";
  //     var hexString = "5e9bd59248305adf18ebc15703a1";
  //     for(var index=0 ; index < hexString.length; index+=2) {
  //         var string= hexString.substr(index, 2);
  //         var number= parseInt(string, 16);
  //         result+= BinaryParser.fromByte(number);
  //     }
  //
  //     // Generate a illegal ID
  //     var id = client.bson_serializer.ObjectID.createFromHexString('5e9bd59248305adf18ebc157');
  //     id.id = result;
  //
  //     // Execute with error
  //     collection.findOne({"_id": id}, function(err, result) {
  //       // test.equal(undefined, result)
  //       test.ok(err != null)
  //       finished_test({test_force_binary_error:'ok'});
  //     });
  //   });
  // },
  
  test_gs_weird_bug : function() {
    var gridStore = new GridStore(client, "test_gs_weird_bug", "w");
    var data = fs.readFileSync("./integration/test_gs_weird_bug.png", 'binary');
  
    gridStore.open(function(err, gridStore) {
      gridStore.write(data, function(err, gridStore) {
        gridStore.close(function(err, result) {
          // Assert that we have overwriten the data
          GridStore.read(client, 'test_gs_weird_bug', function(err, fileData) {
            test.equal(data.length, fileData.length);
            finished_test({test_gs_weird_bug:'ok'});
          });
        });
      });
    });
  },

  test_gs_read_stream : function() {
    var gridStoreR = new GridStore(client, "test_gs_read_stream", "r");
    var gridStoreW = new GridStore(client, "test_gs_read_stream", "w");
    var data = fs.readFileSync("./integration/test_gs_weird_bug.png", 'binary');

    var readLen = 0;
    var gotEnd = 0;

    gridStoreW.open(function(err, gs) {
      gs.write(data, function(err, gs) {
          gs.close(function(err, result) {
              gridStoreR.open(function(err, gs) {
                  var stream = gs.stream(true);
                  stream.on("data", function(chunk) {
                      readLen += chunk.length;
                  });
                  stream.on("end", function() {
                      ++gotEnd;
                  });
                  stream.on("close", function() {
                      test.equal(data.length, readLen);
                      test.equal(1, gotEnd);
                      finished_test({test_gs_read_stream:'ok'});
                  });
              });
          });
      });
    });
  },


  test_gs_writing_file: function() {
    var gridStore = new GridStore(client, 'test_gs_writing_file', 'w');
    var fileSize = fs.statSync('./integration/test_gs_weird_bug.png').size;
    gridStore.open(function(err, gridStore) {
      gridStore.writeFile('./integration/test_gs_weird_bug.png', function(err, gridStore) {
        GridStore.read(client, 'test_gs_writing_file', function(err, fileData) {
          test.equal(fileSize, fileData.length);
          finished_test({test_gs_writing_file: 'ok'});
        });
      });
    });
  },
  
  test_gs_working_field_read : function() {
    var gridStore = new GridStore(client, "test_gs_working_field_read", "w");
    var data = fs.readFileSync("./integration/test_gs_working_field_read.pdf", 'binary');
  
    gridStore.open(function(err, gridStore) {
      gridStore.write(data, function(err, gridStore) {
        gridStore.close(function(err, result) {
          // Assert that we have overwriten the data
          GridStore.read(client, 'test_gs_working_field_read', function(err, fileData) {
            test.equal(data.length, fileData.length);
            finished_test({test_gs_working_field_read:'ok'});
          });
        });
      });
    });
  },
      
  // test_pair : function() {
  //   var p_client = new Db('integration_tests_21', new ServerPair(new Server("127.0.0.1", 27017, {}), new Server("127.0.0.1", 27018, {})), {});
  //   p_client.open(function(err, p_client) {
  //     p_client.dropDatabase(function(err, done) {
  //       test.ok(p_client.primary != null);
  //       test.equal(2, p_client.connections.length);
  // 
  //       // Check both server running
  //       test.equal(true, p_client.serverConfig.leftServer.connected);
  //       test.equal(true, p_client.serverConfig.rightServer.connected);
  // 
  //       test.ok(p_client.serverConfig.leftServer.master);
  //       test.equal(false, p_client.serverConfig.rightServer.master);
  // 
  //       p_client.createCollection('test_collection', function(err, collection) {
  //         collection.insert({'a':1}, function(err, doc) {
  //           collection.find(function(err, cursor) {
  //             cursor.toArray(function(err, items) {
  //               test.equal(1, items.length);
  // 
  //               finished_test({test_pair:'ok'});
  //               p_client.close();
  //             });
  //           });
  //         });
  //       });
  //     });
  //   });
  // },
  // 
  // test_cluster : function() {
  //   var p_client = new Db('integration_tests_22', new ServerCluster([new Server("127.0.0.1", 27017, {}), new Server("127.0.0.1", 27018, {})]), {});
  //   p_client.open(function(err, p_client) {
  //     p_client.dropDatabase(function(err, done) {
  //       test.ok(p_client.primary != null);
  //       test.equal(2, p_client.connections.length);
  // 
  //       test.equal(true, p_client.serverConfig.servers[0].master);
  //       test.equal(false, p_client.serverConfig.servers[1].master);
  // 
  //       p_client.createCollection('test_collection', function(err, collection) {
  //         collection.insert({'a':1}, function(err, doc) {
  //           collection.find(function(err, cursor) {
  //             cursor.toArray(function(err, items) {
  //               test.equal(1, items.length);
  // 
  //               finished_test({test_cluster:'ok'});
  //               p_client.close();
  //             });
  //           });
  //         });
  //       });
  //     });
  //   });
  // },
  // 
  // test_slave_connection :function() {
  //   var p_client = new Db('integration_tests_23', new Server("127.0.0.1", 27018, {}));
  //   p_client.open(function(err, p_client) {
  //     test.equal(null, err);
  //     finished_test({test_slave_connection:'ok'});
  //     p_client.close();
  //   });
  // },
      
  test_should_correctly_do_upsert : function() {
    client.createCollection('test_should_correctly_do_upsert', function(err, collection) {
      var id = new client.bson_serializer.ObjectID(null)
      var doc = {_id:id, a:1};
      collection.update({"_id":id}, doc, {upsert:true}, function(err, result) {
        test.equal(null, err);        
        test.equal(null, result);
        collection.findOne({"_id":id}, function(err, doc) {
          test.equal(1, doc.a);
        });
      });

      id = new client.bson_serializer.ObjectID(null)
      doc = {_id:id, a:2};
      collection.update({"_id":id}, doc, {safe:true, upsert:true}, function(err, result) {
        test.equal(null, err);
        test.equal(1, result);
        collection.findOne({"_id":id}, function(err, doc) {
          test.equal(2, doc.a);
        });
      });

      collection.update({"_id":id}, doc, {safe:true, upsert:true}, function(err, result) {
        test.equal(null, err);
        test.equal(1, result);
        collection.findOne({"_id":id}, function(err, doc) {
          test.equal(2, doc.a);
          finished_test({test_should_correctly_do_upsert:'ok'});
        });
      });
    });
  },

  test_should_correctly_do_update_with_no_docs_found : function() {
    client.createCollection('test_should_correctly_do_update_with_no_docs', function(err, collection) {
      var id = new client.bson_serializer.ObjectID(null)
      var doc = {_id:id, a:1};
      collection.update({"_id":id}, doc, {safe:true}, function(err, numberofupdateddocs) {
        test.equal(null, err);
        test.equal(0, numberofupdateddocs);
        finished_test({test_should_correctly_do_update_with_no_docs_found:'ok'});
      });
    });
  },

  test_should_execute_insert_update_delete_safe_mode : function() {
    client.createCollection('test_should_execute_insert_update_delete_safe_mode', function(err, collection) {
      test.ok(collection instanceof Collection);
      test.equal('test_should_execute_insert_update_delete_safe_mode', collection.collectionName);

      collection.insert({i:1}, {safe:true}, function(err, ids) {
        test.equal(1, ids.length);
        test.ok(ids[0]._id.toHexString().length == 24);

        // Update the record
        collection.update({i:1}, {"$set":{i:2}}, {safe:true}, function(err, result) {
          test.equal(null, err);
          test.equal(1, result);
        
          // Remove safely
          collection.remove({}, {safe:true}, function(err, result) {
            test.equal(null, err);            
            finished_test({test_should_execute_insert_update_delete_safe_mode:'ok'});
          });
        });
      });
    });
  },
  
  test_streaming_function_with_limit_for_fetching : function() {
    var docs = []
    
    for(var i = 0; i < 3000; i++) {
      docs.push({'a':i})
    }

    client.createCollection('test_streaming_function_with_limit_for_fetching', function(err, collection) {
      test.ok(collection instanceof Collection);

      collection.insertAll(docs, function(err, ids) {        
        collection.find({}, function(err, cursor) {
          // Execute find on all the documents
          var stream = cursor.streamRecords({fetchSize:1000}); 
          var callsToEnd = 0;
          stream.on('end', function() { 
            finished_test({test_streaming_function_with_limit_for_fetching:'ok'});
          });

          var callsToData = 0;
          stream.on('data',function(data){ 
            callsToData += 1;
            test.ok(callsToData <= 3000);
          }); 
        });        
      });
    });    
  }, 
  
  test_to_json_for_long : function() {
    client.createCollection('test_to_json_for_long', function(err, collection) {
      test.ok(collection instanceof Collection);

      // collection.insertAll([{value: client.bson_serializer.Long.fromNumber(32222432)}], function(err, ids) {
      collection.insertAll([{value: client.bson_serializer.Long.fromNumber(32222432)}], function(err, ids) {
        collection.findOne({}, function(err, item) {
          test.equal("32222432", item.value.toJSON())
          finished_test({test_to_json_for_long:'ok'});
        });
      });
    });        
  },
  
  test_failed_connection_caught : function() {
    var fs_client = new Db('admin_test_4', new Server("127.0.0.1", 27117, {auto_reconnect: false}));
    fs_client.bson_deserializer = client.bson_deserializer;
    fs_client.bson_serializer = client.bson_serializer;
    fs_client.pkFactory = client.pkFactory;  
    fs_client.open(function(err, fs_client) {
      test.ok(err != null)
      finished_test({test_failed_connection_caught:'ok'});
    })
  },
  
  test_insert_and_update_no_callback : function() {
    client.createCollection('test_insert_and_update_no_callback', function(err, collection) {
      // Insert the update
      collection.insert({i:1}, {safe:true})
      // Update the record
      collection.update({i:1}, {"$set":{i:2}}, {safe:true})
      // Locate document
      collection.findOne({}, function(err, item) {
        test.equal(2, item.i)
        finished_test({test_insert_and_update_no_callback:'ok'});
      });        
    })
  },
  
  test_insert_and_query_timestamp : function() {
    client.createCollection('test_insert_and_query_timestamp', function(err, collection) {
      // Insert the update
      collection.insert({i:client.bson_serializer.Timestamp.fromNumber(100), j:client.bson_serializer.Long.fromNumber(200)}, {safe:true})
      // Locate document
      collection.findOne({}, function(err, item) {
        test.equal(100, item.i.toNumber())
        test.equal(200, item.j.toNumber())
        
        finished_test({test_insert_and_query_timestamp:'ok'});
      });        
    })
  },
  
  test_insert_and_query_undefined : function() {
    client.createCollection('test_insert_and_query_undefined', function(err, collection) {
      // Insert the update
      collection.insert({i:undefined}, {safe:true})
      // Locate document
      collection.findOne({}, function(err, item) {
        test.equal(null, item.i)
        
        finished_test({test_insert_and_query_undefined:'ok'});
      });        
    })
  },

  test_nativedbref_json_crash : function() {
    var dbref = new client.bson_serializer.DBRef("foo",
                                                 client.bson_serializer.ObjectID.createFromHexString("fc24a04d4560531f00000000"),
                                                 null);
    JSON.stringify(dbref);
    finished_test({test_nativedbref_json_crash:'ok'});
  },
  
  test_safe_insert : function() {
    var fixtures = [{
        name: "empty", array: [], bool: false, dict: {}, float: 0.0, string: ""
      }, {
        name: "not empty", array: [1], bool: true, dict: {x: "y"}, float: 1.0, string: "something"
      }, {
        name: "simple nested", array: [1, [2, [3]]], bool: true, dict: {x: "y", array: [1,2,3,4], dict: {x: "y", array: [1,2,3,4]}}, float: 1.5, string: "something simply nested"
      }];


    client.createCollection('test_safe_insert', function(err, collection) {
      for(var i = 0; i < fixtures.length; i++) {
        collection.insert(fixtures[i], {safe:true})          
      }
    
      collection.count(function(err, count) {
        test.equal(3, count);

        collection.find().toArray(function(err, docs) {
          test.equal(3, docs.length)
        });
      });
      
      
      collection.find({}, {}, function(err, cursor) {
        var counter = 0;
        
        cursor.each(function(err, doc) {
          if(doc == null) {
            test.equal(3, counter);
            finished_test({test_safe_insert:'ok'});              
          } else {
            counter = counter + 1;
          }
        });
      });        
    })
  },

  test_should_throw_error_if_serializing_function : function() {
    client.createCollection('test_should_throw_error_if_serializing_function', function(err, collection) {
      // Insert the update
      collection.insert({i:1, z:function() { return 1} }, {safe:true}, function(err, result) {
        collection.findOne({_id:result[0]._id}, function(err, object) {
          test.equal(null, object.z);
          test.equal(1, object.i);

          finished_test({test_should_throw_error_if_serializing_function:'ok'});          
        })        
      })
    })    
  },
  
  multiple_save_test : function() {
		client.createCollection("multiple_save_test", function(err, collection) {
			//insert new user
			collection.save({
				name: 'amit',
				text: 'some text'
			})
			collection.find({}, {name: 1}).limit(1).toArray(function(err, users){
				user = users[0]
				if(err) {
					throw new Error(err)
				} else if(user) {
					user.pants = 'worn'
					
					collection.save(user, {safe:true}, function(err, result){
					  test.equal(null, err);
					  test.equal(1, result);
            finished_test({multiple_save_test:'ok'});          					  
					})
				}
			});
    });
  },
  
  save_error_on_save_test : function() {
    var db = new Db('test-save_error_on_save_test-db', new Server('localhost', 27017, {auto_reconnect: true}));
    db.bson_deserializer = client.bson_deserializer;
    db.bson_serializer = client.bson_serializer;
    db.pkFactory = client.pkFactory;
  
    db.open(function(err, db) {
      db.createCollection("save_error_on_save_test", function(err, collection) {      
        // Create unique index for username
        collection.createIndex([['username', 1]], true, function(err, result) {
    			//insert new user
    			collection.save({
    			  email: 'email@email.com',
    			  encrypted_password: 'password',
    			  friends: 
    			   [ '4db96b973d01205364000006',
    			     '4db94a1948a683a176000001',
    			     '4dc77b24c5ba38be14000002' ],
    			  location: [ 72.4930088, 23.0431957 ],
    			  name: 'Amit Kumar',
    			  password_salt: 'salty',
    			  profile_fields: [],
    			  username: 'amit' }, function(err, doc){
    			});

    			collection.find({}).limit(1).toArray(function(err, users){
    			  test.equal(null, err);			  
    				user = users[0]
    				user.friends.splice(1,1)

    				collection.save(user, function(err, doc){
      			  test.equal(null, err);		
      			  
      			  // Update again
      			  collection.update({_id:new client.bson_serializer.ObjectID(user._id.toString())}, {friends:user.friends}, {upsert:true, safe:true}, function(err, result) {
      			    test.equal(null, err);
      			    test.equal(1, result);      			    
                finished_test({save_error_on_save_test:'ok'});                     
                db.close();
      			  });      			  
    				});
    			});        
        })
  		});
		});
  },
  
  remove_with_no_callback_bug_test : function() {
		client.collection("remove_with_no_callback_bug_test", function(err, collection) {
			collection.save({a:1}, {safe:true}, function(){
				collection.save({b:1}, {safe:true}, function(){
					collection.save({c:1}, {safe:true}, function(){
						collection.remove({a:1})
						
						// Let's perform a count
						collection.count(function(err, count) {
      			  test.equal(null, err);		
      			  test.equal(2, count);
      			        			  
              finished_test({remove_with_no_callback_bug_test:'ok'});          					    						  
						});
					});
				});
			});
		});
  },  

  insert_doc_with_uuid_test : function() {
		client.collection("insert_doc_with_uuid", function(err, collection) {
		  collection.insert({_id : "12345678123456781234567812345678", field: '1'}, {safe:true}, function(err, result) {
		    test.equal(null, err);

  		  collection.find({_id : "12345678123456781234567812345678"}).toArray(function(err, items) {
  		    test.equal(null, err);
  		    test.equal(items[0]._id, "12345678123456781234567812345678")
  		    test.equal(items[0].field, '1')
          
          // Generate a binary id
          var binaryUUID = new client.bson_serializer.Binary('00000078123456781234567812345678', client.bson_serializer.BSON.BSON_BINARY_SUBTYPE_UUID);

          collection.insert({_id : binaryUUID, field: '2'}, {safe:true}, function(err, result) {
      		  collection.find({_id : binaryUUID}).toArray(function(err, items) {
      		    test.equal(null, err);
              test.equal(items[0].field, '2')

              finished_test({insert_doc_with_uuid_test:'ok'});          					    						  
    		    });
          });
  		  })		  		    
		  });		  
		});
  },  
    
  // test_long_term_insert : function() {
  //   var numberOfTimes = 21000;
  //   
  //   client.createCollection('test_safe_insert', function(err, collection) {
  //     var timer = setInterval(function() {        
  //       collection.insert({'test': 1}, {safe:true}, function(err, result) {
  //         numberOfTimes = numberOfTimes - 1;
  // 
  //         if(numberOfTimes <= 0) {
  //           clearInterval(timer);
  //           collection.count(function(err, count) {
  //             test.equal(21000, count);
  //             finished_test({test_long_term_insert:'ok'})
  //           });
  //         }          
  //       });
  //     }, 1);      
  //   });
  // },  
};

/*******************************************************************************************************
  Setup For Running Tests
*******************************************************************************************************/
var client_tests = {};
var type = process.argv[2];

if(process.argv[3]){
  var test_arg = process.argv[3];
  if(test_arg == 'all') client_tests = all_tests;
  else {
    test_arg.split(',').forEach(function(aTest){
      if(all_tests[aTest]) client_tests[aTest] = all_tests[aTest];
    });
  }
} else client_tests = all_tests;

var client_tests_keys = [];
for(key in client_tests) client_tests_keys.push(key);

// Set up the client connection
var client = new Db('integration_tests_', new Server("127.0.0.1", 27017, {}), {});
// Use native deserializer
if(type == "native") {
  var BSON = require("../external-libs/bson");
  debug("========= Integration tests running Native BSON Parser == ")
  client.bson_deserializer = BSON;
  client.bson_serializer = BSON;
  client.pkFactory = BSON.ObjectID;
} else {
  var BSONJS = require('../lib/mongodb/bson/bson');
  debug("========= Integration tests running Pure JS BSON Parser == ")
  client.bson_deserializer = BSONJS;
  client.bson_serializer = BSONJS;
  client.pkFactory = BSONJS.ObjectID;
}

client.open(function(err, client) {
  // Do cleanup of the db
  client.dropDatabase(function() {
    // Run  all the tests
    run_tests();
    // Start the timer that checks that all the tests have finished or failed
    ensure_tests_finished();
  });
});

function ensure_tests_finished() {
  var intervalId = setInterval(function() {
    if(client_tests_keys.length == 0) {
      // Print out the result
      debug("= Final Checks =========================================================");
      // Stop interval timer and close db connection
      clearInterval(intervalId);
      // Ensure we don't have any more cursors hanging about
      client.cursorInfo(function(err, cursorInfo) {
        debug(inspect(cursorInfo));
        debug("");
        client.close();
      });
    }
  }, 100);
};

// All the finished client tests
var finished_tests = [];

function run_tests() {
  // Run first test
  client_tests[client_tests_keys[0]]();  
}

function finished_test(test_object) {
  for(var name in test_object) {
    debug("= executing test: " + name + " [" + test_object[name] + "]");
  }
  finished_tests.push(test_object);
  client_tests_keys.shift();
  // Execute next test
  if(client_tests_keys.length > 0) client_tests[client_tests_keys[0]]();
}

function randOrd() {
  return (Math.round(Math.random()) - 0.5);
}

/**
  Helper Utilities for the testing
**/
function locate_collection_by_name(collectionName, collections) {
  var foundObject = null;
  collections.forEach(function(collection) {
    if(collection.collectionName == collectionName) foundObject = collection;
  });
  return foundObject;
}
