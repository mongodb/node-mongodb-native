'use strict';
var expect = require('chai').expect,
  co = require('co'),
  Connection = require('../../../../lib/connection/connection'),
  mock = require('../../../mock'),
  ConnectionSpy = require('../shared').ConnectionSpy;

let test = {};
describe('ReplSet Read Preferences (mocks)', function() {
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

  it('Should correctly connect to a replicaset and select the correct tagged secondary server', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function(done) {
      var ReplSet = this.configuration.mongo.ReplSet,
        ObjectId = this.configuration.mongo.BSON.ObjectId,
        ReadPreference = this.configuration.mongo.ReadPreference,
        Long = this.configuration.mongo.BSON.Long;

      var electionIds = [new ObjectId(), new ObjectId()];
      var defaultFields = Object.assign({}, mock.DEFAULT_ISMASTER, {
        setName: 'rs',
        setVersion: 1,
        electionId: electionIds[0],
        hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002']
      });

      // Primary server states
      var primary = [
        Object.assign({}, defaultFields, {
          ismaster: true,
          secondary: false,
          me: 'localhost:32000',
          primary: 'localhost:32000',
          tags: { loc: 'ny' }
        })
      ];

      // Primary server states
      var firstSecondary = [
        Object.assign({}, defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32001',
          primary: 'localhost:32000',
          tags: { loc: 'sf' }
        })
      ];

      // Primary server states
      var secondSecondary = [
        Object.assign({}, defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32002',
          primary: 'localhost:32000',
          tags: { loc: 'dc' }
        })
      ];

      // Boot the mock
      co(function*() {
        const primaryServer = yield mock.createServer(32000, 'localhost');
        const firstSecondaryServer = yield mock.createServer(32001, 'localhost');
        const secondSecondaryServer = yield mock.createServer(32002, 'localhost');

        primaryServer.setMessageHandler(request => {
          // Get the document
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(primary[0]);
          } else if (doc.count) {
            request.reply({ waitedMS: Long.ZERO, n: 1, ok: 1 });
          }
        });

        firstSecondaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(firstSecondary[0]);
          } else if (doc.count) {
            request.reply({ waitedMS: Long.ZERO, n: 1, ok: 1 });
          }
        });

        secondSecondaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(secondSecondary[0]);
          } else if (doc.count) {
            request.reply({ waitedMS: Long.ZERO, n: 1, ok: 1 });
          }
        });

        // Attempt to connect
        var server = new ReplSet(
          [
            { host: 'localhost', port: 32000 },
            { host: 'localhost', port: 32001 },
            { host: 'localhost', port: 32002 }
          ],
          {
            setName: 'rs',
            connectionTimeout: 3000,
            socketTimeout: 0,
            haInterval: 2000,
            size: 1
          }
        );

        // Add event listeners
        server.on('connect', function(_server) {
          // Set up a write
          function schedule() {
            // Perform a find
            _server.command(
              'test.test',
              {
                count: 'test.test',
                batchSize: 2
              },
              {
                readPreference: new ReadPreference('secondary', { loc: 'dc' })
              },
              function(err, r) {
                expect(err).to.be.null;
                expect(r.connection.port).to.equal(32002);

                server.destroy();
                done();
              }
            );
          }

          // Schedule an insert
          setTimeout(function() {
            schedule();
          }, 2000);
        });

        server.connect();
      });
    }
  });

  it('Should correctly connect to a replicaset and select the primary server', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function(done) {
      var ReplSet = this.configuration.mongo.ReplSet,
        ObjectId = this.configuration.mongo.BSON.ObjectId,
        ReadPreference = this.configuration.mongo.ReadPreference,
        Long = this.configuration.mongo.BSON.Long;

      var electionIds = [new ObjectId(), new ObjectId()];
      var defaultFields = Object.assign({}, mock.DEFAULT_ISMASTER, {
        setName: 'rs',
        setVersion: 1,
        electionId: electionIds[0],
        hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002']
      });

      // Primary server states
      var primary = [
        Object.assign({}, defaultFields, {
          ismaster: true,
          secondary: false,
          me: 'localhost:32000',
          primary: 'localhost:32000',
          tags: { loc: 'ny' }
        })
      ];

      // Primary server states
      var firstSecondary = [
        Object.assign({}, defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32001',
          primary: 'localhost:32000',
          tags: { loc: 'sf' }
        })
      ];

      // Primary server states
      var secondSecondary = [
        Object.assign({}, defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32002',
          primary: 'localhost:32000',
          tags: { loc: 'dc' }
        })
      ];

      // Boot the mock
      co(function*() {
        const primaryServer = yield mock.createServer(32000, 'localhost');
        const firstSecondaryServer = yield mock.createServer(32001, 'localhost');
        const secondSecondaryServer = yield mock.createServer(32002, 'localhost');

        primaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(primary[0]);
          } else if (doc.count) {
            request.reply({ waitedMS: Long.ZERO, n: 1, ok: 1 });
          }
        });

        firstSecondaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(firstSecondary[0]);
          } else if (doc.count) {
            request.reply({ waitedMS: Long.ZERO, n: 1, ok: 1 });
          }
        });

        secondSecondaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(secondSecondary[0]);
          } else if (doc.count) {
            request.reply({ waitedMS: Long.ZERO, n: 1, ok: 1 });
          }
        });

        // Attempt to connect
        var server = new ReplSet(
          [
            { host: 'localhost', port: 32000 },
            { host: 'localhost', port: 32001 },
            { host: 'localhost', port: 32002 }
          ],
          {
            setName: 'rs',
            connectionTimeout: 3000,
            socketTimeout: 0,
            haInterval: 2000,
            size: 1
          }
        );

        // Add event listeners
        server.on('connect', function(_server) {
          // Set up a write
          function schedule() {
            setTimeout(function() {
              // Perform a find
              _server.command(
                'test.test',
                {
                  count: 'test.test',
                  batchSize: 2
                },
                {
                  readPreference: new ReadPreference('primaryPreferred')
                },
                function(err, r) {
                  expect(err).to.be.null;
                  expect(r.connection.port).to.equal(32000);

                  server.destroy();
                  done();
                }
              );
            }, 500);
          }

          // Schedule an insert
          schedule();
        });

        server.connect();
      });
    }
  });

  it('Should correctly round robin secondary reads', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function(done) {
      var ReplSet = this.configuration.mongo.ReplSet,
        ObjectId = this.configuration.mongo.BSON.ObjectId,
        ReadPreference = this.configuration.mongo.ReadPreference,
        Long = this.configuration.mongo.BSON.Long;

      var electionIds = [new ObjectId(), new ObjectId()];
      var defaultFields = Object.assign({}, mock.DEFAULT_ISMASTER, {
        setName: 'rs',
        setVersion: 1,
        electionId: electionIds[0],
        hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002']
      });

      // Primary server states
      var primary = [
        Object.assign({}, defaultFields, {
          ismaster: true,
          secondary: false,
          me: 'localhost:32000',
          primary: 'localhost:32000',
          tags: { loc: 'ny' }
        })
      ];

      // Primary server states
      var firstSecondary = [
        Object.assign({}, defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32001',
          primary: 'localhost:32000',
          tags: { loc: 'sf' }
        })
      ];

      // Primary server states
      var secondSecondary = [
        Object.assign({}, defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32002',
          primary: 'localhost:32000',
          tags: { loc: 'dc' }
        })
      ];

      // Boot the mock
      co(function*() {
        const primaryServer = yield mock.createServer(32000, 'localhost');
        const firstSecondaryServer = yield mock.createServer(32001, 'localhost');
        const secondSecondaryServer = yield mock.createServer(32002, 'localhost');

        primaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(primary[0]);
          } else if (doc.count) {
            request.reply({ waitedMS: Long.ZERO, n: 1, ok: 1 });
          }
        });

        firstSecondaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(firstSecondary[0]);
          } else if (doc.count) {
            request.reply({ waitedMS: Long.ZERO, n: 1, ok: 1 });
          }
        });

        secondSecondaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(secondSecondary[0]);
          } else if (doc.count) {
            request.reply({ waitedMS: Long.ZERO, n: 1, ok: 1 });
          }
        });

        // Attempt to connect
        var server = new ReplSet(
          [
            { host: 'localhost', port: 32000 },
            { host: 'localhost', port: 32001 },
            { host: 'localhost', port: 32002 }
          ],
          {
            setName: 'rs',
            connectionTimeout: 3000,
            socketTimeout: 0,
            haInterval: 2000,
            size: 1
          }
        );

        // Add event listeners
        var port = 0;
        server.on('connect', function(_server) {
          // Set up a write
          function schedule() {
            setTimeout(function() {
              // Perform a find
              _server.command(
                'test.test',
                {
                  count: 'test.test',
                  batchSize: 2
                },
                {
                  readPreference: new ReadPreference('secondary')
                },
                function(err, r) {
                  expect(err).to.be.null;
                  port = r.connection.port;

                  // Perform a find
                  _server.command(
                    'test.test',
                    {
                      count: 'test.test',
                      batchSize: 2
                    },
                    {
                      readPreference: new ReadPreference('secondary')
                    },
                    function(_err, _r) {
                      expect(_err).to.be.null;
                      expect(_r.connection.port).to.not.equal(port);
                      port = _r.connection.port;

                      // Perform a find
                      _server.command(
                        'test.test',
                        {
                          count: 'test.test',
                          batchSize: 2
                        },
                        {
                          readPreference: new ReadPreference('secondary')
                        },
                        function(__err, __r) {
                          expect(__err).to.be.null;
                          expect(__r.connection.port).to.not.equal(port);

                          server.destroy();
                          done();
                        }
                      );
                    }
                  );
                }
              );
            }, 500);
          }

          // Schedule an insert
          schedule();
        });

        server.connect();
      });
    }
  });

  it('Should correctly fall back to a secondary server if the readPreference is primaryPreferred', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function(done) {
      var ReplSet = this.configuration.mongo.ReplSet,
        ObjectId = this.configuration.mongo.BSON.ObjectId,
        ReadPreference = this.configuration.mongo.ReadPreference,
        Long = this.configuration.mongo.BSON.Long,
        MongoError = this.configuration.mongo.MongoError;

      var electionIds = [new ObjectId(), new ObjectId()];
      var defaultFields = Object.assign({}, mock.DEFAULT_ISMASTER, {
        setName: 'rs',
        setVersion: 1,
        electionId: electionIds[0],
        hosts: ['localhost:32000', 'localhost:32001']
      });

      // Primary server states
      var primary = [
        Object.assign({}, defaultFields, {
          ismaster: true,
          secondary: false,
          me: 'localhost:32000',
          primary: 'localhost:32000'
        })
      ];

      // Primary server states
      var firstSecondary = [
        Object.assign({}, defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32001',
          primary: 'localhost:32000'
        })
      ];

      // Boot the mock
      co(function*() {
        const primaryServer = yield mock.createServer(32000, 'localhost');
        const firstSecondaryServer = yield mock.createServer(32001, 'localhost');

        primaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(primary[0]);
          } else if (doc.count) {
            request.reply({ waitedMS: Long.ZERO, n: 1, ok: 1 });
          }
        });

        firstSecondaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(firstSecondary[0]);
          } else if (doc.count) {
            request.reply({ waitedMS: Long.ZERO, n: 1, ok: 1 });
          }
        });

        // mock ops store from node-mongodb-native for handling repl set disconnects
        var mockDisconnectHandler = {
          add: function(opType, ns, ops, options, callback) {
            // Command issued to replSet will fail immediately if !server.isConnected()
            return callback(new MongoError({ message: 'no connection available', driver: true }));
          },
          execute: function() {
            // method needs to be called, so provide a dummy version
            return;
          },
          flush: function() {
            // method needs to be called, so provide a dummy version
            return;
          }
        };

        // Attempt to connect
        var server = new ReplSet(
          [
            {
              host: 'localhost',
              port: 32000,
              socketTimeout: 3000,
              connectionTimeout: 3000
            },
            { host: 'localhost', port: 32001 }
          ],
          {
            setName: 'rs',
            haInterval: 10000,
            disconnectHandler: mockDisconnectHandler,
            size: 1
          }
        );

        // Add event listeners
        server.on('connect', function(_server) {
          function schedule() {
            setTimeout(function() {
              // Perform a find
              _server.command(
                'test.test',
                {
                  count: 'test.test',
                  batchSize: 2
                },
                {
                  readPreference: new ReadPreference('primaryPreferred')
                },
                function(err, r) {
                  expect(err).to.be.null;
                  expect(r.connection.port).to.equal(32000);
                  primaryServer;

                  _server.on(
                    'left',
                    function() {
                      // Perform another find, after primary is gone
                      _server.command(
                        'test.test',
                        {
                          count: 'test.test',
                          batchSize: 2
                        },
                        {
                          readPreference: new ReadPreference('primaryPreferred')
                        },
                        function(_err, _r) {
                          expect(_err).to.be.null;
                          expect(_r.connection.port).to.equal(32001); // reads from secondary while primary down

                          server.destroy();
                          done();
                        }
                      );
                    },
                    2500
                  );
                }
              );
            }, 500);
          }

          // Schedule a commands
          schedule();
        });

        server.connect();
      });
    }
  });

  it('Should correctly fallback to secondaries when primary not available', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function(done) {
      var ReplSet = this.configuration.mongo.ReplSet,
        ObjectId = this.configuration.mongo.BSON.ObjectId,
        ReadPreference = this.configuration.mongo.ReadPreference,
        Long = this.configuration.mongo.BSON.Long;

      var electionIds = [new ObjectId(), new ObjectId()];
      var defaultFields = Object.assign({}, mock.DEFAULT_ISMASTER, {
        setName: 'rs',
        setVersion: 1,
        electionId: electionIds[0],
        hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002']
      });

      // Primary server states
      var primary = [
        Object.assign({}, defaultFields, {
          ismaster: true,
          secondary: false,
          me: 'localhost:32000',
          primary: 'localhost:32000',
          tags: { loc: 'ny' }
        })
      ];

      // Primary server states
      var firstSecondary = [
        Object.assign({}, defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32001',
          primary: 'localhost:32000',
          tags: { loc: 'sf' }
        })
      ];

      // Primary server states
      var secondSecondary = [
        Object.assign({}, defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32002',
          primary: 'localhost:32000',
          tags: { loc: 'dc' }
        })
      ];

      // Boot the mock
      co(function*() {
        const primaryServer = yield mock.createServer(32000, 'localhost');
        const firstSecondaryServer = yield mock.createServer(32001, 'localhost');
        const secondSecondaryServer = yield mock.createServer(32002, 'localhost');

        primaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(primary[0]);
          } else if (doc.count) {
            request.connection.destroy();
          }
        });

        firstSecondaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(firstSecondary[0]);
          } else if (doc.count) {
            request.reply({ waitedMS: Long.ZERO, n: 1, ok: 1 });
          }
        });

        secondSecondaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(secondSecondary[0]);
          } else if (doc.count) {
            request.reply({ waitedMS: Long.ZERO, n: 1, ok: 1 });
          }
        });

        // Attempt to connect
        var server = new ReplSet(
          [
            { host: 'localhost', port: 32000 },
            { host: 'localhost', port: 32001 },
            { host: 'localhost', port: 32002 }
          ],
          {
            setName: 'rs',
            connectionTimeout: 3000,
            socketTimeout: 0,
            haInterval: 2000,
            size: 1
          }
        );

        // Add event listeners
        let joinCount = 0;
        server.on('joined', function() {
          joinCount++;
          if (joinCount !== 3) return;

          // Set up a write
          function schedule() {
            // Perform a find
            server.command(
              'test.test',
              {
                count: 'test.test',
                batchSize: 2
              },
              {
                readPreference: new ReadPreference('primaryPreferred')
              },
              function(err) {
                expect(err).to.exist;

                // Let all sockets properly close
                process.nextTick(function() {
                  // Test primaryPreferred
                  server.command(
                    'test.test',
                    {
                      count: 'test.test',
                      batchSize: 2
                    },
                    {
                      readPreference: new ReadPreference('primaryPreferred')
                    },
                    function(_err, _r) {
                      expect(_err).to.be.null;
                      expect(_r.connection.port).to.not.equal(32000);

                      // Test secondaryPreferred
                      server.command(
                        'test.test',
                        {
                          count: 'test.test',
                          batchSize: 2
                        },
                        {
                          readPreference: new ReadPreference('secondaryPreferred')
                        },
                        function(__err, __r) {
                          expect(__err).to.be.null;
                          expect(__r.connection.port).to.not.equal(32000);

                          server.destroy();
                          done();
                        }
                      );
                    }
                  );
                });
              }
            );
          }

          // Schedule an insert
          schedule();
        });

        server.connect();
      });
    }
  });

  it('Should correctly connect to a replicaset and perform correct nearness read', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function(done) {
      var ReplSet = this.configuration.mongo.ReplSet,
        ObjectId = this.configuration.mongo.BSON.ObjectId,
        ReadPreference = this.configuration.mongo.ReadPreference,
        Long = this.configuration.mongo.BSON.Long;

      var electionIds = [new ObjectId(), new ObjectId()];
      var defaultFields = Object.assign({}, mock.DEFAULT_ISMASTER, {
        setName: 'rs',
        setVersion: 1,
        electionId: electionIds[0],
        hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002']
      });

      // Primary server states
      var primary = [
        Object.assign({}, defaultFields, {
          ismaster: true,
          secondary: false,
          me: 'localhost:32000',
          primary: 'localhost:32000',
          tags: { loc: 'ny' }
        })
      ];

      // Primary server states
      var firstSecondary = [
        Object.assign({}, defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32001',
          primary: 'localhost:32000',
          tags: { loc: 'sf' }
        })
      ];

      // Primary server states
      var secondSecondary = [
        Object.assign({}, defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32002',
          primary: 'localhost:32000',
          tags: { loc: 'dc' }
        })
      ];

      // Boot the mock
      co(function*() {
        const primaryServer = yield mock.createServer(32000, 'localhost');
        const firstSecondaryServer = yield mock.createServer(32001, 'localhost');
        const secondSecondaryServer = yield mock.createServer(32002, 'localhost');

        primaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(primary[0]);
          } else if (doc.count) {
            request.reply({ waitedMS: Long.ZERO, n: 1, ok: 1 });
          }
        });

        firstSecondaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(firstSecondary[0]);
          } else if (doc.count) {
            request.reply({ waitedMS: Long.ZERO, n: 1, ok: 1 });
          }
        });

        secondSecondaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(secondSecondary[0]);
          } else if (doc.count) {
            request.reply({ waitedMS: Long.fromNumber(3), n: 1, ok: 1 });
          }
        });

        // Attempt to connect
        var server = new ReplSet(
          [
            { host: 'localhost', port: 32000 },
            { host: 'localhost', port: 32001 },
            { host: 'localhost', port: 32002 }
          ],
          {
            setName: 'rs',
            connectionTimeout: 3000,
            socketTimeout: 0,
            haInterval: 1000,
            size: 1
          }
        );

        // Set up a write
        function runTest(_server) {
          _server.s.replicaSetState.secondaries = _server.s.replicaSetState.secondaries
            .sort((a, b) => Number(a.name.split(':')[1]) > Number(b.name.split(':')[1]))
            .map(function(x, i) {
              x.lastIsMasterMS = i * 50;
              return x;
            });

          // Perform a find
          _server.command(
            'test.test',
            {
              count: 'test.test',
              batchSize: 2
            },
            {
              readPreference: new ReadPreference('nearest')
            },
            function(err, r) {
              expect(err).to.be.null;
              expect(r.connection.port).to.be.oneOf([32000, 32001]);

              server.destroy();
              done();
            }
          );
        }

        let joinCount = 0;
        server.on('joined', function() {
          joinCount++;
          if (joinCount !== 3) return;
          runTest(server);
        });

        server.connect();
      });
    }
  });

  it('Should correctly connect to a replicaset and perform correct nearness read with tag', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function(done) {
      var ReplSet = this.configuration.mongo.ReplSet,
        ObjectId = this.configuration.mongo.BSON.ObjectId,
        ReadPreference = this.configuration.mongo.ReadPreference,
        Long = this.configuration.mongo.BSON.Long;

      var electionIds = [new ObjectId(), new ObjectId()];
      var defaultFields = Object.assign({}, mock.DEFAULT_ISMASTER, {
        setName: 'rs',
        setVersion: 1,
        electionId: electionIds[0],
        hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002']
      });

      // Primary server states
      var primary = [
        Object.assign({}, defaultFields, {
          ismaster: true,
          secondary: false,
          me: 'localhost:32000',
          primary: 'localhost:32000',
          tags: { loc: 'ny' }
        })
      ];

      // Primary server states
      var firstSecondary = [
        Object.assign({}, defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32001',
          primary: 'localhost:32000',
          tags: { loc: 'dc' }
        })
      ];

      // Primary server states
      var secondSecondary = [
        Object.assign({}, defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32002',
          primary: 'localhost:32000',
          tags: { loc: 'dc' }
        })
      ];

      // Boot the mock
      co(function*() {
        const primaryServer = yield mock.createServer(32000, 'localhost');
        const firstSecondaryServer = yield mock.createServer(32001, 'localhost');
        const secondSecondaryServer = yield mock.createServer(32002, 'localhost');

        primaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(primary[0]);
          } else if (doc.count) {
            request.reply({ waitedMS: Long.ZERO, n: 1, ok: 1 });
          }
        });

        firstSecondaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(firstSecondary[0]);
          } else if (doc.count) {
            request.reply({ waitedMS: Long.ZERO, n: 1, ok: 1 });
          }
        });

        secondSecondaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(secondSecondary[0]);
          } else if (doc.count) {
            request.reply({ waitedMS: Long.ZERO, n: 1, ok: 1 });
          }
        });

        // Attempt to connect
        var server = new ReplSet(
          [
            { host: 'localhost', port: 32000 },
            { host: 'localhost', port: 32001 },
            { host: 'localhost', port: 32002 }
          ],
          {
            setName: 'rs',
            connectionTimeout: 3000,
            socketTimeout: 0,
            haInterval: 1000,
            size: 1
          }
        );

        // Set up a write
        function runTest(_server) {
          _server.s.replicaSetState.secondaries = _server.s.replicaSetState.secondaries
            .sort((a, b) => Number(a.name.split(':')[1]) > Number(b.name.split(':')[1]))
            .map(function(x, i) {
              x.lastIsMasterMS = i * 50;
              return x;
            });

          // Perform a find
          _server.command(
            'test.test',
            {
              count: 'test.test',
              batchSize: 2
            },
            {
              readPreference: new ReadPreference('nearest', { loc: 'dc' })
            },
            function(err, r) {
              expect(err).to.be.null;
              expect(r.connection.port).to.be.oneOf([32001, 32002]);

              server.destroy();
              done();
            }
          );
        }

        // Add event listeners
        let joinCount = 0;
        server.on('joined', function() {
          joinCount++;
          if (joinCount !== 3) return;
          runTest(server);
        });

        server.connect();
      });
    }
  });

  it(
    'Should correctly connect connect to single server replicaset and peform a secondaryPreferred',
    {
      metadata: {
        requires: {
          generators: true,
          topology: 'single'
        }
      },

      test: function(done) {
        var ReplSet = this.configuration.mongo.ReplSet,
          ObjectId = this.configuration.mongo.BSON.ObjectId,
          ReadPreference = this.configuration.mongo.ReadPreference,
          Long = this.configuration.mongo.BSON.Long;

        var electionIds = [new ObjectId(), new ObjectId()];
        var defaultFields = Object.assign({}, mock.DEFAULT_ISMASTER, {
          setName: 'rs',
          setVersion: 1,
          electionId: electionIds[0],
          hosts: ['localhost:32000']
        });

        // Primary server states
        var primary = [
          Object.assign({}, defaultFields, {
            ismaster: true,
            secondary: false,
            me: 'localhost:32000',
            primary: 'localhost:32000',
            tags: { loc: 'ny' }
          })
        ];

        // Boot the mock
        co(function*() {
          const primaryServer = yield mock.createServer(32000, 'localhost');

          primaryServer.setMessageHandler(request => {
            var doc = request.document;
            if (doc.ismaster) {
              request.reply(primary[0]);
            } else if (doc.count) {
              request.reply({ waitedMS: Long.ZERO, n: 1, ok: 1 });
            }
          });

          // Attempt to connect
          var server = new ReplSet([{ host: 'localhost', port: 32000 }], {
            setName: 'rs',
            connectionTimeout: 3000,
            socketTimeout: 0,
            haInterval: 2000,
            size: 1
          });

          // Add event listeners
          server.on('connect', function(_server) {
            // Set up a write
            function schedule() {
              setTimeout(function() {
                // Perform a find
                _server.command(
                  'test.test',
                  {
                    count: 'test.test',
                    batchSize: 2
                  },
                  {
                    readPreference: new ReadPreference('secondaryPreferred')
                  },
                  function(err, r) {
                    expect(err).to.be.null;
                    expect(r.connection.port).to.equal(32000);

                    server.destroy();
                    done();
                  }
                );
              }, 500);
            }

            // Schedule an insert
            schedule();
          });

          server.connect();
        });
      }
    }
  );

  it('Should only read from secondaries when read preference secondaryPreferred is specified', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function(done) {
      var ReplSet = this.configuration.mongo.ReplSet,
        ObjectId = this.configuration.mongo.BSON.ObjectId,
        ReadPreference = this.configuration.mongo.ReadPreference,
        Long = this.configuration.mongo.BSON.Long;

      var electionIds = [new ObjectId(), new ObjectId()];
      var defaultFields = Object.assign({}, mock.DEFAULT_ISMASTER, {
        setName: 'rs',
        setVersion: 1,
        electionId: electionIds[0],
        hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002']
      });

      // Primary server states
      var primary = [
        Object.assign({}, defaultFields, {
          ismaster: true,
          secondary: false,
          me: 'localhost:32000',
          primary: 'localhost:32000',
          tags: { loc: 'ny' }
        })
      ];

      // Primary server states
      var firstSecondary = [
        Object.assign({}, defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32001',
          primary: 'localhost:32000',
          tags: { loc: 'sf' }
        })
      ];

      // Primary server states
      var secondSecondary = [
        Object.assign({}, defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32002',
          primary: 'localhost:32000',
          tags: { loc: 'dc' }
        })
      ];

      // Boot the mock
      co(function*() {
        const primaryServer = yield mock.createServer(32000, 'localhost');
        const firstSecondaryServer = yield mock.createServer(32001, 'localhost');
        const secondSecondaryServer = yield mock.createServer(32002, 'localhost');

        primaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(primary[0]);
          } else if (doc.count) {
            request.reply({ waitedMS: Long.ZERO, n: 1, ok: 1 });
          }
        });

        firstSecondaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(firstSecondary[0]);
          } else if (doc.count) {
            request.reply({ waitedMS: Long.ZERO, n: 1, ok: 1 });
          }
        });

        secondSecondaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(secondSecondary[0]);
          } else if (doc.count) {
            request.reply({ waitedMS: Long.ZERO, n: 1, ok: 1 });
          }
        });

        // Attempt to connect
        var server = new ReplSet(
          [
            { host: 'localhost', port: 32000 },
            { host: 'localhost', port: 32001 },
            { host: 'localhost', port: 32002 }
          ],
          {
            setName: 'rs',
            connectionTimeout: 3000,
            socketTimeout: 0,
            haInterval: 2000,
            size: 1
          }
        );

        // Add event listeners
        server.on('all', function(_server) {
          // Execute more operations than there is servers connected
          setTimeout(function() {
            var count = 50;
            var portsSeen = {};

            var checkHandler = function(err, r) {
              count = count - 1;
              expect(err).to.be.null;

              // Add the port to the portsSeen
              portsSeen[r.connection.port] = true;

              // Finished up
              if (count === 0) {
                // Should not contain the primary
                expect(portsSeen).to.not.have.key('32000');

                server.destroy();
                done();
              }
            };

            for (var i = 0; i < 50; i++) {
              // Perform a find
              _server.command(
                'test.test',
                {
                  count: 'test.test',
                  batchSize: 2
                },
                {
                  readPreference: new ReadPreference('secondaryPreferred')
                },
                checkHandler
              );
            }
          }, 1000);
        });

        server.connect();
      });
    }
  });
});
