var testCase = require('../../deps/nodeunit').testCase,
  debug = require('util').debug,
  inspect = require('util').inspect,
  nodeunit = require('../../deps/nodeunit'),
  gleak = require('../../dev/tools/gleak'),
  Db = require('../../lib/mongodb').Db,
  ObjectID = require('../../lib/mongodb').ObjectID,
  Cursor = require('../../lib/mongodb').Cursor,
  Step = require("../../deps/step/lib/step"),
  Collection = require('../../lib/mongodb').Collection,
  GridStore = require('../../lib/mongodb').GridStore,
  fs = require('fs'),
  Server = require('../../lib/mongodb').Server;

var MONGODB = 'integration_tests';
var useSSL = process.env['USE_SSL'] != null ? true : false;
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
 * A simple example showing the use of the readstream pause function.
 *
 * @_class readstream
 * @_function pause
 * @ignore
 */
exports.shouldStreamDocumentsUsingTheReadStreamPauseFunction = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
   {auto_reconnect: false, poolSize: 1, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {
    // File id
    var fileId = new ObjectID();
    // Create a file
    var file = new GridStore(db, fileId, "w");
    file.open(function(err, file) {      
      // Write some content and flush to disk
      file.write('Hello world', function(err, file) {        
        file.close(function(err, result) {
          
          // Let's create a read file
          file = new GridStore(db, fileId, "r");
          // Open the file
          file.open(function(err, file) {            
            // Peform a find to get a cursor
            var stream = file.stream();

            // For each data item
            stream.on("data", function(item) {
              // Check if stream is paused
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

            // For each data item
            stream.on("end", function(item) {});
            // When the stream is done
            stream.on("close", function() {
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
 * A simple example showing the use of the readstream resume function.
 *
 * @_class readstream
 * @_function resume
 * @ignore
 */
exports.shouldStreamDocumentsUsingTheReadStreamResumeFunction = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
   {auto_reconnect: false, poolSize: 1, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {
    // File id
    var fileId = new ObjectID();
    // Create a file
    var file = new GridStore(db, fileId, "w");
    file.open(function(err, file) {      
      // Write some content and flush to disk
      file.write('Hello world', function(err, file) {        
        file.close(function(err, result) {
          
          // Let's create a read file
          file = new GridStore(db, fileId, "r");
          // Open the file
          file.open(function(err, file) {            
            // Peform a find to get a cursor
            var stream = file.stream();

            // For each data item
            stream.on("data", function(item) {
              // Check if stream is paused
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

            // For each data item
            stream.on("end", function(item) {});
            // When the stream is done
            stream.on("close", function() {
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
 * A simple example showing the use of the readstream destroy function.
 *
 * @_class readstream
 * @_function destroy
 * @ignore
 */
exports.shouldStreamDocumentsUsingTheReadStreamDestroyFunction = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
   {auto_reconnect: false, poolSize: 1, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {
    // File id
    var fileId = new ObjectID();
    // Create a file
    var file = new GridStore(db, fileId, "w");
    file.open(function(err, file) {      
      // Write some content and flush to disk
      file.write('Hello world', function(err, file) {        
        file.close(function(err, result) {
          
          // Let's create a read file
          file = new GridStore(db, fileId, "r");
          // Open the file
          file.open(function(err, file) {            
            // Peform a find to get a cursor
            var stream = file.stream();

            // For each data item
            stream.on("data", function(item) {
              // Destroy the stream
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