"use strict";

var f = require('util').format,
  locateAuthMethod = require('./shared').locateAuthMethod,
  executeCommand = require('./shared').executeCommand;

exports['Should correctly connect pool to single server'] = {
  metadata: { requires: { topology: "single" } },

  test: function(configuration, test) {
    var Pool = require('../../../lib/connection/pool')
      , Connection = require('../../../lib/connection/connection')
      , bson = require('bson');

    // Enable connections accounting
    Connection.enableConnectionAccounting();

    // Attempt to connect
    var pool = new Pool({
        host: configuration.host
      , port: configuration.port
      , bson: new bson()
      , messageHandler: function() {}
    });

    // Add event listeners
    pool.on('connect', function(_pool) {
      _pool.destroy();
      // console.log("=================== " + Object.keys(Connection.connections()).length)
      test.equal(0, Object.keys(Connection.connections()).length);
      Connection.disableConnectionAccounting();
      test.done();
    });

    // Start connection
    pool.connect();
  }
}

exports['Should only listen on connect once'] = {
  metadata: { requires: { topology: "single" } },

  test: function(configuration, test) {
    var Pool = require('../../../lib/connection/pool')
      , Connection = require('../../../lib/connection/connection')
      , bson = require('bson');

    // Enable connections accounting
    Connection.enableConnectionAccounting();

    // Attempt to connect
    var pool = new Pool({
        host: configuration.host
      , port: configuration.port
      , bson: new bson()
      , messageHandler: function() {}
    });

    var connection;

    // Add event listeners
    pool.on('connect', function(_pool) {
      process.nextTick(function() {
        // Now that we are in next tick, connection should still exist, but there
        // should be no connect listeners
        test.equal(0, connection.connection.listeners('connect').length);
        test.equal(1, pool.allConnections().length);

        _pool.destroy();

        // Connection should be gone after destroy
        test.equal(0, pool.allConnections().length);
        Connection.disableConnectionAccounting();
        test.done();
      });
    });

    test.equal(0, pool.allConnections().length);

    // Start connection
    pool.connect();

    test.equal(1, pool.allConnections().length);
    connection = pool.allConnections()[0];
    test.equal(1, connection.connection.listeners('connect').length);
  }
}

exports['Should properly emit errors on forced destroy'] = {
  metadata: { requires: { topology: "single" } },

  test: function(configuration, test) {
    var Pool = require('../../../lib/connection/pool')
      , Connection = require('../../../lib/connection/connection')
      , bson = require('bson')
      , Query = require('../../../lib/connection/commands').Query;

    var pool = new Pool({
      host: configuration.host,
      port: configuration.port,
      bson: new bson()
    });

    pool.on('connect', function(_pool) {
      var query = new Query(new bson(), 'system.$cmd', { ismaster: true }, { numberToSkip: 0, numberToReturn: 1 });
      _pool.write(query, function(err, result) {
        test.ok(err);
        test.ok(err.message.match(/Pool was force destroyed/));
        test.equal(result, null);

        test.equal(0, Object.keys(Connection.connections()).length);
        Connection.disableConnectionAccounting();
        test.done();
      });

      _pool.destroy({ force: true });
    });

    pool.connect();
  }
}

exports['Should correctly write ismaster operation to the server'] = {
  metadata: { requires: { topology: "single" } },

  test: function(configuration, test) {
    var Pool = require('../../../lib/connection/pool')
      , Connection = require('../../../lib/connection/connection')
      , bson = require('bson')
      , Query = require('../../../lib/connection/commands').Query;

    // Enable connections accounting
    Connection.enableConnectionAccounting();

    // Attempt to connect
    var pool = new Pool({
        host: configuration.host
      , port: configuration.port
      , bson: new bson()
    })

    // Add event listeners
    pool.on('connect', function(_pool) {
      var query = new Query(new bson(), 'system.$cmd', {ismaster:true}, {numberToSkip: 0, numberToReturn: 1});
      _pool.write(query, function(err, result) {
        test.equal(null, err);
        test.equal(true, result.result.ismaster);
        _pool.destroy();
        test.equal(0, Object.keys(Connection.connections()).length);
        Connection.disableConnectionAccounting();
        test.done();
      });
    })

    // Start connection
    pool.connect();
  }
}

