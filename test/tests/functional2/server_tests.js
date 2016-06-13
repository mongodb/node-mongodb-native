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
      server.insert('test.inserts', {a:1}, function(err, r) {
        test.equal(null, err);
        test.equal(1, r.result.n);

        server.insert('test.inserts', {a:1}, {ordered:false}, function(err, r) {
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
      server.insert('test.inserts', [{a:1}, {b:1}], function(err, r) {
        test.equal(null, err);
        test.equal(2, r.result.n);

        server.insert('test.inserts', [{a:1}, {b:1}], {ordered:false}, function(err, r) {
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
      server.insert('test.inserts', {a:1}, {writeConcern: {w:0}}, function(err, r) {
        test.equal(null, err);
        test.equal(1, r.result.ok);

        server.insert('test.inserts', {a:1}, {ordered:false, writeConcern: {w:0}}, function(err, r) {
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
