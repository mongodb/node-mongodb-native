import type { Binary, Long, Timestamp } from '../bson';
import type { ClientSession } from '../sessions';
import type { Topology } from './topology';

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
  Unknown: 'Unknown',
  LoadBalanced: 'LoadBalanced'
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
  Unknown: 'Unknown',
  LoadBalancer: 'LoadBalancer'
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

/** @public */
export interface ClusterTime {
  clusterTime: Timestamp;
  signature: {
    hash: Binary;
    keyId: Long;
  };
}

/** Shared function to determine clusterTime for a given topology or session */
export function _advanceClusterTime(
  entity: Topology | ClientSession,
  $clusterTime: ClusterTime
): void {
  if (entity.clusterTime == null) {
    entity.clusterTime = $clusterTime;
  } else {
    if ($clusterTime.clusterTime.greaterThan(entity.clusterTime.clusterTime)) {
      entity.clusterTime = $clusterTime;
    }
  }
}
