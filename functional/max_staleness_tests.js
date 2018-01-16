'use strict';

const expect = require('chai').expect,
  p = require('path'),
  f = require('util').format,
  fs = require('fs'),
  ReplSetState = require('../../../lib/topologies/replset_state'),
  MongoError = require('../../../lib/error').MongoError,
  ReadPreference = require('../../../lib/topologies/read_preference'),
  Server = require('../../../lib/topologies/server');

const rsWithPrimaryPath = f('%s/../spec/max-staleness/ReplicaSetWithPrimary', __dirname);
const rsWithoutPrimaryPath = f('%s/../spec/max-staleness/ReplicaSetNoPrimary', __dirname);

describe('Max Staleness', function() {
  describe('ReplicaSet without primary', function() {
    fs
      .readdirSync(rsWithoutPrimaryPath)
      .filter(x => x.indexOf('.json') !== -1)
      .forEach(x => {
        it(p.basename(x, '.json'), function(done) {
          executeEntry(x, f('%s/%s', rsWithoutPrimaryPath, x), done);
        });
      });
  });

  describe('ReplicaSet with primary', function() {
    fs
      .readdirSync(rsWithPrimaryPath)
      .filter(x => x.indexOf('.json') !== -1)
      .filter(x => x.indexOf('LongHeartbeat2.json') === -1)
      .forEach(x => {
        it(p.basename(x, '.json'), function(done) {
          executeEntry(x, f('%s/%s', rsWithPrimaryPath, x), done);
        });
      });
  });
});

function convert(mode) {
  if (mode === undefined) return 'primary';
  if (mode.toLowerCase() === 'primarypreferred') return 'primaryPreferred';
  if (mode.toLowerCase() === 'secondarypreferred') return 'secondaryPreferred';
  return mode.toLowerCase();
}

function executeEntry(entry, path, callback) {
  // Read and parse the json file
  var file = require(path);

  // Let's pick out the parts of the selection specification
  var error = file.error;
  var heartbeatFrequencyMS = file.heartbeatFrequencyMS || 10000;
  var inLatencyWindow = file.in_latency_window;
  var readPreference = file.read_preference;
  var topologyDescription = file.topology_description;

  try {
    // Create a Replset and populate it with dummy topology servers
    var replset = new ReplSetState({
      heartbeatFrequencyMS: heartbeatFrequencyMS
    });

    replset.topologyType = topologyDescription.type;
    // For each server add them to the state
    topologyDescription.servers.forEach(function(s) {
      var server = new Server({
        host: s.address.split(':')[0],
        port: parseInt(s.address.split(':')[1], 10)
      });

      // Add additional information
      if (s.avg_rtt_ms) server.lastIsMasterMS = s.avg_rtt_ms;
      if (s.lastUpdateTime) server.lastUpdateTime = s.lastUpdateTime;
      // Set the last write
      if (s.lastWrite) {
        server.lastWriteDate = s.lastWrite.lastWriteDate.$numberLong;
      }

      server.ismaster = {};
      if (s.tags) server.ismaster.tags = s.tags;
      if (s.maxWireVersion) server.ismaster.maxWireVersion = s.maxWireVersion;
      // Ensure the server looks connected
      server.isConnected = function() {
        return true;
      };

      if (s.type === 'RSSecondary') {
        server.ismaster.secondary = true;
        replset.secondaries.push(server);
      } else if (s.type === 'RSPrimary') {
        server.ismaster.ismaster = true;
        replset.primary = server;
      } else if (s.type === 'RSArbiter') {
        server.ismaster.arbiterOnly = true;
        replset.arbiters.push(server);
      }
    });

    // Calculate staleness
    replset.updateSecondariesMaxStaleness(heartbeatFrequencyMS);

    // Create read preference
    var rp = new ReadPreference(convert(readPreference.mode), readPreference.tag_sets, {
      maxStalenessSeconds: readPreference.maxStalenessSeconds
    });

    // Perform a pickServer
    var server = replset.pickServer(rp);
    var foundWindow = null;

    // We expect an error
    if (error) {
      expect(server).to.be.an.instanceof(MongoError);
      return callback(null, null);
    }

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
        expect(server.message).to.equal('maxStalenessSeconds must be set to at least 90 seconds');
      } else {
        expect(server).to.be.null;
      }
    } else {
      expect(foundWindow).to.not.be.null;
    }
  } catch (err) {
    callback(err, null);
  }

  callback(null, null);
}
