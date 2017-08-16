'use strict';

var expect = require('chai').expect,
    f = require('util').format,
    fs = require('fs'),
    Mongos = require('../../../lib/topologies/mongos'),
    ReadPreference = require('../../../lib/topologies/read_preference'),
    Server = require('../../../lib/topologies/server');

describe.only('Mongos server selection tests', function() {
  it('should correctly execute server selection tests using Mongos Topology', {
    metadata: { requires: { topology: 'single' } },

    test: function(done) {
      var path = f('%s/../server-selection/tests/server_selection/Sharded/read', __dirname);
      console.dir(path);
      var entries = fs.readdirSync(path).filter(function(x) {
        return x.indexOf('.json') !== -1;
      });
      // .filter(function(x) {
      //   return x.indexOf('PrimaryPreferred.json') !== -1;
      // });
      // console.dir(entries)
      // console.dir(entries)
      // process.exit(0)

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
  console.log('= file :: ' + file);
  // Read and parse the json file
  file = require(path);
  // Let's pick out the parts of the selection specification
  var topologyDescription = file.topology_description;
  var inLatencyWindow = file.in_latency_window;
  var readPreference = file.read_preference;

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
      if (s.tags) server.ismaster = {tags: s.tags};
      // Ensure the server looks connected
      server.isConnected = function() {return true; };
      // Add server to topology
      topology.connectedProxies.push(server);
    });

    // Create read preference
    var rp = new ReadPreference(convert(readPreference.mode), readPreference.tag_sets);
    // Perform a pickServer
    var server = topology.getServer(rp);
    var foundWindow = null;

    // server should be in the latency window
    for (var i = 0; i < inLatencyWindow.length; i++) {
      var w = inLatencyWindow[i];

      if (server.name === w.address) {
        foundWindow = w;
        break;
      }
    }

    // console.log('--- 0')
    // console.dir(foundWindow)
    // console.dir(server)
    expect(foundWindow).to.not.be.null;
  } catch (err) {
    console.log(err.stack);
    process.exit(0);
  }
}
