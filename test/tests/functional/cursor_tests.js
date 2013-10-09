var Step = require('step')
  fs = require('fs');

/**
 * An example showing the information returned by indexInformation
 *
 * @_class cursor
 * @_function toArray
 */
exports.shouldCorrectlyExecuteToArray = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});

  // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
  // DOC_START
  // Establish connection to db
  db.open(function(err, db) {

    // Create a collection to hold our documents
    db.createCollection('test_array', function(err, collection) {

      // Insert a test document
      collection.insert({'b':[1, 2, 3]}, {w:1}, function(err, ids) {

        // Retrieve all the documents in the collection
        collection.find().toArray(function(err, documents) {
          test.equal(1, documents.length);
          test.deepEqual([1, 2, 3], documents[0].b);

          db.close();
          test.done();
        });
      });
    });
  });
  // DOC_END
}

/**
 * @ignore
 * @api private
 */
exports.shouldCorrectlyExecuteToArrayAndFailOnFurtherCursorAccess = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.createCollection('test_to_a', function(err, collection) {

      collection.insert({'a':1}, {w:1}, function(err, ids) {
        var cursor = collection.find({});
        cursor.toArray(function(err, items) {
          // Should fail if called again (cursor should be closed)
          cursor.toArray(function(err, items) {
            test.equal("Cursor is closed", err.message);

            // Should fail if called again (cursor should be closed)
            cursor.each(function(err, item) {
              test.equal("Cursor is closed", err.message);
              // Let's close the db
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
 * A simple example iterating over a query using the each function of the cursor.
 *
 * @_class cursor
 * @_function each
 * @ignore
 */
exports.shouldCorrectlyFailToArrayDueToFinishedEachOperation = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});

  // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
  // DOC_START
  // Establish connection to db
  db.open(function(err, db) {

    // Create a collection
    db.createCollection('test_to_a_after_each', function(err, collection) {
      test.equal(null, err);

      // Insert a document in the collection
      collection.insert({'a':1}, {w:1}, function(err, ids) {

        // Grab a cursor
        var cursor = collection.find();

        // Execute the each command, triggers for each document
        cursor.each(function(err, item) {

          // If the item is null then the cursor is exhausted/empty and closed
          if(item == null) {

            // Show that the cursor is closed
            cursor.toArray(function(err, items) {
              test.ok(err != null);

              // Let's close the db
              db.close();
              test.done();
            });
          };
        });
      });
    });
  });
  // DOC_END
}

/**
 * @ignore
 * @api private
 */
exports.shouldCorrectlyExecuteCursorExplain = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.createCollection('test_explain', function(err, collection) {
      collection.insert({'a':1}, {w:1}, function(err, r) {
        collection.find({'a':1}).explain(function(err, explaination) {
          test.ok(explaination.cursor != null);
          test.ok(explaination.n.constructor == Number);
          test.ok(explaination.millis.constructor == Number);
          test.ok(explaination.nscanned.constructor == Number);

          // Let's close the db
          db.close();
          test.done();
        });
      });
    });
  });
}

/**
 * @ignore
 * @api private
 */
exports.shouldCorrectlyExecuteCursorCount = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.createCollection('test_count', function(err, collection) {
      collection.find().count(function(err, count) {
        test.equal(0, count);

        Step(
          function insert() {
            var group = this.group();

            for(var i = 0; i < 10; i++) {
              collection.insert({'x':i}, {w:1}, group());
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

            db.collection('acollectionthatdoesn').count(function(err, count) {
              test.equal(0, count);
            });
          }
        )
      });
    });
  });
}

/**
 * @ignore
 * @api private
 */
exports.shouldCorrectlyExecuteSortOnCursor = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.createCollection('test_sort', function(err, collection) {
      Step(
        function insert() {
          var group = this.group();

          for(var i = 0; i < 5; i++) {
            collection.insert({'a':i}, {w:1}, group());
          }
        },

        function finished() {
          var number_of_functions = 10;
          var finished = function() {
            number_of_functions = number_of_functions - 1;
            if(number_of_functions == 0) {
              db.close();
              test.done();
            }
          }

          collection.find().sort(['a', 1], function(err, cursor) {
            test.deepEqual(['a', 1], cursor.sortValue);finished();
          });

          collection.find().sort('a', 1).nextObject(function(err, doc) {
            test.equal(0, doc.a);finished();
          });

          collection.find().sort('a', -1).nextObject(function(err, doc) {
            test.equal(4, doc.a);finished();
          });

          collection.find().sort('a', "asc").nextObject(function(err, doc) {
            test.equal(0, doc.a);finished();
          });

          collection.find().sort([['a', -1], ['b', 1]], function(err, cursor) {
            test.deepEqual([['a', -1], ['b', 1]], cursor.sortValue);finished();
          });

          collection.find().sort('a', 1).sort('a', -1).nextObject(function(err, doc) {
            test.equal(4, doc.a);finished();
          });

          collection.find().sort('a', -1).sort('a', 1).nextObject(function(err, doc) {
            test.equal(0, doc.a);finished();
          });

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
      );
    });
  });
}

