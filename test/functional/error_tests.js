"use strict";

exports.shouldFailInsertDueToUniqueIndex = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      var collection = db.collection('test_failing_insert_due_to_unique_index');
      collection.ensureIndex([['a', 1 ]], {unique:true, w:1}, function(err, indexName) {
        test.equal(null, err);

        collection.insert({a:2}, {w: 1}, function(err, r) {
          test.ok(err == null);

          collection.insert({a:2}, {w: 1}, function(err, r) {
            test.ok(err.code != null);
            test.ok(err != null);
            db.close();
            test.done();
          });
        });
      });
    });
  }
}

// Test the error reporting functionality
exports.shouldFailInsertDueToUniqueIndexStrict = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      db.dropCollection('test_failing_insert_due_to_unique_index_strict', function(err, r) {
        db.createCollection('test_failing_insert_due_to_unique_index_strict', function(err, r) {
          db.collection('test_failing_insert_due_to_unique_index_strict', function(err, collection) {
            collection.ensureIndex([['a', 1 ]], {unique:true, w:1}, function(err, indexName) {
              collection.insert({a:2}, {w:1}, function(err, r) {
                test.ok(err == null);

                collection.insert({a:2}, {w:1}, function(err, r) {
                  test.ok(err != null);
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

exports['mixing included and excluded fields should return an error object with message'] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      var c = db.collection('test_error_object_should_include_message');
      c.insert({a:2, b: 5}, {w:1}, function(err, r) {
        test.equal(err, null);

        c.findOne({a:2}, {fields: {a:1, b:0}}, function(err) {
          test.ok(err != null);
          db.close();
          test.done();
        });
      });
    });
  }
}

exports['should handle error throw in user callback'] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    process.once("uncaughtException", function(err) {
      db.close();
      test.done();
    })

    db.open(function(err, client) {
      var c = db.collection('test_error_object_should_include_message');
      c.findOne({}, function() {
        ggg
      })
    });
  }
}

exports['Should handle uncaught error correctly'] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    process.once("uncaughtException", function(err) {
      db.close();
      test.done();
    })

    db.open(function(err, db) {
      testdfdma();
      test.ok(false);
    });
  }
}

exports['Should handle throw error in db operation correctly'] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      process.once("uncaughtException", function(err) {
        db.close();
        test.done();
      })

      db.collection('t').findOne(function() {
        testdfdma();
      });
    });
  }
}

exports['Should handle MongoClient uncaught error correctly'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { node: ">0.10.0", topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    var domain = require('domain');
    var d = domain.create();
    d.on('error', function(err) {
      d.dispose();
      test.done()
    })

    d.run(function() {
      MongoClient.connect(configuration.url(), function(err, db) {
        testdfdma();
        test.ok(false);
      });
    })
  }
}

exports['Should handle MongoClient throw error in db operation correctly'] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var MongoClient = configuration.require.MongoClient;
    MongoClient.connect(configuration.url(), {server: {sslValidate:false}}, function(err, db) {
      process.once("uncaughtException", function(err) {
        db.close();
        test.done();
      })

      db.collection('t').findOne(function() {
        testdfdma();
      });
    });
  }
}

exports['Should handle Error thrown during operation'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { node: ">0.10.0", topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = null;

    process.once("uncaughtException", function(err) {
      db.close();
      test.done();
    });

    var MongoClient = configuration.require.MongoClient;
    MongoClient.connect(configuration.url()
      , {server: {sslValidate:false}, replset: {sslValidate:false}, mongos: {sslValidate:false}}
      , function(err, _db) {
      test.equal(null, err);
      db = _db;

      db.collection('throwerrorduringoperation').insert([{a:1}, {a:1}], function(err, result) {
        test.equal(null, err);

        // process.nextTick(function() {
          db.collection('throwerrorduringoperation').find().toArray(function(err, result) {
            // Throws error
            err = a;
          });
        // });
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyHandleThrownError = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('shouldCorrectlyHandleThrownError', function(err, r) {
        try {
          db.collection('shouldCorrectlyHandleThrownError', function(err, collection) {
            debug(someUndefinedVariable);
          });
        } catch (err) {
          test.ok(err != null);
          db.close();
          test.done();
        }
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyHandleThrownErrorInRename = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { node: ">0.10.0", topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    var domain = require('domain');
    var d = domain.create();
    d.on('error', function(err) {
      d.dispose();
      test.done();
    })

    d.run(function() {
      db.open(function(err, db) {
        // Execute code
        db.createCollection('shouldCorrectlyHandleThrownErrorInRename', function(err, r) {
          db.collection('shouldCorrectlyHandleThrownError', function(err, collection) {
            collection.rename("shouldCorrectlyHandleThrownErrorInRename2", function(err, result) {
              debug(someUndefinedVariable);
            })
          });
        });
      });
    })
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyHandleExceptionsInCursorNext = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1});

    process.once('uncaughtException', function(err) {
      test.ok(err != null);
      db.close();
      test.done();
    });

    db.open(function(err, db) {
      var col = db.collection('shouldCorrectlyHandleExceptionsInCursorNext');
      col.insert({a:1}, function(err, result) {
        col.find().nextObject(function(err, result) {
          boom
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyHandleExceptionsInCursorEach = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1});

    process.once('uncaughtException', function(err) {
      test.ok(err != null);
      db.close();
      test.done();
    });

    db.open(function(err, db) {
      var col = db.collection('shouldCorrectlyHandleExceptionsInCursorNext');
      col.insert({a:1}, function(err, result) {
        col.find().each(function(err, result) {
          boom
        });
      });
    });
  }
}
