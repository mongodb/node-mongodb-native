"use strict";

var fs = require('fs');

/**
 * @ignore
 * @api private
 */
exports['cursor should close after first nextObject operation'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('close_on_next', function(err, collection) {

        collection.insert([{'a':1}, {'a':1}, {'a':1}], configuration.writeConcernMax(), function(err, ids) {
          var cursor = collection.find({});
          cursor.batchSize(2);
          cursor.nextObject(function(err, d) {
            test.equal(null, err);

            cursor.close();
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
 * @api private
 */
exports['cursor should trigger getMore'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('trigger_get_more', function(err, collection) {

        collection.insert([{'a':1}, {'a':1}, {'a':1}], configuration.writeConcernMax(), function(err, ids) {
          var cursor = collection.find({});
          cursor.batchSize(2);
          cursor.toArray(function(err, docs) {
            test.equal(null, err);

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
 * @api private
 */
exports.shouldCorrectlyExecuteCursorExplain = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('test_explain', function(err, collection) {
        collection.insert({'a':1}, configuration.writeConcernMax(), function(err, r) {
          collection.find({'a':1}).explain(function(err, explaination) {
            test.equal(null, err);
            test.ok(explaination != null);

            // Let's close the db
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
 * @api private
 */
exports.shouldCorrectlyExecuteCursorCount = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('test_count', function(err, collection) {
        collection.find().count(function(err, count) {
          // test.equal(0, count);

          function insert(callback) {
            var total = 10;

            for(var i = 0; i < 10; i++) {
              collection.insert({'x':i}, configuration.writeConcernMax(), function(e, r) {
                total = total - 1;
                if(total == 0) callback();
              });
            }
          }

          function finished() {
            collection.find().count(function(err, count) {
              test.equal(10, count);
              test.ok(count.constructor == Number);

              collection.find({}, {'limit':5}).count(true, function(err, count) {
                test.equal(5, count);

                collection.find({}, {'skip':5}).count(true, function(err, count) {
                  test.equal(5, count);

                  db.collection('acollectionthatdoesn').count(function(err, count) {
                    test.equal(0, count);

                    var cursor = collection.find();
                    cursor.count(function(err, count) {
                      test.equal(10, count);

                      cursor.each(function(err, item) {
                        if(item == null) {
                          cursor.count(function(err, count2) {
                            test.equal(10, count2);
                            test.equal(count, count2);
                            // Let's close the db
                            db.close();
                            test.done();
                          });
                        }
                      });
                    });
                  });
                });
              });
            });
          }

          insert(function() {
            finished();
          });
        });
      });
    });
  }
}

/**
 * @ignore
 * @api private
 */
exports.shouldCorrectlyExecuteSortOnCursor = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('test_sort', function(err, collection) {
        function insert(callback) {
          var total = 10;

          for(var i = 0; i < 10; i++) {
            collection.insert({'x':i}, configuration.writeConcernMax(), function(e) {
              total = total - 1;
              if(total == 0) callback();
            });
          }
        }

        function f() {
          var number_of_functions = 9;
          var finished = function() {
            number_of_functions = number_of_functions - 1;
            if(number_of_functions == 0) {
              db.close();
              test.done();
            }
          }

          var cursor = collection.find().sort(['a', 1]);
          test.deepEqual(['a', 1], cursor.sortValue);finished();

          cursor = collection.find().sort('a', 1);
          test.deepEqual([['a', 1]], cursor.sortValue);finished();

          cursor = collection.find().sort('a', -1);
          test.deepEqual([['a', -1]], cursor.sortValue);finished();

          cursor = collection.find().sort('a', "asc");
          test.deepEqual([['a', "asc"]], cursor.sortValue);finished();

          cursor = collection.find().sort([['a', -1], ['b', 1]]);
          test.deepEqual([['a', -1], ['b', 1]], cursor.sortValue);finished();

          cursor = collection.find().sort('a', 1).sort('a', -1);
          test.deepEqual([['a', -1]], cursor.sortValue);finished();

          var cursor = collection.find();
          cursor.nextObject(function(err, doc) {
            cursor.sort(['a'], function(err, cursor) {
              test.equal("Cursor is closed", err.message);finished();
            });
          });

          collection.find().sort('a', 25).nextObject(function(err, doc) {
            test.equal("Illegal sort clause, must be of the form [['field1', '(ascending|descending)'], ['field2', '(ascending|descending)']]", err.message);finished();
          });

          collection.find().sort(25).nextObject(function(err, doc) {
            test.equal("Illegal sort clause, must be of the form [['field1', '(ascending|descending)'], ['field2', '(ascending|descending)']]", err.message);finished();
          });
        }

        insert(function() {
          f();
        });      
      });
    });
  }
}

/**
 * @ignore
 * @api private
 */
exports.shouldCorrectlyThrowErrorOnToArrayWhenMissingCallback = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('test_to_array', function(err, collection) {
        function insert(callback) {
          var total = 10;

          for(var i = 0; i < 10; i++) {
            collection.insert({'x':i}, configuration.writeConcernMax(), function(e) {
              total = total - 1;
              if(total == 0) callback();
            });
          }
        }

        function finished() {
          collection.find(function(err, cursor) {
            test.throws(function () {
              cursor.toArray();
            });

            db.close();
            test.done();
          });
        }

        insert(function() {
          finished();
        });      
      });
    });
  }
}

/**
 * @ignore
 * @api private
 */
exports.shouldThrowErrorOnEachWhenMissingCallback = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('test_each', function(err, collection) {
        function insert(callback) {
          var total = 10;

          for(var i = 0; i < 10; i++) {
            collection.insert({'x':i}, configuration.writeConcernMax(), function(e) {
              total = total - 1;
              if(total == 0) callback();
            });
          }
        }

        function finished() {
          collection.find(function(err, cursor) {
            test.throws(function () {
              cursor.each();
            });

            db.close();
            test.done();
          });
        }

        insert(function() {
          finished();
        });      
      });
    });
  }
}

/**
 * @ignore
 * @api private
 */
exports.shouldCorrectlyHandleLimitOnCursor = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('test_cursor_limit', function(err, collection) {
        function insert(callback) {
          var total = 10;

          for(var i = 0; i < 10; i++) {
            collection.insert({'x':i}, configuration.writeConcernMax(), function(e) {
              total = total - 1;
              if(total == 0) callback();
            });
          }
        }

        function finished() {
          collection.find().limit(5).toArray(function(err, items) {
            test.equal(5, items.length);
            
            // Let's close the db
            db.close();
            test.done();
          });
        }

        insert(function() {
          finished();
        });      
      });
    });
  }
}

