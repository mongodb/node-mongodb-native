"use strict";

var f = require('util').format;

var restartAndDone = function(configuration, test) {
  var CoreServer = configuration.require.CoreServer
    , CoreConnection = configuration.require.CoreConnection;

  setTimeout(function() {
    // Connection account tests
    test.equal(0, Object.keys(CoreConnection.connections()).length);
    test.equal(0, Object.keys(CoreServer.servers()).length);
    CoreServer.disableServerAccounting();
    CoreConnection.disableConnectionAccounting();

    console.log("-- restartAndDone")
    configuration.manager.restart().then(function() {
      test.done();
    });
  }, 200);
}

exports.beforeTests = function(configuration, callback) {
  configuration.manager.restart().then(function() {
    callback();
  });
}

exports['Should throw error due to mongos connection usage'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var ReplSet = configuration.require.ReplSet
      , Server = configuration.require.Server
      , Mongos = configuration.require.Mongos
      , Db = configuration.require.Db;

    try {
      var replSet = new ReplSet([
          new Server('localhost', 28390),
          new Server('localhost', 28391),
          new Mongos([new Server('localhost', 28392)])
        ]
      , {rs_name:configuration.replicasetName}
      );
    } catch(err) {
      test.done();
    }
  }
}

exports['Should correctly handle error when no server up in replicaset'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var ReplSet = configuration.require.ReplSet
      , Server = configuration.require.Server
      , Db = configuration.require.Db
      , CoreServer = configuration.require.CoreServer
      , CoreConnection = configuration.require.CoreConnection;

    // Accounting tests
    CoreServer.enableServerAccounting();
    CoreConnection.enableConnectionAccounting();

    // Replica configuration
    var replSet = new ReplSet([
        new Server('localhost', 28390),
        new Server('localhost', 28391),
        new Server('localhost', 28392)
      ]
      , {rs_name:configuration.replicasetName}
    );

    var db = new Db('integration_test_', replSet, {w:0});
    db.open(function(err, p_db) {
      test.ok(err != null);

      db.close();

      setTimeout(function() {
        // Connection account tests
        test.equal(0, Object.keys(CoreConnection.connections()).length);
        test.equal(0, Object.keys(CoreServer.servers()).length);
        CoreServer.disableServerAccounting();
        CoreConnection.disableConnectionAccounting();

        test.done();
      }, 200);
      // // Connection account tests
      // test.equal(0, Object.keys(CoreConnection.connections()).length);
      // test.equal(0, Object.keys(CoreServer.servers()).length);
      // CoreServer.disableServerAccounting();
      // CoreConnection.disableConnectionAccounting();
      //
      // test.done();
    });
  }
}

exports['Should correctly connect with default replicaset'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var ReplSet = configuration.require.ReplSet
      , Server = configuration.require.Server
      , Db = configuration.require.Db
      , CoreServer = configuration.require.CoreServer
      , CoreConnection = configuration.require.CoreConnection;

    // Replset start port
    configuration.manager.secondaries().then(function(managers) {
      managers[0].stop().then(function() {
        // Accounting tests
        CoreServer.enableServerAccounting();
        CoreConnection.enableConnectionAccounting();

        // Replica configuration
        var replSet = new ReplSet([
            new Server(configuration.host, configuration.port),
            new Server(configuration.host, configuration.port + 1),
            new Server(configuration.host, configuration.port + 2)
          ]
          , {rs_name:configuration.replicasetName}
        );

        var db = new Db('integration_test_', replSet, {w:0});
        db.open(function(err, p_db) {
          test.equal(null, err);
          p_db.close();

          // console.log("==============================================")
          // console.dir(Object.keys(CoreConnection.connections()))
          // console.dir(Object.keys(CoreServer.servers()))

          setTimeout(function() {
            restartAndDone(configuration, test);
          }, 1000)
        })
      });
    });
  }
}

exports['Should correctly connect with default replicaset and no setName specified'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var ReplSet = configuration.require.ReplSet
      , Server = configuration.require.Server
      , Db = configuration.require.Db
      , CoreServer = configuration.require.CoreServer
      , CoreConnection = configuration.require.CoreConnection;

    // Replset start port
    configuration.manager.secondaries().then(function(managers) {
      managers[0].stop().then(function() {
        // Accounting tests
        CoreServer.enableServerAccounting();
        CoreConnection.enableConnectionAccounting();

        // Replica configuration
        var replSet = new ReplSet([
            new Server(configuration.host, configuration.port),
            new Server(configuration.host, configuration.port + 1),
            new Server(configuration.host, configuration.port + 2)
          ]
          , {}
        );

        var db = new Db('integration_test_', replSet, {w:0});
        db.open(function(err, p_db) {
          test.equal(null, err);
          p_db.close();

          // console.log("==============================================")
          // console.dir(Object.keys(CoreConnection.connections()))
          // console.dir(Object.keys(CoreServer.servers()))

          // // Connection account tests
          // test.equal(0, Object.keys(CoreConnection.connections()).length);
          // test.equal(0, Object.keys(CoreServer.servers()).length);
          // CoreServer.disableServerAccounting();
          // CoreConnection.disableConnectionAccounting();

          restartAndDone(configuration, test);
        });
      });
    });
  }
}

