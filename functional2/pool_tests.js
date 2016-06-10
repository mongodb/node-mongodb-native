"use strict";

var f = require('util').format;

exports['Should correctly connect pool to single server'] = {
  metadata: { requires: { topology: "single" } },

  test: function(configuration, test) {
    var Pool = require('../../../lib2/connection/pool')
      , bson = require('bson').BSONPure.BSON;

    // Attempt to connect
    var pool = new Pool({
        host: configuration.host
      , port: configuration.port
      , bson: new bson()
      , messageHandler: function() {}
    })

    // Add event listeners
    pool.on('connect', function(_pool) {
      _pool.destroy();
      test.done();
    })

    // Start connection
    pool.connect();
  }
}

exports['Should correctly write ismaster operation to the server'] = {
  metadata: { requires: { topology: "single" } },

  test: function(configuration, test) {
    var Pool = require('../../../lib2/connection/pool')
      , bson = require('bson').BSONPure.BSON
      , Query = require('../../../lib2/connection/commands').Query;

    // Attempt to connect
    var pool = new Pool({
        host: configuration.host
      , port: configuration.port
      , bson: new bson()
    })

    // Add event listeners
    pool.on('connect', function(_pool) {
      var query = new Query(new bson(), 'system.$cmd', {ismaster:true}, {numberToSkip: 0, numberToReturn: 1});
      _pool.write(query.toBin(), function(err, result) {
        test.equal(null, err);
        test.equal(true, result.result.ismaster);
        _pool.destroy();
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
    var Pool = require('../../../lib2/connection/pool')
      , bson = require('bson').BSONPure.BSON
      , Query = require('../../../lib2/connection/commands').Query;

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

      test.equal(true, result.result.ismaster);
      // Did we receive an answer for all the messages
      if(index == 100) {
        test.equal(5, pool.socketCount());

        pool.destroy();
        test.done();
      }
    }

    // Add event listeners
    pool.on('connect', function(_pool) {
      for(var i = 0; i < 10; i++)
      process.nextTick(function() {
        var query = new Query(new bson(), 'system.$cmd', {ismaster:true}, {numberToSkip: 0, numberToReturn: 1});
        _pool.write(query.toBin(), messageHandler)

        var query = new Query(new bson(), 'system.$cmd', {ismaster:true}, {numberToSkip: 0, numberToReturn: 1});
        _pool.write(query.toBin(), messageHandler)

        var query = new Query(new bson(), 'system.$cmd', {ismaster:true}, {numberToSkip: 0, numberToReturn: 1});
        _pool.write(query.toBin(), messageHandler)

        var query = new Query(new bson(), 'system.$cmd', {ismaster:true}, {numberToSkip: 0, numberToReturn: 1});
        _pool.write(query.toBin(), messageHandler)

        var query = new Query(new bson(), 'system.$cmd', {ismaster:true}, {numberToSkip: 0, numberToReturn: 1});
        _pool.write(query.toBin(), messageHandler)

        var query = new Query(new bson(), 'system.$cmd', {ismaster:true}, {numberToSkip: 0, numberToReturn: 1});
        _pool.write(query.toBin(), messageHandler)

        var query = new Query(new bson(), 'system.$cmd', {ismaster:true}, {numberToSkip: 0, numberToReturn: 1});
        _pool.write(query.toBin(), messageHandler)

        var query = new Query(new bson(), 'system.$cmd', {ismaster:true}, {numberToSkip: 0, numberToReturn: 1});
        _pool.write(query.toBin(), messageHandler)

        var query = new Query(new bson(), 'system.$cmd', {ismaster:true}, {numberToSkip: 0, numberToReturn: 1});
        _pool.write(query.toBin(), messageHandler)

        var query = new Query(new bson(), 'system.$cmd', {ismaster:true}, {numberToSkip: 0, numberToReturn: 1});
        _pool.write(query.toBin(), messageHandler)
      })
    })

    // Start connection
    pool.connect();
  }
}

exports['Should correctly write ismaster operation to the server and handle timeout'] = {
  metadata: { requires: { topology: "single" } },

  test: function(configuration, test) {
    var Pool = require('../../../lib2/connection/pool')
      , bson = require('bson').BSONPure.BSON
      , Query = require('../../../lib2/connection/commands').Query;

    // Attempt to connect
    var pool = new Pool({
        host: configuration.host
      , port: configuration.port
      , socketTimeout: 3000
      , bson: new bson()
    })

    // Add event listeners
    pool.on('connect', function(_pool) {
      var query = new Query(new bson(), 'system.$cmd', {ismaster:true}, {numberToSkip: 0, numberToReturn: 1});
      _pool.write(query.toBin(), function() {});
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
    var Pool = require('../../../lib2/connection/pool')
      , bson = require('bson').BSONPure.BSON
      , Query = require('../../../lib2/connection/commands').Query;

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

      if(index == 500) {
        test.ok(errorCount >= 250);
        pool.destroy();
        test.done();
      }
    }

    function execute(i) {
      setTimeout(function() {
        var query = new Query(new bson(), 'system.$cmd', {ismaster:true}, {numberToSkip: 0, numberToReturn: 1});
        pool.write(query.toBin(), messageHandler);
        if(i == 250) {
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
    var Pool = require('../../../lib2/connection/pool')
      , bson = require('bson').BSONPure.BSON
      , Query = require('../../../lib2/connection/commands').Query;

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
      console.log("--- messageHandler :: " + index)
      if(err) errorCount = errorCount + 1;
      index = index + 1;

      if(index == 500) {
        test.ok(errorCount >= 0);
        pool.destroy();
        test.done();
      }
    }

    function execute(i) {
      setTimeout(function() {
        var query = new Query(new bson(), 'system.$cmd', {ismaster:true}, {numberToSkip: 0, numberToReturn: 1});
        pool.write(query.toBin(), messageHandler);
        if(i == 250) {
          console.log("==== restart 0")
          configuration.manager.restart(true).then(function() {
            console.log("==== restart 1")
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

    // Start connection
    pool.connect();
  }
}

exports['Should correctly reclaim immediateRelease socket'] = {
  metadata: { requires: { topology: "single" } },

  test: function(configuration, test) {
    var Pool = require('../../../lib2/connection/pool')
      , bson = require('bson').BSONPure.BSON
      , Query = require('../../../lib2/connection/commands').Query;

    // Attempt to connect
    var pool = new Pool({
        host: configuration.host
      , port: configuration.port
      , socketTimeout: 1000
      , bson: new bson()
      , messageHandler: function(response) {
        pool.destroy();
        test.done();
      }
    })

    var index = 0;

    // Add event listeners
    pool.on('connect', function(_pool) {
      var query = new Query(new bson(), 'system.$cmd', {ismaster:true}, {numberToSkip: 0, numberToReturn: 1});
      _pool.write(query.toBin(), {immediateRelease: true}, function() {
        index = index + 1;
      });

      test.equal(1, pool.availableConnections.length);
    })

    pool.on('timeout', function(err, _pool) {
      test.equal(0, index);

      pool.destroy();
      test.done();
    });

    // Start connection
    pool.connect();
  }
}

function executeCommand(configuration, db, cmd, options, cb) {
  var Pool = require('../../../lib2/connection/pool')
    , MongoError = require('../../../lib2/error')
    , bson = require('bson').BSONPure.BSON
    , Query = require('../../../lib2/connection/commands').Query;

  // Optional options
  if(typeof options == 'function') cb = options, options = {};
  // Set the default options object if none passed in
  options = options || {};

  // Attempt to connect
  var pool = new Pool({
    host: configuration.host, port: configuration.port, bson: new bson()
  });

  // Add event listeners
  pool.on('connect', function(_pool) {
    var query = new Query(new bson(), f('%s.$cmd', db), cmd, {numberToSkip: 0, numberToReturn: 1});
    _pool.write(query.toBin(), {}, function(err, result) {
      if(err) console.log(err.stack)
      // Close the pool
      _pool.destroy();
      // If we have an error return
      if(err) return cb(err);
      // Return the result
      cb(null, result.result);
    });
  });

  pool.connect.apply(pool, options.auth);
}

function locateAuthMethod(configuration, cb) {
  var Pool = require('../../../lib2/connection/pool')
    , MongoError = require('../../../lib2/error')
    , bson = require('bson').BSONPure.BSON
    , Query = require('../../../lib2/connection/commands').Query;

  // Set up operations
  var db = 'admin';
  var cmd = {ismaster:true}

  // Attempt to connect
  var pool = new Pool({
    host: configuration.host, port: configuration.port, bson: new bson()
  });

  // Add event listeners
  pool.on('connect', function(_pool) {
    var query = new Query(new bson(), f('%s.$cmd', db), cmd, {numberToSkip: 0, numberToReturn: 1});
    _pool.write(query.toBin(), {}, function(err, result) {
      if(err) console.log(err.stack)
      // Close the pool
      _pool.destroy();
      // If we have an error return
      if(err) return cb(err);

      // Establish the type of auth method
      if(!result.result.maxWireVersion || result.result.maxWireVersion == 2) {
        cb(null, 'mongocr');
      } else {
        cb(null, 'scram-sha-1');
      }
    });
  });

  pool.connect.apply(pool);
}

exports['Should correctly authenticate using scram-sha-1 using connect auth'] = {
  metadata: { requires: { topology: "auth" } },

  test: function(configuration, test) {
    var Pool = require('../../../lib2/connection/pool')
      , bson = require('bson').BSONPure.BSON
      , Query = require('../../../lib2/connection/commands').Query;

    // Restart instance
    configuration.manager.restart().then(function() {
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

              _pool.destroy();
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
    var Pool = require('../../../lib2/connection/pool')
      , bson = require('bson').BSONPure.BSON
      , Query = require('../../../lib2/connection/commands').Query;

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

                pool.destroy();
                test.done();
              }
            }

            // Add event listeners
            pool.on('connect', function(_pool) {
              for(var i = 0; i < 10; i++)
              process.nextTick(function() {
                var query = new Query(new bson(), 'test.$cmd', {insert:'test', documents:[{a:1}]}, {numberToSkip: 0, numberToReturn: 1});
                _pool.write(query.toBin(), messageHandler)

                var query = new Query(new bson(), 'test.$cmd', {insert:'test', documents:[{a:1}]}, {numberToSkip: 0, numberToReturn: 1});
                _pool.write(query.toBin(), messageHandler)

                var query = new Query(new bson(), 'test.$cmd', {insert:'test', documents:[{a:1}]}, {numberToSkip: 0, numberToReturn: 1});
                _pool.write(query.toBin(), messageHandler)

                var query = new Query(new bson(), 'test.$cmd', {insert:'test', documents:[{a:1}]}, {numberToSkip: 0, numberToReturn: 1});
                _pool.write(query.toBin(), messageHandler)

                var query = new Query(new bson(), 'test.$cmd', {insert:'test', documents:[{a:1}]}, {numberToSkip: 0, numberToReturn: 1});
                _pool.write(query.toBin(), messageHandler)

                var query = new Query(new bson(), 'test.$cmd', {insert:'test', documents:[{a:1}]}, {numberToSkip: 0, numberToReturn: 1});
                _pool.write(query.toBin(), messageHandler)

                var query = new Query(new bson(), 'test.$cmd', {insert:'test', documents:[{a:1}]}, {numberToSkip: 0, numberToReturn: 1});
                _pool.write(query.toBin(), messageHandler)

                var query = new Query(new bson(), 'test.$cmd', {insert:'test', documents:[{a:1}]}, {numberToSkip: 0, numberToReturn: 1});
                _pool.write(query.toBin(), messageHandler)

                var query = new Query(new bson(), 'test.$cmd', {insert:'test', documents:[{a:1}]}, {numberToSkip: 0, numberToReturn: 1});
                _pool.write(query.toBin(), messageHandler)

                var query = new Query(new bson(), 'test.$cmd', {insert:'test', documents:[{a:1}]}, {numberToSkip: 0, numberToReturn: 1});
                _pool.write(query.toBin(), messageHandler)
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
    var Pool = require('../../../lib2/connection/pool')
      , bson = require('bson').BSONPure.BSON
      , Query = require('../../../lib2/connection/commands').Query;

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

                pool.destroy();
                test.done();
              }
            }

            // Add event listeners
            pool.on('connect', function(_pool) {
              pool.auth(method, 'test', 'admin', 'admin', function(err, r) {
                for(var i = 0; i < 100; i++) {
                  process.nextTick(function() {
                    var query = new Query(new bson(), 'test.$cmd', {insert:'test', documents:[{a:1}]}, {numberToSkip: 0, numberToReturn: 1});
                    _pool.write(query.toBin(), messageHandler)
                  });
                }
              });

              for(var i = 0; i < 100; i++) {
                process.nextTick(function() {
                  var query = new Query(new bson(), 'system.$cmd', {ismaster:true}, {numberToSkip: 0, numberToReturn: 1});
                  _pool.write(query.toBin(), function(e, r) {if(e) error = e;});
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
