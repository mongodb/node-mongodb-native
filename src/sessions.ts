import { PromiseProvider } from './promise_provider';
import { Binary, Long, Timestamp, Document } from './bson';
import { ReadPreference } from './read_preference';
import { isTransactionCommand, TxnState, Transaction, TransactionOptions } from './transactions';
import { resolveClusterTime, ClusterTime } from './sdam/common';
import { isSharded } from './cmap/wire_protocol/shared';
import {
  MongoError,
  isRetryableError,
  MongoNetworkError,
  MongoWriteConcernError,
  MONGODB_ERROR_CODES,
  MongoDriverError,
  MongoServerError
} from './error';
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
import type { MongoOptions } from './mongo_client';
import { executeOperation } from './operations/execute_operation';
import { RunAdminCommandOperation } from './operations/run_command';
import type { AbstractCursor } from './cursor/abstract_cursor';
import type { CommandOptions } from './cmap/connection';
import type { WriteConcern } from './write_concern';
import { TypedEventEmitter } from './mongo_types';
import { ReadConcernLevel } from './read_concern';

const minWireVersionForShardedTransactions = 8;

function assertAlive(session: ClientSession, callback?: Callback): boolean {
  if (session.serverSession == null) {
    const error = new MongoDriverError('Cannot use a session that has ended');
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
  /** Whether all read operations should be read from the same snapshot for this session (NOTE: not compatible with `causalConsistency=true`) */
  snapshot?: boolean;
  /** The default TransactionOptions to use for transactions started on this session. */
  defaultTransactionOptions?: TransactionOptions;

  /** @internal */
  owner?: symbol | AbstractCursor;
  /** @internal */
  explicit?: boolean;
  /** @internal */
  initialClusterTime?: ClusterTime;
}

/** @public */
export type WithTransactionCallback<T = void> = (session: ClientSession) => Promise<T>;

/** @public */
export type ClientSessionEvents = {
  ended(session: ClientSession): void;
};

/** @internal */
const kServerSession = Symbol('serverSession');
/** @internal */
const kSnapshotTime = Symbol('snapshotTime');
/** @internal */
const kSnapshotEnabled = Symbol('snapshotEnabled');

/**
 * A class representing a client session on the server
 *
 * NOTE: not meant to be instantiated directly.
 * @public
 */
export class ClientSession extends TypedEventEmitter<ClientSessionEvents> {
  /** @internal */
  topology: Topology;
  /** @internal */
  sessionPool: ServerSessionPool;
  hasEnded: boolean;
  clientOptions?: MongoOptions;
  supports: { causalConsistency: boolean };
  clusterTime?: ClusterTime;
  operationTime?: Timestamp;
  explicit: boolean;
  /** @internal */
  owner?: symbol | AbstractCursor;
  defaultTransactionOptions: TransactionOptions;
  transaction: Transaction;
  /** @internal */
  [kServerSession]?: ServerSession;
  /** @internal */
  [kSnapshotTime]?: Timestamp;
  /** @internal */
  [kSnapshotEnabled] = false;

  /**
   * Create a client session.
   * @internal
   * @param topology - The current client's topology (Internal Class)
   * @param sessionPool - The server session pool (Internal Class)
   * @param options - Optional settings
   * @param clientOptions - Optional settings provided when creating a MongoClient
   */
  constructor(
    topology: Topology,
    sessionPool: ServerSessionPool,
    options: ClientSessionOptions,
    clientOptions?: MongoOptions
  ) {
    super();

    if (topology == null) {
      throw new MongoDriverError('ClientSession requires a topology');
    }

    if (sessionPool == null || !(sessionPool instanceof ServerSessionPool)) {
      throw new MongoDriverError('ClientSession requires a ServerSessionPool');
    }

    options = options ?? {};

    if (options.snapshot === true) {
      this[kSnapshotEnabled] = true;
      if (options.causalConsistency === true) {
        throw new MongoDriverError(
          'Properties "causalConsistency" and "snapshot" are mutually exclusive'
        );
      }
    }

    this.topology = topology;
    this.sessionPool = sessionPool;
    this.hasEnded = false;
    this.clientOptions = clientOptions;
    this[kServerSession] = undefined;

    this.supports = {
      causalConsistency: options.snapshot !== true && options.causalConsistency !== false
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

  get serverSession(): ServerSession {
    if (this[kServerSession] == null) {
      this[kServerSession] = this.sessionPool.acquire();
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return this[kServerSession]!;
  }

  /** Whether or not this session is configured for snapshot reads */
  get snapshotEnabled(): boolean {
    return this[kSnapshotEnabled];
  }

  /**
   * Ends this session on the server
   *
   * @param options - Optional settings. Currently reserved for future use
   * @param callback - Optional callback for completion of this operation
   */
  endSession(): Promise<void>;
  endSession(callback: Callback<void>): void;
  endSession(options: Record<string, unknown>): Promise<void>;
  endSession(options: Record<string, unknown>, callback: Callback<void>): void;
  endSession(
    options?: Record<string, unknown> | Callback<void>,
    callback?: Callback<void>
  ): void | Promise<void> {
    if (typeof options === 'function') (callback = options), (options = {});
    options = options ?? {};

    return maybePromise(callback, done => {
      if (this.hasEnded) {
        return done();
      }

      const completeEndSession = () => {
        // release the server session back to the pool
        this.sessionPool.release(this.serverSession);
        this[kServerSession] = undefined;

        // mark the session as ended, and emit a signal
        this.hasEnded = true;
        this.emit('ended', this);

        // spec indicates that we should ignore all errors for `endSessions`
        done();
      };

      if (this.serverSession && this.inTransaction()) {
        this.abortTransaction(err => {
          if (err) return done(err);
          completeEndSession();
        });

        return;
      }

      completeEndSession();
    });
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
      this.serverSession.txnNumber =
        typeof this.serverSession.txnNumber === 'number' ? this.serverSession.txnNumber + 1 : 0;
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
    if (this[kSnapshotEnabled]) {
      throw new MongoDriverError('Transactions are not allowed with snapshot sessions');
    }

    assertAlive(this);
    if (this.inTransaction()) {
      throw new MongoDriverError('Transaction already in progress');
    }

    const topologyMaxWireVersion = maxWireVersion(this.topology);
    if (
      isSharded(this.topology) &&
      topologyMaxWireVersion != null &&
      topologyMaxWireVersion < minWireVersionForShardedTransactions
    ) {
      throw new MongoDriverError(
        'Transactions are not supported on sharded clusters in MongoDB < 4.2.'
      );
    }

    // increment txnNumber
    this.incrementTransactionNumber();
    // create transaction state
    this.transaction = new Transaction({
      readConcern:
        options?.readConcern ??
        this.defaultTransactionOptions.readConcern ??
        this.clientOptions?.readConcern,
      writeConcern:
        options?.writeConcern ??
        this.defaultTransactionOptions.writeConcern ??
        this.clientOptions?.writeConcern,
      readPreference:
        options?.readPreference ??
        this.defaultTransactionOptions.readPreference ??
        this.clientOptions?.readPreference,
      maxCommitTimeMS: options?.maxCommitTimeMS ?? this.defaultTransactionOptions.maxCommitTimeMS
    });

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
  toBSON(): never {
    throw new MongoDriverError('ClientSession cannot be serialized to BSON.');
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
  withTransaction<T = void>(
    fn: WithTransactionCallback<T>,
    options?: TransactionOptions
  ): ReturnType<typeof fn> {
    const startTime = now();
    return attemptTransaction(this, startTime, fn, options);
  }
}

const MAX_WITH_TRANSACTION_TIMEOUT = 120000;
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
    err instanceof MongoServerError &&
    err.codeName &&
    NON_DETERMINISTIC_WRITE_CONCERN_ERRORS.has(err.codeName);

  return (
    isMaxTimeMSExpiredError(err) ||
    (!isNonDeterministicWriteConcernError &&
      err.code !== MONGODB_ERROR_CODES.UnsatisfiableWriteConcern &&
      err.code !== MONGODB_ERROR_CODES.UnknownReplWriteConcern)
  );
}

function isMaxTimeMSExpiredError(err: MongoError) {
  if (err == null || !(err instanceof MongoServerError)) {
    return false;
  }

  return (
    err.code === MONGODB_ERROR_CODES.MaxTimeMSExpired ||
    (err.writeConcernError && err.writeConcernError.code === MONGODB_ERROR_CODES.MaxTimeMSExpired)
  );
}

function attemptTransactionCommit<T>(
  session: ClientSession,
  startTime: number,
  fn: WithTransactionCallback<T>,
  options?: TransactionOptions
): Promise<T> {
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

const USER_EXPLICIT_TXN_END_STATES = new Set<TxnState>([
  TxnState.NO_TRANSACTION,
  TxnState.TRANSACTION_COMMITTED,
  TxnState.TRANSACTION_ABORTED
]);

function userExplicitlyEndedTransaction(session: ClientSession) {
  return USER_EXPLICIT_TXN_END_STATES.has(session.transaction.state);
}

function attemptTransaction<TSchema>(
  session: ClientSession,
  startTime: number,
  fn: WithTransactionCallback<TSchema>,
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
    throw new MongoDriverError('Function provided to `withTransaction` must return a Promise');
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
    callback(new MongoDriverError('No transaction started'));
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
      callback(
        new MongoDriverError('Cannot call commitTransaction after calling abortTransaction')
      );
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
      callback(new MongoDriverError('Cannot call abortTransaction twice'));
      return;
    }

    if (
      txnState === TxnState.TRANSACTION_COMMITTED ||
      txnState === TxnState.TRANSACTION_COMMITTED_EMPTY
    ) {
      callback(
        new MongoDriverError('Cannot call abortTransaction after calling commitTransaction')
      );
      return;
    }
  }

  // construct and send the command
  const command: Document = { [commandName]: 1 };

  // apply a writeConcern if specified
  let writeConcern;
  if (session.transaction.options.writeConcern) {
    writeConcern = Object.assign({}, session.transaction.options.writeConcern);
  } else if (session.clientOptions && session.clientOptions.writeConcern) {
    writeConcern = { w: session.clientOptions.writeConcern.w };
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
    if (commandName !== 'commitTransaction') {
      session.transaction.transition(TxnState.TRANSACTION_ABORTED);
      // The spec indicates that we should ignore all errors on `abortTransaction`
      return callback();
    }

    session.transaction.transition(TxnState.TRANSACTION_COMMITTED);
    if (e) {
      if (
        e instanceof MongoNetworkError ||
        e instanceof MongoWriteConcernError ||
        isRetryableError(e) ||
        isMaxTimeMSExpiredError(e)
      ) {
        if (isUnknownTransactionCommitResult(e)) {
          e.addErrorLabel('UnknownTransactionCommitResult');

          // per txns spec, must unpin session in this case
          session.transaction.unpinServer();
        }
      } else if (e.hasErrorLabel('TransientTransactionError')) {
        session.transaction.unpinServer();
      }
    }
    callback(e, r);
  }

  // Assumption here that commandName is "commitTransaction" or "abortTransaction"
  if (session.transaction.recoveryToken) {
    command.recoveryToken = session.transaction.recoveryToken;
  }

  // send the command
  executeOperation(
    session.topology,
    new RunAdminCommandOperation(undefined, command, {
      session,
      readPreference: ReadPreference.primary
    }),
    (err, reply) => {
      if (err && isRetryableError(err as MongoError)) {
        // SPEC-1185: apply majority write concern when retrying commitTransaction
        if (command.commitTransaction) {
          // per txns spec, must unpin session in this case
          session.transaction.unpinServer();

          command.writeConcern = Object.assign({ wtimeout: 10000 }, command.writeConcern, {
            w: 'majority'
          });
        }

        return executeOperation(
          session.topology,
          new RunAdminCommandOperation(undefined, command, {
            session,
            readPreference: ReadPreference.primary
          }),
          (_err, _reply) => commandHandler(_err as MongoError, _reply)
        );
      }

      commandHandler(err as MongoError, reply);
    }
  );
}

/** @public */
export type ServerSessionId = { id: Binary };

/**
 * Reflects the existence of a session on the server. Can be reused by the session pool.
 * WARNING: not meant to be instantiated directly. For internal use only.
 * @public
 */
export class ServerSession {
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
export class ServerSessionPool {
  topology: Topology;
  sessions: ServerSession[];

  constructor(topology: Topology) {
    if (topology == null) {
      throw new MongoDriverError('ServerSessionPool requires a topology');
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
export function commandSupportsReadConcern(command: Document, options?: Document): boolean {
  if (command.aggregate || command.count || command.distinct || command.find || command.geoNear) {
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
export function applySession(
  session: ClientSession,
  command: Document,
  options?: CommandOptions
): MongoDriverError | undefined {
  // TODO: merge this with `assertAlive`, did not want to throw a try/catch here
  if (session.hasEnded) {
    return new MongoDriverError('Attempted to use a session that has ended');
  }

  const serverSession = session.serverSession;
  if (serverSession == null) {
    return new MongoDriverError('Unable to acquire server session');
  }

  // SPEC-1019: silently ignore explicit session with unacknowledged write for backwards compatibility
  // FIXME: NODE-2781, this check for write concern shouldn't be happening here, but instead during command construction
  if (options && options.writeConcern && (options.writeConcern as WriteConcern).w === 0) {
    if (session && session.explicit) {
      return new MongoDriverError('Cannot have explicit session with unacknowledged writes');
    }
    return;
  }

  // mark the last use of this session, and apply the `lsid`
  serverSession.lastUse = now();
  command.lsid = serverSession.id;

  // first apply non-transaction-specific sessions data
  const inTransaction = session.inTransaction() || isTransactionCommand(command);
  const isRetryableWrite = options?.willRetryWrite || false;

  if (serverSession.txnNumber && (isRetryableWrite || inTransaction)) {
    command.txnNumber = Long.fromNumber(serverSession.txnNumber);
  }

  if (!inTransaction) {
    if (session.transaction.state !== TxnState.NO_TRANSACTION) {
      session.transaction.transition(TxnState.NO_TRANSACTION);
    }

    if (
      session.supports.causalConsistency &&
      session.operationTime &&
      commandSupportsReadConcern(command, options)
    ) {
      command.readConcern = command.readConcern || {};
      Object.assign(command.readConcern, { afterClusterTime: session.operationTime });
    } else if (session[kSnapshotEnabled]) {
      command.readConcern = command.readConcern || { level: ReadConcernLevel.snapshot };
      if (session[kSnapshotTime] !== undefined) {
        Object.assign(command.readConcern, { atClusterTime: session[kSnapshotTime] });
      }
    }

    return;
  }

  // now attempt to apply transaction-specific sessions data

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

export function updateSessionFromResponse(session: ClientSession, document: Document): void {
  if (document.$clusterTime) {
    resolveClusterTime(session, document.$clusterTime);
  }

  if (document.operationTime && session && session.supports.causalConsistency) {
    session.advanceOperationTime(document.operationTime);
  }

  if (document.recoveryToken && session && session.inTransaction()) {
    session.transaction._recoveryToken = document.recoveryToken;
  }

  if (session?.[kSnapshotEnabled] && session[kSnapshotTime] === undefined) {
    // find and aggregate commands return atClusterTime on the cursor
    // distinct includes it in the response body
    const atClusterTime = document.cursor?.atClusterTime || document.atClusterTime;
    if (atClusterTime) {
      session[kSnapshotTime] = atClusterTime;
    }
  }
}
