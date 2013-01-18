var mongodb = process.env['TEST_NATIVE'] != null ? require('../lib/mongodb').native() : require('../lib/mongodb').pure();
var useSSL = process.env['USE_SSL'] != null ? true : false;

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
  client = new Db(MONGODB, new Server("127.0.0.1", 27017, {auto_reconnect: true, poolSize: 4, ssl:useSSL}), {w:0, native_parser: (process.env['TEST_NATIVE'] != null)});
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

exports.shouldCorrectlyHandleThrownInInsert = function(test) {

    var db = new Db(MONGODB, new Server("127.0.0.1", 27017,
            {auto_reconnect: false, poolSize:1}), {safe: true, native_parser:true}),
        doc = {key : { $ref: 'should be error' } };
    db.on('error', function(error) {
        test.done()
    });
    db.open(function(error, db) {
        db.dropCollection('shouldCorrectlyHandleThrownInInsert', function(err) {
            db.createCollection('shouldCorrectlyHandleThrownInInsert', function(err, collection) {
                collection.insert(doc, {safe:false});
            });
        })
    });
}

exports.shouldCorrectlyHandleThrownError = function(test) {
  client.createCollection('shouldCorrectlyHandleThrownError', function(err, r) {
    try {
      client.collection('shouldCorrectlyHandleThrownError', function(err, collection) {
        debug(someUndefinedVariable);
      });        
    } catch (err) {
      test.ok(err != null);
      test.done();        
    }
  });
}

exports.shouldCorrectlyHandleThrownErrorInRename = function(test) {
  // Catch unhandled exception
  process.on("uncaughtException", function(err) {
    // Remove listener
    process.removeAllListeners("uncaughtException");
    test.done()
  })
  
  // Execute code
  client.createCollection('shouldCorrectlyHandleThrownErrorInRename', function(err, r) {      
    client.collection('shouldCorrectlyHandleThrownError', function(err, collection) {
      collection.rename("shouldCorrectlyHandleThrownErrorInRename2", function(err, result) {
        debug(someUndefinedVariable);            
      })
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