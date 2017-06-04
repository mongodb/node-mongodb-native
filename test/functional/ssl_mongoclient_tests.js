"use strict";

var fs = require('fs'),
  path = require('path'),
  f = require('util').format;

/**
 * @ignore
 */
exports.shouldCorrectlyCommunicateUsingSSLSocket = {
  metadata: { requires: { topology: 'ssl' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var ServerManager = require('mongodb-topology-manager').Server
      , MongoClient = configuration.require.MongoClient;

    // All inserted docs
    var docs = [];
    var errs = [];
    var insertDocs = [];

    // Start server
    var serverManager = new ServerManager('mongod', {
        journal: null
      , port: 27019
      , sslOnNormalPorts: null
      , sslPEMKeyFile: __dirname + "/ssl/server.pem"
      , dbpath: path.join(path.resolve('db'), f("data-%d", 27019))
    }, {
      ssl:true
    });

    serverManager.purge().then(function() {
      // Start the server
      serverManager.start().then(function() {
        setTimeout(function() {
          // Connect
          MongoClient.connect("mongodb://localhost:27019/test?ssl=true", {
            sslValidate: false
          }, function(err, db) {
            test.equal(null, err);
            test.ok(db != null);

            db.close();

            serverManager.stop().then(function() {
              test.done();
            });
          });
        }, 10000);
      });
    });
  }
}

/**
 * @ignore
 */
exports['should fail due to CRL list passed in'] = {
  metadata: { requires: { topology: 'ssl' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var ServerManager = require('mongodb-topology-manager').Server
      , MongoClient = configuration.require.MongoClient;

    // All inserted docs
    var docs = [];
    var errs = [];
    var insertDocs = [];

    // Start server
    var serverManager = new ServerManager('mongod', {
        journal: null
      , port: 27019
      , sslOnNormalPorts: null
      , sslPEMKeyFile: __dirname + "/ssl/server.pem"
      , dbpath: path.join(path.resolve('db'), f("data-%d", 27019))
    }, {
      ssl:true
    });

    // Read the ca
    var crl = [fs.readFileSync(__dirname + "/ssl/crl_expired.pem")];
    var ca = [fs.readFileSync(__dirname + "/ssl/ca.pem")];

    serverManager.purge().then(function() {
      // Start the server
      serverManager.start().then(function() {
        setTimeout(function() {
          // Connect
          MongoClient.connect("mongodb://server:27019/test?ssl=true", {
            sslValidate: true,
            sslCA: ca,
            sslCRL: crl,
          }, function(err, db) {
            test.ok(err);
            test.ok(err.message.indexOf('CRL has expired') != -1);

            serverManager.stop().then(function() {
              test.done();
            });
          });
        }, 10000);
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
    var ServerManager = require('mongodb-topology-manager').Server
      , MongoClient = configuration.require.MongoClient;

    // All inserted docs
    var docs = [];
    var errs = [];
    var insertDocs = [];

    // Read the ca
    var ca = [fs.readFileSync(__dirname + "/ssl/ca.pem")];

    // Start server
    var serverManager = new ServerManager('mongod', {
        journal:null
      , sslOnNormalPorts: null
      , sslPEMKeyFile: __dirname + "/ssl/server.pem"
      // EnsureUp options
      , dbpath: path.join(path.resolve('db'), f("data-%d", 27019))
      , bind_ip: 'server'
      , port: 27019
    });

    serverManager.purge().then(function() {
      // Start the server
      serverManager.start().then(function() {
        setTimeout(function() {
          // Connect and validate the server certificate
          MongoClient.connect("mongodb://server:27019/test?ssl=true&maxPoolSize=1", {
              sslValidate:true
            , sslCA:ca
          }, function(err, db) {
            test.equal(null, err);
            test.ok(db != null);

            db.close();

            serverManager.stop().then(function() {
              test.done();
            });
          });
        }, 10000);
      });
    });
  }
}

/**
 * @ignore
 */
exports['Should correctly pass down servername to connection for TLS SNI support'] = {
  metadata: { requires: { topology: 'ssl' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var ServerManager = require('mongodb-topology-manager').Server
      , MongoClient = configuration.require.MongoClient;

    // All inserted docs
    var docs = [];
    var errs = [];
    var insertDocs = [];

    // Read the ca
    var ca = [fs.readFileSync(__dirname + "/ssl/ca.pem")];

    // Start server
    var serverManager = new ServerManager('mongod', {
        journal:null
      , sslOnNormalPorts: null
      , sslPEMKeyFile: __dirname + "/ssl/server.pem"
      // EnsureUp options
      , dbpath: path.join(path.resolve('db'), f("data-%d", 27019))
      , bind_ip: 'server'
      , port: 27019
    });

    serverManager.purge().then(function() {
      // Start the server
      serverManager.start().then(function() {
        setTimeout(function() {
          // Connect and validate the server certificate
          MongoClient.connect("mongodb://server:27019/test?ssl=true&maxPoolSize=1", {
              sslValidate:true
            , servername: 'server'
            , sslCA:ca
          }, function(err, db) {
            test.equal(null, err);
            test.ok(db != null);

            db.close();

            serverManager.stop().then(function() {
              test.done();
            });
          });
        }, 10000);
      });
    });
  }
}

/**
 * @ignore
 */
exports['should correctly validate ssl certificate and ignore server certificate host name validation'] = {
  metadata: { requires: { topology: 'ssl' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var ServerManager = require('mongodb-topology-manager').Server
      , MongoClient = configuration.require.MongoClient;

    // All inserted docs
    var docs = [];
    var errs = [];
    var insertDocs = [];

    // Did we get checkServerIdentity called
    var checkServerIdentityCalled = false;

    // Read the ca
    var ca = [fs.readFileSync(__dirname + "/ssl/ca.pem")];

    // Start server
    var serverManager = new ServerManager('mongod', {
        journal:null
      , sslOnNormalPorts: null
      , sslPEMKeyFile: __dirname + "/ssl/server.pem"
      // EnsureUp options
      , dbpath: path.join(path.resolve('db'), f("data-%d", 27019))
      , bind_ip: 'server'
      , port: 27019
    });

    serverManager.purge().then(function() {
      // Start the server
      serverManager.start().then(function() {
        setTimeout(function() {
          // Connect and validate the server certificate
          MongoClient.connect("mongodb://server:27019/test?ssl=true&maxPoolSize=1", {
              sslValidate:true
            , checkServerIdentity: function() {
              checkServerIdentityCalled = true;
              return undefined;
            }
            , sslCA:ca
          }, function(err, db) {
            test.equal(null, err);
            test.ok(db != null);
            test.ok(checkServerIdentityCalled);

            db.close();

            serverManager.stop().then(function() {
              test.done();
            });
          });
        }, 10000);
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
    var ServerManager = require('mongodb-topology-manager').Server
      , MongoClient = configuration.require.MongoClient;

    // All inserted docs
    var docs = [];
    var errs = [];
    var insertDocs = [];

    // Read the ca
    var ca = [fs.readFileSync(__dirname + "/ssl/ca.pem")];

    // Start server
    var serverManager = new ServerManager('mongod', {
        journal:null
      , sslOnNormalPorts: null
      , sslPEMKeyFile: __dirname + "/ssl/server.pem"
      // EnsureUp options
      , dbpath: path.join(path.resolve('db'), f("data-%d", 27019))
      , bind_ip: 'server'
      , port: 27019
    });

    serverManager.purge().then(function() {
      // Start the server
      serverManager.start().then(function() {
        setTimeout(function() {
          // Connect and validate the server certificate
          MongoClient.connect("mongodb://localhost:27017/test?ssl=true&maxPoolSize=1", {
              sslValidate:true
            , sslCA:ca
          }, function(err, db) {
            test.ok(err != null);

            serverManager.stop().then(function() {
              test.done();
            });
          });
        }, 10000);
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
    var ServerManager = require('mongodb-topology-manager').Server
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
    var serverManager = new ServerManager('mongod', {
        journal:null
      , sslOnNormalPorts: null
      , sslCAFile: __dirname + "/ssl/ca.pem"
      , sslCRLFile: __dirname + "/ssl/crl.pem"
      , sslPEMKeyFile: __dirname + "/ssl/server.pem"
      // EnsureUp options
      , dbpath: path.join(path.resolve('db'), f("data-%d", 27019))
      , bind_ip: 'server'
      , port: 27019
    });

    serverManager.purge().then(function() {
      // Start the server
      serverManager.start().then(function() {
        setTimeout(function() {
          // Connect and validate the server certificate
          MongoClient.connect("mongodb://server:27019/test?ssl=true&maxPoolSize=1", {
              sslValidate:true
            , sslCA:ca
            , sslKey:key
            , sslCert:cert
            , sslPass:'10gen'
          }, function(err, db) {
            test.equal(null, err);
            test.ok(db != null);

            db.close();

            serverManager.stop().then(function() {
              test.done();
            });
          });
        }, 10000);
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
    var ServerManager = require('mongodb-topology-manager').Server
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
    var serverManager = new ServerManager('mongod', {
        journal:null
      , sslMode: 'requireSSL'
      , sslCAFile: __dirname + "/ssl/ca.pem"
      , sslCRLFile: __dirname + "/ssl/crl.pem"
      , sslPEMKeyFile: __dirname + "/ssl/server.pem"
      // EnsureUp options
      , dbpath: path.join(path.resolve('db'), f("data-%d", 27019))
      , bind_ip: 'server'
      , port: 27019
    });

    serverManager.purge().then(function() {
      // Start the server
      serverManager.start().then(function() {
        setTimeout(function() {
          // Read the ca
          var cert = fs.readFileSync(__dirname + "/ssl/mycert.pem");
          var key = fs.readFileSync(__dirname + "/ssl/mycert.pem");

          // Connect and validate the server certificate
          MongoClient.connect("mongodb://server:27019/test?ssl=true&maxPoolSize=1", {
              ssl:true
            , sslValidate:true
            , sslCA:ca
            , sslKey:key
            , sslCert:cert
            , sslPass:'10gen'
          }, function(err, db) {
            test.ok(err != null);

            serverManager.stop().then(function() {
              test.done();
            });
          });
        }, 10000);
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyValidatePresentedServerCertificateAndInvalidKey = {
  metadata: { requires: { topology: 'ssl' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var ServerManager = require('mongodb-topology-manager').Server
      , MongoClient = configuration.require.MongoClient;

    // All inserted docs
    var docs = [];
    var errs = [];
    var insertDocs = [];

    // Read the ca
    var ca = [fs.readFileSync(__dirname + "/ssl/ca.pem")];
    var cert = fs.readFileSync(__dirname + "/ssl/client.pem");
    var key = fs.readFileSync(__dirname + "/ssl/mycert.pem");

    // Start server
    var serverManager = new ServerManager('mongod', {
        journal:null
      , sslOnNormalPorts: null
      , sslCAFile: __dirname + "/ssl/ca.pem"
      , sslCRLFile: __dirname + "/ssl/crl.pem"
      , sslPEMKeyFile: __dirname + "/ssl/server.pem"
      // EnsureUp options
      , dbpath: path.join(path.resolve('db'), f("data-%d", 27019))
      , bind_ip: 'server'
      , port: 27019
    });

    serverManager.purge().then(function() {
      // Start the server
      serverManager.start().then(function() {
        setTimeout(function() {
          // console.log("============================== 0")
          // console.dir(key)
          // Connect and validate the server certificate
          MongoClient.connect("mongodb://server:27019/test?ssl=true&maxPoolSize=1", {
              sslValidate:true
            , sslCA:ca
            , sslKey:key
            , sslCert:cert
            , sslPass:'10gen'
          }, function(err, db) {
            // console.log("============================== 1")
            // console.dir(err)
            test.ok(err != null);

            serverManager.stop().then(function() {
              test.done();
            });
          });
        }, 10000);
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
    var ServerManager = require('mongodb-topology-manager').Server
      , MongoClient = configuration.require.MongoClient;

    // All inserted docs
    var docs = [];
    var errs = [];
    var insertDocs = [];

    // Start server
    var serverManager = new ServerManager('mongod', {
        journal: null
      , sslOnNormalPorts: null
      , sslPEMKeyFile: __dirname + "/ssl/server.pem"
      // EnsureUp options
      , dbpath: path.join(path.resolve('db'), f("data-%d", 27019))
      , bind_ip: 'server'
      , port: 27019
    });

    // Start server
    serverManager.purge().then(function() {
      // Start the server
      serverManager.start().then(function() {
        setTimeout(function() {
          MongoClient.connect("mongodb://localhost:27019/test?ssl=false", function(err, db) {
            test.ok(err != null);

            serverManager.stop().then(function() {
              test.done();
            });
          });
        }, 10000);
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
    var ReplSetManager = require('mongodb-topology-manager').ReplSet
      , MongoClient = configuration.require.MongoClient;

    // All inserted docs
    var docs = [];
    var errs = [];
    var insertDocs = [];

    // Read the ca
    var ca = [fs.readFileSync(__dirname + "/ssl/ca.pem")];
    var cert = fs.readFileSync(__dirname + "/ssl/client.pem");
    var key = fs.readFileSync(__dirname + "/ssl/client.pem");

    var replicasetManager = new ReplSetManager('mongod', [{
      options: {
        bind_ip: 'server', port: 31000,
        dbpath: f('%s/../db/31000', __dirname),
        sslOnNormalPorts: null, sslPEMKeyFile: __dirname + "/ssl/server.pem"
      }
    }, {
      options: {
        bind_ip: 'server', port: 31001,
        dbpath: f('%s/../db/31001', __dirname),
        sslOnNormalPorts: null, sslPEMKeyFile: __dirname + "/ssl/server.pem"
      }
    }, {
      options: {
        bind_ip: 'server', port: 31002,
        dbpath: f('%s/../db/31002', __dirname),
        sslOnNormalPorts: null, sslPEMKeyFile: __dirname + "/ssl/server.pem"
      }
    }], {
      replSet: 'rs', ssl:true, rejectUnauthorized: false, ca: ca, host: 'server'
    });

    replicasetManager.purge().then(function() {
      // Start the server
      replicasetManager.start().then(function() {
        setTimeout(function() {
          // Connect and validate the server certificate
          MongoClient.connect("mongodb://server:31000,server:31001,server:31002/test?ssl=true&replicaSet=rs&maxPoolSize=1", {
              ssl:true
            , sslValidate:false
            , sslCA:ca
          }, function(err, db) {
            if(err) console.dir(err)
            test.equal(null, err);
            test.ok(db != null);

            db.close();

            replicasetManager.stop().then(function() {
              test.done();
            });
          });
        });
      }, 10000);
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
    var ReplSetManager = require('mongodb-topology-manager').ReplSet
      , MongoClient = configuration.require.MongoClient;
    // All inserted docs
    var docs = [];
    var errs = [];
    var insertDocs = [];

    // Read the ca
    var ca = [fs.readFileSync(__dirname + "/ssl/ca.pem")];
    var cert = fs.readFileSync(__dirname + "/ssl/client.pem");
    var key = fs.readFileSync(__dirname + "/ssl/client.pem");

    var replicasetManager = new ReplSetManager('mongod', [{
      options: {
        bind_ip: 'server', port: 31000,
        dbpath: f('%s/../db/31000', __dirname),
        sslPEMKeyFile: __dirname + "/ssl/server.pem", sslCAFile: __dirname + "/ssl/ca.pem",
        sslCRLFile: __dirname + "/ssl/crl.pem", sslMode: 'requireSSL'
      }
    }, {
      options: {
        bind_ip: 'server', port: 31001,
        dbpath: f('%s/../db/31001', __dirname),
        sslPEMKeyFile: __dirname + "/ssl/server.pem", sslCAFile: __dirname + "/ssl/ca.pem",
        sslCRLFile: __dirname + "/ssl/crl.pem", sslMode: 'requireSSL'
      }
    }, {
      options: {
        bind_ip: 'server', port: 31002,
        dbpath: f('%s/../db/31002', __dirname),
        sslPEMKeyFile: __dirname + "/ssl/server.pem", sslCAFile: __dirname + "/ssl/ca.pem",
        sslCRLFile: __dirname + "/ssl/crl.pem", sslMode: 'requireSSL'
      }
    }], {
      replSet: 'rs', ssl:true, rejectUnauthorized: false, key: cert, cert: cert, host: 'server'
    });

    replicasetManager.purge().then(function() {
      // Start the server
      replicasetManager.start().then(function() {
        setTimeout(function() {
          // Connect and validate the server certificate
          MongoClient.connect("mongodb://server:31000,server:31001/test?ssl=true&replicaSet=rs&maxPoolSize=1", {
              sslValidate:false
            , sslCA:ca
            , sslKey:key
            , sslCert:cert
          }, function(err, db) {
            if(err) console.dir(err);
            test.equal(null, err);
            test.ok(db != null);

            db.close();

            replicasetManager.stop().then(function() {
              test.done();
            });
          });
        }, 10000);
      }).catch(function(e) {
        console.dir(e)
      });
    });
  }
}

/**
 * @ignore
 */
exports['should correctly send SNI TLS servername to replicaset members'] = {
  metadata: { requires: { topology: 'ssl' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var ReplSetManager = require('mongodb-topology-manager').ReplSet
      , MongoClient = configuration.require.MongoClient;
    // All inserted docs
    var docs = [];
    var errs = [];
    var insertDocs = [];

    // Read the ca
    var ca = [fs.readFileSync(__dirname + "/ssl/ca.pem")];
    var cert = fs.readFileSync(__dirname + "/ssl/client.pem");
    var key = fs.readFileSync(__dirname + "/ssl/client.pem");

    var replicasetManager = new ReplSetManager('mongod', [{
      options: {
        bind_ip: 'server', port: 31000,
        dbpath: f('%s/../db/31000', __dirname),
        sslPEMKeyFile: __dirname + "/ssl/server.pem", sslCAFile: __dirname + "/ssl/ca.pem",
        sslCRLFile: __dirname + "/ssl/crl.pem", sslMode: 'requireSSL'
      }
    }, {
      options: {
        bind_ip: 'server', port: 31001,
        dbpath: f('%s/../db/31001', __dirname),
        sslPEMKeyFile: __dirname + "/ssl/server.pem", sslCAFile: __dirname + "/ssl/ca.pem",
        sslCRLFile: __dirname + "/ssl/crl.pem", sslMode: 'requireSSL'
      }
    }, {
      options: {
        bind_ip: 'server', port: 31002,
        dbpath: f('%s/../db/31002', __dirname),
        sslPEMKeyFile: __dirname + "/ssl/server.pem", sslCAFile: __dirname + "/ssl/ca.pem",
        sslCRLFile: __dirname + "/ssl/crl.pem", sslMode: 'requireSSL'
      }
    }], {
      replSet: 'rs', ssl:true, rejectUnauthorized: false, key: cert, cert: cert, host: 'server'
    });

    replicasetManager.purge().then(function() {
      // Start the server
      replicasetManager.start().then(function() {
        setTimeout(function() {
          // Connect and validate the server certificate
          MongoClient.connect("mongodb://server:31000/test?ssl=true&replicaSet=rs&maxPoolSize=1", {
              sslValidate:false
            , servername: 'server'
            , sslCA:ca
            , sslKey:key
            , sslCert:cert
          }, function(err, db) {
            if(err) console.dir(err);
            test.equal(null, err);
            test.ok(db != null);

            db.close();

            replicasetManager.stop().then(function() {
              test.done();
            });
          });
        }, 10000);
      }).catch(function(e) {
        console.dir(e)
      });
    });
  }
}

/**
 * @ignore
 */
exports['should correctly send SNI TLS servername to replicaset members with restart'] = {
  metadata: { requires: { topology: 'ssl' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var ReplSetManager = require('mongodb-topology-manager').ReplSet
      , MongoClient = configuration.require.MongoClient;
    // All inserted docs
    var docs = [];
    var errs = [];
    var insertDocs = [];

    // Read the ca
    var ca = [fs.readFileSync(__dirname + "/ssl/ca.pem")];
    var cert = fs.readFileSync(__dirname + "/ssl/client.pem");
    var key = fs.readFileSync(__dirname + "/ssl/client.pem");

    var replicasetManager = new ReplSetManager('mongod', [{
      options: {
        bind_ip: 'server', port: 31000,
        dbpath: f('%s/../db/31000', __dirname),
        sslPEMKeyFile: __dirname + "/ssl/server.pem", sslCAFile: __dirname + "/ssl/ca.pem",
        sslCRLFile: __dirname + "/ssl/crl.pem", sslMode: 'requireSSL'
      }
    }, {
      options: {
        bind_ip: 'server', port: 31001,
        dbpath: f('%s/../db/31001', __dirname),
        sslPEMKeyFile: __dirname + "/ssl/server.pem", sslCAFile: __dirname + "/ssl/ca.pem",
        sslCRLFile: __dirname + "/ssl/crl.pem", sslMode: 'requireSSL'
      }
    }, {
      options: {
        bind_ip: 'server', port: 31002,
        dbpath: f('%s/../db/31002', __dirname),
        sslPEMKeyFile: __dirname + "/ssl/server.pem", sslCAFile: __dirname + "/ssl/ca.pem",
        sslCRLFile: __dirname + "/ssl/crl.pem", sslMode: 'requireSSL'
      }
    }], {
      replSet: 'rs', ssl:true, rejectUnauthorized: false, key: cert, cert: cert, host: 'server'
    });

    replicasetManager.purge().then(function() {
      // Start the server
      replicasetManager.start().then(function() {
        setTimeout(function() {
          // Connect and validate the server certificate
          MongoClient.connect("mongodb://server:31000/test?ssl=true&replicaSet=rs&maxPoolSize=1", {
              sslValidate:false
            , servername: 'server'
            , sslCA:ca
            , sslKey:key
            , sslCert:cert
            , haInterval: 2000
          }, function(err, db) {
            if(err) console.dir(err);
            test.equal(null, err);
            test.ok(db != null);

            replicasetManager.primary().then(function(primary) {
              primary.stop().then(function() {
                // Restart the old master and wait for the sync to happen
                primary.start().then(function(result) {
                  // Wait to allow haInterval to happen
                  setTimeout(function() {
                    db.close();
                    var connections = client.topology.connections();

                    for(var i = 0; i < connections.length; i++) {
                      test.equal('server', connections[i].options.servername);
                    }

                    replicasetManager.stop().then(function() {
                      test.done();
                    });
                  }, 3000);
                });
              });
            });
          });
        }, 10000);
      }).catch(function(e) {
        console.dir(e)
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
    var ReplSetManager = require('mongodb-topology-manager').ReplSet
      , MongoClient = configuration.require.MongoClient;
    // All inserted docs
    var docs = [];
    var errs = [];
    var insertDocs = [];

    // Read the ca
    var ca = [fs.readFileSync(__dirname + "/ssl/ca.pem")];
    var cert = fs.readFileSync(__dirname + "/ssl/client.pem");
    var key = fs.readFileSync(__dirname + "/ssl/client.pem");

    var replicasetManager = new ReplSetManager('mongod', [{
      options: {
        bind_ip: 'server', port: 31000,
        dbpath: f('%s/../db/31000', __dirname),
        sslPEMKeyFile: __dirname + "/ssl/server.pem", sslCAFile: __dirname + "/ssl/ca.pem",
        sslCRLFile: __dirname + "/ssl/crl.pem", sslMode: 'requireSSL'
      }
    }, {
      options: {
        bind_ip: 'server', port: 31001,
        dbpath: f('%s/../db/31001', __dirname),
        sslPEMKeyFile: __dirname + "/ssl/server.pem", sslCAFile: __dirname + "/ssl/ca.pem",
        sslCRLFile: __dirname + "/ssl/crl.pem", sslMode: 'requireSSL'
      }
    }, {
      options: {
        bind_ip: 'server', port: 31002,
        dbpath: f('%s/../db/31002', __dirname),
        sslPEMKeyFile: __dirname + "/ssl/server.pem", sslCAFile: __dirname + "/ssl/ca.pem",
        sslCRLFile: __dirname + "/ssl/crl.pem", sslMode: 'requireSSL'
      }
    }], {
      replSet: 'rs', ssl:true, rejectUnauthorized: false, key: cert, cert: cert, host: 'server'
    });

    replicasetManager.purge().then(function() {
      // Start the server
      replicasetManager.start().then(function() {
        setTimeout(function() {
          // Present wrong certificate
          var cert = fs.readFileSync(__dirname + "/ssl/mycert.pem");
          var key = fs.readFileSync(__dirname + "/ssl/mycert.pem");

          // Connect and validate the server certificate
          MongoClient.connect("mongodb://server:31000,server:31001/test?ssl=true&replicaSet=rs&maxPoolSize=1", {
              sslValidate:true
            , sslCA:ca
            , sslKey:key
            , sslCert:cert
            , sslPass: '10gen'
          }, function(err, db) {
            test.ok(err != null)

            replicasetManager.stop().then(function() {
              test.done();
            });
          });
        }, 10000);
      }).catch(function(e) {
        console.dir(e)
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
    var ReplSetManager = require('mongodb-topology-manager').ReplSet
      , MongoClient = configuration.require.MongoClient;
    // All inserted docs
    var docs = [];
    var errs = [];
    var insertDocs = [];

    // Read the ca
    var ca = [fs.readFileSync(__dirname + "/ssl/ca.pem")];
    var cert = fs.readFileSync(__dirname + "/ssl/client.pem");
    var key = fs.readFileSync(__dirname + "/ssl/client.pem");

    var replicasetManager = new ReplSetManager('mongod', [{
      options: {
        bind_ip: 'server', port: 31000,
        dbpath: f('%s/../db/31000', __dirname),
        sslPEMKeyFile: __dirname + "/ssl/server.pem", sslCAFile: __dirname + "/ssl/ca.pem",
        sslCRLFile: __dirname + "/ssl/crl.pem", sslMode: 'requireSSL'
      }
    }, {
      options: {
        bind_ip: 'server', port: 31001,
        dbpath: f('%s/../db/31001', __dirname),
        sslPEMKeyFile: __dirname + "/ssl/server.pem", sslCAFile: __dirname + "/ssl/ca.pem",
        sslCRLFile: __dirname + "/ssl/crl.pem", sslMode: 'requireSSL'
      }
    }, {
      options: {
        bind_ip: 'server', port: 31002,
        dbpath: f('%s/../db/31002', __dirname),
        sslPEMKeyFile: __dirname + "/ssl/server.pem", sslCAFile: __dirname + "/ssl/ca.pem",
        sslCRLFile: __dirname + "/ssl/crl.pem", sslMode: 'requireSSL'
      }
    }], {
      replSet: 'rs', ssl:true, rejectUnauthorized: false, key: cert, cert: cert, host: 'server'
    });

    replicasetManager.purge().then(function() {
      // Start the server
      replicasetManager.start().then(function() {
        setTimeout(function() {
          // Connect and validate the server certificate
          MongoClient.connect("mongodb://server:31000,server:31001/test?ssl=true&replicaSet=rs&maxPoolSize=1", {
              sslValidate:true
            , sslCA:ca
            , sslKey:key
            , sslCert:cert
            , sslPass: '10gen'
          }, function(err, db) {
            test.equal(null, err)
            db.close();

            replicasetManager.stop().then(function() {
              test.done();
            });
          });
        }, 10000);
      });
    });
  }
}

/**
 * @ignore
 */
exports['should correctly connect using ssl with sslValidation turned off'] = {
  metadata: { requires: { topology: 'ssl' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var ReplSetManager = require('mongodb-topology-manager').ReplSet
      , MongoClient = configuration.require.MongoClient;

    // All inserted docs
    var docs = [];
    var errs = [];
    var insertDocs = [];

    // Read the ca
    var ca = [fs.readFileSync(__dirname + "/ssl/ca.pem")];
    var cert = fs.readFileSync(__dirname + "/ssl/client.pem");
    var key = fs.readFileSync(__dirname + "/ssl/client.pem");

    var replicasetManager = new ReplSetManager('mongod', [{
      options: {
        bind_ip: 'server', port: 31000,
        dbpath: f('%s/../db/31000', __dirname),
        sslOnNormalPorts: null, sslPEMKeyFile: __dirname + "/ssl/server.pem"
      }
    }, {
      options: {
        bind_ip: 'server', port: 31001,
        dbpath: f('%s/../db/31001', __dirname),
        sslOnNormalPorts: null, sslPEMKeyFile: __dirname + "/ssl/server.pem"
      }
    }, {
      options: {
        bind_ip: 'server', port: 31002,
        dbpath: f('%s/../db/31002', __dirname),
        sslOnNormalPorts: null, sslPEMKeyFile: __dirname + "/ssl/server.pem"
      }
    }], {
      replSet: 'rs', ssl:true, rejectUnauthorized: false, key: cert, cert: cert, host: 'server'
    });

    replicasetManager.purge().then(function() {
      // Start the server
      replicasetManager.start().then(function() {
        setTimeout(function() {
          // Connect and validate the server certificate
          MongoClient.connect("mongodb://server:31000,server:31001/test?ssl=true&replicaSet=rs&maxPoolSize=1", {
              ssl:true
            , sslValidate:false
          }, function(err, db) {
            test.equal(null, err);
            test.ok(db != null);

            db.close();

            replicasetManager.stop().then(function() {
              test.done();
            });
          });
        }, 10000);
      });
    });
  }
}

/**
 * @ignore
 */
exports['should correctly connect using SSL to replicaset with requireSSL'] = {
  metadata: { requires: { topology: 'ssl' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var ReplSetManager = require('mongodb-topology-manager').ReplSet
      , MongoClient = configuration.require.MongoClient;

    // All inserted docs
    var docs = [];
    var errs = [];
    var insertDocs = [];

    // Read the ca
    var ca = [fs.readFileSync(__dirname + "/ssl/ca.pem")];
    var cert = fs.readFileSync(__dirname + "/ssl/client.pem");
    var key = fs.readFileSync(__dirname + "/ssl/client.pem");
    var replicasetManager = new ReplSetManager('mongod', [{
      options: {
        bind_ip: 'server', port: 31000,
        dbpath: f('%s/../db/31000', __dirname),
        sslPEMKeyFile: __dirname + "/ssl/server.pem",
        sslMode: 'requireSSL'
      }
    }, {
      options: {
        bind_ip: 'server', port: 31001,
        dbpath: f('%s/../db/31001', __dirname),
        sslPEMKeyFile: __dirname + "/ssl/server.pem",
        sslMode: 'requireSSL'
      }
    }, {
      options: {
        bind_ip: 'server', port: 31002,
        dbpath: f('%s/../db/31002', __dirname),
        sslPEMKeyFile: __dirname + "/ssl/server.pem",
        sslMode: 'requireSSL'
      }
    }], {
      replSet: 'rs', ssl:true, rejectUnauthorized: false, ca: ca, host: 'server'
    });

    // console.log("---------------------------- 0")

    replicasetManager.purge().then(function() {
      // console.log("---------------------------- 1")
      // Start the server
      replicasetManager.start().then(function() {
        // console.log("---------------------------- 2")
        setTimeout(function() {
          // console.log("---------------------------- 3")
          // Connect and validate the server certificate
          MongoClient.connect("mongodb://server:31000,server:31001,server:31002/test?replicaSet=rs", {
              ssl:true
            , sslKey: key
            , sslCert: cert
            , sslCA:ca
          }, function(err, db) {
            // console.log("---------------------------- 4")
            // if(err) console.dir(err)
            test.equal(null, err);
            test.ok(db != null);
            var sets = [{}];

            var interval = setInterval(function() {
              // console.log("---------------------------- 5:1")

              db.command({ismaster:true}, {readPreference:'nearest', full:true}, function(e, r) {
                // console.log("---------------------------- 5:2")
                // Add seen servers to list
                if(r) {
                  sets[sets.length - 1][r.connection.port] = true;
                }
              });
            }, 500)

            setTimeout(function() {
              // console.log("---------------------------- 6")
              // Force a reconnect of a server
              var secondary = client.topology.s.replset.s.replicaSetState.secondaries[0]
              // console.log("---------------------------- 6:1")
              secondary.destroy({emitClose:true});
              // console.log("---------------------------- 6:2")
              sets.push({});
              // console.log("---------------------------- 6:3")

              client.topology.once('joined', function(t, o, s) {
                // console.log("---------------------------- 7")
                setTimeout(function() {
                  // console.log("---------------------------- 8")
                  clearInterval(interval);

                  test.ok(sets[0][31000]);
                  test.ok(sets[0][31001]);
                  test.ok(sets[0][31002]);

                  test.ok(sets[1][31000]);
                  test.ok(sets[1][31001]);
                  test.ok(sets[1][31002]);

                  db.close();

                  replicasetManager.stop().then(function() {
                    // console.log("---------------------------- 9")
                    test.done();
                  });
                }, 5000);
              });
            }, 2000)
          });
        });
      }, 10000).catch(function(err) {
        console.dir(err)
        process.exit(0)
      });
    });
  }
}

/**
 * @ignore
 */
exports['should correctly connect to Replicaset using SSL when secondary down'] = {
  metadata: { requires: { topology: 'ssl' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var ReplSetManager = require('mongodb-topology-manager').ReplSet
      , MongoClient = configuration.require.MongoClient;

    // All inserted docs
    var docs = [];
    var errs = [];
    var insertDocs = [];

    // Read the ca
    var ca = [fs.readFileSync(__dirname + "/ssl/ca.pem")];
    var cert = fs.readFileSync(__dirname + "/ssl/client.pem");
    var key = fs.readFileSync(__dirname + "/ssl/client.pem");

    var replicasetManager = new ReplSetManager('mongod', [{
      options: {
        bind_ip: 'server', port: 31000,
        dbpath: f('%s/../db/31000', __dirname),
        sslOnNormalPorts: null, sslPEMKeyFile: __dirname + "/ssl/server.pem"
      }
    }, {
      options: {
        bind_ip: 'server', port: 31001,
        dbpath: f('%s/../db/31001', __dirname),
        sslOnNormalPorts: null, sslPEMKeyFile: __dirname + "/ssl/server.pem"
      }
    }, {
      options: {
        bind_ip: 'server', port: 31002,
        dbpath: f('%s/../db/31002', __dirname),
        sslOnNormalPorts: null, sslPEMKeyFile: __dirname + "/ssl/server.pem"
      }
    }], {
      replSet: 'rs', ssl:true, rejectUnauthorized: false, ca: ca, host: 'server'
    });

    replicasetManager.purge().then(function() {
      // Start the server
      replicasetManager.start().then(function() {

        replicasetManager.secondaries().then(function(managers) {
          var secondaryServerManager = managers[0];

          secondaryServerManager.stop().then(function() {
            setTimeout(function() {
              // Connect and validate the server certificate
              MongoClient.connect("mongodb://server:31000,server:31001,server:31002/test?ssl=true&replicaSet=rs&maxPoolSize=1", {
                  ssl:true
                , sslValidate:false
                , sslCA:ca
              }, function(err, db) {
                if(err) console.dir(err)
                test.equal(null, err);
                test.ok(db != null);

                db.close();

                replicasetManager.stop().then(function() {
                  test.done();
                });
              });
            }, 1000);
          });
        });
      });
    });
  }
}

// /**
//  * @ignore
//  */
// exports['should fail due to accessing using ip address'] = {
//   metadata: { requires: { topology: 'ssl' } },
//
//   // The actual test we wish to run
//   test: function(configuration, test) {
//     var ServerManager = require('mongodb-topology-manager').Server
//       , MongoClient = configuration.require.MongoClient;
//
//     // All inserted docs
//     var docs = [];
//     var errs = [];
//     var insertDocs = [];
//
//     // Read the ca
//     var ca = [fs.readFileSync(__dirname + "/ssl/ca.pem")];
//
//     // Start server
//     var serverManager = new ServerManager('mongod', {
//         journal:null
//       , sslOnNormalPorts: null
//       , sslPEMKeyFile: __dirname + "/ssl/server.pem"
//       // EnsureUp options
//       , dbpath: path.join(path.resolve('db'), f("data-%d", 27019))
//       , bind_ip: 'server'
//       , port: 27019
//     });
//
//     console.log("=============================== commandLine 0")
//     // console.log(commandLine)
//     serverManager.purge().then(function() {
//       console.log("=============================== commandLine 1")
//       // Start the server
//       serverManager.start().then(function() {
//         setTimeout(function() {
//           console.log("=============================== commandLine 2")
//           // Connect and validate the server certificate
//           // MongoClient.connect("mongodb://127.0.0.1:27019/test?ssl=true&maxPoolSize=1", {
//           // MongoClient.connect("mongodb://foo:bar@ds015564-a0.sjf52.fleet.mongolab.com:15564,ds015564-a1.sjf52.fleet.mongolab.com:15564/test?replicaSet=rs-ds015564&ssl=true", {          // MongoClient.connect("mongodb://server:27019/test?ssl=true&maxPoolSize=1", {
//           MongoClient.connect("mongodb://foo:bar@54.161.72.61:15564,54.204.126.162:15564/test?replicaSet=rs-ds015564&ssl=true", {
//               sslValidate:true,
//               // checkServerIdentity:true
//             // , sslCA:ca
//           }, function(err, db) {
//             console.dir(err)
//             test.equal(null, err);
//             test.ok(db != null);
//
//             db.close();
//
//             serverManager.stop().then(function() {
//               test.done();
//             });
//           });
//         }, 1000);
//       });
//     });
//   }
// }
