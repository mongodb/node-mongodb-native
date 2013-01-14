var mongodb = process.env['TEST_NATIVE'] != null ? require('../../../lib/mongodb').native() : require('../../../lib/mongodb').pure();

var testCase = require('nodeunit').testCase,
  debug = require('util').debug,
  inspect = require('util').inspect,
  nodeunit = require('nodeunit'),
  gleak = require('../../../dev/tools/gleak'),
  Db = mongodb.Db,
  Cursor = mongodb.Cursor,
  Collection = mongodb.Collection,
  Server = mongodb.Server,
  MongoClient = mongodb.MongoClient,
  ServerManager = require('../../../test/tools/server_manager').ServerManager,
  Step = require("step");  

var MONGODB = 'integration_tests';
var serverManager = null;
var ssl = true;

/**
 * Retrieve the server information for the current
 * instance of the db client
 * 
 * @ignore
 */
exports.setUp = function(callback) {
  callback();      
}

/**
 * Retrieve the server information for the current
 * instance of the db client
 * 
 * @ignore
 */
exports.tearDown = function(callback) {
  callback();
}

exports.shouldCorrectlyCommunicateUsingSSLSocket = function(test) {
  if(process.env['JENKINS']) return test.done();
  var db1 = new Db(MONGODB, new Server("127.0.0.1", 27017, {auto_reconnect: false, poolSize:4, ssl:ssl}), {w:0, native_parser: (process.env['TEST_NATIVE'] != null)});
  // All inserted docs
  var docs = [];
  var errs = [];
  var insertDocs = [];
  
  // Start server
  serverManager = new ServerManager({auth:false, purgedirectories:true, journal:true, ssl:ssl})
  serverManager.start(true, function() {
    MongoClient.connect("mongodb://localhost:27017/test?ssl=true", function(err, db) {
      test.equal(null, err);
      test.ok(db != null);

      db.close();
      serverManager.killAll();
      test.done();
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