/**
 * @ignore
 * @api private
 */
exports.shouldCorrectlyThrowErrorOnToArrayWhenMissingCallback = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.createCollection('test_to_array', function(err, collection) {
      Step(
        function insert() {
          var group = this.group();

          for(var i = 0; i < 2; i++) {
            collection.save({'x':1}, {w:1}, group());
          }
        },

        function finished() {
          collection.find(function(err, cursor) {
            test.throws(function () {
              cursor.toArray();
            });

            db.close();
            test.done();
          });
        }
      )
    });
  });
}

/**
 * @ignore
 * @api private
 */
exports.shouldThrowErrorOnEachWhenMissingCallback = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.createCollection('test_each', function(err, collection) {
      Step(
        function insert() {
          var group = this.group();

          for(var i = 0; i < 2; i++) {
            collection.save({'x':1}, {w:1}, group());
          }
        },

        function finished() {
          collection.find(function(err, cursor) {
            test.throws(function () {
              cursor.each();
            });

            db.close();
            test.done();
          });
        }
      )
    });
  });
}

/**
 * @ignore
 * @api private
 */
exports.shouldCorrectlyHandleLimitOnCursor = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.createCollection('test_cursor_limit', function(err, collection) {
      Step(
        function insert() {
          var group = this.group();

          for(var i = 0; i < 10; i++) {
            collection.save({'x':1}, {w:1}, group());
          }
        },

        function finished() {
          collection.find().count(function(err, count) {
            test.equal(10, count);
          });

          collection.find().limit(5).toArray(function(err, items) {
            test.equal(5, items.length);
            
            // Let's close the db
            db.close();
            test.done();
          });
        }
      );
    });
  });
}

/**
 * @ignore
 * @api private
 */
exports.shouldCorrectlyHandleNegativeOneLimitOnCursor = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.createCollection('test_cursor_negative_one_limit', function(err, collection) {
      Step(
        function insert() {
          var group = this.group();

          for(var i = 0; i < 10; i++) {
            collection.save({'x':1}, {w:1}, group());
          }
        },

        function finished() {
          collection.find().limit(-1).toArray(function(err, items) {
            test.equal(1, items.length);
            
            // Let's close the db
            db.close();
            test.done();
          });
        }
      );
    });
  });
}

/**
 * @ignore
 * @api private
 */
exports.shouldCorrectlyHandleAnyNegativeLimitOnCursor = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.createCollection('test_cursor_any_negative_limit', function(err, collection) {
      Step(
        function insert() {
          var group = this.group();

          for(var i = 0; i < 10; i++) {
            collection.save({'x':1}, {w:1}, group());
          }
        },

        function finished() {
          collection.find().limit(-5).toArray(function(err, items) {
            test.equal(5, items.length);
            
            // Let's close the db
            db.close();
            test.done();
          });
        }
      );
    });
  });
}

/**
 * @ignore
 * @api private
 */
