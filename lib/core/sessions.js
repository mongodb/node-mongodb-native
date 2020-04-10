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
const isPromiseLike = require('./utils').isPromiseLike;
const ReadPreference = require('./topologies/read_preference');
const isTransactionCommand = require('./transactions').isTransactionCommand;
const resolveClusterTime = require('./topologies/shared').resolveClusterTime;
const isSharded = require('./wireprotocol/shared').isSharded;
const maxWireVersion = require('./utils').maxWireVersion;

const minWireVersionForShardedTransactions = 8;

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

/**
 * Options to pass when creating a Client Session
 * @typedef {Object} SessionOptions
 * @property {boolean} [causalConsistency=true] Whether causal consistency should be enabled on this session
 * @property {TransactionOptions} [defaultTransactionOptions] The default TransactionOptions to use for transactions started on this session.
 */

/**
 * A BSON document reflecting the lsid of a {@link ClientSession}
 * @typedef {Object} SessionId
 */

/**
 * A class representing a client session on the server
 * WARNING: not meant to be instantiated directly.
 * @class
 * @hideconstructor
 */
class ClientSession extends EventEmitter {
  /**
   * Create a client session.
   * WARNING: not meant to be instantiated directly
   *
   * @param {Topology} topology The current client's topology (Internal Class)
   * @param {ServerSessionPool} sessionPool The server session pool (Internal Class)
   * @param {SessionOptions} [options] Optional settings
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
    clientOptions = clientOptions || {};

    this.topology = topology;
    this.sessionPool = sessionPool;
    this.hasEnded = false;
    this.serverSession = sessionPool.acquire();
    this.clientOptions = clientOptions;

    this.supports = {
      causalConsistency:
        typeof options.causalConsistency !== 'undefined' ? options.causalConsistency : true
    };

    this.clusterTime = options.initialClusterTime;

    this.operationTime = null;
    this.explicit = !!options.explicit;
    this.owner = options.owner;
    this.defaultTransactionOptions = Object.assign({}, options.defaultTransactionOptions);
    this.transaction = new Transaction();
  }

  /**
   * The server id associated with this session
   * @type {SessionId}
   */
  get id() {
    return this.serverSession.id;
  }

  /**
   * Ends this session on the server
   *
   * @param {Object} [options] Optional settings. Currently reserved for future use
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

    // release the server session back to the pool
    this.sessionPool.release(this.serverSession);
    this.serverSession = null;

    // mark the session as ended, and emit a signal
    this.hasEnded = true;
    this.emit('ended', this);

    // spec indicates that we should ignore all errors for `endSessions`
    if (typeof callback === 'function') callback(null, null);
  }

  /**
   * Advances the operationTime for a ClientSession.
   *
   * @param {Timestamp} operationTime the `BSON.Timestamp` of the operation type it is desired to advance to
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
   * @param {ClientSession} session
   * @return {boolean} true if the sessions are equal
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
   * @returns {boolean} whether this session is currently in a transaction or not
   */
  inTransaction() {
    return this.transaction.isActive;
  }

  /**
   * Starts a new transaction with the given options.
   *
   * @param {TransactionOptions} options Options for the transaction
   */
  startTransaction(options) {
    assertAlive(this);
    if (this.inTransaction()) {
      throw new MongoError('Transaction already in progress');
    }

    const topologyMaxWireVersion = maxWireVersion(this.topology);
    if (
      isSharded(this.topology) &&
      topologyMaxWireVersion != null &&
      topologyMaxWireVersion < minWireVersionForShardedTransactions
    ) {
      throw new MongoError('Transactions are not supported on sharded clusters in MongoDB < 4.2.');
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
      endTransaction(this, 'commitTransaction', (err, reply) =>
        err ? reject(err) : resolve(reply)
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
      endTransaction(this, 'abortTransaction', (err, reply) =>
        err ? reject(err) : resolve(reply)
      );
    });
  }

  /**
   * This is here to ensure that ClientSession is never serialized to BSON.
   * @ignore
   */
  toBSON() {
    throw new Error('ClientSession cannot be serialized to BSON.');
  }

  /**
   * A user provided function to be run within a transaction
   *
   * @callback WithTransactionCallback
   * @param {ClientSession} session The parent session of the transaction running the operation. This should be passed into each operation within the lambda.
   * @returns {Promise} The resulting Promise of operations run within this transaction
   */

