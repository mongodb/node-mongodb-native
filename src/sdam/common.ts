import type { Timestamp, Binary, Long } from '../bson';
import type { Topology } from './topology';
import type { ClientSession } from '../sessions';

// shared state names
export const STATE_CLOSING = 'closing';
export const STATE_CLOSED = 'closed';
export const STATE_CONNECTING = 'connecting';
export const STATE_CONNECTED = 'connected';

/**
 * An enumeration of topology types we know about
 * @public
 */
export const TopologyType = Object.freeze({
  Single: 'Single',
  ReplicaSetNoPrimary: 'ReplicaSetNoPrimary',
  ReplicaSetWithPrimary: 'ReplicaSetWithPrimary',
  Sharded: 'Sharded',
  Unknown: 'Unknown'
} as const);

/** @public */
export type TopologyType = typeof TopologyType[keyof typeof TopologyType];

/**
 * An enumeration of server types we know about
 * @public
 */
export const ServerType = Object.freeze({
  Standalone: 'Standalone',
  Mongos: 'Mongos',
  PossiblePrimary: 'PossiblePrimary',
  RSPrimary: 'RSPrimary',
  RSSecondary: 'RSSecondary',
  RSArbiter: 'RSArbiter',
  RSOther: 'RSOther',
  RSGhost: 'RSGhost',
  Unknown: 'Unknown'
} as const);

/** @public */
export type ServerType = typeof ServerType[keyof typeof ServerType];

/** @internal */
export type TimerQueue = Set<NodeJS.Timeout>;

/** @internal */
export function drainTimerQueue(queue: TimerQueue): void {
  queue.forEach(clearTimeout);
  queue.clear();
}

/** @internal */
export function clearAndRemoveTimerFrom(timer: NodeJS.Timeout, timers: TimerQueue): boolean {
  clearTimeout(timer);
  return timers.delete(timer);
}

/** @public */
export interface ClusterTime {
  clusterTime: Timestamp;
  signature: {
    hash: Binary;
    keyId: Long;
  };
}

/** Shared function to determine clusterTime for a given topology */
export function resolveClusterTime(
  topology: Topology | ClientSession,
  $clusterTime: ClusterTime
): void {
  if (topology.clusterTime == null) {
    topology.clusterTime = $clusterTime;
  } else {
    if ($clusterTime.clusterTime.greaterThan(topology.clusterTime.clusterTime)) {
      topology.clusterTime = $clusterTime;
    }
  }
}
