'use strict';

var f = require('util').format;

exports['should return helpful error when geoHaystack fails'] = {
  metadata: {
    requires: { topology: ["single", "replicaset"] }
  },

  test: function(configuration, test) {
    configuration.newTopology(function(err, server) {
      var ns = f('%s.geohaystack1', configuration.db);
      server.on('connect', function(_server) {
        _server.command('system.$cmd', {geoNear: ns}, {}, function(err, result) {
          test.ok(/can\'t find ns/.test(err));
          _server.destroy();
          test.done();
        });
      });

      // Start connection
      server.connect();
    });
  }
};

exports['should create a MongoError from string'] = {
  metadata: {
    requires: { topology: ["single"] }
  },

  test: function(configuration, test) {
    var MongoError = require('../../../lib/error.js').MongoError;

    var errorMessage = 'A test error';
    var err = new MongoError(errorMessage);
    test.ok(err instanceof Error);
    test.equal(err.name, 'MongoError');
    test.equal(err.message, errorMessage);

    test.done();
  }
};

exports['should create a MongoError from Error'] = {
  metadata: {
    requires: { topology: ["single"] }
  },

  test: function(configuration, test) {
    var MongoError = require('../../../lib/error.js').MongoError;

    var errorMessage = 'A test error';
    var err = new MongoError(new Error(errorMessage));
    test.ok(err instanceof Error);
    test.equal(err.name, 'MongoError');
    test.equal(err.message, errorMessage);

    test.done();
  }
};

exports['should create a MongoError from object'] = {
  metadata: {
    requires: { topology: ["single"] }
  },

  test: function(configuration, test) {
    var MongoError = require('../../../lib/error.js').MongoError;

    var errorMessage = 'A test error';
    var err = new MongoError({message: errorMessage, someData: 12345});
    test.ok(err instanceof Error);
    test.equal(err.name, 'MongoError');
    test.equal(err.message, errorMessage);
    test.equal(err.someData, 12345);

    test.done();
  }
};

exports['should create a MongoNetworkError'] = {
  metadata: {
    requires: { topology: ["single"] }
  },

  test: function(configuration, test) {
    var errors = require('../../../lib/error');

    var errorMessage = 'A test error';
    var err = new errors.MongoNetworkError(errorMessage);
    test.ok(err instanceof Error);
    test.ok(err instanceof errors.MongoError);
    test.equal(err.name, 'MongoNetworkError');
    test.equal(err.message, errorMessage);

    test.done();
  }
};