exports.shouldCorrectlyReturnErrorsOnIllegalLimitValues = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.createCollection('test_limit_exceptions', function(err, collection) {
      collection.insert({'a':1}, {w:1}, function(err, docs) {});
      collection.find(function(err, cursor) {
        cursor.limit('not-an-integer', function(err, cursor) {
          test.equal("limit requires an integer", err.message);
        });

        try {
          cursor.limit('not-an-integer');
          test.ok(false);
        } catch(err) {
          test.equal("limit requires an integer", err.message);
        }
      });

      collection.find(function(err, cursor) {
        cursor.close(function(err, cursor) {
          cursor.limit(1, function(err, cursor) {
            test.equal("Cursor is closed", err.message);

            collection.find(function(err, cursor) {
              cursor.nextObject(function(err, doc) {
                cursor.limit(1, function(err, cursor) {
                  test.equal("Cursor is closed", err.message);
                });

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

/**
 * @ignore
 * @api private
 */
exports.shouldCorrectlySkipRecordsOnCursor = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.createCollection('test_skip', function(err, collection) {
      Step(
        function insert() {
          var group = this.group();

          for(var i = 0; i < 10; i++) {
            collection.insert({'x':i}, {w:1}, group());
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
      )
    });
  });
}

/**
 * @ignore
 * @api private
 */
exports.shouldCorrectlyReturnErrorsOnIllegalSkipValues = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.createCollection('test_skip_exceptions', function(err, collection) {
      collection.insert({'a':1}, {w:1}, function(err, docs) {});
      collection.find().skip('not-an-integer', function(err, cursor) {
        test.equal("skip requires an integer", err.message);
      });

      var cursor = collection.find()
      cursor.nextObject(function(err, doc) {
        cursor.skip(1, function(err, cursor) {
          test.equal("Cursor is closed", err.message);
        });
      });

      var cursor = collection.find()
      cursor.close(function(err, cursor) {
        cursor.skip(1, function(err, cursor) {
          test.equal("Cursor is closed", err.message);

          db.close();
          test.done();
        });
      });
    });
  });
}

/**
 * @ignore
 * @api private
 */
exports.shouldReturnErrorsOnIllegalBatchSizes = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.createCollection('test_batchSize_exceptions', function(err, collection) {
      collection.insert({'a':1}, {w:1}, function(err, docs) {});
      var cursor = collection.find();
      cursor.batchSize('not-an-integer', function(err, cursor) {
        test.equal("batchSize requires an integer", err.message);
      });

      try {
        cursor.batchSize('not-an-integer');
        test.ok(false);
      } catch (err) {
        test.equal("batchSize requires an integer", err.message);
      }

      var cursor = collection.find();
      cursor.nextObject(function(err, doc) {
        cursor.nextObject(function(err, doc) {
          cursor.batchSize(1, function(err, cursor) {
            test.equal("Cursor is closed", err.message);
          });

          try {
            cursor.batchSize(1);
            test.ok(false);
          } catch (err) {
            test.equal("Cursor is closed", err.message);
          }
        });
      });

      var cursor = collection.find()
      cursor.close(function(err, cursor) {
        cursor.batchSize(1, function(err, cursor) {
          test.equal("Cursor is closed", err.message);

          db.close();
          test.done();
        });

        try {
          cursor.batchSize(1);
          test.ok(false);
        } catch (err) {
          test.equal("Cursor is closed", err.message);
        }
      });
    });
  });
}

/**
 * @ignore
 * @api private
 */
exports.shouldCorrectlyHandleChangesInBatchSizes = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
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

/**
 * @ignore
 * @api private
 */
exports.shouldCorrectlyHandleBatchSize = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
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

/**
 * @ignore
 * @api private
 */
exports.shouldHandleWhenLimitBiggerThanBatchSize = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
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

/**
 * @ignore
 * @api private
 */
exports.shouldHandleLimitLessThanBatchSize = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
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

/**
 * @ignore
 * @api private
 */
exports.shouldHandleSkipLimitChaining = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.createCollection('test_limit_skip_chaining', function(err, collection) {
      Step(
        function insert() {
          var group = this.group();

          for(var i = 0; i < 10; i++) {
            collection.insert({'x':1}, {w:1}, group());
          }
        },

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
      )
    });
  });
}

/**
 * @ignore
 * @api private
 */
exports.shouldCorrectlyHandleLimitSkipChainingInline = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.createCollection('test_limit_skip_chaining_inline', function(err, collection) {
      Step(
        function insert() {
          var group = this.group();

          for(var i = 0; i < 10; i++) {
            collection.insert({'x':1}, {w:1}, group());
          }
        },

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
      )
    });
  });
}

/**
 * @ignore
 * @api private
 */
exports.shouldCloseCursorNoQuerySent = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
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

/**
 * @ignore
 * @api private
 */
exports.shouldCorrectlyRefillViaGetMoreCommand = function(configuration, test) {
  var COUNT = 1000;

  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.createCollection('test_refill_via_get_more', function(err, collection) {
      Step(
        function insert() {
          var group = this.group();

          for(var i = 0; i < COUNT; i++) {
            collection.save({'a': i}, {w:1}, group());
          }
        },

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
        })
      })
    });
  });
}

/**
 * @ignore
 * @api private
 */
exports.shouldCorrectlyRefillViaGetMoreAlternativeCollection = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.createCollection('test_refill_via_get_more_alt_coll', function(err, collection) {

      Step(
        function insert() {
          var group = this.group();

          for(var i = 0; i < 1000; i++) {
            collection.save({'a': i}, {w:1}, group());
          }
        },

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
      )
    });
  });
}

/**
 * @ignore
 * @api private
 */
