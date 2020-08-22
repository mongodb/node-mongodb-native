import { PromiseProvider } from './promise_provider';
import { EventEmitter } from 'events';
import { Binary, Long, Timestamp, Document } from './bson';
import { ReadPreference } from './read_preference';
import { isTransactionCommand, TxnState, Transaction, TransactionOptions } from './transactions';
import { resolveClusterTime, ClusterTime } from './sdam/common';
import { isSharded } from './cmap/wire_protocol/shared';
import { MongoError, isRetryableError, MongoNetworkError, MongoWriteConcernError } from './error';
import {
  now,
  calculateDurationInMs,
  Callback,
  isPromiseLike,
  uuidV4,
  maxWireVersion,
  maybePromise
} from './utils';
import type { Topology } from './sdam/topology';
import type { CommandOptions } from './cmap/wire_protocol/command';
import type { MongoClientOptions } from './mongo_client';
import type { Cursor } from './cursor/cursor';
import type { CoreCursor } from './cursor/core_cursor';
import type { WriteConcern } from './write_concern';
const minWireVersionForShardedTransactions = 8;

function assertAlive(session: ClientSession, callback?: Callback): boolean {
  if (session.serverSession == null) {
    const error = new MongoError('Cannot use a session that has ended');
    if (typeof callback === 'function') {
      callback(error);
      return false;
    }

    throw error;
  }

  return true;
}

/** @public */
export interface ClientSessionOptions {
  /** Whether causal consistency should be enabled on this session */
  causalConsistency?: boolean;
  /** The default TransactionOptions to use for transactions started on this session. */
  defaultTransactionOptions?: TransactionOptions;

  owner: symbol | Cursor;
  explicit?: boolean;
  initialClusterTime?: ClusterTime;
}

/** @public */
export type WithTransactionCallback = (session: ClientSession) => Promise<any> | void;

/**
 * A class representing a client session on the server
 *
 * NOTE: not meant to be instantiated directly.
 * @public
 */
class ClientSession extends EventEmitter {
  topology: Topology;
  sessionPool: ServerSessionPool;
  hasEnded: boolean;
  serverSession?: ServerSession;
  clientOptions?: MongoClientOptions;
  supports: { causalConsistency: boolean };
  clusterTime?: ClusterTime;
  operationTime?: Timestamp;
  explicit: boolean;
  owner: symbol | CoreCursor;
  defaultTransactionOptions: TransactionOptions;
  transaction: Transaction;

  /**
   * Create a client session.
   *
   * @param topology - The current client's topology (Internal Class)
   * @param sessionPool - The server session pool (Internal Class)
   * @param options - Optional settings
   * @param clientOptions - Optional settings provided when creating a MongoClient
   */
  constructor(
    topology: Topology,
    sessionPool: ServerSessionPool,
    options: ClientSessionOptions,
    clientOptions?: MongoClientOptions
  ) {
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
        typeof options.causalConsistency === 'boolean' ? options.causalConsistency : true
    };

    this.clusterTime = options.initialClusterTime;

