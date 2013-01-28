var mongodb = process.env['TEST_NATIVE'] != null ? require('../../../lib/mongodb').native() : require('../../../lib/mongodb').pure();

var testCase = require('nodeunit').testCase,
  debug = require('util').debug,
  inspect = require('util').inspect,
  nodeunit = require('nodeunit'),
  gleak = require('../../../dev/tools/gleak'),
  fs = require('fs'),
  Db = mongodb.Db,
  Cursor = mongodb.Cursor,
  Collection = mongodb.Collection,
  Server = mongodb.Server,
  MongoClient = mongodb.MongoClient,
  ReplSetServers = mongodb.ReplSetServers,
  ReplicaSetManager = require('../../../test/tools/replica_set_manager').ReplicaSetManager,
  Step = require("step");  

var MONGODB = 'integration_tests';
var serverManager = null;
var RS = RS == null ? null : RS;
var ssl = true;

/**
 * Retrieve the server information for the current
 * instance of the db client
 * 
 * @ignore
 */
exports.setUp = function(callback) {
  var cert = fs.readFileSync(__dirname + "/../../certificates/client.pem");

  RS = new ReplicaSetManager({retries:120, 
    host: "server",
    ssl:ssl,
    ssl_ca: '../test/certificates/ca.pem',
    ssl_crl: '../test/certificates/crl.pem',
    ssl_server_pem: "../test/certificates/server.pem",
    ssl_client_pem: cert,

    arbiter_count:1,
    secondary_count:2,
    passive_count:1});
  
  RS.startSet(true, function(err, result) {      
    if(err != null) throw err;
    // Finish setup
    callback();      
  });      
}

/**
 * Retrieve the server information for the current
 * instance of the db client
 * 
 * @ignore
 */
exports.tearDown = function(callback) {
  RS.restartKilledNodes(function(err, result) {
    callback();                
  });
}

exports.shouldCorrectlyValidateAndPresentCertificate = function(test) {
  if(process.env['JENKINS']) return test.done();
  // Read the ca
  var ca = [fs.readFileSync(__dirname + "/../../certificates/ca.pem")];
  var cert = fs.readFileSync(__dirname + "/../../certificates/client.pem");
  var key = fs.readFileSync(__dirname + "/../../certificates/client.pem");

  // Create new 
  var replSet = new ReplSetServers( [ 
      new Server( "server", RS.ports[1], { auto_reconnect: true } ),
      new Server( "server", RS.ports[0], { auto_reconnect: true } ),
    ], 
    {
        rs_name:RS.name
      , ssl:ssl
      , sslValidate:true
      , sslCA:ca
      , sslKey:key
      , sslCert:cert
    }
  );

  // Connect to the replicaset
  var slaveDb = null;
  var db = new Db('foo', replSet, {w:0, native_parser: (process.env['TEST_NATIVE'] != null)});
  db.open(function(err, db) {
    test.equal(null, err);

    // Create a collection
    db.createCollection('shouldCorrectlyValidateAndPresentCertificateReplSet', function(err, collection) {
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
  });
}

exports.shouldFailDuePresentingWrongCredentialsToServer = function(test) {
  if(process.env['JENKINS']) return test.done();
  // Read the ca
  var ca = [fs.readFileSync(__dirname + "/../../certificates/ca.pem")];
  var cert = fs.readFileSync(__dirname + "/../../certificates/mycert.pem");
  var key = fs.readFileSync(__dirname + "/../../certificates/mycert.pem");

  // Create new 
  var replSet = new ReplSetServers( [ 
      new Server( "server", RS.ports[1], { auto_reconnect: true } ),
      new Server( "server", RS.ports[0], { auto_reconnect: true } ),
    ], 
    {
        rs_name:RS.name
      , poolSize:5
      , ssl:ssl
      , sslValidate:true
      , sslCA:ca
      , sslKey:key
      , sslCert:cert
      , sslPass:'10gen'
    }
  );

  // Connect to the replicaset
  var slaveDb = null;
  var db = new Db('foo', replSet, {w:0, native_parser: (process.env['TEST_NATIVE'] != null)});
  db.open(function(err, p_db) {
    test.ok(err != null);
    test.done();
  });
}