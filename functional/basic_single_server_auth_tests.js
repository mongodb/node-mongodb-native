'use strict';

var expect = require('chai').expect,
  locateAuthMethod = require('./shared').locateAuthMethod,
  executeCommand = require('./shared').executeCommand,
  Server = require('../../../lib/topologies/server'),
  Connection = require('../../../lib/connection/connection'),
  Bson = require('bson');

describe('Basic single server auth tests', function() {
  // Skipped due to use of topology manager
  it.skip('should fail to authenticate server using scram-sha-1 using connect auth', {
    metadata: { requires: { topology: 'auth' } },

    test: function(done) {
      var self = this;

      // Enable connections accounting
      Connection.enableConnectionAccounting();

      // Restart instance
      self.configuration.manager.restart(true).then(function() {
        locateAuthMethod(self.configuration, function(err, method) {
          expect(err).to.be.null;

          executeCommand(
            self.configuration,
            'admin',
            {
              createUser: 'root',
              pwd: 'root',
              roles: [{ role: 'root', db: 'admin' }],
              digestPassword: true
            },
            function(cmdErr, r) {
              expect(r).to.exist;
              expect(cmdErr).to.be.null;

              var server = new Server({
                host: self.configuration.host,
                port: self.configuration.port,
                bson: new Bson()
              });

              server.on('error', function() {
                // console.log('=================== ' + Object.keys(Connection.connections()).length)
                expect(Object.keys(Connection.connections()).length).to.equal(0);
                Connection.disableConnectionAccounting();
                done();
              });

              server.connect({ auth: [method, 'admin', 'root2', 'root'] });
            }
          );
        });
      });
    }
  });

  // Skipped due to use of topology manager
  it.skip('should correctly authenticate server using scram-sha-1 using connect auth', {
    metadata: { requires: { topology: 'auth' } },

    test: function(done) {
      var self = this;

      // Enable connections accounting
      Connection.enableConnectionAccounting();

      // Restart instance
      self.configuration.manager.restart(true).then(function() {
        locateAuthMethod(self.configuration, function(err, method) {
          expect(err).to.be.null;

          executeCommand(
            self.configuration,
            'admin',
            {
              createUser: 'root',
              pwd: 'root',
              roles: [{ role: 'root', db: 'admin' }],
              digestPassword: true
            },
            function(cmdErr, r) {
              expect(r).to.exist;
              expect(cmdErr).to.be.null;

              var server = new Server({
                host: self.configuration.host,
                port: self.configuration.port,
                bson: new Bson()
              });

              server.on('connect', function(_server) {
                executeCommand(
                  self.configuration,
                  'admin',
                  {
                    dropUser: 'root'
                  },
                  { auth: [method, 'admin', 'root', 'root'] },
                  function(dropUserErr, dropUserRes) {
                    expect(dropUserRes).to.exist;
                    expect(dropUserErr).to.be.null;

                    _server.destroy({ force: true });
                    // console.log('=================== ' + Object.keys(Connection.connections()).length)
                    expect(Object.keys(Connection.connections()).length).to.equal(0);
                    Connection.disableConnectionAccounting();
                    done();
                  }
                );
              });

              server.connect({ auth: [method, 'admin', 'root', 'root'] });
            }
          );
        });
      });
    }
  });

  // Skipped due to use of topology manager
  it.skip(
    'should correctly authenticate server using scram-sha-1 using connect auth and maintain auth on new connections',
    {
      metadata: { requires: { topology: 'auth' } },

      test: function(done) {
        var self = this;

        // Enable connections accounting
        Connection.enableConnectionAccounting();

        // Restart instance
        self.configuration.manager.restart(true).then(function() {
          locateAuthMethod(self.configuration, function(err, method) {
            expect(err).to.be.null;

            executeCommand(
              self.configuration,
              'admin',
              {
                createUser: 'root',
                pwd: 'root',
                roles: [{ role: 'root', db: 'admin' }],
                digestPassword: true
              },
              function(cmdErr, r) {
                expect(r).to.exist;
                expect(cmdErr).to.be.null;

                executeCommand(
                  self.configuration,
                  'test',
                  {
                    createUser: 'admin',
                    pwd: 'admin',
                    roles: ['readWrite', 'dbAdmin'],
                    digestPassword: true
                  },
                  { auth: [method, 'admin', 'root', 'root'] },
                  function(createUserErr, createUserRes) {
                    expect(createUserRes).to.exist;
                    expect(createUserErr).to.be.null;

                    // Attempt to connect
                    var server = new Server({
                      host: self.configuration.host,
                      port: self.configuration.port,
                      bson: new Bson()
                    });

                    var index = 0;

                    var messageHandler = function(messageHandlerErr, result) {
                      index = index + 1;

                      // Tests
                      expect(messageHandlerErr).to.be.null;
                      expect(result.result.n).to.equal(1);
                      // Did we receive an answer for all the messages
                      if (index === 100) {
                        expect(server.s.pool.socketCount()).to.equal(5);

                        server.destroy({ force: true });
                        expect(Object.keys(Connection.connections()).length).to.equal(0);
                        Connection.disableConnectionAccounting();
                        done();
                      }
                    };

                    // Add event listeners
                    server.on('connect', function() {
                      for (var i = 0; i < 10; i++) {
                        process.nextTick(function() {
                          server.insert('test.test', [{ a: 1 }], messageHandler);
                          server.insert('test.test', [{ a: 1 }], messageHandler);
                          server.insert('test.test', [{ a: 1 }], messageHandler);
                          server.insert('test.test', [{ a: 1 }], messageHandler);
                          server.insert('test.test', [{ a: 1 }], messageHandler);
                          server.insert('test.test', [{ a: 1 }], messageHandler);
                          server.insert('test.test', [{ a: 1 }], messageHandler);
                          server.insert('test.test', [{ a: 1 }], messageHandler);
                          server.insert('test.test', [{ a: 1 }], messageHandler);
                          server.insert('test.test', [{ a: 1 }], messageHandler);
                        });
                      }
                    });

                    // Start connection
                    server.connect({ auth: [method, 'test', 'admin', 'admin'] });
                  }
                );
              }
            );
          });
        });
      }
    }
  );

  // Skipped due to use of topology manager
  it.skip('should correctly authenticate server using scram-sha-1 using auth method', {
    metadata: { requires: { topology: 'auth' } },

    test: function(done) {
      var self = this;

      // Enable connections accounting
      Connection.enableConnectionAccounting();

      // Restart instance
      self.configuration.manager.restart(true).then(function() {
        locateAuthMethod(self.configuration, function(err, method) {
          expect(err).to.be.null;

          executeCommand(
            self.configuration,
            'admin',
            {
              createUser: 'root',
              pwd: 'root',
              roles: [{ role: 'root', db: 'admin' }],
              digestPassword: true
            },
            function(cmdErr, r) {
              expect(r).to.exist;
              expect(cmdErr).to.be.null;

              executeCommand(
                self.configuration,
                'test',
                {
                  createUser: 'admin',
                  pwd: 'admin',
                  roles: ['readWrite', 'dbAdmin'],
                  digestPassword: true
                },
                { auth: [method, 'admin', 'root', 'root'] },
                function(createUserErr, createUserRes) {
                  expect(createUserRes).to.exist;
                  expect(createUserErr).to.be.null;

                  // Attempt to connect
                  var server = new Server({
                    host: self.configuration.host,
                    port: self.configuration.port,
                    bson: new Bson()
                  });

                  var index = 0;
                  var error = false;

                  var messageHandler = function(messageHandlerErr, result) {
                    index = index + 1;

                    // Tests
                    expect(messageHandlerErr).to.be.null;
                    expect(result.result.n).to.equal(1);
                    // Did we receive an answer for all the messages
                    if (index === 100) {
                      expect(server.s.pool.socketCount()).to.equal(5);
                      expect(error).to.be.false;

                      server.destroy({ force: true });
                      // console.log('=================== ' + Object.keys(Connection.connections()).length)
                      expect(Object.keys(Connection.connections()).length).to.equal(0);
                      Connection.disableConnectionAccounting();
                      done();
                    }
                  };

                  // Add event listeners
                  server.on('connect', function(_server) {
                    _server.auth(method, 'test', 'admin', 'admin', function(authErr, authRes) {
                      expect(authRes).to.exist;
                      expect(authErr).to.not.exist;

                      for (var i = 0; i < 100; i++) {
                        process.nextTick(function() {
                          server.insert('test.test', [{ a: 1 }], messageHandler);
                        });
                      }
                    });

                    var executeIsMaster = function() {
                      _server.command('admin.$cmd', { ismaster: true }, function(
                        adminErr,
                        adminRes
                      ) {
                        expect(adminRes).to.exist;
                        expect(adminErr).to.not.exist;
                        if (adminErr) error = adminErr;
                      });
                    };

                    for (var i = 0; i < 100; i++) {
                      process.nextTick(executeIsMaster);
                    }
                  });

                  // Start connection
                  server.connect();
                }
              );
            }
          );
        });
      });
    }
  });

  // Skipped due to use of topology manager
  it.skip('should correctly authenticate server using scram-sha-1 using connect auth then logout', {
    metadata: { requires: { topology: 'auth' } },

    test: function(done) {
      var self = this;

      // Enable connections accounting
      Connection.enableConnectionAccounting();

      // Restart instance
      self.configuration.manager.restart(true).then(function() {
        locateAuthMethod(self.configuration, function(err, method) {
          expect(err).to.be.null;

          executeCommand(
            self.configuration,
            'admin',
            {
              createUser: 'root',
              pwd: 'root',
              roles: [{ role: 'root', db: 'admin' }],
              digestPassword: true
            },
            function(cmdErr, r) {
              expect(r).to.exist;
              expect(cmdErr).to.be.null;

              executeCommand(
                self.configuration,
                'test',
                {
                  createUser: 'admin',
                  pwd: 'admin',
                  roles: ['readWrite', 'dbAdmin'],
                  digestPassword: true
                },
                { auth: [method, 'admin', 'root', 'root'] },
                function(createUserErr, createUserRes) {
                  expect(createUserRes).to.exist;
                  expect(createUserErr).to.be.null;

                  // Attempt to connect
                  var server = new Server({
                    host: self.configuration.host,
                    port: self.configuration.port,
                    bson: new Bson()
                  });

                  // Add event listeners
                  server.on('connect', function(_server) {
                    _server.insert('test.test', [{ a: 1 }], function(insertErr, insertRes) {
                      expect(insertRes).to.exist;
                      expect(insertErr).to.be.null;

                      // Logout pool
                      _server.logout('test', function(logoutErr) {
                        expect(logoutErr).to.be.null;

                        _server.insert('test.test', [{ a: 1 }], function(
                          secondInsertErr,
                          secondInsertRes
                        ) {
                          expect(secondInsertRes).to.exist;
                          expect(secondInsertErr).to.not.be.null;

                          _server.destroy({ force: true });
                          // console.log('=================== ' + Object.keys(Connection.connections()).length)
                          expect(Object.keys(Connection.connections()).length).to.equal(0);
                          // console.log('============================ 5')
                          Connection.disableConnectionAccounting();
                          done();
                        });
                      });
                    });
                  });

                  // Start connection
                  server.connect({ auth: [method, 'test', 'admin', 'admin'] });
                }
              );
            }
          );
        });
      });
    }
  });

  // Skipped due to use of topology manager
  it.skip('should correctly have server auth wait for logout to finish', {
    metadata: { requires: { topology: 'auth' } },

    test: function(done) {
      var self = this;

      // Enable connections accounting
      Connection.enableConnectionAccounting();

      // Restart instance
      self.configuration.manager.restart(true).then(function() {
        locateAuthMethod(self.configuration, function(err, method) {
          expect(err).to.be.null;

          executeCommand(
            self.configuration,
            'admin',
            {
              createUser: 'root',
              pwd: 'root',
              roles: [{ role: 'root', db: 'admin' }],
              digestPassword: true
            },
            function(ercmdErrr, r) {
              expect(r).to.exist;
              expect(err).to.be.null;

              executeCommand(
                self.configuration,
                'test',
                {
                  createUser: 'admin',
                  pwd: 'admin',
                  roles: ['readWrite', 'dbAdmin'],
                  digestPassword: true
                },
                { auth: [method, 'admin', 'root', 'root'] },
                function(createUserErr, createUserRes) {
                  expect(createUserRes).to.exist;
                  expect(createUserErr).to.be.null;
                  // Attempt to connect
                  var server = new Server({
                    host: self.configuration.host,
                    port: self.configuration.port,
                    bson: new Bson()
                  });

                  // Add event listeners
                  server.on('connect', function(_server) {
                    _server.insert('test.test', [{ a: 1 }], function(insertErr, insertRes) {
                      expect(insertRes).to.exist;
                      expect(insertErr).to.be.null;

                      // Logout pool
                      _server.logout('test', function(logoutErr) {
                        expect(logoutErr).to.be.null;
                      });

                      _server.auth(method, 'test', 'admin', 'admin', function(authErr, authRes) {
                        expect(authRes).to.exist;
                        expect(authErr).to.be.null;

                        _server.insert('test.test', [{ a: 1 }], function(
                          secondInsertErr,
                          secondInsertRes
                        ) {
                          expect(secondInsertRes).to.exist;
                          expect(secondInsertErr).to.be.null;

                          _server.destroy({ force: true });
                          expect(Object.keys(Connection.connections()).length).to.equal(0);
                          Connection.disableConnectionAccounting();
                          done();
                        });
                      });
                    });
                  });

                  // Start connection
                  server.connect({ auth: [method, 'test', 'admin', 'admin'] });
                }
              );
            }
          );
        });
      });
    }
  });
});
