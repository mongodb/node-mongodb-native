'use strict';

var fs = require('fs');
var f = require('util').format;
var test = require('./shared').assert;
var setupDatabase = require('./shared').setupDatabase;

var setUp = function (configuration, options, callback) {
  var ReplSetManager = require('mongodb-topology-manager').ReplSet;

  // Check if we have any options
  if (typeof options === 'function') (callback = options), (options = null);

  // Load the cert
  var cert = fs.readFileSync(__dirname + '/ssl/client.pem');

  // Override options
  var rsOptions;
  if (options) {
    rsOptions = options;
  } else {
    rsOptions = {
      server: {
        sslPEMKeyFile: __dirname + '/ssl/server.pem',
        sslCAFile: __dirname + '/ssl/ca.pem',
        sslCRLFile: __dirname + '/ssl/crl.pem',
        sslMode: 'requireSSL'
      },
      client: {
        replSet: 'rs',
        ssl: true,
        rejectUnauthorized: false,
        key: cert,
        cert: cert,
        host: 'server'
      }
    };
  }

  // Set up the nodes
  var nodes = [
    {
      options: {
        bind_ip: 'server',
        port: 31000,
        dbpath: f('%s/../db/31000', __dirname)
      }
    },
    {
      options: {
        bind_ip: 'server',
        port: 31001,
        dbpath: f('%s/../db/31001', __dirname)
      }
    },
    {
      options: {
        bind_ip: 'server',
        port: 31002,
        dbpath: f('%s/../db/31002', __dirname)
      }
    }
  ];

  // Merge in any node start up options
  for (var i = 0; i < nodes.length; i++) {
    for (var name in rsOptions.server) {
      nodes[i].options[name] = rsOptions.server[name];
    }
  }

  // Create a manager
  var replicasetManager = new ReplSetManager('mongod', nodes, rsOptions.client);

  // Purge the set
  replicasetManager.purge().then(function () {
    // Start the server
    replicasetManager
      .start()
      .then(function () {
        setTimeout(function () {
          callback(null, replicasetManager);
        }, 10000);
      })
      .catch(function (e) {
        test.ok(e != null);
      });
  });
};

