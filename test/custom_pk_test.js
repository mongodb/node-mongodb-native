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

exports.shouldCreateRecordsWithCustomPKFactory = function(test) {
  // Custom factory (need to provide a 12 byte array);
  var CustomPKFactory = function() {}
  CustomPKFactory.prototype = new Object();
  CustomPKFactory.createPk = function() {
    return new ObjectID("aaaaaaaaaaaa");
  }

  var p_client = new Db(MONGODB, new Server("127.0.0.1", 27017, {ssl:useSSL}), {'pk':CustomPKFactory, native_parser: (process.env['TEST_NATIVE'] != null)});
  p_client.open(function(err, p_client) {
    p_client.dropDatabase(function(err, done) {
      p_client.createCollection('test_custom_key', function(err, collection) {
        collection.insert({'a':1}, {safe:true}, function(err, doc) {
          collection.find({'_id':new ObjectID("aaaaaaaaaaaa")}, function(err, cursor) {
            cursor.toArray(function(err, items) {
              test.equal(1, items.length);

              p_client.close();
              test.done();
            });
          });
        });
      });
    });
  });
}

exports.testConnectBadUrl = function(test) {
  test.throws(function() {
    connect('mango://localhost:27017/' + MONGODB, function(err, db) {
      test.ok(false, 'Bad URL!');
    });
  });
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