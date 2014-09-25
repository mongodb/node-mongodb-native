var fs = require('fs')
  , f = require('util').format
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
    emit: function(){}
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
        state.update(_ismaster, {name: _name, equals: function(s) {
          return s.name == _name;
        }, destroy: function() {}});
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

// var fs = require('fs'),
//   ReadPreference = require('./read_preference');

// var parser = function(url, options) {
//   // Ensure we have a default options object if none set
//   options = options || {};
//   // Variables
//   var connection_part = '';
//   var auth_part = '';
//   var query_string_part = '';
//   var dbName = 'admin';

//   // Must start with mongodb
//   if(url.indexOf("mongodb://") != 0)
//     throw Error("URL must be in the format mongodb://user:pass@host:port/dbname");
//   // If we have a ? mark cut the query elements off
//   if(url.indexOf("?") != -1) {
//     query_string_part = url.substr(url.indexOf("?") + 1);
//     connection_part = url.substring("mongodb://".length, url.indexOf("?"))
//   } else {
//     connection_part = url.substring("mongodb://".length);
//   }

//   // Check if we have auth params
//   if(connection_part.indexOf("@") != -1) {
//     auth_part = connection_part.split("@")[0];
//     connection_part = connection_part.split("@")[1];
//   }

//   // Check if the connection string has a db
//   if(connection_part.indexOf(".sock") != -1) {
//     if(connection_part.indexOf(".sock/") != -1) {
//       dbName = connection_part.split(".sock/")[1];
//       connection_part = connection_part.split("/", connection_part.indexOf(".sock") + ".sock".length);
//     } 
//   } else if(connection_part.indexOf("/") != -1) {
//     dbName = connection_part.split("/")[1];
//     connection_part = connection_part.split("/")[0];
//   }

//   // Result object
//   var object = {};

//   // Pick apart the authentication part of the string
//   var authPart = auth_part || '';
//   var auth = authPart.split(':', 2);

//   // Decode the URI components
//   auth[0] = decodeURIComponent(auth[0]);
//   if(auth[1]){
//     auth[1] = decodeURIComponent(auth[1]);
//   }

//   // Add auth to final object if we have 2 elements
//   if(auth.length == 2) object.auth = {user: auth[0], password: auth[1]};

//   // Variables used for temporary storage
//   var hostPart;
//   var urlOptions;
//   var servers;
//   var serverOptions = {socketOptions: {}};
//   var dbOptions = {read_preference_tags: []};
//   var replSetServersOptions = {socketOptions: {}};
//   // Add server options to final object
//   object.server_options = serverOptions;
//   object.db_options = dbOptions;
//   object.rs_options = replSetServersOptions;
//   object.mongos_options = {};

//   // Let's check if we are using a domain socket
//   if(url.match(/\.sock/)) {
//     // Split out the socket part
//     var domainSocket = url.substring(
//         url.indexOf("mongodb://") + "mongodb://".length
//       , url.lastIndexOf(".sock") + ".sock".length);
//     // Clean out any auth stuff if any
//     if(domainSocket.indexOf("@") != -1) domainSocket = domainSocket.split("@")[1];
//     servers = [{domain_socket: domainSocket}];
//   } else {
//     // Split up the db
//     hostPart = connection_part;
//     // Parse all server results
//     servers = hostPart.split(',').map(function(h) {
//       var _host, _port, ipv6match;
//       //check if it matches [IPv6]:port, where the port number is optional
//       if ((ipv6match = /\[([^\]]+)\](?:\:(.+))?/.exec(h))) {
//         _host = ipv6match[1];
//         _port = parseInt(ipv6match[2], 10) || 27017;
//       } else {
//         //otherwise assume it's IPv4, or plain hostname
//         var hostPort = h.split(':', 2);
//         _host = hostPort[0] || 'localhost';
//         _port = hostPort[1] != null ? parseInt(hostPort[1], 10) : 27017;
//         // Check for localhost?safe=true style case
//         if(_host.indexOf("?") != -1) _host = _host.split(/\?/)[0];
//       }
//       // Return the mapped object
//       return {host: _host, port: _port};
//     });
//   }

//   // Get the db name
//   object.dbName = dbName || 'admin';
//   // Add servers to result
//   object.servers = servers;
//   // Returned parsed object
//   return object;
// }
