import type { Timestamp } from '../bson';

// shared state names
const STATE_CLOSING = 'closing';
const STATE_CLOSED = 'closed';
const STATE_CONNECTING = 'connecting';
const STATE_CONNECTED = 'connected';

// An enumeration of topology types we know about
enum TopologyType {
  Single = 'Single',
  ReplicaSetNoPrimary = 'ReplicaSetNoPrimary',
  ReplicaSetWithPrimary = 'ReplicaSetWithPrimary',
  Sharded = 'Sharded',
  Unknown = 'Unknown'
}

// An enumeration of server types we know about
enum ServerType {
  Standalone = 'Standalone',
  Mongos = 'Mongos',
  PossiblePrimary = 'PossiblePrimary',
  RSPrimary = 'RSPrimary',
  RSSecondary = 'RSSecondary',
  RSArbiter = 'RSArbiter',
  RSOther = 'RSOther',
  RSGhost = 'RSGhost',
  Unknown = 'Unknown'
}

const TOPOLOGY_DEFAULTS = {
  localThresholdMS: 15,
  serverSelectionTimeoutMS: 30000,
  heartbeatFrequencyMS: 10000,
  minHeartbeatFrequencyMS: 500
};

export type TimerQueue = Set<NodeJS.Timeout>;
function drainTimerQueue(queue: TimerQueue) {
  queue.forEach(clearTimeout);
  queue.clear();
}

function clearAndRemoveTimerFrom(timer: NodeJS.Timeout, timers: TimerQueue) {
  clearTimeout(timer);
  return timers.delete(timer);
}

export interface ClusterTime {
  clusterTime: Timestamp;
  signature: any;
}

/**
 * Shared function to determine clusterTime for a given topology
 *
 * @param {any} topology
 * @param {any} $clusterTime
 */
function resolveClusterTime(topology: any, $clusterTime: ClusterTime) {
  if (topology.clusterTime == null) {
    topology.clusterTime = $clusterTime;
  } else {
    if ($clusterTime.clusterTime.greaterThan(topology.clusterTime.clusterTime)) {
      topology.clusterTime = $clusterTime;
    }
  }
}

export {
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
