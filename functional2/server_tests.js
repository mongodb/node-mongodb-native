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
