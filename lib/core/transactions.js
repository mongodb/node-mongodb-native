'use strict';
const MongoError = require('./error').MongoError;
const ReadPreference = require('./topologies/read_preference');
const ReadConcern = require('../read_concern');
const WriteConcern = require('../write_concern');

let TxnState;
let stateMachine;

(() => {
  const NO_TRANSACTION = 'NO_TRANSACTION';
  const STARTING_TRANSACTION = 'STARTING_TRANSACTION';
  const TRANSACTION_IN_PROGRESS = 'TRANSACTION_IN_PROGRESS';
  const TRANSACTION_COMMITTED = 'TRANSACTION_COMMITTED';
  const TRANSACTION_COMMITTED_EMPTY = 'TRANSACTION_COMMITTED_EMPTY';
  const TRANSACTION_ABORTED = 'TRANSACTION_ABORTED';

  TxnState = {
    NO_TRANSACTION,
    STARTING_TRANSACTION,
    TRANSACTION_IN_PROGRESS,
    TRANSACTION_COMMITTED,
    TRANSACTION_COMMITTED_EMPTY,
    TRANSACTION_ABORTED
  };

  stateMachine = {
    [NO_TRANSACTION]: [NO_TRANSACTION, STARTING_TRANSACTION],
    [STARTING_TRANSACTION]: [
      TRANSACTION_IN_PROGRESS,
      TRANSACTION_COMMITTED,
      TRANSACTION_COMMITTED_EMPTY,
      TRANSACTION_ABORTED
    ],
    [TRANSACTION_IN_PROGRESS]: [
      TRANSACTION_IN_PROGRESS,
      TRANSACTION_COMMITTED,
      TRANSACTION_ABORTED
    ],
    [TRANSACTION_COMMITTED]: [
      TRANSACTION_COMMITTED,
      TRANSACTION_COMMITTED_EMPTY,
      STARTING_TRANSACTION,
      NO_TRANSACTION
    ],
    [TRANSACTION_ABORTED]: [STARTING_TRANSACTION, NO_TRANSACTION],
    [TRANSACTION_COMMITTED_EMPTY]: [TRANSACTION_COMMITTED_EMPTY, NO_TRANSACTION]
  };
})();

/**
 * The MongoDB ReadConcern, which allows for control of the consistency and isolation properties
 * of the data read from replica sets and replica set shards.
 * @typedef {Object} ReadConcern
 * @property {'local'|'available'|'majority'|'linearizable'|'snapshot'} level The readConcern Level
 * @see https://docs.mongodb.com/manual/reference/read-concern/
 */

/**
 * A MongoDB WriteConcern, which describes the level of acknowledgement
 * requested from MongoDB for write operations.
 * @typedef {Object} WriteConcern
 * @property {number|'majority'|string} [w=1] requests acknowledgement that the write operation has
 * propagated to a specified number of mongod hosts
 * @property {boolean} [j=false] requests acknowledgement from MongoDB that the write operation has
 * been written to the journal
 * @property {number} [wtimeout] a time limit, in milliseconds, for the write concern
 * @see https://docs.mongodb.com/manual/reference/write-concern/
 */

/**
 * Configuration options for a transaction.
 * @typedef {Object} TransactionOptions
 * @property {ReadConcern} [readConcern] A default read concern for commands in this transaction
 * @property {WriteConcern} [writeConcern] A default writeConcern for commands in this transaction
 * @property {ReadPreference} [readPreference] A default read preference for commands in this transaction
 */

/**
 * A class maintaining state related to a server transaction. Internal Only
 * @ignore
 */
class Transaction {
  /**
   * Create a transaction
   *
   * @ignore
   * @param {TransactionOptions} [options] Optional settings
   */
  constructor(options) {
    options = options || {};

    this.state = TxnState.NO_TRANSACTION;
    this.options = {};

    const writeConcern = WriteConcern.fromOptions(options);
    if (writeConcern) {
      if (writeConcern.w <= 0) {
        throw new MongoError('Transactions do not support unacknowledged write concern');
      }

      this.options.writeConcern = writeConcern;
    }

    if (options.readConcern) {
      this.options.readConcern = ReadConcern.fromOptions(options);
    }

    if (options.readPreference) {
      this.options.readPreference = ReadPreference.fromOptions(options);
    }

    if (options.maxCommitTimeMS) {
      this.options.maxTimeMS = options.maxCommitTimeMS;
    }

    // TODO: This isn't technically necessary
    this._pinnedServer = undefined;
    this._recoveryToken = undefined;
  }

  get server() {
    return this._pinnedServer;
  }

  get recoveryToken() {
    return this._recoveryToken;
  }

  get isPinned() {
    return !!this.server;
  }

  /**
   * @ignore
   * @return Whether this session is presently in a transaction
   */
  get isActive() {
    return (
      [TxnState.STARTING_TRANSACTION, TxnState.TRANSACTION_IN_PROGRESS].indexOf(this.state) !== -1
    );
  }

  /**
   * Transition the transaction in the state machine
   * @ignore
   * @param {TxnState} state The new state to transition to
   */
  transition(nextState) {
    const nextStates = stateMachine[this.state];
    if (nextStates && nextStates.indexOf(nextState) !== -1) {
      this.state = nextState;
      if (
        this.state === TxnState.NO_TRANSACTION ||
        this.state === TxnState.STARTING_TRANSACTION ||
        this.state === TxnState.TRANSACTION_ABORTED
      ) {
        this.unpinServer();
      }
      return;
    }

    throw new MongoError(
      `Attempted illegal state transition from [${this.state}] to [${nextState}]`
    );
  }

  pinServer(server) {
    if (this.isActive) {
      this._pinnedServer = server;
    }
  }

  unpinServer() {
    this._pinnedServer = undefined;
  }
}

function isTransactionCommand(command) {
  return !!(command.commitTransaction || command.abortTransaction);
}

module.exports = { TxnState, Transaction, isTransactionCommand };