exports['Should correctly grow server pool on concurrent operations'] = {
  metadata: { requires: { topology: "single" } },

  test: function(configuration, test) {
    var Pool = require('../../../lib/connection/pool')
      , Connection = require('../../../lib/connection/connection')
      , bson = require('bson')
      , Query = require('../../../lib/connection/commands').Query;

    // Enable connections accounting
    Connection.enableConnectionAccounting();

    // Index
    var index = 0;

    // Attempt to connect
    var pool = new Pool({
        host: configuration.host
      , port: configuration.port
      , bson: new bson()
    })

    var messageHandler = function(err, result) {
      index = index + 1;

      test.equal(null, err);
      test.equal(true, result.result.ismaster);

      // Did we receive an answer for all the messages
      if(index == 100) {
        test.equal(5, pool.allConnections().length);

        pool.destroy();
        test.equal(0, Object.keys(Connection.connections()).length);
        Connection.disableConnectionAccounting();
        test.done();
      }
    }

    // Add event listeners
    pool.on('connect', function(_pool) {
      for(var i = 0; i < 10; i++) {
        // process.nextTick(function() {
          var query = new Query(new bson(), 'system.$cmd', {ismaster:true}, {numberToSkip: 0, numberToReturn: 1});
          _pool.write(query, messageHandler)

          var query = new Query(new bson(), 'system.$cmd', {ismaster:true}, {numberToSkip: 0, numberToReturn: 1});
          _pool.write(query, messageHandler)

          var query = new Query(new bson(), 'system.$cmd', {ismaster:true}, {numberToSkip: 0, numberToReturn: 1});
          _pool.write(query, messageHandler)

          var query = new Query(new bson(), 'system.$cmd', {ismaster:true}, {numberToSkip: 0, numberToReturn: 1});
          _pool.write(query, messageHandler)

          var query = new Query(new bson(), 'system.$cmd', {ismaster:true}, {numberToSkip: 0, numberToReturn: 1});
          _pool.write(query, messageHandler)

          var query = new Query(new bson(), 'system.$cmd', {ismaster:true}, {numberToSkip: 0, numberToReturn: 1});
          _pool.write(query, messageHandler)

          var query = new Query(new bson(), 'system.$cmd', {ismaster:true}, {numberToSkip: 0, numberToReturn: 1});
          _pool.write(query, messageHandler)

          var query = new Query(new bson(), 'system.$cmd', {ismaster:true}, {numberToSkip: 0, numberToReturn: 1});
          _pool.write(query, messageHandler)

          var query = new Query(new bson(), 'system.$cmd', {ismaster:true}, {numberToSkip: 0, numberToReturn: 1});
          _pool.write(query, messageHandler)

          var query = new Query(new bson(), 'system.$cmd', {ismaster:true}, {numberToSkip: 0, numberToReturn: 1});
          _pool.write(query, messageHandler)
        // })
      }
    })

    // Start connection
    pool.connect();
  }
}

exports['Should correctly write ismaster operation to the server and handle timeout'] = {
  metadata: { requires: { topology: "single" } },

  test: function(configuration, test) {
    var Pool = require('../../../lib/connection/pool')
      , Connection = require('../../../lib/connection/connection')
      , bson = require('bson')
      , Query = require('../../../lib/connection/commands').Query;

    // Attempt to connect
    var pool = new Pool({
        host: configuration.host
      , port: configuration.port
      , socketTimeout: 3000
      , bson: new bson()
      , reconnect: false
    })

    // Add event listeners
    pool.on('connect', function(_pool) {
      var query = new Query(new bson(), 'system.$cmd', {ismaster:true}, {numberToSkip: 0, numberToReturn: 1});
      _pool.write(query, function() {});
    })

    pool.on('timeout', function(_pool) {
      pool.destroy();
      test.done();
    });

    // Start connection
    pool.connect();
  }
}

