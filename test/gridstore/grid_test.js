var mongodb = process.env['TEST_NATIVE'] != null ? require('../../lib/mongodb').native() : require('../../lib/mongodb').pure();

var testCase = require('../../deps/nodeunit').testCase,
  debug = require('util').debug,
  inspect = require('util').inspect,
  nodeunit = require('../../deps/nodeunit'),
  gleak = require('../../dev/tools/gleak'),
  Db = mongodb.Db,
  Cursor = mongodb.Cursor,
  Collection = mongodb.Collection,
  GridStore = mongodb.GridStore,
  Grid = mongodb.Grid,
  Chunk = mongodb.Chunk,
  Server = mongodb.Server;

var MONGODB = 'integration_tests';
var client = new Db(MONGODB, new Server("127.0.0.1", 27017, {auto_reconnect: true, poolSize: 4}), {native_parser: (process.env['TEST_NATIVE'] != null)});
var useSSL = process.env['USE_SSL'] != null ? true : false;
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
 * A simple example showing the usage of the put method.
 *
 * @_class grid
 * @_function put
 * @ignore
 */
exports.shouldPutFileCorrectlyToGridUsingObjectId = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
   {auto_reconnect: false, poolSize: 1, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {
    // Create a new grid instance
    var grid = new Grid(db, 'fs');    
    // Some data to write
    var originalData = new Buffer('Hello world');
    // Write data to grid
    grid.put(originalData, {}, function(err, result) {
      // Fetch the content
      grid.get(result._id, function(err, data) {
        test.deepEqual(originalData.toString('hex'), data.toString('hex'));
      
        db.close();
        test.done();
      });
    });
  });
}

/**
 * A simple example showing the usage of the get method.
 *
 * @_class grid
 * @_function get
 * @ignore
 */
exports.shouldPutAndGetFileCorrectlyToGridUsingObjectId = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
   {auto_reconnect: false, poolSize: 1, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {
    // Create a new grid instance
    var grid = new Grid(db, 'fs');    
    // Some data to write
    var originalData = new Buffer('Hello world');
    // Write data to grid
    grid.put(originalData, {}, function(err, result) {
      // Fetch the content
      grid.get(result._id, function(err, data) {
        test.deepEqual(originalData.toString('base64'), data.toString('base64'));
      
        // Should fail due to illegal objectID
        grid.get('not an id', function(err, result) {
          test.ok(err != null);
        
          db.close();
          test.done();
        });
      });
    });
  });
}

/**
 * @ignore
 */
exports.shouldFailToPutFileDueToDataObjectNotBeingBuffer = function(test) {
  var grid = new Grid(client, 'fs');    
  var originalData = 'Hello world';
  // Write data to grid
  grid.put(originalData, {}, function(err, result) {
    test.ok(err != null);
    test.done();
  })    
}

/**
 * A simple example showing the usage of the delete method.
 *
 * @_class grid
 * @_function delete
 * @ignore
 */
exports.shouldCorrectlyWriteFileAndThenDeleteIt = function(test) {
  var db = new Db('integration_tests', new Server("127.0.0.1", 27017, 
   {auto_reconnect: false, poolSize: 1, ssl:useSSL}), {native_parser: native_parser});

  // Establish connection to db  
  db.open(function(err, db) {
    // Create a new grid instance
    var grid = new Grid(client, 'fs');    
    // Some data to write
    var originalData = new Buffer('Hello world');
    // Write data to grid
    grid.put(originalData, {}, function(err, result) {

      // Delete file
      grid.delete(result._id, function(err, result2) {
        test.equal(null, err);
        test.equal(true, result2);
      
        // Fetch the content, showing that the file is gone
        grid.get(result._id, function(err, data) {
          test.ok(err != null);
          test.equal(null, data);
          
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