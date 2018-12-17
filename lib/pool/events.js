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
PoolCreatedEvent.eventType = 'connectionPoolCreated';

class PoolClosedEvent extends PoolMonitoringEvent {
  constructor(pool) {
    super('ConnectionPoolClosed', pool);
  }
}
PoolClosedEvent.eventType = 'connectionPoolClosed';

class ConnectionCreatedEvent extends PoolMonitoringEvent {
  constructor(pool, connection) {
    super('ConnectionCreated', pool);
    this.connectionId = connection.id;
  }
}
ConnectionCreatedEvent.eventType = 'connectionCreated';

class ConnectionReadyEvent extends PoolMonitoringEvent {
  constructor(pool, connection) {
    super('ConnectionReady', pool);
    this.connectionId = connection.id;
  }
}
ConnectionReadyEvent.eventType = 'connectionReady';

class ConnectionClosedEvent extends PoolMonitoringEvent {
  constructor(pool, connection, reason) {
    super('ConnectionClosed', pool);
    this.connectionId = connection.id;
    this.reason = reason || 'unknown';
  }
}
ConnectionClosedEvent.eventType = 'connectionClosed';

class ConnectionCheckOutStarted extends PoolMonitoringEvent {
  constructor(pool) {
    super('ConnectionCheckOutStarted', pool);
  }
}
ConnectionCheckOutStarted.eventType = 'connectionCheckOutStarted';

class ConnectionCheckOutFailed extends PoolMonitoringEvent {
  constructor(pool, reason) {
    super('ConnectionCheckOutFailed', pool);
    this.reason = reason;
  }
}
ConnectionCheckOutFailed.eventType = 'connectionCheckOutFailed';

class ConnectionCheckedOutEvent extends PoolMonitoringEvent {
  constructor(pool, connection) {
    super('ConnectionCheckedOut', pool);
    this.connectionId = connection.id;
  }
}
ConnectionCheckedOutEvent.eventType = 'connectionCheckedOut';

class ConnectionCheckedInEvent extends PoolMonitoringEvent {
  constructor(pool, connection) {
    super('ConnectionCheckedIn', pool);
    this.connectionId = connection.id;
  }
}
ConnectionCheckedInEvent.eventType = 'connectionCheckedIn';

class PoolClearedEvent extends PoolMonitoringEvent {
  constructor(pool) {
    super('ConnectionPoolCleared', pool);
  }
}
PoolClearedEvent.eventType = 'connectionPoolCleared';

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
