'use strict';

// shared state names
const STATE_CLOSING = 'closing';
const STATE_CLOSED = 'closed';
const STATE_CONNECTING = 'connecting';
const STATE_CONNECTED = 'connected';

// An enumeration of topology types we know about
const TopologyType = {
  Single: 'Single',
  ReplicaSetNoPrimary: 'ReplicaSetNoPrimary',
  ReplicaSetWithPrimary: 'ReplicaSetWithPrimary',
  Sharded: 'Sharded',
  Unknown: 'Unknown'
};

// An enumeration of server types we know about
const ServerType = {
  Standalone: 'Standalone',
  Mongos: 'Mongos',
  PossiblePrimary: 'PossiblePrimary',
  RSPrimary: 'RSPrimary',
  RSSecondary: 'RSSecondary',
  RSArbiter: 'RSArbiter',
  RSOther: 'RSOther',
  RSGhost: 'RSGhost',
  Unknown: 'Unknown'
};

const TOPOLOGY_DEFAULTS = {
  localThresholdMS: 15,
  serverSelectionTimeoutMS: 30000,
  heartbeatFrequencyMS: 10000,
  minHeartbeatFrequencyMS: 500
};

function drainTimerQueue(queue) {
  queue.forEach(clearTimeout);
  queue.clear();
}

function clearAndRemoveTimerFrom(timer, timers) {
  clearTimeout(timer);
  return timers.delete(timer);
}

/**
 * Shared function to determine clusterTime for a given topology
 *
 * @param {*} topology
 * @param {*} clusterTime
 */
function resolveClusterTime(topology, $clusterTime) {
  if (topology.clusterTime == null) {
    topology.clusterTime = $clusterTime;
  } else {
    if ($clusterTime.clusterTime.greaterThan(topology.clusterTime.clusterTime)) {
      topology.clusterTime = $clusterTime;
    }
  }
}

module.exports = {
  STATE_CLOSING,
  STATE_CLOSED,
  STATE_CONNECTING,
  STATE_CONNECTED,
  TOPOLOGY_DEFAULTS,
  TopologyType,
  ServerType,
  drainTimerQueue,
  clearAndRemoveTimerFrom,
  resolveClusterTime
};
