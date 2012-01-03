var testCase = require('../deps/nodeunit').testCase,
  debug = require('util').debug,
  inspect = require('util').inspect,
  nodeunit = require('../deps/nodeunit'),
  gleak = require('../tools/gleak'),
  Db = require('../lib/mongodb').Db,
  Cursor = require('../lib/mongodb').Cursor,
  Step = require("../deps/step/lib/step"),
  Collection = require('../lib/mongodb').Collection,
  fs = require('fs'),
  Server = require('../lib/mongodb').Server;

var MONGODB = 'integration_tests';
var useSSL = process.env['USE_SSL'] != null ? true : false;
var client = new Db(MONGODB, new Server("127.0.0.1", 27017, {auto_reconnect: true, poolSize: 4, ssl:useSSL}), {native_parser: (process.env['TEST_NATIVE'] != null)});

// Define the tests, we want them to run as a nested test so we only clean up the 
// db connection once
var tests = testCase({
  setUp: function(callback) {
    client.open(function(err, db_p) {
      if(numberOfTestsRun == Object.keys(tests).length) {
        // If first test drop the db
        client.dropDatabase(function(err, done) {
          callback();
        });                
      } else {
        return callback();        
      }      
    });
  },
  
  tearDown: function(callback) {
    numberOfTestsRun = numberOfTestsRun - 1;
    // Drop the database and close it
    if(numberOfTestsRun <= 0) {
      // client.dropDatabase(function(err, done) {
        client.close();
        callback();
      // });        
    } else {
      client.close();
      callback();        
    }      
  },

  shouldCorrectlyExecuteToArray : function(test) {
    // Create a non-unique index and test inserts
    client.createCollection('test_array', function(err, collection) {
      collection.insert({'b':[1, 2, 3]}, {safe:true}, function(err, ids) {
        collection.find().toArray(function(err, documents) {
          test.deepEqual([1, 2, 3], documents[0].b);
          // Let's close the db
          test.done();
        });
      });
    });    
  },
  
  shouldCorrectlyExecuteToArrayAndFailOnFurtherCursorAccess : function(test) {
    client.createCollection('test_to_a', function(err, collection) {
      test.ok(collection instanceof Collection);
      collection.insert({'a':1}, {safe:true}, function(err, ids) {
        collection.find({}, function(err, cursor) {
          cursor.toArray(function(err, items) {
            // Should fail if called again (cursor should be closed)
            cursor.toArray(function(err, items) {
              test.ok(err instanceof Error);
              test.equal("Cursor is closed", err.message);
  
              // Should fail if called again (cursor should be closed)
              cursor.each(function(err, item) {
                test.ok(err instanceof Error);
                test.equal("Cursor is closed", err.message);
                // Let's close the db
                test.done();
              });
            });
          });
        });
      });
    });
  }, 
  
  shouldCorrectlyFailToArrayDueToFinishedEachOperation : function(test) {
    client.createCollection('test_to_a_after_each', function(err, collection) {
      test.ok(collection instanceof Collection);
      collection.insert({'a':1}, {safe:true}, function(err, ids) {
        collection.find(function(err, cursor) {
          cursor.each(function(err, item) {
            if(item == null) {
              cursor.toArray(function(err, items) {
                test.ok(err instanceof Error);
                test.equal("Cursor is closed", err.message);
  
                // Let's close the db
                test.done();
              });
            };
          });
        });
      });
    });
  },  
  
  shouldCorrectlyExecuteCursorExplain : function(test) {
    client.createCollection('test_explain', function(err, collection) {
      collection.insert({'a':1}, {safe:true}, function(err, r) {
        collection.find({'a':1}, function(err, cursor) {
          cursor.explain(function(err, explaination) {
            test.ok(explaination.cursor != null);
            test.ok(explaination.n.constructor == Number);
            test.ok(explaination.millis.constructor == Number);
            test.ok(explaination.nscanned.constructor == Number);
  
            // Let's close the db
            test.done();
          });
        });        
      });
    });
  }, 
  
  shouldCorrectlyExecuteCursorCount : function(test) {
    client.createCollection('test_count', function(err, collection) {
      collection.find(function(err, cursor) {
        cursor.count(function(err, count) {
          test.equal(0, count);
  
          Step(
            function insert() {
              var group = this.group();
  
              for(var i = 0; i < 10; i++) {
                collection.insert({'x':i}, {safe:true}, group());
              }
            }, 
            
            function finished() {
              collection.find().count(function(err, count) {
                  test.equal(10, count);
                  test.ok(count.constructor == Number);
              });
  
              collection.find({}, {'limit':5}).count(function(err, count) {
                test.equal(10, count);
              });
  
              collection.find({}, {'skip':5}).count(function(err, count) {
                test.equal(10, count);
              });
  
              collection.find(function(err, cursor) {
                cursor.count(function(err, count) {
                  test.equal(10, count);
  
                  cursor.each(function(err, item) {
                    if(item == null) {
                      cursor.count(function(err, count2) {
                        test.equal(10, count2);
                        test.equal(count, count2);
                        // Let's close the db
                        test.done();
                      });
                    }
                  });
                });
              });
  
              client.collection('acollectionthatdoesn', function(err, collection) {
                collection.count(function(err, count) {
                  test.equal(0, count);
                });
              })              
            }
          )
        });
      });
    });
  },
  
  shouldCorrectlyExecuteSortOnCursor : function(test) {
    client.createCollection('test_sort', function(err, collection) {
      Step(
        function insert() {
          var group = this.group();
  
          for(var i = 0; i < 5; i++) {
            collection.insert({'a':i}, {safe:true}, group());
          }
        }, 
        
        function finished() {
          collection.find(function(err, cursor) {
            cursor.sort(['a', 1], function(err, cursor) {
              test.ok(cursor instanceof Cursor);
              test.deepEqual(['a', 1], cursor.sortValue);
            });
          });
  
          collection.find(function(err, cursor) {
            cursor.sort('a', 1, function(err, cursor) {
              cursor.nextObject(function(err, doc) {
                test.equal(0, doc.a);
              });
            });
          });
  
          collection.find(function(err, cursor) {
            cursor.sort('a', -1, function(err, cursor) {
              cursor.nextObject(function(err, doc) {
                test.equal(4, doc.a);
              });
            });
          });
  
          collection.find(function(err, cursor) {
            cursor.sort('a', "asc", function(err, cursor) {
              cursor.nextObject(function(err, doc) {
                test.equal(0, doc.a);
              });
            });
          });
  
          collection.find(function(err, cursor) {
            cursor.sort([['a', -1], ['b', 1]], function(err, cursor) {
              test.ok(cursor instanceof Cursor);
              test.deepEqual([['a', -1], ['b', 1]], cursor.sortValue);
            });
          });
  
          collection.find(function(err, cursor) {
            cursor.sort('a', 1, function(err, cursor) {
              cursor.sort('a', -1, function(err, cursor) {
                cursor.nextObject(function(err, doc) {
                  test.equal(4, doc.a);
                });
              })
            });
          });
  
          collection.find(function(err, cursor) {
            cursor.sort('a', -1, function(err, cursor) {
              cursor.sort('a', 1, function(err, cursor) {
                cursor.nextObject(function(err, doc) {
                  test.equal(0, doc.a);
                });
              })
            });
          });
  
          collection.find(function(err, cursor) {
            cursor.nextObject(function(err, doc) {
              cursor.sort(['a'], function(err, cursor) {
                test.ok(err instanceof Error);
                test.equal("Cursor is closed", err.message);  
              });
            });
          });
  
          collection.find(function(err, cursor) {
            cursor.sort('a', 25, function(err, cursor) {
              cursor.nextObject(function(err, doc) {
                test.ok(err instanceof Error);
                test.equal("Illegal sort clause, must be of the form [['field1', '(ascending|descending)'], ['field2', '(ascending|descending)']]", err.message);
              });
            });
          });
  
          collection.find(function(err, cursor) {
            cursor.sort(25, function(err, cursor) {
              cursor.nextObject(function(err, doc) {
                test.ok(err instanceof Error);
                test.equal("Illegal sort clause, must be of the form [['field1', '(ascending|descending)'], ['field2', '(ascending|descending)']]", err.message);
                // Let's close the db
                test.done();
              });
            });
          });
        }
      );
    });
  },
  
  shouldCorrectlyThrowErrorOnToArrayWhenMissingCallback : function(test) {
    client.createCollection('test_to_array', function(err, collection) {
      Step(
        function insert() {
          var group = this.group();
  
          for(var i = 0; i < 2; i++) {
            collection.save({'x':1}, {safe:true}, group());
          }
        }, 
        
        function finished() {
          collection.find(function(err, cursor) {
            test.throws(function () {
              cursor.toArray();
            });
            test.done();
          });
        }
      )        
    });
  },
  
  shouldThrowErrorOnEachWhenMissingCallback : function(test) {
    client.createCollection('test_each', function(err, collection) {
      Step(
        function insert() {
          var group = this.group();
  
          for(var i = 0; i < 2; i++) {
            collection.save({'x':1}, {safe:true}, group());
          }
        }, 
        
        function finished() {  
          collection.find(function(err, cursor) {
            test.throws(function () {
              cursor.each();
            });
            test.done();
          });
        }
      )
    });
  },
  
  shouldCorrectlyHandleLimitOnCursor : function(test) {
    client.createCollection('test_cursor_limit', function(err, collection) {
      Step(
        function insert() {
          var group = this.group();
  
          for(var i = 0; i < 10; i++) {
            collection.save({'x':1}, {safe:true}, group());
          }
        }, 
        
        function finished() {
          collection.find().count(function(err, count) {
            test.equal(10, count);
          });
  
          collection.find(function(err, cursor) {
            cursor.limit(5, function(err, cursor) {
              cursor.toArray(function(err, items) {
                test.equal(5, items.length);
                // Let's close the db
                test.done();
              });
            });
          });
        }
      );
    });
  },
  
  shouldCorrectlyReturnErrorsOnIllegalLimitValues : function(test) {
    client.createCollection('test_limit_exceptions', function(err, collection) {
      collection.insert({'a':1}, {safe:true}, function(err, docs) {});
      collection.find(function(err, cursor) {
        cursor.limit('not-an-integer', function(err, cursor) {
          test.ok(err instanceof Error);
          test.equal("limit requires an integer", err.message);
        });
      });
  
      collection.find(function(err, cursor) {
        cursor.nextObject(function(err, doc) {
          cursor.limit(1, function(err, cursor) {
            test.ok(err instanceof Error);
            test.equal("Cursor is closed", err.message);
          });
        });
      });
  
      collection.find(function(err, cursor) {
        cursor.close(function(err, cursor) {
          cursor.limit(1, function(err, cursor) {
            test.ok(err instanceof Error);
            test.equal("Cursor is closed", err.message);
  
            test.done();
          });
        });
      });
    });
  },
  
  shouldCorrectlySkipRecordsOnCursor : function(test) {
    client.createCollection('test_skip', function(err, collection) {
      Step(
        function insert() {
          var group = this.group();
  
          for(var i = 0; i < 10; i++) {
            collection.insert({'x':i}, {safe:true}, group());
          }
        }, 
        
        function finished() {
          collection.find(function(err, cursor) {
            cursor.count(function(err, count) {
              test.equal(10, count);
            });
          });
  
          collection.find(function(err, cursor) {
            cursor.toArray(function(err, items) {
              test.equal(10, items.length);
  
              collection.find(function(err, cursor) {
                cursor.skip(2, function(err, cursor) {
                  cursor.toArray(function(err, items2) {
                    test.equal(8, items2.length);
  
                    // Check that we have the same elements
                    var numberEqual = 0;
                    var sliced = items.slice(2, 10);
  
                    for(var i = 0; i < sliced.length; i++) {
                      if(sliced[i].x == items2[i].x) numberEqual = numberEqual + 1;
                    }
                    test.equal(8, numberEqual);
  
                    // Let's close the db
                    test.done();
                  });
                });
              });
            });
          });
        }
      )
    });
  },
  
  shouldCorrectlyReturnErrorsOnIllegalSkipValues : function(test) {
    client.createCollection('test_skip_exceptions', function(err, collection) {
      collection.insert({'a':1}, {safe:true}, function(err, docs) {});
      collection.find(function(err, cursor) {
        cursor.skip('not-an-integer', function(err, cursor) {
          test.ok(err instanceof Error);
          test.equal("skip requires an integer", err.message);
        });
      });
  
      collection.find(function(err, cursor) {
        cursor.nextObject(function(err, doc) {
          cursor.skip(1, function(err, cursor) {
            test.ok(err instanceof Error);
            test.equal("Cursor is closed", err.message);
          });
        });
      });
  
      collection.find(function(err, cursor) {
        cursor.close(function(err, cursor) {
          cursor.skip(1, function(err, cursor) {
            test.ok(err instanceof Error);
            test.equal("Cursor is closed", err.message);
            
            test.done();
          });
        });
      });
    });
  },
  
  shouldReturnErrorsOnIllegalBatchSizes : function(test) {
    client.createCollection('test_batchSize_exceptions', function(err, collection) {
      collection.insert({'a':1}, {safe:true}, function(err, docs) {});
      collection.find(function(err, cursor) {
        cursor.batchSize('not-an-integer', function(err, cursor) {
          test.ok(err instanceof Error);
          test.equal("batchSize requires an integer", err.message);
        });
      });
  
      collection.find(function(err, cursor) {
        cursor.nextObject(function(err, doc) {
          cursor.nextObject(function(err, doc) {
            cursor.batchSize(1, function(err, cursor) {
              test.ok(err instanceof Error);
              test.equal("Cursor is closed", err.message);
            });
          });
        });
      });
  
      collection.find(function(err, cursor) {
        cursor.close(function(err, cursor) {
          cursor.batchSize(1, function(err, cursor) {
            test.ok(err instanceof Error);
            test.equal("Cursor is closed", err.message);
            
            test.done();
          });
        });
      });
    });
  },
  
  shouldCorrectlyHandleChangesInBatchSizes : function(test) {
    client.createCollection('test_not_multiple_batch_size', function(err, collection) {
      var records = 6;
      var batchSize = 2;
      var docs = [];
      for(var i = 0; i < records; i++) {
        docs.push({'a':i});
      }
  
      collection.insert(docs, {safe:true}, function() {
        collection.find({}, {batchSize : batchSize}, function(err, cursor) {
          //1st
          cursor.nextObject(function(err, items) {
            //cursor.items should contain 1 since nextObject already popped one
            test.equal(1, cursor.items.length);
            test.ok(items != null);
  
            //2nd
            cursor.nextObject(function(err, items) {
              test.equal(0, cursor.items.length);
              test.ok(items != null);
  
              //test batch size modification on the fly
              batchSize = 3;
              cursor.batchSize(batchSize);
  
              //3rd
              cursor.nextObject(function(err, items) {
                test.equal(2, cursor.items.length);
                test.ok(items != null);
  
                //4th
                cursor.nextObject(function(err, items) {
                  test.equal(1, cursor.items.length);
                  test.ok(items != null);
  
                  //5th
                  cursor.nextObject(function(err, items) {
                    test.equal(0, cursor.items.length);
                    test.ok(items != null);
  
                    //6th
                    cursor.nextObject(function(err, items) {
                      test.equal(0, cursor.items.length);
                      test.ok(items != null);
  
                      //No more
                      cursor.nextObject(function(err, items) {
                        test.ok(items == null);
                        test.ok(cursor.isClosed());
                        
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
  },
  
  shouldCorrectlyHandleBatchSize : function(test) {
    client.createCollection('test_multiple_batch_size', function(err, collection) {
      //test with the last batch that is a multiple of batchSize
      var records = 4;
      var batchSize = 2;
      var docs = [];
      for(var i = 0; i < records; i++) {
        docs.push({'a':i});
      }
  
      collection.insert(docs, {safe:true}, function() {
        collection.find({}, {batchSize : batchSize}, function(err, cursor) {
          //1st
          cursor.nextObject(function(err, items) {
            test.equal(1, cursor.items.length);
            test.ok(items != null);
  
            //2nd
            cursor.nextObject(function(err, items) {
              test.equal(0, cursor.items.length);
              test.ok(items != null);
  
              //3rd
              cursor.nextObject(function(err, items) {
                test.equal(1, cursor.items.length);
                test.ok(items != null);
  
                //4th
                cursor.nextObject(function(err, items) {
                  test.equal(0, cursor.items.length);
                  test.ok(items != null);
  
                  //No more
                  cursor.nextObject(function(err, items) {
                    test.ok(items == null);
                    test.ok(cursor.isClosed());
                    
                    test.done();
                  });
                });
              });
            });
          });
        });
      });
    });
  },
  
  shouldHandleWhenLimitBiggerThanBatchSize : function(test) {
    client.createCollection('test_limit_greater_than_batch_size', function(err, collection) {
      var limit = 4;
      var records = 10;
      var batchSize = 3;
      var docs = [];
      for(var i = 0; i < records; i++) {
        docs.push({'a':i});
      }
  
      collection.insert(docs, {safe:true}, function() {
        collection.find({}, {batchSize : batchSize, limit : limit}, function(err, cursor) {
          //1st
          cursor.nextObject(function(err, items) {
            test.equal(2, cursor.items.length);
  
            //2nd
            cursor.nextObject(function(err, items) {
              test.equal(1, cursor.items.length);
  
              //3rd
              cursor.nextObject(function(err, items) {
                test.equal(0, cursor.items.length);
  
                //4th
                cursor.nextObject(function(err, items) {
                  test.equal(0, cursor.items.length);
  
                  //No more
                  cursor.nextObject(function(err, items) {
                    test.ok(items == null);
                    test.ok(cursor.isClosed());
                    
                    test.done();
                  });
                });
              });
            });
          });
        });
      });
    });
  },
  
  shouldHandleLimitLessThanBatchSize : function(test) {
    client.createCollection('test_limit_less_than_batch_size', function(err, collection) {
      var limit = 2;
      var records = 10;
      var batchSize = 4;
      var docs = [];
      for(var i = 0; i < records; i++) {
        docs.push({'a':i});
      }
  
      collection.insert(docs, {safe:true}, function() {
        collection.find({}, {batchSize : batchSize, limit : limit}, function(err, cursor) {
          //1st
          cursor.nextObject(function(err, items) {
            test.equal(1, cursor.items.length);
  
            //2nd
            cursor.nextObject(function(err, items) {
              test.equal(0, cursor.items.length);
  
              //No more
              cursor.nextObject(function(err, items) {
                test.ok(items == null);
                test.ok(cursor.isClosed());
  
                test.done();
              });
            });
          });
        });
      });
    });
  },
  
  shouldHandleSkipLimitChaining : function(test) {
    client.createCollection('test_limit_skip_chaining', function(err, collection) {
      Step(
        function insert() {
          var group = this.group();
  
          for(var i = 0; i < 10; i++) {
            collection.insert({'x':1}, {safe:true}, group());
          }
        }, 
        
        function finished() {
          collection.find(function(err, cursor) {
            cursor.toArray(function(err, items) {
              test.equal(10, items.length);
  
              collection.find(function(err, cursor) {
                cursor.limit(5, function(err, cursor) {
                  cursor.skip(3, function(err, cursor) {
                    cursor.toArray(function(err, items2) {
                      test.equal(5, items2.length);
  
                      // Check that we have the same elements
                      var numberEqual = 0;
                      var sliced = items.slice(3, 8);
  
                      for(var i = 0; i < sliced.length; i++) {
                        if(sliced[i].x == items2[i].x) numberEqual = numberEqual + 1;
                      }
                      test.equal(5, numberEqual);
  
                      // Let's close the db
                      test.done();
                    });
                  });
                });
              });
            });
          });
        }
      )      
    });
  },
  
  shouldCorrectlyHandleLimitSkipChainingInline : function(test) {
    client.createCollection('test_limit_skip_chaining_inline', function(err, collection) {
      Step(
        function insert() {
          var group = this.group();
  
          for(var i = 0; i < 10; i++) {
            collection.insert({'x':1}, {safe:true}, group());
          }
        }, 
        
        function finished() {
          collection.find(function(err, cursor) {
            cursor.toArray(function(err, items) {
              test.equal(10, items.length);
  
              collection.find(function(err, cursor) {
                cursor.limit(5).skip(3).toArray(function(err, items2) {
                  test.equal(5, items2.length);
  
                  // Check that we have the same elements
                  var numberEqual = 0;
                  var sliced = items.slice(3, 8);
  
                  for(var i = 0; i < sliced.length; i++) {
                    if(sliced[i].x == items2[i].x) numberEqual = numberEqual + 1;
                  }
                  test.equal(5, numberEqual);
  
                  // Let's close the db
                  test.done();
                });
              });
            });
          });
        }
      )
    });
  },
  
  shouldCloseCursorNoQuerySent : function(test) {
    client.createCollection('test_close_no_query_sent', function(err, collection) {
      collection.find(function(err, cursor) {
        cursor.close(function(err, cursor) {
          test.equal(true, cursor.isClosed());
          // Let's close the db
          test.done();
        });
      });
    });
  },
  
  shouldCorrectlyRefillViaGetMoreCommand : function(test) {
    var COUNT = 1000;
    
    client.createCollection('test_refill_via_get_more', function(err, collection) {
      Step(
        function insert() {
          var group = this.group();
  
          for(var i = 0; i < COUNT; i++) { 
            collection.save({'a': i}, {safe:true}, group()); 
          }
        }, 
        
        function finished() {
          collection.count(function(err, count) {
            test.equal(COUNT, count);
          });
  
          var total = 0;
          var i = 0;
          collection.find({}, {}, function(err, cursor) {
            cursor.each(function(err, item) {                            
              if(item != null) {
                total = total + item.a;
              } else {
                test.equal(499500, total);
  
                collection.count(function(err, count) {
                  test.equal(COUNT, count);
                });
  
                collection.count(function(err, count) {
                  test.equal(COUNT, count);
  
                  var total2 = 0;
                  collection.find(function(err, cursor) {
                    cursor.each(function(err, item) {
                      if(item != null) {
                        total2 = total2 + item.a;
                      } else {
                        test.equal(499500, total2);
                        collection.count(function(err, count) {
                          test.equal(COUNT, count);
                          test.equal(total, total2);
                          // Let's close the db
                          test.done();
                        });
                      }
                    });
                  });
                });
              }
            });
          });
        }
      )      
    });
  },
  
  shouldCorrectlyRefillViaGetMoreAlternativeCollection : function(test) {
    client.createCollection('test_refill_via_get_more_alt_coll', function(err, collection) {
  
      Step(
        function insert() {
          var group = this.group();
  
          for(var i = 0; i < 1000; i++) { 
            collection.save({'a': i}, {safe:true}, group()); 
          }
        }, 
        
        function finished() {
          collection.count(function(err, count) {
            test.equal(1000, count);
          });
  
          var total = 0;
          collection.find(function(err, cursor) {
            cursor.each(function(err, item) {
              if(item != null) {
                total = total + item.a;
              } else {
                test.equal(499500, total);
  
                collection.count(function(err, count) {
                  test.equal(1000, count);
                });
  
                collection.count(function(err, count) {
                  test.equal(1000, count);
  
                  var total2 = 0;
                  collection.find(function(err, cursor) {
                    cursor.each(function(err, item) {
                      if(item != null) {
                        total2 = total2 + item.a;
                      } else {
                        test.equal(499500, total2);
                        collection.count(function(err, count) {
                          test.equal(1000, count);
                          test.equal(total, total2);
                          // Let's close the db
                          test.done();
                        });
                      }
                    });
                  });
                });
              }
            });
          });
        }
      )
    });
  },
  
  shouldCloseCursorAfterQueryHasBeenSent : function(test) {
    client.createCollection('test_close_after_query_sent', function(err, collection) {
      collection.insert({'a':1}, {safe:true}, function(err, r) {
        collection.find({'a':1}, function(err, cursor) {
          cursor.nextObject(function(err, item) {
            cursor.close(function(err, cursor) {
              test.equal(true, cursor.isClosed());
              // Let's close the db
              test.done();
            })
          });
        });        
      });
    });
  },    
  
  shouldCorrectlyExecuteCursorCountWithFields : function(test) {
    client.createCollection('test_count_with_fields', function(err, collection) {
      collection.save({'x':1, 'a':2}, {safe:true}, function(err, doc) {
        collection.find({}, {'fields':['a']}).toArray(function(err, items) {
          test.equal(1, items.length);
          test.equal(2, items[0].a);
          test.equal(null, items[0].x);
        });
  
        collection.findOne({}, {'fields':['a']}, function(err, item) {
          test.equal(2, item.a);
          test.equal(null, item.x);
          test.done();
        });
      });
    });
  },
  
  shouldCorrectlyCountWithFieldsUsingExclude : function(test) {
    client.createCollection('test_count_with_fields_using_exclude', function(err, collection) {
      collection.save({'x':1, 'a':2}, {safe:true}, function(err, doc) {
        collection.find({}, {'fields':{'x':0}}).toArray(function(err, items) {
          test.equal(1, items.length);
          test.equal(2, items[0].a);
          test.equal(null, items[0].x);            
          test.done();
        });
      });
    });
  },
  
  shouldCorrectlyExecuteEnsureIndexWithNoCallback : function(test) {
    var docs = [];
    
    for(var i = 0; i < 1; i++) {
      var d = new Date().getTime() + i*1000;
      docs[i] = {createdAt:new Date(d)};
    }
  
    // Create collection
    client.createCollection('shouldCorrectlyExecuteEnsureIndexWithNoCallback', function(err, collection) {
      // ensure index of createdAt index
      collection.ensureIndex({createdAt:1})
      // insert all docs
      collection.insert(docs, {safe:true}, function(err, result) {
        test.equal(null, err);
  
        // Find with sort
        collection.find().sort(['createdAt', 'asc']).toArray(function(err, items) {
          if (err) logger.error("error in collection_info.find: " + err);            
          test.equal(1, items.length);            
          test.done();
        })                    
      })        
    });    
  },
  
  shouldCorrectlyInsert5000RecordsWithDateAndSortCorrectlyWithIndex : function(test) {
    var docs = [];
    
    for(var i = 0; i < 5000; i++) {
      var d = new Date().getTime() + i*1000;
      docs[i] = {createdAt:new Date(d)};
    }
  
    // Create collection
    client.createCollection('shouldCorrectlyInsert5000RecordsWithDateAndSortCorrectlyWithIndex', function(err, collection) {
      // ensure index of createdAt index
      collection.ensureIndex({createdAt:1}, function(err, indexName) {
        test.equal(null, err);
        
        // insert all docs
        collection.insert(docs, {safe:true}, function(err, result) {
          test.equal(null, err);
  
          // Find with sort
          collection.find().sort(['createdAt', 'asc']).toArray(function(err, items) {
            if (err) logger.error("error in collection_info.find: " + err);            
            test.equal(5000, items.length);            
            test.done();
          })                    
        })        
      });      
    });    
  },
  
  'Should correctly rewind and restart cursor' : function(test) {
    var docs = [];
    
    for(var i = 0; i < 100; i++) {
      var d = new Date().getTime() + i*1000;
      docs[i] = {'a':i, createdAt:new Date(d)};
    }
  
    // Create collection
    client.createCollection('Should_correctly_rewind_and_restart_cursor', function(err, collection) {
      test.equal(null, err);
      
      // insert all docs
      collection.insert(docs, {safe:true}, function(err, result) {
        test.equal(null, err);
        
        var cursor = collection.find({});
        cursor.nextObject(function(err, item) {
          test.equal(0, item.a)
          // Rewind the cursor
          cursor.rewind();
            
          // Grab the first object
          cursor.nextObject(function(err, item) {
            test.equal(0, item.a)
            test.done();
          })
        })
      })        
    });        
  },
  
  'Should correctly execute count on cursor' : function(test) {
    var docs = [];
    
    for(var i = 0; i < 1000; i++) {
      var d = new Date().getTime() + i*1000;
      docs[i] = {'a':i, createdAt:new Date(d)};
    }
  
    // Create collection
    client.createCollection('Should_correctly_execute_count_on_cursor', function(err, collection) {
      test.equal(null, err);
      
      // insert all docs
      collection.insert(docs, {safe:true}, function(err, result) {
        test.equal(null, err);
        var total = 0;
        // Create a cursor for the content
        var cursor = collection.find({});
        cursor.count(function(err, c) {
          // Ensure each returns all documents
          cursor.each(function(err, item) {
            if(item != null) {
              total++;
            } else {
              cursor.count(function(err, c) {
                test.equal(1000, c);
                test.equal(1000, total);
                test.done();
              })
            }
          });
        })        
      })        
    });        
  },
  
  'should be able to stream documents': function(test) {
    var docs = [];
  
    for (var i = 0; i < 1000; i++) {
      docs[i] = { a: i+1 };
    }
  
    // Create collection
    client.createCollection('Should_be_able_to_stream_documents', function(err, collection) {
      test.equal(null, err);
  
      // insert all docs
      collection.insert(docs, {safe:true}, function(err, result) {
        test.equal(null, err);
  
        var paused = 0
          , closed = 0
          , resumed = 0
          , i = 0
          , err
  
        var stream = collection.find().stream();
  
        stream.on('data', function (doc) {
          test.equal(true, !! doc);
          test.equal(true, !! doc.a);
  
          if (paused > 0 && 0 === resumed) {
            err = new Error('data emitted during pause');
            return done();
          }
  
          if (++i === 3) {
            test.equal(false, stream.paused);
            stream.pause();
            test.equal(true, stream.paused);
            paused++;
  
            setTimeout(function () {
              test.equal(true, stream.paused);
              stream.resume();
              test.equal(false, stream.paused);
              resumed++;
            }, 20);
          }
        });
  
        stream.on('error', function (er) {
          err = er;
          done();
        });
  
        stream.on('close', function () {
          closed++;
          done();
        });
  
        function done () {
          test.equal(undefined, err);
          test.equal(i, docs.length);
          test.equal(1, closed);
          test.equal(1, paused);
          test.equal(1, resumed);
          test.strictEqual(stream._cursor.isClosed(), true);
          test.done();
        }
      })
    })
  },
  
  'immediately destroying a stream prevents the query from executing': function(test) {
    var i = 0
      , docs = [{ b: 2 }, { b: 3 }]
      , doneCalled = 0
  
    client.createCollection('immediately_destroying_a_stream_prevents_the_query_from_executing', function(err, collection) {
      test.equal(null, err);
  
      // insert all docs
      collection.insert(docs, {safe:true}, function(err, result) {
        test.equal(null, err);
  
        var stream = collection.find().stream();
  
        stream.on('data', function () {
          i++;
        })
        stream.on('close', done);
        stream.on('error', done);
  
        stream.destroy();
  
        function done (err) {
          test.equal(++doneCalled, 1);
          test.equal(undefined, err);
          test.strictEqual(0, i);
          test.strictEqual(true, stream._destroyed);
          test.done();
        }
      });
    });
  },
  
  'destroying a stream stops it': function (test) {
    client.createCollection('destroying_a_stream_stops_it', function(err, collection) {
      test.equal(null, err);
  
      var docs = [];
      for (var ii = 0; ii < 10; ++ii) docs.push({ b: ii+1 });
  
      // insert all docs
      collection.insert(docs, {safe:true}, function(err, result) {
        test.equal(null, err);
  
        var finished = 0
          , i = 0
  
        var stream = collection.find().stream();
  
        test.strictEqual(null, stream._destroyed);
        test.strictEqual(true, stream.readable);
  
        stream.on('data', function (doc) {
          if (++i === 5) {
            stream.destroy();
            test.strictEqual(false, stream.readable);
          }
        });
  
        stream.on('close', done);
        stream.on('error', done);
  
        function done (err) {
          ++finished;
          setTimeout(function () {
            test.strictEqual(undefined, err);
            test.strictEqual(5, i);
            test.strictEqual(1, finished);
            test.strictEqual(true, stream._destroyed);
            test.strictEqual(false, stream.readable);
            test.strictEqual(true, stream._cursor.isClosed());
            test.done();
          }, 150)
        }
      });
    });
  },
  
  'cursor stream errors': function (test) {
    var client = new Db(MONGODB, new Server("127.0.0.1", 27017, {auto_reconnect: false, poolSize: 4, ssl:useSSL}), {native_parser: (process.env['TEST_NATIVE'] != null)});
    client.open(function(err, db_p) {
      test.equal(null, err);
  
      client.createCollection('cursor_stream_errors', function(err, collection) {
        test.equal(null, err);
  
        var docs = [];
        for (var ii = 0; ii < 10; ++ii) docs.push({ b: ii+1 });
  
        // insert all docs
        collection.insert(docs, {safe:true}, function(err, result) {
          test.equal(null, err);
  
          var finished = 0
            , closed = 0
            , i = 0
  
          var stream = collection.find({}, { batchSize: 5 }).stream();
  
          stream.on('data', function (doc) {
            if (++i === 5) {
              client.close();
            }
          });
  
          stream.on('close', function () {
            closed++;
          });
  
          stream.on('error', done);
  
          function done (err) {
            ++finished;
            setTimeout(function () {
              test.equal('no open connections', err.message);
              test.equal(5, i);
              test.equal(1, closed);
              test.equal(1, finished);
              test.equal(true, stream._destroyed);
              test.equal(false, stream.readable);
              test.equal(true, stream._cursor.isClosed());
              test.done();
            }, 150)
          }
        });
      });
    });
  },
  
  'cursor stream pipe': function (test) {
    client.createCollection('cursor_stream_pipe', function(err, collection) {
      test.equal(null, err);
  
      var docs = [];
      ;('Aaden Aaron Adrian Aditya Bob Joe').split(' ').forEach(function (name) {
        docs.push({ name: name });
      });
  
      // insert all docs
      collection.insert(docs, {safe:true}, function(err, result) {
        test.equal(null, err);
  
        var filename = '/tmp/_nodemongodbnative_stream_out.txt'
          , out = fs.createWriteStream(filename)
  
        // hack so we don't need to create a stream filter just to
        // stringify the objects (otherwise the created file would
        // just contain a bunch of [object Object])
        var toString = Object.prototype.toString;
        Object.prototype.toString = function () {
          return JSON.stringify(this);
        }
  
        var stream = collection.find().stream();
        stream.pipe(out);
  
        stream.on('error', done);
        stream.on('close', done);
  
        function done (err) {
          Object.prototype.toString = toString;
          test.strictEqual(undefined, err);
          var contents = fs.readFileSync(filename, 'utf8');
          test.ok(/Aaden/.test(contents));
          test.ok(/Aaron/.test(contents));
          test.ok(/Adrian/.test(contents));
          test.ok(/Aditya/.test(contents));
          test.ok(/Bob/.test(contents));
          test.ok(/Joe/.test(contents));
          fs.unlink(filename);
          test.done();
        }
      });
    });
  },

  // run this last
  noGlobalsLeaked: function(test) {
    var leaks = gleak.detectNew();
    test.equal(0, leaks.length, "global var leak detected: " + leaks.join(', '));
    test.done();
  }
})

// Stupid freaking workaround due to there being no way to run setup once for each suite
var numberOfTestsRun = Object.keys(tests).length;
// Assign out tests
module.exports = tests;
