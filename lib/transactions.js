"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isTransactionCommand = exports.Transaction = exports.TxnState = void 0;
const error_1 = require("./error");
const read_concern_1 = require("./read_concern");
const read_preference_1 = require("./read_preference");
const write_concern_1 = require("./write_concern");
/** @internal */
exports.TxnState = Object.freeze({
    NO_TRANSACTION: 'NO_TRANSACTION',
    STARTING_TRANSACTION: 'STARTING_TRANSACTION',
    TRANSACTION_IN_PROGRESS: 'TRANSACTION_IN_PROGRESS',
    TRANSACTION_COMMITTED: 'TRANSACTION_COMMITTED',
    TRANSACTION_COMMITTED_EMPTY: 'TRANSACTION_COMMITTED_EMPTY',
    TRANSACTION_ABORTED: 'TRANSACTION_ABORTED'
});
const stateMachine = {
    [exports.TxnState.NO_TRANSACTION]: [exports.TxnState.NO_TRANSACTION, exports.TxnState.STARTING_TRANSACTION],
    [exports.TxnState.STARTING_TRANSACTION]: [
        exports.TxnState.TRANSACTION_IN_PROGRESS,
        exports.TxnState.TRANSACTION_COMMITTED,
        exports.TxnState.TRANSACTION_COMMITTED_EMPTY,
        exports.TxnState.TRANSACTION_ABORTED
    ],
    [exports.TxnState.TRANSACTION_IN_PROGRESS]: [
        exports.TxnState.TRANSACTION_IN_PROGRESS,
        exports.TxnState.TRANSACTION_COMMITTED,
        exports.TxnState.TRANSACTION_ABORTED
    ],
    [exports.TxnState.TRANSACTION_COMMITTED]: [
        exports.TxnState.TRANSACTION_COMMITTED,
        exports.TxnState.TRANSACTION_COMMITTED_EMPTY,
        exports.TxnState.STARTING_TRANSACTION,
        exports.TxnState.NO_TRANSACTION
    ],
    [exports.TxnState.TRANSACTION_ABORTED]: [exports.TxnState.STARTING_TRANSACTION, exports.TxnState.NO_TRANSACTION],
    [exports.TxnState.TRANSACTION_COMMITTED_EMPTY]: [
        exports.TxnState.TRANSACTION_COMMITTED_EMPTY,
        exports.TxnState.NO_TRANSACTION
    ]
};
const ACTIVE_STATES = new Set([
    exports.TxnState.STARTING_TRANSACTION,
    exports.TxnState.TRANSACTION_IN_PROGRESS
]);
const COMMITTED_STATES = new Set([
    exports.TxnState.TRANSACTION_COMMITTED,
    exports.TxnState.TRANSACTION_COMMITTED_EMPTY,
    exports.TxnState.TRANSACTION_ABORTED
]);
/**
 * @public
 * A class maintaining state related to a server transaction. Internal Only
 */
class Transaction {
    /** Create a transaction @internal */
    constructor(options) {
        options = options !== null && options !== void 0 ? options : {};
        this.state = exports.TxnState.NO_TRANSACTION;
        this.options = {};
        const writeConcern = write_concern_1.WriteConcern.fromOptions(options);
        if (writeConcern) {
            if (writeConcern.w === 0) {
                throw new error_1.MongoTransactionError('Transactions do not support unacknowledged write concern');
            }
            this.options.writeConcern = writeConcern;
        }
        if (options.readConcern) {
            this.options.readConcern = read_concern_1.ReadConcern.fromOptions(options);
        }
        if (options.readPreference) {
            this.options.readPreference = read_preference_1.ReadPreference.fromOptions(options);
        }
        if (options.maxCommitTimeMS) {
            this.options.maxTimeMS = options.maxCommitTimeMS;
        }
        // TODO: This isn't technically necessary
        this._pinnedServer = undefined;
        this._recoveryToken = undefined;
    }
    /** @internal */
    get server() {
        return this._pinnedServer;
    }
    get recoveryToken() {
        return this._recoveryToken;
    }
    get isPinned() {
        return !!this.server;
    }
    /** @returns Whether the transaction has started */
    get isStarting() {
        return this.state === exports.TxnState.STARTING_TRANSACTION;
    }
    /**
     * @returns Whether this session is presently in a transaction
     */
    get isActive() {
        return ACTIVE_STATES.has(this.state);
    }
    get isCommitted() {
        return COMMITTED_STATES.has(this.state);
    }
    /**
     * Transition the transaction in the state machine
     * @internal
     * @param nextState - The new state to transition to
     */
    transition(nextState) {
        const nextStates = stateMachine[this.state];
        if (nextStates && nextStates.includes(nextState)) {
            this.state = nextState;
            if (this.state === exports.TxnState.NO_TRANSACTION ||
                this.state === exports.TxnState.STARTING_TRANSACTION ||
                this.state === exports.TxnState.TRANSACTION_ABORTED) {
                this.unpinServer();
            }
            return;
        }
        throw new error_1.MongoRuntimeError(`Attempted illegal state transition from [${this.state}] to [${nextState}]`);
    }
    /** @internal */
    pinServer(server) {
        if (this.isActive) {
            this._pinnedServer = server;
        }
    }
    /** @internal */
    unpinServer() {
        this._pinnedServer = undefined;
    }
}
exports.Transaction = Transaction;
function isTransactionCommand(command) {
    return !!(command.commitTransaction || command.abortTransaction);
}
exports.isTransactionCommand = isTransactionCommand;
//# sourceMappingURL=transactions.js.map