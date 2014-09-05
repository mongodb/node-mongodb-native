/**
 * Correctly call the aggregation framework using a pipeline in an Array.
 *
 * @example-class Collection
 * @example-method aggregate
 * @ignore
 */
exports.aggregationExample1 = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { mongodb:">2.1.0", topology: ['single', 'replicaset', 'sharded', 'ssl'] } },  
  
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
      var collection = db.collection('aggregationExample1');
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
 * Correctly call the aggregation using a cursor
 *
 * @example-class Collection
 * @example-method aggregate
 * @ignore
 */
exports.aggregationExample2 = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { mongodb:">2.1.0", topology: ['single', 'replicaset', 'sharded', 'ssl'] } },  
  
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
      var collection = db.collection('aggregationExample2');
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
          ], { cursor: { batchSize: 1 } });

        // Get all the aggregation results
        cursor.toArray(function(err, docs) {
          test.equal(null, err);
          test.equal(2, docs.length);
          test.done();
          db.close();
        });
      });
    });
    // END
  }
}

/**
 * Correctly call the aggregation using a read stream
 *
 * @example-class Collection
 * @example-method aggregate
 * @ignore
 */
exports.aggregationExample3 = {
  // Add a tag that our runner can trigger on
  // in this case we are setting that node needs to be higher than 0.10.X to run
  metadata: { requires: { mongodb:">2.1.0", topology: ['single', 'replicaset', 'sharded', 'ssl'] } },  
  
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
      var collection = db.collection('aggregationExample3');
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
          ], { cursor: { batchSize: 1 } });

        var count = 0;
        // Get all the aggregation results
        cursor.on('data', function(doc) {
          count = count + 1;
        });

        cursor.once('end', function() {
          test.equal(2, count);
          test.done();
          db.close();
        });
      });
    });
    // END
  }
}
