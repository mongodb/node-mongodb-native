"use strict";

var fs = require('fs')
  , f = require('util').format
  , ObjectId = require('bson').ObjectId
  , State = require('../../../lib/topologies/replset_state');

var parseTopologyTests = function(dir, excludes) {
  var entries = fs.readdirSync(dir);
  excludes = excludes || [];

  // Locate all the .json files
  entries = entries.filter(function(x) {
    if(x.indexOf('.json') != -1) {
      for(var i = 0; i < excludes.length; i++) {
        if(x.indexOf(excludes[i]) != -1) return false
      }

      return true;
    }

    return false;
  });

  // Map the right path
  return entries.map(function(x) {
    return JSON.parse(fs.readFileSync(f('%s/%s', dir, x), 'utf8'));
  });
}

var executeState = function(assert, test) {
  var state = new State({
    emit: function(){}, listeners: function() { return []; }
  }, {
    id: 1, setName: 'rs', connectingServers: {}, secondaryOnlyConnectionAllowed: false
  })

  // Let's do the steps
  for(var i = 0; i < test.phases.length; i++) {
    // Get the phase
    var phase = test.phases[i];
    // Process the responses, running them through the spec
    for(var j = 0; j < phase.responses.length; j++) {
      // Get all the ismasters, set the me variable
      phase.responses[j][1].me = phase.responses[j][0];

      // Execute an update
      var update = function(_ismaster, _name) {
        if(_ismaster.electionId) {
          _ismaster.electionId = new ObjectId(_ismaster.electionId['$oid']);
        }

        state.update(_ismaster, {name: _name, equals: function(s) {
          return s.name == _name;
        }, destroy: function() {}, lastIsMaster: function() {
          return _ismaster;
        }, isConnected: function() { return true;
        }, getDescription: function() {
          return {}
        }});
      }

      update(phase.responses[j][1], phase.responses[j][0]);
    }

    // process state against outcome
    testOutcome(assert, state, phase.outcome);
  }
}

var testOutcome = function(assert, state, outcome) {
  if(outcome.topologyType == 'ReplicaSetWithPrimary') {
    assert.ok(state.primary != null);
  } else if(outcome.topologyType == 'ReplicaSetNoPrimary') {
    assert.ok(state.primary == null);
  }

  if(outcome.setName) {
    assert.equal(outcome.setName, state.setName);
  }

  for(var name in outcome.servers) {
    var s = outcome.servers[name];

    // Should be primary
    if(s.type == 'RSPrimary') {
      assert.equal(name, state.primary.name);
    } else if(s.type == 'RSSecondary') {
      assert.equal(1, state.secondaries.filter(function(x) {
        return x.name == name;
      }).length);
    } else if(s.type == 'RSGhost' || s.type == 'Unknown') {
      assert.equal(0, state.secondaries.filter(function(x) {
        return x.name == name;
      }).length);

      assert.equal(0, state.passives.filter(function(x) {
        return x.name == name;
      }).length);

      assert.equal(0, state.arbiters.filter(function(x) {
        return x.name == name;
      }).length);

      assert.ok(state.primary == null || state.primary.name != name);
    }
  }
}

exports['Should Correctly Handle State transitions Tests'] = {
  metadata: {
    requires: {
      topology: "single"
    }
  },

  test: function(configuration, test) {
    var tests = parseTopologyTests(f('%s/../topology_test_descriptions/rs', __dirname), [
        'hosts_differ_from_seeds.json'
      ]);

    // Execute all the states
    for(var i = 0; i < tests.length; i++) {
      executeState(test, tests[i]);
    }

    test.done();
  }
}
