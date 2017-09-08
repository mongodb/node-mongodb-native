'use strict';
var test = require('./shared').assert;
var fs = require('fs');
var path = require('path');
var f = require('util').format;

// NOTE: This suite seems to require a special host file configuration on the test
//       server. Disabling the suite until we can sort this out for everyone.

describe.skip('SSL (MongoClient)', function() {
  /**
   * @ignore
   */
  it('shouldCorrectlyCommunicateUsingSSLSocket', {
    metadata: { requires: { topology: 'ssl' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var ServerManager = require('mongodb-topology-manager').Server,
        MongoClient = configuration.require.MongoClient;

      // Start server
      var serverManager = new ServerManager(
        'mongod',
        {
          journal: null,
          port: 27019,
          sslOnNormalPorts: null,
          sslPEMKeyFile: __dirname + '/ssl/server.pem',
          dbpath: path.join(path.resolve('db'), f('data-%d', 27019))
        },
        {
          ssl: true
        }
      );

      serverManager
        .purge()
        .then(function() {
          return serverManager.start();
        })
        .then(function() {
          MongoClient.connect(
            'mongodb://localhost:27019/test?ssl=true',
            {
              sslValidate: false
            },
            function(err, client) {
              test.equal(null, err);
              client.close();

              serverManager.stop().then(function() {
                done();
              });
            }
          );
        });
    }
  });

  /**
   * @ignore
   */
  it('should fail due to CRL list passed in', {
    metadata: { requires: { topology: 'ssl' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var ServerManager = require('mongodb-topology-manager').Server,
        MongoClient = configuration.require.MongoClient;

      // Start server
      var serverManager = new ServerManager(
        'mongod',
        {
          journal: null,
          port: 27019,
          sslOnNormalPorts: null,
          sslPEMKeyFile: __dirname + '/ssl/server.pem',
          dbpath: path.join(path.resolve('db'), f('data-%d', 27019))
        },
        {
          ssl: true
        }
      );

      // Read the ca
      var crl = [fs.readFileSync(__dirname + '/ssl/crl_expired.pem')];
      var ca = [fs.readFileSync(__dirname + '/ssl/ca.pem')];

      serverManager
        .purge()
        .then(function() {
          return serverManager.start();
        })
        .then(function() {
          MongoClient.connect(
            'mongodb://localhost:27019/test?ssl=true',
            {
              sslValidate: true,
              sslCA: ca,
              sslCRL: crl
            },
            function(err) {
              test.ok(err);
              test.ok(err.message.indexOf('CRL has expired') !== -1);

              serverManager.stop().then(function() {
                done();
              });
            }
          );
        });
    }
  });

  /**
   * @ignore
   */
  it('shouldCorrectlyValidateServerCertificate', {
    metadata: { requires: { topology: 'ssl' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var ServerManager = require('mongodb-topology-manager').Server,
        MongoClient = configuration.require.MongoClient;

      // Read the ca
      var ca = [fs.readFileSync(__dirname + '/ssl/ca.pem')];

      // Start server
      var serverManager = new ServerManager('mongod', {
        journal: null,
        sslOnNormalPorts: null,
        sslPEMKeyFile: __dirname + '/ssl/server.pem',
        // EnsureUp options
        dbpath: path.join(path.resolve('db'), f('data-%d', 27019)),
        bind_ip: 'server',
        port: 27019
      });

      serverManager
        .purge()
        .then(function() {
          return serverManager.start();
        })
        .then(function() {
          // Connect and validate the server certificate
          MongoClient.connect(
            'mongodb://server:27019/test?ssl=true&maxPoolSize=1',
            {
              sslValidate: true,
              sslCA: ca
            },
            function(err, client) {
              test.equal(null, err);
              client.close();

              serverManager.stop().then(function() {
                done();
              });
            }
          );
        });
    }
  });

  /**
   * @ignore
   */
  it('Should correctly pass down servername to connection for TLS SNI support', {
    metadata: { requires: { topology: 'ssl' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var ServerManager = require('mongodb-topology-manager').Server,
        MongoClient = configuration.require.MongoClient;

      // Read the ca
      var ca = [fs.readFileSync(__dirname + '/ssl/ca.pem')];

      // Start server
      var serverManager = new ServerManager('mongod', {
        journal: null,
        sslOnNormalPorts: null,
        sslPEMKeyFile: __dirname + '/ssl/server.pem',
        // EnsureUp options
        dbpath: path.join(path.resolve('db'), f('data-%d', 27019)),
        bind_ip: 'server',
        port: 27019
      });

      serverManager
        .purge()
        .then(function() {
          return serverManager.start();
        })
        .then(function() {
          MongoClient.connect(
            'mongodb://server:27019/test?ssl=true&maxPoolSize=1',
            {
              sslValidate: true,
              servername: 'server',
              sslCA: ca
            },
            function(err, client) {
              test.equal(null, err);

              client.close();

              serverManager.stop().then(function() {
                done();
              });
            }
          );
        });
    }
  });

  /**
   * @ignore
   */
  it(
    'should correctly validate ssl certificate and ignore server certificate host name validation',
    {
      metadata: { requires: { topology: 'ssl' } },

      // The actual test we wish to run
      test: function(done) {
        var configuration = this.configuration;
        var ServerManager = require('mongodb-topology-manager').Server,
          MongoClient = configuration.require.MongoClient;

        // Did we get checkServerIdentity called
        var checkServerIdentityCalled = false;

        // Read the ca
        var ca = [fs.readFileSync(__dirname + '/ssl/ca.pem')];

        // Start server
        var serverManager = new ServerManager('mongod', {
          journal: null,
          sslOnNormalPorts: null,
          sslPEMKeyFile: __dirname + '/ssl/server.pem',
          // EnsureUp options
          dbpath: path.join(path.resolve('db'), f('data-%d', 27019)),
          bind_ip: 'server',
          port: 27019
        });

        serverManager
          .purge()
          .then(function() {
            return serverManager.start();
          })
          .then(function() {
            // Connect and validate the server certificate
            MongoClient.connect(
              'mongodb://server:27019/test?ssl=true&maxPoolSize=1',
              {
                sslValidate: true,
                checkServerIdentity: function() {
                  checkServerIdentityCalled = true;
                  return undefined;
                },
                sslCA: ca
              },
              function(err, client) {
                test.equal(null, err);
                test.ok(checkServerIdentityCalled);

                client.close();

                serverManager.stop().then(function() {
                  done();
                });
              }
            );
          });
      }
    }
  );

  /**
   * @ignore
   */
  it('should fail to validate certificate due to illegal host name', {
    metadata: { requires: { topology: 'ssl' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var ServerManager = require('mongodb-topology-manager').Server,
        MongoClient = configuration.require.MongoClient;

      // Read the ca
      var ca = [fs.readFileSync(__dirname + '/ssl/ca.pem')];

      // Start server
      var serverManager = new ServerManager('mongod', {
        journal: null,
        sslOnNormalPorts: null,
        sslPEMKeyFile: __dirname + '/ssl/server.pem',
        // EnsureUp options
        dbpath: path.join(path.resolve('db'), f('data-%d', 27019)),
        bind_ip: 'server',
        port: 27019
      });

      serverManager
        .purge()
        .then(function() {
          return serverManager.start();
        })
        .then(function() {
          MongoClient.connect(
            'mongodb://localhost:27017/test?ssl=true&maxPoolSize=1',
            {
              sslValidate: true,
              sslCA: ca
            },
            function(err) {
              test.ok(err != null);

              serverManager.stop().then(function() {
                done();
              });
            }
          );
        });
    }
  });

  /**
   * @ignore
   */
  it('shouldCorrectlyValidatePresentedServerCertificateAndPresentValidCertificate', {
    metadata: { requires: { topology: 'ssl' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var ServerManager = require('mongodb-topology-manager').Server,
        MongoClient = configuration.require.MongoClient;

      // Read the ca
      var ca = [fs.readFileSync(__dirname + '/ssl/ca.pem')];
      var cert = fs.readFileSync(__dirname + '/ssl/client.pem');
      var key = fs.readFileSync(__dirname + '/ssl/client.pem');

      // Start server
      var serverManager = new ServerManager('mongod', {
        journal: null,
        sslOnNormalPorts: null,
        sslCAFile: __dirname + '/ssl/ca.pem',
        sslCRLFile: __dirname + '/ssl/crl.pem',
        sslPEMKeyFile: __dirname + '/ssl/server.pem',
        // EnsureUp options
        dbpath: path.join(path.resolve('db'), f('data-%d', 27019)),
        bind_ip: 'server',
        port: 27019
      });

      serverManager
        .purge()
        .then(function() {
          return serverManager.start();
        })
        .then(function() {
          // Connect and validate the server certificate
          MongoClient.connect(
            'mongodb://server:27019/test?ssl=true&maxPoolSize=1',
            {
              sslValidate: true,
              sslCA: ca,
              sslKey: key,
              sslCert: cert,
              sslPass: '10gen'
            },
            function(err, client) {
              test.equal(null, err);

              client.close();

              serverManager.stop().then(function() {
                done();
              });
            }
          );
        });
    }
  });

  /**
   * @ignore
   */
  it('shouldValidatePresentedServerCertificateButPresentInvalidCertificate', {
    metadata: { requires: { topology: 'ssl' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var ServerManager = require('mongodb-topology-manager').Server,
        MongoClient = configuration.require.MongoClient;
      var ca = [fs.readFileSync(__dirname + '/ssl/ca.pem')];

      // Start server
      var serverManager = new ServerManager('mongod', {
        journal: null,
        sslMode: 'requireSSL',
        sslCAFile: __dirname + '/ssl/ca.pem',
        sslCRLFile: __dirname + '/ssl/crl.pem',
        sslPEMKeyFile: __dirname + '/ssl/server.pem',
        // EnsureUp options
        dbpath: path.join(path.resolve('db'), f('data-%d', 27019)),
        bind_ip: 'server',
        port: 27019
      });

      serverManager
        .purge()
        .then(function() {
          return serverManager.start();
        })
        .then(function() {
          // Read the ca
          var cert = fs.readFileSync(__dirname + '/ssl/mycert.pem');
          var key = fs.readFileSync(__dirname + '/ssl/mycert.pem');

          // Connect and validate the server certificate
          MongoClient.connect(
            'mongodb://server:27019/test?ssl=true&maxPoolSize=1',
            {
              ssl: true,
              sslValidate: true,
              sslCA: ca,
              sslKey: key,
              sslCert: cert,
              sslPass: '10gen'
            },
            function(err) {
              test.ok(err != null);

              serverManager.stop().then(function() {
                done();
              });
            }
          );
        });
    }
  });

  /**
   * @ignore
   */
  it('shouldCorrectlyValidatePresentedServerCertificateAndInvalidKey', {
    metadata: { requires: { topology: 'ssl' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var ServerManager = require('mongodb-topology-manager').Server,
        MongoClient = configuration.require.MongoClient;

      // Read the ca
      var ca = [fs.readFileSync(__dirname + '/ssl/ca.pem')];
      var cert = fs.readFileSync(__dirname + '/ssl/client.pem');
      var key = fs.readFileSync(__dirname + '/ssl/mycert.pem');

      // Start server
      var serverManager = new ServerManager('mongod', {
        journal: null,
        sslOnNormalPorts: null,
        sslCAFile: __dirname + '/ssl/ca.pem',
        sslCRLFile: __dirname + '/ssl/crl.pem',
        sslPEMKeyFile: __dirname + '/ssl/server.pem',
        // EnsureUp options
        dbpath: path.join(path.resolve('db'), f('data-%d', 27019)),
        bind_ip: 'server',
        port: 27019
      });

      serverManager
        .purge()
        .then(function() {
          return serverManager.start();
        })
        .then(function() {
          // Connect and validate the server certificate
          MongoClient.connect(
            'mongodb://server:27019/test?ssl=true&maxPoolSize=1',
            {
              sslValidate: true,
              sslCA: ca,
              sslKey: key,
              sslCert: cert,
              sslPass: '10gen'
            },
            function(err) {
              test.ok(err != null);

              serverManager.stop().then(function() {
                done();
              });
            }
          );
        });
    }
  });

  /**
   * @ignore
   */
  it('Should correctly shut down if attempting to connect to ssl server with wrong parameters', {
    metadata: { requires: { topology: 'ssl' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var ServerManager = require('mongodb-topology-manager').Server,
        MongoClient = configuration.require.MongoClient;

      // Start server
      var serverManager = new ServerManager('mongod', {
        journal: null,
        sslOnNormalPorts: null,
        sslPEMKeyFile: __dirname + '/ssl/server.pem',
        // EnsureUp options
        dbpath: path.join(path.resolve('db'), f('data-%d', 27019)),
        bind_ip: 'server',
        port: 27019
      });

      // Start server
      serverManager
        .purge()
        .then(function() {
          return serverManager.start();
        })
        .then(function() {
          MongoClient.connect('mongodb://localhost:27019/test?ssl=false', function(err) {
            test.ok(err != null);

            serverManager.stop().then(function() {
              done();
            });
          });
        });
    }
  });

  /**
   * @ignore
   */
  it('should correctly connect using SSL to ReplSetManager', {
    metadata: { requires: { topology: 'ssl' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var ReplSetManager = require('mongodb-topology-manager').ReplSet,
        MongoClient = configuration.require.MongoClient;
      var ca = [fs.readFileSync(__dirname + '/ssl/ca.pem')];

      var replicasetManager = new ReplSetManager(
        'mongod',
        [
          {
            options: {
              bind_ip: 'server',
              port: 31000,
              dbpath: f('%s/../db/31000', __dirname),
              sslOnNormalPorts: null,
              sslPEMKeyFile: __dirname + '/ssl/server.pem'
            }
          },
          {
            options: {
              bind_ip: 'server',
              port: 31001,
              dbpath: f('%s/../db/31001', __dirname),
              sslOnNormalPorts: null,
              sslPEMKeyFile: __dirname + '/ssl/server.pem'
            }
          },
          {
            options: {
              bind_ip: 'server',
              port: 31002,
              dbpath: f('%s/../db/31002', __dirname),
              sslOnNormalPorts: null,
              sslPEMKeyFile: __dirname + '/ssl/server.pem'
            }
          }
        ],
        {
          replSet: 'rs',
          ssl: true,
          rejectUnauthorized: false,
          ca: ca,
          host: 'server'
        }
      );

      replicasetManager
        .purge()
        .then(function() {
          return replicasetManager.start();
        })
        .then(function() {
          // Connect and validate the server certificate
          MongoClient.connect(
            'mongodb://server:31000,server:31001,server:31002/test?ssl=true&replicaSet=rs&maxPoolSize=1',
            {
              ssl: true,
              sslValidate: false,
              sslCA: ca
            },
            function(err, client) {
              test.equal(null, err);
              client.close();

              replicasetManager.stop().then(function() {
                done();
              });
            }
          );
        });
    }
  });

  /**
   * @ignore
   */
  it('shouldCorrectlySendCertificateToReplSetAndValidateServerCertificate', {
    metadata: { requires: { topology: 'ssl' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var ReplSetManager = require('mongodb-topology-manager').ReplSet,
        MongoClient = configuration.require.MongoClient;

      // Read the ca
      var ca = [fs.readFileSync(__dirname + '/ssl/ca.pem')];
      var cert = fs.readFileSync(__dirname + '/ssl/client.pem');
      var key = fs.readFileSync(__dirname + '/ssl/client.pem');

      var replicasetManager = new ReplSetManager(
        'mongod',
        [
          {
            options: {
              bind_ip: 'server',
              port: 31000,
              dbpath: f('%s/../db/31000', __dirname),
              sslPEMKeyFile: __dirname + '/ssl/server.pem',
              sslCAFile: __dirname + '/ssl/ca.pem',
              sslCRLFile: __dirname + '/ssl/crl.pem',
              sslMode: 'requireSSL'
            }
          },
          {
            options: {
              bind_ip: 'server',
              port: 31001,
              dbpath: f('%s/../db/31001', __dirname),
              sslPEMKeyFile: __dirname + '/ssl/server.pem',
              sslCAFile: __dirname + '/ssl/ca.pem',
              sslCRLFile: __dirname + '/ssl/crl.pem',
              sslMode: 'requireSSL'
            }
          },
          {
            options: {
              bind_ip: 'server',
              port: 31002,
              dbpath: f('%s/../db/31002', __dirname),
              sslPEMKeyFile: __dirname + '/ssl/server.pem',
              sslCAFile: __dirname + '/ssl/ca.pem',
              sslCRLFile: __dirname + '/ssl/crl.pem',
              sslMode: 'requireSSL'
            }
          }
        ],
        {
          replSet: 'rs',
          ssl: true,
          rejectUnauthorized: false,
          key: cert,
          cert: cert,
          host: 'server'
        }
      );

      replicasetManager.purge().then(function() {
        return replicasetManager
          .start()
          .then(function() {
            // Connect and validate the server certificate
            MongoClient.connect(
              'mongodb://server:31000,server:31001/test?ssl=true&replicaSet=rs&maxPoolSize=1',
              {
                sslValidate: false,
                sslCA: ca,
                sslKey: key,
                sslCert: cert
              },
              function(err, client) {
                test.equal(null, err);
                client.close();

                replicasetManager.stop().then(function() {
                  done();
                });
              }
            );
          })
          .catch(function(e) {
            done(e);
          });
      });
    }
  });

  /**
   * @ignore
   */
  it('should correctly send SNI TLS servername to replicaset members', {
    metadata: { requires: { topology: 'ssl' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var ReplSetManager = require('mongodb-topology-manager').ReplSet,
        MongoClient = configuration.require.MongoClient;

      // Read the ca
      var ca = [fs.readFileSync(__dirname + '/ssl/ca.pem')];
      var cert = fs.readFileSync(__dirname + '/ssl/client.pem');
      var key = fs.readFileSync(__dirname + '/ssl/client.pem');

      var replicasetManager = new ReplSetManager(
        'mongod',
        [
          {
            options: {
              bind_ip: 'server',
              port: 31000,
              dbpath: f('%s/../db/31000', __dirname),
              sslPEMKeyFile: __dirname + '/ssl/server.pem',
              sslCAFile: __dirname + '/ssl/ca.pem',
              sslCRLFile: __dirname + '/ssl/crl.pem',
              sslMode: 'requireSSL'
            }
          },
          {
            options: {
              bind_ip: 'server',
              port: 31001,
              dbpath: f('%s/../db/31001', __dirname),
              sslPEMKeyFile: __dirname + '/ssl/server.pem',
              sslCAFile: __dirname + '/ssl/ca.pem',
              sslCRLFile: __dirname + '/ssl/crl.pem',
              sslMode: 'requireSSL'
            }
          },
          {
            options: {
              bind_ip: 'server',
              port: 31002,
              dbpath: f('%s/../db/31002', __dirname),
              sslPEMKeyFile: __dirname + '/ssl/server.pem',
              sslCAFile: __dirname + '/ssl/ca.pem',
              sslCRLFile: __dirname + '/ssl/crl.pem',
              sslMode: 'requireSSL'
            }
          }
        ],
        {
          replSet: 'rs',
          ssl: true,
          rejectUnauthorized: false,
          key: cert,
          cert: cert,
          host: 'server'
        }
      );

      replicasetManager.purge().then(function() {
        // Start the server
        replicasetManager
          .start()
          .then(function() {
            setTimeout(function() {
              // Connect and validate the server certificate
              MongoClient.connect(
                'mongodb://server:31000/test?ssl=true&replicaSet=rs&maxPoolSize=1',
                {
                  sslValidate: false,
                  servername: 'server',
                  sslCA: ca,
                  sslKey: key,
                  sslCert: cert
                },
                function(err, client) {
                  test.equal(null, err);

                  client.close();

                  replicasetManager.stop().then(function() {
                    done();
                  });
                }
              );
            }, 10000);
          })
          .catch(function(e) {
            done(e);
          });
      });
    }
  });

  /**
   * @ignore
   */
  it('should correctly send SNI TLS servername to replicaset members with restart', {
    metadata: { requires: { topology: 'ssl' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var ReplSetManager = require('mongodb-topology-manager').ReplSet,
        MongoClient = configuration.require.MongoClient;

      // Read the ca
      var ca = [fs.readFileSync(__dirname + '/ssl/ca.pem')];
      var cert = fs.readFileSync(__dirname + '/ssl/client.pem');
      var key = fs.readFileSync(__dirname + '/ssl/client.pem');

      var replicasetManager = new ReplSetManager(
        'mongod',
        [
          {
            options: {
              bind_ip: 'server',
              port: 31000,
              dbpath: f('%s/../db/31000', __dirname),
              sslPEMKeyFile: __dirname + '/ssl/server.pem',
              sslCAFile: __dirname + '/ssl/ca.pem',
              sslCRLFile: __dirname + '/ssl/crl.pem',
              sslMode: 'requireSSL'
            }
          },
          {
            options: {
              bind_ip: 'server',
              port: 31001,
              dbpath: f('%s/../db/31001', __dirname),
              sslPEMKeyFile: __dirname + '/ssl/server.pem',
              sslCAFile: __dirname + '/ssl/ca.pem',
              sslCRLFile: __dirname + '/ssl/crl.pem',
              sslMode: 'requireSSL'
            }
          },
          {
            options: {
              bind_ip: 'server',
              port: 31002,
              dbpath: f('%s/../db/31002', __dirname),
              sslPEMKeyFile: __dirname + '/ssl/server.pem',
              sslCAFile: __dirname + '/ssl/ca.pem',
              sslCRLFile: __dirname + '/ssl/crl.pem',
              sslMode: 'requireSSL'
            }
          }
        ],
        {
          replSet: 'rs',
          ssl: true,
          rejectUnauthorized: false,
          key: cert,
          cert: cert,
          host: 'server'
        }
      );

      replicasetManager.purge().then(function() {
        // Start the server
        replicasetManager
          .start()
          .then(function() {
            setTimeout(function() {
              // Connect and validate the server certificate
              MongoClient.connect(
                'mongodb://server:31000/test?ssl=true&replicaSet=rs&maxPoolSize=1',
                {
                  sslValidate: false,
                  servername: 'server',
                  sslCA: ca,
                  sslKey: key,
                  sslCert: cert,
                  haInterval: 2000
                },
                function(err, client) {
                  test.equal(null, err);

                  replicasetManager.primary().then(function(primary) {
                    primary.stop().then(function() {
                      // Restart the old master and wait for the sync to happen
                      primary.start().then(function() {
                        // Wait to allow haInterval to happen
                        setTimeout(function() {
                          client.close();
                          var connections = client.topology.connections();

                          for (var i = 0; i < connections.length; i++) {
                            test.equal('server', connections[i].options.servername);
                          }

                          replicasetManager.stop().then(function() {
                            done();
                          });
                        }, 3000);
                      });
                    });
                  });
                }
              );
            }, 10000);
          })
          .catch(function(e) {
            done(e);
          });
      });
    }
  });

  /**
   * @ignore
   */
  it('shouldSendWrongCertificateToReplSetAndValidateServerCertificate', {
    metadata: { requires: { topology: 'ssl' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var ReplSetManager = require('mongodb-topology-manager').ReplSet,
        MongoClient = configuration.require.MongoClient;

      var ca = [fs.readFileSync(__dirname + '/ssl/ca.pem')];
      var cert = fs.readFileSync(__dirname + '/ssl/client.pem');

      var replicasetManager = new ReplSetManager(
        'mongod',
        [
          {
            options: {
              bind_ip: 'server',
              port: 31000,
              dbpath: f('%s/../db/31000', __dirname),
              sslPEMKeyFile: __dirname + '/ssl/server.pem',
              sslCAFile: __dirname + '/ssl/ca.pem',
              sslCRLFile: __dirname + '/ssl/crl.pem',
              sslMode: 'requireSSL'
            }
          },
          {
            options: {
              bind_ip: 'server',
              port: 31001,
              dbpath: f('%s/../db/31001', __dirname),
              sslPEMKeyFile: __dirname + '/ssl/server.pem',
              sslCAFile: __dirname + '/ssl/ca.pem',
              sslCRLFile: __dirname + '/ssl/crl.pem',
              sslMode: 'requireSSL'
            }
          },
          {
            options: {
              bind_ip: 'server',
              port: 31002,
              dbpath: f('%s/../db/31002', __dirname),
              sslPEMKeyFile: __dirname + '/ssl/server.pem',
              sslCAFile: __dirname + '/ssl/ca.pem',
              sslCRLFile: __dirname + '/ssl/crl.pem',
              sslMode: 'requireSSL'
            }
          }
        ],
        {
          replSet: 'rs',
          ssl: true,
          rejectUnauthorized: false,
          key: cert,
          cert: cert,
          host: 'server'
        }
      );

      replicasetManager.purge().then(function() {
        // Start the server
        replicasetManager
          .start()
          .then(function() {
            setTimeout(function() {
              // Present wrong certificate
              var cert = fs.readFileSync(__dirname + '/ssl/mycert.pem');
              var key = fs.readFileSync(__dirname + '/ssl/mycert.pem');

              // Connect and validate the server certificate
              MongoClient.connect(
                'mongodb://server:31000,server:31001/test?ssl=true&replicaSet=rs&maxPoolSize=1',
                {
                  sslValidate: true,
                  sslCA: ca,
                  sslKey: key,
                  sslCert: cert,
                  sslPass: '10gen'
                },
                function(err) {
                  test.ok(err != null);

                  replicasetManager.stop().then(function() {
                    done();
                  });
                }
              );
            }, 10000);
          })
          .catch(function(e) {
            done(e);
          });
      });
    }
  });

  /**
   * @ignore
   */
  it('should correctly to replicaset using ssl connect with password', {
    metadata: { requires: { topology: 'ssl' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var ReplSetManager = require('mongodb-topology-manager').ReplSet,
        MongoClient = configuration.require.MongoClient;

      // Read the ca
      var ca = [fs.readFileSync(__dirname + '/ssl/ca.pem')];
      var cert = fs.readFileSync(__dirname + '/ssl/client.pem');
      var key = fs.readFileSync(__dirname + '/ssl/client.pem');

      var replicasetManager = new ReplSetManager(
        'mongod',
        [
          {
            options: {
              bind_ip: 'server',
              port: 31000,
              dbpath: f('%s/../db/31000', __dirname),
              sslPEMKeyFile: __dirname + '/ssl/server.pem',
              sslCAFile: __dirname + '/ssl/ca.pem',
              sslCRLFile: __dirname + '/ssl/crl.pem',
              sslMode: 'requireSSL'
            }
          },
          {
            options: {
              bind_ip: 'server',
              port: 31001,
              dbpath: f('%s/../db/31001', __dirname),
              sslPEMKeyFile: __dirname + '/ssl/server.pem',
              sslCAFile: __dirname + '/ssl/ca.pem',
              sslCRLFile: __dirname + '/ssl/crl.pem',
              sslMode: 'requireSSL'
            }
          },
          {
            options: {
              bind_ip: 'server',
              port: 31002,
              dbpath: f('%s/../db/31002', __dirname),
              sslPEMKeyFile: __dirname + '/ssl/server.pem',
              sslCAFile: __dirname + '/ssl/ca.pem',
              sslCRLFile: __dirname + '/ssl/crl.pem',
              sslMode: 'requireSSL'
            }
          }
        ],
        {
          replSet: 'rs',
          ssl: true,
          rejectUnauthorized: false,
          key: cert,
          cert: cert,
          host: 'server'
        }
      );

      replicasetManager.purge().then(function() {
        // Start the server
        replicasetManager.start().then(function() {
          setTimeout(function() {
            // Connect and validate the server certificate
            MongoClient.connect(
              'mongodb://server:31000,server:31001/test?ssl=true&replicaSet=rs&maxPoolSize=1',
              {
                sslValidate: true,
                sslCA: ca,
                sslKey: key,
                sslCert: cert,
                sslPass: '10gen'
              },
              function(err, client) {
                test.equal(null, err);
                client.close();

                replicasetManager.stop().then(function() {
                  done();
                });
              }
            );
          }, 10000);
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('should correctly connect using ssl with sslValidation turned off', {
    metadata: { requires: { topology: 'ssl' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var ReplSetManager = require('mongodb-topology-manager').ReplSet,
        MongoClient = configuration.require.MongoClient;
      var cert = fs.readFileSync(__dirname + '/ssl/client.pem');

      var replicasetManager = new ReplSetManager(
        'mongod',
        [
          {
            options: {
              bind_ip: 'server',
              port: 31000,
              dbpath: f('%s/../db/31000', __dirname),
              sslOnNormalPorts: null,
              sslPEMKeyFile: __dirname + '/ssl/server.pem'
            }
          },
          {
            options: {
              bind_ip: 'server',
              port: 31001,
              dbpath: f('%s/../db/31001', __dirname),
              sslOnNormalPorts: null,
              sslPEMKeyFile: __dirname + '/ssl/server.pem'
            }
          },
          {
            options: {
              bind_ip: 'server',
              port: 31002,
              dbpath: f('%s/../db/31002', __dirname),
              sslOnNormalPorts: null,
              sslPEMKeyFile: __dirname + '/ssl/server.pem'
            }
          }
        ],
        {
          replSet: 'rs',
          ssl: true,
          rejectUnauthorized: false,
          key: cert,
          cert: cert,
          host: 'server'
        }
      );

      replicasetManager.purge().then(function() {
        // Start the server
        replicasetManager.start().then(function() {
          setTimeout(function() {
            // Connect and validate the server certificate
            MongoClient.connect(
              'mongodb://server:31000,server:31001/test?ssl=true&replicaSet=rs&maxPoolSize=1',
              {
                ssl: true,
                sslValidate: false
              },
              function(err, client) {
                test.equal(null, err);

                client.close();

                replicasetManager.stop().then(function() {
                  done();
                });
              }
            );
          }, 10000);
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('should correctly connect using SSL to replicaset with requireSSL', {
    metadata: { requires: { topology: 'ssl' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var ReplSetManager = require('mongodb-topology-manager').ReplSet,
        MongoClient = configuration.require.MongoClient;

      // Read the ca
      var ca = [fs.readFileSync(__dirname + '/ssl/ca.pem')];
      var cert = fs.readFileSync(__dirname + '/ssl/client.pem');
      var key = fs.readFileSync(__dirname + '/ssl/client.pem');
      var replicasetManager = new ReplSetManager(
        'mongod',
        [
          {
            options: {
              bind_ip: 'server',
              port: 31000,
              dbpath: f('%s/../db/31000', __dirname),
              sslPEMKeyFile: __dirname + '/ssl/server.pem',
              sslMode: 'requireSSL'
            }
          },
          {
            options: {
              bind_ip: 'server',
              port: 31001,
              dbpath: f('%s/../db/31001', __dirname),
              sslPEMKeyFile: __dirname + '/ssl/server.pem',
              sslMode: 'requireSSL'
            }
          },
          {
            options: {
              bind_ip: 'server',
              port: 31002,
              dbpath: f('%s/../db/31002', __dirname),
              sslPEMKeyFile: __dirname + '/ssl/server.pem',
              sslMode: 'requireSSL'
            }
          }
        ],
        {
          replSet: 'rs',
          ssl: true,
          rejectUnauthorized: false,
          ca: ca,
          host: 'server'
        }
      );

      replicasetManager.purge().then(function() {
        // Start the server
        replicasetManager
          .start()
          .then(function() {
            setTimeout(function() {
              // Connect and validate the server certificate
              MongoClient.connect(
                'mongodb://server:31000,server:31001,server:31002/test?replicaSet=rs',
                {
                  ssl: true,
                  sslKey: key,
                  sslCert: cert,
                  sslCA: ca
                },
                function(err, client) {
                  test.equal(null, err);
                  var sets = [{}];
                  var db = client.db(configuration.db);

                  var interval = setInterval(function() {
                    db.command(
                      { ismaster: true },
                      { readPreference: 'nearest', full: true },
                      function(e, r) {
                        // Add seen servers to list
                        if (r) {
                          sets[sets.length - 1][r.connection.port] = true;
                        }
                      }
                    );
                  }, 500);

                  setTimeout(function() {
                    // Force a reconnect of a server
                    var secondary = client.topology.s.replset.s.replicaSetState.secondaries[0];
                    secondary.destroy({ emitClose: true });
                    sets.push({});

                    client.topology.once('joined', function() {
                      setTimeout(function() {
                        clearInterval(interval);

                        test.ok(sets[0][31000]);
                        test.ok(sets[0][31001]);
                        test.ok(sets[0][31002]);

                        test.ok(sets[1][31000]);
                        test.ok(sets[1][31001]);
                        test.ok(sets[1][31002]);

                        client.close();

                        replicasetManager.stop().then(function() {
                          done();
                        });
                      }, 5000);
                    });
                  }, 2000);
                }
              );
            });
          }, 10000)
          .catch(function(err) {
            done(err);
          });
      });
    }
  });

  /**
   * @ignore
   */
  it('should correctly connect to Replicaset using SSL when secondary down', {
    metadata: { requires: { topology: 'ssl' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var ReplSetManager = require('mongodb-topology-manager').ReplSet,
        MongoClient = configuration.require.MongoClient;

      var ca = [fs.readFileSync(__dirname + '/ssl/ca.pem')];
      var replicasetManager = new ReplSetManager(
        'mongod',
        [
          {
            options: {
              bind_ip: 'server',
              port: 31000,
              dbpath: f('%s/../db/31000', __dirname),
              sslOnNormalPorts: null,
              sslPEMKeyFile: __dirname + '/ssl/server.pem'
            }
          },
          {
            options: {
              bind_ip: 'server',
              port: 31001,
              dbpath: f('%s/../db/31001', __dirname),
              sslOnNormalPorts: null,
              sslPEMKeyFile: __dirname + '/ssl/server.pem'
            }
          },
          {
            options: {
              bind_ip: 'server',
              port: 31002,
              dbpath: f('%s/../db/31002', __dirname),
              sslOnNormalPorts: null,
              sslPEMKeyFile: __dirname + '/ssl/server.pem'
            }
          }
        ],
        {
          replSet: 'rs',
          ssl: true,
          rejectUnauthorized: false,
          ca: ca,
          host: 'server'
        }
      );

      replicasetManager.purge().then(function() {
        // Start the server
        replicasetManager.start().then(function() {
          replicasetManager.secondaries().then(function(managers) {
            var secondaryServerManager = managers[0];

            secondaryServerManager.stop().then(function() {
              setTimeout(function() {
                // Connect and validate the server certificate
                MongoClient.connect(
                  'mongodb://server:31000,server:31001,server:31002/test?ssl=true&replicaSet=rs&maxPoolSize=1',
                  {
                    ssl: true,
                    sslValidate: false,
                    sslCA: ca
                  },
                  function(err, client) {
                    test.equal(null, err);
                    client.close();

                    replicasetManager.stop().then(function() {
                      done();
                    });
                  }
                );
              }, 1000);
            });
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  /*
  it('should fail due to accessing using ip address'] = {
    metadata: { requires: { topology: 'ssl' } },

    // The actual test we wish to run
    test: function(done) {
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
            // MongoClient.connect("mongodb://127.0.0.1:27019/test?ssl=true&maxPoolSize=1", {
            // MongoClient.connect("mongodb://foo:bar@ds015564-a0.sjf52.fleet.mongolab.com:15564,ds015564-a1.sjf52.fleet.mongolab.com:15564/test?replicaSet=rs-ds015564&ssl=true", {          // MongoClient.connect("mongodb://server:27019/test?ssl=true&maxPoolSize=1", {
            MongoClient.connect("mongodb://foo:bar@54.161.72.61:15564,54.204.126.162:15564/test?replicaSet=rs-ds015564&ssl=true", {
                sslValidate:true,
                // checkServerIdentity:true
              // , sslCA:ca
            }, function(err, db) {
              test.equal(null, err);
              test.ok(db != null);

              db.close();

              serverManager.stop().then(function() {
                done();
              });
            });
          }, 1000);
        });
      });
    }
  }
  */
});
