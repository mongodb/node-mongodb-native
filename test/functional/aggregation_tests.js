"use strict";

/**
 * Correctly call the aggregation framework using a pipeline in an Array.
 *
 * @example-class Collection
 * @example-method aggregate
 * @ignore
 */
exports.shouldCorrectlyExecuteSimpleAggregationPipelineUsingArray = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { mongodb:">2.1.0", topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },  
  
  // The actual test we wish to run
  test: function(configure, test) {
    var db = configure.newDbInstance({w:1}, {poolSize:1});

    // LINE var MongoClient = require('mongodb').MongoClient;
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.
    // BEGIN
    db.open(function(err, db) {
      // Some docs for insertion
      var docs = [{
          title : "this is my title", author : "bob", posted : new Date() ,
          pageViews : 5, tags : [ "fun" , "good" , "fun" ], other : { foo : 5 },
          comments : [
            { author :"joe", text : "this is cool" }, { author :"sam", text : "this is bad" }
          ]}];

      // Create a collection
      var collection = db.collection('shouldCorrectlyExecuteSimpleAggregationPipelineUsingArray');
      // Insert the docs
      collection.insert(docs, {w: 1}, function(err, result) {

        // Execute aggregate, notice the pipeline is expressed as an Array
        collection.aggregate([
            { $project : {
              author : 1,
              tags : 1
            }},
            { $unwind : "$tags" },
            { $group : {
              _id : {tags : "$tags"},
              authors : { $addToSet : "$author" }
            }}
          ], function(err, result) {
            test.equal(null, err);
            test.equal('good', result[0]._id.tags);
            test.deepEqual(['bob'], result[0].authors);
            test.equal('fun', result[1]._id.tags);
            test.deepEqual(['bob'], result[1].authors);

            db.close();
            test.done();
        });
      });
    });
    // END
  }
}

/**
 * Correctly call the aggregation framework using a pipeline expressed as an argument list.
 *
 * @example-class Collection
 * @example-method aggregate
 * @ignore
 */
exports.shouldFailWhenExecutingSimpleAggregationPipelineUsingArgumentsNotAnArray = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { mongodb: ">2.1.0", topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },  
  
  // The actual test we wish to run
  test: function(configure, test) {
    var db = configure.newDbInstance({w:1}, {poolSize:1});

    // LINE var MongoClient = require('mongodb').MongoClient;
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.
    // BEGIN
    db.open(function(err, db) {
      // Some docs for insertion
      var docs = [{
          title : "this is my title", author : "bob", posted : new Date() ,
          pageViews : 5, tags : [ "fun" , "good" , "fun" ], other : { foo : 5 },
          comments : [
            { author :"joe", text : "this is cool" }, { author :"sam", text : "this is bad" }
          ]}];

      // Create a collection
      var collection = db.collection('shouldCorrectlyExecuteSimpleAggregationPipelineUsingArguments');
      // Insert the docs
      collection.insert(docs, {w: 1}, function(err, result) {
        // Execute aggregate, notice the pipeline is expressed as function call parameters
        // instead of an Array.
        collection.aggregate(
            { $project : {
              author : 1,
              tags : 1
            }},
            { $unwind : "$tags" },
            { $group : {
              _id : {tags : "$tags"},
              authors : { $addToSet : "$author" }
            }}
          , function(err, result) {
            test.equal(null, err);
            test.equal('good', result[0]._id.tags);
            test.deepEqual(['bob'], result[0].authors);
            test.equal('fun', result[1]._id.tags);
            test.deepEqual(['bob'], result[1].authors);

            db.close();
            test.done();
        });
      });
    });
    // END
  }
}

/**
 * Correctly call the aggregation framework using a pipeline expressed as an argument list.
 *
 * @example-class Collection
 * @example-method aggregate
 * @ignore
 */
