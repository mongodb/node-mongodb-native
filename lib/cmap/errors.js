"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WaitQueueTimeoutError = exports.PoolClosedError = void 0;
const error_1 = require("../error");
/**
 * An error indicating a connection pool is closed
 * @category Error
 */
class PoolClosedError extends error_1.MongoDriverError {
    constructor(pool) {
        super('Attempted to check out a connection from closed connection pool');
        this.address = pool.address;
    }
    get name() {
        return 'MongoPoolClosedError';
    }
}
exports.PoolClosedError = PoolClosedError;
/**
 * An error thrown when a request to check out a connection times out
 * @category Error
 */
class WaitQueueTimeoutError extends error_1.MongoDriverError {
    constructor(message, address) {
        super(message);
        this.address = address;
    }
    get name() {
        return 'MongoWaitQueueTimeoutError';
    }
}
exports.WaitQueueTimeoutError = WaitQueueTimeoutError;
//# sourceMappingURL=errors.js.map