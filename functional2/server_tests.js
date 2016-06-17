"use strict";

var f = require('util').format;

exports['Should correctly connect server to single instance'] = {
  metadata: { requires: { topology: "single" } },

  test: function(configuration, test) {
    var Server = require('../../../lib2/topologies/server')
      , bson = require('bson').BSONPure.BSON;

    // Attempt to connect
    var server = new Server({
        host: configuration.host
      , port: configuration.port
      , bson: new bson()
    })

    // Add event listeners
    server.on('connect', function(server) {
      server.destroy();
      test.done();
    });

    // Start connection
    server.connect();
  }
}

exports['Should correctly connect server to single instance and execute ismaster'] = {
  metadata: { requires: { topology: "single" } },

  test: function(configuration, test) {
    var Server = require('../../../lib2/topologies/server')
      , bson = require('bson').BSONPure.BSON;

    // Attempt to connect
    var server = new Server({
        host: configuration.host
      , port: configuration.port
      , bson: new bson()
    })

    // Add event listeners
    server.on('connect', function(server) {
      server.command('admin.$cmd', {ismaster:true}, function(err, r) {
        test.equal(null, err);
        test.equal(true, r.result.ismaster);
        test.ok(r.connection != null)

        server.destroy();
        test.done();
      });
    });

    // Start connection
    server.connect();
  }
}

exports['Should correctly connect server to single instance and execute ismaster returning raw'] = {
  metadata: { requires: { topology: "single" } },

  test: function(configuration, test) {
    var Server = require('../../../lib2/topologies/server')
      , bson = require('bson').BSONPure.BSON;

    // Attempt to connect
    var server = new Server({
        host: configuration.host
      , port: configuration.port
      , bson: new bson()
    })

    // Add event listeners
    server.on('connect', function(server) {
      server.command('admin.$cmd', {ismaster:true}, {
        raw: true
      }, function(err, r) {
        test.equal(null, err);
        test.ok(r.result instanceof Buffer);
        test.ok(r.connection != null)

        server.destroy();
        test.done();
      });
    });

    // Start connection
    server.connect();
  }
}

exports['Should correctly connect server to single instance and execute insert'] = {
  metadata: { requires: { topology: "single" } },

  test: function(configuration, test) {
    var Server = require('../../../lib2/topologies/server')
      , bson = require('bson').BSONPure.BSON;

    // Attempt to connect
    var server = new Server({
        host: configuration.host
      , port: configuration.port
      , bson: new bson()
    })

    // Add event listeners
    server.on('connect', function(server) {
      server.insert('integration_tests.inserts', {a:1}, function(err, r) {
        test.equal(null, err);
        test.equal(1, r.result.n);

        server.insert('integration_tests.inserts', {a:1}, {ordered:false}, function(err, r) {
          test.equal(null, err);
          test.equal(1, r.result.n);

          server.destroy();
          test.done();
        });
      });
    });

    // Start connection
    server.connect();
  }
}

exports['Should correctly connect server to single instance and execute bulk insert'] = {
  metadata: { requires: { topology: "single" } },

  test: function(configuration, test) {
    var Server = require('../../../lib2/topologies/server')
      , bson = require('bson').BSONPure.BSON;

    // Attempt to connect
    var server = new Server({
        host: configuration.host
      , port: configuration.port
      , bson: new bson()
    })

    // Add event listeners
    server.on('connect', function(server) {
      server.insert('integration_tests.inserts', [{a:1}, {b:1}], function(err, r) {
        test.equal(null, err);
        test.equal(2, r.result.n);

        server.insert('integration_tests.inserts', [{a:1}, {b:1}], {ordered:false}, function(err, r) {
          test.equal(null, err);
          test.equal(2, r.result.n);

          server.destroy();
          test.done();
        });
      });
    });

    // Start connection
    server.connect();
  }
}

