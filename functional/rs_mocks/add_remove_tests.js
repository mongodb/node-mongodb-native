'use strict';

var expect = require('chai').expect,
  assign = require('../../../../lib/utils').assign,
  co = require('co'),
  Connection = require('../../../../lib/connection/connection'),
  mockupdb = require('../../../mock');

describe('ReplSet Add Remove (mocks)', function() {
  it('Successfully add a new secondary server to the set', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function(done) {
      var ReplSet = this.configuration.mongo.ReplSet,
        ObjectId = this.configuration.mongo.BSON.ObjectId;

      // Contain mock server
      var primaryServer = null;
      var firstSecondaryServer = null;
      var secondSecondaryServer = null;
      var arbiterServer = null;
      var running = true;
      var currentIsMasterIndex = 0;

      // Default message fields
      var defaultFields = {
        setName: 'rs',
        setVersion: 1,
        electionId: new ObjectId(),
        maxBsonObjectSize: 16777216,
        maxMessageSizeBytes: 48000000,
        maxWriteBatchSize: 1000,
        localTime: new Date(),
        maxWireVersion: 4,
        minWireVersion: 0,
        ok: 1,
        hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002'],
        arbiters: ['localhost:32002']
      };

      // Primary server states
      var primary = [
        assign({}, defaultFields, {
          ismaster: true,
          secondary: false,
          me: 'localhost:32000',
          primary: 'localhost:32000',
          tags: { loc: 'ny' }
        }),
        assign({}, defaultFields, {
          ismaster: true,
          secondary: false,
          me: 'localhost:32000',
          primary: 'localhost:32000',
          tags: { loc: 'ny' },
          hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002', 'localhost:32003'],
          setVersion: 2
        })
      ];

      // Primary server states
      var firstSecondary = [
        assign({}, defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32001',
          primary: 'localhost:32000',
          tags: { loc: 'sf' }
        }),
        assign({}, defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32001',
          primary: 'localhost:32000',
          tags: { loc: 'sf' },
          hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002', 'localhost:32003'],
          setVersion: 2
        })
      ];

      // Primary server states
      var secondSecondary = [
        assign({}, defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32003',
          primary: 'localhost:32000',
          tags: { loc: 'sf' },
          hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002', 'localhost:32003'],
          setVersion: 2
        })
      ];

      // Primary server states
      var arbiter = [
        assign({}, defaultFields, {
          ismaster: false,
          secondary: false,
          arbiterOnly: true,
          me: 'localhost:32002',
          primary: 'localhost:32000'
        }),
        assign({}, defaultFields, {
          ismaster: false,
          secondary: false,
          arbiterOnly: true,
          me: 'localhost:32002',
          primary: 'localhost:32000',
          hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002', 'localhost:32003'],
          setVersion: 2
        })
      ];

      // Boot the mock
      co(function*() {
        primaryServer = yield mockupdb.createServer(32000, 'localhost');
        firstSecondaryServer = yield mockupdb.createServer(32001, 'localhost');
        secondSecondaryServer = yield mockupdb.createServer(32003, 'localhost');
        arbiterServer = yield mockupdb.createServer(32002, 'localhost');

        // Primary state machine
        co(function*() {
          while (running) {
            var request = yield primaryServer.receive();
            var doc = request.document;

            if (doc.ismaster) {
              request.reply(primary[currentIsMasterIndex]);
            }
          }
        }).catch(function() {
          // console.log(err.stack);
        });

        // First secondary state machine
        co(function*() {
          while (running) {
            var request = yield firstSecondaryServer.receive();
            var doc = request.document;

            if (doc.ismaster) {
              request.reply(firstSecondary[currentIsMasterIndex]);
            }
          }
        }).catch(function() {
          // console.log(err.stack);
        });

        // Second secondary state machine
        co(function*() {
          while (running) {
            var request = yield secondSecondaryServer.receive();
            var doc = request.document;

            if (doc.ismaster) {
              request.reply(secondSecondary[0]);
            }
          }
        }).catch(function() {
          // console.log(err.stack);
        });

        // Arbiter state machine
        co(function*() {
          while (running) {
            var request = yield arbiterServer.receive();
            var doc = request.document;

            if (doc.ismaster) {
              request.reply(arbiter[currentIsMasterIndex]);
            }
          }
        }).catch(function() {
          // console.log(err.stack);
        });
      });

      Connection.enableConnectionAccounting();
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

      var secondaries = {};
      var arbiters = {};

      server.on('joined', function(_type, _server) {
        if (_type === 'arbiter') {
          arbiters[_server.name] = _server;
          // Flip the ismaster message
          currentIsMasterIndex = currentIsMasterIndex + 1;
        } else if (_type === 'secondary') {
          secondaries[_server.name] = _server;
          if (Object.keys(secondaries).length === 2) {
            expect(secondaries['localhost:32001']).to.not.be.null;
            expect(secondaries['localhost:32003']).to.not.be.null;
            expect(arbiters['localhost:32002']).to.not.be.null;

            // Finish up the test
            running = false;
            primaryServer.destroy();
            firstSecondaryServer.destroy();
            secondSecondaryServer.destroy();
            arbiterServer.destroy();
            server.destroy();

            setTimeout(function() {
              expect(Object.keys(Connection.connections()).length).to.equal(0);
              Connection.disableConnectionAccounting();
              done();
            }, 3000);
          }
        }
      });

      server.on('error', function() {});
      server.on('connect', function() {
        server.__connected = true;
      });

      // Gives proxies a chance to boot up
      setTimeout(function() {
        server.connect();
      }, 100);
    }
  });

  it('Successfully remove a secondary server from the set', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function(done) {
      var ReplSet = this.configuration.mongo.ReplSet,
        ObjectId = this.configuration.mongo.BSON.ObjectId;

      // Contain mock server
      var primaryServer = null;
      var firstSecondaryServer = null;
      var secondSecondaryServer = null;
      var arbiterServer = null;
      var running = true;
      var currentIsMasterIndex = 0;

      // Default message fields
      var defaultFields = {
        setName: 'rs',
        setVersion: 1,
        electionId: new ObjectId(),
        maxBsonObjectSize: 16777216,
        maxMessageSizeBytes: 48000000,
        maxWriteBatchSize: 1000,
        localTime: new Date(),
        maxWireVersion: 4,
        minWireVersion: 0,
        ok: 1,
        hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002', 'localhost:32003'],
        arbiters: ['localhost:32002']
      };

      // Primary server states
      var primary = [
        assign({}, defaultFields, {
          ismaster: true,
          secondary: false,
          me: 'localhost:32000',
          primary: 'localhost:32000',
          tags: { loc: 'ny' }
        }),
        assign({}, defaultFields, {
          ismaster: true,
          secondary: false,
          me: 'localhost:32000',
          primary: 'localhost:32000',
          tags: { loc: 'ny' },
          hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002'],
          setVersion: 2
        })
      ];

      // Primary server states
      var firstSecondary = [
        assign({}, defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32001',
          primary: 'localhost:32000',
          tags: { loc: 'sf' }
        }),
        assign({}, defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32001',
          primary: 'localhost:32000',
          tags: { loc: 'sf' },
          hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002'],
          setVersion: 2
        })
      ];

      // Primary server states
      var secondSecondary = [
        assign({}, defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32003',
          primary: 'localhost:32000',
          tags: { loc: 'sf' }
        }),
        {
          ismaster: true,
          maxBsonObjectSize: 16777216,
          maxMessageSizeBytes: 48000000,
          maxWriteBatchSize: 1000,
          localTime: new Date(),
          maxWireVersion: 3,
          minWireVersion: 0,
          ok: 1
        }
      ];

      // Primary server states
      var arbiter = [
        assign({}, defaultFields, {
          ismaster: false,
          secondary: false,
          arbiterOnly: true,
          me: 'localhost:32002',
          primary: 'localhost:32000'
        }),
        assign({}, defaultFields, {
          ismaster: false,
          secondary: false,
          arbiterOnly: true,
          me: 'localhost:32002',
          primary: 'localhost:32000',
          hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002'],
          setVersion: 2
        })
      ];

      // Boot the mock
      co(function*() {
        primaryServer = yield mockupdb.createServer(32000, 'localhost');
        firstSecondaryServer = yield mockupdb.createServer(32001, 'localhost');
        secondSecondaryServer = yield mockupdb.createServer(32003, 'localhost');
        arbiterServer = yield mockupdb.createServer(32002, 'localhost');

        // Primary state machine
        co(function*() {
          while (running) {
            var request = yield primaryServer.receive();
            var doc = request.document;

            if (doc.ismaster) {
              request.reply(primary[currentIsMasterIndex]);
            }
          }
        }).catch(function() {
          // console.log(err.stack);
        });

        // First secondary state machine
        co(function*() {
          while (running) {
            var request = yield firstSecondaryServer.receive();
            var doc = request.document;

            if (doc.ismaster) {
              request.reply(firstSecondary[currentIsMasterIndex]);
            }
          }
        }).catch(function() {
          // console.log(err.stack);
        });

        // Second secondary state machine
        co(function*() {
          while (running) {
            var request = yield secondSecondaryServer.receive();
            var doc = request.document;

            if (doc.ismaster) {
              request.reply(secondSecondary[currentIsMasterIndex]);
            }
          }
        }).catch(function() {
          // console.log(err.stack);
        });

        // Arbiter state machine
        co(function*() {
          while (running) {
            var request = yield arbiterServer.receive();
            var doc = request.document;

            if (doc.ismaster) {
              request.reply(arbiter[currentIsMasterIndex]);
            }
          }
        }).catch(function() {
          // console.log(err.stack);
        });
      });

      Connection.enableConnectionAccounting();
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

      // Joined
      var joined = 0;

      server.on('joined', function() {
        joined = joined + 1;

        // primary, secondary and arbiter have joined
        if (joined === 4) {
          expect(server.s.replicaSetState.secondaries).to.have.length(2);
          expect(server.s.replicaSetState.secondaries[0].name).to.equal('localhost:32001');
          expect(server.s.replicaSetState.secondaries[1].name).to.equal('localhost:32003');
          expect(server.s.replicaSetState.arbiters).to.have.length(1);
          expect(server.s.replicaSetState.arbiters[0].name).to.equal('localhost:32002');
          expect(server.s.replicaSetState.primary).to.not.be.null;
          expect(server.s.replicaSetState.primary.name).to.equal('localhost:32000');

          // Flip the ismaster message
          currentIsMasterIndex = currentIsMasterIndex + 1;
        }
      });

      server.on('left', function(_type, _server) {
        if (_type === 'secondary' && _server.name === 'localhost:32003') {
          expect(server.s.replicaSetState.secondaries).to.have.length(1);
          expect(server.s.replicaSetState.secondaries[0].name).to.equal('localhost:32001');

          expect(server.s.replicaSetState.arbiters).to.have.length(1);
          expect(server.s.replicaSetState.arbiters[0].name).to.equal('localhost:32002');

          expect(server.s.replicaSetState.primary).to.not.be.null;
          expect(server.s.replicaSetState.primary.name).to.equal('localhost:32000');

          primaryServer.destroy();
          firstSecondaryServer.destroy();
          secondSecondaryServer.destroy();
          arbiterServer.destroy();
          server.destroy();
          running = false;

          setTimeout(function() {
            expect(Object.keys(Connection.connections())).to.have.length(0);
            Connection.disableConnectionAccounting();
            done();
          }, 2000);
        }
      });

      server.on('error', function() {});
      server.on('connect', function() {
        server.__connected = true;
      });

      // Gives proxies a chance to boot up
      setTimeout(function() {
        server.connect();
      }, 100);
    }
  });

  it('Successfully remove and re-add secondary server to the set', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function(done) {
      var ReplSet = this.configuration.mongo.ReplSet,
        ObjectId = this.configuration.mongo.BSON.ObjectId;

      // Contain mock server
      var primaryServer = null;
      var firstSecondaryServer = null;
      var secondSecondaryServer = null;
      var arbiterServer = null;
      var running = true;
      var currentIsMasterIndex = 0;

      // Default message fields
      var defaultFields = {
        setName: 'rs',
        setVersion: 1,
        electionId: new ObjectId(),
        maxBsonObjectSize: 16777216,
        maxMessageSizeBytes: 48000000,
        maxWriteBatchSize: 1000,
        localTime: new Date(),
        maxWireVersion: 4,
        minWireVersion: 0,
        ok: 1,
        hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002', 'localhost:32003'],
        arbiters: ['localhost:32002']
      };

      // Primary server states
      var primary = [
        assign({}, defaultFields, {
          ismaster: true,
          secondary: false,
          me: 'localhost:32000',
          primary: 'localhost:32000',
          tags: { loc: 'ny' }
        }),
        assign({}, defaultFields, {
          ismaster: true,
          secondary: false,
          me: 'localhost:32000',
          primary: 'localhost:32000',
          tags: { loc: 'ny' },
          hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002'],
          setVersion: 2
        }),
        assign({}, defaultFields, {
          ismaster: true,
          secondary: false,
          me: 'localhost:32000',
          primary: 'localhost:32000',
          tags: { loc: 'ny' }
        })
      ];

      // Primary server states
      var firstSecondary = [
        assign({}, defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32001',
          primary: 'localhost:32000',
          tags: { loc: 'sf' }
        }),
        assign({}, defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32001',
          primary: 'localhost:32000',
          tags: { loc: 'sf' },
          hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002'],
          setVersion: 2
        }),
        assign({}, defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32001',
          primary: 'localhost:32000',
          tags: { loc: 'sf' }
        })
      ];

      // Primary server states
      var secondSecondary = [
        assign({}, defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32003',
          primary: 'localhost:32000',
          tags: { loc: 'sf' }
        }),
        {
          ismaster: true,
          maxBsonObjectSize: 16777216,
          maxMessageSizeBytes: 48000000,
          maxWriteBatchSize: 1000,
          localTime: new Date(),
          maxWireVersion: 3,
          minWireVersion: 0,
          ok: 1
        },
        assign({}, defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32003',
          primary: 'localhost:32000',
          tags: { loc: 'sf' }
        })
      ];

      // Primary server states
      var arbiter = [
        assign({}, defaultFields, {
          ismaster: false,
          secondary: false,
          arbiterOnly: true,
          me: 'localhost:32002',
          primary: 'localhost:32000'
        }),
        assign({}, defaultFields, {
          ismaster: false,
          secondary: false,
          arbiterOnly: true,
          me: 'localhost:32002',
          primary: 'localhost:32000',
          hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002'],
          setVersion: 2
        }),
        assign({}, defaultFields, {
          ismaster: false,
          secondary: false,
          arbiterOnly: true,
          me: 'localhost:32002',
          primary: 'localhost:32000'
        })
      ];

      // Boot the mock
      co(function*() {
        primaryServer = yield mockupdb.createServer(32000, 'localhost');
        firstSecondaryServer = yield mockupdb.createServer(32001, 'localhost');
        secondSecondaryServer = yield mockupdb.createServer(32003, 'localhost');
        arbiterServer = yield mockupdb.createServer(32002, 'localhost');

        // Primary state machine
        co(function*() {
          while (running) {
            var request = yield primaryServer.receive();
            var doc = request.document;

            if (doc.ismaster) {
              request.reply(primary[currentIsMasterIndex]);
            }
          }
        }).catch(function() {
          // console.log(err.stack);
        });

        // First secondary state machine
        co(function*() {
          while (running) {
            var request = yield firstSecondaryServer.receive();
            var doc = request.document;

            if (doc.ismaster) {
              request.reply(firstSecondary[currentIsMasterIndex]);
            }
          }
        }).catch(function() {
          // console.log(err.stack);
        });

        // Second secondary state machine
        co(function*() {
          while (running) {
            var request = yield secondSecondaryServer.receive();
            var doc = request.document;

            if (doc.ismaster) {
              request.reply(secondSecondary[currentIsMasterIndex]);
            }
          }
        }).catch(function() {
          // console.log(err.stack);
        });

        // Arbiter state machine
        co(function*() {
          while (running) {
            var request = yield arbiterServer.receive();
            var doc = request.document;

            if (doc.ismaster) {
              request.reply(arbiter[currentIsMasterIndex]);
            }
          }
        }).catch(function() {
          // console.log(err.stack);
        });
      });

      Connection.enableConnectionAccounting();
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

      setTimeout(function() {
        expect(server.s.replicaSetState.set['localhost:32000'].type).to.equal('RSPrimary');
        expect(server.s.replicaSetState.set['localhost:32001'].type).to.equal('RSSecondary');
        expect(server.s.replicaSetState.set['localhost:32002'].type).to.equal('RSArbiter');
        expect(server.s.replicaSetState.set['localhost:32003'].type).to.equal('RSSecondary');
        currentIsMasterIndex = currentIsMasterIndex + 1;

        // Wait for another sweep
        setTimeout(function() {
          expect(server.s.replicaSetState.set['localhost:32000'].type).to.equal('RSPrimary');
          expect(server.s.replicaSetState.set['localhost:32001'].type).to.equal('RSSecondary');
          expect(server.s.replicaSetState.set['localhost:32002'].type).to.equal('RSArbiter');
          expect(server.s.replicaSetState.set['localhost:32003'].type).to.equal('RSSecondary');
          expect(server.s.replicaSetState.secondaries).to.have.length(2);
          expect(server.s.replicaSetState.arbiters).to.have.length(1);
          expect(server.s.replicaSetState.primary).to.exist;

          // Ensure we have 4 interval ids and
          var intervalIds = server.intervalIds.filter(function(x) {
            return x.__host !== undefined;
          });

          expect(intervalIds).to.have.length(4);
          var hosts = intervalIds.map(function(x) {
            return x.__host;
          });

          expect(hosts.indexOf('localhost:32000')).to.not.equal(-1);
          expect(hosts.indexOf('localhost:32001')).to.not.equal(-1);
          expect(hosts.indexOf('localhost:32002')).to.not.equal(-1);
          expect(hosts.indexOf('localhost:32003')).to.not.equal(-1);

          primaryServer.destroy();
          firstSecondaryServer.destroy();
          secondSecondaryServer.destroy();
          arbiterServer.destroy();
          server.destroy();
          running = false;

          setTimeout(function() {
            expect(Object.keys(Connection.connections())).to.have.length(0);
            Connection.disableConnectionAccounting();
            done();
          }, 3000);
        }, 6000);
      }, 3000);

      server.on('error', function() {});

      server.on('left', function(_type, _server) {
        if (_type === 'secondary' && _server.name === 'localhost:32003') {
          expect(server.s.replicaSetState.secondaries).to.have.length(1);
          expect(server.s.replicaSetState.secondaries[0].name).to.equal('localhost:32001');

          expect(server.s.replicaSetState.arbiters).to.have.length(1);
          expect(server.s.replicaSetState.arbiters[0].name).to.equal('localhost:32002');

          expect(server.s.replicaSetState.primary).to.not.be.null;
          expect(server.s.replicaSetState.primary.name).to.equal('localhost:32000');
          // Flip the ismaster message
          currentIsMasterIndex = currentIsMasterIndex + 1;
          // global.debug=true
        }
      });

      server.on('connect', function() {
        server.__connected = true;
      });

      // Gives proxies a chance to boot up
      setTimeout(function() {
        server.connect();
      }, 100);
    }
  });

  it('Successfully add a new secondary server to the set and ensure ha Monitoring happens', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function(done) {
      var ReplSet = this.configuration.mongo.ReplSet,
        ObjectId = this.configuration.mongo.BSON.ObjectId;

      // Contain mock server
      var primaryServer = null;
      var firstSecondaryServer = null;
      var secondSecondaryServer = null;
      var arbiterServer = null;
      var running = true;
      var currentIsMasterIndex = 0;

      // Default message fields
      var defaultFields = {
        setName: 'rs',
        setVersion: 1,
        electionId: new ObjectId(),
        maxBsonObjectSize: 16777216,
        maxMessageSizeBytes: 48000000,
        maxWriteBatchSize: 1000,
        localTime: new Date(),
        maxWireVersion: 4,
        minWireVersion: 0,
        ok: 1,
        hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002'],
        arbiters: ['localhost:32002']
      };

      // Primary server states
      var primary = [
        assign({}, defaultFields, {
          ismaster: true,
          secondary: false,
          me: 'localhost:32000',
          primary: 'localhost:32000',
          tags: { loc: 'ny' }
        }),
        assign({}, defaultFields, {
          ismaster: true,
          secondary: false,
          me: 'localhost:32000',
          primary: 'localhost:32000',
          tags: { loc: 'ny' },
          hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002', 'localhost:32003'],
          setVersion: 2
        })
      ];

      // Primary server states
      var firstSecondary = [
        assign({}, defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32001',
          primary: 'localhost:32000',
          tags: { loc: 'sf' }
        }),
        assign({}, defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32001',
          primary: 'localhost:32000',
          tags: { loc: 'sf' },
          hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002', 'localhost:32003'],
          setVersion: 2
        })
      ];

      // Primary server states
      var secondSecondary = [
        assign({}, defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32003',
          primary: 'localhost:32000',
          tags: { loc: 'sf' },
          hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002', 'localhost:32003'],
          setVersion: 2
        })
      ];

      // Primary server states
      var arbiter = [
        assign({}, defaultFields, {
          ismaster: false,
          secondary: false,
          arbiterOnly: true,
          me: 'localhost:32002',
          primary: 'localhost:32000'
        }),
        assign({}, defaultFields, {
          ismaster: false,
          secondary: false,
          arbiterOnly: true,
          me: 'localhost:32002',
          primary: 'localhost:32000',
          hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002', 'localhost:32003'],
          setVersion: 2
        })
      ];

      // Boot the mock
      co(function*() {
        primaryServer = yield mockupdb.createServer(32000, 'localhost');
        firstSecondaryServer = yield mockupdb.createServer(32001, 'localhost');
        secondSecondaryServer = yield mockupdb.createServer(32003, 'localhost');
        arbiterServer = yield mockupdb.createServer(32002, 'localhost');

        // Primary state machine
        co(function*() {
          while (running) {
            var request = yield primaryServer.receive();
            var doc = request.document;

            if (doc.ismaster) {
              request.reply(primary[currentIsMasterIndex]);
            }
          }
        }).catch(function() {
          // console.log(err.stack);
        });

        // First secondary state machine
        co(function*() {
          while (running) {
            var request = yield firstSecondaryServer.receive();
            var doc = request.document;

            if (doc.ismaster) {
              request.reply(firstSecondary[currentIsMasterIndex]);
            }
          }
        }).catch(function() {
          // console.log(err.stack);
        });

        // Second secondary state machine
        co(function*() {
          while (running) {
            var request = yield secondSecondaryServer.receive();
            var doc = request.document;

            if (doc.ismaster) {
              request.reply(secondSecondary[0]);
            }
          }
        }).catch(function() {
          // console.log(err.stack);
        });

        // Arbiter state machine
        co(function*() {
          while (running) {
            var request = yield arbiterServer.receive();
            var doc = request.document;

            if (doc.ismaster) {
              request.reply(arbiter[currentIsMasterIndex]);
            }
          }
        }).catch(function() {
          // console.log(err.stack);
        });
      });

      Connection.enableConnectionAccounting();
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

      var secondaries = {};
      var arbiters = {};
      var allservers = {};

      server.on('serverHeartbeatStarted', function(description) {
        allservers[description.connectionId] = true;
        if (allservers['localhost:32003']) {
          // Finish up the test
          running = false;
          primaryServer.destroy();
          firstSecondaryServer.destroy();
          secondSecondaryServer.destroy();
          arbiterServer.destroy();
          server.destroy();

          setTimeout(function() {
            expect(Object.keys(Connection.connections())).to.have.length(0);
            Connection.disableConnectionAccounting();
            done();
          }, 3000);
        }
      });

      server.on('joined', function(_type, _server) {
        if (_type === 'arbiter') {
          arbiters[_server.name] = _server;
          // Flip the ismaster message
          currentIsMasterIndex = currentIsMasterIndex + 1;
        } else if (_type === 'secondary') {
          // expect(server.__connected).to.be.true;
          secondaries[_server.name] = _server;
          if (Object.keys(secondaries).length === 2) {
            expect(secondaries['localhost:32001']).to.not.be.null;
            expect(secondaries['localhost:32003']).to.not.be.null;
            expect(arbiters['localhost:32002']).to.not.be.null;
          }
        }
      });

      server.on('error', function() {});
      server.on('connect', function() {
        server.__connected = true;
      });

      // Gives proxies a chance to boot up
      setTimeout(function() {
        server.connect();
      }, 100);
    }
  });
});
