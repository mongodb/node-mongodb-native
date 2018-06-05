'use strict';

const retrieveBSON = require('./connection/utils').retrieveBSON;
const EventEmitter = require('events');
const BSON = retrieveBSON();
const Binary = BSON.Binary;
const uuidV4 = require('./utils').uuidV4;
const MongoError = require('./error').MongoError;
const isRetryableError = require('././error').isRetryableError;

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

// Client session states
const NO_TRANSACTION = 'NO_TRANSACTION';
const STARTING_TRANSACTION = 'STARTING_TRANSACTION';
const TRANSACTION_IN_PROGRESS = 'TRANSACTION_IN_PROGRESS';
const TRANSACTION_COMMITTED = 'TRANSACTION_COMMITTED';
const TRANSACTION_ABORTED = 'TRANSACTION_ABORTED';

function txnStateTransition(txnState, nextState) {
  const validTransitions = {
    [NO_TRANSACTION]: [NO_TRANSACTION, STARTING_TRANSACTION],
    [STARTING_TRANSACTION]: [TRANSACTION_IN_PROGRESS, TRANSACTION_COMMITTED, TRANSACTION_ABORTED],
    [TRANSACTION_IN_PROGRESS]: [
      TRANSACTION_IN_PROGRESS,
      TRANSACTION_COMMITTED,
      TRANSACTION_ABORTED
    ],
    [TRANSACTION_COMMITTED]: [TRANSACTION_COMMITTED, STARTING_TRANSACTION, NO_TRANSACTION],
    [TRANSACTION_ABORTED]: [STARTING_TRANSACTION, NO_TRANSACTION]
  };

  // Get current state
  const nextStates = validTransitions[txnState.state];
  if (nextStates && nextStates.indexOf(nextState) !== -1) {
    txnState.state = nextState;
    return;
  }

  throw new MongoError(
    `ClientSession attempted illegal state transition from [${txnState.state}] to [${nextState}]`
  );
}

class TransactionState {
  constructor(options) {
    options = options || {};

    this.state = NO_TRANSACTION;
    this.options = {};
    if (options.writeConcern) this.options.writeConcern = options.writeConcern;
    if (options.readConcern) this.options.readConcern = options.readConcern;
    if (options.readPreference) this.options.readPreference = options.readPreference;
  }

  /**
   * @return Whether this session is presently in a transaction
   */
  get isActive() {
    return [STARTING_TRANSACTION, TRANSACTION_IN_PROGRESS].indexOf(this.state) !== -1;
  }
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
    this.transaction = new TransactionState();
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
    this.transaction = new TransactionState(
      Object.assign({}, options || this.defaultTransactionOptions)
    );

    txnStateTransition(this.transaction, STARTING_TRANSACTION);
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
}

function endTransaction(clientSession, commandName, callback) {
  if (!assertAlive(clientSession, callback)) {
    // checking result in case callback was called
    return;
  }

  if (!clientSession.inTransaction()) {
    if (clientSession.autoStartTransaction) {
      clientSession.startTransaction();
    } else {
      callback(new MongoError('No transaction started'));
      return;
    }
  }

  // if (clientSession.serverSession.stmtId === 0) {
  //   // The server transaction was never started.
  //   resetTransactionState(clientSession);
  //   callback(null, null);
  //   return;
  // }

  const command = { [commandName]: 1 };

  // if (clientSession.transactionOptions.writeConcern) {
  //   Object.assign(command, { writeConcern: clientSession.transactionOptions.writeConcern });
  // } else if (clientSession.clientOptions && clientSession.clientOptions.w) {
  //   Object.assign(command, { writeConcern: { w: clientSession.clientOptions.w } });
  // }

  function commandHandler(e, r) {
    // resetTransactionState(clientSession);
    callback(e, r);
  }

  function transactionError(err) {
    return commandName === 'commitTransaction' ? err : null;
  }

  // send the command
  clientSession.topology.command(
    'admin.$cmd',
    command,
    { session: clientSession },
    (err, reply) => {
      if (err && isRetryableError(err)) {
        return clientSession.topology.command(
          'admin.$cmd',
          command,
          { session: clientSession },
          (_err, _reply) => commandHandler(transactionError(_err), _reply)
        );
      }

      commandHandler(transactionError(err), reply);
    }
  );
}

Object.defineProperty(ClientSession.prototype, 'id', {
  get: function() {
    return this.serverSession.id;
  }
});

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
  ClientSession: ClientSession,
  ServerSession: ServerSession,
  ServerSessionPool: ServerSessionPool
};