exports['Should correctly connect server to single instance and execute insert with w:0'] = {
  metadata: { requires: { topology: "single" } },

  test: function(configuration, test) {
    var Server = require('../../../lib2/topologies/server')
      , bson = require('bson').BSONPure.BSON;

    // Attempt to connect
    var server = new Server({
        host: configuration.host
      , port: configuration.port
      , bson: new bson()
    })

    // Add event listeners
    server.on('connect', function(server) {
      server.insert('integration_tests.inserts', {a:1}, {writeConcern: {w:0}}, function(err, r) {
        test.equal(null, err);
        test.equal(1, r.result.ok);

        server.insert('integration_tests.inserts', {a:1}, {ordered:false, writeConcern: {w:0}}, function(err, r) {
          test.equal(null, err);
          test.equal(1, r.result.ok);

          server.destroy();
          test.done();
        });
      });
    });

    // Start connection
    server.connect();
  }
}

exports['Should correctly connect server to single instance and execute update'] = {
  metadata: { requires: { topology: "single" } },

  test: function(configuration, test) {
    var Server = require('../../../lib2/topologies/server')
      , bson = require('bson').BSONPure.BSON;

    // Attempt to connect
    var server = new Server({
        host: configuration.host
      , port: configuration.port
      , bson: new bson()
    })

    // Add event listeners
    server.on('connect', function(_server) {
      _server.update('integration_tests.inserts_example2', [{
        q: {a: 1}, u: {'$set': {b:1}}, upsert:true
      }], {
        writeConcern: {w:1}, ordered:true
      }, function(err, results) {
        test.equal(null, err);
        test.equal(1, results.result.n);

        _server.destroy();
        test.done();
      });
    });

    // Start connection
    server.connect();
  }
}

exports['Should correctly connect server to single instance and execute remove'] = {
  metadata: { requires: { topology: "single" } },

  test: function(configuration, test) {
    var Server = require('../../../lib2/topologies/server')
      , bson = require('bson').BSONPure.BSON;

    // Attempt to connect
    var server = new Server({
        host: configuration.host
      , port: configuration.port
      , bson: new bson()
    })

    // Add event listeners
    server.on('connect', function(_server) {
      server.insert('integration_tests.remove_example', {a:1}, function(err, r) {
        test.equal(null, err);
        test.equal(true, r.result.ok);

        _server.remove('integration_tests.remove_example', [{q: {a:1}, limit:1}], {
          writeConcern: {w:1}, ordered:true
        }, function(err, results) {
          test.equal(null, err);
          test.equal(1, results.result.n);

          _server.destroy();
          test.done();
        });
      });
    });

    // Start connection
    server.connect();
  }
}

/**
 * @ignore
 */
exports['Should correctly recover with multiple restarts'] = {
  metadata: { requires: { topology: ['single'] } },

  // The actual test we wish to run
  test: function(configuration, test) {
    var Server = require('../../../lib2/topologies/server')
      , bson = require('bson').BSONPure.BSON;

    var done = false;

    // Attempt to connect
    var server = new Server({
        host: configuration.host
      , port: configuration.port
      , bson: new bson()
    })

    // Add event listeners
    server.on('connect', function(_server) {
      var count = 1;
      var allDone = 0;
      var ns = "integration_tests.t";

      var execute = function() {
        if(!done) {
          server.insert(ns, {a:1, count: count}, function(err, r) {
            count = count + 1;

            // Execute find
            var cursor = _server.cursor(ns, {
              find: ns, query: {}, batchSize: 2
            });

            // Execute next
            cursor.next(function(err, d) {
              setTimeout(execute, 500);
            });
          })
        } else {
          server.insert(ns, {a:1, count: count}, function(err, r) {
            test.equal(null, err);

            // Execute find
            var cursor = _server.cursor(ns, {
              find: ns, query: {}, batchSize: 2
            });

            // Execute next
            cursor.next(function(err, d) {
              test.equal(null, err);
              server.destroy();
              test.done();
            });
          })
        }
      }

      setTimeout(execute, 500);
    });

    var count = 2

    var restartServer = function() {
      if(count == 0) {
        done = true;
        return;
      }

      count = count - 1;

      configuration.manager.stop().then(function() {
        setTimeout(function() {
          configuration.manager.start().then(function() {
            setTimeout(restartServer, 1000);
          });
        }, 2000);
      });
    }

    setTimeout(restartServer, 1000);
    server.connect();
  }
}
