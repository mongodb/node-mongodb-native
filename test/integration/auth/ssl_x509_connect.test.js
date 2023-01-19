'use strict';
const fs = require('fs');
const { format: f } = require('util');
const { test, setupDatabase } = require('../shared');
const { expect } = require('chai');
const { MongoClient } = require('../../mongodb');

describe('SSL (x509)', function () {
  before(function () {
    return setupDatabase(this.configuration);
  });

  it('Should correctly authenticate using x509', {
    metadata: { requires: { topology: 'ssl' } },

    test: function (done) {
      var configuration = this.configuration;
      var ServerManager = require('mongodb-topology-manager').Server;

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
      serverManager.purge().then(function () {
        // Start the server
        serverManager.start().then(function () {
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
            function (err, client) {
              expect(err).to.not.exist;
              var db = client.db(configuration.db);

              // Execute build info
              db.command({ buildInfo: 1 }, function (err, result) {
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
                  function (err, result) {
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
                      function (err, client) {
                        expect(err).to.not.exist;

                        client.close();

                        serverManager.stop().then(function () {
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

  it('Should correctly handle bad x509 certificate', {
    metadata: { requires: { topology: 'ssl' } },

    test: function (done) {
      var configuration = this.configuration;
      var ServerManager = require('mongodb-topology-manager').Server;

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
      serverManager.purge().then(function () {
        // Start the server
        serverManager.start().then(function () {
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
            function (err, client) {
              expect(err).to.not.exist;
              var db = client.db(configuration.db);

              // Execute build info
              db.command({ buildInfo: 1 }, function (err, result) {
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
                  function (err, result) {
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
                          sslKey: serverPem,
                          sslCert: serverPem,
                          sslValidate: false
                        }
                      },
                      function (err) {
                        test.equal(0, err.ok);
                        test.equal('auth failed', err.errmsg);

                        serverManager.stop().then(function () {
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

  it('Should give reasonable error on x509 authentication failure', {
    metadata: { requires: { topology: 'ssl' } },

    test: function (done) {
      var configuration = this.configuration;
      var ServerManager = require('mongodb-topology-manager').Server;

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
      serverManager.purge().then(function () {
        // Start the server
        serverManager.start().then(function () {
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
            function (err, client) {
              expect(err).to.not.exist;
              var db = client.db(configuration.db);

              // Execute build info
              db.command({ buildInfo: 1 }, function (err, result) {
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
                  function (err, result) {
                    expect(err).to.not.exist;
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
                      function (err) {
                        test.equal(0, err.ok);
                        test.equal('auth failed', err.errmsg);

                        serverManager.stop().then(function () {
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

  it('Should give helpful error when attempting to use x509 without SSL', {
    metadata: { requires: { topology: 'ssl' } },

    test: function (done) {
      var configuration = this.configuration;
      var ServerManager = require('mongodb-topology-manager').Server;

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
      serverManager.purge().then(function () {
        // Start the server
        serverManager.start().then(function () {
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
            function (err, client) {
              expect(err).to.not.exist;
              var db = client.db(configuration.db);

              // Execute build info
              db.command({ buildInfo: 1 }, function (err, result) {
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
                  function (err, result) {
                    expect(err).to.not.exist;
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
                      function (err) {
                        test.ok(!!err);
                        test.equal(0, err.ok);
                        test.equal(
                          'SSL support is required for the MONGODB-X509 mechanism.',
                          err.errmsg
                        );

                        serverManager.stop().then(function () {
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

  it('Should correctly reauthenticate against x509', {
    metadata: { requires: { topology: 'ssl' } },

    test: function (done) {
      var configuration = this.configuration;
      var ServerManager = require('mongodb-topology-manager').Server;

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
      serverManager.purge().then(function () {
        // Start the server
        serverManager.start().then(function () {
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
            function (err, client) {
              expect(err).to.not.exist;
              var db = client.db(configuration.db);

              // Execute build info
              db.command({ buildInfo: 1 }, function (err, result) {
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
                  function (err, result) {
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
                      function (err, client) {
                        expect(err).to.not.exist;
                        var db = client.db(configuration.db);

                        db.collection('x509collection').insert({ a: 1 }, function (err) {
                          expect(err).to.not.exist;

                          db.collection('x509collection').findOne(function (err, doc) {
                            expect(err).to.not.exist;
                            test.equal(1, doc.a);

                            client.topology.once('reconnect', function () {
                              // Await reconnect and re-authentication
                              db.collection('x509collection').findOne(function (err, doc) {
                                expect(err).to.not.exist;
                                test.equal(1, doc.a);

                                // Attempt disconnect again
                                client.topology.connections()[0].destroy();

                                // Await reconnect and re-authentication
                                db.collection('x509collection').findOne(function (err, doc) {
                                  expect(err).to.not.exist;
                                  test.equal(1, doc.a);

                                  client.close();

                                  serverManager.stop().then(function () {
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