/**
 * @ignore
 * @api private
 */
exports.shouldCorrectlyHandleNegativeOneLimitOnCursor = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('test_cursor_negative_one_limit', function(err, collection) {
        function insert(callback) {
          var total = 10;

          for(var i = 0; i < 10; i++) {
            collection.insert({'x':i}, configuration.writeConcernMax(), function(e) {
              total = total - 1;
              if(total == 0) callback();
            });
          }
        }

        function finished() {
          collection.find().limit(-1).toArray(function(err, items) {
            test.equal(1, items.length);
            
            // Let's close the db
            db.close();
            test.done();
          });
        }

        insert(function() {
          finished();
        });      
      });
    });
  }
}

/**
 * @ignore
 * @api private
 */
exports.shouldCorrectlyHandleAnyNegativeLimitOnCursor = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('test_cursor_any_negative_limit', function(err, collection) {
        function insert(callback) {
          var total = 10;

          for(var i = 0; i < 10; i++) {
            collection.insert({'x':i}, configuration.writeConcernMax(), function(e) {
              total = total - 1;
              if(total == 0) callback();
            });
          }
        }

        function finished() {
          collection.find().limit(-5).toArray(function(err, items) {
            test.equal(5, items.length);
            
            // Let's close the db
            db.close();
            test.done();
          });
        }

        insert(function() {
          finished();
        });      
      });
    });
  }
}

/**
 * @ignore
 * @api private
 */
exports.shouldCorrectlyReturnErrorsOnIllegalLimitValues = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('test_limit_exceptions', function(err, collection) {
        collection.insert({'a':1}, configuration.writeConcernMax(), function(err, docs) {});
        collection.find(function(err, cursor) {
          try {
            cursor.limit('not-an-integer');          
          } catch(err) {
            test.equal("limit requires an integer", err.message);
          }

          try {
            cursor.limit('not-an-integer');
            test.ok(false);
          } catch(err) {
            test.equal("limit requires an integer", err.message);
          }
        });

        collection.find(function(err, cursor) {
          cursor.close(function(err, cursor) {
            try {
              cursor.limit(1);
            } catch(err) {
              test.equal("Cursor is closed", err.message);
            }
              
            collection.find(function(err, cursor) {
              cursor.nextObject(function(err, doc) {          
                try {
                  cursor.limit(1);
                } catch(err) {
                  test.equal("Cursor is closed", err.message);
                }

                try {
                  cursor.limit(1);
                  test.ok(false);
                } catch(err) {
                  test.equal("Cursor is closed", err.message);
                }

                db.close();
                test.done();                
              });
            });

            try {
              cursor.limit(1);
              test.ok(false);
            } catch(err) {
              test.equal("Cursor is closed", err.message);
            }
          });
        });
      });
    });
  }
}

/**
 * @ignore
 * @api private
 */
exports.shouldCorrectlySkipRecordsOnCursor = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('test_skip', function(err, collection) {
        function insert(callback) {
          var total = 10;

          for(var i = 0; i < 10; i++) {
            collection.insert({'x':i}, configuration.writeConcernMax(), function(e) {
              total = total - 1;
              if(total == 0) callback();
            });
          }
        }

        function finished() {
          collection.find(function(err, cursor) {
            cursor.count(function(err, count) {
              test.equal(10, count);
            });
          });

          collection.find(function(err, cursor) {
            cursor.toArray(function(err, items) {
              test.equal(10, items.length);

              collection.find().skip(2).toArray(function(err, items2) {
                test.equal(8, items2.length);

                // Check that we have the same elements
                var numberEqual = 0;
                var sliced = items.slice(2, 10);

                for(var i = 0; i < sliced.length; i++) {
                  if(sliced[i].x == items2[i].x) numberEqual = numberEqual + 1;
                }

                test.equal(8, numberEqual);

                // Let's close the db
                db.close();
                test.done();
              });
            });
          });
        }

        insert(function() {
          finished();
        });      
      });
    });
  }
}

