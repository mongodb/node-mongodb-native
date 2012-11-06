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
var native_parser = (process.env['TEST_NATIVE'] != null);
var client = null;

exports.setUp = function(callback) {
  callback();
}

exports.tearDown = function(callback) {
  callback();
}

exports['Should correctly connect via domain socket'] = function(test) {
  if(process.platform != "win32") {
    Db.connect("mongodb:///tmp/mongodb-27017.sock?safe=false", function(err, db) {
      test.equal(null, err);
      db.close();
      test.done();
    });
  } else { 
    test.done();
  }
}

exports['Should correctly connect via normal url using connect'] = function(test) {
  mongodb.connect("mongodb://localhost?safe=false", function(err, db) {
    test.equal(false, db.safe);
    db.close();
    test.done();
  });
}

exports['Should correctly connect via normal url using require'] = function(test) {
  require('../lib/mongodb')("mongodb://localhost?safe=false", function(err, db) {
    test.equal(false, db.safe);
    db.close();
    test.done();
  });
}

exports['Should correctly connect via normal url'] = function(test) {
  Db.connect("mongodb://localhost?safe=false", function(err, db) {
    test.equal(false, db.safe);
    db.close();
    test.done();
  });
}

exports['Should correctly connect via normal url'] = function(test) {
  Db.connect("mongodb://localhost?journal=true", function(err, db) {
    // test.equal(false, db.safe);
    db.close();
    test.done();
  });
}

exports['Should correctly connect via normal url'] = function(test) {
  Db.connect("mongodb://localhost?journal=true", function(err, db) {
    test.deepEqual({j:true}, db.safe);
    db.close();
    test.done();
  });
}

exports['Should correctly connect via normal url using ip'] = function(test) {
  Db.connect("mongodb://127.0.0.1:27017?fsync=true", function(err, db) {
    test.deepEqual({fsync:true}, db.safe);
    db.close();
    test.done();
  });
}

exports['Should correctly connect via normal url setting up poolsize of 1'] = function(test) {
  Db.connect("mongodb://127.0.0.1:27017?maxPoolSize=1", function(err, db) {
    test.deepEqual(1, db.serverConfig.poolSize);
    db.close();
    test.done();
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