exports['Should correctly connect with default replicaset and socket options set'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var ReplSet = configuration.require.ReplSet
      , Server = configuration.require.Server
      , Db = configuration.require.Db
      , CoreServer = configuration.require.CoreServer
      , CoreConnection = configuration.require.CoreConnection;

    // Accounting tests
    CoreServer.enableServerAccounting();
    CoreConnection.enableConnectionAccounting();

    // Replica configuration
    var replSet = new ReplSet([
        new Server(configuration.host, configuration.port),
        new Server(configuration.host, configuration.port + 1),
        new Server(configuration.host, configuration.port + 2)
      ],
      {socketOptions: {keepAlive:100}, rs_name:configuration.replicasetName}
    );

    var db = new Db('integration_test_', replSet, {w:0});
    db.open(function(err, p_db) {
      test.equal(null, err);
      // Get a connection
      var connection = db.serverConfig.connections()[0];
      test.equal(100, connection.keepAliveInitialDelay);
      p_db.close();

      // // Connection account tests
      // test.equal(0, Object.keys(CoreConnection.connections()).length);
      // test.equal(0, Object.keys(CoreServer.servers()).length);
      // CoreServer.disableServerAccounting();
      // CoreConnection.disableConnectionAccounting();

      test.done();
    })
  }
}

exports['Should emit close no callback'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var ReplSet = configuration.require.ReplSet
      , Server = configuration.require.Server
      , Db = configuration.require.Db
      , CoreServer = configuration.require.CoreServer
      , CoreConnection = configuration.require.CoreConnection;

    // Accounting tests
    CoreServer.enableServerAccounting();
    CoreConnection.enableConnectionAccounting();

    // Replica configuration
    var replSet = new ReplSet([
        new Server(configuration.host, configuration.port),
        new Server(configuration.host, configuration.port + 1),
        new Server(configuration.host, configuration.port + 2)
      ],
      {rs_name:configuration.replicasetName}
    );

    new Db('integration_test_', replSet, {w:0}).open(function(err, db) {
      test.equal(null, err);
      var dbCloseCount = 0, serverCloseCount = 0;
      db.on('close', function() { ++dbCloseCount; });

      // Force a close on a socket
      db.close();

      setTimeout(function() {
        // Connection account tests
        test.equal(0, Object.keys(CoreConnection.connections()).length);
        test.equal(0, Object.keys(CoreServer.servers()).length);
        CoreServer.disableServerAccounting();
        CoreConnection.disableConnectionAccounting();

        test.equal(dbCloseCount, 1);
        test.done();
      }, 200);
    })
  }
}

exports['Should emit close with callback'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var ReplSet = configuration.require.ReplSet
      , Server = configuration.require.Server
      , Db = configuration.require.Db
      , CoreServer = configuration.require.CoreServer
      , CoreConnection = configuration.require.CoreConnection;

    // Accounting tests
    CoreServer.enableServerAccounting();
    CoreConnection.enableConnectionAccounting();

    // Replica configuration
    var replSet = new ReplSet([
        new Server(configuration.host, configuration.port),
        new Server(configuration.host, configuration.port + 1),
        new Server(configuration.host, configuration.port + 2)
      ],
      {rs_name:configuration.replicasetName}
    );

    new Db('integration_test_', replSet, {w:0}).open(function(err, db) {
      test.equal(null, err);
      var dbCloseCount = 0;
      db.on('close', function() {
        ++dbCloseCount;
      });

      db.close(function() {
        // Let all events fire.
        setTimeout(function() {
          // Connection account tests
          test.equal(0, Object.keys(CoreConnection.connections()).length);
          test.equal(0, Object.keys(CoreServer.servers()).length);
          CoreServer.disableServerAccounting();
          CoreConnection.disableConnectionAccounting();

          test.equal(dbCloseCount, 1);
          test.done();
        }, 200);
      });
    })
  }
}

exports['Should correctly pass error when wrong replicaSet'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var ReplSet = configuration.require.ReplSet
      , Server = configuration.require.Server
      , Db = configuration.require.Db
      , CoreServer = configuration.require.CoreServer
      , CoreConnection = configuration.require.CoreConnection;

    // Replica configuration
    var replSet = new ReplSet([
        new Server(configuration.host, configuration.port),
        new Server(configuration.host, configuration.port + 1),
        new Server(configuration.host, configuration.port + 2)
      ],
      {rs_name:configuration.replicasetName + "-wrong"}
    );

    var db = new Db('integration_test_', replSet, {w:0});
    db.open(function(err, p_db) {
      test.notEqual(null, err);
      test.done();
    })
  }
}

var retries = 120;