    this.operationTime = undefined;
    this.explicit = !!options.explicit;
    this.owner = options.owner;
    this.defaultTransactionOptions = Object.assign({}, options.defaultTransactionOptions);
    this.transaction = new Transaction();
  }

  /** The server id associated with this session */
  get id(): ServerSessionId | undefined {
    return this.serverSession?.id;
  }

  /**
   * Ends this session on the server
   *
   * @param options - Optional settings. Currently reserved for future use
   * @param callback - Optional callback for completion of this operation
   */
  endSession(): void;
  endSession(callback: Callback<void>): void;
  endSession(options: Record<string, unknown>, callback: Callback<void>): void;
  endSession(options?: Record<string, unknown> | Callback<void>, callback?: Callback<void>): void {
    if (typeof options === 'function') (callback = options as Callback), (options = {});
    options = options || {};

    if (this.hasEnded) {
      if (typeof callback === 'function') callback();
      return;
    }

    if (this.serverSession && this.inTransaction()) {
      this.abortTransaction(); // pass in callback?
    }

    // mark the session as ended, and emit a signal
    this.hasEnded = true;
    this.emit('ended', this);

    // release the server session back to the pool
    if (this.serverSession) {
      this.sessionPool.release(this.serverSession);
    }

    this.serverSession = undefined;

    // spec indicates that we should ignore all errors for `endSessions`
    if (typeof callback === 'function') callback();
  }

  /**
   * Advances the operationTime for a ClientSession.
   *
   * @param operationTime - the `BSON.Timestamp` of the operation type it is desired to advance to
   */
  advanceOperationTime(operationTime: Timestamp): void {
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
   *
   * @param session - The session to compare to
   */
  equals(session: ClientSession): boolean {
    if (!(session instanceof ClientSession)) {
      return false;
    }

    if (this.id == null || session.id == null) {
      return false;
    }

    return this.id.id.buffer.equals(session.id.id.buffer);
  }

  /** Increment the transaction number on the internal ServerSession */
  incrementTransactionNumber(): void {
    if (this.serverSession) {
      this.serverSession.txnNumber++;
    }
  }

  /** @returns whether this session is currently in a transaction or not */
  inTransaction(): boolean {
    return this.transaction.isActive;
  }

  /**
   * Starts a new transaction with the given options.
   *
   * @param options - Options for the transaction
   */
  startTransaction(options?: TransactionOptions): void {
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
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  commitTransaction(): Promise<Document>;
  commitTransaction(callback: Callback<Document>): void;
  commitTransaction(callback?: Callback<Document>): Promise<Document> | void {
    return maybePromise(callback, cb => endTransaction(this, 'commitTransaction', cb));
  }

  /**
   * Aborts the currently active transaction in this session.
   *
   * @param callback - An optional callback, a Promise will be returned if none is provided
   */
  abortTransaction(): Promise<Document>;
  abortTransaction(callback: Callback<Document>): void;
  abortTransaction(callback?: Callback<Document>): Promise<Document> | void {
    return maybePromise(callback, cb => endTransaction(this, 'abortTransaction', cb));
  }

  /**
   * This is here to ensure that ClientSession is never serialized to BSON.
   */
  toBSON(): void {
    throw new Error('ClientSession cannot be serialized to BSON.');
  }

  /**
   * Runs a provided lambda within a transaction, retrying either the commit operation
   * or entire transaction as needed (and when the error permits) to better ensure that
   * the transaction can complete successfully.
   *
   * IMPORTANT: This method requires the user to return a Promise, all lambdas that do not
   * return a Promise will result in undefined behavior.
   *
   * @param fn - A lambda to run within a transaction
   * @param options - Optional settings for the transaction
   */
  withTransaction(fn: WithTransactionCallback, options?: TransactionOptions): Promise<any> {
    const startTime = now();
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

function hasNotTimedOut(startTime: number, max: number) {
  return calculateDurationInMs(startTime) < max;
}

function isUnknownTransactionCommitResult(err: MongoError) {
  const isNonDeterministicWriteConcernError =
    err.codeName && NON_DETERMINISTIC_WRITE_CONCERN_ERRORS.has(err.codeName);

  return (
    isMaxTimeMSExpiredError(err) ||
    (!isNonDeterministicWriteConcernError &&
      err.code !== UNSATISFIABLE_WRITE_CONCERN_CODE &&
      err.code !== UNKNOWN_REPL_WRITE_CONCERN_CODE)
  );
}

function isMaxTimeMSExpiredError(err: MongoError) {
  if (err == null) {
    return false;
  }

  return (
    err.code === MAX_TIME_MS_EXPIRED_CODE ||
    (err.writeConcernError && err.writeConcernError.code === MAX_TIME_MS_EXPIRED_CODE)
  );
}

function attemptTransactionCommit(
  session: ClientSession,
  startTime: number,
  fn: WithTransactionCallback,
  options?: TransactionOptions
): Promise<Document> {
  return session.commitTransaction().catch((err: MongoError) => {
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

function userExplicitlyEndedTransaction(session: ClientSession) {
  return USER_EXPLICIT_TXN_END_STATES.has(session.transaction.state);
}

function attemptTransaction(
  session: ClientSession,
  startTime: number,
  fn: WithTransactionCallback,
  options?: TransactionOptions
): Promise<any> {
  const Promise = PromiseProvider.get();
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

  return promise.then(
    () => {
      if (userExplicitlyEndedTransaction(session)) {
        return;
      }

      return attemptTransactionCommit(session, startTime, fn, options);
    },
    err => {
      function maybeRetryOrThrow(err: MongoError): Promise<any> {
        if (
          err instanceof MongoError &&
          err.hasErrorLabel('TransientTransactionError') &&
          hasNotTimedOut(startTime, MAX_WITH_TRANSACTION_TIMEOUT)
        ) {
          return attemptTransaction(session, startTime, fn, options);
        }

        if (isMaxTimeMSExpiredError(err)) {
          err.addErrorLabel('UnknownTransactionCommitResult');
        }

        throw err;
      }

      if (session.transaction.isActive) {
        return session.abortTransaction().then(() => maybeRetryOrThrow(err));
      }

      return maybeRetryOrThrow(err);
    }
  );
}

function endTransaction(session: ClientSession, commandName: string, callback: Callback<Document>) {
  if (!assertAlive(session, callback)) {
    // checking result in case callback was called
    return;
  }

  // handle any initial problematic cases
  const txnState = session.transaction.state;

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
      callback();
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
      callback();
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
  const command: Document = { [commandName]: 1 };

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

  function commandHandler(e?: MongoError, r?: Document) {
    if (commandName === 'commitTransaction') {
      session.transaction.transition(TxnState.TRANSACTION_COMMITTED);

      if (
        e &&
        (e instanceof MongoNetworkError ||
          e instanceof MongoWriteConcernError ||
          isRetryableError(e) ||
          isMaxTimeMSExpiredError(e))
      ) {
        if (isUnknownTransactionCommitResult(e)) {
          e.addErrorLabel('UnknownTransactionCommitResult');

          // per txns spec, must unpin session in this case
          session.transaction.unpinServer();
        }
      }
    } else {
      session.transaction.transition(TxnState.TRANSACTION_ABORTED);

      // The spec indicates that we should ignore all errors on `abortTransaction`
      return callback();
    }

    callback(e, r);
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
        commandHandler(_err as MongoError, _reply)
      );
    }

    commandHandler(err as MongoError, reply);
  });
}

function supportsRecoveryToken(session: ClientSession) {
  const topology = session.topology;
  return !!topology.s.options.useRecoveryToken;
}

/** @internal */
export type ServerSessionId = { id: Binary };

/**
 * Reflects the existence of a session on the server. Can be reused by the session pool.
 * WARNING: not meant to be instantiated directly. For internal use only.
 * @public
 */
class ServerSession {
  id: ServerSessionId;
  lastUse: number;
  txnNumber: number;
  isDirty: boolean;

  /** @internal */
  constructor() {
    this.id = { id: new Binary(uuidV4(), Binary.SUBTYPE_UUID) };
    this.lastUse = now();
    this.txnNumber = 0;
    this.isDirty = false;
  }

  /**
   * Determines if the server session has timed out.
   *
   * @param sessionTimeoutMinutes - The server's "logicalSessionTimeoutMinutes"
   */
  hasTimedOut(sessionTimeoutMinutes: number): boolean {
    // Take the difference of the lastUse timestamp and now, which will result in a value in
    // milliseconds, and then convert milliseconds to minutes to compare to `sessionTimeoutMinutes`
    const idleTimeMinutes = Math.round(
      ((calculateDurationInMs(this.lastUse) % 86400000) % 3600000) / 60000
    );

    return idleTimeMinutes > sessionTimeoutMinutes - 1;
  }
}

/**
 * Maintains a pool of Server Sessions.
 * For internal use only
 * @internal
 */
class ServerSessionPool {
  topology: Topology;
  sessions: ServerSession[];

  constructor(topology: Topology) {
    if (topology == null) {
      throw new Error('ServerSessionPool requires a topology');
    }

    this.topology = topology;
    this.sessions = [];
  }

  /** Ends all sessions in the session pool */
  endAllPooledSessions(callback?: Callback<void>): void {
    if (this.sessions.length) {
      this.topology.endSessions(
        this.sessions.map((session: ServerSession) => session.id),
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
   * pool and returned. If no non-stale session is found, a new ServerSession is created.
   */
  acquire(): ServerSession {
    const sessionTimeoutMinutes = this.topology.logicalSessionTimeoutMinutes || 10;

    while (this.sessions.length) {
      const session = this.sessions.shift();
      if (session && !session.hasTimedOut(sessionTimeoutMinutes)) {
        return session;
      }
    }

    return new ServerSession();
  }

  /**
   * Release a session to the session pool
   * Adds the session back to the session pool if the session has not timed out yet.
   * This method also removes any stale sessions from the pool.
   *
   * @param session - The session to release to the pool
   */
  release(session: ServerSession): void {
    const sessionTimeoutMinutes = this.topology.logicalSessionTimeoutMinutes;
    if (!sessionTimeoutMinutes) {
      return;
    }

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
function commandSupportsReadConcern(command: Document, options?: Document): boolean {
  if (
    command.aggregate ||
    command.count ||
    command.distinct ||
    command.find ||
    command.geoNear ||
    command.group
  ) {
    return true;
  }

  if (
    command.mapReduce &&
    options &&
    options.out &&
    (options.out.inline === 1 || options.out === 'inline')
  ) {
    return true;
  }

  return false;
}

/**
 * Optionally decorate a command with sessions specific keys
 *
 * @param session - the session tracking transaction state
 * @param command - the command to decorate
 * @param options - Optional settings passed to calling operation
 */
function applySession(
  session: ClientSession,
  command: Document,
  options?: CommandOptions
): MongoError | undefined {
  const serverSession = session.serverSession;
  if (serverSession == null) {
    // TODO: merge this with `assertAlive`, did not want to throw a try/catch here
    return new MongoError('Cannot use a session that has ended');
  }

  // SPEC-1019: silently ignore explicit session with unacknowledged write for backwards compatibility
  // FIXME: NODE-2781, this check for write concern shouldn't be happening here, but instead during command construction
  if (options && options.writeConcern && (options.writeConcern as WriteConcern).w === 0) {
    if (session && session.explicit) {
      return new MongoError('Cannot have explicit session with unacknowledged writes');
    }
    return;
  }

  // mark the last use of this session, and apply the `lsid`
  serverSession.lastUse = now();
  command.lsid = serverSession.id;

  // first apply non-transaction-specific sessions data
  const inTransaction = session.inTransaction() || isTransactionCommand(command);
  const isRetryableWrite = options?.willRetryWrite || false;
  const shouldApplyReadConcern = commandSupportsReadConcern(command, options);

  if (serverSession.txnNumber && (isRetryableWrite || inTransaction)) {
    command.txnNumber = Long.fromNumber(serverSession.txnNumber);
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

  if (options) {
    ReadPreference.translate(options);
    const readPreference = options.readPreference as ReadPreference;
    if (readPreference && !readPreference.equals(ReadPreference.primary)) {
      return new MongoError(
        `Read preference in a transaction must be primary, not: ${readPreference.mode}`
      );
    }
  }

  // `autocommit` must always be false to differentiate from retryable writes
  command.autocommit = false;

  if (session.transaction.state === TxnState.STARTING_TRANSACTION) {
    session.transaction.transition(TxnState.TRANSACTION_IN_PROGRESS);
    command.startTransaction = true;

    const readConcern =
      session.transaction.options.readConcern || session?.clientOptions?.readConcern;
    if (readConcern) {
      command.readConcern = readConcern;
    }

    if (session.supports.causalConsistency && session.operationTime) {
      command.readConcern = command.readConcern || {};
      Object.assign(command.readConcern, { afterClusterTime: session.operationTime });
    }
  }
}

function updateSessionFromResponse(session: ClientSession, document: Document): void {
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

export {
  ClientSession,
  ServerSession,
  ServerSessionPool,
  TxnState,
  applySession,
  updateSessionFromResponse,
  commandSupportsReadConcern
};