exports['Should correctly error out operations if pool is closed in the middle of a set'] = {
  metadata: { requires: { topology: "single" } },

  test: function(configuration, test) {
    var Pool = require('../../../lib/connection/pool')
      , Connection = require('../../../lib/connection/connection')
      , bson = require('bson')
      , Query = require('../../../lib/connection/commands').Query;

    // Enable connections accounting
    Connection.enableConnectionAccounting();

    // Attempt to connect
    var pool = new Pool({
        host: configuration.host
      , port: configuration.port
      , socketTimeout: 3000
      , bson: new bson()
    })

    var index = 0;
    var errorCount = 0;

    var messageHandler = function(err, r) {
      if(err) errorCount = errorCount + 1;
      index = index + 1;
      if(index> 490)console.log("--- messageHandler :: " + index)

      if(index == 500) {
        // console.log("== index :: " + index)
        // console.log(" errorCount = " + errorCount)
        // console.dir(err)
        // console.dir(r)
        // console.dir(errorCount)
        test.ok(errorCount >= 250);
        pool.destroy();
        // console.log("=================== " + Object.keys(Connection.connections()).length)
        // test.equal(0, Object.keys(Connection.connections()).length);
        Connection.disableConnectionAccounting();
        test.done();
      }
    }

    function execute(i) {
      setTimeout(function() {
        var query = new Query(new bson(), 'system.$cmd', {ismaster:true}, {numberToSkip: 0, numberToReturn: 1});
        pool.write(query, messageHandler);
        if(i == 249) {
          pool.destroy();
        }
      }, i);
    }

    // Add event listeners
    pool.on('connect', function(_pool) {
      for(var i = 0; i < 500; i++) {
        execute(i);
      }
    })

    // Start connection
    pool.connect();
  }
}

exports['Should correctly recover from a server outage'] = {
  metadata: { requires: { topology: "single" } },

  test: function(configuration, test) {
    var Pool = require('../../../lib/connection/pool')
      , Connection = require('../../../lib/connection/connection')
      , bson = require('bson')
      , Query = require('../../../lib/connection/commands').Query;
    // console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! START TEST")

    // Enable connections accounting
    Connection.enableConnectionAccounting();

    // Attempt to connect
    var pool = new Pool({
        host: configuration.host
      , port: configuration.port
      , socketTimeout: 3000
      , connectionTimeout: 1000
      , reconnectTries: 120
      , bson: new bson()
    })

    var index = 0;
    var errorCount = 0;
    var executed = false;
    var restarted = false;

    function waitForRestart(callback) {
      setTimeout(function() {
        if(!restarted) return waitForRestart(callback);
        callback();
      }, 10);
    }

    var messageHandler = function(err, r) {
      // console.log("--- messageHandler :: " + index)
      if(err) errorCount = errorCount + 1;
      index = index + 1;

      if(index == 500 && !executed) {
        waitForRestart(function() {
          executed = true;
          test.ok(errorCount >= 0);
          pool.destroy();

          // console.dir(Object.keys(Connection.connections()).length)
          test.equal(0, Object.keys(Connection.connections()).length);
          Connection.disableConnectionAccounting();
          test.done();
        });
      }
    }

    function execute(i) {
      setTimeout(function() {
        var query = new Query(new bson(), 'system.$cmd', {ismaster:true}, {numberToSkip: 0, numberToReturn: 1});
        pool.write(query, messageHandler);

        if(i == 250) {
          configuration.manager.restart(true).then(function() {
            // console.log("!!!!!!!!!!! execute 1")
            restarted = true;
          });
        }
      }, i);
    }

    // Add event listeners
    pool.on('connect', function(_pool) {
      for(var i = 0; i < 500; i++) {
        execute(i);
      }
    })

    // pool.on('reconnect', function() {
    //   console.log("====== reconnect")
    // });

    // Start connection
    pool.connect();
  }
}