/**
 * @ignore
 * @api private
 */
exports.shouldCorrectlyReturnErrorsOnIllegalSkipValues = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('test_skip_exceptions', function(err, collection) {
        collection.insert({'a':1}, configuration.writeConcernMax(), function(err, docs) {});
        try {
          collection.find().skip('not-an-integer');
        } catch(err) {
          test.equal("skip requires an integer", err.message);
        }

        var cursor = collection.find()
        cursor.nextObject(function(err, doc) {
          try {
            cursor.skip(1);  
          } catch(err) {
            test.equal("Cursor is closed", err.message);
          }

          var cursor2 = collection.find()
          cursor2.close(function(err, cursor) {
            try {
              cursor2.skip(1);  
            } catch(err) {
              test.equal("Cursor is closed", err.message);
            }

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
 * @api private
 */
exports.shouldReturnErrorsOnIllegalBatchSizes = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('test_batchSize_exceptions', function(err, collection) {
        collection.insert({'a':1}, configuration.writeConcernMax(), function(err, docs) {});
        var cursor = collection.find();

        try {
          cursor.batchSize('not-an-integer');
          test.ok(false);
        } catch (err) {
          test.equal("batchSize requires an integer", err.message);
        }

        var cursor = collection.find();
        cursor.nextObject(function(err, doc) {
          cursor.nextObject(function(err, doc) {
            try {
              cursor.batchSize(1);
              test.ok(false);
            } catch (err) {
              test.equal("Cursor is closed", err.message);
            }

            var cursor2 = collection.find()
            cursor2.close(function(err, cursor) {
              try {
                cursor2.batchSize(1);
                test.ok(false);
              } catch (err) {
                test.equal("Cursor is closed", err.message);
              }

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
 * @api private
 */
exports.shouldCorrectlyHandleChangesInBatchSizes = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('test_not_multiple_batch_size', function(err, collection) {
        var records = 6;
        var batchSize = 2;
        var docs = [];
        for(var i = 0; i < records; i++) {
          docs.push({'a':i});
        }

        collection.insert(docs, {w:1}, function() {
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
  }
}

/**
 * @ignore
 * @api private
 */
exports.shouldCorrectlyHandleBatchSize = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('test_multiple_batch_size', function(err, collection) {
        //test with the last batch that is a multiple of batchSize
        var records = 4;
        var batchSize = 2;
        var docs = [];
        for(var i = 0; i < records; i++) {
          docs.push({'a':i});
        }

        collection.insert(docs, {w:1}, function() {
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
 * @api private
 */
exports.shouldHandleWhenLimitBiggerThanBatchSize = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('test_limit_greater_than_batch_size', function(err, collection) {
        var limit = 4;
        var records = 10;
        var batchSize = 3;
        var docs = [];
        for(var i = 0; i < records; i++) {
          docs.push({'a':i});
        }

        collection.insert(docs, {w:1}, function() {
          var cursor = collection.find({}, {batchSize : batchSize, limit : limit});
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
 * @api private
 */
exports.shouldHandleLimitLessThanBatchSize = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('test_limit_less_than_batch_size', function(err, collection) {
        var limit = 2;
        var records = 10;
        var batchSize = 4;
        var docs = [];
        for(var i = 0; i < records; i++) {
          docs.push({'a':i});
        }

        collection.insert(docs, {w:1}, function() {
          var cursor = collection.find({}, {batchSize : batchSize, limit : limit});
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
 * @api private
 */
exports.shouldHandleSkipLimitChaining = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('test_limit_skip_chaining', function(err, collection) {
        function insert(callback) {
          var total = 10;

          for(var i = 0; i < 10; i++) {
            collection.insert({'x':i}, configuration.writeConcernMax(), function(e) {
              total = total - 1;
              if(total == 0) callback();
            });
          }
        }

        function finished() {
          collection.find().toArray(function(err, items) {
            test.equal(10, items.length);

            collection.find().limit(5).skip(3).toArray(function(err, items2) {
              test.equal(5, items2.length);

              // Check that we have the same elements
              var numberEqual = 0;
              var sliced = items.slice(3, 8);

              for(var i = 0; i < sliced.length; i++) {
                if(sliced[i].x == items2[i].x) numberEqual = numberEqual + 1;
              }
              test.equal(5, numberEqual);

              // Let's close the db
              db.close();
              test.done();
            });
          });
        }

        insert(function() {
          finished();
        });
      });
    });
  }
}

/**
 * @ignore
 * @api private
 */
exports.shouldCorrectlyHandleLimitSkipChainingInline = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('test_limit_skip_chaining_inline', function(err, collection) {
        function insert(callback) {
          var total = 10;

          for(var i = 0; i < 10; i++) {
            collection.insert({'x':i}, configuration.writeConcernMax(), function(e) {
              total = total - 1;
              if(total == 0) callback();
            });
          }
        }

        function finished() {
          collection.find().toArray(function(err, items) {
            test.equal(10, items.length);

            collection.find().limit(5).skip(3).toArray(function(err, items2) {
              test.equal(5, items2.length);

              // Check that we have the same elements
              var numberEqual = 0;
              var sliced = items.slice(3, 8);

              for(var i = 0; i < sliced.length; i++) {
                if(sliced[i].x == items2[i].x) numberEqual = numberEqual + 1;
              }
              test.equal(5, numberEqual);

              // Let's close the db
              db.close();
              test.done();
            });
          });
        }

        insert(function() {
          finished();
        });
      });
    });
  }
}

/**
 * @ignore
 * @api private
 */
exports.shouldCloseCursorNoQuerySent = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('test_close_no_query_sent', function(err, collection) {
        collection.find().close(function(err, cursor) {
          test.equal(true, cursor.isClosed());
          // Let's close the db
          db.close();
          test.done();
        });
      });
    });
  }
}

/**
 * @ignore
 * @api private
 */
exports.shouldCorrectlyRefillViaGetMoreCommand = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var COUNT = 1000;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('test_refill_via_get_more', function(err, collection) {
        function insert(callback) {
          var total = COUNT;

          for(var i = 0; i < COUNT; i++) {
            collection.insert({'a':i}, configuration.writeConcernMax(), function(e) {
              total = total - 1;
              if(total == 0) callback();
            });
          }
        }

        function finished() {
          collection.count(function(err, count) {
            test.equal(COUNT, count);
          });

          var total = 0;
          var i = 0;
          var cursor = collection.find({}, {}).each(function(err, item) {
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
                collection.find().each(function(err, item) {
                  if(item != null) {
                    total2 = total2 + item.a;
                  } else {
                    test.equal(499500, total2);
                    collection.count(function(err, count) {
                      test.equal(COUNT, count);
                      test.equal(total, total2);
                      
                      // Let's close the db
                      db.close();
                      test.done();
                    });
                  }
                });
              });
            }
          });
        }

        insert(function() {
          finished();
        });
      });
    });
  }
}

/**
 * @ignore
 * @api private
 */
exports.shouldCorrectlyRefillViaGetMoreAlternativeCollection = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('test_refill_via_get_more_alt_coll', function(err, collection) {
        var COUNT = 1000;

        function insert(callback) {
          var total = COUNT;

          for(var i = 0; i < COUNT; i++) {
            collection.insert({'a':i}, configuration.writeConcernMax(), function(e) {
              total = total - 1;
              if(total == 0) callback();
            });
          }
        }

        function finished() {
          collection.count(function(err, count) {
            test.equal(1000, count);
          });

          var total = 0;
          collection.find().each(function(err, item) {
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
                collection.find().each(function(err, item) {
                  if(item != null) {
                    total2 = total2 + item.a;
                  } else {
                    test.equal(499500, total2);
                    collection.count(function(err, count) {
                      test.equal(1000, count);
                      test.equal(total, total2);
                      
                      // Let's close the db
                      db.close();
                      test.done();
                    });
                  }
                });
              });
            }
          });
        }

        insert(function() {
          finished();
        })
      });
    });
  }
}

/**
 * @ignore
 * @api private
 */
exports.shouldCloseCursorAfterQueryHasBeenSent = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('test_close_after_query_sent', function(err, collection) {
        collection.insert({'a':1}, configuration.writeConcernMax(), function(err, r) {
          var cursor = collection.find({'a':1});
          cursor.nextObject(function(err, item) {
            cursor.close(function(err, cursor) {
              test.equal(true, cursor.isClosed());
              // Let's close the db
              db.close();
              test.done();
            })
          });
        });
      });
    });
  }
}

