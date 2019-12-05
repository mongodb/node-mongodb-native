'use strict';

var expect = require('chai').expect,
  fs = require('fs'),
  p = require('path'),
  ReplSetState = require('../../../lib/core/topologies/replset_state'),
  MongoError = require('../../../lib/core/error').MongoError,
  ReadPreference = require('../../../lib/core/topologies/read_preference');

describe('A replicaset with no primary', function() {
  before(function() {
    // These tests are not relevant to the new topology layer
    if (this.configuration.usingUnifiedTopology()) this.skip();
  });

  it('should correctly execute server selection tests', {
    metadata: { requires: { topology: 'single' } },

    test: function(done) {
      const config = this.configuration;
      var path = p.resolve(
        __dirname,
        '../../spec/server-selection/server_selection/ReplicaSetNoPrimary/read'
      );
      var entries = fs.readdirSync(path).filter(function(x) {
        return x.indexOf('.json') !== -1;
      });

      // Execute each of the entries
      entries.forEach(function(x) {
        executeEntry(config, x, `${path}/${x}`);
      });

      done();
    }
  });
});

describe('A replicaset with a primary', function() {
  before(function() {
    // These tests are not relevant to the new topology layer
    if (this.configuration.usingUnifiedTopology()) this.skip();
  });

  it('should correctly execute server selection tests', {
    metadata: { requires: { topology: 'single' } },

    test: function(done) {
      const config = this.configuration;
      var path = p.resolve(
        __dirname,
        '../../spec/server-selection/server_selection/ReplicaSetWithPrimary/read'
      );

      var entries = fs.readdirSync(path).filter(function(x) {
        return x.indexOf('.json') !== -1;
      });

      // Execute each of the entries
      entries.forEach(function(x) {
        executeEntry(config, x, `${path}/${x}`);
      });

      done();
    }
  });
});

function convert(mode) {
  if (mode.toLowerCase() === 'primarypreferred') return 'primaryPreferred';
  if (mode.toLowerCase() === 'secondarypreferred') return 'secondaryPreferred';
  return mode.toLowerCase();
}

function executeEntry(config, file, path) {
  // Read and parse the json file
  file = require(path);

  // Let's pick out the parts of the selection specification
  var topologyDescription = file.topology_description;
  var inLatencyWindow = file.in_latency_window;
  var readPreference = file.read_preference;

  try {
    // Create a Replset and populate it with dummy topology servers
    var replset = new ReplSetState();
    replset.topologyType = topologyDescription.type;
    // For each server add them to the state
    topologyDescription.servers.forEach(function(s) {
      var server = config.newTopology(
        s.address.split(':')[0],
        parseInt(s.address.split(':')[1], 10)
      );

      // Add additional information
      if (s.avg_rtt_ms) server.lastIsMasterMS = s.avg_rtt_ms;
      if (s.tags) server.ismaster = { tags: s.tags };
      // Ensure the server looks connected
      server.isConnected = function() {
        return true;
      };

      if (s.type === 'RSSecondary') {
        replset.secondaries.push(server);
      } else if (s.type === 'RSPrimary') {
        replset.primary = server;
      } else if (s.type === 'RSArbiter') {
        replset.arbiters.push(server);
      }
    });

    // Create read preference
    let rp;
    if (convert(readPreference.mode) !== 'primary' && readPreference.tag_sets) {
      rp = new ReadPreference(convert(readPreference.mode), readPreference.tag_sets);
    } else {
      rp = new ReadPreference(convert(readPreference.mode));
    }

    // Perform a pickServer
    var server = replset.pickServer(rp);
    var foundWindow = null;

    // server should be in the latency window
    for (var i = 0; i < inLatencyWindow.length; i++) {
      var w = inLatencyWindow[i];

      if (server.name === w.address) {
        foundWindow = w;
        break;
      }
    }

    if (
      ['ReplicaSetNoPrimary', 'Primary', 'ReplicaSetWithPrimary'].indexOf(
        topologyDescription.type
      ) !== -1 &&
      inLatencyWindow.length === 0
    ) {
      if (server instanceof MongoError) {
        expect(server.message).to.equal('no primary server available');
      } else {
        expect(server).to.be.null;
      }
    } else {
      expect(foundWindow).to.not.be.null;
    }
  } catch (err) {
    console.log(err.stack);
    process.exit(0);
  }
}
