'use strict';

const retrieveBSON = require('./connection/utils').retrieveBSON;
const EventEmitter = require('events');
const BSON = retrieveBSON();
const Binary = BSON.Binary;
const uuidV4 = require('./utils').uuidV4;
const MongoError = require('./error').MongoError;
const MongoNetworkError = require('./error').MongoNetworkError;

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
    this.transactionOptions = null;
    this.autoStartTransaction = options.autoStartTransaction;
    this.defaultTransactionOptions = Object.assign({}, options.defaultTransactionOptions);
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
   * Increment the statement id on the internal ServerSession
   *
   * @param {Number} [operationCount] the number of operations performed
   */
  incrementStatementId(operationCount) {
    operationCount = operationCount || 1;
    this.serverSession.stmtId += operationCount;
  }

  /**
   * @returns whether this session is current in a transaction or not
   */
  inTransaction() {
    return this.transactionOptions != null;
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

    // increment txnNumber and reset stmtId to zero.
    this.serverSession.txnNumber += 1;
    this.serverSession.stmtId = 0;

    // set transaction options, we will use this to determine if we are in a transaction
    this.transactionOptions = Object.assign({}, options || this.defaultTransactionOptions);
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

// see: https://github.com/mongodb/specifications/blob/master/source/retryable-writes/retryable-writes.rst#terms
const RETRYABLE_ERROR_CODES = new Set([
  6, // HostUnreachable
  7, // HostNotFound
  64, // WriteConcernFailed
  89, // NetworkTimeout
  91, // ShutdownInProgress
  189, // PrimarySteppedDown
  9001, // SocketException
  11600, // InterruptedAtShutdown
  11602, // InterruptedDueToReplStateChange
  10107, // NotMaster
  13435, // NotMasterNoSlaveOk
  13436 // NotMasterOrSecondary
]);

function isRetryableError(error) {
  if (
    RETRYABLE_ERROR_CODES.has(error.code) ||
    error instanceof MongoNetworkError ||
    error.message.match(/not master/) ||
    error.message.match(/node is recovering/)
  ) {
    return true;
  }

  return false;
}

function resetTransactionState(clientSession) {
  clientSession.transactionOptions = null;
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

  if (clientSession.serverSession.stmtId === 0) {
    // The server transaction was never started.
    resetTransactionState(clientSession);
    callback(null, null);
    return;
  }

  const command = { [commandName]: 1 };
  if (clientSession.transactionOptions.writeConcern) {
    Object.assign(command, { writeConcern: clientSession.transactionOptions.writeConcern });
  } else if (clientSession.clientOptions && clientSession.clientOptions.w) {
    Object.assign(command, { writeConcern: { w: clientSession.clientOptions.w } });
  }

  function commandHandler(e, r) {
    resetTransactionState(clientSession);
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
