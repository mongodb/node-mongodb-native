var testCase = require('../deps/nodeunit').testCase,
  debug = require('util').debug,
  inspect = require('util').inspect,
  nodeunit = require('../deps/nodeunit'),
  gleak = require('../dev/tools/gleak'),
  Db = require('../lib/mongodb').Db,
  Cursor = require('../lib/mongodb').Cursor,
  Step = require("../deps/step/lib/step"),
  Collection = require('../lib/mongodb').Collection,
  fs = require('fs'),
  Server = require('../lib/mongodb').Server;

var MONGODB = 'integration_tests';
var useSSL = process.env['USE_SSL'] != null ? true : false;
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
 * A simple example showing the use of the cursorstream pause function.
 *
 * @_class cursorstream
 * @_function pause
 * @ignore
 */
exports.shouldStreamDocumentsUsingTheCursorStreamPauseFunction = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
   {auto_reconnect: false, poolSize: 1, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {
    
    // Create a lot of documents to insert
    var docs = []  
    for(var i = 0; i < 1; i++) {
      docs.push({'a':i})
    }

    // Create a collection
    db.createCollection('test_cursorstream_pause', function(err, collection) {
      test.equal(null, err);

      // Insert documents into collection
      collection.insert(docs, {safe:true}, function(err, ids) {        
        // Peform a find to get a cursor
        var stream = collection.find().stream();
        
        // For each data item
        stream.on("data", function(item) {
          // Check if cursor is paused
          test.equal(false, stream.paused);
          // Pause stream
          stream.pause();
          // Check if cursor is paused
          test.equal(true, stream.paused);         
           
          // Restart the stream after 1 miliscecond
          setTimeout(function() {
            stream.resume();
            // Check if cursor is paused
            test.equal(false, stream.paused);
          }, 1);          
        });
        
        // When the stream is done
        stream.on("close", function() {
          db.close();
          test.done();          
        });        
      });
    });    
  });
}

/**
 * A simple example showing the use of the cursorstream resume function.
 *
 * @_class cursorstream
 * @_function resume
 * @ignore
 */
exports.shouldStreamDocumentsUsingTheCursorStreamResumeFunction = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
   {auto_reconnect: false, poolSize: 1, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {
    
    // Create a lot of documents to insert
    var docs = []  
    for(var i = 0; i < 1; i++) {
      docs.push({'a':i})
    }

    // Create a collection
    db.createCollection('test_cursorstream_resume', function(err, collection) {
      test.equal(null, err);

      // Insert documents into collection
      collection.insert(docs, {safe:true}, function(err, ids) {        
        // Peform a find to get a cursor
        var stream = collection.find().stream();
        
        // For each data item
        stream.on("data", function(item) {
          // Check if cursor is paused
          test.equal(false, stream.paused);
          // Pause stream
          stream.pause();
          // Check if cursor is paused
          test.equal(true, stream.paused);         
           
          // Restart the stream after 1 miliscecond
          setTimeout(function() {

            // Resume the stream
            stream.resume();

            // Check if cursor is paused
            test.equal(false, stream.paused);
          }, 1);          
        });
        
        // When the stream is done
        stream.on("close", function() {
          db.close();
          test.done();          
        });        
      });
    });    
  });
}

/**
 * A simple example showing the use of the cursorstream resume function.
 *
 * @_class cursorstream
 * @_function destroy
 * @ignore
 */
exports.shouldStreamDocumentsUsingTheCursorStreamDestroyFunction = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
   {auto_reconnect: false, poolSize: 1, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {
    
    // Create a lot of documents to insert
    var docs = []  
    for(var i = 0; i < 1; i++) {
      docs.push({'a':i})
    }

    // Create a collection
    db.createCollection('test_cursorstream_destroy', function(err, collection) {
      test.equal(null, err);

      // Insert documents into collection
      collection.insert(docs, {safe:true}, function(err, ids) {        
        // Peform a find to get a cursor
        var stream = collection.find().stream();
        
        // For each data item
        stream.on("data", function(item) {
          // Destroy stream
          stream.destroy();
        });
        
        // When the stream is done
        stream.on("close", function() {
          db.close();
          test.done();          
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