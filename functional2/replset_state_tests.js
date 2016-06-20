"use strict";

var f = require('util').format,
  fs = require('fs'),
  url = require('url'),
  ObjectId = require('bson').ObjectId,
  ReplSetState = require('../../../lib2/topologies/replset_state');

exports['Should correctly execute state machine tests'] = {
  metadata: { requires: { topology: "single" } },

  test: function(configuration, test) {
    var path = f('%s/../topology_test_descriptions/rs', __dirname);
    var entries = fs.readdirSync(path).filter(function(x) {
      return x.indexOf('.json') != -1;
    })
    // .filter(function(x) {
    //   return x.indexOf('equal_electionids.json') != -1;
    // });
    // console.dir(entries)

    // Execute each of the entries
    entries.forEach(function(x) {
      executeEntry(test, f('%s/%s', path, x));
    });

    test.done();
  }
}

function executeEntry(test, path) {
  // Read and parse the json file
  var file = require(path);
  // Unpack entry
  var description = file.description;
  var uri = file.uri;
  var phases = file.phases;

  console.log(f("+ Starting: %s [%s]", description, path.split(/\//).pop()));

  // Get replicaset name if any
  var match = uri.match(/replicaSet\=[a-z|A-Z|0-9]*/)
  // console.log("============ 0")
  var replicaSet = match ? match.toString().split(/=/)[1] : null;
  // Replicaset
  // console.log(replicaSet)

  // Create a replset state
  var state = new ReplSetState({setName: replicaSet});

  // Get all the server instances
  var parts = uri.split('mongodb://')[1].split("/")[0].split(',')
  // For each of the servers
  parts.forEach(function(x) {
    var params = x.split(':');
    // console.dir(params)
    // console.log(f('%s:%s', params[0], params[1] ? parseInt(params[1]) :  27017))
    state.update({
      name: f('%s:%s', params[0], params[1] ? parseInt(params[1]) :  27017),
      lastIsMaster: function() {
        return null;
      },
      equals: function(s) {
        if(typeof s == 'string') return s == this.name;
        return s.name == this.name;
      },
      destroy: function() {}
    })
  });

  // console.log(parts)

  // Run each phase
  phases.forEach(function(x) {
    executePhase(test, state, x);
  });
}

function executePhase(test, state, phase) {
  var responses = phase.responses;
  var outcome = phase.outcome;

  // Apply all the responses
  responses.forEach(function(x) {
    if(Object.keys(x[1]).length == 0) {
      state.remove({
        name: x[0],
        lastIsMaster: function() {
          return null;
        },
        equals: function(s) {
          if(typeof s == 'string') return s == this.name;
          return s.name == this.name;
        },
        destroy: function() {}
      });
    } else {
      var ismaster = x[1];
      if(ismaster.electionId) ismaster.electionId = new ObjectId(ismaster.electionId['$oid']);

      state.update({
        name: x[0],
        lastIsMaster: function() {
          // console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! ismaster")
          // console.dir(ismaster)
          return ismaster;
        },
        equals: function(s) {
          if(typeof s == 'string') return s == this.name;
          return s.name == this.name;
        },
        destroy: function() {}
      });
    }
  });

  // Validate the state of the final outcome
  for(var name in outcome.servers) {
    try {

    if(outcome.servers[name].electionId) {
      outcome.servers[name].electionId = new ObjectId(outcome.servers[name].electionId['$oid']);
    }

    // if(outcome.servers[name].electionId === undefined) outcome.servers[name].electionId = undefined;
    // if(outcome.servers[name].setVersion === undefined) outcome.servers[name].setVersion = undefined;
    // // console.log("========================== 0")
    test.ok(state.set[name]);
    // // Just remove undefined fields for the test comparisions
    // if(state.set[name].setVersion === undefined) delete state.set[name].setVersion;
    // if(state.set[name].electionId === undefined) delete state.set[name].electionId;
    // if(state.set[name].setName === undefined) delete state.set[name].setName;
    // console.log("========================== 1")
    // console.dir(outcome.servers[name])
    // console.dir(state.set[name])
    for(var n in outcome.servers[name]) {
      if(outcome.servers[name][n]) {
        test.deepEqual(outcome.servers[name][n], state.set[name][n]);
      }
    }

    // console.log("SUCCESS ========================== 0")
    // console.dir(outcome.servers)
    // console.log("========================== 1")
    // console.dir(state.set)

    // test.deepEqual(outcome.servers[name], state.set[name]);
  } catch(e) {
    // console.log("========================== 0")
    // console.dir(outcome.servers)
    // console.log("========================== 1")
    // console.dir(state.set)
    // process.exit(0)
  }
    // console.log("========================== 2")
  }

  // // Check the topology type
  // console.log("========================================")
  // console.log("outcome.topologyType = " + outcome.topologyType)
  // console.log("state.topologyType = " + state.topologyType)
  // console.log("outcome.setName = " + outcome.setName)
  // console.log("state.setName = " + state.setName)
  test.equal(outcome.topologyType, state.topologyType);
  test.equal(outcome.setName, state.setName);

  // console.dir(state.set)
  // process.exit(0)
}