exports['Should correctly recover from a longer server outage'] = {
  metadata: {
    requires: { topology: "single" },
    ignore: { travis:true }
  },

  test: function(configuration, test) {
    var Pool = require('../../../lib/connection/pool')
      , Connection = require('../../../lib/connection/connection')
      , bson = require('bson')
      , Query = require('../../../lib/connection/commands').Query;

    // Enable connections accounting
    Connection.enableConnectionAccounting();

    // Attempt to connect
    var pool = new Pool({
        host: configuration.host
      , port: configuration.port
      , socketTimeout: 3000
      , bson: new bson()
      , reconnectTries: 120
    })

    var index = 0;
    var errorCount = 0;
    var reconnect = false;
    var stopped = false;
    var started = false;

    var messageHandler = function(err, r) {
      // console.log("--- messageHandler :: " + index)
      if(err) errorCount = errorCount + 1;
      index = index + 1;

      if(index == 500) {
        // console.log("===================== errorCount :: " + errorCount)
        // console.dir(r)
        test.ok(errorCount >= 0);
        pool.destroy();
        // console.log("=================== " + Object.keys(Connection.connections()).length)
        test.equal(0, Object.keys(Connection.connections()).length);
        Connection.disableConnectionAccounting();
        // console.log("=====================")
        // console.dir(reconnect)
        test.equal(true, stopped);
        test.equal(true, started);
        test.equal(true, reconnect);
        test.done();
      }
    }

    pool.on('reconnect', function() {
      reconnect = true;
    });

    function execute(i) {
      setTimeout(function() {
        var query = new Query(new bson(), 'system.$cmd', {ismaster:true}, {numberToSkip: 0, numberToReturn: 1});
        pool.write(query, messageHandler);

        if(i == 250) {
          // console.log("----------------------------------- 0")
          configuration.manager.stop().then(function() {
            // console.log("----------------------------------- 1")
            stopped = true;

            setTimeout(function() {
              // console.log("----------------------------------- 2")
              configuration.manager.start().then(function() {
                // console.log("----------------------------------- 3")
                started = true;
              });
            }, 5000);
          });
        }
      }, i);
    }

    // Add event listeners
    pool.on('connect', function(_pool) {
      // console.log("----------------------------------- connect 0")
      for(var i = 0; i < 500; i++) {
        execute(i);
      }
    })

    // console.log("----------------------------------- pool connect 0")
    // Start connection
    pool.connect();
  }
}

exports['Should correctly reclaim immediateRelease socket'] = {
  metadata: { requires: { topology: "single" } },

  test: function(configuration, test) {
    var Pool = require('../../../lib/connection/pool')
      , Connection = require('../../../lib/connection/connection')
      , bson = require('bson')
      , Query = require('../../../lib/connection/commands').Query;

      // console.log("============================== 0")
    // Enable connections accounting
    Connection.enableConnectionAccounting();
    // console.log("============================== 1")

    // Attempt to connect
    var pool = new Pool({
        host: configuration.host
      , port: configuration.port
      , socketTimeout: 1000
      , bson: new bson()
      , reconnect: false
    })
    // console.log("============================== 2")

    var index = 0;

    // Add event listeners
    pool.on('connect', function(_pool) {
      // console.log("============================== 3")
      var query = new Query(new bson(), 'system.$cmd', {ismaster:true}, {numberToSkip: 0, numberToReturn: 1});
      _pool.write(query, {immediateRelease: true}, function(err, r) {
        console.log("============================== 4")
        console.dir(err)
        index = index + 1;
      });


      // test.equal(1, pool.availableConnections.length);
    })

    pool.on('timeout', function(err, _pool) {
      // console.log("============================== 5")
      // console.log("============================== 2")
      test.equal(0, index);

      pool.destroy();
      // console.log("=================== " + Object.keys(Connection.connections()).length)
      test.equal(0, Object.keys(Connection.connections()).length);
      Connection.disableConnectionAccounting();
      test.done();
    });

    // console.log("============================== 6")
    // Start connection
    pool.connect();
    // console.log("============================== 7")
  }
}

