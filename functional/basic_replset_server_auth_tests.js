'use strict';

var expect = require('chai').expect,
  f = require('util').format,
  locateAuthMethod = require('./shared').locateAuthMethod,
  executeCommand = require('./shared').executeCommand,
  ReplSet = require('../../../lib/topologies/replset'),
  Connection = require('../../../lib/connection/connection');

var setUp = function(configuration, options, callback) {
  var ReplSetManager = require('mongodb-topology-manager').ReplSet;

  // Check if we have any options
  if (typeof options === 'function') {
    callback = options;
    options = null;
  }

  // Override options
  var rsOptions;
  if (options) {
    rsOptions = options;
  } else {
    rsOptions = {
      server: {
        keyFile: __dirname + '/key/keyfile.key',
        auth: null,
        replSet: 'rs'
      },
      client: { replSet: 'rs' }
    };
  }

  // Set up the nodes
  var nodes = [
    {
      options: {
        bind_ip: 'localhost',
        port: 31000,
        dbpath: f('%s/../db/31000', __dirname)
      }
    },
    {
      options: {
        bind_ip: 'localhost',
        port: 31001,
        dbpath: f('%s/../db/31001', __dirname)
      }
    },
    {
      options: {
        bind_ip: 'localhost',
        port: 31002,
        dbpath: f('%s/../db/31002', __dirname)
      }
    },
    {
      options: {
        bind_ip: 'localhost',
        port: 31003,
        dbpath: f('%s/../db/31003', __dirname)
      }
    },
    {
      options: {
        bind_ip: 'localhost',
        port: 31004,
        dbpath: f('%s/../db/31004', __dirname)
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
  replicasetManager.purge().then(function() {
    // Start the server
    replicasetManager
      .start()
      .then(function() {
        setTimeout(function() {
          callback(null, replicasetManager);
        }, 10000);
      })
      .catch(function(e) {
        console.dir(e);
      });
  });
};

describe.skip('Basic replica set server auth tests', function() {
  it('should fail to authenticat emitting an error due to it being the initial connect', {
    metadata: { requires: { topology: 'auth' } },

    test: function(done) {
      var self = this;

      setUp(self.configuration, function(err, replicasetManager) {
        // Enable connections accounting
        Connection.enableConnectionAccounting();

        // Get right auth method
        locateAuthMethod(self.configuration, function(locateErr, method) {
          expect(locateErr).to.not.exist;

          executeCommand(
            self.configuration,
            'admin',
            {
              createUser: 'root',
              pwd: 'root',
              roles: [{ role: 'root', db: 'admin' }],
              digestPassword: true
            },
            {
              host: 'localhost',
              port: 31000
            },
            function(createUserErr, createUserRes) {
              expect(createUserRes).to.exist;
              expect(createUserErr).to.not.exist;

              // Attempt to connect
              var server = new ReplSet(
                [
                  {
                    host: 'localhost',
                    port: 31000
                  },
                  {
                    host: 'localhost',
                    port: 31001
                  }
                ],
                {
                  setName: 'rs'
                }
              );

              server.on('error', function() {
                // console.log('=================== ' + Object.keys(Connection.connections()).length)
                expect(Object.keys(Connection.connections()).length).to.equal(0);
                Connection.disableConnectionAccounting();

                executeCommand(
                  self.configuration,
                  'admin',
                  {
                    dropUser: 'root'
                  },
                  {
                    auth: [method, 'admin', 'root', 'root'],
                    host: 'localhost',
                    port: 31000
                  },
                  function(dropUserErr, dropUserRes) {
                    expect(dropUserErr).to.not.exist;
                    expect(dropUserRes).to.exist;
                    replicasetManager.stop().then(function() {
                      done();
                    });
                  }
                );
              });

              server.connect({ auth: [method, 'admin', 'root2', 'root'] });
            }
          );
        });
      });
    }
  });

  it('should correctly authenticate server using scram-sha-1 using connect auth', {
    metadata: { requires: { topology: 'auth' } },

    test: function(done) {
      var self = this;

      setUp(self.configuration, function(err, replicasetManager) {
        // Enable connections accounting
        Connection.enableConnectionAccounting();

        locateAuthMethod(self.configuration, function(locateErr, method) {
          expect(locateErr).to.not.exist;

          executeCommand(
            self.configuration,
            'admin',
            {
              createUser: 'root',
              pwd: 'root',
              roles: [{ role: 'root', db: 'admin' }],
              digestPassword: true
            },
            {
              host: 'localhost',
              port: 31000
            },
            function(createUserErr, createUserRes) {
              expect(createUserRes).to.exist;
              expect(createUserErr).to.not.exist;

              // Attempt to connect
              var server = new ReplSet(
                [
                  {
                    host: 'localhost',
                    port: 31000
                  },
                  {
                    host: 'localhost',
                    port: 31001
                  }
                ],
                {
                  setName: 'rs'
                }
              );

              server.on('connect', function(_server) {
                _server.insert('test.test', [{ a: 1 }], function(insertErr, insertRes) {
                  expect(err).to.not.exist;
                  expect(insertRes.result.n).to.equal(1);

                  executeCommand(
                    self.configuration,
                    'admin',
                    {
                      dropUser: 'root'
                    },
                    {
                      auth: [method, 'admin', 'root', 'root'],
                      host: 'localhost',
                      port: 31000
                    },
                    function(dropUserErr, dropUserRes) {
                      expect(dropUserRes).to.exist;
                      expect(dropUserErr).to.not.exist;

                      _server.destroy();
                      expect(Object.keys(Connection.connections()).length).to.equal(0);
                      Connection.disableConnectionAccounting();

                      replicasetManager.stop().then(function() {
                        done();
                      });
                    }
                  );
                });
              });

              server.connect({ auth: [method, 'admin', 'root', 'root'] });
            }
          );
        });
      });
    }
  });

  it('should correctly authenticate using auth method instead of connect', {
    metadata: { requires: { topology: 'auth' } },

    test: function(done) {
      var self = this;

      setUp(self.configuration, function(err, replicasetManager) {
        // Enable connections accounting
        Connection.enableConnectionAccounting();

        locateAuthMethod(self.configuration, function(locateErr, method) {
          expect(locateErr).to.not.exist;

          executeCommand(
            self.configuration,
            'admin',
            {
              createUser: 'root',
              pwd: 'root',
              roles: [{ role: 'root', db: 'admin' }],
              digestPassword: true
            },
            {
              host: 'localhost',
              port: 31000
            },
            function(createUserErr, createUserRes) {
              expect(createUserRes).to.exist;
              expect(createUserErr).to.not.exist;

              // Attempt to connect
              var server = new ReplSet(
                [
                  {
                    host: 'localhost',
                    port: 31000
                  }
                ],
                {
                  setName: 'rs'
                }
              );

              server.on('connect', function(_server) {
                //{auth: [method, 'admin', 'root', 'root']}
                // Attempt authentication
                _server.auth(method, 'admin', 'root', 'root', function(authErr, authRes) {
                  expect(authRes).to.exist;
                  expect(authErr).to.not.exist;

                  _server.insert('test.test', [{ a: 1 }], function(insertErr, insertRes) {
                    expect(insertErr).to.not.exist;
                    expect(insertRes.result.n).to.equal(1);

                    executeCommand(
                      self.configuration,
                      'admin',
                      {
                        dropUser: 'root'
                      },
                      {
                        auth: [method, 'admin', 'root', 'root'],
                        host: 'localhost',
                        port: 31000
                      },
                      function(dropUserErr, dropUserRes) {
                        expect(dropUserRes).to.exist;
                        expect(dropUserErr).to.not.exist;

                        _server.destroy();
                        // console.log('=================== ' + Object.keys(Connection.connections()).length)
                        expect(Object.keys(Connection.connections()).length).to.equal(0);
                        Connection.disableConnectionAccounting();

                        replicasetManager.stop().then(function() {
                          done();
                        });
                      }
                    );
                  });
                });
              });

              server.connect();
            }
          );
        });
      });
    }
  });

  it('should correctly authenticate using auth method instead of connect and logout user', {
    metadata: { requires: { topology: 'auth' } },

    test: function(done) {
      var self = this;

      setUp(self.configuration, function(err, replicasetManager) {
        // console.log('------------------------------ -2')
        // Enable connections accounting
        Connection.enableConnectionAccounting();

        locateAuthMethod(self.configuration, function(locateErr, method) {
          expect(locateErr).to.not.exist;

          executeCommand(
            self.configuration,
            'admin',
            {
              createUser: 'root',
              pwd: 'root',
              roles: [{ role: 'root', db: 'admin' }],
              digestPassword: true
            },
            {
              host: 'localhost',
              port: 31000
            },
            function(createUserErr, createUserRes) {
              expect(createUserRes).to.exist;
              expect(createUserErr).to.not.exist;

              // Attempt to connect
              var server = new ReplSet(
                [
                  {
                    host: 'localhost',
                    port: 31000
                  }
                ],
                {
                  setName: 'rs'
                }
              );

              server.on('connect', function(_server) {
                // Attempt authentication
                _server.auth(method, 'admin', 'root', 'root', function(authErr, authRes) {
                  expect(authErr).to.exist;
                  expect(authRes).to.not.exist;

                  _server.insert('test.test', [{ a: 1 }], function(insertErr, insertRes) {
                    expect(insertErr).to.not.exist;
                    expect(insertRes.result.n).to.equal(1);

                    _server.logout('admin', function(logoutErr, logoutRes) {
                      expect(logoutRes).to.exist;
                      expect(logoutErr).to.not.exist;

                      _server.insert('test.test', [{ a: 1 }], function(
                        secondInsertErr,
                        secondInsertRes
                      ) {
                        if (secondInsertRes) console.dir(secondInsertRes.result);

                        executeCommand(
                          self.configuration,
                          'admin',
                          {
                            dropUser: 'root'
                          },
                          {
                            auth: [method, 'admin', 'root', 'root'],
                            host: 'localhost',
                            port: 31000
                          },
                          function(dropUserErr, dropUserRes) {
                            expect(dropUserRes).to.exist;
                            expect(dropUserErr).to.not.exist;

                            _server.destroy();
                            // console.log('=================== ' + Object.keys(Connection.connections()).length)
                            expect(Object.keys(Connection.connections()).length).to.equal(0);
                            Connection.disableConnectionAccounting();

                            replicasetManager.stop().then(function() {
                              done();
                            });
                          }
                        );
                      });
                    });
                  });
                });
              });

              server.connect();
            }
          );
        });
      });
    }
  });
});