var ensureConnection = function(configuration, numberOfTries, callback) {
  var ReplSet = configuration.require.ReplSet
    , Server = configuration.require.Server
    , Db = configuration.require.Db
    , CoreServer = configuration.require.CoreServer
    , CoreConnection = configuration.require.CoreConnection;

  // Replica configuration
  var replSet = new ReplSet([
      new Server(configuration.host, configuration.port),
      new Server(configuration.host, configuration.port + 1),
      new Server(configuration.host, configuration.port + 2)
    ],
    {rs_name:configuration.replicasetName, socketOptions: {connectTimeoutMS: 1000}}
  );

  if(numberOfTries <= 0) return callback(new Error("could not connect correctly"), null);
  // Open the db
  var db = new Db('integration_test_', replSet, {w:0});
  db.open(function(err, p_db) {
    // Close the connection
    db.close();

    if(err != null) {
      // Wait for a sec and retry
      setTimeout(function() {
        numberOfTries = numberOfTries - 1;
        ensureConnection(configuration, numberOfTries, callback);
      }, 3000);
    } else {
      return callback(null);
    }
  })
}

exports['Should connect with primary stepped down'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var ReplSet = configuration.require.ReplSet
      , Server = configuration.require.Server
      , Db = configuration.require.Db
      , CoreServer = configuration.require.CoreServer
      , CoreConnection = configuration.require.CoreConnection;

    // Accounting tests
    CoreServer.enableServerAccounting();
    CoreConnection.enableConnectionAccounting();

    // Replica configuration
    var replSet = new ReplSet([
        new Server(configuration.host, configuration.port),
        new Server(configuration.host, configuration.port + 1),
        new Server(configuration.host, configuration.port + 2)
      ],
      {rs_name:configuration.replicasetName}
    );

    // // Step down primary server
    configuration.manager.stepDownPrimary(false, {stepDownSecs: 1, force:true}).then(function() {
      // Wait for new primary to pop up
      ensureConnection(configuration, retries, function(err, p_db) {
        new Db('integration_test_', replSet, {w:0}).open(function(err, p_db) {
          test.ok(err == null);
          // Get a connection
          var connection = p_db.serverConfig.connections()[0];
          test.equal(true, connection.isConnected());
          // Close the database
          p_db.close();

          // // Connection account tests
          // test.equal(0, Object.keys(CoreConnection.connections()).length);
          // test.equal(0, Object.keys(CoreServer.servers()).length);
          // CoreServer.disableServerAccounting();
          // CoreConnection.disableConnectionAccounting();

          restartAndDone(configuration, test);
        })
      });
    });
  }
}

exports['Should connect with third node killed'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var ReplSet = configuration.require.ReplSet
      , Server = configuration.require.Server
      , Db = configuration.require.Db
      , CoreServer = configuration.require.CoreServer
      , CoreConnection = configuration.require.CoreConnection;

    // Replset start port
    configuration.manager.secondaries().then(function(managers) {
      managers[0].stop().then(function() {
        // Accounting tests
        CoreServer.enableServerAccounting();
        CoreConnection.enableConnectionAccounting();

        // Replica configuration
        var replSet = new ReplSet([
            new Server(configuration.host, configuration.port),
            new Server(configuration.host, configuration.port + 1),
            new Server(configuration.host, configuration.port + 2)
          ],
          {rs_name:configuration.replicasetName}
        );

        // Wait for new primary to pop up
        ensureConnection(configuration, retries, function(err, p_db) {

          new Db('integration_test_', replSet, {w:0}).open(function(err, p_db) {
            test.ok(err == null);
            // Get a connection
            var connection = p_db.serverConfig.connections()[0];
            test.equal(true, connection.isConnected());
            // Close the database
            p_db.close();

            // // Connection account tests
            // test.equal(0, Object.keys(CoreConnection.connections()).length);
            // test.equal(0, Object.keys(CoreServer.servers()).length);
            // CoreServer.disableServerAccounting();
            // CoreConnection.disableConnectionAccounting();

            restartAndDone(configuration, test);
          })
        });
      });
    });
  }
}

exports['Should connect with primary node killed'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var ReplSet = configuration.require.ReplSet
      , Server = configuration.require.Server
      , Db = configuration.require.Db
      , CoreServer = configuration.require.CoreServer
      , CoreConnection = configuration.require.CoreConnection;

    // Replset start port
    configuration.manager.primary().then(function(primary) {
      primary.stop().then(function() {
        // Accounting tests
        CoreServer.enableServerAccounting();
        CoreConnection.enableConnectionAccounting();

        // Replica configuration
        var replSet = new ReplSet([
            new Server(configuration.host, configuration.port),
            new Server(configuration.host, configuration.port + 1),
            new Server(configuration.host, configuration.port + 2)
          ],
          {rs_name:configuration.replicasetName}
        );

        // Wait for new primary to pop up
        ensureConnection(configuration, retries, function(err, p_db) {
          new Db('integration_test_', replSet, {w:0}).open(function(err, p_db) {
            test.ok(err == null);
            // Get a connection
            var connection = p_db.serverConfig.connections()[0];
            test.equal(true, connection.isConnected());
            // Close the database
            p_db.close();

            // // Connection account tests
            // test.equal(0, Object.keys(CoreConnection.connections()).length);
            // test.equal(0, Object.keys(CoreServer.servers()).length);
            // CoreServer.disableServerAccounting();
            // CoreConnection.disableConnectionAccounting();

            restartAndDone(configuration, test);
          })
        });
      });
    });
  }
}

