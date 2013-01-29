var mongodb = process.env['TEST_NATIVE'] != null ? require('../lib/mongodb').native() : require('../lib/mongodb').pure();
var useSSL = process.env['USE_SSL'] != null ? true : false;

var testCase = require('nodeunit').testCase,
  debug = require('util').debug,
  inspect = require('util').inspect,
  nodeunit = require('nodeunit'),
  gleak = require('../dev/tools/gleak'),
  ObjectID = mongodb.ObjectID,
  Code = mongodb.Code,
  Long = mongodb.Long,
  Binary = mongodb.Binary,
  Step = require('step'),
  Db = mongodb.Db,
  ReadPreference = mongodb.ReadPreference,
  Cursor = mongodb.Cursor,
  Collection = mongodb.Collection,
  Server = mongodb.Server;

var MONGODB = 'integration_tests';
var POOL_SIZE = 4;
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

/**
 * Test a simple find
 * @ignore
 */
exports.shouldCorrectlyPerformSimpleFTSQuery = function(test) {
  // client.createCollection('test_find_simple_fts', function(err, collection) {
  //   test.equal(null, err);

  //   collection.ensureIndex({text: "text"}, function(err, result) {
  //     test.equal(null, err);

  //     collection.insert({text: "Hello world"}, function(err, result ){
  //       test.equal(null, err);

  //       client.command({text: "test_find_simple_fts", search: "world"}, {}, function(err, result) {
  //         test.equal(null, err);
  //         test.ok(result.errmsg == null);
  //         test.done();
  //       });
  //     });
  //   });
  // });
  test.done();
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
