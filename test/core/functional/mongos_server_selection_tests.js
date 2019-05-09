'use strict';

const expect = require('chai').expect;
const path = require('path');
const fs = require('fs');
const Mongos = require('../../../lib/topologies/mongos');
const ReadPreference = require('../../../lib/topologies/read_preference');
const Server = require('../../../lib/topologies/server');

describe('Mongos server selection tests', function() {
  var specPath = `${__dirname}/../spec/server-selection/server_selection/Sharded/read`;
  var entries = fs.readdirSync(specPath).filter(function(x) {
    return x.indexOf('.json') !== -1;
  });

  entries.forEach(entry => {
    it(path.basename(entry, '.json'), function(done) {
      executeEntry(entry, `${specPath}/${entry}`, done);
    });
  });
});

function convert(mode) {
  if (mode.toLowerCase() === 'primarypreferred') return 'primaryPreferred';
  if (mode.toLowerCase() === 'secondarypreferred') return 'secondaryPreferred';
  return mode.toLowerCase();
}

function executeEntry(file, path, done) {
  // Read and parse the json file
  file = require(path);
  // Let's pick out the parts of the selection specification
  var topologyDescription = file.topology_description;
  var inLatencyWindow = file.in_latency_window;
  var readPreferenceSpec = file.read_preference;

  try {
    // Create a Replset and populate it with dummy topology servers
    var topology = new Mongos();
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
      // Add server to topology
      topology.connectedProxies.push(server);
    });

    // Create read preference
    var readPreference = new ReadPreference(
      convert(readPreferenceSpec.mode),
      readPreferenceSpec.tag_sets
    );

    // Perform a pickServer
    topology.selectServer({ readPreference }, (err, server) => {
      if (err) return done(err);
      var foundWindow = null;

      // server should be in the latency window
      for (var i = 0; i < inLatencyWindow.length; i++) {
        var w = inLatencyWindow[i];

        if (server.name === w.address) {
          foundWindow = w;
          break;
        }
      }

      expect(foundWindow).to.not.be.null;
      done();
    });
  } catch (err) {
    done(err);
  }
}