exports['Should correctly emit open signal and full set signal'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var ReplSet = configuration.require.ReplSet
      , Server = configuration.require.Server
      , Db = configuration.require.Db
      , CoreServer = configuration.require.CoreServer
      , CoreConnection = configuration.require.CoreConnection;

    var openCalled = false;
    // Accounting tests
    CoreServer.enableServerAccounting();
    CoreConnection.enableConnectionAccounting();

    // Replica configuration
    var replSet = new ReplSet([
        new Server(configuration.host, configuration.port),
        new Server(configuration.host, configuration.port + 1),
        new Server(configuration.host, configuration.port + 2)
      ],
      {rs_name:configuration.replicasetName}
    );

    var db = new Db('integration_test_', replSet, {w:0});
    db.once("open", function(_err, _db) {
      openCalled = true;
    });

    db.once("fullsetup", function(_err, _db) {
      test.equal(true, openCalled);

      // Close and cleanup
      _db.close();

      setTimeout(function() {
        // Connection account tests
        test.equal(0, Object.keys(CoreConnection.connections()).length);
        test.equal(0, Object.keys(CoreServer.servers()).length);
        CoreServer.disableServerAccounting();
        CoreConnection.disableConnectionAccounting();

        test.done();
      }, 200)
    });

    db.open(function(err, p_db) {})
  }
}

exports['ReplSet honors socketOptions options'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var ReplSet = configuration.require.ReplSet
      , Server = configuration.require.Server
      , Db = configuration.require.Db
      , CoreServer = configuration.require.CoreServer
      , CoreConnection = configuration.require.CoreConnection;

    // Accounting tests
    CoreServer.enableServerAccounting();
    CoreConnection.enableConnectionAccounting();

    // Replica configuration
    var replSet = new ReplSet([
        new Server(configuration.host, configuration.port),
        new Server(configuration.host, configuration.port + 1),
        new Server(configuration.host, configuration.port + 2)
      ],
      {socketOptions: {
          connectTimeoutMS:1000
        , socketTimeoutMS: 3000
        , noDelay: false
      }, rs_name:configuration.replicasetName}
    );

    var db = new Db('integration_test_', replSet, {w:0});
    db.open(function(err, p_db) {
      test.equal(null, err);
      // Get a connection
      var connection = db.serverConfig.connections()[0];
      test.equal(1000, connection.connectionTimeout);
      test.equal(3000, connection.socketTimeout);
      test.equal(false, connection.noDelay);
      p_db.close();

      setTimeout(function() {
        // Connection account tests
        test.equal(0, Object.keys(CoreConnection.connections()).length);
        test.equal(0, Object.keys(CoreServer.servers()).length);
        CoreServer.disableServerAccounting();
        CoreConnection.disableConnectionAccounting();

        test.done();
      }, 200);
    });
  }
}

exports['Should correctly emit all signals even if not yet connected'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var ReplSet = configuration.require.ReplSet
      , Server = configuration.require.Server
      , Db = configuration.require.Db
      , CoreServer = configuration.require.CoreServer
      , CoreConnection = configuration.require.CoreConnection;

    // Accounting tests
    CoreServer.enableServerAccounting();
    CoreConnection.enableConnectionAccounting();

    // Replica configuration
    var replSet = new ReplSet([
        new Server(configuration.host, configuration.port),
        new Server(configuration.host, configuration.port + 1),
        new Server(configuration.host, configuration.port + 2)
      ],
      {rs_name:configuration.replicasetName}
    );

    var db_conn = new Db('integration_test_', replSet, {w:1});
    var db2 = db_conn.db('integration_test_2');
    var close_count = 0;
    var open_count = 0;
    var fullsetup_count = 0;

    db2.on('close', function() {
      close_count = close_count + 1;
    });

    db_conn.on('close', function() {
      close_count = close_count + 1;
    });

    db2.on('open', function(err, db) {
      test.equal('integration_test_2', db.databaseName);
      open_count = open_count + 1;
    });

    db_conn.on('open', function(err, db) {
      test.equal('integration_test_', db.databaseName);
      open_count = open_count + 1;
    });

    db2.on('fullsetup', function(err, db) {
      test.equal('integration_test_2', db.databaseName);
      fullsetup_count = fullsetup_count + 1;
    });

    db_conn.on('fullsetup', function(err, db) {
      test.equal('integration_test_', db.databaseName);
      fullsetup_count = fullsetup_count + 1;
    });

    db_conn.open(function (err) {
      if(err) throw err;

      // Wait for fullset
      var interval = setInterval(function() {
        if(fullsetup_count == 2) {
          clearInterval(interval);

          var col1 = db_conn.collection('test');
          var col2 = db2.collection('test');

          var testData = { value : "something" };
          col1.insert(testData, function (err) {
            if (err) throw err;

            var testData = { value : "something" };
            col2.insert(testData, function (err) {
              if (err) throw err;
              db2.close(function() {
                setTimeout(function() {
                  // Connection account tests
                  test.equal(0, Object.keys(CoreConnection.connections()).length);
                  test.equal(0, Object.keys(CoreServer.servers()).length);
                  CoreServer.disableServerAccounting();
                  CoreConnection.disableConnectionAccounting();

                  test.equal(2, close_count);
                  test.equal(2, open_count);
                  test.done();
                }, 200);
              });
            });
          });
        }
      }, 200);
    });
  }
}

