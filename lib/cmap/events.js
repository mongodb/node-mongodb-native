'use strict';

class PoolMonitoringEvent {
  constructor(type, pool) {
    this.time = new Date();
    this.type = type;
    this.address = pool.address;
  }
}

class PoolCreatedEvent extends PoolMonitoringEvent {
  constructor(pool) {
    super('ConnectionPoolCreated', pool);
    this.options = pool.options;
  }
}

class PoolClosedEvent extends PoolMonitoringEvent {
  constructor(pool) {
    super('ConnectionPoolClosed', pool);
  }
}

class ConnectionCreatedEvent extends PoolMonitoringEvent {
  constructor(pool, connection) {
    super('ConnectionCreated', pool);
    this.connectionId = connection.id;
  }
}

class ConnectionReadyEvent extends PoolMonitoringEvent {
  constructor(pool, connection) {
    super('ConnectionReady', pool);
    this.connectionId = connection.id;
  }
}

class ConnectionClosedEvent extends PoolMonitoringEvent {
  constructor(pool, connection, reason) {
    super('ConnectionClosed', pool);
    this.connectionId = connection.id;
    this.reason = reason || 'unknown';
  }
}

class ConnectionCheckOutStarted extends PoolMonitoringEvent {
  constructor(pool) {
    super('ConnectionCheckOutStarted', pool);
  }
}

class ConnectionCheckOutFailed extends PoolMonitoringEvent {
  constructor(pool, reason) {
    super('ConnectionCheckOutFailed', pool);
    this.reason = reason;
  }
}

class ConnectionCheckedOutEvent extends PoolMonitoringEvent {
  constructor(pool, connection) {
    super('ConnectionCheckedOut', pool);
    this.connectionId = connection.id;
  }
}

class ConnectionCheckedInEvent extends PoolMonitoringEvent {
  constructor(pool, connection) {
    super('ConnectionCheckedIn', pool);
    this.connectionId = connection.id;
  }
}

class PoolClearedEvent extends PoolMonitoringEvent {
  constructor(pool) {
    super('ConnectionPoolCleared', pool);
  }
}

module.exports = {
  PoolCreatedEvent,
  PoolClosedEvent,
  ConnectionCreatedEvent,
  ConnectionReadyEvent,
  ConnectionClosedEvent,
  ConnectionCheckOutStarted,
  ConnectionCheckOutFailed,
  ConnectionCheckedOutEvent,
  ConnectionCheckedInEvent,
  PoolClearedEvent
};
