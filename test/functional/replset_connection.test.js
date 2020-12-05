'use strict';
var f = require('util').format;
var test = require('./shared').assert;
const expect = require('chai').expect;
var setupDatabase = require('./shared').setupDatabase;

var restartAndDone = function(configuration, done) {
  var CoreServer = configuration.require.CoreServer,
    CoreConnection = configuration.require.CoreConnection;

  setTimeout(function() {
    // Connection account tests
    CoreServer.disableServerAccounting();
    CoreConnection.disableConnectionAccounting();

    configuration.manager.restart().then(function() {
      done();
    });
  }, 200);
};

// NOTE: skipped for dubious benefit over SDAM unit tests, as well as the disruptive nature
//       of starting and stopping the topology. Look into coverage benefits in the future.
describe.skip('ReplSet (Connection)', function() {
  before(function() {
    var configuration = this.configuration;
    return setupDatabase(configuration).then(function() {
      return configuration.manager.restart();
    });
  });

  it('Should throw error due to mongos connection usage', {
    metadata: { requires: { topology: 'replicaset' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var ReplSet = configuration.require.ReplSet,
        Server = configuration.require.Server,
        Mongos = configuration.require.Mongos;

      try {
        new ReplSet(
          [
            new Server('localhost', 28390),
            new Server('localhost', 28391),
            new Mongos([new Server('localhost', 28392)])
          ],
          { rs_name: configuration.replicasetName }
        );
      } catch (err) {
        done();
      }
    }
  });

  it('Should correctly handle error when no server up in replicaset', {
    metadata: { requires: { topology: 'replicaset' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var CoreServer = configuration.require.CoreServer,
        CoreConnection = configuration.require.CoreConnection;

      // Accounting tests
      CoreServer.enableServerAccounting();
      CoreConnection.enableConnectionAccounting();

      var client = configuration.newClient(
        'mongodb://localhost:28390,localhost:28391,localhost:28392/test?replicaSet=rs',
        { w: 0 }
      );
      client.connect(function(err) {
        test.ok(err != null);

        setTimeout(function() {
          // Connection account tests
          test.equal(0, Object.keys(CoreConnection.connections()).length);
          test.equal(0, Object.keys(CoreServer.servers()).length);
          CoreServer.disableServerAccounting();
          CoreConnection.disableConnectionAccounting();

          done();
        }, 200);
      });
    }
  });

  it('Should correctly connect with default replicaset', {
    metadata: { requires: { topology: 'replicaset' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var CoreServer = configuration.require.CoreServer,
        CoreConnection = configuration.require.CoreConnection;

      // Replset start port
      configuration.manager.secondaries().then(function(managers) {
        managers[0].stop().then(function() {
          // Accounting tests
          CoreServer.enableServerAccounting();
          CoreConnection.enableConnectionAccounting();

          const client = configuration.newClient({}, { w: 0 });
          client.connect(function(err, client) {
            test.equal(null, err);
            client.close();

            setTimeout(function() {
              restartAndDone(configuration, done);
            }, 1000);
          });
        });
      });
    }
  });

  it('Should correctly connect with default replicaset and no setName specified', {
    metadata: { requires: { topology: 'replicaset' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var CoreServer = configuration.require.CoreServer,
        CoreConnection = configuration.require.CoreConnection;

      // Replset start port
      configuration.manager.secondaries().then(function(managers) {
        managers[0].stop().then(function() {
          // Accounting tests
          CoreServer.enableServerAccounting();
          CoreConnection.enableConnectionAccounting();

          const client = configuration.newClient({}, { w: 0 });
          client.connect(function(err, client) {
            test.equal(null, err);
            client.close();

            restartAndDone(configuration, done);
          });
        });
      });
    }
  });

  it('Should correctly connect with default replicaset and socket options set', {
    metadata: { requires: { topology: 'replicaset' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var CoreServer = configuration.require.CoreServer,
        CoreConnection = configuration.require.CoreConnection;

      // Accounting tests
      CoreServer.enableServerAccounting();
      CoreConnection.enableConnectionAccounting();
      const client = configuration.newClient(
        {},
        { w: 0, keepAlive: true, keepAliveInitialDelay: 100 }
      );

      client.connect(function(err, client) {
        test.equal(null, err);
        // Get a connection
        var connection = client.topology.connections()[0];
        test.equal(100, connection.keepAliveInitialDelay);
        client.close();

        done();
      });
    }
  });

  it('Should emit close no callback', {
    metadata: { requires: { topology: 'replicaset' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var CoreServer = configuration.require.CoreServer,
        CoreConnection = configuration.require.CoreConnection;

      // Accounting tests
      CoreServer.enableServerAccounting();
      CoreConnection.enableConnectionAccounting();

      const client = configuration.newClient({}, { w: 0 });
      client.connect(function(err, client) {
        test.equal(null, err);
        var dbCloseCount = 0;
        client.on('close', function() {
          ++dbCloseCount;
        });

        // Force a close on a socket
        client.close();

        setTimeout(function() {
          // Connection account tests
          test.equal(0, Object.keys(CoreConnection.connections()).length);
          test.equal(0, Object.keys(CoreServer.servers()).length);
          CoreServer.disableServerAccounting();
          CoreConnection.disableConnectionAccounting();

          test.equal(dbCloseCount, 1);
          done();
        }, 200);
      });
    }
  });

  it('Should emit close with callback', {
    metadata: { requires: { topology: 'replicaset' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var CoreServer = configuration.require.CoreServer,
        CoreConnection = configuration.require.CoreConnection;

      // Accounting tests
      CoreServer.enableServerAccounting();
      CoreConnection.enableConnectionAccounting();

      const client = configuration.newClient({}, { w: 0 });
      client.connect(function(err, client) {
        test.equal(null, err);
        var dbCloseCount = 0;
        client.on('close', function() {
          ++dbCloseCount;
        });

        client.close(function() {
          // Let all events fire.
          setTimeout(function() {
            // Connection account tests
            test.equal(0, Object.keys(CoreConnection.connections()).length);
            test.equal(0, Object.keys(CoreServer.servers()).length);
            CoreServer.disableServerAccounting();
            CoreConnection.disableConnectionAccounting();

            test.equal(dbCloseCount, 1);
            done();
          }, 200);
        });
      });
    }
  });

  it('Should correctly pass error when wrong replicaSet', {
    metadata: { requires: { topology: 'replicaset' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      const client = configuration.newClient({}, { rs_name: 'wrong' });
      client.connect(function(err) {
        test.notEqual(null, err);
        done();
      });
    }
  });

  var retries = 120;
  var ensureConnection = function(configuration, numberOfTries, callback) {
    if (numberOfTries <= 0) {
      return callback(new Error('could not connect correctly'), null);
    }

    // Open the db
    const client = configuration.newClient({}, { w: 0, connectTimeoutMS: 1000 });
    client.connect(function(err, client) {
      if (err != null) {
        // Wait for a sec and retry
        setTimeout(function() {
          numberOfTries = numberOfTries - 1;
          ensureConnection(configuration, numberOfTries, callback);
        }, 3000);
      } else {
        client.close();
        return callback(null);
      }
    });
  };

  it('Should connect with primary stepped down', {
    metadata: { requires: { topology: 'replicaset' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var CoreServer = configuration.require.CoreServer,
        CoreConnection = configuration.require.CoreConnection;

      // Accounting tests
      CoreServer.enableServerAccounting();
      CoreConnection.enableConnectionAccounting();

      // // Step down primary server
      configuration.manager
        .stepDownPrimary(false, { stepDownSecs: 1, force: true })
        .then(function() {
          // Wait for new primary to pop up
          ensureConnection(configuration, retries, function(err) {
            test.equal(null, err);

            const client = configuration.newClient({}, { w: 0 });
            client.connect(function(err, client) {
              test.ok(err == null);
              // Get a connection
              var connection = client.topology.connections()[0];
              test.equal(true, connection.isConnected());
              // Close the database
              client.close();

              restartAndDone(configuration, done);
            });
          });
        });
    }
  });

  it('Should connect with third node killed', {
    metadata: { requires: { topology: 'replicaset' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var CoreServer = configuration.require.CoreServer,
        CoreConnection = configuration.require.CoreConnection;

      // Replset start port
      configuration.manager.secondaries().then(function(managers) {
        managers[0].stop().then(function() {
          // Accounting tests
          CoreServer.enableServerAccounting();
          CoreConnection.enableConnectionAccounting();

          // Wait for new primary to pop up
          ensureConnection(configuration, retries, function(err) {
            test.equal(null, err);

            const client = configuration.newClient({}, { w: 0 });
            client.connect(function(err, client) {
              test.ok(err == null);
              // Get a connection
              var connection = client.topology.connections()[0];
              test.equal(true, connection.isConnected());
              // Close the database
              client.close();

              restartAndDone(configuration, done);
            });
          });
        });
      });
    }
  });

  it('Should connect with primary node killed', {
    metadata: { requires: { topology: 'replicaset' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var CoreServer = configuration.require.CoreServer,
        CoreConnection = configuration.require.CoreConnection;

      // Replset start port
      configuration.manager.primary().then(function(primary) {
        primary.stop().then(function() {
          // Accounting tests
          CoreServer.enableServerAccounting();
          CoreConnection.enableConnectionAccounting();

          // Wait for new primary to pop up
          ensureConnection(configuration, retries, function(err) {
            test.equal(null, err);

            const client = configuration.newClient({}, { w: 0 });
            client.connect(function(err, client) {
              test.ok(err == null);
              // Get a connection
              var connection = client.topology.connections()[0];
              test.equal(true, connection.isConnected());
              // Close the database
              client.close();

              restartAndDone(configuration, done);
            });
          });
        });
      });
    }
  });

  it('Should correctly emit open signal and full set signal', {
    metadata: { requires: { topology: 'replicaset' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var CoreServer = configuration.require.CoreServer,
        CoreConnection = configuration.require.CoreConnection;

      var openCalled = false;
      // Accounting tests
      CoreServer.enableServerAccounting();
      CoreConnection.enableConnectionAccounting();

      const client = configuration.newClient({}, { w: 0 });
      client.once('open', function(_err) {
        test.equal(null, _err);
        openCalled = true;
      });

      client.once('fullsetup', function(client) {
        test.equal(true, openCalled);

        // Close and cleanup
        client.close();

        setTimeout(function() {
          // Connection account tests
          test.equal(0, Object.keys(CoreConnection.connections()).length);
          test.equal(0, Object.keys(CoreServer.servers()).length);
          CoreServer.disableServerAccounting();
          CoreConnection.disableConnectionAccounting();

          done();
        }, 200);
      });

      client.connect(function(err) {
        test.equal(null, err);
      });
    }
  });

  it('ReplSet honors socketOptions options', {
    metadata: { requires: { topology: 'replicaset' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var CoreServer = configuration.require.CoreServer,
        CoreConnection = configuration.require.CoreConnection;

      // Accounting tests
      CoreServer.enableServerAccounting();
      CoreConnection.enableConnectionAccounting();

      const client = configuration.newClient(
        {},
        {
          w: 0,
          connectTimeoutMS: 1000,
          socketTimeoutMS: 3000,
          noDelay: false
        }
      );

      client.connect(function(err, client) {
        test.equal(null, err);
        // Get a connection
        var connection = client.topology.connections()[0];
        test.equal(1000, connection.connectionTimeout);
        test.equal(3000, connection.socketTimeout);
        test.equal(false, connection.noDelay);
        client.close();

        setTimeout(function() {
          // Connection account tests
          test.equal(0, Object.keys(CoreConnection.connections()).length);
          test.equal(0, Object.keys(CoreServer.servers()).length);
          CoreServer.disableServerAccounting();
          CoreConnection.disableConnectionAccounting();

          done();
        }, 200);
      });
    }
  });

  it('Should receive all events for primary and secondary leaving', {
    metadata: { requires: { topology: 'replicaset' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var CoreServer = configuration.require.CoreServer,
        CoreConnection = configuration.require.CoreConnection;

      // Accounting tests
      CoreServer.enableServerAccounting();
      CoreConnection.enableConnectionAccounting();

      // Connect to the replicaset
      const client = configuration.newClient({}, { w: 0 });
      client.connect(function(err, client) {
        // Kill the secondary
        // Replset start port
        configuration.manager.secondaries().then(function(managers) {
          managers[0].stop().then(function() {
            test.equal(null, err);
            client.close();

            restartAndDone(configuration, done);
          });
        });
      });
    }
  });

  it('Should Fail due to bufferMaxEntries = 0 not causing any buffering', {
    metadata: { requires: { topology: 'replicaset' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var CoreServer = configuration.require.CoreServer,
        CoreConnection = configuration.require.CoreConnection;

      // Accounting tests
      CoreServer.enableServerAccounting();
      CoreConnection.enableConnectionAccounting();

      // Connect to the replicaset
      const client = configuration.newClient({}, { w: 1, bufferMaxEntries: 0 });
      client.connect(function(err, client) {
        var db = client.db(configuration.db);

        // Setup
        client.topology.on('left', function(t) {
          if (t === 'primary') {
            // Attempt an insert
            db.collection('_should_fail_due_to_bufferMaxEntries_0').insert({ a: 1 }, function(err) {
              test.ok(err != null);
              test.ok(err.message.indexOf('0') !== -1);
              client.close();

              restartAndDone(configuration, done);
            });
          }
        });

        // Kill the secondary
        // Replset start port
        configuration.manager.primary().then(function(primary) {
          primary.stop().then(function() {
            test.equal(null, err);
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('Should correctly connect to a replicaset with additional options', {
    metadata: { requires: { topology: 'replicaset' } },

    // The actual test we wish to run
    test: function(done) {
      const configuration = this.configuration;
      const CoreServer = configuration.require.CoreServer;
      const CoreConnection = configuration.require.CoreConnection;

      var url = f(
        'mongodb://localhost:%s,localhost:%s,localhost:%s/integration_test_?replicaSet=%s',
        configuration.port,
        configuration.port + 1,
        configuration.port + 2,
        configuration.replicasetName
      );

      // Accounting tests
      CoreServer.enableServerAccounting();
      CoreConnection.enableConnectionAccounting();

      const client = configuration.newClient(url, {
        replSet: {
          haInterval: 500,
          socketOptions: {
            connectTimeoutMS: 500
          }
        }
      });

      client.connect(function(err, client) {
        test.equal(null, err);
        var db = client.db(configuration.db);

        test.equal(500, client.topology.connections()[0].connectionTimeout);
        expect(client.topology.connections()[0].socketTimeout).to.equal(0);

        db.collection('replicaset_mongo_client_collection').update(
          { a: 1 },
          { b: 1 },
          { upsert: true },
          function(err, result) {
            test.equal(null, err);
            test.equal(1, result.result.n);

            client.close();

            setTimeout(function() {
              // Connection account tests
              test.equal(0, Object.keys(CoreConnection.connections()).length);
              test.equal(0, Object.keys(CoreServer.servers()).length);
              CoreServer.disableServerAccounting();
              CoreConnection.disableConnectionAccounting();

              done();
            }, 200);
          }
        );
      });
    }
  });

  /**
   * @ignore
   */
  it('Should correctly connect to a replicaset with readPreference set', {
    metadata: { requires: { topology: 'replicaset' } },

    // The actual test we wish to run
    test: function(done) {
      const configuration = this.configuration;
      const CoreServer = configuration.require.CoreServer;
      const CoreConnection = configuration.require.CoreConnection;

      // Create url
      var url = f(
        'mongodb://%s,%s/%s?replicaSet=%s&readPreference=%s',
        f('%s:%s', configuration.host, configuration.port),
        f('%s:%s', configuration.host, configuration.port + 1),
        'integration_test_',
        configuration.replicasetName,
        'primary'
      );

      // Accounting tests
      CoreServer.enableServerAccounting();
      CoreConnection.enableConnectionAccounting();

      const client = configuration.newClient(url);
      client.connect(function(err, client) {
        var db = client.db(configuration.db);

        db.collection('test_collection').insert({ a: 1 }, function(err) {
          test.equal(null, err);

          client.close();

          setTimeout(function() {
            // Connection account tests
            test.equal(0, Object.keys(CoreConnection.connections()).length);
            test.equal(0, Object.keys(CoreServer.servers()).length);
            CoreServer.disableServerAccounting();
            CoreConnection.disableConnectionAccounting();

            done();
          }, 200);
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('Should give an error for non-existing servers', {
    metadata: { requires: { topology: 'replicaset' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var url = f(
        'mongodb://%s,%s/%s?replicaSet=%s&readPreference=%s',
        'nolocalhost:30000',
        'nolocalhost:30001',
        'integration_test_',
        configuration.replicasetName,
        'primary'
      );

      const client = configuration.newClient(url);
      client.connect(function(err) {
        test.ok(err != null);
        done();
      });
    }
  });

  /**
   * @ignore
   */
  it(
    'Should correctly connect to a replicaset with writeConcern specified and GridStore should inherit correctly',
    {
      metadata: { requires: { topology: 'replicaset' } },

      // The actual test we wish to run
      test: function(done) {
        var configuration = this.configuration;
        var mongo = configuration.require,
          GridStore = mongo.GridStore,
          ObjectID = mongo.ObjectID,
          CoreServer = configuration.require.CoreServer,
          CoreConnection = configuration.require.CoreConnection;

        // Create url
        var url = f(
          'mongodb://%s,%s/%s?replicaSet=%s&w=%s&wtimeoutMS=5000',
          f('%s:%s', configuration.host, configuration.port),
          f('%s:%s', configuration.host, configuration.port + 1),
          'integration_test_',
          configuration.replicasetName,
          'majority'
        );

        // Accounting tests
        CoreServer.enableServerAccounting();
        CoreConnection.enableConnectionAccounting();

        const client = configuration.newClient(url);
        client.connect(function(err, client) {
          var db = client.db(configuration.db);
          var gs = new GridStore(db, new ObjectID());
          test.equal('majority', gs.writeConcern.w);
          test.equal(5000, gs.writeConcern.wtimeout);
          client.close();

          setTimeout(function() {
            // Connection account tests
            test.equal(0, Object.keys(CoreConnection.connections()).length);
            test.equal(0, Object.keys(CoreServer.servers()).length);
            CoreServer.disableServerAccounting();
            CoreConnection.disableConnectionAccounting();

            done();
          }, 200);
        });
      }
    }
  );

  /**
   * @ignore
   */
  it('Should Correctly remove server going into recovery mode', {
    metadata: { requires: { topology: 'replicaset' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var CoreServer = configuration.require.CoreServer,
        CoreConnection = configuration.require.CoreConnection;

      // Accounting tests
      CoreServer.enableServerAccounting();
      CoreConnection.enableConnectionAccounting();

      // Open the db connection
      const client = configuration.newClient({}, { w: 1, socketTimeoutMS: 5000 });
      client.on('fullsetup', function(client) {
        var db = client.db(configuration.db);
        db.command({ ismaster: true }, function(err, result) {
          // Filter out the secondaries
          var secondaries = [];
          result.hosts.forEach(function(s) {
            if (result.primary !== s && result.arbiters.indexOf(s) === -1) secondaries.push(s);
          });

          // Get the arbiters
          var host = secondaries[0].split(':')[0];
          var port = parseInt(secondaries[0].split(':')[1], 10);
          var client1 = configuration.newClient({}, { host, port, w: 1 });
          var finished = false;

          client.topology.on('left', function(t) {
            if (t === 'primary' && !finished) {
              finished = true;
              // Return to working state
              client1.db('admin').command({ replSetMaintenance: 0 }, function(err) {
                test.equal(null, err);
                client.close();
                client1.close();

                setTimeout(function() {
                  setTimeout(function() {
                    // Connection account tests
                    test.equal(0, Object.keys(CoreConnection.connections()).length);
                    test.equal(0, Object.keys(CoreServer.servers()).length);
                    CoreServer.disableServerAccounting();
                    CoreConnection.disableConnectionAccounting();

                    done();
                  }, 1000);
                }, 10000);
              });
            }
          });

          client1.connect(function(err, client1) {
            var db1 = client1.db(configuration.db);
            test.equal(null, err);
            global.debug = true;

            db1.admin().command({ replSetMaintenance: 1 }, function(err) {
              test.equal(null, err);
            });
          });
        });
      });

      client.connect(function(err) {
        test.equal(null, err);
      });
    }
  });

  /**
   * @ignore
   */
  it('Should return single server direct connection when replicaSet not provided', {
    metadata: { requires: { topology: 'replicaset' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var mongo = configuration.require,
        Server = mongo.Server,
        CoreServer = configuration.require.CoreServer,
        CoreConnection = configuration.require.CoreConnection;

      var url = f('mongodb://localhost:%s/%s', configuration.port, 'integration_test_');

      // Accounting tests
      CoreServer.enableServerAccounting();
      CoreConnection.enableConnectionAccounting();

      const client = configuration.newClient(url);
      client.connect(function(err, client) {
        test.equal(null, err);
        test.ok(client.topology instanceof Server);
        client.close();

        setTimeout(function() {
          // Connection account tests
          test.equal(0, Object.keys(CoreConnection.connections()).length);
          test.equal(0, Object.keys(CoreServer.servers()).length);
          CoreServer.disableServerAccounting();
          CoreConnection.disableConnectionAccounting();

          done();
        }, 200);
      });
    }
  });

  var waitForPrimary;
  waitForPrimary = function(count, config, options, callback) {
    var ReplSet = require('../../lib/core').ReplSet;
    if (count === 0) return callback(new Error('could not connect'));
    // Attempt to connect
    var server = new ReplSet(config, options);
    server.on('error', function(err) {
      test.equal(null, err);
      server.destroy();

      setTimeout(function() {
        waitForPrimary(count - 1, config, options, callback);
      }, 1000);
    });

    server.on('fullsetup', function() {
      server.destroy();
      callback();
    });

    // Start connection
    server.connect();
  };

  it('Should correctly connect to arbiter with single connection', {
    metadata: { requires: { topology: 'replicaset' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var CoreServer = configuration.require.CoreServer,
        CoreConnection = configuration.require.CoreConnection;

      // Replset start port
      configuration.manager.arbiters().then(function(managers) {
        // Accounting tests
        CoreServer.enableServerAccounting();
        CoreConnection.enableConnectionAccounting();

        // Get the arbiters
        var host = managers[0].host;
        var port = managers[0].port;

        var client = configuration.newClient({}, { host, port, w: 1 });
        client.connect(function(err, client) {
          var db = client.db(configuration.db);
          test.equal(null, err);

          db.command({ ismaster: true }, function(err) {
            test.equal(null, err);

            // Should fail
            db.collection('t').insert({ a: 1 }, function(err) {
              test.ok(err != null);
              client.close();
              restartAndDone(configuration, done);
            });
          });
        });
      });
    }
  });

  it('Should correctly connect to secondary with single connection', {
    metadata: { requires: { topology: 'replicaset' } },

    // The actual test we wish to run
    test: function(done) {
      var configuration = this.configuration;
      var CoreServer = configuration.require.CoreServer,
        CoreConnection = configuration.require.CoreConnection;

      configuration.manager.secondaries().then(function(managers) {
        // Accounting tests
        CoreServer.enableServerAccounting();
        CoreConnection.enableConnectionAccounting();

        // Get the arbiters
        var host = managers[0].host;
        var port = managers[0].port;

        var client = configuration.newClient({}, { host, port, w: 1 });
        client.connect(function(err, client) {
          var db = client.db(configuration.db);
          test.equal(null, err);

          db.command({ ismaster: true }, function(err) {
            test.equal(null, err);
            client.close();
            restartAndDone(configuration, done);
          });
        });
      });
    }
  });

  it('Replicaset connection where a server is standalone', {
    metadata: {
      requires: {
        topology: 'replicaset'
      }
    },

    test: function(done) {
      var configuration = this.configuration;
      var ReplSet = configuration.require.ReplSet,
        ServerManager = require('mongodb-topology-manager').Server,
        CoreServer = configuration.require.CoreServer,
        CoreConnection = configuration.require.CoreConnection;

      // Get the primary server
      configuration.manager.primary().then(function(primaryServerManager) {
        var nonReplSetMember = new ServerManager('mongod', {
          bind_ip: primaryServerManager.host,
          port: primaryServerManager.port,
          dbpath: primaryServerManager.options.dbpath
        });

        // Stop the primary
        primaryServerManager.stop().then(function(err) {
          test.equal(null, err);

          nonReplSetMember.purge().then(function() {
            // Start a non replset member
            nonReplSetMember.start().then(function() {
              configuration.manager.waitForPrimary().then(function() {
                var url = f(
                  'mongodb://localhost:%s,localhost:%s,localhost:%s/integration_test_?replicaSet=%s',
                  configuration.port,
                  configuration.port + 1,
                  configuration.port + 2,
                  configuration.replicasetName
                );

                // Accounting tests
                CoreServer.enableServerAccounting();
                CoreConnection.enableConnectionAccounting();

                // Attempt to connect using MongoClient uri
                const client = configuration.newClient(url);
                client.connect(function(err, client) {
                  test.equal(null, err);
                  test.ok(client.topology instanceof ReplSet);
                  client.close();

                  // Stop the normal server
                  nonReplSetMember.stop().then(function() {
                    restartAndDone(configuration, done);
                  });
                });
              });
            });
          });
        });
      });
    }
  });

  /**
   * @ignore
   */
  it('Should correctly modify the server reconnectTries for all replset instances', {
    metadata: { requires: { topology: 'replicaset' } },

    // The actual test we wish to run
    test: function(done) {
      const configuration = this.configuration;
      const CoreServer = configuration.require.CoreServer;
      const CoreConnection = configuration.require.CoreConnection;
      const url = f(
        'mongodb://localhost:%s,localhost:%s,localhost:%s/integration_test_?replicaSet=%s',
        configuration.port,
        configuration.port + 1,
        configuration.port + 2,
        configuration.replicasetName
      );

      // Accounting tests
      CoreServer.enableServerAccounting();
      CoreConnection.enableConnectionAccounting();

      const client = configuration.newClient(url, { reconnectTries: 10 });
      client.connect(function(err, client) {
        test.equal(null, err);

        var servers = client.topology.s.coreTopology.s.replicaSetState.allServers();
        for (var i = 0; i < servers.length; i++) {
          test.equal(10, servers[i].s.pool.options.reconnectTries);
        }

        // Destroy the pool
        client.close();

        setTimeout(function() {
          // Connection account tests
          test.equal(0, Object.keys(CoreConnection.connections()).length);
          test.equal(0, Object.keys(CoreServer.servers()).length);
          CoreServer.disableServerAccounting();
          CoreConnection.disableConnectionAccounting();

          done();
        }, 200);
      });
    }
  });

  /**
   * @ignore
   */
  it(
    'Should correctly connect to a replicaset with auth options, bufferMaxEntries and connectWithNoPrimary',
    {
      metadata: { requires: { topology: 'replicaset' } },

      // The actual test we wish to run
      test: function(done) {
        var configuration = this.configuration;
        var url = f(
          'mongodb://me:secret@localhost:%s,localhost:%s/integration_test_?replicaSet=%s',
          configuration.port + 1,
          configuration.port + 2,
          configuration.replicasetName
        );

        const client = configuration.newClient(url, {
          connectWithNoPrimary: true,
          bufferMaxEntries: 0
        });

        client.connect(function(err) {
          test.ok(err);
          test.ok(
            err.message.indexOf(
              'no connection available for operation and number of stored operation'
            ) === -1
          );
          done();
        });
      }
    }
  );
});