describe('SSL Validation', function () {
  before(function () {
    return setupDatabase(this.configuration);
  });

  it('shouldFailDuePresentingWrongCredentialsToServer', {
    metadata: { requires: { topology: 'ssl' } },

    test: function (done) {
      var configuration = this.configuration;
      var Server = configuration.require.Server,
        ReplSet = configuration.require.ReplSet,
        MongoClient = configuration.require.MongoClient;

      setUp(configuration, function (e, replicasetManager) {
        // Read the ca
        var ca = [fs.readFileSync(__dirname + '/ssl/ca.pem')];
        var cert = fs.readFileSync(__dirname + '/ssl/mycert.pem');
        var key = fs.readFileSync(__dirname + '/ssl/mycert.pem');

        // Create new
        var replSet = new ReplSet([new Server('server', 31001), new Server('server', 31000)], {
          rs_name: configuration.replicasetName,
          maxPoolSize: 5,
          ssl: true,
          sslValidate: true,
          sslCA: ca,
          sslKey: key,
          sslCert: cert,
          sslPass: '10gen'
        });

        // Connect to the replicaset
        var client = new MongoClient(replSet, configuration.writeConcernMax());
        client.connect(function (err) {
          test.ok(err != null);

          replicasetManager.stop().then(function () {
            done();
          });
        });
      });
    }
  });

  it('Should correctly receive ping and ha events using ssl', {
    metadata: { requires: { topology: 'ssl' } },

    test: function (done) {
      var configuration = this.configuration;
      var Server = configuration.require.Server,
        ReplSet = configuration.require.ReplSet,
        MongoClient = configuration.require.MongoClient;

      setUp(configuration, function (e, replicasetManager) {
        // Read the ca
        var ca = [fs.readFileSync(__dirname + '/ssl/ca.pem')];
        var cert = fs.readFileSync(__dirname + '/ssl/client.pem');
        var key = fs.readFileSync(__dirname + '/ssl/client.pem');

        // Create new
        var replSet = new ReplSet([new Server('server', 31001), new Server('server', 31000)], {
          rs_name: configuration.replicasetName,
          ssl: true,
          sslValidate: true,
          sslCA: ca,
          sslKey: key,
          sslCert: cert
        });

        // Connect to the replicaset
        var client = new MongoClient(replSet, configuration.writeConcernMax());
        client.connect(function (err, client) {
          test.equal(null, err);
          var ha = false;
          client.topology.once('serverHeartbeatSucceeded', function (e) {
            test.equal(null, e);
            ha = true;
          });

          var interval = setInterval(function () {
            if (ha) {
              clearInterval(interval);
              client.close();

              replicasetManager.stop().then(function () {
                done();
              });
            }
          }, 100);
        });
      });
    }
  });

  it('shouldFailToValidateServerSSLCertificate', {
    metadata: { requires: { topology: 'ssl' } },

    test: function (done) {
      var configuration = this.configuration;
      var Server = configuration.require.Server,
        ReplSet = configuration.require.ReplSet,
        MongoClient = configuration.require.MongoClient;

      var ca = [fs.readFileSync(__dirname + '/ssl/mycert.pem')];

      // Startup replicaset
      setUp(configuration, function (e, replicasetManager) {
        // Create new
        var replSet = new ReplSet([new Server('server', 31001), new Server('server', 31000)], {
          rs_name: configuration.replicasetName,
          ssl: true,
          sslValidate: true,
          sslCA: ca,
          maxPoolSize: 1
        });

        // Connect to the replicaset
        var client = new MongoClient(replSet, configuration.writeConcernMax());
        client.connect(function (err) {
          test.ok(err != null);

          replicasetManager.stop().then(function () {
            done();
          });
        });
      });
    }
  });

  it('shouldCorrectlyValidateAndPresentCertificateReplSet', {
    metadata: { requires: { topology: 'ssl' } },

    test: function (done) {
      var configuration = this.configuration;
      var Server = configuration.require.Server,
        ReplSet = configuration.require.ReplSet,
        MongoClient = configuration.require.MongoClient;

      setUp(configuration, function (e, replicasetManager) {
        // Read the ca
        var ca = [fs.readFileSync(__dirname + '/ssl/ca.pem')];
        var cert = fs.readFileSync(__dirname + '/ssl/client.pem');
        var key = fs.readFileSync(__dirname + '/ssl/client.pem');

        // Create new
        var replSet = new ReplSet([new Server('server', 31001), new Server('server', 31000)], {
          rs_name: configuration.replicasetName,
          ssl: true,
          sslValidate: true,
          sslCA: ca,
          sslKey: key,
          sslCert: cert
        });

        // Connect to the replicaset
        var client = new MongoClient(replSet, configuration.writeConcernMax());
        client.connect(function (err, client) {
          test.equal(null, err);
          var db = client.db(configuration.db);

          setInterval(function () {
            db.collection('test').count(function () {});
          }, 1000);

          // Create a collection
          db.createCollection('shouldCorrectlyValidateAndPresentCertificateReplSet1', function (
            err,
            collection
          ) {
            collection.remove({}, configuration.writeConcernMax(), function () {
              collection.insert(
                [{ a: 1 }, { b: 2 }, { c: 'hello world' }],
                configuration.writeConcernMax(),
                function (err) {
                  test.equal(null, err);
                  collection.find({}).toArray(function (err, items) {
                    test.equal(3, items.length);
                    client.close();

                    replicasetManager.stop().then(function () {
                      done();
                    });
                  });
                }
              );
            });
          });
        });
      });
    }
  });

  it('shouldCorrectlyConnectToSSLBasedReplicaset', {
    metadata: { requires: { topology: 'ssl' } },

    test: function (done) {
      var configuration = this.configuration;
      var Server = configuration.require.Server,
        ReplSet = configuration.require.ReplSet,
        MongoClient = configuration.require.MongoClient;

      // Read the ca
      var ca = [fs.readFileSync(__dirname + '/ssl/ca.pem')];
      var cert = fs.readFileSync(__dirname + '/ssl/mycert.pem');

      setUp(
        configuration,
        {
          server: {
            sslMode: 'requireSSL',
            sslPEMKeyFile: __dirname + '/ssl/server.pem'
          },
          client: {
            ssl: true,
            host: 'server',
            replSet: 'rs',
            key: cert,
            ca: ca,
            cert: cert,
            passphrase: '10gen',
            rejectUnauthorized: false
          }
        },
        function (e, replicasetManager) {
          // Read the ca
          var ca = [fs.readFileSync(__dirname + '/ssl/ca.pem')];
          // Create new
          var replSet = new ReplSet([new Server('server', 31001), new Server('server', 31000)], {
            rs_name: configuration.replicasetName,
            ssl: true,
            sslValidate: true,
            sslCA: ca
          });

          // Connect to the replicaset
          var client = new MongoClient(replSet, configuration.writeConcernMax());
          client.connect(function (err, client) {
            test.equal(null, err);
            var db = client.db(configuration.db);

            db.collection('test').find({}, function (error) {
              test.equal(null, error);
              client.close();

              replicasetManager.stop().then(function () {
                done();
              });
            });
          });
        }
      );
    }
  });

  it('shouldFailToValidateServerSSLCertificate', {
    metadata: { requires: { topology: 'ssl' } },

    test: function (done) {
      var configuration = this.configuration;
      var Server = configuration.require.Server,
        ReplSet = configuration.require.ReplSet,
        MongoClient = configuration.require.MongoClient;

      setUp(configuration, function (e, replicasetManager) {
        // Read the ca
        var ca = [fs.readFileSync(__dirname + '/ssl/mycert.pem')];
        // Create new
        var replSet = new ReplSet([new Server('server', 31001), new Server('server', 31000)], {
          rs_name: configuration.replicasetName,
          ssl: true,
          sslValidate: true,
          sslCA: ca,
          maxPoolSize: 5
        });

        // Connect to the replicaset
        var client = new MongoClient(replSet, configuration.writeConcernMax());
        client.connect(function (err) {
          test.ok(err != null);
          test.ok(err instanceof Error);

          replicasetManager.stop().then(function () {
            done();
          });
        });
      });
    }
  });

  it('shouldFailDueToNotPresentingCertificateToServer', {
    metadata: { requires: { topology: 'ssl' } },

    test: function (done) {
      var configuration = this.configuration;
      var Server = configuration.require.Server,
        ReplSet = configuration.require.ReplSet,
        MongoClient = configuration.require.MongoClient;

      setUp(configuration, function (e, replicasetManager) {
        // Read the ca
        var ca = [fs.readFileSync(__dirname + '/ssl/mycert.pem')];
        var cert = fs.readFileSync(__dirname + '/ssl/client.pem');
        // Create new
        var replSet = new ReplSet([new Server('server', 31001), new Server('server', 31000)], {
          rs_name: configuration.replicasetName,
          ssl: true,
          sslValidate: true,
          sslCA: ca,
          sslCert: cert,
          maxPoolSize: 1
        });

        // Connect to the replicaset
        var client = new MongoClient(replSet, configuration.writeConcernMax());
        client.connect(function (err) {
          test.ok(err != null);

          replicasetManager.stop().then(function () {
            done();
          });
        });
      });
    }
  });

  it('shouldCorrectlyPresentPasswordProtectedCertificate', {
    metadata: { requires: { topology: 'ssl' } },

    test: function (done) {
      var configuration = this.configuration;
      var Server = configuration.require.Server,
        ReplSet = configuration.require.ReplSet,
        MongoClient = configuration.require.MongoClient;

      var ca = [fs.readFileSync(__dirname + '/ssl/ca.pem')];
      var cert = fs.readFileSync(__dirname + '/ssl/password_protected.pem');
      var key = fs.readFileSync(__dirname + '/ssl/password_protected.pem');

      // Startup replicaset
      setUp(
        configuration,
        {
          server: {
            sslPEMKeyFile: __dirname + '/ssl/server.pem',
            sslCAFile: __dirname + '/ssl/ca.pem',
            sslCRLFile: __dirname + '/ssl/crl.pem',
            sslMode: 'requireSSL'
          },
          client: {
            // SSL information
            host: 'server',
            ssl: true,
            // The client certificate
            ca: ca,
            key: key,
            cert: cert,
            rejectUnauthorized: true,
            passphrase: 'qwerty',
            replSet: 'rs'
          }
        },
        function (e, replicasetManager) {
          // Create new
          var replSet = new ReplSet([new Server('server', 31001), new Server('server', 31000)], {
            rs_name: configuration.replicasetName,
            ssl: true,
            sslValidate: true,
            sslCA: ca,
            sslKey: key,
            sslCert: cert,
            sslPass: 'qwerty',
            maxPoolSize: 1
          });

          // Connect to the replicaset
          var client = new MongoClient(replSet, configuration.writeConcernMax());
          client.connect(function (err, client) {
            test.equal(null, err);
            var db = client.db(configuration.db);

            // Create a collection
            db.createCollection('shouldCorrectlyValidateAndPresentCertificate2', function (
              err,
              collection
            ) {
              collection.remove({}, configuration.writeConcernMax(), function () {
                collection.insert(
                  [{ a: 1 }, { b: 2 }, { c: 'hello world' }],
                  configuration.writeConcernMax(),
                  function (err) {
                    test.equal(null, err);
                    collection.find({}).toArray(function (err, items) {
                      test.equal(3, items.length);
                      client.close();

                      replicasetManager.stop().then(function () {
                        done();
                      });
                    });
                  }
                );
              });
            });
          });
        }
      );
    }
  });

  it('shouldCorrectlyValidateServerSSLCertificate', {
    metadata: { requires: { topology: 'ssl' } },

    test: function (done) {
      var configuration = this.configuration;
      var Server = configuration.require.Server,
        ReplSet = configuration.require.ReplSet,
        MongoClient = configuration.require.MongoClient;

      var ca = [fs.readFileSync(__dirname + '/ssl/ca.pem')];

      // Startup replicaset
      setUp(
        configuration,
        {
          server: {
            sslPEMKeyFile: __dirname + '/ssl/server.pem',
            sslMode: 'requireSSL'
          },
          client: {
            // SSL information
            host: 'server',
            ssl: true,
            rejectUnauthorized: false,
            replSet: 'rs'
          }
        },
        function (e, replicasetManager) {
          // Create new
          var replSet = new ReplSet([new Server('server', 31001), new Server('server', 31000)], {
            rs_name: configuration.replicasetName,
            ssl: true,
            sslValidate: true,
            sslCA: ca,
            maxPoolSize: 1
          });

          // Connect to the replicaset
          var client = new MongoClient(replSet, configuration.writeConcernMax());
          client.connect(function (err, client) {
            test.equal(null, err);
            var db = client.db(configuration.db);

            // Create a collection
            db.createCollection('shouldCorrectlyCommunicateUsingSSLSocket', function (
              err,
              collection
            ) {
              collection.remove({}, configuration.writeConcernMax(), function () {
                collection.insert(
                  [{ a: 1 }, { b: 2 }, { c: 'hello world' }],
                  configuration.writeConcernMax(),
                  function (err) {
                    test.equal(null, err);
                    collection.find({}).toArray(function (err, items) {
                      test.equal(3, items.length);
                      client.close();

                      replicasetManager.stop().then(function () {
                        done();
                      });
                    });
                  }
                );
              });
            });
          });
        }
      );
    }
  });
});