exports['Should receive all events for primary and secondary leaving'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var ReplSet = configuration.require.ReplSet
      , Server = configuration.require.Server
      , Db = configuration.require.Db
      , CoreServer = configuration.require.CoreServer
      , CoreConnection = configuration.require.CoreConnection;

    // Accounting tests
    CoreServer.enableServerAccounting();
    CoreConnection.enableConnectionAccounting();

    // Replica configuration
    var replSet = new ReplSet([
        new Server(configuration.host, configuration.port),
        new Server(configuration.host, configuration.port + 1),
        new Server(configuration.host, configuration.port + 2)
      ],
      {rs_name:configuration.replicasetName}
    );

    // Counters to track emitting of events
    var numberOfJoins = 0;
    var numberLeaving = 0;

    // Add some listeners
    replSet.on("left", function(_server_type, _server) {
      numberLeaving += 1;
    });

    replSet.on("joined", function(_server_type, _doc, _server) {
      numberOfJoins += 1;
    });

    // Connect to the replicaset
    var db = new Db('integration_test_', replSet, {w:0});
    db.open(function(err, p_db) {
      // Kill the secondary
      // Replset start port
      configuration.manager.secondaries().then(function(managers) {
        managers[0].stop().then(function() {
          test.equal(null, err);
          p_db.close();

          // // Connection account tests
          // test.equal(0, Object.keys(CoreConnection.connections()).length);
          // test.equal(0, Object.keys(CoreServer.servers()).length);
          // CoreServer.disableServerAccounting();
          // CoreConnection.disableConnectionAccounting();

          restartAndDone(configuration, test);
        });
      });
    });
  }
}

