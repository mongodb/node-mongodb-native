'use strict';

var expect = require('chai').expect,
  f = require('util').format,
  Connection = require('../../../lib/connection/connection'),
  ReplSet = require('../../../lib/topologies/replset');

var restartAndDone = function(configuration, done) {
  configuration.manager.restart(9, { waitMS: 2000 }).then(function() {
    done();
  });
};

describe.skip('A replica set', function() {
  this.timeout(0);

  it('Discover arbiters', {
    metadata: { requires: { topology: 'replicaset' } },

    test: function(done) {
      this.timeout(0);
      var self = this;
      var manager = this.configuration.manager;

      // Get the primary server
      manager.primary().then(function(_manager) {
        // Enable connections accounting
        Connection.enableConnectionAccounting();
        // Attempt to connect
        try {
          var server = new ReplSet(
            [
              {
                host: _manager.host,
                port: _manager.port
              }
            ],
            {
              setName: self.configuration.setName
            }
          );
        } catch (err) {
          console.log(err);
          done();
        }

        server.on('joined', function(_type) {
          if (_type === 'arbiter') {
            server.destroy();

            setTimeout(function() {
              expect(Object.keys(Connection.connections()).length).to.equal(0);
              Connection.disableConnectionAccounting();
              done();
            }, 2000);
          }
        });

        // Start connection
        server.connect();
      });
    }
  });

  it('Discover passives', {
    metadata: { requires: { topology: 'replicaset' } },

    test: function(done) {
      var self = this;
      var manager = this.configuration.manager;

      // Get the primary server
      manager.primary().then(function(_manager) {
        // Enable connections accounting
        Connection.enableConnectionAccounting();
        // Attempt to connect
        var server = new ReplSet(
          [
            {
              host: _manager.host,
              port: _manager.port
            }
          ],
          {
            setName: self.configuration.setName
          }
        );

        server.on('joined', function(_type, _server) {
          if (_type === 'secondary' && _server.lastIsMaster().passive) {
            server.destroy();

            setTimeout(function() {
              expect(Object.keys(Connection.connections()).length).to.equal(0);
              Connection.disableConnectionAccounting();
              done();
            }, 1000);
          }
        });

        // Start connection
        server.connect();
      });
    }
  });

  it('Discover primary', {
    metadata: { requires: { topology: 'replicaset' } },

    test: function(done) {
      var self = this;
      var manager = this.configuration.manager;

      // Get the primary server
      manager.primary().then(function(_manager) {
        // Enable connections accounting
        Connection.enableConnectionAccounting();
        // Attempt to connect
        var server = new ReplSet(
          [
            {
              host: _manager.host,
              port: _manager.port
            }
          ],
          {
            setName: self.configuration.setName
          }
        );

        server.on('joined', function(_type) {
          if (_type === 'primary') {
            server.destroy();

            setTimeout(function() {
              expect(Object.keys(Connection.connections()).length).to.equal(0);
              Connection.disableConnectionAccounting();
              done();
            }, 1000);
          }
        });

        // Start connection
        server.connect();
      });
    }
  });

  it('Discover secondaries', {
    metadata: { requires: { topology: 'replicaset' } },

    test: function(done) {
      var self = this;
      var manager = this.configuration.manager;

      // Get the primary server
      manager.primary().then(function(_manager) {
        // Enable connections accounting
        Connection.enableConnectionAccounting();
        // Attempt to connect
        var server = new ReplSet(
          [
            {
              host: _manager.host,
              port: _manager.port
            }
          ],
          {
            setName: self.configuration.setName
          }
        );

        var count = 0;
        server.on('joined', function(_type) {
          if (_type === 'secondary') count = count + 1;
          if (count === 2) {
            server.destroy();

            setTimeout(function() {
              expect(Object.keys(Connection.connections()).length).to.equal(0);
              Connection.disableConnectionAccounting();
              done();
            }, 1000);
          }
        });

        // Start connection
        server.connect();
      });
    }
  });

  it('Replica set discovery', {
    metadata: { requires: { topology: 'replicaset' } },

    test: function(done) {
      var self = this;
      var manager = this.configuration.manager;

      // State
      var state = { primary: 1, secondary: 2, arbiter: 1, passive: 1 };
      // Get the primary server
      manager.primary().then(function(_manager) {
        // Enable connections accounting
        Connection.enableConnectionAccounting();
        // Attempt to connect
        var server = new ReplSet(
          [
            {
              host: _manager.host,
              port: _manager.port
            }
          ],
          {
            setName: self.configuration.setName
          }
        );

        server.on('joined', function(_type, _server) {
          if (_type === 'secondary' && _server.lastIsMaster().passive) {
            state.passive = state.passive - 1;
          } else {
            state[_type] = state[_type] - 1;
          }

          if (
            state.primary === 0 &&
            state.secondary === 0 &&
            state.arbiter === 0 &&
            state.passive === 0
          ) {
            server.destroy();

            setTimeout(function() {
              expect(Object.keys(Connection.connections()).length).to.equal(0);
              Connection.disableConnectionAccounting();
              done();
            }, 1000);
          }
        });

        // Start connection
        server.connect();
      });
    }
  });

  it('Host list differs from seeds', {
    metadata: {
      requires: {
        topology: 'replicaset'
      }
    },

    test: function(done) {
      var self = this;
      var manager = this.configuration.manager;

      // State
      var state = { primary: 1, secondary: 2, arbiter: 1, passive: 1 };
      // Get the primary server
      manager.primary().then(function(_manager) {
        Connection.enableConnectionAccounting();
        // Attempt to connect
        var server = new ReplSet(
          [
            {
              host: _manager.host,
              port: _manager.port
            },
            {
              host: 'localhost',
              port: 41000
            }
          ],
          {
            setName: self.configuration.setName
          }
        );

        server.on('joined', function(_type, _server) {
          // console.log('======= joined :: ' + _type + ' :: ' + _server.name)
          if (_type === 'secondary' && _server.lastIsMaster().passive) {
            state.passive = state.passive - 1;
          } else {
            state[_type] = state[_type] - 1;
          }

          // console.dir(state)

          if (
            state.primary === 0 &&
            state.secondary === 0 &&
            state.arbiter === 0 &&
            state.passive === 0
          ) {
            server.destroy();

            setTimeout(function() {
              expect(Object.keys(Connection.connections()).length).to.equal(0);
              Connection.disableConnectionAccounting();
              done();
            }, 1000);
          }
        });

        // Start connection
        server.connect();
      });
    }
  });

  it('Ghost discovered/Member brought up as standalone', {
    metadata: {
      requires: {
        topology: 'replicaset'
      }
    },

    test: function(done) {
      var self = this;
      var ServerManager = require('mongodb-topology-manager').Server,
        manager = this.configuration.manager;

      // State
      var state = { primary: 1, secondary: 1, arbiter: 1, passive: 1 };
      // Get the primary server
      manager.primary().then(function(primaryManager) {
        // Get the secondary server
        manager.secondaries().then(function(managers) {
          var serverManager = managers[0];

          // Stop the secondary
          serverManager.stop().then(function() {
            // Start a new server manager
            var nonReplSetMember = new ServerManager('mongod', {
              bind_ip: serverManager.host,
              port: serverManager.port,
              dbpath: serverManager.options.dbpath
            });

            // Start a non replset member
            nonReplSetMember.start().then(function() {
              // console.log('------------------------ 4')
              var config = [
                {
                  host: primaryManager.host,
                  port: primaryManager.port
                }
              ];

              var options = {
                setName: self.configuration.setName
              };

              // Wait for primary
              manager.waitForPrimary().then(function() {
                // Enable connections accounting
                Connection.enableConnectionAccounting();
                // Attempt to connect
                var replset = new ReplSet(config, options);
                replset.on('joined', function(_type, _server) {
                  if (_type === 'secondary' && _server.lastIsMaster().passive) {
                    state.passive = state.passive - 1;
                  } else {
                    state[_type] = state[_type] - 1;
                  }
                  // console.dir(state)

                  if (
                    state.primary === 0 &&
                    state.secondary === 0 &&
                    state.arbiter === 0 &&
                    state.passive === 0
                  ) {
                    replset.destroy();
                    setTimeout(function() {
                      expect(Object.keys(Connection.connections()).length).to.equal(0);
                      Connection.disableConnectionAccounting();

                      // Stop the normal server
                      nonReplSetMember.stop().then(function() {
                        // Restart the secondary server
                        serverManager.start().then(function() {
                          restartAndDone(self.configuration, done);
                        });
                      });
                    }, 1000);
                  }
                });

                // Start connection
                replset.connect();
              });
            });
          });
        });
      });
    }
  });

  // ../spec/server-discovery-and-monitoring/rs/member_reconfig.json
  it('Member removed by reconfig', {
    metadata: {
      requires: {
        topology: 'replicaset'
      }
    },

    test: function(done) {
      var self = this;
      var manager = this.configuration.manager;

      // Get the primary server
      manager.primary().then(function(primaryServerManager) {
        // Get the secondary server
        manager.secondaries().then(function(managers) {
          var secondaryServerManager = managers[0];

          var config = [
            {
              host: primaryServerManager.host,
              port: primaryServerManager.port
            }
          ];

          var options = {
            setName: self.configuration.setName
          };

          // console.log('============================= 3')
          // Enable connections accounting
          Connection.enableConnectionAccounting();
          // console.log('============================= 4')
          // Attempt to connect
          var server = new ReplSet(config, options);
          server.on('fullsetup', function() {
            // console.log('------------------------------------------ 0')
            // Save number of secondaries
            var numberOfSecondaries = server.s.replicaSetState.secondaries.length;

            // Let's listen to changes
            server.on('left', function(_t, _server) {
              if (_server.s.options.port === secondaryServerManager.options.port) {
                expect(server.s.replicaSetState.primary).to.not.be.null;
                expect(server.s.replicaSetState.secondaries.length).to.be.below(
                  numberOfSecondaries
                );
                expect(server.s.replicaSetState.arbiters.length).to.equal(1);
                server.destroy();

                setTimeout(function() {
                  // console.log('=================== 0')
                  // console.dir(Object.keys(Connection.connections()))
                  expect(Object.keys(Connection.connections()).length).to.equal(0);
                  // console.log('=================== 1')
                  Connection.disableConnectionAccounting();
                  restartAndDone(self.configuration, done);
                }, 5000);
              }
            });

            // Remove the secondary server
            manager.removeMember(secondaryServerManager, {
              returnImmediately: false,
              force: false,
              skipWait: true
            });
          });

          // Start connection
          server.connect();
        });
      });
    }
  });

  // ../spec/server-discovery-and-monitoring/rs/discovery.json
  it('Should not leak any connections after hammering the replicaset with a mix of operations', {
    metadata: { requires: { topology: 'replicaset' } },

    test: function(done) {
      var self = this;
      var Server = this.configuration.mongo.Server,
        ReadPreference = this.configuration.require.ReadPreference,
        manager = this.configuration.manager;

      // Get the primary server
      manager.primary().then(function(_manager) {
        // Enable connections accounting
        Connection.enableConnectionAccounting();
        Server.enableServerAccounting();
        // Attempt to connect
        var server = new ReplSet(
          [
            {
              host: _manager.host,
              port: _manager.port
            }
          ],
          {
            setName: self.configuration.setName
          }
        );

        var donecount = 0;

        function onDone() {
          donecount = donecount + 1;

          if (donecount === 2) {
            server.destroy();

            Connection.disableConnectionAccounting();
            Server.disableServerAccounting();

            setTimeout(function() {
              expect(Object.keys(Connection.connections()).length).to.equal(0);
              expect(Object.keys(Server.servers()).length).to.equal(0);
              done();
            }, 5000);
          }
        }

        server.on('connect', function(_server) {
          var insertcount = 10000;
          var querycount = 10000;

          var insertCountDecrement = function() {
            insertcount = insertcount - 1;

            if (insertcount === 0) {
              onDone();
            }
          };

          var queryCountDecrement = function() {
            querycount = querycount - 1;

            if (querycount === 0) {
              onDone();
            }
          };

          for (var i = 0; i < 10000; i++) {
            _server.insert(
              f('%s.inserts', self.configuration.db),
              [{ a: 1 }],
              {
                writeConcern: { w: 1 },
                ordered: true
              },
              insertCountDecrement
            );
          }

          for (var j = 0; j < 10000; j++) {
            // Execute find
            var cursor = _server.cursor(
              f('%s.inserts1', self.configuration.db),
              {
                find: f('%s.inserts1', self.configuration.db),
                query: {}
              },
              { readPreference: ReadPreference.secondary }
            );
            cursor.setCursorLimit(1);
            // Execute next
            cursor.next(queryCountDecrement);
          }
        });

        // Start connection
        server.connect();
      });
    }
  });
});
