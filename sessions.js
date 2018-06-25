'use strict';

const retrieveBSON = require('./connection/utils').retrieveBSON;
const EventEmitter = require('events');
const BSON = retrieveBSON();
const Binary = BSON.Binary;
const uuidV4 = require('./utils').uuidV4;
const MongoError = require('./error').MongoError;
const isRetryableError = require('././error').isRetryableError;
const MongoNetworkError = require('./error').MongoNetworkError;
const MongoWriteConcernError = require('./error').MongoWriteConcernError;
const Transaction = require('./transactions').Transaction;
const TxnState = require('./transactions').TxnState;

function assertAlive(session, callback) {
  if (session.serverSession == null) {
    const error = new MongoError('Cannot use a session that has ended');
    if (typeof callback === 'function') {
      callback(error, null);
      return false;
    }

    throw error;
  }

  return true;
}

/** A class representing a client session on the server */
class ClientSession extends EventEmitter {
  /**
   * Create a client session.
   * WARNING: not meant to be instantiated directly
   *
   * @param {Topology} topology The current client's topology
   * @param {ServerSessionPool} sessionPool The server session pool
   * @param {Object} [options] Optional settings
   * @param {Boolean} [options.causalConsistency] Whether causal consistency should be enabled on this session
   * @param {Boolean} [options.autoStartTransaction=false] When enabled this session automatically starts a transaction with the provided defaultTransactionOptions.
   * @param {Object} [options.defaultTransactionOptions] The default TransactionOptions to use for transactions started on this session.
   * @param {Object} [clientOptions] Optional settings provided when creating a client in the porcelain driver
   */
  constructor(topology, sessionPool, options, clientOptions) {
    super();

    if (topology == null) {
      throw new Error('ClientSession requires a topology');
    }

    if (sessionPool == null || !(sessionPool instanceof ServerSessionPool)) {
      throw new Error('ClientSession requires a ServerSessionPool');
    }

    options = options || {};
    this.topology = topology;
    this.sessionPool = sessionPool;
    this.hasEnded = false;
    this.serverSession = sessionPool.acquire();
    this.clientOptions = clientOptions;

    this.supports = {
      causalConsistency:
        typeof options.causalConsistency !== 'undefined' ? options.causalConsistency : true
    };

    options = options || {};
    if (typeof options.initialClusterTime !== 'undefined') {
      this.clusterTime = options.initialClusterTime;
    } else {
      this.clusterTime = null;
    }

    this.operationTime = null;
    this.explicit = !!options.explicit;
    this.owner = options.owner;
    this.defaultTransactionOptions = Object.assign({}, options.defaultTransactionOptions);
    this.transaction = new Transaction();
  }

  /**
   * Return the server id associated with this session
   */
  get id() {
    return this.serverSession.id;
  }

  /**
   * Ends this session on the server
   *
   * @param {Object} [options] Optional settings
   * @param {Function} [callback] Optional callback for completion of this operation
   */
  endSession(options, callback) {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options || {};

    if (this.hasEnded) {
      if (typeof callback === 'function') callback(null, null);
      return;
    }

    if (this.serverSession && this.inTransaction()) {
      this.abortTransaction(); // pass in callback?
    }

    // mark the session as ended, and emit a signal
    this.hasEnded = true;
    this.emit('ended', this);

    // release the server session back to the pool
    this.sessionPool.release(this.serverSession);

    // spec indicates that we should ignore all errors for `endSessions`
    if (typeof callback === 'function') callback(null, null);
  }

  /**
   * Advances the operationTime for a ClientSession.
   *
   * @param {object} operationTime the `BSON.Timestamp` of the operation type it is desired to advance to
   */
  advanceOperationTime(operationTime) {
    if (this.operationTime == null) {
      this.operationTime = operationTime;
      return;
    }

    if (operationTime.greaterThan(this.operationTime)) {
      this.operationTime = operationTime;
    }
  }

  /**
   * Used to determine if this session equals another
   */
  equals(session) {
    if (!(session instanceof ClientSession)) {
      return false;
    }

    return this.id.id.buffer.equals(session.id.id.buffer);
  }

  /**
   * Increment the transaction number on the internal ServerSession
   */
  incrementTransactionNumber() {
    this.serverSession.txnNumber++;
  }

  /**
   * @returns whether this session is current in a transaction or not
   */
  inTransaction() {
    return this.transaction.isActive;
  }

  /**
   * Starts a new transaction with the given options.
   *
   * @param {Object} options Optional settings
   * @param {ReadConcern} [options.readConcern] The readConcern to use for this transaction
   * @param {WriteConcern} [options.writeConcern] The writeConcern to use for this transaction
   */
  startTransaction(options) {
    assertAlive(this);
    if (this.inTransaction()) {
      throw new MongoError('Transaction already in progress');
    }

    // increment txnNumber
    this.incrementTransactionNumber();

    // create transaction state
    this.transaction = new Transaction(
      Object.assign({}, this.clientOptions, options || this.defaultTransactionOptions)
    );

    this.transaction.transition(TxnState.STARTING_TRANSACTION);
  }

  /**
   * Commits the currently active transaction in this session.
   *
   * @param {Function} [callback] optional callback for completion of this operation
   * @return {Promise} A promise is returned if no callback is provided
   */
  commitTransaction(callback) {
    if (typeof callback === 'function') {
      endTransaction(this, 'commitTransaction', callback);
      return;
    }

    return new Promise((resolve, reject) => {
      endTransaction(
        this,
        'commitTransaction',
        (err, reply) => (err ? reject(err) : resolve(reply))
      );
    });
  }

