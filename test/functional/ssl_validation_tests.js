"use strict";

var fs = require('fs');
var replSetManager;

var setUp = function(configuration, options, callback) {
  var ReplSetManager = require('mongodb-tools').ReplSetManager
    , Db = configuration.require.Db
    , Server = configuration.require.Server
    , MongoClient = configuration.require.MongoClient;

  // Check if we have any options
  if(typeof options == 'function') callback = options, options = null;

  // Load the cert
  var cert = fs.readFileSync(__dirname + "/ssl/client.pem");

  // Default rs options
  var rsOptions = {
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
  }

  // Override options
  if(options) rsOptions = options;

  // Create Replicaset Manager
  replSetManager = new ReplSetManager(rsOptions);

  // Start SSL replicaset manager
  replSetManager.start({kill: true, purge:true, signal: -9}, function(err, result) {      
    if(err != null) throw err;
    // Finish setup
    callback();      
  });      
}

/**
 * @ignore
 */
exports.shouldFailDuePresentingWrongCredentialsToServer = {
  metadata: { requires: { topology: 'ssl' } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var ReplSetManager = require('mongodb-tools').ReplSetManager
      , Db = configuration.require.Db
      , Server = configuration.require.Server
      , ReplSet = configuration.require.ReplSet
      , MongoClient = configuration.require.MongoClient;

    setUp(configuration, function() {
      // Read the ca
      var ca = [fs.readFileSync(__dirname + "/ssl/ca.pem")];
      var cert = fs.readFileSync(__dirname + "/ssl/mycert.pem");
      var key = fs.readFileSync(__dirname + "/ssl/mycert.pem");

      // Create new 
      var replSet = new ReplSet( [ 
          new Server( "server", replSetManager.startPort + 1, { auto_reconnect: true } ),
          new Server( "server", replSetManager.startPort, { auto_reconnect: true } ),
        ], {
            rs_name:configuration.replicasetName
          , poolSize:5
          , ssl:true
          , sslValidate:true
          , sslCA:ca
          , sslKey:key
          , sslCert:cert
          , sslPass:'10gen'
        }
      );

      // Connect to the replicaset
      var slaveDb = null;
      var db = new Db('foo', replSet, configuration.writeConcernMax());
      db.open(function(err, p_db) {
        test.ok(err != null);
        test.equal(p_db, null);

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
exports['Should correctly receive ping and ha events using ssl'] = {
  metadata: { requires: { topology: 'ssl' } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var ReplSetManager = require('mongodb-tools').ReplSetManager
      , Db = configuration.require.Db
      , Server = configuration.require.Server
      , ReplSet = configuration.require.ReplSet
      , MongoClient = configuration.require.MongoClient;

    setUp(configuration, function() {
      // Read the ca
      var ca = [fs.readFileSync(__dirname + "/ssl/ca.pem")];
      var cert = fs.readFileSync(__dirname + "/ssl/client.pem");
      var key = fs.readFileSync(__dirname + "/ssl/client.pem");

      // Create new 
      var replSet = new ReplSet( [ 
          new Server( "server", replSetManager.startPort + 1, { auto_reconnect: true } ),
          new Server( "server", replSetManager.startPort, { auto_reconnect: true } ),
        ], {
            rs_name:configuration.replicasetName
          , ssl:true
          , sslValidate:true
          , sslCA:ca
          , sslKey:key
          , sslCert:cert
        }
      );

      // Connect to the replicaset
      var slaveDb = null;
      var db = new Db('foo', replSet, {w:0});
      db.open(function(err, db) {
        test.equal(null, err);
        var ha = false;
        var ping = false;

        db.serverConfig.once('ha', function(e) {
          ha = true;
        });

        db.serverConfig.once('ping', function(e) {
          ping = true;
        });

        var interval = setInterval(function() {
          if(ha && ping) {
            clearInterval(interval);
            db.close();

            replSetManager.stop(function() {
              test.done();
            });
          }
        }, 100);
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldFailToValidateServerSSLCertificate = {
  metadata: { requires: { topology: 'ssl' } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var ReplSetManager = require('mongodb-tools').ReplSetManager
      , Db = configuration.require.Db
      , Server = configuration.require.Server
      , ReplSet = configuration.require.ReplSet
      , MongoClient = configuration.require.MongoClient;

    var ca = [fs.readFileSync(__dirname + "/ssl/mycert.pem")];

    // Default rs options
    var rsOptions = {
      // SSL information
      host: "server",
      ssl:true,
      sslPEMKeyFile: __dirname + "/ssl/server.pem",
      sslMode: 'requireSSL',

      // ReplSet settings
      secondaries: 2
    }

    // Startup replicaset
    setUp(configuration, rsOptions, function() {
      // Create new 
      var replSet = new ReplSet( [ 
          new Server( "server", replSetManager.startPort + 1, { auto_reconnect: true } ),
          new Server( "server", replSetManager.startPort, { auto_reconnect: true } ),
        ], {
            rs_name:configuration.replicasetName
          , ssl:true
          , sslValidate:true
          , sslCA:ca
          , poolSize:1
        } 
      );

      // Connect to the replicaset
      var slaveDb = null;
      var db = new Db('foo', replSet, configuration.writeConcernMax());
      db.open(function(err, p_db) {
        test.ok(err != null);

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
exports.shouldCorrectlyValidateAndPresentCertificateReplSet = {
  metadata: { requires: { topology: 'ssl' } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var ReplSetManager = require('mongodb-tools').ReplSetManager
      , Db = configuration.require.Db
      , Server = configuration.require.Server
      , ReplSet = configuration.require.ReplSet
      , MongoClient = configuration.require.MongoClient;

    setUp(configuration, function() {
      // Read the ca
      var ca = [fs.readFileSync(__dirname + "/ssl/ca.pem")];
      var cert = fs.readFileSync(__dirname + "/ssl/client.pem");
      var key = fs.readFileSync(__dirname + "/ssl/client.pem");

      // Create new 
      var replSet = new ReplSet( [ 
          new Server( "server", replSetManager.startPort + 1, { auto_reconnect: true } ),
          new Server( "server", replSetManager.startPort, { auto_reconnect: true } ),
        ], {
            rs_name:configuration.replicasetName
          , ssl:true
          , sslValidate:true
          , sslCA:ca
          , sslKey:key
          , sslCert:cert
        }
      );

      // Connect to the replicaset
      var slaveDb = null;
      var db = new Db('foo', replSet, {w:0});
      db.open(function(err, db) {
        test.equal(null, err);

        setInterval(function() {
          db.collection('test').count(function() {});
        }, 1000);

        // Create a collection
        db.createCollection('shouldCorrectlyValidateAndPresentCertificateReplSet1', function(err, collection) {
          collection.remove({}, configuration.writeConcernMax(), function() {
            collection.insert([{a:1}, {b:2}, {c:'hello world'}], configuration.writeConcernMax(), function(err, result) {
              collection.find({}).toArray(function(err, items) {
                test.equal(3, items.length);
                db.close();

                replSetManager.stop(function() {
                  test.done();
                });
              })
            });            
          });
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyConnectToSSLBasedReplicaset = {
  metadata: { requires: { topology: 'ssl' } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var ReplSetManager = require('mongodb-tools').ReplSetManager
      , Db = configuration.require.Db
      , Server = configuration.require.Server
      , ReplSet = configuration.require.ReplSet
      , MongoClient = configuration.require.MongoClient;

    // Default rs options
    var rsOptions = {
      host: "server",
      ssl:true  ,
      sslMode: 'requireSSL',
      sslPEMKeyFile: __dirname + "/ssl/server.pem",
      secondaries:2,
    }

    setUp(configuration, rsOptions, function() {    
      // Read the ca
      var ca = [fs.readFileSync(__dirname + "/ssl/ca.pem")];
      // Create new 
      var replSet = new ReplSet( [ 
          new Server( "server", replSetManager.startPort + 1, { auto_reconnect: true } ),
          new Server( "server", replSetManager.startPort, { auto_reconnect: true } ),
        ], {
            rs_name:configuration.replicasetName
          , ssl:true
          , sslValidate:true
          , sslCA:ca
        }
      );
      
      // Connect to the replicaset
      var slaveDb = null;
      var db = new Db('foo', replSet, {w:0});
      db.open(function(err, p_db) {
        test.equal(null, err);
        test.ok(!!p_db);
        p_db.collection('test').find({}, function(error) {
          test.equal(null, error);
          p_db.close();

          replSetManager.stop(function() {
            test.done();
          });
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldFailToValidateServerSSLCertificate = {
  metadata: { requires: { topology: 'ssl' } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var ReplSetManager = require('mongodb-tools').ReplSetManager
      , Db = configuration.require.Db
      , Server = configuration.require.Server
      , ReplSet = configuration.require.ReplSet
      , MongoClient = configuration.require.MongoClient;

    setUp(configuration, function() {
      // Read the ca
      var ca = [fs.readFileSync(__dirname + "/ssl/mycert.pem")];
      // Create new 
      var replSet = new ReplSet( [ 
          new Server( "server", replSetManager.startPort + 1, { auto_reconnect: true } ),
          new Server( "server", replSetManager.startPort, { auto_reconnect: true } ),
        ], {
            rs_name:configuration.replicasetName
          , ssl:true
          , sslValidate:true
          , sslCA:ca
          , poolSize:5
        }
      );

      // Connect to the replicaset
      var slaveDb = null;
      var db = new Db('foo', replSet, {w:0});
      db.open(function(err, p_db) {
        test.ok(err != null);
        test.ok(err instanceof Error);
        test.ok(!p_db);

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
exports.shouldFailDueToNotPresentingCertificateToServer = {
  metadata: { requires: { topology: 'ssl' } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var ReplSetManager = require('mongodb-tools').ReplSetManager
      , Db = configuration.require.Db
      , Server = configuration.require.Server
      , ReplSet = configuration.require.ReplSet
      , MongoClient = configuration.require.MongoClient;

    setUp(configuration, function() {
      // Read the ca
      var ca = [fs.readFileSync(__dirname + "/ssl/mycert.pem")];
      var cert = fs.readFileSync(__dirname + "/ssl/client.pem");
      // Create new 
      var replSet = new ReplSet( [ 
          new Server( "server", replSetManager.startPort + 1, { auto_reconnect: true } ),
          new Server( "server", replSetManager.startPort, { auto_reconnect: true } ),
        ], {
            rs_name:configuration.replicasetName
          , ssl:true
          , sslValidate:true
          , sslCA:ca
          , sslCert:cert
          , poolSize:1
        } 
      );

      // Connect to the replicaset
      var slaveDb = null;
      var db = new Db('foo', replSet, configuration.writeConcernMax());
      db.open(function(err, p_db) {
        test.ok(err != null);
        test.ok(!p_db);

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
exports.shouldCorrectlyPresentPasswordProtectedCertificate = {
  metadata: { requires: { topology: 'ssl' } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var ReplSetManager = require('mongodb-tools').ReplSetManager
      , Db = configuration.require.Db
      , Server = configuration.require.Server
      , ReplSet = configuration.require.ReplSet
      , MongoClient = configuration.require.MongoClient;

    var ca = [fs.readFileSync(__dirname + "/ssl/ca.pem")];
    var cert = fs.readFileSync(__dirname + "/ssl/password_protected.pem");
    var key = fs.readFileSync(__dirname + "/ssl/password_protected.pem");

    // Default rs options
    var rsOptions = {
      // SSL information
      host: "server",
      ssl:true,
      sslPEMKeyFile: __dirname + "/ssl/server.pem",
      sslCAFile: __dirname + "/ssl/ca.pem",
      sslCRLFile: __dirname + "/ssl/crl.pem",
      sslMode: 'requireSSL',

      // The client certificate
      ca: ca,
      key: key,
      cert: cert,
      rejectUnauthorized: true,
      passphrase: 'qwerty',

      // ReplSet settings
      secondaries: 2
    }

    // Startup replicaset
    setUp(configuration, rsOptions, function() {
      // Create new 
      var replSet = new ReplSet( [ 
          new Server( "server", replSetManager.startPort + 1, { auto_reconnect: true } ),
          new Server( "server", replSetManager.startPort, { auto_reconnect: true } ),
        ], {
            rs_name:configuration.replicasetName
          , ssl:true
          , sslValidate:true
          , sslCA:ca
          , sslKey: key
          , sslCert:cert
          , sslPass: 'qwerty'
          , poolSize:1
        } 
      );

      // Connect to the replicaset
      var slaveDb = null;
      var db = new Db('foo', replSet, configuration.writeConcernMax());
      db.open(function(err, p_db) {
        test.equal(null, err);
        test.ok(p_db != null);

        // Create a collection
        db.createCollection('shouldCorrectlyValidateAndPresentCertificate2', function(err, collection) {
          collection.remove({}, configuration.writeConcernMax(), function() {

            collection.insert([{a:1}, {b:2}, {c:'hello world'}], configuration.writeConcernMax(), function(err, result) {
              collection.find({}).toArray(function(err, items) {
                test.equal(3, items.length);
                db.close();

                replSetManager.stop(function() {
                  test.done();
                });
              });
            });
          });
        });        
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyValidateServerSSLCertificate = {
  metadata: { requires: { topology: 'ssl' } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var ReplSetManager = require('mongodb-tools').ReplSetManager
      , Db = configuration.require.Db
      , Server = configuration.require.Server
      , ReplSet = configuration.require.ReplSet
      , MongoClient = configuration.require.MongoClient;

    var ca = [fs.readFileSync(__dirname + "/ssl/ca.pem")];

    // Default rs options
    var rsOptions = {
      // SSL information
      host: "server",
      ssl:true,
      sslPEMKeyFile: __dirname + "/ssl/server.pem",
      sslMode: 'requireSSL',

      // ReplSet settings
      secondaries: 2
    }

    // Startup replicaset
    setUp(configuration, rsOptions, function() {
      // Create new 
      var replSet = new ReplSet( [ 
          new Server( "server", replSetManager.startPort + 1, { auto_reconnect: true } ),
          new Server( "server", replSetManager.startPort, { auto_reconnect: true } ),
        ], {
            rs_name:configuration.replicasetName
          , ssl:true
          , sslValidate:true
          , sslCA:ca
          , poolSize:1
        } 
      );

      // Connect to the replicaset
      var slaveDb = null;
      var db = new Db('foo', replSet, configuration.writeConcernMax());
      db.open(function(err, p_db) {
        test.equal(null, err);
        test.ok(p_db != null);

        // Create a collection
        db.createCollection('shouldCorrectlyCommunicateUsingSSLSocket', function(err, collection) {
          collection.remove({}, configuration.writeConcernMax(), function() {

            collection.insert([{a:1}, {b:2}, {c:'hello world'}], configuration.writeConcernMax(), function(err, result) {
              collection.find({}).toArray(function(err, items) {
                test.equal(3, items.length);
                db.close();

                replSetManager.stop(function() {
                  test.done();
                });
              });
            });
          });
        });        
      });
    });
  }
}