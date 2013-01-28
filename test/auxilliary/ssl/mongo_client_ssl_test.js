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
  fs = require('fs'),
  ServerManager = require('../../../test/tools/server_manager').ServerManager,
  ReplicaSetManager = require('../../../test/tools/replica_set_manager').ReplicaSetManager,
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
  serverManager = new ServerManager({auth:false, purgedirectories:true, journal:true, ssl:ssl, ssl_server_pem: "../test/certificates/server.pem"})
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

exports.shouldCorrectlyValidateServerCertificate = function(test) {
  if(process.env['JENKINS']) return test.done();
  var db1 = new Db(MONGODB, new Server("127.0.0.1", 27017, {auto_reconnect: false, poolSize:4, ssl:ssl}), {w:0, native_parser: (process.env['TEST_NATIVE'] != null)});
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
  });

  serverManager.start(true, function() {
    // Read the ca
    var ca = [fs.readFileSync(__dirname + "/../../certificates/ca.pem")];
    // Connect and validate the server certificate
    MongoClient.connect("mongodb://server:27017/test?ssl=true&maxPoolSize=1", {
      server: {
          sslValidate:true
        , sslCA:ca
      }
    }, function(err, db) {
      test.equal(null, err);
      test.ok(db != null);

      db.close();
      serverManager.killAll();
      test.done();
    });
  });
}

exports.shouldCorrectlyValidatePresentedServerCertificateAndPresentValidCertificate = function(test) {
  if(process.env['JENKINS']) return test.done();
  var db1 = new Db(MONGODB, new Server("127.0.0.1", 27017, {auto_reconnect: false, poolSize:4, ssl:ssl}), {w:0, native_parser: (process.env['TEST_NATIVE'] != null)});
  // All inserted docs
  var docs = [];
  var errs = [];
  var insertDocs = [];

  // Read the ca
  var ca = [fs.readFileSync(__dirname + "/../../certificates/ca.pem")];
  var cert = fs.readFileSync(__dirname + "/../../certificates/client.pem");
  var key = fs.readFileSync(__dirname + "/../../certificates/client.pem");
  
  // Start server
  serverManager = new ServerManager({
      auth:false
    , purgedirectories:true
    , journal:true
    , ssl:ssl
    , ssl_ca: '../test/certificates/ca.pem'
    , ssl_crl: '../test/certificates/crl.pem'
    , ssl_server_pem: "../test/certificates/server.pem"
    , ssl_force_validate_certificates: true
    , ssl_client_pem: cert
  });

  serverManager.start(true, function() {
    // Connect and validate the server certificate
    MongoClient.connect("mongodb://server:27017/test?ssl=true&maxPoolSize=1", {
      server: {
          sslValidate:true
        , sslCA:ca
        , sslKey:key
        , sslCert:cert
        , sslPass:'10gen'
      }
    }, function(err, db) {
      test.equal(null, err);
      test.ok(db != null);

      db.close();
      serverManager.killAll();
      test.done();
    });
  });
}

exports.shouldValidatePresentedServerCertificateButPresentInvalidCertificate = function(test) {
  if(process.env['JENKINS']) return test.done();
  var db1 = new Db(MONGODB, new Server("127.0.0.1", 27017, {auto_reconnect: false, poolSize:4, ssl:ssl}), {w:0, native_parser: (process.env['TEST_NATIVE'] != null)});
  // All inserted docs
  var docs = [];
  var errs = [];
  var insertDocs = [];

  // Read the ca
  var ca = [fs.readFileSync(__dirname + "/../../certificates/ca.pem")];
  var cert = fs.readFileSync(__dirname + "/../../certificates/client.pem");
  var key = fs.readFileSync(__dirname + "/../../certificates/client.pem");
  
  // Start server
  serverManager = new ServerManager({
      auth:false
    , purgedirectories:true
    , journal:true
    , ssl:ssl
    , ssl_ca: '../test/certificates/ca.pem'
    , ssl_crl: '../test/certificates/crl.pem'
    , ssl_server_pem: "../test/certificates/server.pem"
    , ssl_force_validate_certificates: true
    , ssl_client_pem: cert
  });

  serverManager.start(true, function() {
    // Read the ca
    var cert = fs.readFileSync(__dirname + "/../../certificates/mycert.pem");
    var key = fs.readFileSync(__dirname + "/../../certificates/mycert.pem");
    // Connect and validate the server certificate
    MongoClient.connect("mongodb://server:27017/test?ssl=true&maxPoolSize=1", {
      server: {
          sslValidate:true
        , sslCA:ca
        , sslKey:key
        , sslCert:cert
        , sslPass:'10gen'
      }
    }, function(err, db) {
      test.ok(err != null);

      serverManager.killAll();
      test.done();
    });
  });
}