exports.shouldCloseCursorAfterQueryHasBeenSent = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.createCollection('test_close_after_query_sent', function(err, collection) {
      collection.insert({'a':1}, {w:1}, function(err, r) {
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

/**
 * @ignore
 * @api private
 */
exports.shouldCorrectlyExecuteCursorCountWithFields = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.createCollection('test_count_with_fields', function(err, collection) {
      collection.save({'x':1, 'a':2}, {w:1}, function(err, doc) {
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

/**
 * @ignore
 * @api private
 */
exports.shouldCorrectlyCountWithFieldsUsingExclude = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.createCollection('test_count_with_fields_using_exclude', function(err, collection) {
      collection.save({'x':1, 'a':2}, {w:1}, function(err, doc) {
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

/**
 * @ignore
 * @api private
 */
exports.shouldCorrectlyExecuteEnsureIndexWithNoCallback = function(configuration, test) {
  var docs = [];

  for(var i = 0; i < 1; i++) {
    var d = new Date().getTime() + i*1000;
    docs[i] = {createdAt:new Date(d)};
  }

  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    // Create collection
    db.createCollection('shouldCorrectlyExecuteEnsureIndexWithNoCallback', function(err, collection) {
      // ensure index of createdAt index
      collection.ensureIndex({createdAt:1}, function(err, result) {
        // insert all docs
        collection.insert(docs, {w:1}, function(err, result) {
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

/**
 * @ignore
 * @api private
 */
exports.shouldCorrectlyInsert5000RecordsWithDateAndSortCorrectlyWithIndex = function(configuration, test) {
  var docs = [];

  for(var i = 0; i < 5000; i++) {
    var d = new Date().getTime() + i*1000;
    docs[i] = {createdAt:new Date(d)};
  }

  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    // Create collection
    db.createCollection('shouldCorrectlyInsert5000RecordsWithDateAndSortCorrectlyWithIndex', function(err, collection) {
      // ensure index of createdAt index
      collection.ensureIndex({createdAt:1}, function(err, indexName) {
        test.equal(null, err);

        // insert all docs
        collection.insert(docs, {w:1}, function(err, result) {
          test.equal(null, err);

          // Find with sort
          collection.find().sort(['createdAt', 'asc']).toArray(function(err, items) {
            if (err) logger.error("error in collection_info.find: " + err);
            test.equal(5000, items.length);
            db.close();
            test.done();
          })
        })
      });
    });
  });
}

/**
 * An example showing the information returned by indexInformation
 *
 * @_class cursor
 * @_function rewind
 */
exports['Should correctly rewind and restart cursor'] = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});

  // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
  // DOC_START
  // Establish connection to db
  db.open(function(err, db) {
    var docs = [];

    // Insert 100 documents with some data
    for(var i = 0; i < 100; i++) {
      var d = new Date().getTime() + i*1000;
      docs[i] = {'a':i, createdAt:new Date(d)};
    }

    // Create collection
    db.createCollection('Should_correctly_rewind_and_restart_cursor', function(err, collection) {
      test.equal(null, err);

      // insert all docs
      collection.insert(docs, {w:1}, function(err, result) {
        test.equal(null, err);

        // Grab a cursor using the find
        var cursor = collection.find({});
        // Fetch the first object off the cursor
        cursor.nextObject(function(err, item) {
          test.equal(0, item.a)
          // Rewind the cursor, resetting it to point to the start of the query
          cursor.rewind();

          // Grab the first object again
          cursor.nextObject(function(err, item) {
            test.equal(0, item.a)

            db.close();
            test.done();
          })
        })
      })
    });
  });
  // DOC_END
}

/**
 * @ignore
 * @api private
 */
exports['Should correctly execute count on cursor'] = function(configuration, test) {
  var docs = [];

  for(var i = 0; i < 1000; i++) {
    var d = new Date().getTime() + i*1000;
    docs[i] = {'a':i, createdAt:new Date(d)};
  }

  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    // Create collection
    db.createCollection('Should_correctly_execute_count_on_cursor', function(err, collection) {
      test.equal(null, err);

      // insert all docs
      collection.insert(docs, {w:1}, function(err, result) {
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

/**
 * @ignore
 * @api private
 */
exports['should be able to stream documents'] = function(configuration, test) {
  var docs = [];

  for (var i = 0; i < 1000; i++) {
    docs[i] = { a: i+1 };
  }

  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    // Create collection
    db.createCollection('Should_be_able_to_stream_documents', function(err, collection) {
      test.equal(null, err);

      // insert all docs
      collection.insert(docs, {w:1}, function(err, result) {
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
              process.nextTick(function() {
                test.equal(false, stream.paused);
                resumed++;
              })
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
          db.close();
          test.done();
        }
      });
    });
  });
}

/**
 * @ignore
 * @api private
 */
exports['immediately destroying a stream prevents the query from executing'] = function(configuration, test) {
  var i = 0
    , docs = [{ b: 2 }, { b: 3 }]
    , doneCalled = 0

  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.createCollection('immediately_destroying_a_stream_prevents_the_query_from_executing', function(err, collection) {
      test.equal(null, err);

      // insert all docs
      collection.insert(docs, {w:1}, function(err, result) {
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
          db.close();
          test.done();
        }
      });
    });
  });
}

/**
 * @ignore
 * @api private
 */
exports['destroying a stream stops it'] = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    test.equal(null, err);

    db.createCollection('destroying_a_stream_stops_it', function(err, collection) {
      test.equal(null, err);

      var docs = [];
      for (var ii = 0; ii < 10; ++ii) docs.push({ b: ii+1 });

      // insert all docs
      collection.insert(docs, {w:1}, function(err, result) {
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
            db.close();
            test.done();
          }, 150)
        }
      });
    });
  });
}

/**
 * @ignore
 * @api private
 */
exports['cursor stream errors'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  requires: {serverType: 'Server'},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var client = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});
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
              test.equal(1, closed);
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
exports['cursor stream pipe']= function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
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

        var stream = collection.find().stream({transform: function(doc) { return JSON.stringify(doc); }});
        stream.pipe(out);
        // Wait for output stream to close
        out.on('close', done);

        function done (err) {
          // Object.prototype.toString = toString;
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
      });
    });
  });
}

