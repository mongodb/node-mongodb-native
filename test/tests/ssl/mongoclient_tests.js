var fs = require('fs');

/**
 * @ignore
 */
exports.shouldCorrectlyCommunicateUsingSSLSocket = function(configuration, test) {
  var ServerManager = require('../../tools/server_manager').ServerManager
    , MongoClient = configuration.getMongoPackage().MongoClient;

  // All inserted docs
  var docs = [];
  var errs = [];
  var insertDocs = [];

  // Start server
  serverManager = new ServerManager({auth:false, purgedirectories:true, journal:true, ssl:true, ssl_server_pem: "../test/tests/ssl/certificates/server.pem"})
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
 * @ignore
 */
exports.shouldCorrectlyValidateServerCertificate = function(configuration, test) {
  var ServerManager = require('../../tools/server_manager').ServerManager
    , MongoClient = configuration.getMongoPackage().MongoClient;

  // All inserted docs
  var docs = [];
  var errs = [];
  var insertDocs = [];

  // Read the ca
  var ca = [fs.readFileSync(__dirname + "/certificates/ca.pem")];

  // Start server
  serverManager = new ServerManager({
      auth:false
    , purgedirectories:true
    , journal:true
    , ssl:true
    , ssl_server_pem: "../test/tests/ssl/certificates/server.pem"
    // EnsureUp options
    , host: 'server'
    , sslCA:ca
  });

  serverManager.start(true, function() {
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

/**
 * @ignore
 */
exports.shouldCorrectlyValidatePresentedServerCertificateAndPresentValidCertificate = function(configuration, test) {
  var ServerManager = require('../../tools/server_manager').ServerManager
    , MongoClient = configuration.getMongoPackage().MongoClient;

  // All inserted docs
  var docs = [];
  var errs = [];
  var insertDocs = [];

  // Read the ca
  var ca = [fs.readFileSync(__dirname + "/certificates/ca.pem")];
  var cert = fs.readFileSync(__dirname + "/certificates/client.pem");
  var key = fs.readFileSync(__dirname + "/certificates/client.pem");
  
  // Start server
  serverManager = new ServerManager({
      auth:false
    , purgedirectories:true
    , journal:true
    , ssl:true
    , ssl_ca: '../test/tests/ssl/certificates/ca.pem'
    , ssl_crl: '../test/tests/ssl/certificates/crl.pem'
    , ssl_server_pem: "../test/tests/ssl/certificates/server.pem"
    , ssl_force_validate_certificates: true
    , ssl_client_pem: cert
    // EnsureUp options
    , host: 'server'
    , sslValidate:true
    , sslCA:ca
    , sslKey:key
    , sslCert:cert
    // , sslPass:'qwerty'
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

/**
 * @ignore
 */
exports.shouldValidatePresentedServerCertificateButPresentInvalidCertificate = function(configuration, test) {
  var ServerManager = require('../../tools/server_manager').ServerManager
    , MongoClient = configuration.getMongoPackage().MongoClient;

  // All inserted docs
  var docs = [];
  var errs = [];
  var insertDocs = [];

  // Read the ca
  var ca = [fs.readFileSync(__dirname + "/certificates/ca.pem")];
  var cert = fs.readFileSync(__dirname + "/certificates/client.pem");
  var key = fs.readFileSync(__dirname + "/certificates/client.pem");
  
  // Start server
  serverManager = new ServerManager({
      auth:false
    , purgedirectories:true
    , journal:true
    , ssl:true
    , ssl_ca: '../test/tests/ssl/certificates/ca.pem'
    , ssl_crl: '../test/tests/ssl/certificates/crl.pem'
    , ssl_server_pem: "../test/tests/ssl/certificates/server.pem"
    , ssl_force_validate_certificates: true
    , ssl_client_pem: cert
    // EnsureUp options
    , host: 'server'
    , sslValidate:true
    , sslCA:ca
    , sslKey:key
    , sslCert:cert
    // , sslPass:'qwerty'
  });

  serverManager.start(true, function() {
    // Read the ca
    var cert = fs.readFileSync(__dirname + "/certificates/mycert.pem");
    var key = fs.readFileSync(__dirname + "/certificates/mycert.pem");
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

/**
 * @ignore
 */
exports.shouldCorrectlyValidateServerCertificateReplSet = function(configuration, test) {
  var ReplicaSetManager = require('../../tools/replica_set_manager').ReplicaSetManager
    , MongoClient = configuration.getMongoPackage().MongoClient;
  // All inserted docs
  var docs = [];
  var errs = [];
  var insertDocs = [];
  
  // Read the ca
  var ca = [fs.readFileSync(__dirname + "/certificates/ca.pem")];

  var RS = new ReplicaSetManager({retries:120, 
      host: "server"
    , ssl:true
    , ssl_server_pem: "../test/tests/ssl/certificates/server.pem"
    , arbiter_count:1
    , secondary_count:2
    , passive_count:1
  });

  RS.startSet(true, function(err, result) {      
    if(err != null) throw err;
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

/**
 * @ignore
 */
exports.shouldCorrectlySendCertificateToReplSetAndValidateServerCertificate = function(configuration, test) {
  var ReplicaSetManager = require('../../tools/replica_set_manager').ReplicaSetManager
    , MongoClient = configuration.getMongoPackage().MongoClient;
  // All inserted docs
  var docs = [];
  var errs = [];
  var insertDocs = [];

  // Read the ca
  var ca = [fs.readFileSync(__dirname + "/certificates/ca.pem")];
  var cert = fs.readFileSync(__dirname + "/certificates/client.pem");
  var key = fs.readFileSync(__dirname + "/certificates/client.pem");
  
  var RS = new ReplicaSetManager({retries:120, 
    host: "server",
    ssl:true,
    ssl_ca: '../test/tests/ssl/certificates/ca.pem',
    ssl_crl: '../test/tests/ssl/certificates/crl.pem',
    ssl_server_pem: "../test/tests/ssl/certificates/server.pem",
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

/**
 * @ignore
 */
exports.shouldSendWrongCertificateToReplSetAndValidateServerCertificate = function(configuration, test) {
  var ReplicaSetManager = require('../../tools/replica_set_manager').ReplicaSetManager
    , MongoClient = configuration.getMongoPackage().MongoClient;
  // All inserted docs
  var docs = [];
  var errs = [];
  var insertDocs = [];

  // Read the ca
  var ca = [fs.readFileSync(__dirname + "/certificates/ca.pem")];
  var cert = fs.readFileSync(__dirname + "/certificates/client.pem");
  var key = fs.readFileSync(__dirname + "/certificates/client.pem");
  
  var RS = new ReplicaSetManager({retries:120, 
    host: "server",
    ssl:true,
    ssl_ca: '../test/tests/ssl/certificates/ca.pem',
    ssl_crl: '../test/tests/ssl/certificates/crl.pem',
    ssl_server_pem: "../test/tests/ssl/certificates/server.pem",
    ssl_force_validate_certificates: true,    
    ssl_client_pem: cert,

    arbiter_count:1,
    secondary_count:2,
    passive_count:1});

  RS.startSet(true, function(err, result) {      
    if(err != null) throw err;

    // Present wrong certificate
    var cert = fs.readFileSync(__dirname + "/certificates/mycert.pem");
    var key = fs.readFileSync(__dirname + "/certificates/mycert.pem");

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
 * @ignore
 */
exports['Should correctly shut down if attempting to connect to ssl server with wrong parameters'] = function(configuration, test) {
  var ServerManager = require('../../tools/server_manager').ServerManager
    , MongoClient = configuration.getMongoPackage().MongoClient;

  // All inserted docs
  var docs = [];
  var errs = [];
  var insertDocs = [];

  // Start server
  serverManager = new ServerManager({auth:false, purgedirectories:true, journal:true, ssl:true, ssl_server_pem: "../test/tests/ssl/certificates/server.pem"})
  serverManager.start(true, function() {
    MongoClient.connect("mongodb://localhost:27017/test?ssl=false", function(err, db) {
      if(db == null) {
        test.ok(err != null)
      } else {
        db.close();
      }
      // test.ok(err != null);

      // console.log("================================================ 0")
      // console.dir(err)
      // console.dir(db)
      // test.equal(null, err);
      // test.ok(db != null);


      // db.close();
      serverManager.killAll();
      test.done();
    });
  });
}