  /**
   * Aborts the currently active transaction in this session.
   *
   * @param {Function} [callback] optional callback for completion of this operation
   * @return {Promise} A promise is returned if no callback is provided
   */
  abortTransaction(callback) {
    if (typeof callback === 'function') {
      endTransaction(this, 'abortTransaction', callback);
      return;
    }

    return new Promise((resolve, reject) => {
      endTransaction(
        this,
        'abortTransaction',
        (err, reply) => (err ? reject(err) : resolve(reply))
      );
    });
  }

  toBSON() {
    throw new Error('ClientSession cannot be serialized to BSON.');
  }
}

function endTransaction(session, commandName, callback) {
  if (!assertAlive(session, callback)) {
    // checking result in case callback was called
    return;
  }

  // handle any initial problematic cases
  let txnState = session.transaction.state;

  if (txnState === TxnState.NO_TRANSACTION) {
    callback(new MongoError('No transaction started'));
    return;
  }

  if (commandName === 'commitTransaction') {
    if (
      txnState === TxnState.STARTING_TRANSACTION ||
      txnState === TxnState.TRANSACTION_COMMITTED_EMPTY
    ) {
      // the transaction was never started, we can safely exit here
      session.transaction.transition(TxnState.TRANSACTION_COMMITTED_EMPTY);
      callback(null, null);
      return;
    }

    if (txnState === TxnState.TRANSACTION_ABORTED) {
      callback(new MongoError('Cannot call commitTransaction after calling abortTransaction'));
      return;
    }
  } else {
    if (txnState === TxnState.STARTING_TRANSACTION) {
      // the transaction was never started, we can safely exit here
      session.transaction.transition(TxnState.TRANSACTION_ABORTED);
      callback(null, null);
      return;
    }

    if (txnState === TxnState.TRANSACTION_ABORTED) {
      callback(new MongoError('Cannot call abortTransaction twice'));
      return;
    }

    if (
      txnState === TxnState.TRANSACTION_COMMITTED ||
      txnState === TxnState.TRANSACTION_COMMITTED_EMPTY
    ) {
      callback(new MongoError('Cannot call abortTransaction after calling commitTransaction'));
      return;
    }
  }

  // construct and send the command
  const command = { [commandName]: 1 };

  // apply a writeConcern if specified
  if (session.transaction.options.writeConcern) {
    Object.assign(command, { writeConcern: session.transaction.options.writeConcern });
  } else if (session.clientOptions && session.clientOptions.w) {
    Object.assign(command, { writeConcern: { w: session.clientOptions.w } });
  }

  function commandHandler(e, r) {
    if (commandName === 'commitTransaction') {
      session.transaction.transition(TxnState.TRANSACTION_COMMITTED);

      if (
        e &&
        (e instanceof MongoNetworkError ||
          e instanceof MongoWriteConcernError ||
          isRetryableError(e))
      ) {
        if (e.errorLabels) {
          const idx = e.errorLabels.indexOf('TransientTransactionError');
          if (idx !== -1) {
            e.errorLabels.splice(idx, 1);
          }
        } else {
          e.errorLabels = [];
        }

        e.errorLabels.push('UnknownTransactionCommitResult');
      }
    } else {
      session.transaction.transition(TxnState.TRANSACTION_ABORTED);
    }

    callback(e, r);
  }

  // The spec indicates that we should ignore all errors on `abortTransaction`
  function transactionError(err) {
    return commandName === 'commitTransaction' ? err : null;
  }

  // send the command
  session.topology.command('admin.$cmd', command, { session }, (err, reply) => {
    if (err && isRetryableError(err)) {
      return session.topology.command('admin.$cmd', command, { session }, (_err, _reply) =>
        commandHandler(transactionError(_err), _reply)
      );
    }

    commandHandler(transactionError(err), reply);
  });
}

/**
 *
 */
class ServerSession {
  constructor() {
    this.id = { id: new Binary(uuidV4(), Binary.SUBTYPE_UUID) };
    this.lastUse = Date.now();
    this.txnNumber = 0;
  }

  /**
   *
   * @param {*} sessionTimeoutMinutes
   */
  hasTimedOut(sessionTimeoutMinutes) {
    // Take the difference of the lastUse timestamp and now, which will result in a value in
    // milliseconds, and then convert milliseconds to minutes to compare to `sessionTimeoutMinutes`
    const idleTimeMinutes = Math.round(
      (((Date.now() - this.lastUse) % 86400000) % 3600000) / 60000
    );

    return idleTimeMinutes > sessionTimeoutMinutes - 1;
  }
}

/**
 *
 */
class ServerSessionPool {
  constructor(topology) {
    if (topology == null) {
      throw new Error('ServerSessionPool requires a topology');
    }

    this.topology = topology;
    this.sessions = [];
  }

  endAllPooledSessions() {
    if (this.sessions.length) {
      this.topology.endSessions(this.sessions.map(session => session.id));
      this.sessions = [];
    }
  }

  /**
   * @returns {ServerSession}
   */
  acquire() {
    const sessionTimeoutMinutes = this.topology.logicalSessionTimeoutMinutes;
    while (this.sessions.length) {
      const session = this.sessions.shift();
      if (!session.hasTimedOut(sessionTimeoutMinutes)) {
        return session;
      }
    }

    return new ServerSession();
  }

  /**
   *
   * @param {*} session
   */
  release(session) {
    const sessionTimeoutMinutes = this.topology.logicalSessionTimeoutMinutes;
    while (this.sessions.length) {
      const session = this.sessions[this.sessions.length - 1];
      if (session.hasTimedOut(sessionTimeoutMinutes)) {
        this.sessions.pop();
      } else {
        break;
      }
    }

    if (!session.hasTimedOut(sessionTimeoutMinutes)) {
      this.sessions.unshift(session);
    }
  }
}

module.exports = {
  ClientSession,
  ServerSession,
  ServerSessionPool,
  TxnState
};
