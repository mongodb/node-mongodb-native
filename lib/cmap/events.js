'use strict';

/**
 * The base class for all monitoring events published from the connection pool
 *
 * @property {number} time A timestamp when the event was created
 * @property {string} address The address (host/port pair) of the pool
 */
class ConnectionPoolMonitoringEvent {
  constructor(type, pool) {
    this.time = new Date();
    this.type = type;
    this.address = pool.address;
  }
}

/**
 * An event published when a connection pool is created
 *
 * @property {Object} options The options used to create this connection pool
 */
class ConnectionPoolCreatedEvent extends ConnectionPoolMonitoringEvent {
  constructor(pool) {
    super('ConnectionPoolCreated', pool);
    this.options = pool.options;
  }
}

/**
 * An event published when a connection pool is closed
 */
class ConnectionPoolClosedEvent extends ConnectionPoolMonitoringEvent {
  constructor(pool) {
    super('ConnectionPoolClosed', pool);
  }
}

/**
 * An event published when a connection pool creates a new connection
 *
 * @property {number} connectionId A monotonically increasing, per-pool id for the newly created connection
 */
class ConnectionCreatedEvent extends ConnectionPoolMonitoringEvent {
  constructor(pool, connection) {
    super('ConnectionCreated', pool);
    this.connectionId = connection.id;
  }
}

/**
 * An event published when a connection is ready for use
 *
 * @property {number} connectionId The id of the connection
 */
class ConnectionReadyEvent extends ConnectionPoolMonitoringEvent {
  constructor(pool, connection) {
    super('ConnectionReady', pool);
    this.connectionId = connection.id;
  }
}

/**
 * An event published when a connection is closed
 *
 * @property {number} connectionId The id of the connection
 * @property {string} reason The reason the connection was closed
 */
class ConnectionClosedEvent extends ConnectionPoolMonitoringEvent {
  constructor(pool, connection, reason) {
    super('ConnectionClosed', pool);
    this.connectionId = connection.id;
    this.reason = reason || 'unknown';
  }
}

/**
 * An event published when a request to check a connection out begins
 */
class ConnectionCheckOutStartedEvent extends ConnectionPoolMonitoringEvent {
  constructor(pool) {
    super('ConnectionCheckOutStarted', pool);
  }
}

/**
 * An event published when a request to check a connection out fails
 *
 * @property {string} reason The reason the attempt to check out failed
 */
class ConnectionCheckOutFailedEvent extends ConnectionPoolMonitoringEvent {
  constructor(pool, reason) {
    super('ConnectionCheckOutFailed', pool);
    this.reason = reason;
  }
}

/**
 * An event published when a connection is checked out of the connection pool
 *
 * @property {number} connectionId The id of the connection
 */
class ConnectionCheckedOutEvent extends ConnectionPoolMonitoringEvent {
  constructor(pool, connection) {
    super('ConnectionCheckedOut', pool);
    this.connectionId = connection.id;
  }
}

/**
 * An event published when a connection is checked into the connection pool
 *
 * @property {number} connectionId The id of the connection
 */
class ConnectionCheckedInEvent extends ConnectionPoolMonitoringEvent {
  constructor(pool, connection) {
    super('ConnectionCheckedIn', pool);
    this.connectionId = connection.id;
  }
}

/**
 * An event published when a connection pool is cleared
 */
class ConnectionPoolClearedEvent extends ConnectionPoolMonitoringEvent {
  constructor(pool) {
    super('ConnectionPoolCleared', pool);
  }
}

module.exports = {
  ConnectionPoolCreatedEvent,
  ConnectionPoolClosedEvent,
  ConnectionCreatedEvent,
  ConnectionReadyEvent,
  ConnectionClosedEvent,
  ConnectionCheckOutStartedEvent,
  ConnectionCheckOutFailedEvent,
  ConnectionCheckedOutEvent,
  ConnectionCheckedInEvent,
  ConnectionPoolClearedEvent
};
