var mongodb = process.env['TEST_NATIVE'] != null ? require('../lib/mongodb').native() : require('../lib/mongodb').pure();
var useSSL = process.env['USE_SSL'] != null ? true : false;

var testCase = require('../deps/nodeunit').testCase,
  debug = require('util').debug,
  inspect = require('util').inspect,
  nodeunit = require('../deps/nodeunit'),
  gleak = require('../dev/tools/gleak'),
  ObjectID = require('../lib/mongodb/bson/objectid').ObjectID,
  Code = require('../lib/mongodb/bson/code').Code,
  Db = mongodb.Db,
  Cursor = mongodb.Cursor,
  Collection = mongodb.Collection,
  Server = mongodb.Server;

var MONGODB = 'integration_tests';
var native_parser = (process.env['TEST_NATIVE'] != null);
var client = null;

/**
 * Retrieve the server information for the current
 * instance of the db client
 * 
 * @ignore
 */
exports.setUp = function(callback) {
  var self = exports;  
  client = new Db(MONGODB, new Server("127.0.0.1", 27017, {auto_reconnect: true, poolSize: 4, ssl:useSSL}), {native_parser: (process.env['TEST_NATIVE'] != null)});
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
 * A whole lot of different wayt to execute the group command
 *
 * @_class collection
 * @_function group
 */
exports.shouldCorrectlyExecuteGroupFunction = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
    {auto_reconnect: false, poolSize: 4, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {

    // Create a test collection
    db.createCollection('test_group', function(err, collection) {

      // Peform a simple group by on an empty collection
      collection.group([], {}, {"count":0}, "function (obj, prev) { prev.count++; }", function(err, results) {
        test.deepEqual([], results);

        // Trigger some inserts on the collection
        collection.insert([{'a':2}, {'b':5}, {'a':1}], {safe:true}, function(err, ids) {
          
          // Perform a group count
          collection.group([], {}, {"count":0}, "function (obj, prev) { prev.count++; }"
            , function(err, results) {
            test.equal(3, results[0].count);

            // Pefrom a group count using the eval method
            collection.group([], {}, {"count":0}, "function (obj, prev) { prev.count++; }"
              , false, function(err, results) {
              test.equal(3, results[0].count);

              // Group with a conditional
              collection.group([], {'a':{'$gt':1}}, {"count":0}, "function (obj, prev) { prev.count++; }"
                , function(err, results) {
                // Results
                test.equal(1, results[0].count);

                // Group with a conditional using the EVAL method
                collection.group([], {'a':{'$gt':1}}, {"count":0}, "function (obj, prev) { prev.count++; }"
                  , false, function(err, results) {
                  // Results
                  test.equal(1, results[0].count);

                  // Insert some more test data
                  collection.insert([{'a':2}, {'b':3}], {safe:true}, function(err, ids) {
                    
                    // Do a Group by field a
                    collection.group(['a'], {}, {"count":0}, "function (obj, prev) { prev.count++; }"
                      , function(err, results) {
                      // Results                        
                      test.equal(2, results[0].a);
                      test.equal(2, results[0].count);
                      test.equal(null, results[1].a);
                      test.equal(2, results[1].count);
                      test.equal(1, results[2].a);
                      test.equal(1, results[2].count);
                      
                      // Do a Group by field a
                      collection.group({'a':true}, {}, {"count":0}, function (obj, prev) { prev.count++; }
                        , true, function(err, results) {
                        // Results                        
                        test.equal(2, results[0].a);
                        test.equal(2, results[0].count);
                        test.equal(null, results[1].a);
                        test.equal(2, results[1].count);
                        test.equal(1, results[2].a);
                        test.equal(1, results[2].count);

                        // Correctly handle illegal function
                        collection.group([], {}, {}, "5 ++ 5", function(err, results) {
                          test.ok(err instanceof Error);
                          test.ok(err.message != null);
                        
                          // Use a function to select the keys used to group by
                          var keyf = function(doc) { return {a: doc.a}; };
                          collection.group(keyf, {a: {$gt: 0}}, {"count": 0, "value": 0}
                            , function(obj, prev) { prev.count++; prev.value += obj.a; }, true, function(err, results) {
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
                              test.ok(err instanceof Error);
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
}

/**
* @ignore
*/
exports.shouldCorrectlyExecuteGroupFunctionWithFinalizeFunction = function(test) {
  client.createCollection('test_group2', function(err, collection) {
    collection.group([], {}, {"count":0}, "function (obj, prev) { prev.count++; }", true, function(err, results) {
      test.deepEqual([], results);

      // Trigger some inserts
      collection.insert([{'a':2}, {'b':5, 'a':0}, {'a':1}, {'c':2, 'a':0}], {safe:true}, function(err, ids) {
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
              test.done();
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
exports.shouldPerformSimpleMapReduceFunctions = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
    {auto_reconnect: false, poolSize: 4, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {
    
    // Create a test collection
    db.createCollection('test_map_reduce_functions', function(err, collection) {
      
      // Insert some documents to perform map reduce over
      collection.insert([{'user_id':1}, {'user_id':2}], {safe:true}, function(err, r) {

        // Map function
        var map = function() { emit(this.user_id, 1); };
        // Reduce function
        var reduce = function(k,vals) { return 1; };

        // Peform the map reduce
        collection.mapReduce(map, reduce, function(err, collection) {
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
 * A simple map reduce example using the inline output type on MongoDB > 1.7.6
 *
 * @_class collection
 * @_function mapReduce
 */
exports.shouldPerformMapReduceFunctionInline = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
    {auto_reconnect: false, poolSize: 4, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {
    
    // Parse version of server if available
    db.admin().serverInfo(function(err, result){
      
      // Only run if the MongoDB version is higher than 1.7.6
      if(parseInt((result.version.replace(/\./g, ''))) >= 176) {
        
        // Create a test collection
        db.createCollection('test_map_reduce_functions_inline', function(err, collection) {
          
          // Insert some test documents
          collection.insert([{'user_id':1}, {'user_id':2}], {safe:true}, function(err, r) {

            // Map function
            var map = function() { emit(this.user_id, 1); };
            // Reduce function
            var reduce = function(k,vals) { return 1; };

            // Execute map reduce and return results inline
            collection.mapReduce(map, reduce, {out : {inline: 1}}, function(err, results) {
              test.equal(2, results.length);
              
              db.close();
              test.done();
            });          
          });
        });      
      } else {
        test.done();
      }
    });
  });
}

/**
* Mapreduce different test with a provided scope containing a javascript function.
*
* @_class collection
* @_function mapReduce
*/
exports.shouldPerformMapReduceInContext = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
    {auto_reconnect: false, poolSize: 4, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {
    
    // Create a test collection
    client.createCollection('test_map_reduce_functions_scope', function(err, collection) {

      // Insert some test documents
      collection.insert([{'user_id':1, 'timestamp':new Date()}
        , {'user_id':2, 'timestamp':new Date()}], {safe:true}, function(err, r) {
        
        // Map function
        var map = function(){
            emit(test(this.timestamp.getYear()), 1);
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
        collection.mapReduce(map, reduce, {scope:{test:new Code(t.toString())}
          , out: {replace:'replacethiscollection'}}, function(err, collection) {

          // Find all entries in the map-reduce collection
          collection.find().toArray(function(err, results) {
            test.equal(2, results[0].value)
            
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
exports.shouldPerformMapReduceWithStringFunctions = function(test) {
  client.createCollection('test_map_reduce', function(err, collection) {
    collection.insert([{'user_id':1}, {'user_id':2}], {safe:true}, function(err, r) {
      // String functions
      var map = "function() { emit(this.user_id, 1); }";
      var reduce = "function(k,vals) { return 1; }";

      collection.mapReduce(map, reduce, function(err, collection) {
        collection.findOne({'_id':1}, function(err, result) {
          test.equal(1, result.value);
        });

        collection.findOne({'_id':2}, function(err, result) {
          test.equal(1, result.value);
          test.done();
        });
      });        
    });  
  });
}

/**
* @ignore
*/
exports.shouldPerformMapReduceWithParametersBeingFunctions = function(test) {
  client.createCollection('test_map_reduce_with_functions_as_arguments', function(err, collection) {
    collection.insert([{'user_id':1}, {'user_id':2}], {safe:true}, function(err, r) {
      // String functions
      var map = function() { emit(this.user_id, 1); };
      var reduce = function(k,vals) { return 1; };

      collection.mapReduce(map, reduce, function(err, collection) {
        collection.findOne({'_id':1}, function(err, result) {
          test.equal(1, result.value);
        });
        collection.findOne({'_id':2}, function(err, result) {
          test.equal(1, result.value);
          test.done();
        });
      });        
    });  
  });
}

/**
* @ignore
*/
exports.shouldPerformMapReduceWithCodeObjects = function(test) {
  client.createCollection('test_map_reduce_with_code_objects', function(err, collection) {
    collection.insert([{'user_id':1}, {'user_id':2}], {safe:true}, function(err, r) {
      // String functions
      var map = new Code("function() { emit(this.user_id, 1); }");
      var reduce = new Code("function(k,vals) { return 1; }");

      collection.mapReduce(map, reduce, function(err, collection) {
        collection.findOne({'_id':1}, function(err, result) {
          test.equal(1, result.value);
        });
        collection.findOne({'_id':2}, function(err, result) {
          test.equal(1, result.value);
          test.done();
        });
      });        
    });  
  });
}

/**
* @ignore
*/
exports.shouldPerformMapReduceWithOptions = function(test) {
  client.createCollection('test_map_reduce_with_options', function(err, collection) {
    collection.insert([{'user_id':1}, {'user_id':2}, {'user_id':3}], {safe:true}, function(err, r) {
      // String functions
      var map = new Code("function() { emit(this.user_id, 1); }");
      var reduce = new Code("function(k,vals) { return 1; }");

      collection.mapReduce(map, reduce, {'query': {'user_id':{'$gt':1}}}, function(err, collection) {
        collection.count(function(err, count) {
          test.equal(2, count);

          collection.findOne({'_id':2}, function(err, result) {
            test.equal(1, result.value);
          });
          collection.findOne({'_id':3}, function(err, result) {
            test.equal(1, result.value);
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
exports.shouldHandleMapReduceErrors = function(test) {
  client.createCollection('test_map_reduce_error', function(err, collection) {
    collection.insert([{'user_id':1}, {'user_id':2}, {'user_id':3}], {safe:true}, function(err, r) {
      // String functions
      var map = new Code("function() { throw 'error'; }");
      var reduce = new Code("function(k,vals) { throw 'error'; }");

      collection.mapReduce(map, reduce, {'query': {'user_id':{'$gt':1}}}, function(err, r) {
        test.ok(err != null);
        test.done();
      });        
    });  
  });
}

/**
* @ignore
*/
exports.shouldCorrectlyReturnNestedKeys = function(test) {
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
  client.createCollection('data', function(err, collection) {
    collection.insert({
        data: {
          lastname:'smith',
          date:new Date()
        }
      }, {safe:true}, function(err, result) {
      
      // Execute the group 
      collection.group(keys, condition, initial, reduce, true, function(err, r) {
        test.equal(1, r[0].count)
        test.equal('smith', r[0]['data.lastname']);    
        test.done();
      });
    });      
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