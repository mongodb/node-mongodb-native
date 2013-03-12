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
  RS = new ReplicaSetManager({retries:120, 
    host: "server",
    ssl:ssl,
    ssl_server_pem: "../test/certificates/server.pem",
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

exports.shouldCorrectlyConncetToSSLBasedReplicaset = function(test) {
  // Read the ca
  var ca = [fs.readFileSync(__dirname + "/../../certificates/ca.pem")];
  // Create new 
  var replSet = new ReplSetServers( [ 
      new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
    ], 
    {
        rs_name:RS.name
      , ssl:ssl
      , sslValidate:true
      , sslCA:ca
    }
  );
  
  // Connect to the replicaset
  var slaveDb = null;
  var db = new Db('foo', replSet, {w:0, native_parser: (process.env['TEST_NATIVE'] != null)});
  db.open(function(err, p_db) {
    test.equal(null, err);
    test.done();
    p_db.close();
  });
}

exports.shouldFailToValidateServerSSLCertificate = function(test) {
  // Read the ca
  var ca = [fs.readFileSync(__dirname + "/../../certificates/mycert.pem")];
  // Create new 
  var replSet = new ReplSetServers( [ 
      new Server( RS.host, RS.ports[1], { auto_reconnect: true } ),
      new Server( RS.host, RS.ports[0], { auto_reconnect: true } ),
    ], 
    {
        rs_name:RS.name
      , ssl:ssl
      , sslValidate:true
      , sslCA:ca
      , poolSize:5
    }
  );
  
  // Connect to the replicaset
  var slaveDb = null;
  var db = new Db('foo', replSet, {w:0, native_parser: (process.env['TEST_NATIVE'] != null)});
  db.open(function(err, p_db) {
    console.dir(err)
    test.ok(err != null);
    test.ok(err instanceof Error);
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