exports.shouldFailWhenExecutingSimpleAggregationPipelineUsingArgumentsUsingSingleObject = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { mongodb: ">2.1.0", topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },  
  
  // The actual test we wish to run
  test: function(configure, test) {
    var db = configure.newDbInstance({w:1}, {poolSize:1});

    // LINE var MongoClient = require('mongodb').MongoClient;
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.
    // BEGIN
    db.open(function(err, db) {
      // Some docs for insertion
      var docs = [{
          title : "this is my title", author : "bob", posted : new Date() ,
          pageViews : 5, tags : [ "fun" , "good" , "fun" ], other : { foo : 5 },
          comments : [
            { author :"joe", text : "this is cool" }, { author :"sam", text : "this is bad" }
          ]}];

      // Create a collection
      var collection = db.collection('shouldCorrectlyExecuteSimpleAggregationPipelineUsingArguments');
      // Insert the docs
      collection.insert(docs, {w: 1}, function(err, result) {
        // Execute aggregate, notice the pipeline is expressed as function call parameters
        // instead of an Array.
        collection.aggregate(
            { $project : {
              author : 1,
              tags : 1
            }},
            { $unwind : "$tags" },
            { $group : {
              _id : {tags : "$tags"},
              authors : { $addToSet : "$author" }
            }}
          , function(err, result) {
            test.equal(null, err);
            test.equal('good', result[0]._id.tags);
            test.deepEqual(['bob'], result[0].authors);
            test.equal('fun', result[1]._id.tags);
            test.deepEqual(['bob'], result[1].authors);

            db.close();
            test.done();
        });
      });
    });
    // END
  }
}

/**
 * Correctly call the aggregation framework to return a cursor
 *
 * @example-class Collection
 * @example-method aggregate
 * @ignore
 */
exports['Should correctly return and iterate over all the cursor results'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: {
    requires: {
        mongodb: ">2.1.0"
      , topology: 'single'
      , node: ">0.10.0"
    }
  },
  
  // The actual test we wish to run
  test: function(configure, test) {
    var db = configure.newDbInstance({w:1}, {poolSize:1});

    // LINE var MongoClient = require('mongodb').MongoClient;
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.
    // BEGIN
    db.open(function(err, db) {
      // Some docs for insertion
      var docs = [{
          title : "this is my title", author : "bob", posted : new Date() ,
          pageViews : 5, tags : [ "fun" , "good" , "fun" ], other : { foo : 5 },
          comments : [
            { author :"joe", text : "this is cool" }, { author :"sam", text : "this is bad" }
          ]}];

      // Create a collection
      var collection = db.collection('shouldCorrectlyDoAggWithCursorGet');
      // Insert the docs
      collection.insert(docs, {w: 1}, function(err, result) {
        test.equal(null, err);

        // Execute aggregate, notice the pipeline is expressed as an Array
        var cursor = collection.aggregate([
            { $project : {
              author : 1,
              tags : 1
            }},
            { $unwind : "$tags" },
            { $group : {
              _id : {tags : "$tags"},
              authors : { $addToSet : "$author" }
            }}
          ]);

        // Iterate over all the items in the cursor
        cursor.toArray(function(err, results) {
          test.equal(null, err);
          test.ok(results != null);

          db.close();
          test.done();        
        });
      });
    });
    // END
  }
}

/**
 * Correctly call the aggregation framework to return a cursor and call explain
 *
 * @example-class Collection
 * @example-method aggregate
 * @ignore
 */
exports['Should correctly return a cursor and call explain'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: {
    requires: {
        mongodb: ">2.5.3"
      , topology: 'single'
      , node: ">0.10.0"
    }
  },

  // The actual test we wish to run
  test: function(configure, test) {
    var db = configure.newDbInstance({w:1}, {poolSize:1});

    // LINE var MongoClient = require('mongodb').MongoClient;
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.
    // BEGIN
    db.open(function(err, db) {
      // Some docs for insertion
      var docs = [{
          title : "this is my title", author : "bob", posted : new Date() ,
          pageViews : 5, tags : [ "fun" , "good" , "fun" ], other : { foo : 5 },
          comments : [
            { author :"joe", text : "this is cool" }, { author :"sam", text : "this is bad" }
          ]}];

      // Create a collection
      var collection = db.collection('shouldCorrectlyDoAggWithCursorGet');
      // Insert the docs
      collection.insert(docs, {w: 1}, function(err, result) {

        // Execute aggregate, notice the pipeline is expressed as an Array
        var cursor = collection.aggregate([
            { $project : {
              author : 1,
              tags : 1
            }},
            { $unwind : "$tags" },
            { $group : {
              _id : {tags : "$tags"},
              authors : { $addToSet : "$author" }
            }}
          ], {
            cursor: {batchSize:100}
          });

        // Iterate over all the items in the cursor
        cursor.explain(function(err, result) {
          test.equal(null, err);
          test.equal(4, result.stages.length);

          db.close();
          test.done();        
        });
      });
    });
    // END
  }
}

