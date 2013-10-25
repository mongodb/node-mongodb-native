/**
 * Correctly call the aggregation framework using a pipeline in an Array.
 *
 * @_class collection
 * @_function aggregate
 * @ignore
 */
exports.shouldCorrectlyExecuteSimpleAggregationPipelineUsingArray = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  requires: {mongodb: ">2.1.0"},
  
  // The actual test we wish to run
  test: function(configure, test) {
    var db = configure.newDbInstance({w:1}, {poolSize:1});

    // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
    // DOC_START
    // Establish connection to db
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
    // DOC_END
  }
}

/**
 * Correctly call the aggregation framework using a pipeline expressed as an argument list.
 *
 * @_class collection
 * @_function aggregate
 * @ignore
 */
exports.shouldFailWhenExecutingSimpleAggregationPipelineUsingArgumentsNotAnArray = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  requires: {mongodb: ">2.1.0"},
  
  // The actual test we wish to run
  test: function(configure, test) {
    var db = configure.newDbInstance({w:1}, {poolSize:1});

    // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
    // DOC_START
    // Establish connection to db
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
    // DOC_END
  }
}

/**
 * Correctly call the aggregation framework using a pipeline expressed as an argument list.
 *
 * @_class collection
 * @_function aggregate
 * @ignore
 */
