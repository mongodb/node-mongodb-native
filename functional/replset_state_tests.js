'use strict';

const expect = require('chai').expect,
  p = require('path'),
  f = require('util').format,
  fs = require('fs'),
  ObjectId = require('bson').ObjectId,
  ReplSetState = require('../../../lib/topologies/replset_state');

describe('ReplicaSet state', function() {
  const path = f('%s/../topology_test_descriptions/rs', __dirname);

  fs
    .readdirSync(path)
    .filter(x => x.indexOf('.json') !== -1)
    .forEach(x => {
      var testData = require(f('%s/%s', path, x));

      it(testData.description, function(done) {
        executeEntry(testData, done);
      });
    });
});

function executeEntry(testData, callback) {
  var uri = testData.uri;
  var phases = testData.phases;

  // Get replicaset name if any
  var match = uri.match(/replicaSet=[a-z|A-Z|0-9]*/);
  var replicaSet = match ? match.toString().split(/=/)[1] : null;

  // Replicaset
  // Create a replset state
  var state = new ReplSetState({ setName: replicaSet });

  // Get all the server instances
  var parts = uri
    .split('mongodb://')[1]
    .split('/')[0]
    .split(',');

  // For each of the servers
  parts.forEach(function(x) {
    var params = x.split(':');
    state.update({
      name: f('%s:%s', params[0], params[1] ? parseInt(params[1], 10) : 27017),
      lastIsMaster: function() {
        return null;
      },
      equals: function(s) {
        if (typeof s === 'string') return s === this.name;
        return s.name === this.name;
      },
      destroy: function() {}
    });
  });

  // Run each phase
  executePhases(phases, state, callback);
}

function executePhases(phases, state, callback) {
  if (phases.length === 0) {
    return callback(null, null);
  }

  executePhase(phases.shift(), state, err => {
    if (err) return callback(err, null);
    return executePhases(phases, state, callback);
  });
}

function executePhase(phase, state, callback) {
  var responses = phase.responses;
  var outcome = phase.outcome;

  // Apply all the responses
  responses.forEach(function(x) {
    if (Object.keys(x[1]).length === 0) {
      state.remove({
        name: x[0],
        lastIsMaster: function() {
          return null;
        },
        equals: function(s) {
          if (typeof s === 'string') return s === this.name;
          return s.name === this.name;
        },
        destroy: function() {}
      });
    } else {
      var ismaster = x[1];
      if (ismaster.electionId) ismaster.electionId = new ObjectId(ismaster.electionId.$oid);

      state.update({
        name: x[0],
        lastIsMaster: function() {
          return ismaster;
        },
        equals: function(s) {
          if (typeof s === 'string') return s === this.name;
          return s.name === this.name;
        },
        destroy: function() {}
      });
    }
  });

  // Validate the state of the final outcome
  for (var name in outcome.servers) {
    try {
      if (outcome.servers[name].electionId) {
        outcome.servers[name].electionId = new ObjectId(outcome.servers[name].electionId.$oid);
      }

      expect(state.set[name]).to.exist;
      for (var n in outcome.servers[name]) {
        if (outcome.servers[name][n]) {
          expect(outcome.servers[name][n]).to.eql(state.set[name][n]);
        }
      }
    } catch (e) {
      return callback(e);
    }
  }

  // // Check the topology type
  expect(outcome.topologyType).to.equal(state.topologyType);
  expect(outcome.setName).to.equal(state.setName);
  callback(null, null);
}