/**
 * Correctly call the aggregation framework to return a cursor with batchSize 1 and get the first result using next
 *
 * @example-class Collection
 * @example-method aggregate
 * @ignore
 */
exports['Should correctly return a cursor with batchSize 1 and call next'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: {
    requires: {
        mongodb: ">2.5.3"
      , topology: 'single'
      , node: ">0.10.0"
    }
  },
  
  // The actual test we wish to run
  test: function(configure, test) {
    var db = configure.newDbInstance({w:1}, {poolSize:1});

    // LINE var MongoClient = require('mongodb').MongoClient;
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.
    // BEGIN
    db.open(function(err, db) {
      // Some docs for insertion
      var docs = [{
          title : "this is my title", author : "bob", posted : new Date() ,
          pageViews : 5, tags : [ "fun" , "good" , "fun" ], other : { foo : 5 },
          comments : [
            { author :"joe", text : "this is cool" }, { author :"sam", text : "this is bad" }
          ]}];

      // Create a collection
      var collection = db.collection('shouldCorrectlyDoAggWithCursorGet');
      // Insert the docs
      collection.insert(docs, {w: 1}, function(err, result) {

        // Execute aggregate, notice the pipeline is expressed as an Array
        var cursor = collection.aggregate([
            { $project : {
              author : 1,
              tags : 1
            }},
            { $unwind : "$tags" },
            { $group : {
              _id : {tags : "$tags"},
              authors : { $addToSet : "$author" }
            }}
          ], {
            cursor: {batchSize:1}
          });

        // Iterate over all the items in the cursor
        cursor.next(function(err, result) {
          test.equal(null, err);
          test.equal('good', result._id.tags);
          test.deepEqual(['bob'], result.authors);

          db.close();
          test.done();        
        });
      });
    });
    // END
  }
}

/**
 * Correctly call the aggregation framework and write the results to a new collection
 *
 * @example-class Collection
 * @example-method aggregate
 * @ignore
 */
exports['Should correctly write the results out to a new collection'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { mongodb: ">2.5.0", topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },  
  
  // The actual test we wish to run
  test: function(configure, test) {
    var db = configure.newDbInstance({w:1}, {poolSize:1});

    // LINE var MongoClient = require('mongodb').MongoClient;
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.
    // BEGIN
    db.open(function(err, db) {
      // Some docs for insertion
      var docs = [{
          title : "this is my title", author : "bob", posted : new Date() ,
          pageViews : 5, tags : [ "fun" , "good" , "fun" ], other : { foo : 5 },
          comments : [
            { author :"joe", text : "this is cool" }, { author :"sam", text : "this is bad" }
          ]}];

      // Create a collection
      var collection = db.collection('shouldCorrectlyDoAggWithCursorGet');
      // Insert the docs
      collection.insert(docs, {w: 1}, function(err, result) {

        // Execute aggregate, notice the pipeline is expressed as an Array
        collection.aggregate([
            { $project : {
              author : 1,
              tags : 1
            }},
            { $unwind : "$tags" },
            { $group : {
              _id : {tags : "$tags"},
              authors : { $addToSet : "$author" }
            }}
          ], {
            out: "testingOutCollectionForAggregation"
          }, function(err, results) {
            test.equal(null, err);
            test.equal(0, results.length);

            db.close();
            test.done();        
          });
      });
    });
    // END
  }
}