/**
 * A simple example showing the count function of the cursor.
 *
 * @_class cursor
 * @_function count
 * @ignore
 */
exports.shouldCorrectlyUseCursorCountFunction = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});

  // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
  // DOC_START
  // Establish connection to db
  db.open(function(err, db) {

    // Creat collection
    db.createCollection('cursor_count_collection', function(err, collection) {
      test.equal(null, err);

      // Insert some docs
      collection.insert([{a:1}, {a:2}], {w:1}, function(err, docs) {
        test.equal(null, err);

        // Do a find and get the cursor count
        collection.find().count(function(err, count) {
          test.equal(null, err);
          test.equal(2, count);

          db.close();
          test.done();
        })
      });
    });
  });
  // DOC_END
}

/**
 * A simple example showing the use of sort on the cursor.
 *
 * @_class cursor
 * @_function sort
 * @ignore
 */
exports.shouldCorrectlyPeformSimpleSorts = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});

  // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
  // DOC_START
  // Establish connection to db
  db.open(function(err, db) {

    // Create a collection
    db.createCollection('simple_sort_collection', function(err, collection) {
      test.equal(null, err);

      // Insert some documents we can sort on
      collection.insert([{a:1}, {a:2}, {a:3}], {w:1}, function(err, docs) {
        test.equal(null, err);

        // Do normal ascending sort
        collection.find().sort([['a', 1]]).nextObject(function(err, item) {
          test.equal(null, err);
          test.equal(1, item.a);

          // Do normal descending sort
          collection.find().sort([['a', -1]]).nextObject(function(err, item) {
            test.equal(null, err);
            test.equal(3, item.a);

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
 * A simple example showing the use of limit on the cursor
 *
 * @_class cursor
 * @_function limit
 * @ignore
 */
exports.shouldCorrectlyPeformLimitOnCursor = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});

  // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
  // DOC_START
  // Establish connection to db
  db.open(function(err, db) {

    // Create a collection
    db.createCollection('simple_limit_collection', function(err, collection) {
      test.equal(null, err);

      // Insert some documents we can sort on
      collection.insert([{a:1}, {a:2}, {a:3}], {w:1}, function(err, docs) {
        test.equal(null, err);

        // Limit to only one document returned
        collection.find().limit(1).toArray(function(err, items) {
          test.equal(null, err);
          test.equal(1, items.length);

          db.close();
          test.done();
        });
      });
    });
  });
  // DOC_END
}

/**
 * A simple example showing the use of skip on the cursor
 *
 * @_class cursor
 * @_function skip
 * @ignore
 */
exports.shouldCorrectlyPeformSkipOnCursor = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});

  // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
  // DOC_START
  // Establish connection to db
  db.open(function(err, db) {

    // Create a collection
    db.createCollection('simple_skip_collection', function(err, collection) {
      test.equal(null, err);

      // Insert some documents we can sort on
      collection.insert([{a:1}, {a:2}, {a:3}], {w:1}, function(err, docs) {
        test.equal(null, err);

        // Skip one document
        collection.find().skip(1).nextObject(function(err, item) {
          test.equal(null, err);
          test.equal(2, item.a);

          db.close();
          test.done();
        });
      });
    });
  });
  // DOC_END
}

/**
 * A simple example showing the use of batchSize on the cursor, batchSize only regulates how many
 * documents are returned for each batch using the getMoreCommand against the MongoDB server
 *
 * @_class cursor
 * @_function batchSize
 * @ignore
 */
exports.shouldCorrectlyPeformBatchSizeOnCursor = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});

  // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
  // DOC_START
  // Establish connection to db
  db.open(function(err, db) {

    // Create a collection
    db.createCollection('simple_batch_size_collection', function(err, collection) {
      test.equal(null, err);

      // Insert some documents we can sort on
      collection.insert([{a:1}, {a:2}, {a:3}], {w:1}, function(err, docs) {
        test.equal(null, err);

        // Do normal ascending sort
        collection.find().batchSize(1).nextObject(function(err, item) {
          test.equal(null, err);
          test.equal(1, item.a);

          db.close();
          test.done();
        });
      });
    });
  });
  // DOC_END
}

/**
 * A simple example showing the use of nextObject.
 *
 * @_class cursor
 * @_function nextObject
 * @ignore
 */
exports.shouldCorrectlyPeformNextObjectOnCursor = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});

  // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
  // DOC_START
  // Establish connection to db
  db.open(function(err, db) {

    // Create a collection
    db.createCollection('simple_next_object_collection', function(err, collection) {
      test.equal(null, err);

      // Insert some documents we can sort on
      collection.insert([{a:1}, {a:2}, {a:3}], {w:1}, function(err, docs) {
        test.equal(null, err);

        // Do normal ascending sort
        collection.find().nextObject(function(err, item) {
          test.equal(null, err);
          test.equal(1, item.a);

          db.close();
          test.done();
        });
      });
    });
  });
  // DOC_END
}