exports.shouldFailWhenExecutingSimpleAggregationPipelineUsingArgumentsUsingSingleObject = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  requires: {mongodb: ">2.1.0"},
  
  // The actual test we wish to run
  test: function(configure, test) {
    var db = configure.newDbInstance({w:1}, {poolSize:1});

    // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
    // DOC_START
    // Establish connection to db
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
    // DOC_END
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyFailAndReturnError = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  requires: {mongodb: ">2.1.0"},
  
  // The actual test we wish to run
  test: function(configure, test) {
    var db = configure.newDbInstance({w:1}, {poolSize:1});
    // Some docs for insertion
    var docs = [{
        title : "this is my title", author : "bob", posted : new Date() ,
        pageViews : 5, tags : [ "fun" , "good" , "fun" ], other : { foo : 5 },
        comments : [
          { author :"joe", text : "this is cool" }, { author :"sam", text : "this is bad" }
        ]}];

    db.open(function(err, db) {
      // Create a collection
      var collection = db.collection('shouldCorrectlyFailAndReturnError');
      // Insert the docs
      collection.insert(docs, {w: 1}, function(err, result) {
        // Execute aggregate
        collection.aggregate(
            { $project : {
              author : 1,
              tags : 1,
            }},
            { $32unwind : "$tags" },
            { $group : {
              _id : { tags : 1 },
              authors : { $addToSet : "$author" }
            }}
          , function(err, result) {
            test.ok(err != null);
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
exports.shouldCorrectlyPassReadPreference = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  requires: {mongodb: ">2.1.0"},
  
  // The actual test we wish to run
  test: function(configure, test) {
    var db = configure.newDbInstance({w:1}, {poolSize:1});

    // Some docs for insertion
    var docs = [{
        title : "this is my title", author : "bob", posted : new Date() ,
        pageViews : 5, tags : [ "fun" , "good" , "fun" ], other : { foo : 5 },
        comments : [
          { author :"joe", text : "this is cool" }, { author :"sam", text : "this is bad" }
        ]}];

    // Establish connection to db
    db.open(function(err, db) {
      // Create a collection
      var collection = db.collection('shouldCorrectlyFailAndReturnError');
      // Override the command object for the db
      var _command = db.command;        
      db.command = function(selector, options, callback) {
          var args = Array.prototype.slice.call(arguments, 0);
          test.equal("secondary", options.readPreference);
        _command.apply(db, args);
      }

      // Insert the docs
      collection.insert(docs, {w: 1}, function(err, result) {
        
        // Execute aggregate
        collection.aggregate(
            { $project : {
              author : 1,
              tags : 1,
            }},
            { $32unwind : "$tags" },
            { $group : {
              _id : { tags : 1 },
              authors : { $addToSet : "$author" }
            }},
            {readPreference:'secondary'}
          , function(err, result) {
            
            // Execute aggregate
            collection.aggregate(
                [{ $project : {
                  author : 1,
                  tags : 1,
                }},
                { $32unwind : "$tags" },
                { $group : {
                  _id : { tags : 1 },
                  authors : { $addToSet : "$author" }
                }}],
                {readPreference:'secondary'}
              , function(err, result) {
                db.command = _command;
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
 * Correctly call the aggregation framework to return a cursor
 *
 * @_class collection
 * @_function aggregate
 * @ignore
 */
exports['Should correctly return and iterate over all the cursor results'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  requires: {mongodb: ">2.1.0"},
  requires: {serverType: 'Server'},
  requires: {node: ">0.10.0"},
  
  // The actual test we wish to run
  test: function(configure, test) {
    var db = configure.newDbInstance({w:1}, {poolSize:1});

    // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
    // DOC_START
    // Establish connection to db
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
        cursor.get(function(err, results) {
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
    // DOC_END
  }
}

/**
 * Correctly call the aggregation framework to return a cursor and call explain
 *
 * @_class collection
 * @_function aggregate
 * @ignore
 */
exports['Should correctly return a cursor and call explain'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  requires: {mongodb: ">2.5.3"},
  requires: {serverType: 'Server'},
  requires: {node: ">0.10.0"},

  // The actual test we wish to run
  test: function(configure, test) {
    var db = configure.newDbInstance({w:1}, {poolSize:1});

    // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
    // DOC_START
    // Establish connection to db
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
        cursor.explain(function(err, results) {
          test.equal(null, err);
          test.equal(4, results.length);

          db.close();
          test.done();        
        });
      });
    });
    // DOC_END
  }
}

/**
 * Correctly call the aggregation framework to return a cursor with batchSize 1 and get the first result using next
 *
 * @_class collection
 * @_function aggregate
 * @ignore
 */
exports['Should correctly return a cursor with batchSize 1 and call next'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  requires: {mongodb: ">2.5.3"},
  requires: {serverType: 'Server'},
  requires: {node: ">0.10.0"},
  
  // The actual test we wish to run
  test: function(configure, test) {
    var db = configure.newDbInstance({w:1}, {poolSize:1});

    // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
    // DOC_START
    // Establish connection to db
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
    // DOC_END
  }
}

/**
 * Correctly call the aggregation framework and write the results to a new collection
 *
 * @_class collection
 * @_function aggregate
 * @ignore
 */
exports['Should correctly write the results out to a new collection'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  requires: {mongodb: ">2.5.3"},
  
  // The actual test we wish to run
  test: function(configure, test) {
    var db = configure.newDbInstance({w:1}, {poolSize:1});

    // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
    // DOC_START
    // Establish connection to db
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
    // DOC_END
  }
}

/**
 * Correctly use allowDiskUsage when performing an aggregation
 *
 * @_class collection
 * @_function aggregate
 * @ignore
 */
exports['Should correctly use allowDiskUsage when performing an aggregation'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  requires: {mongodb: ">2.5.3"},
  
  // The actual test we wish to run
  test: function(configure, test) {
    var db = configure.newDbInstance({w:1}, {poolSize:1});

    // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
    // DOC_START
    // Establish connection to db
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
            allowDiskUsage: true
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
    // DOC_END
  }
}

/**
 * @ignore
 */
exports['Should correctly use allowDiskUsage when performing an aggregation with a cursor'] = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  requires: {mongodb: ">2.5.3"},
  requires: {serverType: 'Server'},
  requires: {node: ">0.10.0"},
  
  // The actual test we wish to run
  test: function(configure, test) {
    var db = configure.newDbInstance({w:1}, {poolSize:1});

    // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
    // DOC_START
    // Establish connection to db
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
              allowDiskUsage: true
            , cursor: {batchSize: 1}
          })

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
    // DOC_END
  }
}