/**
 * @ignore
 * @api private
 */
exports.shouldCorrectlyExecuteCursorCountWithFields = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('test_count_with_fields', function(err, collection) {
        collection.save({'x':1, 'a':2}, configuration.writeConcernMax(), function(err, doc) {
          collection.find({}, {'fields':['a']}).toArray(function(err, items) {
            test.equal(1, items.length);
            test.equal(2, items[0].a);
            test.equal(null, items[0].x);
          });

          collection.findOne({}, {'fields':['a']}, function(err, item) {
            test.equal(2, item.a);
            test.equal(null, item.x);
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
 * @api private
 */
exports.shouldCorrectlyCountWithFieldsUsingExclude = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('test_count_with_fields_using_exclude', function(err, collection) {
        collection.save({'x':1, 'a':2}, configuration.writeConcernMax(), function(err, doc) {
          collection.find({}, {'fields':{'x':0}}).toArray(function(err, items) {
            test.equal(1, items.length);
            test.equal(2, items[0].a);
            test.equal(null, items[0].x);
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
 * @api private
 */
exports.shouldCorrectlyExecuteEnsureIndexWithNoCallback = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var docs = [];

    for(var i = 0; i < 1; i++) {
      var d = new Date().getTime() + i*1000;
      docs[i] = {createdAt:new Date(d)};
    }

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      // Create collection
      db.createCollection('shouldCorrectlyExecuteEnsureIndexWithNoCallback', function(err, collection) {
        // ensure index of createdAt index
        collection.ensureIndex({createdAt:1}, function(err, result) {
          // insert all docs
          collection.insert(docs, configuration.writeConcernMax(), function(err, result) {
            test.equal(null, err);

            // Find with sort
            collection.find().sort(['createdAt', 'asc']).toArray(function(err, items) {
              if (err) logger.error("error in collection_info.find: " + err);
              test.equal(1, items.length);
              db.close();
              test.done();
            })
          })
        });
      });
    });
  }
}

/**
 * @ignore
 * @api private
 */
exports['Should correctly execute count on cursor'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var docs = [];

    for(var i = 0; i < 1000; i++) {
      var d = new Date().getTime() + i*1000;
      docs[i] = {'a':i, createdAt:new Date(d)};
    }

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      // Create collection
      db.createCollection('Should_correctly_execute_count_on_cursor', function(err, collection) {
        test.equal(null, err);

        // insert all docs
        collection.insert(docs, configuration.writeConcernMax(), function(err, result) {
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
                  db.close();
                  test.done();
                })
              }
            });
          })
        })
      });
    });
  }
}

