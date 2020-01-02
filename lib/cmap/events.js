'use strict';

class ConnectionPoolMonitoringEvent {
  constructor(type, pool) {
    this.time = new Date();
    this.type = type;
    this.address = pool.address;
  }
}

class ConnectionPoolCreatedEvent extends ConnectionPoolMonitoringEvent {
  constructor(pool) {
    super('ConnectionPoolCreated', pool);
    this.options = pool.options;
  }
}

class ConnectionPoolClosedEvent extends ConnectionPoolMonitoringEvent {
  constructor(pool) {
    super('ConnectionPoolClosed', pool);
  }
}

class ConnectionCreatedEvent extends ConnectionPoolMonitoringEvent {
  constructor(pool, connection) {
    super('ConnectionCreated', pool);
    this.connectionId = connection.id;
  }
}

class ConnectionReadyEvent extends ConnectionPoolMonitoringEvent {
  constructor(pool, connection) {
    super('ConnectionReady', pool);
    this.connectionId = connection.id;
  }
}

class ConnectionClosedEvent extends ConnectionPoolMonitoringEvent {
  constructor(pool, connection, reason) {
    super('ConnectionClosed', pool);
    this.connectionId = connection.id;
    this.reason = reason || 'unknown';
  }
}

class ConnectionCheckOutStartedEvent extends ConnectionPoolMonitoringEvent {
  constructor(pool) {
    super('ConnectionCheckOutStarted', pool);
  }
}

class ConnectionCheckOutFailedEvent extends ConnectionPoolMonitoringEvent {
  constructor(pool, reason) {
    super('ConnectionCheckOutFailed', pool);
    this.reason = reason;
  }
}

class ConnectionCheckedOutEvent extends ConnectionPoolMonitoringEvent {
  constructor(pool, connection) {
    super('ConnectionCheckedOut', pool);
    this.connectionId = connection.id;
  }
}

class ConnectionCheckedInEvent extends ConnectionPoolMonitoringEvent {
  constructor(pool, connection) {
    super('ConnectionCheckedIn', pool);
    this.connectionId = connection.id;
  }
}

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