exports['Should Fail due to bufferMaxEntries = 0 not causing any buffering'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var ReplSet = configuration.require.ReplSet
      , Server = configuration.require.Server
      , Db = configuration.require.Db
      , CoreServer = configuration.require.CoreServer
      , CoreConnection = configuration.require.CoreConnection;

    // Accounting tests
    CoreServer.enableServerAccounting();
    CoreConnection.enableConnectionAccounting();

    // Replica configuration
    var replSet = new ReplSet([
        new Server(configuration.host, configuration.port),
        new Server(configuration.host, configuration.port + 1),
        new Server(configuration.host, configuration.port + 2)
      ],
      {rs_name:configuration.replicasetName}
    );

    // Counters to track emitting of events
    var numberOfJoins = 0;
    var numberLeaving = 0;

    // Connect to the replicaset
    var db = new Db('integration_test_', replSet, {w:1, bufferMaxEntries: 0});
    db.open(function(err, p_db) {

      // Setup
      db.serverConfig.on('left', function(t) {
        if(t == 'primary') {
          // Attempt an insert
          db.collection('_should_fail_due_to_bufferMaxEntries_0').insert({a:1}, function(err, ids) {
            test.ok(err != null);
            test.ok(err.message.indexOf("0") != -1)
            db.close();

            // // Connection account tests
            // test.equal(0, Object.keys(CoreConnection.connections()).length);
            // test.equal(0, Object.keys(CoreServer.servers()).length);
            // CoreServer.disableServerAccounting();
            // CoreConnection.disableConnectionAccounting();

            restartAndDone(configuration, test);
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
}

// exports['Should correctly receive ping and ha events'] = {
//   metadata: { requires: { topology: 'replicaset' } },
//
//   // The actual test we wish to run
//   test: function(configuration, test) {
//     var ReplSet = configuration.require.ReplSet
//       , Server = configuration.require.Server
//       , Db = configuration.require.Db;
//
//     // Replica configuration
//     var replSet = new ReplSet([
//         new Server(configuration.host, configuration.port),
//         new Server(configuration.host, configuration.port + 1),
//         new Server(configuration.host, configuration.port + 2)
//       ],
//       {rs_name:configuration.replicasetName}
//     );
//
//     // Open the db connection
//     new Db('integration_test_', replSet, {w:1}).open(function(err, db) {
//       test.equal(null, err)
//       var ha_connect = false;
//       var ha_ismaster = false;
//       var ping = false;
//
//       // Listen to the ha and ping events
//       db.serverConfig.once("ha_connect", function(err) {
//         ha_connect = true;
//       });
//
//       db.serverConfig.once("ha_ismaster", function(err, result) {
//         ha_ismaster = true;
//       });
//
//       db.serverConfig.once("ping", function(err, r) {
//         ping = true;
//       });
//
//       var interval = setInterval(function() {
//         if(ping && ha_connect && ha_ismaster) {
//           clearInterval(interval);
//           db.close();
//           test.done();
//         }
//       }, 100);
//     });
//   }
// }

/**
 * @ignore
 */
exports['Should correctly connect to a replicaset with additional options'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var mongo = configuration.require
      , MongoClient = mongo.MongoClient
      , Db = configuration.require.Db
      , CoreServer = configuration.require.CoreServer
      , CoreConnection = configuration.require.CoreConnection;

    var url = f("mongodb://localhost:%s,localhost:%s,localhost:%s/integration_test_?replicaSet=%s"
      , configuration.port, configuration.port + 1, configuration.port + 2, configuration.replicasetName)

    // Accounting tests
    CoreServer.enableServerAccounting();
    CoreConnection.enableConnectionAccounting();

    MongoClient.connect(url, {
      replSet: {
        haInterval: 500,
        socketOptions: {
          connectTimeoutMS: 500
        }
      }
    }, function(err, db) {
      test.equal(null, err);
      test.ok(db != null);

      test.equal(500, db.serverConfig.connections()[0].connectionTimeout);
      test.equal(30000, db.serverConfig.connections()[0].socketTimeout);

      db.collection("replicaset_mongo_client_collection").update({a:1}, {b:1}, {upsert:true}, function(err, result) {
        test.equal(null, err);
        test.equal(1, result.result.n);

        db.close();

        setTimeout(function() {
          // Connection account tests
          test.equal(0, Object.keys(CoreConnection.connections()).length);
          test.equal(0, Object.keys(CoreServer.servers()).length);
          CoreServer.disableServerAccounting();
          CoreConnection.disableConnectionAccounting();

          test.done();
        }, 200);
      });
    });
  }
}

/**
 * @ignore
 */
exports['Should correctly connect to a replicaset with readPreference set'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var mongo = configuration.require
      , MongoClient = mongo.MongoClient
      , Db = configuration.require.Db
      , CoreServer = configuration.require.CoreServer
      , CoreConnection = configuration.require.CoreConnection;

    // Create url
    var url = f("mongodb://%s,%s/%s?replicaSet=%s&readPreference=%s"
      , f("%s:%s", configuration.host, configuration.port)
      , f("%s:%s", configuration.host, configuration.port + 1)
      , "integration_test_"
      , configuration.replicasetName
      , "primary");

    // Accounting tests
    CoreServer.enableServerAccounting();
    CoreConnection.enableConnectionAccounting();

    MongoClient.connect(url, function(err, db) {
      db.collection("test_collection").insert({a:1}, function(err, result) {
        test.equal(null, err);

        db.close();

        setTimeout(function() {
          // Connection account tests
          test.equal(0, Object.keys(CoreConnection.connections()).length);
          test.equal(0, Object.keys(CoreServer.servers()).length);
          CoreServer.disableServerAccounting();
          CoreConnection.disableConnectionAccounting();

          test.done();
        }, 200);
      });
    });
  }
}

/**
 * @ignore
 */
exports['Should give an error for non-existing servers'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var mongo = configuration.require
      , MongoClient = mongo.MongoClient
      , Db = configuration.require.Db
      , CoreServer = configuration.require.CoreServer
      , CoreConnection = configuration.require.CoreConnection;

    var url = f("mongodb://%s,%s/%s?replicaSet=%s&readPreference=%s"
      , "nolocalhost:30000"
      , "nolocalhost:30001"
      , "integration_test_"
      , configuration.replicasetName
      , "primary");

    MongoClient.connect(url, function(err, db) {
      test.ok(err != null);
      test.done();
    });
  }
}

/**
 * @ignore
 */
exports['Should correctly connect to a replicaset with writeConcern specified and GridStore should inherit correctly'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var mongo = configuration.require
      , MongoClient = mongo.MongoClient
      , GridStore = mongo.GridStore
      , ObjectID = mongo.ObjectID
      , Db = configuration.require.Db
      , CoreServer = configuration.require.CoreServer
      , CoreConnection = configuration.require.CoreConnection;

    // Create url
    var url = f("mongodb://%s,%s/%s?replicaSet=%s&w=%s&wtimeoutMS=5000"
      , f("%s:%s", configuration.host, configuration.port)
      , f("%s:%s", configuration.host, configuration.port + 1)
      , "integration_test_"
      , configuration.replicasetName
      , "majority");

    // Accounting tests
    CoreServer.enableServerAccounting();
    CoreConnection.enableConnectionAccounting();

    MongoClient.connect(url, function(err, db) {
      var gs = new GridStore(db, new ObjectID());
      test.equal('majority', gs.writeConcern.w);
      test.equal(5000, gs.writeConcern.wtimeout);
      db.close();

      setTimeout(function() {
        // Connection account tests
        test.equal(0, Object.keys(CoreConnection.connections()).length);
        test.equal(0, Object.keys(CoreServer.servers()).length);
        CoreServer.disableServerAccounting();
        CoreConnection.disableConnectionAccounting();

        test.done();
      }, 200);
    });
  }
}

/**
 * @ignore
 */
exports['Should Correctly remove server going into recovery mode'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var ReplSet = configuration.require.ReplSet
      , Server = configuration.require.Server
      , Db = configuration.require.Db
      , CoreServer = configuration.require.CoreServer
      , CoreConnection = configuration.require.CoreConnection;

    // Accounting tests
    CoreServer.enableServerAccounting();
    CoreConnection.enableConnectionAccounting();

    // console.log("========================================= 0")
    // Replica configuration
    var replSet = new ReplSet([
        new Server(configuration.host, configuration.port),
        new Server(configuration.host, configuration.port + 1),
        new Server(configuration.host, configuration.port + 2)
      ],
      {rs_name:configuration.replicasetName, socketTimeoutMS:5000}
    );

    // Open the db connection
    var db = new Db('integration_test_', replSet, {w:1});
    db.on("fullsetup", function() {
      // console.log("========================================= 1")
      db.command({ismaster:true}, function(err, result) {
        // console.log("========================================= 2")
        // Filter out the secondaries
        var secondaries = [];
        result.hosts.forEach(function(s) {
          if(result.primary != s && result.arbiters.indexOf(s) == -1)
            secondaries.push(s);
        });

        // Get the arbiters
        var host = secondaries[0].split(":")[0];
        var port = parseInt(secondaries[0].split(":")[1], 10);
        var db1 = new Db('integration_test_', new Server(host, port), {w:1});
        var done = false;

        db.serverConfig.on('left', function(t, s) {
          // console.log("========================================= 6 :: " + t + " :: " + s.name)
          if(t == 'primary' && !done) {
            done = true;
            // Return to working state
            db1.admin().command({ replSetMaintenance: 0 }, function(err, result) {
              // console.dir(err)
              db.close();
              db1.close();

              setTimeout(function() {
                // console.log("===================================== Connections")
                // console.dir(Object.keys(CoreConnection.connections()))
                // console.log("===================================== Servers")
                // console.dir(Object.keys(CoreServer.servers()))
                // console.dir(Object.keys(CoreServer.servers()).map(function(x) {
                //   return CoreServer.servers()[x].name
                // }))

                setTimeout(function() {
                  // Connection account tests
                  test.equal(0, Object.keys(CoreConnection.connections()).length);
                  test.equal(0, Object.keys(CoreServer.servers()).length);
                  CoreServer.disableServerAccounting();
                  CoreConnection.disableConnectionAccounting();

                  test.done();
                }, 200);
              }, 10000);
            });
          }
        });

        // console.log("========================================= 3")
        db1.open(function(err, db1) {
          test.equal(null, err);
          global.debug = true
          // console.log("========================================= 4")

          db1.admin().command({ replSetMaintenance: 1 }, function(err, result) {
            // console.log("========================================= 5")
            // console.dir(err)
            // console.dir(result)
          });
        });
      });
    });

    db.open(function(err, p_db) {
      db = p_db;
    });
  }
}

/**
 * @ignore
 */
exports['Should return single server direct connection when replicaSet not provided'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var mongo = configuration.require
      , MongoClient = mongo.MongoClient
      , Server = mongo.Server
      , Db = configuration.require.Db
      , CoreServer = configuration.require.CoreServer
      , CoreConnection = configuration.require.CoreConnection;

    var url = f("mongodb://localhost:%s/%s"
      , configuration.port
      , "integration_test_");

    // Accounting tests
    CoreServer.enableServerAccounting();
    CoreConnection.enableConnectionAccounting();

    MongoClient.connect(url, function(err, db) {
      test.equal(null, err);
      test.ok(db.serverConfig instanceof Server);
      db.close();

      setTimeout(function() {
        // Connection account tests
        test.equal(0, Object.keys(CoreConnection.connections()).length);
        test.equal(0, Object.keys(CoreServer.servers()).length);
        CoreServer.disableServerAccounting();
        CoreConnection.disableConnectionAccounting();

        test.done();
      }, 200);
    });
  }
}

var waitForPrimary = function(count, config, options, callback) {
  var ReplSet = require('mongodb-core').ReplSet;
  if(count == 0) return callback(new Error("could not connect"));
  // Attempt to connect
  var server = new ReplSet(config, options);
  server.on('error', function(err) {
    server.destroy();

    setTimeout(function() {
      waitForPrimary(count - 1, config, options, callback);
    }, 1000);
  });

  server.on('fullsetup', function(_server) {
    server.destroy();
    callback();
  });

  // Start connection
  server.connect();
}

exports['Should correctly connect to arbiter with single connection'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var mongo = configuration.require
      , ReplSet = mongo.ReplSet
      , Server = mongo.Server
      , Db = configuration.require.Db
      , CoreServer = configuration.require.CoreServer
      , CoreConnection = configuration.require.CoreConnection;

    // Replset start port
    configuration.manager.arbiters().then(function(managers) {
      // Accounting tests
      CoreServer.enableServerAccounting();
      CoreConnection.enableConnectionAccounting();

      // Get the arbiters
      var host = managers[0].host;
      var port = managers[0].port;
      var db = new Db('integration_test_', new Server(host, port), {w:1});

      db.open(function(err, p_db) {
        test.equal(null, err);

        p_db.command({ismaster: true}, function(err, result) {
          test.equal(null, err);

          // Should fail
          p_db.collection('t').insert({a:1}, function(err, r) {
            test.ok(err != null);

            p_db.close();

            // // Connection account tests
            // test.equal(0, Object.keys(CoreConnection.connections()).length);
            // test.equal(0, Object.keys(CoreServer.servers()).length);
            // CoreServer.disableServerAccounting();
            // CoreConnection.disableConnectionAccounting();

            restartAndDone(configuration, test);
          });
        });
      })
    })
  }
}

