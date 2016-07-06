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
    // console.log("@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@")
    // console.log(err.stack)
  //   if(['ReplicaSetNoPrimary', 'Primary'].indexOf(topology_description.type) != -1
  //     && in_latency_window.length == 0) {
  //       console.log(err.message)
  //   }
  //
  //   console.log(err.stack)
    // process.exit(0)
  }
  // "in_latency_window": [
  //     {
  //         "address": "b:27017",
  //         "avg_rtt_ms": 5,
  //         "tags": {
  //             "data_center": "nyc"
  //         },
  //         "type": "RSSecondary"
  //     }
  // ],


  // console.log("==================================")
  // if()
  // console.dir(found_window)
  // process.exit(0)

  // // Unpack entry
  // var description = file.description;
  // var uri = file.uri;
  // var phases = file.phases;
  //
  // console.log(f("+ Starting: %s [%s]", description, path.split(/\//).pop()));
  //
  // // Get replicaset name if any
  // var match = uri.match(/replicaSet\=[a-z|A-Z|0-9]*/)
  // // console.log("============ 0")
  // var replicaSet = match ? match.toString().split(/=/)[1] : null;
  // // Replicaset
  // // console.log(replicaSet)
  //
  // // Create a replset state
  // var state = new ReplSetState({setName: replicaSet});
  //
  // // Get all the server instances
  // var parts = uri.split('mongodb://')[1].split("/")[0].split(',')
  // // For each of the servers
  // parts.forEach(function(x) {
  //   var params = x.split(':');
  //   // console.dir(params)
  //   // console.log(f('%s:%s', params[0], params[1] ? parseInt(params[1]) :  27017))
  //   state.update({
  //     name: f('%s:%s', params[0], params[1] ? parseInt(params[1]) :  27017),
  //     lastIsMaster: function() {
  //       return null;
  //     },
  //     equals: function(s) {
  //       if(typeof s == 'string') return s == this.name;
  //       return s.name == this.name;
  //     },
  //     destroy: function() {}
  //   })
  // });
  //
  // // console.log(parts)
  //
  // // Run each phase
  // phases.forEach(function(x) {
  //   executePhase(test, state, x);
  // });
}

// function executePhase(test, state, phase) {
//   var responses = phase.responses;
//   var outcome = phase.outcome;
//
//   // Apply all the responses
//   responses.forEach(function(x) {
//     if(Object.keys(x[1]).length == 0) {
//       state.remove({
//         name: x[0],
//         lastIsMaster: function() {
//           return null;
//         },
//         equals: function(s) {
//           if(typeof s == 'string') return s == this.name;
//           return s.name == this.name;
//         },
//         destroy: function() {}
//       });
//     } else {
//       var ismaster = x[1];
//       if(ismaster.electionId) ismaster.electionId = new ObjectId(ismaster.electionId['$oid']);
//
//       state.update({
//         name: x[0],
//         lastIsMaster: function() {
//           // console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! ismaster")
//           // console.dir(ismaster)
//           return ismaster;
//         },
//         equals: function(s) {
//           if(typeof s == 'string') return s == this.name;
//           return s.name == this.name;
//         },
//         destroy: function() {}
//       });
//     }
//   });
//
//   // Validate the state of the final outcome
//   for(var name in outcome.servers) {
//     try {
//
//     if(outcome.servers[name].electionId) {
//       outcome.servers[name].electionId = new ObjectId(outcome.servers[name].electionId['$oid']);
//     }
//
//     // if(outcome.servers[name].electionId === undefined) outcome.servers[name].electionId = undefined;
//     // if(outcome.servers[name].setVersion === undefined) outcome.servers[name].setVersion = undefined;
//     // // console.log("========================== 0")
//     test.ok(state.set[name]);
//     // // Just remove undefined fields for the test comparisions
//     // if(state.set[name].setVersion === undefined) delete state.set[name].setVersion;
//     // if(state.set[name].electionId === undefined) delete state.set[name].electionId;
//     // if(state.set[name].setName === undefined) delete state.set[name].setName;
//     // console.log("========================== 1")
//     // console.dir(outcome.servers[name])
//     // console.dir(state.set[name])
//     for(var n in outcome.servers[name]) {
//       if(outcome.servers[name][n]) {
//         test.deepEqual(outcome.servers[name][n], state.set[name][n]);
//       }
//     }
//
//     // console.log("SUCCESS ========================== 0")
//     // console.dir(outcome.servers)
//     // console.log("========================== 1")
//     // console.dir(state.set)
//
//     // test.deepEqual(outcome.servers[name], state.set[name]);
//   } catch(e) {
//     // console.log("========================== 0")
//     // console.dir(outcome.servers)
//     // console.log("========================== 1")
//     // console.dir(state.set)
//     // process.exit(0)
//   }
//     // console.log("========================== 2")
//   }
//
//   // // Check the topology type
//   // console.log("========================================")
//   // console.log("outcome.topologyType = " + outcome.topologyType)
//   // console.log("state.topologyType = " + state.topologyType)
//   // console.log("outcome.setName = " + outcome.setName)
//   // console.log("state.setName = " + state.setName)
//   test.equal(outcome.topologyType, state.topologyType);
//   test.equal(outcome.setName, state.setName);
//
//   // console.dir(state.set)
//   // process.exit(0)
// }
