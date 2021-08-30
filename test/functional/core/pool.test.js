'use strict';

var expect = require('chai').expect,
  locateAuthMethod = require('./shared').locateAuthMethod,
  executeCommand = require('./shared').executeCommand,
  Pool = require('../../../lib/core/connection/pool'),
  Connection = require('../../../lib/core/connection/connection'),
  Query = require('../../../lib/core/connection/commands').Query,
  Bson = require('bson'),
  mock = require('mongodb-mock-server'),
  ConnectionSpy = require('./shared').ConnectionSpy;

const MongoCredentials = require('../../../lib/core/auth/mongo_credentials').MongoCredentials;

const test = {};
describe('Pool tests', function() {
  beforeEach(() => {
    test.spy = new ConnectionSpy();
    Connection.enableConnectionAccounting(test.spy);
  });

  afterEach(() => {
    return mock.cleanup(test.spy).then(() => {
      test.spy = undefined;
      Connection.disableConnectionAccounting();
    });
  });

  it('should correctly connect pool to single server', {
    metadata: { requires: { topology: 'single', apiVersion: false } },

    test: function(done) {
      // Attempt to connect
      var pool = new Pool(null, {
        host: this.configuration.host,
        port: this.configuration.port,
        bson: new Bson(),
        messageHandler: function() {}
      });

      // Add event listeners
      pool.on('connect', function() {
        pool.destroy();
        done();
      });

      // Start connection
      pool.connect();
    }
  });

  it('Should only listen on connect once', {
    metadata: { requires: { topology: 'single', apiVersion: false } },
    test: function(done) {
      const pool = new Pool(null, {
        host: this.configuration.host,
        port: this.configuration.port,
        bson: new Bson(),
        messageHandler: function() {}
      });

      pool.on('connect', function() {
        process.nextTick(() => {
          const connections = pool.allConnections();
          expect(connections).to.have.lengthOf(1);
          expect(connections[0].socket.listenerCount('connect')).to.equal(0);

          pool.destroy();
          done();
        });
      });

      pool.connect();
    }
  });

  it('should correctly write ismaster operation to the server', {
    metadata: { requires: { topology: 'single', apiVersion: false } },

    test: function(done) {
      // Attempt to connect
      var pool = new Pool(null, {
        host: this.configuration.host,
        port: this.configuration.port,
        bson: new Bson()
      });

      // Add event listeners
      pool.on('connect', function() {
        var query = new Query(
          new Bson(),
          'system.$cmd',
          { ismaster: true },
          { numberToSkip: 0, numberToReturn: 1 }
        );

        pool.write(query, function(err, result) {
          expect(err).to.be.null;
          expect(result.result.ismaster).to.be.true;
          pool.destroy();
          done();
        });
      });

      // Start connection
      pool.connect();
    }
  });

  it('should correctly grow server pool on concurrent operations', {
    metadata: { requires: { topology: 'single', apiVersion: false } },

    test: function(done) {
      // Index
      var index = 0;

      // Attempt to connect
      var pool = new Pool(null, {
        host: this.configuration.host,
        port: this.configuration.port,
        bson: new Bson()
      });

      var messageHandler = function(err, result) {
        index = index + 1;

        expect(err).to.be.null;
        expect(result.result.ismaster).to.be.true;

        // Did we receive an answer for all the messages
        if (index === 100) {
          expect(pool.allConnections().length).to.equal(5);
          pool.destroy();
          done();
        }
      };

      // Add event listeners
      pool.on('connect', function() {
        for (var i = 0; i < 10; ++i) {
          for (var j = 0; j < 10; ++j) {
            const query = new Query(
              new Bson(),
              'system.$cmd',
              { ismaster: true },
              { numberToSkip: 0, numberToReturn: 1 }
            );

            pool.write(query, messageHandler);
          }
        }
      });

      // Start connection
      pool.connect();
    }
  });

  // Skipped due to use of topology manager
  it('should correctly write ismaster operation to the server and handle timeout', {
    metadata: { requires: { topology: 'single', apiVersion: false } },

    test: function(done) {
      this.timeout(0);

      // Attempt to connect
      var pool = new Pool(null, {
        host: this.configuration.host,
        port: this.configuration.port,
        socketTimeout: 500,
        bson: new Bson(),
        reconnect: false
      });

      // Add event listeners
      pool.on('connect', function() {
        var query = new Query(
          new Bson(),
          'system.$cmd',
          { ismaster: true },
          { numberToSkip: 0, numberToReturn: 1 }
        );

        pool.write(query, function() {});
      });

      pool.on('timeout', function() {
        pool.destroy();
        done();
      });

      // Start connection
      pool.connect();
    }
  });

  it('should correctly error out operations if pool is closed in the middle of a set', {
    metadata: { requires: { topology: 'single', apiVersion: false } },

    test: function(done) {
      // Attempt to connect
      var pool = new Pool(null, {
        host: this.configuration.host,
        port: this.configuration.port,
        socketTimeout: 3000,
        bson: new Bson()
      });

      var index = 0;
      var errorCount = 0;

      var messageHandler = function(err) {
        if (err) errorCount = errorCount + 1;
        index = index + 1;
        if (index === 500) {
          expect(errorCount).to.be.at.least(250);
          pool.destroy();
          done();
        }
      };

      function execute(i) {
        setTimeout(function() {
          var query = new Query(
            new Bson(),
            'system.$cmd',
            { ismaster: true },
            { numberToSkip: 0, numberToReturn: 1 }
          );
          pool.write(query, messageHandler);
          if (i === 249) {
            pool.destroy();
          }
        }, i);
      }

      // Add event listeners
      pool.on('connect', function() {
        for (var i = 0; i < 500; i++) {
          execute(i);
        }
      });

      // Start connection
      pool.connect();
    }
  });

  it.skip('should correctly recover from a server outage', {
    metadata: { requires: { topology: 'single', apiVersion: false } },

    test: function(done) {
      var self = this;

      // Attempt to connect
      var pool = new Pool(null, {
        host: this.configuration.host,
        port: this.configuration.port,
        socketTimeout: 3000,
        connectionTimeout: 1000,
        reconnectTries: 120,
        bson: new Bson()
      });

      var index = 0;
      var errorCount = 0;
      var executed = false;
      var restarted = false;

      function waitForRestart(callback) {
        setTimeout(function() {
          if (!restarted) return waitForRestart(callback);
          callback();
        }, 10);
      }

      var messageHandler = function(err) {
        if (err) errorCount = errorCount + 1;
        index = index + 1;

        if (index === 500 && !executed) {
          waitForRestart(function() {
            executed = true;
            expect(errorCount).to.be.at.least(0);
            pool.destroy();
            done();
          });
        }
      };

      function execute(i) {
        setTimeout(function() {
          var query = new Query(
            new Bson(),
            'system.$cmd',
            { ismaster: true },
            { numberToSkip: 0, numberToReturn: 1 }
          );
          pool.write(query, messageHandler);

          if (i === 250) {
            self.configuration.manager.restart(true).then(function() {
              // console.log('!!!!!!!!!!! execute 1')
              restarted = true;
            });
          }
        }, i);
      }

      // Add event listeners
      pool.on('connect', function() {
        for (var i = 0; i < 500; i++) {
          execute(i);
        }
      });

      // Start connection
      pool.connect();
    }
  });

  // Skipped due to use of topology manager
  it.skip('should correctly recover from a longer server outage', {
    metadata: {
      requires: { topology: 'single', apiVersion: false },
      ignore: { travis: true }
    },

    test: function(done) {
      var self = this;

      // Attempt to connect
      var pool = new Pool(null, {
        host: this.configuration.host,
        port: this.configuration.port,
        socketTimeout: 3000,
        bson: new Bson(),
        reconnectTries: 120
      });

      var index = 0;
      var errorCount = 0;
      var reconnect = false;
      var stopped = false;
      var started = false;

      var messageHandler = function(err) {
        if (err) errorCount = errorCount + 1;
        index = index + 1;

        if (index === 500) {
          expect(errorCount).to.be.at.least(0);
          pool.destroy();
          expect(stopped).to.be.true;
          expect(started).to.be.true;
          expect(reconnect).to.be.true;
          done();
        }
      };

      pool.on('reconnect', function() {
        reconnect = true;
      });

      function execute(i) {
        setTimeout(function() {
          var query = new Query(
            new Bson(),
            'system.$cmd',
            { ismaster: true },
            { numberToSkip: 0, numberToReturn: 1 }
          );
          pool.write(query, messageHandler);

          if (i === 250) {
            self.configuration.manager.stop().then(function() {
              stopped = true;

              setTimeout(function() {
                self.configuration.manager.start().then(function() {
                  started = true;
                });
              }, 5000);
            });
          }
        }, i);
      }

      // Add event listeners
      pool.on('connect', function() {
        for (var i = 0; i < 500; i++) {
          execute(i);
        }
      });

      // Start connection
      pool.connect();
    }
  });

  it('should correctly reclaim immediateRelease socket', {
    metadata: { requires: { topology: 'single', apiVersion: false } },

    test: function(done) {
      var pool = new Pool(null, {
        host: this.configuration.host,
        port: this.configuration.port,
        socketTimeout: 1000,
        bson: new Bson(),
        reconnect: false
      });

      var index = 0;

      // Add event listeners
      pool.on('connect', function() {
        var query = new Query(
          new Bson(),
          'system.$cmd',
          { ismaster: true },
          { numberToSkip: 0, numberToReturn: 1 }
        );

        pool.write(query, { immediateRelease: true }, function(err) {
          expect(err).to.not.exist;
          index = index + 1;
        });
      });

      pool.on('timeout', function() {
        expect(index).to.equal(0);
        pool.destroy();
        done();
      });

      // Start connection
      pool.connect();
    }
  });

  // Skipped due to use of topology manager
  it('should correctly authenticate using scram-sha-1 using connect auth', {
    metadata: { requires: { topology: 'auth' } },

    test: function(done) {
      var self = this;

      // Restart instance
      self.configuration.manager.restart(true).then(function() {
        locateAuthMethod(self.configuration, function(err, method) {
          expect(err).to.be.null;

          const credentials = new MongoCredentials({
            mechanism: method,
            source: 'admin',
            username: 'root',
            password: 'root'
          });

          executeCommand(
            self.configuration,
            'admin',
            {
              createUser: 'root',
              pwd: 'root',
              roles: [{ role: 'root', db: 'admin' }],
              digestPassword: true
            },
            function(createUserErr, createUserRes) {
              expect(createUserRes).to.exist;
              expect(createUserErr).to.be.null;
              // Attempt to connect
              var pool = new Pool(null, {
                host: self.configuration.host,
                port: self.configuration.port,
                bson: new Bson()
              });

              // Add event listeners
              pool.on('connect', function() {
                executeCommand(
                  self.configuration,
                  'admin',
                  {
                    dropUser: 'root'
                  },
                  { credentials },
                  function(dropUserErr, dropUserRes) {
                    expect(dropUserRes).to.exist;
                    expect(dropUserErr).to.be.null;

                    pool.destroy(true);
                    done();
                  }
                );
              });

              // Start connection
              pool.connect(credentials);
            }
          );
        });
      });
    }
  });

  // Skipped due to use of topology manager
  it.skip(
    'should correctly authenticate using scram-sha-1 using connect auth and maintain auth on new connections',
    {
      metadata: { requires: { topology: 'auth' } },

      test: function(done) {
        var self = this;

        // Restart instance
        self.configuration.manager.restart(true).then(function() {
          locateAuthMethod(self.configuration, function(err, method) {
            expect(err).to.be.null;

            const credentials = new MongoCredentials({
              mechansim: method,
              source: 'admin',
              username: 'root',
              passsword: 'root'
            });

            executeCommand(
              self.configuration,
              'admin',
              {
                createUser: 'root',
                pwd: 'root',
                roles: [{ role: 'root', db: 'admin' }],
                digestPassword: true
              },
              function(createRootUserErr, createRootUserRes) {
                expect(createRootUserRes).to.exist;
                expect(createRootUserErr).to.be.null;

                executeCommand(
                  self.configuration,
                  'test',
                  {
                    createUser: 'admin',
                    pwd: 'admin',
                    roles: ['readWrite', 'dbAdmin'],
                    digestPassword: true
                  },
                  { credentials },
                  function(createAdminUserErr, createAdminUserRes) {
                    expect(createAdminUserRes).to.exist;
                    expect(createAdminUserErr).to.be.null;

                    // Attempt to connect
                    var pool = new Pool(null, {
                      host: self.configuration.host,
                      port: self.configuration.port,
                      bson: new Bson()
                    });

                    var index = 0;

                    var messageHandler = function(handlerErr, handlerResult) {
                      index = index + 1;

                      // Tests
                      expect(handlerErr).to.be.null;
                      expect(handlerResult.result.n).to.equal(1);
                      // Did we receive an answer for all the messages
                      if (index === 100) {
                        expect(pool.socketCount()).to.equal(5);
                        pool.destroy(true);
                        done();
                      }
                    };

                    // Add event listeners
                    pool.on('connect', function() {
                      for (var i = 0; i < 10; i++) {
                        process.nextTick(function() {
                          var query = new Query(
                            new Bson(),
                            'test.$cmd',
                            { insert: 'test', documents: [{ a: 1 }] },
                            { numberToSkip: 0, numberToReturn: 1 }
                          );

                          pool.write(
                            query,
                            { command: true, requestId: query.requestId },
                            messageHandler
                          );

                          query = new Query(
                            new Bson(),
                            'test.$cmd',
                            { insert: 'test', documents: [{ a: 1 }] },
                            { numberToSkip: 0, numberToReturn: 1 }
                          );

                          pool.write(
                            query,
                            { command: true, requestId: query.requestId },
                            messageHandler
                          );

                          query = new Query(
                            new Bson(),
                            'test.$cmd',
                            { insert: 'test', documents: [{ a: 1 }] },
                            { numberToSkip: 0, numberToReturn: 1 }
                          );

                          pool.write(
                            query,
                            { command: true, requestId: query.requestId },
                            messageHandler
                          );

                          query = new Query(
                            new Bson(),
                            'test.$cmd',
                            { insert: 'test', documents: [{ a: 1 }] },
                            { numberToSkip: 0, numberToReturn: 1 }
                          );

                          pool.write(
                            query,
                            { command: true, requestId: query.requestId },
                            messageHandler
                          );

                          query = new Query(
                            new Bson(),
                            'test.$cmd',
                            { insert: 'test', documents: [{ a: 1 }] },
                            { numberToSkip: 0, numberToReturn: 1 }
                          );

                          pool.write(
                            query,
                            { command: true, requestId: query.requestId },
                            messageHandler
                          );

                          query = new Query(
                            new Bson(),
                            'test.$cmd',
                            { insert: 'test', documents: [{ a: 1 }] },
                            { numberToSkip: 0, numberToReturn: 1 }
                          );

                          pool.write(
                            query,
                            { command: true, requestId: query.requestId },
                            messageHandler
                          );

                          query = new Query(
                            new Bson(),
                            'test.$cmd',
                            { insert: 'test', documents: [{ a: 1 }] },
                            { numberToSkip: 0, numberToReturn: 1 }
                          );

                          pool.write(
                            query,
                            { command: true, requestId: query.requestId },
                            messageHandler
                          );

                          query = new Query(
                            new Bson(),
                            'test.$cmd',
                            { insert: 'test', documents: [{ a: 1 }] },
                            { numberToSkip: 0, numberToReturn: 1 }
                          );

                          pool.write(
                            query,
                            { command: true, requestId: query.requestId },
                            messageHandler
                          );

                          query = new Query(
                            new Bson(),
                            'test.$cmd',
                            { insert: 'test', documents: [{ a: 1 }] },
                            { numberToSkip: 0, numberToReturn: 1 }
                          );

                          pool.write(
                            query,
                            { command: true, requestId: query.requestId },
                            messageHandler
                          );

                          query = new Query(
                            new Bson(),
                            'test.$cmd',
                            { insert: 'test', documents: [{ a: 1 }] },
                            { numberToSkip: 0, numberToReturn: 1 }
                          );

                          pool.write(
                            query,
                            { command: true, requestId: query.requestId },
                            messageHandler
                          );
                        });
                      }
                    });

                    // Start connection
                    pool.connect(credentials);
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
  it.skip('should correctly authenticate using scram-sha-1 using auth method', {
    metadata: { requires: { topology: 'auth' } },

    test: function(done) {
      var self = this;

      // Enable connections accounting
      Connection.enableConnectionAccounting();

      // Restart instance
      self.configuration.manager.restart(true).then(function() {
        locateAuthMethod(self.configuration, function(err, method) {
          expect(err).to.be.null;

          const credentials = new MongoCredentials({
            mechansim: method,
            source: 'admin',
            username: 'root',
            passsword: 'root'
          });

          executeCommand(
            self.configuration,
            'admin',
            {
              createUser: 'root',
              pwd: 'root',
              roles: [{ role: 'root', db: 'admin' }],
              digestPassword: true
            },
            function(createRootUserErr, createRootUserRes) {
              expect(createRootUserRes).to.exist;
              expect(createRootUserErr).to.be.null;

              executeCommand(
                self.configuration,
                'test',
                {
                  createUser: 'admin',
                  pwd: 'admin',
                  roles: ['readWrite', 'dbAdmin'],
                  digestPassword: true
                },
                { credentials },
                function(createAdminUserErr, createAdminUserRes) {
                  expect(createAdminUserRes).to.exist;
                  expect(createAdminUserErr).to.be.null;

                  // Attempt to connect
                  var pool = new Pool(null, {
                    host: self.configuration.host,
                    port: self.configuration.port,
                    bson: new Bson()
                  });

                  var index = 0;
                  var error = false;

                  var messageHandler = function(handlerErr, handlerResult) {
                    index = index + 1;

                    // Tests
                    expect(handlerErr).to.be.null;
                    expect(handlerResult.result.n).to.equal(1);
                    // Did we receive an answer for all the messages
                    if (index === 100) {
                      expect(pool.socketCount()).to.equal(5);
                      expect(error).to.be.false;

                      pool.destroy(true);
                      done();
                    }
                  };

                  // Add event listeners
                  pool.on('connect', function() {
                    pool.auth(credentials, function(authErr, authRes) {
                      expect(authRes).to.exist;
                      expect(authErr).to.not.exist;

                      var testCmd = function() {
                        var query = new Query(
                          new Bson(),
                          'test.$cmd',
                          { insert: 'test', documents: [{ a: 1 }] },
                          { numberToSkip: 0, numberToReturn: 1 }
                        );

                        pool.write(
                          query,
                          { command: true, requestId: query.requestId },
                          messageHandler
                        );
                      };

                      for (var i = 0; i < 100; i++) {
                        process.nextTick(testCmd);
                      }
                    });

                    var systemCmd = function() {
                      var query = new Query(
                        new Bson(),
                        'system.$cmd',
                        { ismaster: true },
                        { numberToSkip: 0, numberToReturn: 1 }
                      );

                      pool.write(query, { command: true, requestId: query.requestId }, function(e) {
                        if (e) error = e;
                      });
                    };

                    for (var i = 0; i < 100; i++) {
                      process.nextTick(systemCmd);
                    }
                  });

                  // Start connection
                  pool.connect();
                }
              );
            }
          );
        });
      });
    }
  });

  // Skipped due to use of topology manager
  it.skip('should correctly authenticate using scram-sha-1 using connect auth then logout', {
    metadata: { requires: { topology: 'auth' } },

    test: function(done) {
      var self = this;

      // Restart instance
      self.configuration.manager.restart(true).then(function() {
        locateAuthMethod(self.configuration, function(err, method) {
          expect(err).to.be.null;

          const credentials = new MongoCredentials({
            mechansim: method,
            source: 'admin',
            username: 'root',
            passsword: 'root'
          });

          executeCommand(
            self.configuration,
            'admin',
            {
              createUser: 'root',
              pwd: 'root',
              roles: [{ role: 'root', db: 'admin' }],
              digestPassword: true
            },
            function(createRootUserErr, createRootUserRes) {
              expect(createRootUserRes).to.exist;
              expect(createRootUserErr).to.be.null;

              executeCommand(
                self.configuration,
                'test',
                {
                  createUser: 'admin',
                  pwd: 'admin',
                  roles: ['readWrite', 'dbAdmin'],
                  digestPassword: true
                },
                { credentials },
                function(createAdminUserErr, createAdminUserRes) {
                  expect(createAdminUserRes).to.exist;
                  expect(createAdminUserErr).to.be.null;
                  // Attempt to connect
                  var pool = new Pool(null, {
                    host: self.configuration.host,
                    port: self.configuration.port,
                    bson: new Bson()
                  });

                  // Add event listeners
                  pool.on('connect', function() {
                    var query = new Query(
                      new Bson(),
                      'test.$cmd',
                      { insert: 'test', documents: [{ a: 1 }] },
                      { numberToSkip: 0, numberToReturn: 1 }
                    );

                    pool.write(query, { command: true, requestId: query.requestId }, function(
                      loginErr,
                      loginRes
                    ) {
                      expect(loginErr).to.be.null;
                      expect(loginRes).to.exist;

                      // Logout pool
                      pool.logout('test', function(logoutErr) {
                        expect(logoutErr).to.be.null;

                        pool.write(query, { command: true, requestId: query.requestId }, function(
                          postLogoutWriteErr,
                          postLogoutWriteRes
                        ) {
                          expect(postLogoutWriteErr).to.not.be.null;
                          expect(postLogoutWriteRes).to.not.exist;

                          pool.destroy(true);
                          done();
                        });
                      });
                    });
                  });

                  // Start connection
                  pool.connect(credentials);
                }
              );
            }
          );
        });
      });
    }
  });

  // Skipped due to use of topology manager
  it.skip('should correctly have auth wait for logout to finish', {
    metadata: { requires: { topology: 'auth' } },

    test: function(done) {
      var self = this;

      // Restart instance
      self.configuration.manager.restart(true).then(function() {
        locateAuthMethod(self.configuration, function(err, method) {
          expect(err).to.be.null;

          const credentials = new MongoCredentials({
            mechansim: method,
            source: 'admin',
            username: 'root',
            passsword: 'root'
          });

          executeCommand(
            self.configuration,
            'admin',
            {
              createUser: 'root',
              pwd: 'root',
              roles: [{ role: 'root', db: 'admin' }],
              digestPassword: true
            },
            function(createRootUserErr, createRootUserRes) {
              expect(createRootUserErr).to.be.null;
              expect(createRootUserRes).to.exist;

              executeCommand(
                self.configuration,
                'test',
                {
                  createUser: 'admin',
                  pwd: 'admin',
                  roles: ['readWrite', 'dbAdmin'],
                  digestPassword: true
                },
                { credentials },
                function(createAdminUserErr, createAdminUserRes) {
                  expect(createAdminUserErr).to.be.null;
                  expect(createAdminUserRes).to.exist;

                  // Attempt to connect
                  var pool = new Pool(null, {
                    host: self.configuration.host,
                    port: self.configuration.port,
                    bson: new Bson()
                  });

                  // Add event listeners
                  pool.on('connect', function() {
                    var query = new Query(
                      new Bson(),
                      'test.$cmd',
                      { insert: 'test', documents: [{ a: 1 }] },
                      { numberToSkip: 0, numberToReturn: 1 }
                    );

                    pool.write(query, { requestId: query.requestId }, function(loginErr, loginRes) {
                      expect(loginRes).to.exist;
                      expect(loginErr).to.be.null;

                      // Logout pool
                      pool.logout('test', function(logoutErr) {
                        expect(logoutErr).to.be.null;
                      });

                      pool.auth(credentials, function(testMethodErr, testMethodRes) {
                        expect(testMethodRes).to.exist;
                        expect(testMethodErr).to.be.null;

                        pool.write(query, { requestId: query.requestId }, function(
                          postLogoutWriteErr,
                          postLogoutWriteRes
                        ) {
                          expect(postLogoutWriteRes).to.exist;
                          expect(postLogoutWriteErr).to.be.null;

                          pool.destroy(true);
                          done();
                        });
                      });
                    });
                  });

                  // Start connection
                  pool.connect(credentials);
                }
              );
            }
          );
        });
      });
    }
  });

  it('should correctly exit _execute loop when single available connection is destroyed', {
    metadata: { requires: { topology: 'single', apiVersion: false } },

    test: function(done) {
      // Enable connections accounting
      Connection.enableConnectionAccounting();

      // Attempt to connect
      var pool = new Pool(null, {
        host: this.configuration.host,
        port: this.configuration.port,
        bson: new Bson(),
        size: 1,
        socketTimeout: 500,
        messageHandler: function() {}
      });

      // Add event listeners
      pool.on('connect', function() {
        // Execute ismaster should not cause cpu to start spinning
        var query = new Query(
          new Bson(),
          'system.$cmd',
          { ismaster: true },
          { numberToSkip: 0, numberToReturn: 1 }
        );

        pool.write(query, function(initalQueryErr, initalQueryRes) {
          expect(initalQueryRes).to.exist;
          expect(initalQueryErr).to.be.null;

          // Mark available connection as broken
          var con = pool.availableConnections[0];
          con.destroyed = true;

          // Execute ismaster should not cause cpu to start spinning
          query = new Query(
            new Bson(),
            'system.$cmd',
            { ismaster: true },
            { numberToSkip: 0, numberToReturn: 1 }
          );

          pool.write(query, function(secondQueryErr, secondQueryRes) {
            expect(secondQueryRes).to.exist;
            expect(secondQueryErr).to.be.null;

            con.destroy();
            pool.destroy();
            done();
          });
        });
      });

      // Start connection
      pool.connect();
    }
  });

  it('should properly emit errors on forced destroy', {
    metadata: { requires: { topology: 'single', apiVersion: false } },

    test: function(done) {
      const pool = new Pool(null, {
        host: this.configuration.host,
        port: this.configuration.port,
        bson: new Bson()
      });

      pool.on('connect', () => {
        var query = new Query(
          new Bson(),
          'system.$cmd',
          { ismaster: true },
          { numberToSkip: 0, numberToReturn: 1 }
        );

        pool.write(query, function(err, result) {
          expect(err).to.exist;
          expect(err).to.match(/Pool was force destroyed/);
          expect(result).to.not.exist;
          done();
        });

        pool.destroy({ force: true });
      });

      pool.connect();
    }
  });

  it('should support callback mode for connect', {
    metadata: { requires: { topology: 'single', apiVersion: false } },
    test: function(done) {
      const pool = new Pool(null, {
        host: this.configuration.host,
        port: this.configuration.port,
        bson: new Bson()
      });

      pool.on('connect', () => done(new Error('connect was emitted')));
      pool.connect(err => {
        expect(err).to.not.exist;
        setTimeout(() => {
          pool.destroy(true, done);
        }, 100); // wait to ensure event is not emitted
      });
    }
  });

  it('should support resetting', {
    metadata: { requires: { apiVersion: false } },
    test: function(done) {
      const pool = new Pool(null, {
        host: this.configuration.host,
        port: this.configuration.port,
        bson: new Bson()
      });

      const isMasterQuery = new Query(
        new Bson(),
        'system.$cmd',
        { ismaster: true },
        { numberToSkip: 0, numberToReturn: 1 }
      );

      pool.once('connect', () => {
        const connections = pool.allConnections().map(conn => conn.id);
        expect(connections).to.have.length(1);

        pool.write(isMasterQuery, err => {
          expect(err).to.not.exist;

          pool.reset(err => {
            expect(err).to.not.exist;

            pool.write(isMasterQuery, err => {
              expect(err).to.not.exist;

              // verify the previous connection was dropped, and a new connection was created
              const newConnections = pool.allConnections().map(conn => conn.id);
              expect(newConnections).to.have.length(1);
              expect(newConnections[0]).to.not.equal(connections[0]);

              pool.destroy(done);
            });
          });
        });
      });

      pool.connect();
    }
  });
});
