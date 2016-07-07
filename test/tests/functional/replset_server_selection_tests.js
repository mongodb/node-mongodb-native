"use strict";

var f = require('util').format,
  fs = require('fs'),
  url = require('url'),
  ObjectId = require('bson').ObjectId,
  ReplSetState = require('../../../lib/topologies/replset_state'),
  MongoError = require('../../../lib/error'),
  ReadPreference = require('../../../lib/topologies/read_preference'),
  Server = require('../../../lib/topologies/server');

exports['Should correctly execute server selection tests ReplicaSetNoPrimary'] = {
  metadata: { requires: { topology: "single" } },

  test: function(configuration, test) {
    var path = f('%s/../server-selection/tests/server_selection/ReplicaSetNoPrimary/read', __dirname);
    console.dir(path)
    var entries = fs.readdirSync(path).filter(function(x) {
      return x.indexOf('.json') != -1;
    });
    // .filter(function(x) {
    //   return x.indexOf('PrimaryPreferred.json') != -1;
    // });
    // console.dir(entries)
    // console.dir(entries)
    // process.exit(0)

    // Execute each of the entries
    entries.forEach(function(x) {
      executeEntry(test, x, f('%s/%s', path, x));
    });

    test.done();
  }
}

exports['Should correctly execute server selection tests ReplicaSetWithPrimary'] = {
  metadata: { requires: { topology: "single" } },

  test: function(configuration, test) {
    var path = f('%s/../server-selection/tests/server_selection/ReplicaSetWithPrimary/read', __dirname);
    console.dir(path)
    var entries = fs.readdirSync(path).filter(function(x) {
      return x.indexOf('.json') != -1;
    });
    // .filter(function(x) {
    //   return x.indexOf('SecondaryPreferred_non_matching.json') != -1;
    // });
    // console.dir(entries)
    // console.dir(entries)
    // process.exit(0)

    // Execute each of the entries
    entries.forEach(function(x) {
      executeEntry(test, x, f('%s/%s', path, x));
    });

    test.done();
  }
}

function convert(mode) {
  if(mode.toLowerCase() == 'primarypreferred') return 'primaryPreferred';
  if(mode.toLowerCase() == 'secondarypreferred') return 'secondaryPreferred';
  return mode.toLowerCase();
}

function executeEntry(test, file, path) {
  console.log("= file :: " + file)
  // Read and parse the json file
  var file = require(path);
  // Let's pick out the parts of the selection specification
  var topology_description = file.topology_description;
  var in_latency_window = file.in_latency_window;
  var operation = file.operation;
  var read_preference = file.read_preference;
  var suitable_servers = file.suitable_servers;

  try {
    // Create a Replset and populate it with dummy topology servers
    var replset = new ReplSetState();
    replset.topologyType = topology_description.type;
    // For each server add them to the state
    topology_description.servers.forEach(function(s) {
      var server = new Server({
        host: s.address.split(':')[0],
        port: parseInt(s.address.split(':')[1], 10)
      });

      // Add additional information
      if(s.avg_rtt_ms) server.lastIsMasterMS = s.avg_rtt_ms;
      if(s.tags) server.ismaster = {tags:s.tags};
      // Ensure the server looks connected
      server.isConnected = function() {return true};

      if(s.type == 'RSSecondary') {
        replset.secondaries.push(server);
      } else if(s.type == 'RSPrimary') {
        replset.primary = server;
      } else if(s.type == 'RSArbiter') {
        replset.arbiters.push(server);
      }
    });

    // Create read preference
    var rp = new ReadPreference(convert(read_preference.mode), read_preference.tag_sets);
    // Perform a pickServer
    var server = replset.pickServer(rp);
    var found_window = null;

    // server should be in the latency window
    for(var i = 0; i < in_latency_window.length; i++) {
      var w = in_latency_window[i];

      if(server.name == w.address) {
        found_window = w;
        break;
      }
    }

    // console.log("--- 0")
    // console.dir(found_window)
    // console.dir(server)

    if(['ReplicaSetNoPrimary', 'Primary', 'ReplicaSetWithPrimary'].indexOf(topology_description.type) != -1
      && in_latency_window.length == 0) {
        // console.log("########################################")
        if(server instanceof MongoError) {
          test.equal('no primary server available', server.message);
          // console.log(server.message)
        } else {
          test.equal(null, server);
        }
        //
    } else {
      test.ok(found_window != null);
    }
  } catch(err) {
    console.log(err.stack)
    process.exit(0)
  }
}
