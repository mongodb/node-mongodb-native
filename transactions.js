'use strict';
const MongoError = require('./error').MongoError;

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

    if (options.writeConcern || typeof options.w !== 'undefined') {
      const w = options.writeConcern ? options.writeConcern.w : options.w;
      if (w <= 0) {
        throw new MongoError('Transactions do not support unacknowledged write concern');
      }

      this.options.writeConcern = options.writeConcern ? options.writeConcern : { w: options.w };
    }

    if (options.readConcern) this.options.readConcern = options.readConcern;
    if (options.readPreference) this.options.readPreference = options.readPreference;
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
      return;
    }

    throw new MongoError(
      `Attempted illegal state transition from [${this.state}] to [${nextState}]`
    );
  }
}

module.exports = { TxnState, Transaction };