/**
 * Correctly use allowDiskUse when performing an aggregation
 *
 * @example-class Collection
 * @example-method aggregate
 * @ignore
 */
exports['Should correctly use allowDiskUse when performing an aggregation'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { mongodb: ">2.5.5", topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },  
  
  // The actual test we wish to run
  test: function(configure, test) {
    var db = configure.newDbInstance({w:1}, {poolSize:1});

    // LINE var MongoClient = require('mongodb').MongoClient;
    // LINE MongoClient.connect('mongodb://localhost:27017/test', function(err, db) {
    // REPLACE configuration.writeConcernMax() WITH {w:1}
    // REMOVE-LINE test.
    // BEGIN
    db.open(function(err, db) {
      // Some docs for insertion
      var docs = [{
          title : "this is my title", author : "bob", posted : new Date() ,
          pageViews : 5, tags : [ "fun" , "good" , "fun" ], other : { foo : 5 },
          comments : [
            { author :"joe", text : "this is cool" }, { author :"sam", text : "this is bad" }
          ]}];

      // Create a collection
      var collection = db.collection('shouldCorrectlyDoAggWithCursorGet');
      // Insert the docs
      collection.insert(docs, {w: 1}, function(err, result) {

        // Execute aggregate, notice the pipeline is expressed as an Array
        collection.aggregate([
            { $project : {
              author : 1,
              tags : 1
            }},
            { $unwind : "$tags" },
            { $group : {
              _id : {tags : "$tags"},
              authors : { $addToSet : "$author" }
            }}
          ], {
            allowDiskUse: true
          }, function(err, results) {
            test.equal(null, err);
            test.equal('good', results[0]._id.tags);
            test.deepEqual(['bob'], results[0].authors);
            test.equal('fun', results[1]._id.tags);
            test.deepEqual(['bob'], results[1].authors);

            db.close();
            test.done();        
          });
      });
    });
    // END
  }
}

/**
 * Correctly perform simple group
 * @ignore
 */
exports['Should perform a simple group aggregation'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { mongodb: ">2.5.5", topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },  
  
  // The actual test we wish to run
  test: function(configure, test) {
    var db = configure.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      // Create a collection
      var col = db.collection('shouldPerformSimpleGroupAggregation');
      col.remove({}, function() {
        // Insert a single document
        col.insert([{a:1}, {a:1}, {a:1}], function(err, r) {
          test.equal(null, err);
          test.equal(3, r.result.n);

          // Get first two documents that match the query
          col.aggregate([
                {$match: {}}
              , {$group:
                  {_id: '$a', total: {$sum: '$a'} }
                }
            ]).toArray(function(err, docs) {
            test.equal(null, err);
            test.equal(3, docs[0].total);
            db.close();
            test.done();
          });
        });
      });
    });
  }
}

/**
 * Correctly perform simple group
 * @ignore
 */