/**
 * A simple example showing the use of the cursor explain function.
 *
 * @_class cursor
 * @_function explain
 * @ignore
 */
exports.shouldCorrectlyPeformSimpleExplainCursor = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});

  // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
  // DOC_START
  // Establish connection to db
  db.open(function(err, db) {

    // Create a collection
    db.createCollection('simple_explain_collection', function(err, collection) {
      test.equal(null, err);

      // Insert some documents we can sort on
      collection.insert([{a:1}, {a:2}, {a:3}], {w:1}, function(err, docs) {
        test.equal(null, err);

        // Do normal ascending sort
        collection.find().explain(function(err, explaination) {
          test.equal(null, err);

          db.close();
          test.done();
        });
      });
    });
  });
  // DOC_END
}

/**
 * A simple example showing the use of the cursor stream function.
 *
 * @_class cursor
 * @_function stream
 * @ignore
 */
exports.shouldStreamDocumentsUsingTheStreamFunction = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});

  // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
  // DOC_START
  // Establish connection to db
  db.open(function(err, db) {

    // Create a lot of documents to insert
    var docs = []
    for(var i = 0; i < 100; i++) {
      docs.push({'a':i})
    }

    // Create a collection
    db.createCollection('test_stream_function', function(err, collection) {
      test.equal(null, err);

      // Insert documents into collection
      collection.insert(docs, {w:1}, function(err, ids) {
        // Peform a find to get a cursor
        var stream = collection.find().stream();

        // Execute find on all the documents
        stream.on('close', function() {
          db.close();
          test.done();
        });

        stream.on('data', function(data) {
          test.ok(data != null);
        });
      });
    });
  });
  // DOC_END
}

/**
 * A simple example showing the use of the cursor close function.
 *
 * @_class cursor
 * @_function isClosed
 * @ignore
 */