  /**
   * Runs a provided lambda within a transaction, retrying either the commit operation
   * or entire transaction as needed (and when the error permits) to better ensure that
   * the transaction can complete successfully.
   *
   * IMPORTANT: This method requires the user to return a Promise, all lambdas that do not
   * return a Promise will result in undefined behavior.
   *
   * @param {WithTransactionCallback} fn
   * @param {TransactionOptions} [options] Optional settings for the transaction
   */
  withTransaction(fn, options) {
    const startTime = Date.now();
    return attemptTransaction(this, startTime, fn, options);
  }
}

const MAX_WITH_TRANSACTION_TIMEOUT = 120000;
const UNSATISFIABLE_WRITE_CONCERN_CODE = 100;
const UNKNOWN_REPL_WRITE_CONCERN_CODE = 79;
const MAX_TIME_MS_EXPIRED_CODE = 50;
const NON_DETERMINISTIC_WRITE_CONCERN_ERRORS = new Set([
  'CannotSatisfyWriteConcern',
  'UnknownReplWriteConcern',
  'UnsatisfiableWriteConcern'
]);

function hasNotTimedOut(startTime, max) {
  return Date.now() - startTime < max;
}

function isUnknownTransactionCommitResult(err) {
  return (
    isMaxTimeMSExpiredError(err) ||
    (!NON_DETERMINISTIC_WRITE_CONCERN_ERRORS.has(err.codeName) &&
      err.code !== UNSATISFIABLE_WRITE_CONCERN_CODE &&
      err.code !== UNKNOWN_REPL_WRITE_CONCERN_CODE)
  );
}

function isMaxTimeMSExpiredError(err) {
  if (err == null) return false;
  return (
    err.code === MAX_TIME_MS_EXPIRED_CODE ||
    (err.writeConcernError && err.writeConcernError.code === MAX_TIME_MS_EXPIRED_CODE)
  );
}

function attemptTransactionCommit(session, startTime, fn, options) {
  return session.commitTransaction().catch(err => {
    if (
      err instanceof MongoError &&
      hasNotTimedOut(startTime, MAX_WITH_TRANSACTION_TIMEOUT) &&
      !isMaxTimeMSExpiredError(err)
    ) {
      if (err.hasErrorLabel('UnknownTransactionCommitResult')) {
        return attemptTransactionCommit(session, startTime, fn, options);
      }

      if (err.hasErrorLabel('TransientTransactionError')) {
        return attemptTransaction(session, startTime, fn, options);
      }
    }

    throw err;
  });
}

const USER_EXPLICIT_TXN_END_STATES = new Set([
  TxnState.NO_TRANSACTION,
  TxnState.TRANSACTION_COMMITTED,
  TxnState.TRANSACTION_ABORTED
]);

function userExplicitlyEndedTransaction(session) {
  return USER_EXPLICIT_TXN_END_STATES.has(session.transaction.state);
}

