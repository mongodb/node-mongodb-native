import type { ObjectId } from '../bson';
import type { AnyError } from '../error';
import type { Connection } from './connection';
import type { ConnectionPool, ConnectionPoolOptions } from './connection_pool';

/**
 * The base export class for all monitoring events published from the connection pool
 * @public
 * @category Event
 */
export class ConnectionPoolMonitoringEvent {
  /** A timestamp when the event was created  */
  time: Date;
  /** The address (host/port pair) of the pool */
  address: string;

  /** @internal */
  constructor(pool: ConnectionPool) {
    this.time = new Date();
    this.address = pool.address;
  }
}

/**
 * An event published when a connection pool is created
 * @public
 * @category Event
 */
export class ConnectionPoolCreatedEvent extends ConnectionPoolMonitoringEvent {
  /** The options used to create this connection pool */
  options?: ConnectionPoolOptions;

  /** @internal */
  constructor(pool: ConnectionPool) {
    super(pool);
    this.options = pool.options;
  }
}

/**
 * An event published when a connection pool is ready
 * @public
 * @category Event
 */
export class ConnectionPoolReadyEvent extends ConnectionPoolMonitoringEvent {
  /** @internal */
  constructor(pool: ConnectionPool) {
    super(pool);
  }
}

/**
 * An event published when a connection pool is closed
 * @public
 * @category Event
 */
export class ConnectionPoolClosedEvent extends ConnectionPoolMonitoringEvent {
  /** @internal */
  constructor(pool: ConnectionPool) {
    super(pool);
  }
}

/**
 * An event published when a connection pool creates a new connection
 * @public
 * @category Event
 */
export class ConnectionCreatedEvent extends ConnectionPoolMonitoringEvent {
  /** A monotonically increasing, per-pool id for the newly created connection */
  connectionId: number | '<monitor>';

  /** @internal */
  constructor(pool: ConnectionPool, connection: { id: number | '<monitor>' }) {
    super(pool);
    this.connectionId = connection.id;
  }
}

/**
 * An event published when a connection is ready for use
 * @public
 * @category Event
 */
export class ConnectionReadyEvent extends ConnectionPoolMonitoringEvent {
  /** The id of the connection */
  connectionId: number | '<monitor>';

  /** @internal */
  constructor(pool: ConnectionPool, connection: Connection) {
    super(pool);
    this.connectionId = connection.id;
  }
}

/**
 * An event published when a connection is closed
 * @public
 * @category Event
 */
export class ConnectionClosedEvent extends ConnectionPoolMonitoringEvent {
  /** The id of the connection */
  connectionId: number | '<monitor>';
  /** The reason the connection was closed */
  reason: string;
  serviceId?: ObjectId;

  /** @internal */
  constructor(
    pool: ConnectionPool,
    connection: Pick<Connection, 'id' | 'serviceId'>,
    reason: string
  ) {
    super(pool);
    this.connectionId = connection.id;
    this.reason = reason || 'unknown';
    this.serviceId = connection.serviceId;
  }
}

/**
 * An event published when a request to check a connection out begins
 * @public
 * @category Event
 */
export class ConnectionCheckOutStartedEvent extends ConnectionPoolMonitoringEvent {
  /** @internal */
  constructor(pool: ConnectionPool) {
    super(pool);
  }
}

/**
 * An event published when a request to check a connection out fails
 * @public
 * @category Event
 */
export class ConnectionCheckOutFailedEvent extends ConnectionPoolMonitoringEvent {
  /** The reason the attempt to check out failed */
  reason: AnyError | string;

  /** @internal */
  constructor(pool: ConnectionPool, reason: AnyError | string) {
    super(pool);
    this.reason = reason;
  }
}

/**
 * An event published when a connection is checked out of the connection pool
 * @public
 * @category Event
 */
export class ConnectionCheckedOutEvent extends ConnectionPoolMonitoringEvent {
  /** The id of the connection */
  connectionId: number | '<monitor>';

  /** @internal */
  constructor(pool: ConnectionPool, connection: Connection) {
    super(pool);
    this.connectionId = connection.id;
  }
}

/**
 * An event published when a connection is checked into the connection pool
 * @public
 * @category Event
 */
export class ConnectionCheckedInEvent extends ConnectionPoolMonitoringEvent {
  /** The id of the connection */
  connectionId: number | '<monitor>';

  /** @internal */
  constructor(pool: ConnectionPool, connection: Connection) {
    super(pool);
    this.connectionId = connection.id;
  }
}

/**
 * An event published when a connection pool is cleared
 * @public
 * @category Event
 */
export class ConnectionPoolClearedEvent extends ConnectionPoolMonitoringEvent {
  /** @internal */
  serviceId?: ObjectId;

  /** @internal */
  constructor(pool: ConnectionPool, serviceId?: ObjectId) {
    super(pool);
    this.serviceId = serviceId;
  }
}