exports['Should correctly connect to secondary with single connection'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var mongo = configuration.require
      , ReplSet = mongo.ReplSet
      , Server = mongo.Server
      , Db = configuration.require.Db
      , CoreServer = configuration.require.CoreServer
      , CoreConnection = configuration.require.CoreConnection;

    // replicasetManager.getServerManagerByType('secondary', function(err, server) {
    configuration.manager.secondaries().then(function(managers) {
      // Accounting tests
      CoreServer.enableServerAccounting();
      CoreConnection.enableConnectionAccounting();

      // Get the arbiters
      var host = managers[0].host;
      var port = managers[0].port;
      var db = new Db('integration_test_', new Server(host, port), {w:1});

      db.open(function(err, p_db) {
        test.equal(null, err);

        p_db.command({ismaster: true}, function(err, result) {
          test.equal(null, err);

          p_db.close();

          // // Connection account tests
          // test.equal(0, Object.keys(CoreConnection.connections()).length);
          // test.equal(0, Object.keys(CoreServer.servers()).length);
          // CoreServer.disableServerAccounting();
          // CoreConnection.disableConnectionAccounting();

          restartAndDone(configuration, test);
        });
      });
    });
  }
}

exports['Replicaset connection where a server is standalone'] = {
  metadata: {
    requires: {
      topology: "replicaset"
    }
  },

  test: function(configuration, test) {
    var Server = configuration.require.Server
      , ReplSet = configuration.require.ReplSet
      , ServerManager = require('mongodb-topology-manager').Server
      , MongoClient = configuration.require.MongoClient
      , manager = configuration.manager
      , Db = configuration.require.Db
      , CoreServer = configuration.require.CoreServer
      , CoreConnection = configuration.require.CoreConnection;

    // State
    var joined = {'primary':[], 'secondary': [], 'arbiter': [], 'passive': []};
    var left = {'primary':[], 'secondary': [], 'arbiter': [], 'passive': []};
    // Get the primary server
    configuration.manager.primary().then(function(primaryServerManager) {
      var nonReplSetMember = new ServerManager('mongod', {
        bind_ip: primaryServerManager.host,
        port: primaryServerManager.port,
        dbpath: primaryServerManager.options.dbpath
      });

      // Stop the primary
      primaryServerManager.stop().then(function(err, r) {
        nonReplSetMember.purge().then(function() {
          // Start a non replset member
          nonReplSetMember.start().then(function() {

            configuration.manager.waitForPrimary().then(function() {
              var url = f("mongodb://localhost:%s,localhost:%s,localhost:%s/integration_test_?replicaSet=%s"
                    , configuration.port, configuration.port + 1, configuration.port + 2, configuration.replicasetName)

              // Accounting tests
              CoreServer.enableServerAccounting();
              CoreConnection.enableConnectionAccounting();

              // Attempt to connect using MongoClient uri
              MongoClient.connect(url, function(err, db) {
                test.equal(null, err);
                test.ok(db.serverConfig instanceof ReplSet);
                db.close();

                // // Connection account tests
                // test.equal(0, Object.keys(CoreConnection.connections()).length);
                // test.equal(0, Object.keys(CoreServer.servers()).length);
                // CoreServer.disableServerAccounting();
                // CoreConnection.disableConnectionAccounting();

                // Stop the normal server
                nonReplSetMember.stop().then(function() {
                  restartAndDone(configuration, test);
                });
              });
            });
          });
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports['Should correctly modify the server reconnectTries for all replset instances'] = {
  metadata: { requires: { topology: 'replicaset' } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var mongo = configuration.require
      , MongoClient = mongo.MongoClient
      , Db = configuration.require.Db
      , CoreServer = configuration.require.CoreServer
      , CoreConnection = configuration.require.CoreConnection;

    var url = f("mongodb://localhost:%s,localhost:%s,localhost:%s/integration_test_?replicaSet=%s"
      , configuration.port, configuration.port + 1, configuration.port + 2, configuration.replicasetName)

    // Accounting tests
    CoreServer.enableServerAccounting();
    CoreConnection.enableConnectionAccounting();

    MongoClient.connect(url, {
      reconnectTries: 10
    }, function(err, db) {
      test.equal(null, err);
      test.ok(db != null);

      var servers = db.serverConfig.s.replset.s.replicaSetState.allServers();
      for (var i = 0; i < servers.length; i++) {
        test.equal(10, servers[i].s.pool.options.reconnectTries);
      }

      // Destroy the pool
      db.close();

      setTimeout(function() {
        // Connection account tests
        test.equal(0, Object.keys(CoreConnection.connections()).length);
        test.equal(0, Object.keys(CoreServer.servers()).length);
        CoreServer.disableServerAccounting();
        CoreConnection.disableConnectionAccounting();

        test.done();
      }, 200);

      // // Connection account tests
      // test.equal(0, Object.keys(CoreConnection.connections()).length);
      // test.equal(0, Object.keys(CoreServer.servers()).length);
      // CoreServer.disableServerAccounting();
      // CoreConnection.disableConnectionAccounting();
      //
      // test.done();
    });
  }
}
