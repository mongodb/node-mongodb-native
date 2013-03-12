var mongodb = process.env['TEST_NATIVE'] != null ? require('../../../lib/mongodb').native() : require('../../../lib/mongodb').pure();

var testCase = require('nodeunit').testCase,
  debug = require('util').debug,
  inspect = require('util').inspect,
  path = require('path'),
  nodeunit = require('nodeunit'),
  gleak = require('../../../dev/tools/gleak'),
  Db = mongodb.Db,
  fs = require('fs'),
  Cursor = mongodb.Cursor,
  Collection = mongodb.Collection,
  Server = mongodb.Server,
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

exports.shouldCorrectlyValidateServerSSLCertificate = function(test) {
  if(process.env['JENKINS']) return test.done();
  // Read the ca
  var ca = [fs.readFileSync(__dirname + "/../../certificates/ca.pem")];
  // Create a db connection
  var db1 = new Db(MONGODB, new Server("server", 27017, 
    {   auto_reconnect: false
      , poolSize:1
      , ssl:ssl
      , sslValidate:true
      , sslCA:ca }), {w:0, native_parser: (process.env['TEST_NATIVE'] != null)});
  // All inserted docs
  var docs = [];
  var errs = [];
  var insertDocs = [];
  
  // Start server
  serverManager = new ServerManager({
      auth:false
    , purgedirectories:true
    , journal:true
    , ssl:ssl
    , ssl_server_pem: "../test/certificates/server.pem"
    })
  serverManager.start(true, function() {
    db1.open(function(err, db) {        
      // Create a collection
      db.createCollection('shouldCorrectlyCommunicateUsingSSLSocket', function(err, collection) {
        collection.insert([{a:1}, {b:2}, {c:'hello world'}]);          
        collection.insert([{a:1}, {b:2}, {c:'hello world'}]);          
        collection.insert([{a:1}, {b:2}, {c:'hello world'}]);          
        collection.insert([{a:1}, {b:2}, {c:'hello world'}]);          
        collection.insert([{a:1}, {b:2}, {c:'hello world'}], {w:1}, function(err, result) {
          collection.find({}).toArray(function(err, items) {
            // test.equal(3, items.length);
            db.close();
            test.done();
          })
        });
      });        
    })      
  });
}

exports.shouldFailToValidateServerSSLCertificate = function(test) {
  if(process.env['JENKINS']) return test.done();
  // Read the ca
  var ca = [fs.readFileSync(__dirname + "/../../certificates/mycert.pem")];
  // Create a db connection
  var db1 = new Db(MONGODB, new Server("server", 27017, 
    {   auto_reconnect: false
      , poolSize:1
      , ssl:ssl
      , sslValidate:true
      , sslCA:ca }), {w:0, native_parser: (process.env['TEST_NATIVE'] != null)});
  // All inserted docs
  var docs = [];
  var errs = [];
  var insertDocs = [];
  
  // Start server
  serverManager = new ServerManager({
      auth:false
    , purgedirectories:true
    , journal:true
    , ssl:ssl
    , ssl_server_pem: "../test/certificates/server.pem"
    })
  serverManager.start(true, function() {
    db1.open(function(err, db) {        
      test.ok(err != null);
      test.done();
    })      
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