"use strict";

/**
* @ignore
*/
exports.shouldCorrectlyExecuteGroupFunctionWithFinalizeFunction = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('test_group2', function(err, collection) {
        collection.group([], {}, {"count":0}, "function (obj, prev) { prev.count++; }", true, function(err, results) {
          test.deepEqual([], results);

          // Trigger some inserts
          collection.insert([{'a':2}, {'b':5, 'a':0}, {'a':1}, {'c':2, 'a':0}], configuration.writeConcernMax(), function(err, ids) {
            collection.group([], {}, {count: 0, running_average: 0}
              , function (doc, out) {
                  out.count++;
                  out.running_average += doc.a;
                }
              , function(out) {
                  out.average = out.running_average / out.count;
                }, true, function(err, results) {
                  test.equal(3, results[0].running_average)
                  test.equal(0.75, results[0].average)
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
* Mapreduce tests
* @ignore
*/
exports.shouldPerformMapReduceWithStringFunctions = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('test_map_reduce', function(err, collection) {
        collection.insert([{'user_id':1}, {'user_id':2}], configuration.writeConcernMax(), function(err, r) {
          // String functions
          var map = "function() { emit(this.user_id, 1); }";
          var reduce = "function(k,vals) { return 1; }";

          collection.mapReduce(map, reduce, {out: {replace : 'tempCollection'}}, function(err, collection) {
            collection.findOne({'_id':1}, function(err, result) {
              test.equal(1, result.value);
            });

            collection.findOne({'_id':2}, function(err, result) {
              test.equal(1, result.value);
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
* Mapreduce tests
* @ignore
*/
exports.shouldForceMapReduceError = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { mongodb: ">1.7.6", topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('test_map_reduce', function(err, collection) {
        collection.insert([{'user_id':1}, {'user_id':2}], configuration.writeConcernMax(), function(err, r) {
          // String functions
          var map = "function() { emiddft(this.user_id, 1); }";
          var reduce = "function(k,vals) { return 1; }";

          collection.mapReduce(map, reduce, {out: {inline : 1}}, function(err, collection) {
            test.ok(err != null);
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
exports.shouldPerformMapReduceWithParametersBeingFunctions = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('test_map_reduce_with_functions_as_arguments', function(err, collection) {
        collection.insert([{'user_id':1}, {'user_id':2}], configuration.writeConcernMax(), function(err, r) {
          // String functions
          var map = function() { emit(this.user_id, 1); };
          var reduce = function(k,vals) { return 1; };

          collection.mapReduce(map, reduce, {out: {replace : 'tempCollection'}}, function(err, collection) {
            collection.findOne({'_id':1}, function(err, result) {
              test.equal(1, result.value);

              collection.findOne({'_id':2}, function(err, result) {
                test.equal(1, result.value);
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
exports.shouldPerformMapReduceWithCodeObjects = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var Code = configuration.require.Code;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('test_map_reduce_with_code_objects', function(err, collection) {
        collection.insert([{'user_id':1}, {'user_id':2}], configuration.writeConcernMax(), function(err, r) {
          // String functions
          var map = new Code("function() { emit(this.user_id, 1); }");
          var reduce = new Code("function(k,vals) { return 1; }");

          collection.mapReduce(map, reduce, {out: {replace : 'tempCollection'}}, function(err, collection) {
            collection.findOne({'_id':1}, function(err, result) {
              test.equal(1, result.value);
            });

            collection.findOne({'_id':2}, function(err, result) {
              test.equal(1, result.value);
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
exports.shouldPerformMapReduceWithOptions = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var Code = configuration.require.Code;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('test_map_reduce_with_options', function(err, collection) {
        collection.insert([{'user_id':1}, {'user_id':2}, {'user_id':3}], configuration.writeConcernMax(), function(err, r) {
          // String functions
          var map = new Code("function() { emit(this.user_id, 1); }");
          var reduce = new Code("function(k,vals) { return 1; }");

          collection.mapReduce(map, reduce, {out: {replace : 'tempCollection'}, 'query': {'user_id':{'$gt':1}}}, function(err, collection) {
            collection.count(function(err, count) {
              test.equal(2, count);

              collection.findOne({'_id':2}, function(err, result) {
                test.equal(1, result.value);
              });

              collection.findOne({'_id':3}, function(err, result) {
                test.equal(1, result.value);
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
exports.shouldHandleMapReduceErrors = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var Code = configuration.require.Code;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('test_map_reduce_error', function(err, collection) {
        collection.insert([{'user_id':1}, {'user_id':2}, {'user_id':3}], configuration.writeConcernMax(), function(err, r) {
          // String functions
          var map = new Code("function() { throw 'error'; }");
          var reduce = new Code("function(k,vals) { throw 'error'; }");

          collection.mapReduce(map, reduce, {out : {inline: 1}, 'query': {'user_id':{'$gt':1}}}, function(err, r) {
            test.ok(err != null);
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
exports.shouldSaveDataToDifferentDbFromMapreduce = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:0}, {poolSize:1});

    // Establish connection to db
    db.open(function(err, db) {

      // Create a test collection
      db.createCollection('test_map_reduce_functions', function(err, collection) {

        // Insert some documents to perform map reduce over
        collection.insert([{'user_id':1}, {'user_id':2}], configuration.writeConcernMax(), function(err, r) {

          // Map function
          var map = function() { emit(this.user_id, 1); };
          // Reduce function
          var reduce = function(k,vals) { return 1; };

          // Peform the map reduce
          collection.mapReduce(map, reduce, {out: {replace : 'tempCollection', db: "outputCollectionDb"}}, function(err, collection) {

            // Mapreduce returns the temporary collection with the results
            collection.findOne({'_id':1}, function(err, result) {
              test.equal(1, result.value);

              collection.findOne({'_id':2}, function(err, result) {
                test.equal(1, result.value);

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
exports.shouldCorrectlyReturnNestedKeys = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      var start = new Date().setTime(new Date().getTime() - 10000);
      var end = new Date().setTime(new Date().getTime() + 10000);

      var keys =  {
         "data.lastname": true
      };

      var condition = {
       "data.date": {
             $gte: start,
             $lte: end
         }
      };

      condition = {}

      var initial = {
         count : 0
      };

      var reduce = function(doc, output) {
        output.count++;
      }

      // Execute the group
      db.createCollection('data', function(err, collection) {
        collection.insert({
            data: {
              lastname:'smith',
              date:new Date()
            }
          }, configuration.writeConcernMax(), function(err, result) {

          // Execute the group
          collection.group(keys, condition, initial, reduce, true, function(err, r) {
            test.equal(1, r[0].count)
            test.equal('smith', r[0]['data.lastname']);
            db.close();
            test.done();
          });
        });
      });
    });
  }
}

/**
* Mapreduce tests
* @ignore
*/
exports.shouldPerformMapReduceWithScopeContainingFunction = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var util = {
      times_one_hundred: function(x) {return x * 100;}
    }
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('test_map_reduce', function(err, collection) {
        collection.insert([{'user_id':1}, {'user_id':2}], configuration.writeConcernMax(), function(err, r) {
          // String functions
          var map = "function() { emit(this.user_id, util.times_one_hundred(this.user_id)); }";
          var reduce = "function(k,vals) { return vals[0]; }";

          // Before MapReduce
          test.equal(200, util.times_one_hundred(2));

          collection.mapReduce(map, reduce, {scope: {util: util}, out: {replace : 'tempCollection'}}, function(err, collection) {

            // After MapReduce
            test.equal(200, util.times_one_hundred(2));

            collection.findOne({'_id':2}, function(err, result) {

              // During MapReduce
              test.equal(200, result.value);

              db.close();
              test.done();
            });
          });
        });
      });
    });
  }
}
