'use strict';

var expect = require('chai').expect,
  f = require('util').format,
  fs = require('fs'),
  ReplSetState = require('../../../lib/topologies/replset_state'),
  MongoError = require('../../../lib/error').MongoError,
  ReadPreference = require('../../../lib/topologies/read_preference'),
  Server = require('../../../lib/topologies/server');

describe('A replicaset with no primary', function() {
  it('should correctly execute server selection tests', {
    metadata: { requires: { topology: 'single' } },

    test: function(done) {
      var path = f(
        '%s/../server-selection/tests/server_selection/ReplicaSetNoPrimary/read',
        __dirname
      );
      var entries = fs.readdirSync(path).filter(function(x) {
        return x.indexOf('.json') !== -1;
      });

      // Execute each of the entries
      entries.forEach(function(x) {
        executeEntry(x, f('%s/%s', path, x));
      });

      done();
    }
  });
});

describe('A replicaset with a primary', function() {
  it('should correctly execute server selection tests', {
    metadata: { requires: { topology: 'single' } },

    test: function(done) {
      var path = f(
        '%s/../server-selection/tests/server_selection/ReplicaSetWithPrimary/read',
        __dirname
      );
      var entries = fs.readdirSync(path).filter(function(x) {
        return x.indexOf('.json') !== -1;
      });

      // Execute each of the entries
      entries.forEach(function(x) {
        executeEntry(x, f('%s/%s', path, x));
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

function executeEntry(file, path) {
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
      var server = new Server({
        host: s.address.split(':')[0],
        port: parseInt(s.address.split(':')[1], 10)
      });

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
    var rp = new ReadPreference(convert(readPreference.mode), readPreference.tag_sets);

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