exports['Should correctly authenticate using scram-sha-1 using connect auth'] = {
  metadata: { requires: { topology: "auth" } },

  test: function(configuration, test) {
    var Pool = require('../../../lib/connection/pool')
      , Connection = require('../../../lib/connection/connection')
      , bson = require('bson')
      , Query = require('../../../lib/connection/commands').Query;

    // Enable connections accounting
    Connection.enableConnectionAccounting();

    // Restart instance
    configuration.manager.restart(true).then(function() {
      locateAuthMethod(configuration, function(err, method) {
        test.equal(null, err);

        executeCommand(configuration, 'admin', {
          createUser: 'root',
          pwd: "root",
          roles: [ { role: "root", db: "admin" } ],
          digestPassword: true
        }, function(err, r) {
          test.equal(null, err);
          // Attempt to connect
          var pool = new Pool({
            host: configuration.host, port: configuration.port, bson: new bson()
          })

          // Add event listeners
          pool.on('connect', function(_pool) {
            executeCommand(configuration, 'admin', {
              dropUser: 'root'
            }, { auth: [method, 'admin', 'root', 'root']}, function(err, r) {
              test.equal(null, err);

              _pool.destroy(true);
              // console.log("=================== " + Object.keys(Connection.connections()).length)
              test.equal(0, Object.keys(Connection.connections()).length);
              Connection.disableConnectionAccounting();
              test.done();
            });
          });

          // Start connection
          pool.connect(method, 'admin', 'root', 'root');
        });
      });
    });
  }
}

exports['Should correctly authenticate using scram-sha-1 using connect auth and maintain auth on new connections'] = {
  metadata: { requires: { topology: "auth" } },

  test: function(configuration, test) {
    var Pool = require('../../../lib/connection/pool')
      , Connection = require('../../../lib/connection/connection')
      , bson = require('bson')
      , Query = require('../../../lib/connection/commands').Query;

    // Enable connections accounting
    Connection.enableConnectionAccounting();

    // Restart instance
    configuration.manager.restart(true).then(function() {
      locateAuthMethod(configuration, function(err, method) {
        test.equal(null, err);

        executeCommand(configuration, 'admin', {
          createUser: 'root', pwd: "root", roles: [ { role: "root", db: "admin" } ], digestPassword: true
        }, function(err, r) {
          test.equal(null, err);

          executeCommand(configuration, 'test', {
            createUser: 'admin', pwd: "admin", roles: [ "readWrite", "dbAdmin" ], digestPassword: true
          }, { auth: [method, 'admin', 'root', 'root'] }, function(err, r) {
            test.equal(null, err);

            // Attempt to connect
            var pool = new Pool({
              host: configuration.host, port: configuration.port, bson: new bson()
            })

            var index = 0;

            var messageHandler = function(err, result) {
              index = index + 1;

              // Tests
              test.equal(null, err);
              test.equal(1, result.result.n);
              // Did we receive an answer for all the messages
              if(index == 100) {
                test.equal(5, pool.socketCount());

                pool.destroy(true);
                // console.log("=================== " + Object.keys(Connection.connections()).length)
                test.equal(0, Object.keys(Connection.connections()).length);
                Connection.disableConnectionAccounting();
                test.done();
              }
            }

            // Add event listeners
            pool.on('connect', function(_pool) {
              for(var i = 0; i < 10; i++)
              process.nextTick(function() {
                var query = new Query(new bson(), 'test.$cmd', {insert:'test', documents:[{a:1}]}, {numberToSkip: 0, numberToReturn: 1});
                _pool.write(query, {command:true, requestId: query.requestId }, messageHandler)

                var query = new Query(new bson(), 'test.$cmd', {insert:'test', documents:[{a:1}]}, {numberToSkip: 0, numberToReturn: 1});
                _pool.write(query, {command:true, requestId: query.requestId }, messageHandler)

                var query = new Query(new bson(), 'test.$cmd', {insert:'test', documents:[{a:1}]}, {numberToSkip: 0, numberToReturn: 1});
                _pool.write(query, {command:true, requestId: query.requestId }, messageHandler)

                var query = new Query(new bson(), 'test.$cmd', {insert:'test', documents:[{a:1}]}, {numberToSkip: 0, numberToReturn: 1});
                _pool.write(query, {command:true, requestId: query.requestId }, messageHandler)

                var query = new Query(new bson(), 'test.$cmd', {insert:'test', documents:[{a:1}]}, {numberToSkip: 0, numberToReturn: 1});
                _pool.write(query, {command:true, requestId: query.requestId }, messageHandler)

                var query = new Query(new bson(), 'test.$cmd', {insert:'test', documents:[{a:1}]}, {numberToSkip: 0, numberToReturn: 1});
                _pool.write(query, {command:true, requestId: query.requestId }, messageHandler)

                var query = new Query(new bson(), 'test.$cmd', {insert:'test', documents:[{a:1}]}, {numberToSkip: 0, numberToReturn: 1});
                _pool.write(query, {command:true, requestId: query.requestId }, messageHandler)

                var query = new Query(new bson(), 'test.$cmd', {insert:'test', documents:[{a:1}]}, {numberToSkip: 0, numberToReturn: 1});
                _pool.write(query, {command:true, requestId: query.requestId }, messageHandler)

                var query = new Query(new bson(), 'test.$cmd', {insert:'test', documents:[{a:1}]}, {numberToSkip: 0, numberToReturn: 1});
                _pool.write(query, {command:true, requestId: query.requestId }, messageHandler)

                var query = new Query(new bson(), 'test.$cmd', {insert:'test', documents:[{a:1}]}, {numberToSkip: 0, numberToReturn: 1});
                _pool.write(query, {command:true, requestId: query.requestId }, messageHandler)
              });
            });

            // Start connection
            pool.connect(method, 'test', 'admin', 'admin');
          });
        });
      });
    });
  }
}