exports.shouldStreamDocumentsUsingTheIsCloseFunction = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});

  // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
  // DOC_START
  // Establish connection to db
  db.open(function(err, db) {

    // Create a lot of documents to insert
    var docs = []
    for(var i = 0; i < 100; i++) {
      docs.push({'a':i})
    }

    // Create a collection
    db.createCollection('test_is_close_function_on_cursor', function(err, collection) {
      test.equal(null, err);

      // Insert documents into collection
      collection.insert(docs, {w:1}, function(err, ids) {
        // Peform a find to get a cursor
        var cursor = collection.find();

        // Fetch the first object
        cursor.nextObject(function(err, object) {
          test.equal(null, err);

          // Close the cursor, this is the same as reseting the query
          cursor.close(function(err, result) {
            test.equal(null, err);
            test.equal(true, cursor.isClosed());

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
exports.shouldCloseDeadTailableCursors = function(configuration, test) {
  // http://www.mongodb.org/display/DOCS/Tailable+Cursors
  var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});

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
          test.equal(null, err);
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

/**
 * @ignore
 */
exports.shouldAwaitData = function(configuration, test) {
  // http://www.mongodb.org/display/DOCS/Tailable+Cursors
  var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});

  db.open(function(err, db) {
    var options = { capped: true, size: 8};
    db.createCollection('should_await_data', options, function(err, collection) {
      collection.insert({a:1}, {w:1}, function(err, result) {
        // Create cursor with awaitdata, and timeout after the period specified
        collection.find({}, {tailable:true, awaitdata:true, numberOfRetries:1}).each(function(err, result) {
          if(err != null) {
            db.close();
            test.done();
          }
        });
      });
    });
  })
}

/**
 * @ignore
 */
exports.shouldCorrectExecuteExplainHonoringLimit = function(configuration, test) {
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

  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    // Insert all the docs
    var collection = db.collection('shouldCorrectExecuteExplainHonoringLimit');
    collection.insert(docs, {w:1}, function(err, result) {
      test.equal(null, err);

      collection.ensureIndex({_keywords:1}, {w:1}, function(err, result) {
        test.equal(null, err);

        // collection.find({_keywords:'red'},{}).limit(10).explain(function(err, result) {
        collection.find({_keywords:'red'}, {}, {explain:true}).limit(10).toArray(function(err, result) {
          test.equal(10, result[0].n);
          test.equal(10, result[0].nscanned);

          collection.find({_keywords:'red'},{}).limit(10).explain(function(err, result) {
            test.equal(10, result.n);
            test.equal(10, result.nscanned);
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
exports.shouldCorrectlyPerformResumeOnCursorStreamWithNoDuplicates = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});

  // Establish connection to db
  db.open(function(err, db) {

    // Create a lot of documents to insert
    var dup_check = {};
    var docs = [];
    for(var i = 0; i < 100; i++) {
      docs.push({'a':i})
    }

    // Create a collection
    db.createCollection('shouldCorrectlyPerformResumeOnCursorStreamWithNoDuplicates', function(err, collection) {
      test.equal(null, err);

      // Insert documents into collection
      collection.insert(docs, {w:1}, function(err, ids) {
        // Peform a find to get a cursor
        var stream = collection.find().stream();
        stream.pause();
        stream.resume();
        stream.on("data", function(item) {
          // console.log(item)
          // var key = item._id.toHexString();
          // test.ok(dup_check[key] == null);
          // dup_check[key] = true;
        });

        stream.on("end", function() {
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
exports.shouldFailToSetReadPreferenceOnCursor = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});

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

// /**
//  * @ignore
//  */
// exports.shouldCorrectlyFailTailedCursor = function(configuration, test) {
//   var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});

//   // Establish connection to db
//   db.open(function(err, db) {
//     db.createCollection("capped_collect_killed_server_test", {capped:true, size:100000}, function(err, collection) {
//       test.equal(null, err);
//       test.ok(collection != null);
//       var error_ok = false;
//       var data_ok = false;

//       var stream = collection.find({}, {tailable:true}).stream();
//       stream.on("data", function(data) {
//         data_ok = true;      
//       });

//       stream.on("error", function(data) {
//         error_ok = true;
//       });

//       stream.on("close", function(data) {        
//         serverManager.start(false, function() {
//           test.equal(true, data_ok);
//           test.equal(true, error_ok);

//           db.close();
//           test.done()                
//         });
//       });

//       var docs = [];
//       for(var i = 0; i < 100; i++) docs.push({a:1, b:"hhhhhhhhhhhhhhhhhhhhhhhhhh"});
//       collection.insert(docs, {w:1}, function(err, result) {
//         test.equal(null, err);
//         serverManager.killAll(function(err, result) {});
//       });
//     });
//   });
// }

/**
 * @ignore
 * @api private
 */
exports.shouldNotFailDueToStackOverflowEach = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.createCollection('shouldNotFailDueToStackOverflowEach', function(err, collection) {
      var docs = [];
      var total = 0;
      for(var i = 0; i < 30000; i++) docs.push({a:i});

      collection.insert(docs, {w:1}, function(err, ids) {
        var s = new Date().getTime();

        collection.find({}).each(function(err, item) {
          if(item == null) {
            var e = new Date().getTime();
            
            test.equal(30000, total);
            db.close();
            test.done();
          }

          total++;
        })
      });
    });
  });
}

/**
 * @ignore
 * @api private
 */
exports.shouldNotFailDueToStackOverflowToArray = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.createCollection('shouldNotFailDueToStackOverflowToArray', function(err, collection) {
      var docs = [];
      var total = 0;
      var s = new Date().getTime();
      for(var i = 0; i < 30000; i++) docs.push({a:i});

      collection.insert(docs, {w:1}, function(err, ids) {
        var s = new Date().getTime();

        collection.find({}).toArray(function(err, items) {
          var e = new Date().getTime();
          // console.log("================== total time :: " + (e - s));

          test.equal(30000, items.length);
          db.close();
          test.done();
        })
      });
    });
  });
}

/**
 * @ignore
 * @api private
 */
exports.shouldCorrectlySkipAndLimit = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    var collection = db.collection('shouldCorrectlySkipAndLimit')
    var docs = [];
    for(var i = 0; i < 100; i++) docs.push({a:i, OrderNumber:i});

    collection.insert(docs, {w:1}, function(err, ids) {

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

/**
 * @ignore
 * @api private
 */
exports.shouldFailToTailANormalCollection = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    var collection = db.collection('shouldFailToTailANormalCollection')
    var docs = [];
    for(var i = 0; i < 100; i++) docs.push({a:i, OrderNumber:i});

    collection.insert(docs, {w:1}, function(err, ids) {
      collection.find({}, {tailable:true}).each(function(err, doc) {
        test.ok(err instanceof Error);
        db.close();
        test.done();
      });
    });
  });
}

/**
 * A simple example showing the use of the cursor close function.
 *
 * @_class cursor
 * @_function close
 * @ignore
 */
exports.shouldStreamDocumentsUsingTheCloseFunction = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});

  // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
  // DOC_START
  // Establish connection to db
  db.open(function(err, db) {

    // Create a lot of documents to insert
    var docs = []
    for(var i = 0; i < 100; i++) {
      docs.push({'a':i})
    }

    // Create a collection
    db.createCollection('test_close_function_on_cursor', function(err, collection) {
      test.equal(null, err);

      // Insert documents into collection
      collection.insert(docs, {w:1}, function(err, ids) {
        // Peform a find to get a cursor
        var cursor = collection.find();

        // Fetch the first object
        cursor.nextObject(function(err, object) {
          test.equal(null, err);

          // Close the cursor, this is the same as reseting the query
          cursor.close(function(err, result) {
            test.equal(null, err);

            db.close();
            test.done();
          });
        });
      });
    });
  });
  // DOC_END
}

// /**
//  * @ignore
//  */
// exports.shouldCorrectlyHandleThrownErrorInCursorNext = function(configuration, test) {
//   var db = configuration.newDbInstance({w:1}, {poolSize:1});
//   var domain = require('domain');
//   var d = domain.create();
//   d.on('error', function(err) {
//     test.done()
//   })

//   d.run(function() {
//     db.open(function(err, db) {
//       var collection = db.collection('shouldCorrectlyHandleThrownErrorInCursorNext');
//       collection.insert([{a:1, b:2}], function(err, result) {
//         test.equal(null, err);

//         collection.find().nextObject(function(err, doc) {
//           dfdsfdfds
//         });
//       });
//     });
//   })
// }

// /**
//  * @ignore
//  * @api private
//  */
// exports.shouldNotHangOnTailableCursor = function(configuration, test) {
//   // var client = configuration.db();
//   var docs = [];
//   var totaldocs = 2000;
//   for(var i = 0; i < totaldocs; i++) docs.push({a:i, OrderNumber:i});
//   var options = { capped: true, size: (1024 * 1024 * 16) };
//   var index = 0;

//   // this.newDbInstance = function(db_options, server_options) {
//   var client = configuration.newDbInstance({w:1}, {auto_reconnect:true});

//   client.open(function(err, client) {
//     client.createCollection('shouldNotHangOnTailableCursor', options, function(err, collection) {
//       collection.insert(docs, {w:1}, function(err, ids) {    
//         var cursor = collection.find({}, {tailable:true});
//         cursor.each(function(err, doc) {
//           index += 1;

//           if(err) {            
//             client.close();
            
//             // Ensure we have a server up and running
//             return configuration.start(function() {
//               test.done();
//             });
//           } else if(index == totaldocs) {
//             test.ok(false);
//           }

//           if(index == 10) {
//             configuration.restartNoEnsureUp(function(err) {}); 
//           }
//         });
//       });
//     });
//   });
// }