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

/**
 * Test the authentication method for the user
 *
 * @ignore
 */
exports['Should correctly connect to server using domain socket'] = function(test) {

  var db = new Db(MONGODB, new Server("/tmp/mongodb-27017.sock", {w:0, auto_reconnect: true, poolSize: 4, ssl:useSSL}), {w:0, native_parser: (process.env['TEST_NATIVE'] != null)});  
  db.open(function(err, db) {

    db.collection("domainSocketCollection").insert({a:1}, {w:1}, function(err, item) {
      test.equal(null, err);

      db.collection("domainSocketCollection").find({a:1}).toArray(function(err, items) {
        test.equal(null, err);
        test.equal(1, items.length);
  
        db.close();
        test.done();
      });
    });
  });
}

// /**
//  * Retrieve the server information for the current
//  * instance of the db client
//  *
//  * @ignore
//  */
// exports.noGlobalsLeaked = function(test) {
//   var leaks = gleak.detectNew();
//   test.equal(0, leaks.length, "global var leak detected: " + leaks.join(', '));
//   test.done();
// }

/**
 * Retrieve the server information for the current
 * instance of the db client
 *
 * @ignore
 */
var numberOfTestsRun = Object.keys(this).length - 2;