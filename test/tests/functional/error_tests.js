'use strict';

var f = require('util').format;

exports['should return helpful error when geoHaystack fails'] = {
  metadata: {
    requires: {
      topology: 'single'
    }
  },

  test: function(configuration, test) {
    configuration.newTopology(function(err, server) {
      var ns = f('%s.geohaystack1', configuration.db);
      server.on('connect', function(_server) {
        _server.command('system.$cmd', {geoNear: ns}, {}, function(err, result) {
          test.ok(/can\'t find ns/.test(err));
          test.done();
        });
      });

      // Start connection
      server.connect();
    });
  }
};
