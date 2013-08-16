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