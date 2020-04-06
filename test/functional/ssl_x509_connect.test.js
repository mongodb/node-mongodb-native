'use strict';
var fs = require('fs');
const chai = require('chai');
const expect = chai.expect;
const sinon = require('sinon');
const sinonChai = require('sinon-chai');
chai.use(sinonChai);
const f = require('util').format;
const test = require('./shared').assert;
const setupDatabase = require('./shared').setupDatabase;

const wireprotocol = require('../../lib/core/wireprotocol');

describe('SSL (x509)', function() {
  before(function() {
    return setupDatabase(this.configuration);
  });

  /**
   * @ignore
   */
  it('Should correctly authenticate using x509', {
    metadata: { requires: { topology: 'ssl' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var ServerManager = require('mongodb-topology-manager').Server,
        MongoClient = configuration.require.MongoClient;

      // Read the cert and key
      var cert = fs.readFileSync(__dirname + '/ssl/x509/client.pem');
      var key = fs.readFileSync(__dirname + '/ssl/x509/client.pem');

      // User name
      var userName = 'CN=client,OU=kerneluser,O=10Gen,L=New York City,ST=New York,C=US';

      // Create server manager
      var serverManager = new ServerManager(
        'mongod',
        {
          bind_ip: 'server',
          port: 27019,
          dbpath: f('%s/../db/27019', __dirname),
          sslPEMKeyFile: __dirname + '/ssl/x509/server.pem',
          sslCAFile: __dirname + '/ssl/x509/ca.pem',
          sslCRLFile: __dirname + '/ssl/x509/crl.pem',
          sslMode: 'requireSSL',
          sslWeakCertificateValidation: null
        },
        {
          ssl: true,
          host: 'server',
          key: cert,
          cert: cert,
          rejectUnauthorized: false
        }
      );

      // Purge the set
      serverManager.purge().then(function() {
        // Start the server
        serverManager.start().then(function() {
          // Connect and validate the server certificate
          MongoClient.connect(
            'mongodb://server:27019/test?ssl=true&maxPoolSize=1',
            {
              server: {
                sslKey: key,
                sslCert: cert,
                sslValidate: false
              }
            },
            function(err, client) {
              test.equal(null, err);
              var db = client.db(configuration.db);

              // Execute build info
              db.command({ buildInfo: 1 }, function(err, result) {
                test.equal(null, err);
                var version = parseInt(result.versionArray.slice(0, 3).join(''), 10);
                if (version < 253) {
                  client.close();
                  return done();
                }

                // Add the X509 auth user to the $external db
                var ext = client.db('$external');
                ext.addUser(
                  userName,
                  {
                    roles: [
                      { role: 'readWriteAnyDatabase', db: 'admin' },
                      { role: 'userAdminAnyDatabase', db: 'admin' }
                    ]
                  },
                  function(err, result) {
                    test.equal(null, err);
                    test.equal(userName, result[0].user);
                    test.equal('', result[0].pwd);
                    client.close();

                    // Connect using X509 authentication
                    MongoClient.connect(
                      f(
                        'mongodb://%s@server:27019/test?authMechanism=%s&ssl=true&maxPoolSize=1',
                        encodeURIComponent(userName),
                        'MONGODB-X509'
                      ),
                      {
                        server: {
                          sslKey: key,
                          sslCert: cert,
                          sslValidate: false
                        }
                      },
                      function(err, client) {
                        test.equal(null, err);

                        client.close();

                        serverManager.stop().then(function() {
                          done();
                        });
                      }
                    );
                  }
                );
              });
            }
          );
        });
      });
    }
  });

  it('Should speculatively authenticate using x509', {
    metadata: { requires: { topology: 'ssl', mongodb: '' }, useUnifiedTopology: true },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var ServerManager = require('mongodb-topology-manager').Server,
        MongoClient = configuration.require.MongoClient;

      const commandSpy = sinon.spy(wireprotocol, 'command');

      // Read the cert and key
      var cert = fs.readFileSync(__dirname + '/ssl/x509/client.pem');
      var key = fs.readFileSync(__dirname + '/ssl/x509/client.pem');

      // User name
      var userName = 'CN=client,OU=kerneluser,O=10Gen,L=New York City,ST=New York,C=US';

      // Create server manager
      var serverManager = new ServerManager(
        'mongod',
        {
          bind_ip: 'server',
          port: 27019,
          dbpath: f('%s/../db/27019', __dirname),
          sslPEMKeyFile: __dirname + '/ssl/x509/server.pem',
          sslCAFile: __dirname + '/ssl/x509/ca.pem',
          sslCRLFile: __dirname + '/ssl/x509/crl.pem',
          sslMode: 'requireSSL',
          sslWeakCertificateValidation: null
        },
        {
          ssl: true,
          host: 'server',
          key: cert,
          cert: cert,
          rejectUnauthorized: false
        }
      );

      // Purge the set
      serverManager.purge().then(function() {
        // Start the server
        serverManager.start().then(function() {
          // Connect and validate the server certificate
          MongoClient.connect(
            'mongodb://server:27019/test?ssl=true&maxPoolSize=1',
            {
              server: {
                sslKey: key,
                sslCert: cert,
                sslValidate: false
              }
            },
            function(err, client) {
              expect(err).to.not.exist;
              var db = client.db(configuration.db);

              // Execute build info
              db.command({ buildInfo: 1 }, function(err, result) {
                expect(err).to.not.exist;
                var version = parseInt(result.versionArray.slice(0, 3).join(''), 10);
                if (version < 253) {
                  client.close();
                  return done();
                }

                // Add the X509 auth user to the $external db
                var ext = client.db('$external');
                ext.addUser(
                  userName,
                  {
                    roles: [
                      { role: 'readWriteAnyDatabase', db: 'admin' },
                      { role: 'userAdminAnyDatabase', db: 'admin' }
                    ]
                  },
                  function(err, result) {
                    expect(err).to.not.exist;
                    test.equal(userName, result[0].user);
                    test.equal('', result[0].pwd);
                    client.close();

                    // Connect using X509 authentication
                    MongoClient.connect(
                      f(
                        'mongodb://%s@server:27019/test?authMechanism=%s&ssl=true&maxPoolSize=1',
                        encodeURIComponent(userName),
                        'MONGODB-X509'
                      ),
                      {
                        server: {
                          sslKey: key,
                          sslCert: cert,
                          sslValidate: false
                        }
                      },
                      function(err, client) {
                        expect(err).to.not.exist;

                        const firstIsMaster = commandSpy.getCall(0).args[2];
                        const saslContinueCommand = commandSpy.getCall(1).args[2];
                        expect(firstIsMaster).to.have.property('speculativeAuthenticate');
                        expect(saslContinueCommand).to.have.property('saslContinue');
                        commandSpy.restore();

                        client.close();

                        serverManager.stop().then(() => done());
                      }
                    );
                  }
                );
              });
            }
          );
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('Should correctly handle bad x509 certificate', {
    metadata: { requires: { topology: 'ssl' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var ServerManager = require('mongodb-topology-manager').Server,
        MongoClient = configuration.require.MongoClient;

      // Read the cert and key
      var cert = fs.readFileSync(__dirname + '/ssl/x509/client.pem');
      var key = fs.readFileSync(__dirname + '/ssl/x509/client.pem');
      var serverPem = fs.readFileSync(__dirname + '/ssl/x509/server.pem');

      // User name
      var userName = 'CN=client,OU=kerneluser,O=10Gen,L=New York City,ST=New York,C=US';

      // Create server manager
      var serverManager = new ServerManager(
        'mongod',
        {
          bind_ip: 'server',
          port: 27019,
          dbpath: f('%s/../db/27019', __dirname),
          sslPEMKeyFile: __dirname + '/ssl/x509/server.pem',
          sslCAFile: __dirname + '/ssl/x509/ca.pem',
          sslCRLFile: __dirname + '/ssl/x509/crl.pem',
          sslMode: 'requireSSL',
          sslWeakCertificateValidation: null
        },
        {
          ssl: true,
          host: 'server',
          key: cert,
          cert: cert,
          rejectUnauthorized: false
        }
      );

      // Purge the set
      serverManager.purge().then(function() {
        // Start the server
        serverManager.start().then(function() {
          // Connect and validate the server certificate
          MongoClient.connect(
            'mongodb://server:27019/test?ssl=true&maxPoolSize=1',
            {
              server: {
                sslKey: key,
                sslCert: cert,
                sslValidate: false
              }
            },
            function(err, client) {
              test.equal(null, err);
              var db = client.db(configuration.db);

              // Execute build info
              db.command({ buildInfo: 1 }, function(err, result) {
                test.equal(null, err);
                var version = parseInt(result.versionArray.slice(0, 3).join(''), 10);
                if (version < 253) {
                  client.close();
                  return done();
                }

                // Add the X509 auth user to the $external db
                var ext = client.db('$external');
                ext.addUser(
                  userName,
                  {
                    roles: [
                      { role: 'readWriteAnyDatabase', db: 'admin' },
                      { role: 'userAdminAnyDatabase', db: 'admin' }
                    ]
                  },
                  function(err, result) {
                    test.equal(null, err);
                    test.equal(userName, result[0].user);
                    test.equal('', result[0].pwd);
                    client.close();

                    // Connect using X509 authentication
                    MongoClient.connect(
                      f(
                        'mongodb://%s@server:27019/test?authMechanism=%s&ssl=true&maxPoolSize=1',
                        encodeURIComponent(userName),
                        'MONGODB-X509'
                      ),
                      {
                        server: {
                          sslKey: serverPem,
                          sslCert: serverPem,
                          sslValidate: false
                        }
                      },
                      function(err) {
                        test.equal(0, err.ok);
                        test.equal('auth failed', err.errmsg);

                        serverManager.stop().then(function() {
                          done();
                        });
                      }
                    );
                  }
                );
              });
            }
          );
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('Should give reasonable error on x509 authentication failure', {
    metadata: { requires: { topology: 'ssl' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var ServerManager = require('mongodb-topology-manager').Server,
        MongoClient = configuration.require.MongoClient;

      // Read the cert and key
      var cert = fs.readFileSync(__dirname + '/ssl/x509/client.pem');
      var key = fs.readFileSync(__dirname + '/ssl/x509/client.pem');

      // User name
      var userName = 'CN=client,OU=kerneluser,O=10Gen,L=New York City,ST=New York,C=US';

      // Create server manager
      var serverManager = new ServerManager(
        'mongod',
        {
          bind_ip: 'server',
          port: 27019,
          dbpath: f('%s/../db/27019', __dirname),
          sslPEMKeyFile: __dirname + '/ssl/x509/server.pem',
          sslCAFile: __dirname + '/ssl/x509/ca.pem',
          sslCRLFile: __dirname + '/ssl/x509/crl.pem',
          sslMode: 'requireSSL',
          sslWeakCertificateValidation: null
        },
        {
          ssl: true,
          host: 'server',
          key: cert,
          cert: cert,
          rejectUnauthorized: false
        }
      );

      // Purge the set
      serverManager.purge().then(function() {
        // Start the server
        serverManager.start().then(function() {
          // Connect and validate the server certificate
          MongoClient.connect(
            'mongodb://server:27019/test?ssl=true&maxPoolSize=1',
            {
              server: {
                sslKey: key,
                sslCert: cert,
                sslValidate: false
              }
            },
            function(err, client) {
              test.equal(null, err);
              var db = client.db(configuration.db);

              // Execute build info
              db.command({ buildInfo: 1 }, function(err, result) {
                test.equal(null, err);
                var version = parseInt(result.versionArray.slice(0, 3).join(''), 10);
                if (version < 253) {
                  client.close();
                  return done();
                }

                // Add the X509 auth user to the $external db
                var ext = client.db('$external');
                ext.addUser(
                  userName,
                  {
                    roles: [
                      { role: 'readWriteAnyDatabase', db: 'admin' },
                      { role: 'userAdminAnyDatabase', db: 'admin' }
                    ]
                  },
                  function(err, result) {
                    test.equal(null, err);
                    test.equal(userName, result[0].user);
                    test.equal('', result[0].pwd);
                    client.close();

                    // Connect using X509 authentication
                    MongoClient.connect(
                      f(
                        'mongodb://%s@server:27019/test?authMechanism=%s&ssl=true&maxPoolSize=1',
                        encodeURIComponent('WRONG_USERNAME'),
                        'MONGODB-X509'
                      ),
                      {
                        server: {
                          sslKey: key,
                          sslCert: cert,
                          sslValidate: false
                        }
                      },
                      function(err) {
                        test.equal(0, err.ok);
                        test.equal('auth failed', err.errmsg);

                        serverManager.stop().then(function() {
                          done();
                        });
                      }
                    );
                  }
                );
              });
            }
          );
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('Should give helpful error when attempting to use x509 without SSL', {
    metadata: { requires: { topology: 'ssl' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var ServerManager = require('mongodb-topology-manager').Server,
        MongoClient = configuration.require.MongoClient;

      // Read the cert and key
      var cert = fs.readFileSync(__dirname + '/ssl/x509/client.pem');
      var key = fs.readFileSync(__dirname + '/ssl/x509/client.pem');
      var serverPem = fs.readFileSync(__dirname + '/ssl/x509/server.pem');

      // User name
      var userName = 'CN=client,OU=kerneluser,O=10Gen,L=New York City,ST=New York,C=US';

      // Create server manager
      var serverManager = new ServerManager(
        'mongod',
        {
          bind_ip: 'server',
          port: 27019,
          dbpath: f('%s/../db/27019', __dirname)
        },
        {}
      );

      // Purge the set
      serverManager.purge().then(function() {
        // Start the server
        serverManager.start().then(function() {
          // Connect and validate the server certificate
          MongoClient.connect(
            'mongodb://server:27019/test?ssl=false&maxPoolSize=1',
            {
              server: {
                sslKey: key,
                sslCert: cert,
                sslValidate: false
              }
            },
            function(err, client) {
              test.equal(null, err);
              var db = client.db(configuration.db);

              // Execute build info
              db.command({ buildInfo: 1 }, function(err, result) {
                test.equal(null, err);
                var version = parseInt(result.versionArray.slice(0, 3).join(''), 10);
                if (version < 253) {
                  client.close();
                  return done();
                }

                // Add the X509 auth user to the $external db
                var ext = client.db('$external');
                ext.addUser(
                  userName,
                  {
                    roles: [
                      { role: 'readWriteAnyDatabase', db: 'admin' },
                      { role: 'userAdminAnyDatabase', db: 'admin' }
                    ]
                  },
                  function(err, result) {
                    test.equal(null, err);
                    test.equal(userName, result[0].user);
                    test.equal('', result[0].pwd);
                    client.close();

                    // Connect using X509 authentication
                    MongoClient.connect(
                      f(
                        'mongodb://%s@server:27019/test?authMechanism=%s&ssl=false&maxPoolSize=1',
                        encodeURIComponent(userName),
                        'MONGODB-X509'
                      ),
                      {
                        server: {
                          sslKey: serverPem,
                          sslCert: serverPem,
                          sslValidate: false
                        }
                      },
                      function(err) {
                        test.ok(!!err);
                        test.equal(0, err.ok);
                        test.equal(
                          'SSL support is required for the MONGODB-X509 mechanism.',
                          err.errmsg
                        );

                        serverManager.stop().then(function() {
                          done();
                        });
                      }
                    );
                  }
                );
              });
            }
          );
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('Should correctly reauthenticate against x509', {
    metadata: { requires: { topology: 'ssl' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var ServerManager = require('mongodb-topology-manager').Server,
        MongoClient = configuration.require.MongoClient;

      // Read the cert and key
      var cert = fs.readFileSync(__dirname + '/ssl/x509/client.pem');
      var key = fs.readFileSync(__dirname + '/ssl/x509/client.pem');

      // User name
      var userName = 'CN=client,OU=kerneluser,O=10Gen,L=New York City,ST=New York,C=US';

      // Create server manager
      var serverManager = new ServerManager(
        'mongod',
        {
          bind_ip: 'server',
          port: 27019,
          dbpath: f('%s/../db/27019', __dirname),
          sslPEMKeyFile: __dirname + '/ssl/x509/server.pem',
          sslCAFile: __dirname + '/ssl/x509/ca.pem',
          sslCRLFile: __dirname + '/ssl/x509/crl.pem',
          sslMode: 'requireSSL',
          sslWeakCertificateValidation: null
        },
        {
          ssl: true,
          host: 'server',
          key: cert,
          cert: cert,
          rejectUnauthorized: false
        }
      );

      // Purge the set
      serverManager.purge().then(function() {
        // Start the server
        serverManager.start().then(function() {
          // Connect and validate the server certificate
          MongoClient.connect(
            'mongodb://server:27019/test?ssl=true&maxPoolSize=1',
            {
              server: {
                sslKey: key,
                sslCert: cert,
                sslValidate: false
              }
            },
            function(err, client) {
              test.equal(null, err);
              var db = client.db(configuration.db);

              // Execute build info
              db.command({ buildInfo: 1 }, function(err, result) {
                test.equal(null, err);
                var version = parseInt(result.versionArray.slice(0, 3).join(''), 10);
                if (version < 253) {
                  client.close();
                  return done();
                }

                // Add the X509 auth user to the $external db
                var ext = client.db('$external');
                ext.addUser(
                  userName,
                  {
                    roles: [
                      { role: 'readWriteAnyDatabase', db: 'admin' },
                      { role: 'userAdminAnyDatabase', db: 'admin' }
                    ]
                  },
                  function(err, result) {
                    test.equal(null, err);
                    test.equal(userName, result[0].user);
                    test.equal('', result[0].pwd);
                    client.close();

                    // Connect using X509 authentication
                    MongoClient.connect(
                      f(
                        'mongodb://%s@server:27019/test?authMechanism=%s&ssl=true&maxPoolSize=1',
                        encodeURIComponent(userName),
                        'MONGODB-X509'
                      ),
                      {
                        server: {
                          sslKey: key,
                          sslCert: cert,
                          sslValidate: false
                        }
                      },
                      function(err, client) {
                        test.equal(null, err);
                        var db = client.db(configuration.db);

                        db.collection('x509collection').insert({ a: 1 }, function(err) {
                          test.equal(null, err);

                          db.collection('x509collection').findOne(function(err, doc) {
                            test.equal(null, err);
                            test.equal(1, doc.a);

                            client.topology.once('reconnect', function() {
                              // Await reconnect and re-authentication
                              db.collection('x509collection').findOne(function(err, doc) {
                                test.equal(null, err);
                                test.equal(1, doc.a);

                                // Attempt disconnect again
                                client.topology.connections()[0].destroy();

                                // Await reconnect and re-authentication
                                db.collection('x509collection').findOne(function(err, doc) {
                                  test.equal(null, err);
                                  test.equal(1, doc.a);

                                  client.close();

                                  serverManager.stop().then(function() {
                                    done();
                                  });
                                });
                              });
                            });

                            // Force close
                            client.topology.connections()[0].destroy();
                          });
                        });
                      }
                    );
                  }
                );
              });
            }
          );
        });
      });
    }
  });
});