exports['Should correctly authenticate using scram-sha-1 using auth method'] = {
  metadata: { requires: { topology: "auth" } },

  test: function(configuration, test) {
    var Pool = require('../../../lib/connection/pool')
      , Connection = require('../../../lib/connection/connection')
      , bson = require('bson')
      , Query = require('../../../lib/connection/commands').Query;

    // Enable connections accounting
    Connection.enableConnectionAccounting();

    // Restart instance
    configuration.manager.restart(true).then(function() {
      locateAuthMethod(configuration, function(err, method) {
        test.equal(null, err);

        executeCommand(configuration, 'admin', {
          createUser: 'root', pwd: "root", roles: [ { role: "root", db: "admin" } ], digestPassword: true
        }, function(err, r) {
          test.equal(null, err);

          executeCommand(configuration, 'test', {
            createUser: 'admin', pwd: "admin", roles: [ "readWrite", "dbAdmin" ], digestPassword: true
          }, { auth: [method, 'admin', 'root', 'root'] }, function(err, r) {
            test.equal(null, err);

            // Attempt to connect
            var pool = new Pool({
              host: configuration.host, port: configuration.port, bson: new bson()
            })

            var index = 0;
            var error = false;

            var messageHandler = function(err, result) {
              index = index + 1;

              // Tests
              test.equal(null, err);
              test.equal(1, result.result.n);
              // Did we receive an answer for all the messages
              if(index == 100) {
                test.equal(5, pool.socketCount());
                test.equal(false, error);

                pool.destroy(true);
                // console.log("=================== " + Object.keys(Connection.connections()).length)
                test.equal(0, Object.keys(Connection.connections()).length);
                Connection.disableConnectionAccounting();
                test.done();
              }
            }

            // Add event listeners
            pool.on('connect', function(_pool) {
              pool.auth(method, 'test', 'admin', 'admin', function(err, r) {
                for(var i = 0; i < 100; i++) {
                  process.nextTick(function() {
                    var query = new Query(new bson(), 'test.$cmd', {insert:'test', documents:[{a:1}]}, {numberToSkip: 0, numberToReturn: 1});
                    _pool.write(query, {command:true, requestId: query.requestId}, messageHandler)
                  });
                }
              });

              for(var i = 0; i < 100; i++) {
                process.nextTick(function() {
                  var query = new Query(new bson(), 'system.$cmd', {ismaster:true}, {numberToSkip: 0, numberToReturn: 1});
                  _pool.write(query, {command:true, requestId: query.requestId}, function(e, r) {if(e) error = e;});
                });
              }
            });

            // Start connection
            pool.connect();
          });
        });
      });
    });
  }
}