function attemptTransaction(session, startTime, fn, options) {
  session.startTransaction(options);

  let promise;
  try {
    promise = fn(session);
  } catch (err) {
    promise = Promise.reject(err);
  }

  if (!isPromiseLike(promise)) {
    session.abortTransaction();
    throw new TypeError('Function provided to `withTransaction` must return a Promise');
  }

  return promise
    .then(() => {
      if (userExplicitlyEndedTransaction(session)) {
        return;
      }

      return attemptTransactionCommit(session, startTime, fn, options);
    })
    .catch(err => {
      function maybeRetryOrThrow(err) {
        if (
          err instanceof MongoError &&
          err.hasErrorLabel('TransientTransactionError') &&
          hasNotTimedOut(startTime, MAX_WITH_TRANSACTION_TIMEOUT)
        ) {
          return attemptTransaction(session, startTime, fn, options);
        }

        if (isMaxTimeMSExpiredError(err)) {
          if (err.errorLabels == null) {
            err.errorLabels = [];
          }
          err.errorLabels.push('UnknownTransactionCommitResult');
        }

        throw err;
      }

      if (session.transaction.isActive) {
        return session.abortTransaction().then(() => maybeRetryOrThrow(err));
      }

      return maybeRetryOrThrow(err);
    });
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
  let writeConcern;
  if (session.transaction.options.writeConcern) {
    writeConcern = Object.assign({}, session.transaction.options.writeConcern);
  } else if (session.clientOptions && session.clientOptions.w) {
    writeConcern = { w: session.clientOptions.w };
  }

  if (txnState === TxnState.TRANSACTION_COMMITTED) {
    writeConcern = Object.assign({ wtimeout: 10000 }, writeConcern, { w: 'majority' });
  }

  if (writeConcern) {
    Object.assign(command, { writeConcern });
  }

  if (commandName === 'commitTransaction' && session.transaction.options.maxTimeMS) {
    Object.assign(command, { maxTimeMS: session.transaction.options.maxTimeMS });
  }

  function commandHandler(e, r) {
    if (commandName === 'commitTransaction') {
      session.transaction.transition(TxnState.TRANSACTION_COMMITTED);

      if (
        e &&
        (e instanceof MongoNetworkError ||
          e instanceof MongoWriteConcernError ||
          isRetryableError(e) ||
          isMaxTimeMSExpiredError(e))
      ) {
        if (e.errorLabels) {
          const idx = e.errorLabels.indexOf('TransientTransactionError');
          if (idx !== -1) {
            e.errorLabels.splice(idx, 1);
          }
        } else {
          e.errorLabels = [];
        }

        if (isUnknownTransactionCommitResult(e)) {
          e.errorLabels.push('UnknownTransactionCommitResult');

          // per txns spec, must unpin session in this case
          session.transaction.unpinServer();
        }
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

  if (
    // Assumption here that commandName is "commitTransaction" or "abortTransaction"
    session.transaction.recoveryToken &&
    supportsRecoveryToken(session)
  ) {
    command.recoveryToken = session.transaction.recoveryToken;
  }

  // send the command
  session.topology.command('admin.$cmd', command, { session }, (err, reply) => {
    if (err && isRetryableError(err)) {
      // SPEC-1185: apply majority write concern when retrying commitTransaction
      if (command.commitTransaction) {
        // per txns spec, must unpin session in this case
        session.transaction.unpinServer();

        command.writeConcern = Object.assign({ wtimeout: 10000 }, command.writeConcern, {
          w: 'majority'
        });
      }

      return session.topology.command('admin.$cmd', command, { session }, (_err, _reply) =>
        commandHandler(transactionError(_err), _reply)
      );
    }

    commandHandler(transactionError(err), reply);
  });
}

function supportsRecoveryToken(session) {
  const topology = session.topology;
  return !!topology.s.options.useRecoveryToken;
}

/**
 * Reflects the existence of a session on the server. Can be reused by the session pool.
 * WARNING: not meant to be instantiated directly. For internal use only.
 * @ignore
 */
class ServerSession {
  constructor() {
    this.id = { id: new Binary(uuidV4(), Binary.SUBTYPE_UUID) };
    this.lastUse = Date.now();
    this.txnNumber = 0;
    this.isDirty = false;
  }

  /**
   * Determines if the server session has timed out.
   * @ignore
   * @param {Date} sessionTimeoutMinutes The server's "logicalSessionTimeoutMinutes"
   * @return {boolean} true if the session has timed out.
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
 * Maintains a pool of Server Sessions.
 * For internal use only
 * @ignore
 */
class ServerSessionPool {
  constructor(topology) {
    if (topology == null) {
      throw new Error('ServerSessionPool requires a topology');
    }

    this.topology = topology;
    this.sessions = [];
  }

  /**
   * Ends all sessions in the session pool.
   * @ignore
   */
  endAllPooledSessions(callback) {
    if (this.sessions.length) {
      this.topology.endSessions(
        this.sessions.map(session => session.id),
        () => {
          this.sessions = [];
          if (typeof callback === 'function') {
            callback();
          }
        }
      );

      return;
    }

    if (typeof callback === 'function') {
      callback();
    }
  }

  /**
   * Acquire a Server Session from the pool.
   * Iterates through each session in the pool, removing any stale sessions
   * along the way. The first non-stale session found is removed from the
   * pool and returned. If no non-stale session is found, a new ServerSession
   * is created.
   * @ignore
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
   * Release a session to the session pool
   * Adds the session back to the session pool if the session has not timed out yet.
   * This method also removes any stale sessions from the pool.
   * @ignore
   * @param {ServerSession} session The session to release to the pool
   */
  release(session) {
    const sessionTimeoutMinutes = this.topology.logicalSessionTimeoutMinutes;
    while (this.sessions.length) {
      const pooledSession = this.sessions[this.sessions.length - 1];
      if (pooledSession.hasTimedOut(sessionTimeoutMinutes)) {
        this.sessions.pop();
      } else {
        break;
      }
    }

    if (!session.hasTimedOut(sessionTimeoutMinutes)) {
      if (session.isDirty) {
        return;
      }

      // otherwise, readd this session to the session pool
      this.sessions.unshift(session);
    }
  }
}

// TODO: this should be codified in command construction
// @see https://github.com/mongodb/specifications/blob/master/source/read-write-concern/read-write-concern.rst#read-concern
function commandSupportsReadConcern(command, options) {
  if (
    command.aggregate ||
    command.count ||
    command.distinct ||
    command.find ||
    command.parallelCollectionScan ||
    command.geoNear ||
    command.geoSearch
  ) {
    return true;
  }

  if (command.mapReduce && options.out && (options.out.inline === 1 || options.out === 'inline')) {
    return true;
  }

  return false;
}

/**
 * Optionally decorate a command with sessions specific keys
 *
 * @ignore
 * @param {ClientSession} session the session tracking transaction state
 * @param {Object} command the command to decorate
 * @param {Object} topology the topology for tracking the cluster time
 * @param {Object} [options] Optional settings passed to calling operation
 * @return {MongoError|null} An error, if some error condition was met
 */
function applySession(session, command, options) {
  const serverSession = session.serverSession;
  if (serverSession == null) {
    // TODO: merge this with `assertAlive`, did not want to throw a try/catch here
    return new MongoError('Cannot use a session that has ended');
  }

  // mark the last use of this session, and apply the `lsid`
  serverSession.lastUse = Date.now();
  command.lsid = serverSession.id;

  // first apply non-transaction-specific sessions data
  const inTransaction = session.inTransaction() || isTransactionCommand(command);
  const isRetryableWrite = options.willRetryWrite;
  const shouldApplyReadConcern = commandSupportsReadConcern(command);

  if (serverSession.txnNumber && (isRetryableWrite || inTransaction)) {
    command.txnNumber = BSON.Long.fromNumber(serverSession.txnNumber);
  }

  // now attempt to apply transaction-specific sessions data
  if (!inTransaction) {
    if (session.transaction.state !== TxnState.NO_TRANSACTION) {
      session.transaction.transition(TxnState.NO_TRANSACTION);
    }

    // TODO: the following should only be applied to read operation per spec.
    // for causal consistency
    if (session.supports.causalConsistency && session.operationTime && shouldApplyReadConcern) {
      command.readConcern = command.readConcern || {};
      Object.assign(command.readConcern, { afterClusterTime: session.operationTime });
    }

    return;
  }

  if (options.readPreference && !options.readPreference.equals(ReadPreference.primary)) {
    return new MongoError(
      `Read preference in a transaction must be primary, not: ${options.readPreference.mode}`
    );
  }

  // `autocommit` must always be false to differentiate from retryable writes
  command.autocommit = false;

  if (session.transaction.state === TxnState.STARTING_TRANSACTION) {
    session.transaction.transition(TxnState.TRANSACTION_IN_PROGRESS);
    command.startTransaction = true;

    const readConcern =
      session.transaction.options.readConcern || session.clientOptions.readConcern;
    if (readConcern) {
      command.readConcern = readConcern;
    }

    if (session.supports.causalConsistency && session.operationTime) {
      command.readConcern = command.readConcern || {};
      Object.assign(command.readConcern, { afterClusterTime: session.operationTime });
    }
  }
}

function updateSessionFromResponse(session, document) {
  if (document.$clusterTime) {
    resolveClusterTime(session, document.$clusterTime);
  }

  if (document.operationTime && session && session.supports.causalConsistency) {
    session.advanceOperationTime(document.operationTime);
  }

  if (document.recoveryToken && session && session.inTransaction()) {
    session.transaction._recoveryToken = document.recoveryToken;
  }
}

module.exports = {
  ClientSession,
  ServerSession,
  ServerSessionPool,
  TxnState,
  applySession,
  updateSessionFromResponse,
  commandSupportsReadConcern
};
