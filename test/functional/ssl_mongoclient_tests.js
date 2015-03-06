"use strict";

var fs = require('fs');

/**
 * @ignore
 */
exports.shouldCorrectlyCommunicateUsingSSLSocket = {
  metadata: { requires: { topology: 'ssl' } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var ServerManager = require('mongodb-tools').ServerManager
      , MongoClient = configuration.require.MongoClient;

    // All inserted docs
    var docs = [];
    var errs = [];
    var insertDocs = [];

    // Start server
    var serverManager = new ServerManager({
        journal: null
      , sslOnNormalPorts: null
      , sslPEMKeyFile: __dirname + "/ssl/server.pem"
    });

    // Start the server
    serverManager.start({purge:true, kill:true, signal:-9}, function(err) {
      console.dir(err)
      test.equal(null, err);
      
      // Connect
      MongoClient.connect("mongodb://localhost:27017/test?ssl=true", function(err, db) {
        test.equal(null, err);
        test.ok(db != null);

        db.close();

        serverManager.stop(function() {
          test.done();
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyValidateServerCertificate = {
  metadata: { requires: { topology: 'ssl' } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var ServerManager = require('mongodb-tools').ServerManager
      , MongoClient = configuration.require.MongoClient;

    // All inserted docs
    var docs = [];
    var errs = [];
    var insertDocs = [];

    // Read the ca
    var ca = [fs.readFileSync(__dirname + "/ssl/ca.pem")];

    // Start server
    var serverManager = new ServerManager({
        journal:null
      , sslOnNormalPorts: null
      , sslPEMKeyFile: __dirname + "/ssl/server.pem"
      // EnsureUp options
      , host: 'server'
      , ca:ca
    });

    serverManager.start({purge:true, kill:true, signal:-9}, function() {

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

        serverManager.stop(function() {
          test.done();
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports['should fail to validate certificate due to illegal host name'] = {
  metadata: { requires: { topology: 'ssl' } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var ServerManager = require('mongodb-tools').ServerManager
      , MongoClient = configuration.require.MongoClient;

    // All inserted docs
    var docs = [];
    var errs = [];
    var insertDocs = [];

    // Read the ca
    var ca = [fs.readFileSync(__dirname + "/ssl/ca.pem")];

    // Start server
    var serverManager = new ServerManager({
        journal:null
      , sslOnNormalPorts: null
      , sslPEMKeyFile: __dirname + "/ssl/server.pem"
      // EnsureUp options
      , host: 'server'
      , ca:ca
    });

    serverManager.start({purge:true, kill:true, signal:-9}, function() {

      // Connect and validate the server certificate
      MongoClient.connect("mongodb://localhost:27017/test?ssl=true&maxPoolSize=1", {
        server: {
            sslValidate:true
          , sslCA:ca
        }
      }, function(err, db) {
        test.ok(err != null);

        serverManager.stop(function() {
          test.done();
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyValidatePresentedServerCertificateAndPresentValidCertificate = {
  metadata: { requires: { topology: 'ssl' } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var ServerManager = require('mongodb-tools').ServerManager
      , MongoClient = configuration.require.MongoClient;

    // All inserted docs
    var docs = [];
    var errs = [];
    var insertDocs = [];

    // Read the ca
    var ca = [fs.readFileSync(__dirname + "/ssl/ca.pem")];
    var cert = fs.readFileSync(__dirname + "/ssl/client.pem");
    var key = fs.readFileSync(__dirname + "/ssl/client.pem");
    
    // Start server
    var serverManager = new ServerManager({
        journal:null
      , sslOnNormalPorts: null
      , sslCAFile: __dirname + "/ssl/ca.pem"
      , sslCRLFile: __dirname + "/ssl/crl.pem"
      , sslPEMKeyFile: __dirname + "/ssl/server.pem"
      // EnsureUp options
      , host: 'server'
      , rejectUnauthorized:true
      , ca:ca
      , key:key
      , cert:cert
    });

    serverManager.start({purge:true, kill:true, signal:-9}, function() {
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

        serverManager.stop(function() {
          test.done();
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldValidatePresentedServerCertificateButPresentInvalidCertificate = {
  metadata: { requires: { topology: 'ssl' } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var ServerManager = require('mongodb-tools').ServerManager
      , MongoClient = configuration.require.MongoClient;

    // All inserted docs
    var docs = [];
    var errs = [];
    var insertDocs = [];

    // Read the ca
    var ca = [fs.readFileSync(__dirname + "/ssl/ca.pem")];
    var cert = fs.readFileSync(__dirname + "/ssl/client.pem");
    var key = fs.readFileSync(__dirname + "/ssl/client.pem");

    // Start server
    var serverManager = new ServerManager({
        journal:null
      , ssl:true
      , fork: null
      , sslMode: 'requireSSL'
      , sslCAFile: __dirname + "/ssl/ca.pem"
      , sslCRLFile: __dirname + "/ssl/crl.pem"
      , sslPEMKeyFile: __dirname + "/ssl/server.pem"
      // EnsureUp options
      , host: 'server'
      , rejectUnauthorized:true
      , ca:ca
      , key:key
      , cert:cert
    });

    serverManager.start({purge:true, kill:true, signal:-9}, function() {

      // Read the ca
      var cert = fs.readFileSync(__dirname + "/ssl/mycert.pem");
      var key = fs.readFileSync(__dirname + "/ssl/mycert.pem");
      
      // Connect and validate the server certificate
      MongoClient.connect("mongodb://server:27017/test?ssl=true&maxPoolSize=1", {
        server: {
            ssl:true
          , sslValidate:true
          , sslCA:ca
          , sslKey:key
          , sslCert:cert
          , sslPass:'10gen'
        }
      }, function(err, db) {
        test.ok(err != null);

        serverManager.stop(function() {
          test.done();
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports['Should correctly shut down if attempting to connect to ssl server with wrong parameters'] = {
  metadata: { requires: { topology: 'ssl' } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var ServerManager = require('mongodb-tools').ServerManager
      , MongoClient = configuration.require.MongoClient;

    // All inserted docs
    var docs = [];
    var errs = [];
    var insertDocs = [];

    // Start server
    var serverManager = new ServerManager({
        journal: null
      , sslOnNormalPorts: null
      , sslPEMKeyFile: __dirname + "/ssl/server.pem"
    });

    // Start server
    serverManager.start({purge:true, kill:true, signal:-9}, function() {
      MongoClient.connect("mongodb://localhost:27017/test?ssl=false", function(err, db) {
        test.ok(err != null);

        serverManager.stop(function() {
          test.done();
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports['should correctly connect using SSL to ReplSetManager'] = {
  metadata: { requires: { topology: 'ssl' } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var ReplSetManager = require('mongodb-tools').ReplSetManager
      , MongoClient = configuration.require.MongoClient;

    // All inserted docs
    var docs = [];
    var errs = [];
    var insertDocs = [];
    
    // Read the ca
    var ca = [fs.readFileSync(__dirname + "/ssl/ca.pem")];
    var cert = fs.readFileSync(__dirname + "/ssl/client.pem");
    var key = fs.readFileSync(__dirname + "/ssl/client.pem");

    var replicasetManager = new ReplSetManager({
        host: "server"
      , sslOnNormalPorts: null
      , sslPEMKeyFile: __dirname + "/ssl/server.pem"
      , secondaries:2
      // EnsureUp options
      , ssl: true
      , rejectUnauthorized:false
      , ca:ca
    });

    replicasetManager.start({kill: true, purge:true, signal: -9}, function(err, result) {      
      if(err != null) throw err;
      // Connect and validate the server certificate
      MongoClient.connect("mongodb://server:31000/test?ssl=true&replicaSet=rs&maxPoolSize=1", {
        replSet: {
            ssl:true
          , sslValidate:false
          , sslCA:ca
        }        
      }, function(err, db) {
        test.equal(null, err);
        test.ok(db != null);

        db.close();

        replicasetManager.stop(function() {
          test.done();
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlySendCertificateToReplSetAndValidateServerCertificate = {
  metadata: { requires: { topology: 'ssl' } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var ReplSetManager = require('mongodb-tools').ReplSetManager
      , MongoClient = configuration.require.MongoClient;
    // All inserted docs
    var docs = [];
    var errs = [];
    var insertDocs = [];

    // Read the ca
    var ca = [fs.readFileSync(__dirname + "/ssl/ca.pem")];
    var cert = fs.readFileSync(__dirname + "/ssl/client.pem");
    var key = fs.readFileSync(__dirname + "/ssl/client.pem");
    
    var replSetManager = new ReplSetManager({
      // SSL information
      host: "server",
      ssl:true,
      sslPEMKeyFile: __dirname + "/ssl/server.pem",
      sslCAFile: __dirname + "/ssl/ca.pem",
      sslCRLFile: __dirname + "/ssl/crl.pem",
      sslMode: 'requireSSL',

      // The client certificate
      key: cert,
      cert: cert,
      rejectUnauthorized: false,

      // ReplSet settings
      secondaries: 2
    });

    replSetManager.start({kill: true, purge:true, signal: -9}, function(err, result) {      
      if(err != null) throw err;
      // Connect and validate the server certificate
      MongoClient.connect("mongodb://server:31000,server:31001/test?ssl=true&replicaSet=rs&maxPoolSize=1", {
        replSet: {
            sslValidate:false
          , sslCA:ca
          , sslKey:key
          , sslCert:cert
        }
      }, function(err, db) {
        test.equal(null, err);
        test.ok(db != null);

        db.close();

        replSetManager.stop(function() {
          test.done();
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldSendWrongCertificateToReplSetAndValidateServerCertificate = {
  metadata: { requires: { topology: 'ssl' } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var ReplSetManager = require('mongodb-tools').ReplSetManager
      , MongoClient = configuration.require.MongoClient;
    // All inserted docs
    var docs = [];
    var errs = [];
    var insertDocs = [];

    // Read the ca
    var ca = [fs.readFileSync(__dirname + "/ssl/ca.pem")];
    var cert = fs.readFileSync(__dirname + "/ssl/client.pem");
    var key = fs.readFileSync(__dirname + "/ssl/client.pem");
    
    var replSetManager = new ReplSetManager({
      // SSL information
      host: "server",
      ssl:true,
      sslPEMKeyFile: __dirname + "/ssl/server.pem",
      sslCAFile: __dirname + "/ssl/ca.pem",
      sslCRLFile: __dirname + "/ssl/crl.pem",
      sslMode: 'requireSSL',

      // The client certificate
      key: cert,
      cert: cert,
      rejectUnauthorized: false,

      // ReplSet settings
      secondaries: 2
    });

    replSetManager.start({kill: true, purge:true, signal: -9}, function(err, result) {      
      if(err != null) throw err;

      // Present wrong certificate
      var cert = fs.readFileSync(__dirname + "/ssl/mycert.pem");
      var key = fs.readFileSync(__dirname + "/ssl/mycert.pem");

      // Connect and validate the server certificate
      MongoClient.connect("mongodb://server:31000,server:31001/test?ssl=true&replicaSet=rs&maxPoolSize=1", {
        replSet: {
            sslValidate:true
          , sslCA:ca
          , sslKey:key
          , sslCert:cert
          , sslPass: '10gen'
        }
      }, function(err, db) {
        test.ok(err != null)

        replSetManager.stop(function() {
          test.done();
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports['should correctly to replicaset using ssl connect with password'] = {
  metadata: { requires: { topology: 'ssl' } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var ReplSetManager = require('mongodb-tools').ReplSetManager
      , MongoClient = configuration.require.MongoClient;
    // All inserted docs
    var docs = [];
    var errs = [];
    var insertDocs = [];

    // Read the ca
    var ca = [fs.readFileSync(__dirname + "/ssl/ca.pem")];
    var cert = fs.readFileSync(__dirname + "/ssl/client.pem");
    var key = fs.readFileSync(__dirname + "/ssl/client.pem");
    
    var replSetManager = new ReplSetManager({
      // SSL information
      host: "server",
      ssl:true,
      sslPEMKeyFile: __dirname + "/ssl/server.pem",
      sslCAFile: __dirname + "/ssl/ca.pem",
      sslCRLFile: __dirname + "/ssl/crl.pem",
      sslMode: 'requireSSL',

      // The client certificate
      key: cert,
      cert: cert,
      rejectUnauthorized: false,

      // ReplSet settings
      secondaries: 2
    });

    replSetManager.start({kill: true, purge:true, signal: -9}, function(err, result) {      
      if(err != null) throw err;

      // Connect and validate the server certificate
      MongoClient.connect("mongodb://server:31000,server:31001/test?ssl=true&replicaSet=rs&maxPoolSize=1", {
        replSet: {
            sslValidate:true
          , sslCA:ca
          , sslKey:key
          , sslCert:cert
          , sslPass: '10gen'
        }
      }, function(err, db) {
        test.equal(null, err)

        replSetManager.stop(function() {
          test.done();
        });
      });
    });
  }
}