exports['Should correctly perform an aggregation using a collection name with dot in it'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { mongodb: ">2.5.5", topology: ['single', 'replicaset', 'sharded', 'ssl', 'heap', 'wiredtiger'] } },  
  
  // The actual test we wish to run
  test: function(configure, test) {
    var db = configure.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      db.collection('te.st', function(err, col){
        test.equal(null, err);
        var count = 0;
        
        col.insert([{a: 1}, {a: 1}, {a: 1}], function(err, r) {
          test.equal(null, err);
          test.equal(3, r.result.n);
          
          //Using callback - OK
          col.aggregate([
              {$project: {a: 1}}
            ], function(err, docs) {
              test.equal(null, err);
              test.notEqual(0, docs.length);
              
              //Using cursor - KO
              col.aggregate([
                {$project: {a: 1}}
              ], {cursor: {batchSize: 10000}}).forEach(function() {
                count = count + 1;
              }, function(err) {
                test.equal(null, err);
                test.notEqual(0, count);

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
 * Correctly call the aggregation framework to return a cursor with batchSize 1 and get the first result using next
 *
 * @ignore
 */
exports['Should fail aggregation due to illegal cursor option and streams'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: {
    requires: {
        mongodb: ">2.5.3"
      , topology: 'single'
      , node: ">0.10.0"
    }
  },
  
  // The actual test we wish to run
  test: function(configure, test) {
    var db = configure.newDbInstance({w:1}, {poolSize:1});
    db.open(function(err, db) {
      // Some docs for insertion
      var docs = [{
          title : "this is my title", author : "bob", posted : new Date() ,
          pageViews : 5, tags : [ "fun" , "good" , "fun" ], other : { foo : 5 },
          comments : [
            { author :"joe", text : "this is cool" }, { author :"sam", text : "this is bad" }
          ]}];

      // Create a collection
      var collection = db.collection('shouldCorrectlyDoAggWithCursorGetStream');
      // Insert the docs
      collection.insert(docs, {w: 1}, function(err, result) {

        try {
          // Execute aggregate, notice the pipeline is expressed as an Array
          var cursor = collection.aggregate([
              { $project : {
                author : 1,
                tags : 1
              }},
              { $unwind : "$tags" },
              { $group : {
                _id : {tags : "$tags"},
                authors : { $addToSet : "$author" }
              }}
            ], {
              cursor: 1
            }); 
        } catch(err) {
          db.close();
          return test.done();
        }

        test.ok(false);         
      });
    });
  }
}

/**
 * Correctly call the aggregation framework to return a cursor with batchSize 1 and get the first result using next
 *
 * @ignore
 */
exports['Ensure MaxTimeMS is correctly passed down into command execution when using a cursor'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: {
    requires: {
        mongodb: ">=2.6.0"
      , topology: 'single'
      , node: ">0.10.0"
    }
  },
  
  // The actual test we wish to run
  test: function(configure, test) {
    var db = configure.newDbInstance({w:1}, {poolSize:1});

    // DOC_LINE var db = new Db('test', new Server('localhost', 27017));
    // DOC_START
    db.open(function(err, db) {
      // Some docs for insertion
      var docs = [{
          title : "this is my title", author : "bob", posted : new Date() ,
          pageViews : 5, tags : [ "fun" , "good" , "fun" ], other : { foo : 5 },
          comments : [
            { author :"joe", text : "this is cool" }, { author :"sam", text : "this is bad" }
          ]}];

      // Create a collection
      var collection = db.collection('shouldCorrectlyDoAggWithCursorMaxTimeMSSet');
      // Insert the docs
      collection.insert(docs, {w: 1}, function(err, result) {

        // Execute aggregate, notice the pipeline is expressed as an Array
        var cursor = collection.aggregate([
            { $project : {
              author : 1,
              tags : 1
            }},
            { $unwind : "$tags" },
            { $group : {
              _id : {tags : "$tags"},
              authors : { $addToSet : "$author" }
            }}
          ], {
              cursor: {batchSize:1}
            , maxTimeMS: 1000
          });

        // Override the db.command to validate the correct command
        // is executed
        var cmd = db.command;
        // Validate the command
        db.command = function(c) {
          test.equal(null, err);
          test.equal(1000, c.maxTimeMS);
          // Apply to existing command
          cmd.apply(db, Array.prototype.slice.call(arguments, 0));
        }

        // Iterate over all the items in the cursor
        cursor.next(function(err, result) {
          test.equal(null, err);
          test.equal('good', result._id.tags);
          test.deepEqual(['bob'], result.authors);

          // Validate the command
          db.command = function(c) {
            test.equal(null, err);
            test.equal(1000, c.maxTimeMS);
            // Apply to existing command
            cmd.apply(db, Array.prototype.slice.call(arguments, 0));
          }

          // Execute aggregate, notice the pipeline is expressed as an Array
          var cursor = collection.aggregate([
              { $project : {
                author : 1,
                tags : 1
              }},
              { $unwind : "$tags" },
              { $group : {
                _id : {tags : "$tags"},
                authors : { $addToSet : "$author" }
              }}
            ], {
              maxTimeMS: 1000
            }, function(err, r) {
              // Return the command
              db.command = cmd;
              db.close();
              test.done();        
            });          
        });
      });
    });
    // DOC_END
  }
}
