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

exports.shouldFailDueToNotPresentingCertificateToServer = function(test) {
  if(process.env['JENKINS']) return test.done();
  // Read the ca
  var ca = [fs.readFileSync(__dirname + "/../../certificates/ca.pem")];
  var cert = fs.readFileSync(__dirname + "/../../certificates/client.pem");
  // Create a db connection
  var db1 = new Db(MONGODB, new Server("server", 27017, 
    {   auto_reconnect: false
      , poolSize:1
      , ssl:ssl
      , sslValidate:true
      , sslCA:ca
      , sslCert:cert
    }), {w:0, native_parser: (process.env['TEST_NATIVE'] != null)});
  
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
    , ssl_ca: '../test/certificates/ca.pem'
    , ssl_crl: '../test/certificates/crl.pem'    
    , ssl_server_pem: "../test/certificates/server.pem"
  });

  serverManager.start(true, function() {
    db1.open(function(err, db) {  
      // console.log(err)
      test.ok(err != null);
      test.done();      
    })      
  });
}

exports.shouldCorrectlyValidateAndPresentCertificate = function(test) {
  if(process.env['JENKINS']) return test.done();
  // Read the ca
  var ca = [fs.readFileSync(__dirname + "/../../certificates/ca.pem")];
  var cert = fs.readFileSync(__dirname + "/../../certificates/client.pem");
  var key = fs.readFileSync(__dirname + "/../../certificates/client.pem");
  // Create a db connection
  var db1 = new Db(MONGODB, new Server("server", 27017, 
    {   auto_reconnect: false
      , poolSize:1
      , ssl:ssl
      , sslValidate:true
      , sslCA:ca
      , sslKey:key
      , sslCert:cert
    }), {w:0, native_parser: (process.env['TEST_NATIVE'] != null)});
  
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
    , ssl_ca: '../test/certificates/ca.pem'
    , ssl_crl: '../test/certificates/crl.pem'    
    , ssl_server_pem: "../test/certificates/server.pem"
  });

  serverManager.start(true, function() {
    db1.open(function(err, db) {        
      // Create a collection
      db.createCollection('shouldCorrectlyValidateAndPresentCertificate', function(err, collection) {
        collection.remove({});
        collection.insert([{a:1}, {b:2}, {c:'hello world'}]);          
        collection.insert([{a:1}, {b:2}, {c:'hello world'}]);          
        collection.insert([{a:1}, {b:2}, {c:'hello world'}]);          
        collection.insert([{a:1}, {b:2}, {c:'hello world'}]);          
        collection.insert([{a:1}, {b:2}, {c:'hello world'}], {w:1}, function(err, result) {
          collection.find({}).toArray(function(err, items) {
            test.equal(15, items.length);
            db.close();
            test.done();
          })
        });
      });        
    })      
  });
}

exports.shouldFailDuePresentingWrongCredentialsToServer = function(test) {
  if(process.env['JENKINS']) return test.done();
  // Read the ca
  var ca = [fs.readFileSync(__dirname + "/../../certificates/ca.pem")];
  var cert = fs.readFileSync(__dirname + "/../../certificates/smoke.pem");
  var key = fs.readFileSync(__dirname + "/../../certificates/smoke.pem");
  // Create a db connection
  var db1 = new Db(MONGODB, new Server("server", 27017, 
    {   auto_reconnect: false
      , poolSize:1
      , ssl:ssl
      , sslValidate:true
      , sslCA:ca
      , sslKey:key
      , sslCert:cert
    }), {w:0, native_parser: (process.env['TEST_NATIVE'] != null)});
  
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
    , ssl_ca: '../test/certificates/ca.pem'
    , ssl_crl: '../test/certificates/crl.pem'    
    , ssl_server_pem: "../test/certificates/server.pem"
  });

  serverManager.start(true, function() {
    db1.open(function(err, db) {  
      test.ok(err != null);
      test.done();      
    })      
  });
}

exports.shouldCorrectlyPresentPasswordProtectedCertificate = function(test) {
  if(process.env['JENKINS']) return test.done();
  // Read the ca
  var ca = [fs.readFileSync(__dirname + "/../../certificates/ca.pem")];
  var cert = fs.readFileSync(__dirname + "/../../certificates/password_protected.pem");
  var key = fs.readFileSync(__dirname + "/../../certificates/password_protected.pem");
  // Create a db connection
  var db1 = new Db(MONGODB, new Server("server", 27017, 
    {   auto_reconnect: false
      , poolSize:1
      , ssl:ssl
      , sslValidate:true
      , sslCA:ca
      , sslKey:key
      , sslCert:cert
      , sslPass:'qwerty'
    }), {w:0, native_parser: (process.env['TEST_NATIVE'] != null)});
  
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
    , ssl_ca: '../test/certificates/ca.pem'
    , ssl_crl: '../test/certificates/crl.pem'    
    , ssl_server_pem: "../test/certificates/server.pem"
  });

  serverManager.start(true, function() {
    db1.open(function(err, db) {  
      // Create a collection
      db.createCollection('shouldCorrectlyValidateAndPresentCertificate', function(err, collection) {
        collection.remove({});
        collection.insert([{a:1}, {b:2}, {c:'hello world'}]);          
        collection.insert([{a:1}, {b:2}, {c:'hello world'}]);          
        collection.insert([{a:1}, {b:2}, {c:'hello world'}]);          
        collection.insert([{a:1}, {b:2}, {c:'hello world'}]);          
        collection.insert([{a:1}, {b:2}, {c:'hello world'}], {w:1}, function(err, result) {
          collection.find({}).toArray(function(err, items) {
            test.equal(15, items.length);
            db.close();
            test.done();
          })
        });
      });        
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