exports['Should correctly authenticate using scram-sha-1 using connect auth then logout'] = {
  metadata: { requires: { topology: "auth" } },

  test: function(configuration, test) {
    var Pool = require('../../../lib/connection/pool')
      , Connection = require('../../../lib/connection/connection')
      , bson = require('bson')
      , Query = require('../../../lib/connection/commands').Query;

    // Enable connections accounting
    Connection.enableConnectionAccounting();

    // Restart instance
    configuration.manager.restart(true).then(function() {
      locateAuthMethod(configuration, function(err, method) {
        test.equal(null, err);

        executeCommand(configuration, 'admin', {
          createUser: 'root', pwd: "root", roles: [ { role: "root", db: "admin" } ], digestPassword: true
        }, function(err, r) {
          test.equal(null, err);

          executeCommand(configuration, 'test', {
            createUser: 'admin', pwd: "admin", roles: [ "readWrite", "dbAdmin" ], digestPassword: true
          }, { auth: [method, 'admin', 'root', 'root'] }, function(err, r) {
            test.equal(null, err);
            // Attempt to connect
            var pool = new Pool({
              host: configuration.host, port: configuration.port, bson: new bson()
            })

            // Add event listeners
            pool.on('connect', function(_pool) {
              var query = new Query(new bson(), 'test.$cmd', {insert:'test', documents:[{a:1}]}, {numberToSkip: 0, numberToReturn: 1});
              _pool.write(query, {command:true, requestId: query.requestId}, function(err, r) {
                test.equal(null, err);

                // Logout pool
                _pool.logout('test', function(err) {
                  test.equal(null, err);

                  _pool.write(query, {command:true, requestId: query.requestId}, function(err, r) {
                    test.ok(err != null);

                    _pool.destroy(true);
                    // console.log("=================== " + Object.keys(Connection.connections()).length)
                    test.equal(0, Object.keys(Connection.connections()).length);
                    Connection.disableConnectionAccounting();
                    test.done();
                  });
                });
              });
            });

            // Start connection
            pool.connect(method, 'test', 'admin', 'admin');
          });
        });
      });
    });
  }
}

exports['Should correctly have auth wait for logout to finish'] = {
  metadata: { requires: { topology: "auth" } },

  test: function(configuration, test) {
    var Pool = require('../../../lib/connection/pool')
      , Connection = require('../../../lib/connection/connection')
      , bson = require('bson')
      , Query = require('../../../lib/connection/commands').Query;

    // Enable connections accounting
    Connection.enableConnectionAccounting();

    // Restart instance
    configuration.manager.restart(true).then(function() {
      locateAuthMethod(configuration, function(err, method) {
        test.equal(null, err);

        executeCommand(configuration, 'admin', {
          createUser: 'root', pwd: "root", roles: [ { role: "root", db: "admin" } ], digestPassword: true
        }, function(err, r) {
          test.equal(null, err);

          executeCommand(configuration, 'test', {
            createUser: 'admin', pwd: "admin", roles: [ "readWrite", "dbAdmin" ], digestPassword: true
          }, { auth: [method, 'admin', 'root', 'root'] }, function(err, r) {
            test.equal(null, err);
            // Attempt to connect
            var pool = new Pool({
              host: configuration.host, port: configuration.port, bson: new bson()
            })

            // Add event listeners
            pool.on('connect', function(_pool) {
              var query = new Query(new bson(), 'test.$cmd', {insert:'test', documents:[{a:1}]}, {numberToSkip: 0, numberToReturn: 1});
              _pool.write(query, {requestId: query.requestId}, function(err, r) {
                test.equal(null, err);

                // Logout pool
                _pool.logout('test', function(err) {
                  test.equal(null, err);
                });

                pool.auth(method, 'test', 'admin', 'admin', function(err, r) {
                  test.equal(null, err);

                  _pool.write(query, {requestId: query.requestId}, function(err, r) {
                    test.equal(null, err);

                    _pool.destroy(true);
                    // console.log("=================== " + Object.keys(Connection.connections()).length)
                    test.equal(0, Object.keys(Connection.connections()).length);
                    Connection.disableConnectionAccounting();
                    test.done();
                  });
                });
              });
            });

            // Start connection
            pool.connect(method, 'test', 'admin', 'admin');
          });
        });
      });
    });
  }
}