/**
 * @ignore
 * @api private
 */
exports['should be able to stream documents'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var docs = [];

    for (var i = 0; i < 1000; i++) {
      docs[i] = { a: i+1 };
    }

    var count = 0;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      // Create collection
      db.createCollection('Should_be_able_to_stream_documents', function(err, collection) {
        test.equal(null, err);

        // insert all docs
        collection.insert(docs, configuration.writeConcernMax(), function(err, result) {
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
            count = count + 1;

            if(paused > 0 && 0 === resumed) {
              err = new Error('data emitted during pause');
              return done();
            }

            if(++i === 3) {
              // test.equal(false, stream.paused);
              stream.pause();
              // test.equal(true, stream.paused);
              paused++;

              setTimeout(function () {
                // test.equal(true, stream.paused);
                stream.resume();
                resumed++;
                process.nextTick(function() {
                  // test.equal(false, stream.paused);
                })
              }, 20);
            }
          });

          stream.on('error', function (er) {
            err = er;
            done();
          });

          stream.on('end', function () {
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
            db.close();
            test.done();
          }
        });
      });
    });
  }
}

/**
 * @ignore
 * @api private
 */
exports['immediately destroying a stream prevents the query from executing'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var i = 0
      , docs = [{ b: 2 }, { b: 3 }]
      , doneCalled = 0

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('immediately_destroying_a_stream_prevents_the_query_from_executing', function(err, collection) {
        test.equal(null, err);

        // insert all docs
        collection.insert(docs, configuration.writeConcernMax(), function(err, result) {
          test.equal(null, err);

          var stream = collection.find().stream();

          stream.on('data', function () {
            i++;
          })
          stream.on('close', done('close'));
          stream.on('error', done('error'));

          stream.destroy();

          function done (e) {
            return function(err) {              
              test.equal(++doneCalled, 1);
              test.equal(undefined, err);
              test.strictEqual(0, i);
              test.strictEqual(stream._cursor.isClosed(), true);
              db.close();
              test.done();
            }
          }
        });
      });
    });
  }
}

/**
 * @ignore
 * @api private
 */
exports['destroying a stream stops it'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      test.equal(null, err);

      db.createCollection('destroying_a_stream_stops_it', function(err, collection) {
        test.equal(null, err);

        var docs = [];
        for (var ii = 0; ii < 10; ++ii) docs.push({ b: ii+1 });

        // insert all docs
        collection.insert(docs, configuration.writeConcernMax(), function(err, result) {
          test.equal(null, err);

          var finished = 0
            , i = 0

          var stream = collection.find().stream();

          test.strictEqual(stream._cursor.isClosed(), false);

          stream.on('data', function (doc) {
            if(++i === 5) {
              stream.destroy();
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
              test.strictEqual(stream._cursor.isClosed(), true);
              db.close();
              test.done();
            }, 150)
          }
        });
      });
    });
  }
}

/**
 * @ignore
 * @api private
 */
exports['cursor stream errors'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var client = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});
    client.open(function(err, db_p) {
      test.equal(null, err);

      client.createCollection('cursor_stream_errors', function(err, collection) {
        test.equal(null, err);

        var docs = [];
        for (var ii = 0; ii < 10; ++ii) docs.push({ b: ii+1 });

        // insert all docs
        collection.insert(docs, {w:1}, function(err, result) {
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
              test.equal('Connection was destroyed by application', err.message);
              test.equal(5, i);
              test.equal(0, closed);
              test.equal(1, finished);
              test.equal(true, stream._destroyed);
              test.equal(false, stream.readable);
              test.equal(true, stream._cursor.isClosed());
              client.close();
              test.done();
            }, 150)
          }
        });
      });
    });
  }
}

/**
 * @ignore
 * @api private
 */
