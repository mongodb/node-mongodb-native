var mongodb = process.env['TEST_NATIVE'] != null ? require('../lib/mongodb').native() : require('../lib/mongodb').pure();
var useSSL = process.env['USE_SSL'] != null ? true : false;

var testCase = require('../deps/nodeunit').testCase,
  debug = require('util').debug,
  inspect = require('util').inspect,
  nodeunit = require('../deps/nodeunit'),
  gleak = require('../dev/tools/gleak'),
  Db = mongodb.Db,
  Cursor = mongodb.Cursor,
  Collection = mongodb.Collection,
  ObjectID = require('../lib/mongodb/bson/objectid').ObjectID,
  Long = require('../lib/mongodb/bson/long').Long,
  Step = require("../deps/step/lib/step"),
  Server = mongodb.Server;

var MONGODB = 'integration_tests';
var client = new Db(MONGODB, new Server("127.0.0.1", 27017, {auto_reconnect: true, poolSize: 4, ssl:useSSL}), {native_parser: (process.env['TEST_NATIVE'] != null)});
var native_parser = (process.env['TEST_NATIVE'] != null);

/**
 * Retrieve the server information for the current
 * instance of the db client
 * 
 * @ignore
 */
exports.setUp = function(callback) {
  var self = exports;  
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
 * Example of a simple geoNear query across some documents
 *
 * @_class collection
 * @_function geoNear
 * @ignore
 */
exports.shouldCorrectlyPerformSimpleGeoNearCommand = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
   {auto_reconnect: false, poolSize: 4, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {
    
    // Fetch the collection
    db.collection("simple_geo_near_command", function(err, collection) {
      
      // Add a location based index
      collection.ensureIndex({loc:"2d"}, function(err, result) {

        // Save a new location tagged document
        collection.insert([{a:1, loc:[50, 30]}, {a:1, loc:[30, 50]}], {safe:true}, function(err, result) {
         
          // Use geoNear command to find document
          collection.geoNear(50, 50, {query:{a:1}, num:1}, function(err, docs) {
            test.equal(1, docs.results.length);
            
            db.close();
            test.done();
          });          
        });
      });      
    });    
  });
}

/**
 * Example of a simple geoHaystackSearch query across some documents
 *
 * @_class collection
 * @_function geoHaystackSearch
 * @ignore
 */
exports.shouldCorrectlyPerformSimpleGeoHaystackSearchCommand = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
   {auto_reconnect: false, poolSize: 4, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {
    
    // Fetch the collection
    db.collection("simple_geo_haystack_command", function(err, collection) {
      
      // Add a location based index
      collection.ensureIndex({loc: "geoHaystack", type: 1}, {bucketSize: 1}, function(err, result) {

        // Save a new location tagged document
        collection.insert([{a:1, loc:[50, 30]}, {a:1, loc:[30, 50]}], {safe:true}, function(err, result) {
         
          // Use geoNear command to find document
          collection.geoHaystackSearch(50, 50, {search:{a:1}, limit:1, maxDistance:100}, function(err, docs) {
            test.equal(1, docs.results.length);
            
            db.close();
            test.done();
          });          
        });
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