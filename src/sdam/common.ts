import type { Timestamp, Binary, Long } from '../bson';

// shared state names
export const STATE_CLOSING = 'closing';
export const STATE_CLOSED = 'closed';
export const STATE_CONNECTING = 'connecting';
export const STATE_CONNECTED = 'connected';

// An enumeration of topology types we know about
export enum TopologyType {
  Single = 'Single',
  ReplicaSetNoPrimary = 'ReplicaSetNoPrimary',
  ReplicaSetWithPrimary = 'ReplicaSetWithPrimary',
  Sharded = 'Sharded',
  Unknown = 'Unknown'
}

// An enumeration of server types we know about
export enum ServerType {
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

export const TOPOLOGY_DEFAULTS = {
  localThresholdMS: 15,
  serverSelectionTimeoutMS: 30000,
  heartbeatFrequencyMS: 10000,
  minHeartbeatFrequencyMS: 500
};

export type TimerQueue = Set<NodeJS.Timeout>;
export function drainTimerQueue(queue: TimerQueue) {
  queue.forEach(clearTimeout);
  queue.clear();
}

export function clearAndRemoveTimerFrom(timer: NodeJS.Timeout, timers: TimerQueue) {
  clearTimeout(timer);
  return timers.delete(timer);
}

export interface ClusterTime {
  clusterTime: Timestamp;
  signature: {
    hash: Binary;
    keyId: Long;
  };
}

/**
 * Shared function to determine clusterTime for a given topology
 *
 * @param {any} topology
 * @param {any} $clusterTime
 */
export function resolveClusterTime(topology: any, $clusterTime: ClusterTime) {
  if (topology.clusterTime == null) {
    topology.clusterTime = $clusterTime;
  } else {
    if ($clusterTime.clusterTime.greaterThan(topology.clusterTime.clusterTime)) {
      topology.clusterTime = $clusterTime;
    }
  }
}
