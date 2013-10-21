/**
 * A whole lot of different wayt to execute the group command
 *
 * @_class collection
 * @_function group
 */
exports.shouldCorrectlyExecuteGroupFunction = function(configuration, test) {
  var Code = configuration.getMongoPackage().Code;
  var db = configuration.newDbInstance({w:0}, {poolSize:1});

  // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
  // DOC_START
  // Establish connection to db
  db.open(function(err, db) {

    // Create a test collection
    db.createCollection('test_group', function(err, collection) {

      // Peform a simple group by on an empty collection
      collection.group([], {}, {"count":0}, "function (obj, prev) { prev.count++; }", function(err, results) {
        test.deepEqual([], results);

        // Trigger some inserts on the collection
        collection.insert([{'a':2}, {'b':5}, {'a':1}], {w:1}, function(err, ids) {

          // Perform a group count
          collection.group([], {}, {"count":0}, "function (obj, prev) { prev.count++; }", function(err, results) {
            test.equal(3, results[0].count);

            // Pefrom a group count using the eval method
            collection.group([], {}, {"count":0}, "function (obj, prev) { prev.count++; }", false, function(err, results) {
              test.equal(3, results[0].count);

              // Group with a conditional
              collection.group([], {'a':{'$gt':1}}, {"count":0}, "function (obj, prev) { prev.count++; }", function(err, results) {
                // Results
                test.equal(1, results[0].count);

                // Group with a conditional using the EVAL method
                collection.group([], {'a':{'$gt':1}}, {"count":0}, "function (obj, prev) { prev.count++; }" , false, function(err, results) {
                  // Results
                  test.equal(1, results[0].count);

                  // Insert some more test data
                  collection.insert([{'a':2}, {'b':3}], {w:1}, function(err, ids) {

                    // Do a Group by field a
                    collection.group(['a'], {}, {"count":0}, "function (obj, prev) { prev.count++; }", function(err, results) {
                      // Results
                      test.equal(2, results[0].a);
                      test.equal(2, results[0].count);
                      test.equal(null, results[1].a);
                      test.equal(2, results[1].count);
                      test.equal(1, results[2].a);
                      test.equal(1, results[2].count);

                      // Do a Group by field a
                      collection.group({'a':true}, {}, {"count":0}, function (obj, prev) { prev.count++; }, true, function(err, results) {
                        // Results
                        test.equal(2, results[0].a);
                        test.equal(2, results[0].count);
                        test.equal(null, results[1].a);
                        test.equal(2, results[1].count);
                        test.equal(1, results[2].a);
                        test.equal(1, results[2].count);

                        // Correctly handle illegal function
                        collection.group([], {}, {}, "5 ++ 5", function(err, results) {
                          test.ok(err.message != null);

                          // Use a function to select the keys used to group by
                          var keyf = function(doc) { return {a: doc.a}; };
                          collection.group(keyf, {a: {$gt: 0}}, {"count": 0, "value": 0}, function(obj, prev) { prev.count++; prev.value += obj.a; }, true, function(err, results) {
                            // Results
                            results.sort(function(a, b) { return b.count - a.count; });
                            test.equal(2, results[0].count);
                            test.equal(2, results[0].a);
                            test.equal(4, results[0].value);
                            test.equal(1, results[1].count);
                            test.equal(1, results[1].a);
                            test.equal(1, results[1].value);

                            // Use a Code object to select the keys used to group by
                            var keyf = new Code(function(doc) { return {a: doc.a}; });
                            collection.group(keyf, {a: {$gt: 0}}, {"count": 0, "value": 0}, function(obj, prev) { prev.count++; prev.value += obj.a; }, true, function(err, results) {
                              // Results
                              results.sort(function(a, b) { return b.count - a.count; });
                              test.equal(2, results[0].count);
                              test.equal(2, results[0].a);
                              test.equal(4, results[0].value);
                              test.equal(1, results[1].count);
                              test.equal(1, results[1].a);
                              test.equal(1, results[1].value);

                              // Correctly handle illegal function when using the EVAL method
                              collection.group([], {}, {}, "5 ++ 5", false, function(err, results) {
                                test.ok(err.message != null);

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
  // DOC_END
}

/**
* @ignore
*/
exports.shouldCorrectlyExecuteGroupFunctionWithFinalizeFunction = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.createCollection('test_group2', function(err, collection) {
      collection.group([], {}, {"count":0}, "function (obj, prev) { prev.count++; }", true, function(err, results) {
        test.deepEqual([], results);

        // Trigger some inserts
        collection.insert([{'a':2}, {'b':5, 'a':0}, {'a':1}, {'c':2, 'a':0}], {w:1}, function(err, ids) {
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

/**
 * A simple map reduce example
 *
 * @_class collection
 * @_function mapReduce
 */
exports.shouldPerformSimpleMapReduceFunctions = function(configuration, test) {
  var db = configuration.newDbInstance({w:0}, {poolSize:1});

  // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
  // DOC_START
  // Establish connection to db
  db.open(function(err, db) {

    // Create a test collection
    db.createCollection('test_map_reduce_functions', function(err, collection) {

      // Insert some documents to perform map reduce over
      collection.insert([{'user_id':1}, {'user_id':2}], {w:1}, function(err, r) {

        // Map function
        var map = function() { emit(this.user_id, 1); };
        // Reduce function
        var reduce = function(k,vals) { return 1; };

        // Peform the map reduce
        collection.mapReduce(map, reduce, {out: {replace : 'tempCollection', readPreference : 'secondary'}}, function(err, collection) {
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
  // DOC_END
}

/**
 * A simple map reduce example using the inline output type on MongoDB > 1.7.6 returning the statistics
 *
 * @_class collection
 * @_function mapReduce
 */
exports.shouldPerformMapReduceFunctionInline = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  requires: {mongodb: ">1.7.6"},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:0}, {poolSize:1});

    // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
    // DOC_START
    // Establish connection to db
    db.open(function(err, db) {

      // Create a test collection
      db.createCollection('test_map_reduce_functions_inline', function(err, collection) {

        // Insert some test documents
        collection.insert([{'user_id':1}, {'user_id':2}], {w:1}, function(err, r) {

          // Map function
          var map = function() { emit(this.user_id, 1); };
          // Reduce function
          var reduce = function(k,vals) { return 1; };

          // Execute map reduce and return results inline
          collection.mapReduce(map, reduce, {out : {inline: 1}, verbose:true}, function(err, results, stats) {
            test.equal(2, results.length);
            test.ok(stats != null);

            collection.mapReduce(map, reduce, {out : {replace: 'mapreduce_integration_test'}, verbose:true}, function(err, results, stats) {
              test.ok(stats != null);
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
* Mapreduce different test with a provided scope containing a javascript function.
*
* @_class collection
* @_function mapReduce
*/
exports.shouldPerformMapReduceInContext = function(configuration, test) {
  var Code = configuration.getMongoPackage().Code;
  var db = configuration.newDbInstance({w:0}, {poolSize:1});

  // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
  // DOC_START
  // Establish connection to db
  db.open(function(err, db) {

    // Create a test collection
    db.createCollection('test_map_reduce_functions_scope', function(err, collection) {

      // Insert some test documents
      collection.insert([{'user_id':1, 'timestamp':new Date()}
        , {'user_id':2, 'timestamp':new Date()}], {w:1}, function(err, r) {

        // Map function
        var map = function(){
            emit(fn(this.timestamp.getYear()), 1);
        }

        // Reduce function
        var reduce = function(k, v){
            count = 0;
            for(i = 0; i < v.length; i++) {
                count += v[i];
            }
            return count;
        }

        // Javascript function available in the map reduce scope
        var t = function(val){ return val+1; }

        // Execute the map reduce with the custom scope
        var o = {};
        o.scope =  { fn: new Code(t.toString()) }
        o.out = { replace: 'replacethiscollection' }

        collection.mapReduce(map, reduce, o, function(err, outCollection) {
          test.equal(null, err);

          // Find all entries in the map-reduce collection
          outCollection.find().toArray(function(err, results) {
            test.equal(null, err);
            test.equal(2, results[0].value)

            // mapReduce with scope containing plain function
            var o = {};
            o.scope =  { fn: t }
            o.out = { replace: 'replacethiscollection' }

            collection.mapReduce(map, reduce, o, function(err, outCollection) {
              test.equal(null, err);

              // Find all entries in the map-reduce collection
              outCollection.find().toArray(function(err, results) {
                test.equal(2, results[0].value)
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
 * Mapreduce different test with a provided scope containing javascript objects with functions.
 *
 * @_class collection
 * @_function mapReduce
 */
exports.shouldPerformMapReduceInContextObjects = function(configuration, test) {
  var Code = configuration.getMongoPackage().Code;
  var db = configuration.newDbInstance({w:0}, {poolSize:1});

  // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
  // DOC_START
  // Establish connection to db
  db.open(function(err, db) {

    // Create a test collection
    db.createCollection('test_map_reduce_functions_scope_objects', function(err, collection) {

      // Insert some test documents
      collection.insert([{'user_id':1, 'timestamp':new Date()}
        , {'user_id':2, 'timestamp':new Date()}], {w:1}, function(err, r) {

        // Map function
        var map = function(){
          emit(obj.fn(this.timestamp.getYear()), 1);
        }

        // Reduce function
        var reduce = function(k, v){
          count = 0;
          for(i = 0; i < v.length; i++) {
            count += v[i];
          }
          return count;
        }

        // Javascript function available in the map reduce scope
        var t = function(val){ return val+1; }

        // Execute the map reduce with the custom scope containing objects
        var o = {};
        o.scope =  { obj: {fn: new Code(t.toString())} }
        o.out = { replace: 'replacethiscollection' }

        collection.mapReduce(map, reduce, o, function(err, outCollection) {
          test.equal(null, err);

          // Find all entries in the map-reduce collection
          outCollection.find().toArray(function(err, results) {
            test.equal(null, err);
            test.equal(2, results[0].value)

            // mapReduce with scope containing plain function
            var o = {};
            o.scope =  { obj: {fn: t} }
            o.out = { replace: 'replacethiscollection' }

            collection.mapReduce(map, reduce, o, function(err, outCollection) {
              test.equal(null, err);

              // Find all entries in the map-reduce collection
              outCollection.find().toArray(function(err, results) {
                test.equal(2, results[0].value)
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
* Mapreduce tests
* @ignore
*/
exports.shouldPerformMapReduceWithStringFunctions = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.createCollection('test_map_reduce', function(err, collection) {
      collection.insert([{'user_id':1}, {'user_id':2}], {w:1}, function(err, r) {
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

/**
* Mapreduce tests
* @ignore
*/
exports.shouldForceMapReduceError = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  requires: {mongodb: ">1.7.6"},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('test_map_reduce', function(err, collection) {
        collection.insert([{'user_id':1}, {'user_id':2}], {w:1}, function(err, r) {
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
exports.shouldPerformMapReduceWithParametersBeingFunctions = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.createCollection('test_map_reduce_with_functions_as_arguments', function(err, collection) {
      collection.insert([{'user_id':1}, {'user_id':2}], {w:1}, function(err, r) {
        // String functions
        var map = function() { emit(this.user_id, 1); };
        var reduce = function(k,vals) { return 1; };

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

/**
* @ignore
*/
exports.shouldPerformMapReduceWithCodeObjects = function(configuration, test) {
  var Code = configuration.getMongoPackage().Code;
  
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.createCollection('test_map_reduce_with_code_objects', function(err, collection) {
      collection.insert([{'user_id':1}, {'user_id':2}], {w:1}, function(err, r) {
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

/**
* @ignore
*/
exports.shouldPerformMapReduceWithOptions = function(configuration, test) {
  var Code = configuration.getMongoPackage().Code;

  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.createCollection('test_map_reduce_with_options', function(err, collection) {
      collection.insert([{'user_id':1}, {'user_id':2}, {'user_id':3}], {w:1}, function(err, r) {
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

/**
* @ignore
*/
exports.shouldHandleMapReduceErrors = function(configuration, test) {
  var Code = configuration.getMongoPackage().Code;

  var db = configuration.newDbInstance({w:1}, {poolSize:1});
  db.open(function(err, db) {
    db.createCollection('test_map_reduce_error', function(err, collection) {
      collection.insert([{'user_id':1}, {'user_id':2}, {'user_id':3}], {w:1}, function(err, r) {
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

/**
* @ignore
*/
exports.shouldSaveDataToDifferentDbFromMapreduce = function(configuration, test) {
  var db = configuration.newDbInstance({w:0}, {poolSize:1});

  // Establish connection to db
  db.open(function(err, db) {

    // Create a test collection
    db.createCollection('test_map_reduce_functions', function(err, collection) {

      // Insert some documents to perform map reduce over
      collection.insert([{'user_id':1}, {'user_id':2}], {w:1}, function(err, r) {

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

/**
* @ignore
*/
exports.shouldCorrectlyReturnNestedKeys = function(configuration, test) {
  var db = configuration.newDbInstance({w:1}, {poolSize:1});
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
        }, {w:1}, function(err, result) {

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