exports['cursor stream errors connection force closed'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var client = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});
    client.open(function(err, db_p) {
      test.equal(null, err);

      client.createCollection('cursor_stream_errors', function(err, collection) {
        test.equal(null, err);

        var docs = [];
        for (var ii = 0; ii < 10; ++ii) docs.push({ b: ii+1 });

        // insert all docs
        collection.insert(docs, configuration.writeConcernMax(), function(err, result) {
          test.equal(null, err);

          var finished = 0
            , closed = 0
            , i = 0

          var stream = collection.find({}, { batchSize: 5 }).stream();

          stream.on('data', function (doc) {            
            if (++i === 5) {
              client.serverConfig.connectionPool.openConnections[0].connection.destroy();
            }
          });

          var done = function(err) {
            ++finished;
            setTimeout(function () {
              test.equal(5, i);
              test.equal(1, finished);
              test.strictEqual(stream._cursor.isClosed(), true);
              client.close();
              test.done();
            }, 150)
          }

          stream.on('close', done);

          stream.on('error', done);
        });
      });
    });
  }
}

/**
 * @ignore
 * @api private
 */
exports['cursor stream pipe'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var fs = require('fs');
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('cursor_stream_pipe', function(err, collection) {
        test.equal(null, err);

        var docs = [];
        ;('Aaden Aaron Adrian Aditya Bob Joe').split(' ').forEach(function (name) {
          docs.push({ name: name });
        });

        // insert all docs
        collection.insert(docs, {w:1}, function(err, result) {
          test.equal(null, err);

          var filename = '/tmp/_nodemongodbnative_stream_out.txt'
            , out = fs.createWriteStream(filename)

          // hack so we don't need to create a stream filter just to
          // stringify the objects (otherwise the created file would
          // just contain a bunch of [object Object])
          // var toString = Object.prototype.toString;
          // Object.prototype.toString = function () {
          //   return JSON.stringify(this);
          // }

          var isDone = false;
          var stream = collection.find().stream({transform: function(doc) { return JSON.stringify(doc); }});
          stream.pipe(out);

          var done = function(err) {
            if(isDone) return;
            isDone = true;
            test.strictEqual(undefined, err);
            var contents = fs.readFileSync(filename, 'utf8');
            test.ok(/Aaden/.test(contents));
            test.ok(/Aaron/.test(contents));
            test.ok(/Adrian/.test(contents));
            test.ok(/Aditya/.test(contents));
            test.ok(/Bob/.test(contents));
            test.ok(/Joe/.test(contents));
            fs.unlink(filename);
            db.close();
            test.done();
          }
          
          // Wait for output stream to close
          out.once('close', done);
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldCloseDeadTailableCursors = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    // http://www.mongodb.org/display/DOCS/Tailable+Cursors
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});
    db.open(function(err, db) {

      var options = { capped: true, size: 8 };
      db.createCollection('test_if_dead_tailable_cursors_close', options, function(err, collection) {
        test.equal(null, err);

        var insertId = 0
        function insert (cb) {
          if (insert.ran) insert.ran++;
          else insert.ran = 1;

          var docs = []
          for(var end = insertId+1; insertId < end+80; insertId++) {
            docs.push({id:insertId})
          }
          collection.insert(docs, {w:1}, function(err, ids) {
            test.equal(null, err);
            cb && cb();
          })
        }

        var lastId = 0
          , closed = false;

        insert(function query () {
          var conditions = { id: { $gte: lastId }};
          var stream = collection.find(conditions, { tailable: true }).stream();

          stream.on('data', function (doc) {
            lastId = doc.id;
            // kill the cursor on the server by inserting enough more
            // docs to overwrite the last one returned. this should
            // force the stream to close.
            if (insertId == lastId+1) insert();
          });

          stream.on('error', function (err) {
            // shouldn't happen
            test.ok(err != null);
          });

          stream.on('end', function () {
            // this is what we need
            closed = true;
          });
        });

        setTimeout(function () {
          db.close();
          test.equal(2, insert.ran);
          test.equal(true, closed);
          db.close();
          test.done();
        }, 800);
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldAwaitData = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    // http://www.mongodb.org/display/DOCS/Tailable+Cursors
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});

    db.open(function(err, db) {
      var options = { capped: true, size: 8};
      db.createCollection('should_await_data', options, function(err, collection) {
        collection.insert({a:1}, configuration.writeConcernMax(), function(err, result) {

          // Create cursor with awaitdata, and timeout after the period specified
          collection.find({}, {tailable:true, awaitdata:true, numberOfRetries:1}).each(function(err, result) {
            if(err != null) {
              db.close();
              test.done();
            }
          });
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldNotAwaitDataWhenFalse = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    // NODE-98
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});

    db.open(function(err, db) {
      var options = { capped: true, size: 8};
      db.createCollection('should_not_await_data_when_false', options, function(err, collection) {
        collection.insert({a:1}, configuration.writeConcernMax(), function(err, result) {
          // should not timeout
          collection.find({}, {tailable:true, awaitdata:false}).each(function(err, result) {
            test.ok(err != null);
          });

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
exports.shouldCorrectExecuteExplainHonoringLimit = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var docs = []
    docs[0] = { "_keywords" : [ "compact", "ii2gd", "led", "24-48v", "presse-etoupe", "bexbgl1d24483", "flash", "48v", "eexd", "feu", "presse", "compris", "rouge", "etoupe", "iic", "ii2gdeexdiict5", "red", "aet" ]};
    docs[1] = { "_keywords" : [ "reducteur", "06212", "d20/16", "manch", "d20", "manchon", "ard", "sable", "irl", "red" ]};
    docs[2] = { "_keywords" : [ "reducteur", "06214", "manch", "d25/20", "d25", "manchon", "ard", "sable", "irl", "red" ]};
    docs[3] = { "_keywords" : [ "bar", "rac", "boite", "6790178", "50-240/4-35", "240", "branch", "coulee", "ddc", "red", "ip2x" ]};
    docs[4] = { "_keywords" : [ "bar", "ip2x", "boite", "6790158", "ddi", "240", "branch", "injectee", "50-240/4-35?", "red" ]};
    docs[5] = { "_keywords" : [ "bar", "ip2x", "boite", "6790179", "coulee", "240", "branch", "sdc", "50-240/4-35?", "red", "rac" ]};
    docs[6] = { "_keywords" : [ "bar", "ip2x", "boite", "6790159", "240", "branch", "injectee", "50-240/4-35?", "sdi", "red" ]};
    docs[7] = { "_keywords" : [ "6000", "r-6000", "resin", "high", "739680", "red", "performance", "brd", "with", "ribbon", "flanges" ]};
    docs[8] = { "_keywords" : [ "804320", "for", "paint", "roads", "brd", "red" ]};
    docs[9] = { "_keywords" : [ "38mm", "padlock", "safety", "813594", "brd", "red" ]};
    docs[10] = { "_keywords" : [ "114551", "r6900", "for", "red", "bmp71", "brd", "ribbon" ]};
    docs[11] = { "_keywords" : [ "catena", "diameter", "621482", "rings", "brd", "legend", "red", "2mm" ]};
    docs[12] = { "_keywords" : [ "catena", "diameter", "621491", "rings", "5mm", "brd", "legend", "red" ]};
    docs[13] = { "_keywords" : [ "catena", "diameter", "621499", "rings", "3mm", "brd", "legend", "red" ]};
    docs[14] = { "_keywords" : [ "catena", "diameter", "621508", "rings", "5mm", "brd", "legend", "red" ]};
    docs[15] = { "_keywords" : [ "insert", "for", "cable", "3mm", "carrier", "621540", "blank", "brd", "ademark", "red" ]};
    docs[16] = { "_keywords" : [ "insert", "for", "cable", "621544", "3mm", "carrier", "brd", "ademark", "legend", "red" ]};
    docs[17] = { "_keywords" : [ "catena", "diameter", "6mm", "621518", "rings", "brd", "legend", "red" ]};
    docs[18] = { "_keywords" : [ "catena", "diameter", "621455", "8mm", "rings", "brd", "legend", "red" ]};
    docs[19] = { "_keywords" : [ "catena", "diameter", "621464", "rings", "5mm", "brd", "legend", "red" ]};

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      // Insert all the docs
      var collection = db.collection('shouldCorrectExecuteExplainHonoringLimit');
      collection.insert(docs, configuration.writeConcernMax(), function(err, result) {
        test.equal(null, err);

        collection.ensureIndex({_keywords:1}, configuration.writeConcernMax(), function(err, result) {
          test.equal(null, err);

          collection.find({_keywords:'red'}, {}, {explain:true}).limit(10).toArray(function(err, result) {
            test.equal(null, err);
            test.ok(result != null);

            collection.find({_keywords:'red'},{}).limit(10).explain(function(err, result) {
              test.equal(null, err);
              test.ok(result != null);

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
exports.shouldNotExplainWhenFalse = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var doc = { "name" : "camera", "_keywords" : [ "compact", "ii2gd", "led", "red", "aet" ]};

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      var collection = db.collection('shouldNotExplainWhenFalse');
      collection.insert(doc, configuration.writeConcernMax(), function(err, result) {
        test.equal(null, err);
        collection.find({"_keywords" : "red"}, {}, {explain:false}).limit(10).toArray(function(err, result) {
          test.equal("camera", result[0].name);
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
exports.shouldFailToSetReadPreferenceOnCursor = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});

    // Establish connection to db
    db.open(function(err, db) {
      try {
        db.collection('shouldFailToSetReadPreferenceOnCursor').find().setReadPreference("notsecondary");      
        test.ok(false);
      } catch (err) {
      }

      db.collection('shouldFailToSetReadPreferenceOnCursor').find().setReadPreference("secondary");      

      db.close();
      test.done()
    });
  }
}

/**
 * @ignore
 * @api private
 */
exports.shouldNotFailDueToStackOverflowEach = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('shouldNotFailDueToStackOverflowEach', function(err, collection) {
        var docs = [];
        var total = 0;
        for(var i = 0; i < 30000; i++) docs.push({a:i});
        var allDocs = [];
        var left = 0;

        while(docs.length > 0) {
          allDocs.push(docs.splice(0, 1000));
        }
        // Get all batches we must insert
        left = allDocs.length;
        var totalI = 0;

        // Execute inserts
        for(var i = 0; i < left; i++) {
          collection.insert(allDocs.shift(), configuration.writeConcernMax(), function(err, d) {
            left = left - 1;
            totalI = totalI + d.length;

            if(left == 0) {
              var s = new Date().getTime();

              collection.find({}).each(function(err, item) {
                if(item == null) {
                  var e = new Date().getTime();
                  
                  test.equal(30000, total);
                  db.close();
                  test.done();
                } else {
                  total++;
                }
              })
            }
          })
        }
      });
    });
  }
}

/**
 * @ignore
 * @api private
 */
exports.shouldNotFailDueToStackOverflowToArray = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('shouldNotFailDueToStackOverflowToArray', function(err, collection) {
        var docs = [];
        var total = 0;
        for(var i = 0; i < 30000; i++) docs.push({a:i});
        var allDocs = [];
        var left = 0;

        while(docs.length > 0) {
          allDocs.push(docs.splice(0, 1000));
        }
        // Get all batches we must insert
        left = allDocs.length;
        var totalI = 0;
        var timeout = 0;

        // Execute inserts
        for(var i = 0; i < left; i++) {
          setTimeout(function() {
            collection.insert(allDocs.shift(), configuration.writeConcernMax(), function(err, d) {
              left = left - 1;
              totalI = totalI + d.length;

              if(left == 0) {
                var s = new Date().getTime();

                collection.find({}).toArray(function(err, items) {
                  var e = new Date().getTime();

                  test.equal(30000, items.length);
                  db.close();
                  test.done();
                });
              }
            });
          }, timeout);
          timeout = timeout + 100;
        }
      });
    });
  }
}

/**
 * @ignore
 * @api private
 */
exports.shouldCorrectlySkipAndLimit = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      var collection = db.collection('shouldCorrectlySkipAndLimit')
      var docs = [];
      for(var i = 0; i < 100; i++) docs.push({a:i, OrderNumber:i});

      collection.insert(docs, configuration.writeConcernMax(), function(err, ids) {

        collection.find({}, {OrderNumber:1}).skip(10).limit(10).toArray(function(err, items) {
          test.equal(10, items[0].OrderNumber);

          collection.find({}, {OrderNumber:1}).skip(10).limit(10).count(true, function(err, count) {
            test.equal(10, count);
            db.close();
            test.done();
          });
        })
      });
    });
  }
}

/**
 * @ignore
 * @api private
 */
exports.shouldFailToTailANormalCollection = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      var collection = db.collection('shouldFailToTailANormalCollection')
      var docs = [];
      for(var i = 0; i < 100; i++) docs.push({a:i, OrderNumber:i});

      collection.insert(docs, configuration.writeConcernMax(), function(err, ids) {
        collection.find({}, {tailable:true}).each(function(err, doc) {
          test.ok(err instanceof Error);
          test.ok(typeof(err.code) === 'number');
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
exports.shouldCorrectlyUseFindAndCursorCount = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});

    // DOC_LINE var db = new Db('test', new Server('localhost', 27017));
    // DOC_START
    // Establish connection to db
    db.open(function(err, db) {

      // Create a lot of documents to insert
      var docs = []
      for(var i = 0; i < 100; i++) {
        docs.push({'a':i})
      }

      // Create a collection
      db.createCollection('test_close_function_on_cursor_2', function(err, collection) {
        test.equal(null, err);

        // Insert documents into collection
        collection.insert(docs, configuration.writeConcernMax(), function(err, ids) {

          collection.find({}, function(err, cursor) {
            test.equal(null, err);

            cursor.count(function(err, count) {
              test.equal(null, err);
              test.equal(100, count);

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
exports['should correctly apply hint to count command for cursor'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'], mongodb: ">2.5.5" } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});

    // DOC_LINE var db = new Db('test', new Server('localhost', 27017));
    // DOC_START
    // Establish connection to db
    db.open(function(err, db) {
      var col = db.collection('count_hint');

      col.insert([{i:1}, {i:2}], {w:1}, function(err, docs) {
        test.equal(null, err);

        col.ensureIndex({i:1}, function(err, r) {
          test.equal(null, err);

          col.find({i:1}, {hint: "_id_"}).count(function(err, count) {
            test.equal(null, err);
            test.equal(1, count);

            col.find({}, {hint: "_id_"}).count(function(err, count) {
              test.equal(null, err);
              test.equal(2, count);

              col.find({i:1}, {hint: "BAD HINT"}).count(function(err, count) {
                test.ok(err != null);

                col.ensureIndex({x:1}, {sparse:true}, function(err, r) {
                  test.equal(null, err);

                  col.find({i:1}, {hint: "x_1"}).count(function(err, count) {
                    test.equal(null, err);
                    test.equal(0, count);

                    col.find({}, {hint: "x_1"}).count(function(err, count) {
                      test.equal(null, err);
                      test.equal(2, count);

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
exports['Should correctly handle maxTimeMS as part of findOne options'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { topology: ['single', 'replicaset', 'ssl', 'heap', 'wiredtiger'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1, auto_reconnect:false});
    // Establish connection to db
    db.open(function(err, db) {
      test.equal(null, err);

      var donkey = {
        color: 'brown'
      };

      db.collection('donkies').insert(donkey, function(err, result) {
        test.equal(null, err);

        var query = { _id: result[0]._id };
        var options = {maxTimeMS: 1000};

        db.collection('donkies').findOne(query, options, function(err, doc) {
          test.equal(null, err);
          test.equal('brown', doc.color);

          db.close();
          test.done();
        });
      });
    });
  }
}