exports['Should remove all connections from further use during reauthentication of a pool'] = {
  metadata: { requires: { topology: 'single' } },

  test: function(configuration, test) {
    var Pool = require('../../../lib/connection/pool')
      , Connection = require('../../../lib/connection/connection')
      , bson = require('bson')
      , Query = require('../../../lib/connection/commands').Query
      , co = require('co')
      , mockupdb = require('../../mock');

    var server = null;
    var running = true;
    co(function*() {
      server = yield mockupdb.createServer(17017, 'localhost');

      co(function*() {
        var authCount = 0;
        while(running) {
          var request = yield server.receive();
          var doc = request.document;

          if (doc.getnonce) {
            request.reply({ ok: 1, result: { nonce: 'testing' } });
          } else if (doc.authenticate) {
            request.reply({ ok: 1 });
          } else if (doc.ismaster) {
            setTimeout(function() { request.reply({ ok: 1 }); }, 10000);
          }
        }
      });

      var pool = new Pool({
        host: 'localhost',
        port: 17017,
        bson: new bson(),
        size: 10
      });

      var query =
        new Query(new bson(), 'system.$cmd', { ismaster:true }, { numberToSkip: 0, numberToReturn: 1 });

      pool.on('connect', function() {
        pool.write(query, { monitoring: true }, function() {});

        setTimeout(function() {
          var queryConnection = pool.inUseConnections[0];
          pool.auth('mongocr', 'test', 'admin', 'admin', function(err) {
            test.equal(err, null);

            // ensure that there are no duplicates in the available connection queue
            var availableIds = pool.availableConnections.map(function(conn) { return conn.id; });
            availableIds.forEach(function(id, pos, arr) {
              test.equal(arr.indexOf(id), pos);
            });

            test.equal(pool.availableConnections.length, 1);
            test.equal(pool.inUseConnections.length, 0);

            running = false;
            pool.destroy(true);
            test.equal(0, Object.keys(Connection.connections()).length);
            Connection.disableConnectionAccounting();
            test.done();
          });
        }, 500);
      });

      pool.connect();
    });
  }
}

exports['Should correctly exit _execute loop when single avialable connection is destroyed'] = {
  metadata: { requires: { topology: "single" } },

  test: function(configuration, test) {
    var Pool = require('../../../lib/connection/pool')
      , Connection = require('../../../lib/connection/connection')
      , bson = require('bson')
      , Query = require('../../../lib/connection/commands').Query;

    // Enable connections accounting
    Connection.enableConnectionAccounting();

    // Attempt to connect
    var pool = new Pool({
        host: configuration.host
      , port: configuration.port
      , bson: new bson()
      , size: 1
      , socketTimeout: 500
      , messageHandler: function() {}
    });

    // Add event listeners
    pool.on('connect', function(_pool) {
      // Execute ismaster should not cause cpu to start spinning
      var query = new Query(new bson(), 'system.$cmd', {ismaster:true}, {numberToSkip: 0, numberToReturn: 1});
      _pool.write(query, function(err, result) {
        test.equal(null, err);

        // Mark available connection as broken
        var con = pool.availableConnections[0];
        pool.availableConnections[0].destroyed = true;

        // Execute ismaster should not cause cpu to start spinning
        var query = new Query(new bson(), 'system.$cmd', {ismaster:true}, {numberToSkip: 0, numberToReturn: 1});
        _pool.write(query, function(err, result) {
          test.equal(null, err);

          con.destroy();
          _pool.destroy();

          Connection.disableConnectionAccounting();
          test.done();
        });
      });
    });

    // Start connection
    pool.connect();
  }
}