exports.shouldCorrectlyValidateServerCertificateReplSet = function(test) {
  if(process.env['JENKINS']) return test.done();
  var db1 = new Db(MONGODB, new Server("127.0.0.1", 27017, {auto_reconnect: false, poolSize:4, ssl:ssl}), {w:0, native_parser: (process.env['TEST_NATIVE'] != null)});
  // All inserted docs
  var docs = [];
  var errs = [];
  var insertDocs = [];
  
  var RS = new ReplicaSetManager({retries:120, 
    host: "server",
    ssl:ssl,
    ssl_server_pem: "../test/certificates/server.pem",
    arbiter_count:1,
    secondary_count:2,
    passive_count:1});

  RS.startSet(true, function(err, result) {      
    if(err != null) throw err;

    // Read the ca
    var ca = [fs.readFileSync(__dirname + "/../../certificates/ca.pem")];
    // Connect and validate the server certificate
    MongoClient.connect("mongodb://server:30000,server:30001/test?ssl=true&maxPoolSize=1", {
      replSet: {
          sslValidate:true
        , sslCA:ca
      }
    }, function(err, db) {
      test.equal(null, err);
      test.ok(db != null);

      db.close();
      RS.killAll();
      test.done();
    });
  });
}

exports.shouldCorrectlySendCertificateToReplSetAndValidateServerCertificate = function(test) {
  if(process.env['JENKINS']) return test.done();
  var db1 = new Db(MONGODB, new Server("127.0.0.1", 27017, {auto_reconnect: false, poolSize:4, ssl:ssl}), {w:0, native_parser: (process.env['TEST_NATIVE'] != null)});
  // All inserted docs
  var docs = [];
  var errs = [];
  var insertDocs = [];

  // Read the ca
  var ca = [fs.readFileSync(__dirname + "/../../certificates/ca.pem")];
  var cert = fs.readFileSync(__dirname + "/../../certificates/client.pem");
  var key = fs.readFileSync(__dirname + "/../../certificates/client.pem");
  
  var RS = new ReplicaSetManager({retries:120, 
    host: "server",
    ssl:ssl,
    ssl_ca: '../test/certificates/ca.pem',
    ssl_crl: '../test/certificates/crl.pem',
    ssl_server_pem: "../test/certificates/server.pem",
    ssl_force_validate_certificates: true,    
    ssl_client_pem: cert,

    arbiter_count:1,
    secondary_count:2,
    passive_count:1});

  RS.startSet(true, function(err, result) {      
    if(err != null) throw err;

    // Connect and validate the server certificate
    MongoClient.connect("mongodb://server:30000,server:30001/test?ssl=true&maxPoolSize=1", {
      replSet: {
          sslValidate:true
        , sslCA:ca
        , sslKey:key
        , sslCert:cert
      }
    }, function(err, db) {
      test.equal(null, err);
      test.ok(db != null);

      db.close();
      RS.killAll();
      test.done();
    });
  });
}

exports.shouldSendWrongCertificateToReplSetAndValidateServerCertificate = function(test) {
  if(process.env['JENKINS']) return test.done();
  var db1 = new Db(MONGODB, new Server("127.0.0.1", 27017, {auto_reconnect: false, poolSize:4, ssl:ssl}), {w:0, native_parser: (process.env['TEST_NATIVE'] != null)});
  // All inserted docs
  var docs = [];
  var errs = [];
  var insertDocs = [];

  // Read the ca
  var ca = [fs.readFileSync(__dirname + "/../../certificates/ca.pem")];
  var cert = fs.readFileSync(__dirname + "/../../certificates/client.pem");
  var key = fs.readFileSync(__dirname + "/../../certificates/client.pem");
  
  var RS = new ReplicaSetManager({retries:120, 
    host: "server",
    ssl:ssl,
    ssl_ca: '../test/certificates/ca.pem',
    ssl_crl: '../test/certificates/crl.pem',
    ssl_server_pem: "../test/certificates/server.pem",
    ssl_force_validate_certificates: true,    
    ssl_client_pem: cert,

    arbiter_count:1,
    secondary_count:2,
    passive_count:1});

  RS.startSet(true, function(err, result) {      
    if(err != null) throw err;

    // Present wrong certificate
    var cert = fs.readFileSync(__dirname + "/../../certificates/mycert.pem");
    var key = fs.readFileSync(__dirname + "/../../certificates/mycert.pem");

    // Connect and validate the server certificate
    MongoClient.connect("mongodb://server:30000,server:30001/test?ssl=true&maxPoolSize=1", {
      replSet: {
          sslValidate:true
        , sslCA:ca
        , sslKey:key
        , sslCert:cert
        , sslPass:'10gen'
      }
    }, function(err, db) {
      test.ok(err != null)

      RS.killAll();
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