var mongodb = process.env['TEST_NATIVE'] != null ? require('../lib/mongodb').native() : require('../lib/mongodb').pure();
var useSSL = process.env['USE_SSL'] != null ? true : false;
var native_parser = (process.env['TEST_NATIVE'] != null);

var testCase = require('nodeunit').testCase,
  debug = require('util').debug,
  inspect = require('util').inspect,
  nodeunit = require('nodeunit'),
  gleak = require('../dev/tools/gleak'),
  Db = mongodb.Db,
  Cursor = mongodb.Cursor,
  Collection = mongodb.Collection,
  Server = mongodb.Server;

var MONGODB = 'integration_tests';
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
 * Correctly call the aggregation framework using a pipeline in an Array.
 *
 * @_class collection
 * @_function aggregate
 * @ignore
 */
exports.shouldCorrectlyExecuteSimpleAggregationPipelineUsingArray = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
   {auto_reconnect: false, poolSize: 4, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {
    // Some docs for insertion
    var docs = [{
        title : "this is my title", author : "bob", posted : new Date() ,
        pageViews : 5, tags : [ "fun" , "good" , "fun" ], other : { foo : 5 },
        comments : [
          { author :"joe", text : "this is cool" }, { author :"sam", text : "this is bad" }
        ]}];
   
    // Validate that we are running on at least version 2.1 of MongoDB
    db.admin().serverInfo(function(err, result){

      if(parseInt((result.version.replace(/\./g, ''))) >= 210) {
        // Create a collection   
        db.createCollection('shouldCorrectlyExecuteSimpleAggregationPipelineUsingArray', function(err, collection) {
          // Insert the docs
          collection.insert(docs, {safe:true}, function(err, result) {

            // Execute aggregate, notice the pipeline is expressed as an Array
            collection.aggregate([
                { $project : {
                	author : 1,
                	tags : 1,
                }},
                { $unwind : "$tags" },
                { $group : {
                	_id : { tags : 1 },
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
      } else {
        db.close();
        test.done();
      }
    });
  });
}

/**
 * Correctly call the aggregation framework using a pipeline expressed as an argument list.
 *
 * @_class collection
 * @_function aggregate
 * @ignore
 */
exports.shouldCorrectlyExecuteSimpleAggregationPipelineUsingArguments = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
   {auto_reconnect: false, poolSize: 4, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {
    // Some docs for insertion
    var docs = [{
        title : "this is my title", author : "bob", posted : new Date() ,
        pageViews : 5, tags : [ "fun" , "good" , "fun" ], other : { foo : 5 },
        comments : [
          { author :"joe", text : "this is cool" }, { author :"sam", text : "this is bad" }
        ]}];
   
    // Validate that we are running on at least version 2.1 of MongoDB
    db.admin().serverInfo(function(err, result){

      if(parseInt((result.version.replace(/\./g, ''))) >= 210) {
        // Create a collection   
        client.createCollection('shouldCorrectlyExecuteSimpleAggregationPipelineUsingArguments', function(err, collection) {
          // Insert the docs
          collection.insert(docs, {safe:true}, function(err, result) {
            
            // Execute aggregate, notice the pipeline is expressed as function call parameters
            // instead of an Array.
            collection.aggregate(
                { $project : {
                	author : 1,
                	tags : 1,
                }},
                { $unwind : "$tags" },
                { $group : {
                	_id : { tags : 1 },
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
      } else {
        db.close();
        test.done();
      }
    });
  });
}

/**
 * @ignore
 */
exports.shouldCorrectlyFailAndReturnError = function(test) {
  // Some docs for insertion
  var docs = [{
      title : "this is my title", author : "bob", posted : new Date() ,
      pageViews : 5, tags : [ "fun" , "good" , "fun" ], other : { foo : 5 },
      comments : [
        { author :"joe", text : "this is cool" }, { author :"sam", text : "this is bad" }
      ]}];
   
  client.admin().serverInfo(function(err, result){
    if(parseInt((result.version.replace(/\./g, ''))) >= 210) {
      // Create a collection   
      client.createCollection('shouldCorrectlyExecuteSimpleAggregationPipelineUsingArguments', function(err, collection) {
        // Insert the docs
        collection.insert(docs, {safe:true}, function(err, result) {
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
              test.done();              
          });
        });
      });
    } else {
      test.done();
    }
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