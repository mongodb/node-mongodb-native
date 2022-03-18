"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConnectionPoolClearedEvent = exports.ConnectionCheckedInEvent = exports.ConnectionCheckedOutEvent = exports.ConnectionCheckOutFailedEvent = exports.ConnectionCheckOutStartedEvent = exports.ConnectionClosedEvent = exports.ConnectionReadyEvent = exports.ConnectionCreatedEvent = exports.ConnectionPoolClosedEvent = exports.ConnectionPoolCreatedEvent = exports.ConnectionPoolMonitoringEvent = void 0;
/**
 * The base export class for all monitoring events published from the connection pool
 * @public
 * @category Event
 */
class ConnectionPoolMonitoringEvent {
    /** @internal */
    constructor(pool) {
        this.time = new Date();
        this.address = pool.address;
    }
}
exports.ConnectionPoolMonitoringEvent = ConnectionPoolMonitoringEvent;
/**
 * An event published when a connection pool is created
 * @public
 * @category Event
 */
class ConnectionPoolCreatedEvent extends ConnectionPoolMonitoringEvent {
    /** @internal */
    constructor(pool) {
        super(pool);
        this.options = pool.options;
    }
}
exports.ConnectionPoolCreatedEvent = ConnectionPoolCreatedEvent;
/**
 * An event published when a connection pool is closed
 * @public
 * @category Event
 */
class ConnectionPoolClosedEvent extends ConnectionPoolMonitoringEvent {
    /** @internal */
    constructor(pool) {
        super(pool);
    }
}
exports.ConnectionPoolClosedEvent = ConnectionPoolClosedEvent;
/**
 * An event published when a connection pool creates a new connection
 * @public
 * @category Event
 */
class ConnectionCreatedEvent extends ConnectionPoolMonitoringEvent {
    /** @internal */
    constructor(pool, connection) {
        super(pool);
        this.connectionId = connection.id;
    }
}
exports.ConnectionCreatedEvent = ConnectionCreatedEvent;
/**
 * An event published when a connection is ready for use
 * @public
 * @category Event
 */
class ConnectionReadyEvent extends ConnectionPoolMonitoringEvent {
    /** @internal */
    constructor(pool, connection) {
        super(pool);
        this.connectionId = connection.id;
    }
}
exports.ConnectionReadyEvent = ConnectionReadyEvent;
/**
 * An event published when a connection is closed
 * @public
 * @category Event
 */
class ConnectionClosedEvent extends ConnectionPoolMonitoringEvent {
    /** @internal */
    constructor(pool, connection, reason) {
        super(pool);
        this.connectionId = connection.id;
        this.reason = reason || 'unknown';
        this.serviceId = connection.serviceId;
    }
}
exports.ConnectionClosedEvent = ConnectionClosedEvent;
/**
 * An event published when a request to check a connection out begins
 * @public
 * @category Event
 */
class ConnectionCheckOutStartedEvent extends ConnectionPoolMonitoringEvent {
    /** @internal */
    constructor(pool) {
        super(pool);
    }
}
exports.ConnectionCheckOutStartedEvent = ConnectionCheckOutStartedEvent;
/**
 * An event published when a request to check a connection out fails
 * @public
 * @category Event
 */
class ConnectionCheckOutFailedEvent extends ConnectionPoolMonitoringEvent {
    /** @internal */
    constructor(pool, reason) {
        super(pool);
        this.reason = reason;
    }
}
exports.ConnectionCheckOutFailedEvent = ConnectionCheckOutFailedEvent;
/**
 * An event published when a connection is checked out of the connection pool
 * @public
 * @category Event
 */
class ConnectionCheckedOutEvent extends ConnectionPoolMonitoringEvent {
    /** @internal */
    constructor(pool, connection) {
        super(pool);
        this.connectionId = connection.id;
    }
}
exports.ConnectionCheckedOutEvent = ConnectionCheckedOutEvent;
/**
 * An event published when a connection is checked into the connection pool
 * @public
 * @category Event
 */
class ConnectionCheckedInEvent extends ConnectionPoolMonitoringEvent {
    /** @internal */
    constructor(pool, connection) {
        super(pool);
        this.connectionId = connection.id;
    }
}
exports.ConnectionCheckedInEvent = ConnectionCheckedInEvent;
/**
 * An event published when a connection pool is cleared
 * @public
 * @category Event
 */
class ConnectionPoolClearedEvent extends ConnectionPoolMonitoringEvent {
    /** @internal */
    constructor(pool, serviceId) {
        super(pool);
        this.serviceId = serviceId;
    }
}
exports.ConnectionPoolClearedEvent = ConnectionPoolClearedEvent;
//# sourceMappingURL=connection_pool_events.js.map