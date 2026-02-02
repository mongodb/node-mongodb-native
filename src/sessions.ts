import { setTimeout } from 'timers/promises';

import { Binary, ByteUtils, type Document, Long, type Timestamp } from './bson';
import type { CommandOptions, Connection } from './cmap/connection';
import { ConnectionPoolMetrics } from './cmap/metrics';
import { type MongoDBResponse } from './cmap/wire_protocol/responses';
import { PINNED, UNPINNED } from './constants';
import type { AbstractCursor } from './cursor/abstract_cursor';
import {
  type AnyError,
  isRetryableWriteError,
  MongoAPIError,
  MongoCompatibilityError,
  MONGODB_ERROR_CODES,
  type MongoDriverError,
  MongoError,
  MongoErrorLabel,
  MongoExpiredSessionError,
  MongoInvalidArgumentError,
  MongoRuntimeError,
  MongoServerError,
  MongoTransactionError,
  MongoWriteConcernError
} from './error';
import type { MongoClient, MongoOptions } from './mongo_client';
import { TypedEventEmitter } from './mongo_types';
import { executeOperation } from './operations/execute_operation';
import { RunCommandOperation } from './operations/run_command';
import { ReadConcernLevel } from './read_concern';
import { ReadPreference } from './read_preference';
import { _advanceClusterTime, type ClusterTime, TopologyType } from './sdam/common';
import { TimeoutContext } from './timeout';
import {
  isTransactionCommand,
  Transaction,
  type TransactionOptions,
  TxnState
} from './transactions';
import {
  calculateDurationInMs,
  commandSupportsReadConcern,
  isPromiseLike,
  List,
  MongoDBNamespace,
  noop,
  processTimeMS,
  squashError,
  uuidV4
} from './utils';
import { WriteConcern, type WriteConcernOptions, type WriteConcernSettings } from './write_concern';

/** @public */
export interface ClientSessionOptions {
  /** Whether causal consistency should be enabled on this session */
  causalConsistency?: boolean;
  /** Whether all read operations should be read from the same snapshot for this session (NOTE: not compatible with `causalConsistency=true`) */
  snapshot?: boolean;
  /** The default TransactionOptions to use for transactions started on this session. */
  defaultTransactionOptions?: TransactionOptions;
  /**
   * @public
   * @experimental
   * An overriding timeoutMS value to use for a client-side timeout.
   * If not provided the session uses the timeoutMS specified on the MongoClient.
   */
  defaultTimeoutMS?: number;

  /** @internal */
  owner?: symbol | AbstractCursor;
  /** @internal */
  explicit?: boolean;
  /** @internal */
  initialClusterTime?: ClusterTime;
}

/** @public */
export type WithTransactionCallback<T = any> = (session: ClientSession) => Promise<T>;

/** @public */
export type ClientSessionEvents = {
  ended(session: ClientSession): void;
};

/** @public */
export interface EndSessionOptions {
  /**
   * An optional error which caused the call to end this session
   * @internal
   */
  error?: AnyError;
  force?: boolean;
  forceClear?: boolean;

  /** Specifies the time an operation will run until it throws a timeout error */
  timeoutMS?: number;
}

/**
 * A class representing a client session on the server
 *
 * NOTE: not meant to be instantiated directly.
 * @public
 */
export class ClientSession
  extends TypedEventEmitter<ClientSessionEvents>
  implements AsyncDisposable
{
  /** @internal */
  client: MongoClient;
  /** @internal */
  sessionPool: ServerSessionPool;
  hasEnded: boolean;
  clientOptions: MongoOptions;
  supports: { causalConsistency: boolean };
  clusterTime?: ClusterTime;
  operationTime?: Timestamp;
  explicit: boolean;
  /** @internal */
  owner?: symbol | AbstractCursor;
  defaultTransactionOptions: TransactionOptions;
  /** @internal */
  transaction: Transaction;
  /**
   * @internal
   * Keeps track of whether or not the current transaction has attempted to be committed. Is
   * initially undefined. Gets set to false when startTransaction is called. When commitTransaction is sent to server, if the commitTransaction succeeds, it is then set to undefined, otherwise, set to true
   */
  private commitAttempted?: boolean;
  public readonly snapshotEnabled: boolean;

  /** @internal */
  private _serverSession: ServerSession | null;
  /** @internal */
  public snapshotTime?: Timestamp;
  /** @internal */
  public pinnedConnection?: Connection;
  /** @internal */
  public txnNumberIncrement: number;
  /**
   * @experimental
   * Specifies the time an operation in a given `ClientSession` will run until it throws a timeout error
   */
  timeoutMS?: number;

  /** @internal */
  public timeoutContext: TimeoutContext | null = null;

  /**
   * Create a client session.
   * @internal
   * @param client - The current client
   * @param sessionPool - The server session pool (Internal Class)
   * @param options - Optional settings
   * @param clientOptions - Optional settings provided when creating a MongoClient
   */
  constructor(
    client: MongoClient,
    sessionPool: ServerSessionPool,
    options: ClientSessionOptions,
    clientOptions: MongoOptions
  ) {
    super();
    this.on('error', noop);

    if (client == null) {
      // TODO(NODE-3483)
      throw new MongoRuntimeError('ClientSession requires a MongoClient');
    }

    if (sessionPool == null || !(sessionPool instanceof ServerSessionPool)) {
      // TODO(NODE-3483)
      throw new MongoRuntimeError('ClientSession requires a ServerSessionPool');
    }

    options = options ?? {};

    this.snapshotEnabled = options.snapshot === true;
    if (options.causalConsistency === true && this.snapshotEnabled) {
      throw new MongoInvalidArgumentError(
        'Properties "causalConsistency" and "snapshot" are mutually exclusive'
      );
    }

    this.client = client;
    this.sessionPool = sessionPool;
    this.hasEnded = false;
    this.clientOptions = clientOptions;
    this.timeoutMS = options.defaultTimeoutMS ?? client.s.options?.timeoutMS;

    this.explicit = !!options.explicit;
    this._serverSession = this.explicit ? this.sessionPool.acquire() : null;
    this.txnNumberIncrement = 0;

    const defaultCausalConsistencyValue = this.explicit && options.snapshot !== true;
    this.supports = {
      // if we can enable causal consistency, do so by default
      causalConsistency: options.causalConsistency ?? defaultCausalConsistencyValue
    };

    this.clusterTime = options.initialClusterTime;

    this.operationTime = undefined;
    this.owner = options.owner;
    this.defaultTransactionOptions = { ...options.defaultTransactionOptions };
    this.transaction = new Transaction();
  }

  /** The server id associated with this session */
  get id(): ServerSessionId | undefined {
    return this.serverSession?.id;
  }

  get serverSession(): ServerSession {
    let serverSession = this._serverSession;
    if (serverSession == null) {
      if (this.explicit) {
        throw new MongoRuntimeError('Unexpected null serverSession for an explicit session');
      }
      if (this.hasEnded) {
        throw new MongoRuntimeError('Unexpected null serverSession for an ended implicit session');
      }
      serverSession = this.sessionPool.acquire();
      this._serverSession = serverSession;
    }
    return serverSession;
  }

  get loadBalanced(): boolean {
    return this.client.topology?.description.type === TopologyType.LoadBalanced;
  }

  /** @internal */
  pin(conn: Connection): void {
    if (this.pinnedConnection) {
      throw TypeError('Cannot pin multiple connections to the same session');
    }

    this.pinnedConnection = conn;
    conn.emit(
      PINNED,
      this.inTransaction() ? ConnectionPoolMetrics.TXN : ConnectionPoolMetrics.CURSOR
    );
  }

  /** @internal */
  unpin(options?: { force?: boolean; forceClear?: boolean; error?: AnyError }): void {
    if (this.loadBalanced) {
      return maybeClearPinnedConnection(this, options);
    }

    this.transaction.unpinServer();
  }

  get isPinned(): boolean {
    return this.loadBalanced ? !!this.pinnedConnection : this.transaction.isPinned;
  }

  /**
   * Frees any client-side resources held by the current session.  If a session is in a transaction,
   * the transaction is aborted.
   *
   * Does not end the session on the server.
   *
   * @param options - Optional settings. Currently reserved for future use
   */
  async endSession(options?: EndSessionOptions): Promise<void> {
    try {
      if (this.inTransaction()) {
        await this.abortTransaction({ ...options, throwTimeout: true });
      }
    } catch (error) {
      // spec indicates that we should ignore all errors for `endSessions`
      if (error.name === 'MongoOperationTimeoutError') throw error;
      squashError(error);
    } finally {
      if (!this.hasEnded) {
        const serverSession = this.serverSession;
        if (serverSession != null) {
          // release the server session back to the pool
          this.sessionPool.release(serverSession);
          // Store a clone of the server session for reference (debugging)
          this._serverSession = new ServerSession(serverSession);
        }
        // mark the session as ended, and emit a signal
        this.hasEnded = true;
        this.emit('ended', this);
      }
      maybeClearPinnedConnection(this, { force: true, ...options });
    }
  }
  /**
   * @experimental
   * An alias for {@link ClientSession.endSession|ClientSession.endSession()}.
   */
  async [Symbol.asyncDispose]() {
    await this.endSession({ force: true });
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
   * Advances the clusterTime for a ClientSession to the provided clusterTime of another ClientSession
   *
   * @param clusterTime - the $clusterTime returned by the server from another session in the form of a document containing the `BSON.Timestamp` clusterTime and signature
   */
  advanceClusterTime(clusterTime: ClusterTime): void {
    if (!clusterTime || typeof clusterTime !== 'object') {
      throw new MongoInvalidArgumentError('input cluster time must be an object');
    }
    if (!clusterTime.clusterTime || clusterTime.clusterTime._bsontype !== 'Timestamp') {
      throw new MongoInvalidArgumentError(
        'input cluster time "clusterTime" property must be a valid BSON Timestamp'
      );
    }
    if (
      !clusterTime.signature ||
      clusterTime.signature.hash?._bsontype !== 'Binary' ||
      (typeof clusterTime.signature.keyId !== 'bigint' &&
        typeof clusterTime.signature.keyId !== 'number' &&
        clusterTime.signature.keyId?._bsontype !== 'Long') // apparently we decode the key to number?
    ) {
      throw new MongoInvalidArgumentError(
        'input cluster time must have a valid "signature" property with BSON Binary hash and BSON Long keyId'
      );
    }

    _advanceClusterTime(this, clusterTime);
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

    return ByteUtils.equals(this.id.id.buffer, session.id.id.buffer);
  }

  /**
   * Increment the transaction number on the internal ServerSession
   *
   * @privateRemarks
   * This helper increments a value stored on the client session that will be
   * added to the serverSession's txnNumber upon applying it to a command.
   * This is because the serverSession is lazily acquired after a connection is obtained
   */
  incrementTransactionNumber(): void {
    this.txnNumberIncrement += 1;
  }

  /** @returns whether this session is currently in a transaction or not */
  inTransaction(): boolean {
    return this.transaction.isActive;
  }

  /**
   * Starts a new transaction with the given options.
   *
   * @remarks
   * **IMPORTANT**: Running operations in parallel is not supported during a transaction. The use of `Promise.all`,
   * `Promise.allSettled`, `Promise.race`, etc to parallelize operations inside a transaction is
   * undefined behaviour.
   *
   * @param options - Options for the transaction
   */
  startTransaction(options?: TransactionOptions): void {
    if (this.snapshotEnabled) {
      throw new MongoCompatibilityError('Transactions are not supported in snapshot sessions');
    }

    if (this.inTransaction()) {
      throw new MongoTransactionError('Transaction already in progress');
    }

    if (this.isPinned && this.transaction.isCommitted) {
      this.unpin();
    }

    this.commitAttempted = false;
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
   * @param options - Optional options, can be used to override `defaultTimeoutMS`.
   */
  async commitTransaction(options?: { timeoutMS?: number }): Promise<void> {
    if (this.transaction.state === TxnState.NO_TRANSACTION) {
      throw new MongoTransactionError('No transaction started');
    }

    if (
      this.transaction.state === TxnState.STARTING_TRANSACTION ||
      this.transaction.state === TxnState.TRANSACTION_COMMITTED_EMPTY
    ) {
      // the transaction was never started, we can safely exit here
      this.transaction.transition(TxnState.TRANSACTION_COMMITTED_EMPTY);
      return;
    }

    if (this.transaction.state === TxnState.TRANSACTION_ABORTED) {
      throw new MongoTransactionError(
        'Cannot call commitTransaction after calling abortTransaction'
      );
    }

    const command: {
      commitTransaction: 1;
      writeConcern?: WriteConcernSettings;
      recoveryToken?: Document;
      maxTimeMS?: number;
    } = { commitTransaction: 1 };

    const timeoutMS =
      typeof options?.timeoutMS === 'number'
        ? options.timeoutMS
        : typeof this.timeoutMS === 'number'
          ? this.timeoutMS
          : null;

    const wc = this.transaction.options.writeConcern ?? this.clientOptions?.writeConcern;
    if (wc != null) {
      if (timeoutMS == null && this.timeoutContext == null) {
        WriteConcern.apply(command, { wtimeoutMS: 10000, w: 'majority', ...wc });
      } else {
        const wcKeys = Object.keys(wc);
        if (wcKeys.length > 2 || (!wcKeys.includes('wtimeoutMS') && !wcKeys.includes('wTimeoutMS')))
          // if the write concern was specified with wTimeoutMS, then we set both wtimeoutMS and wTimeoutMS, guaranteeing at least two keys, so if we have more than two keys, then we can automatically assume that we should add the write concern to the command. If it has 2 or fewer keys, we need to check that those keys aren't the wtimeoutMS or wTimeoutMS options before we add the write concern to the command
          WriteConcern.apply(command, { ...wc, wtimeoutMS: undefined });
      }
    }

    if (this.transaction.state === TxnState.TRANSACTION_COMMITTED || this.commitAttempted) {
      if (timeoutMS == null && this.timeoutContext == null) {
        WriteConcern.apply(command, { wtimeoutMS: 10000, ...wc, w: 'majority' });
      } else {
        WriteConcern.apply(command, { w: 'majority', ...wc, wtimeoutMS: undefined });
      }
    }

    if (typeof this.transaction.options.maxTimeMS === 'number') {
      command.maxTimeMS = this.transaction.options.maxTimeMS;
    }

    if (this.transaction.recoveryToken) {
      command.recoveryToken = this.transaction.recoveryToken;
    }

    const operation = new RunCommandOperation(new MongoDBNamespace('admin'), command, {
      session: this,
      readPreference: ReadPreference.primary,
      bypassPinningCheck: true
    });

    const timeoutContext =
      this.timeoutContext ??
      (typeof timeoutMS === 'number'
        ? TimeoutContext.create({
            serverSelectionTimeoutMS: this.clientOptions.serverSelectionTimeoutMS,
            socketTimeoutMS: this.clientOptions.socketTimeoutMS,
            timeoutMS
          })
        : null);

    try {
      await executeOperation(this.client, operation, timeoutContext);
      this.commitAttempted = undefined;
      return;
    } catch (firstCommitError) {
      this.commitAttempted = true;
      if (firstCommitError instanceof MongoError && isRetryableWriteError(firstCommitError)) {
        // SPEC-1185: apply majority write concern when retrying commitTransaction
        WriteConcern.apply(command, { wtimeoutMS: 10000, ...wc, w: 'majority' });
        // per txns spec, must unpin session in this case
        this.unpin({ force: true });

        try {
          await executeOperation(
            this.client,
            new RunCommandOperation(new MongoDBNamespace('admin'), command, {
              session: this,
              readPreference: ReadPreference.primary,
              bypassPinningCheck: true
            }),
            timeoutContext
          );
          return;
        } catch (retryCommitError) {
          // If the retry failed, we process that error instead of the original
          if (shouldAddUnknownTransactionCommitResultLabel(retryCommitError)) {
            retryCommitError.addErrorLabel(MongoErrorLabel.UnknownTransactionCommitResult);
          }

          if (shouldUnpinAfterCommitError(retryCommitError)) {
            this.unpin({ error: retryCommitError });
          }

          throw retryCommitError;
        }
      }

      if (shouldAddUnknownTransactionCommitResultLabel(firstCommitError)) {
        firstCommitError.addErrorLabel(MongoErrorLabel.UnknownTransactionCommitResult);
      }

      if (shouldUnpinAfterCommitError(firstCommitError)) {
        this.unpin({ error: firstCommitError });
      }

      throw firstCommitError;
    } finally {
      this.transaction.transition(TxnState.TRANSACTION_COMMITTED);
    }
  }

  /**
   * Aborts the currently active transaction in this session.
   *
   * @param options - Optional options, can be used to override `defaultTimeoutMS`.
   */
  async abortTransaction(options?: { timeoutMS?: number }): Promise<void>;
  /** @internal */
  async abortTransaction(options?: { timeoutMS?: number; throwTimeout?: true }): Promise<void>;
  async abortTransaction(options?: { timeoutMS?: number; throwTimeout?: true }): Promise<void> {
    if (this.transaction.state === TxnState.NO_TRANSACTION) {
      throw new MongoTransactionError('No transaction started');
    }

    if (this.transaction.state === TxnState.STARTING_TRANSACTION) {
      // the transaction was never started, we can safely exit here
      this.transaction.transition(TxnState.TRANSACTION_ABORTED);
      return;
    }

    if (this.transaction.state === TxnState.TRANSACTION_ABORTED) {
      throw new MongoTransactionError('Cannot call abortTransaction twice');
    }

    if (
      this.transaction.state === TxnState.TRANSACTION_COMMITTED ||
      this.transaction.state === TxnState.TRANSACTION_COMMITTED_EMPTY
    ) {
      throw new MongoTransactionError(
        'Cannot call abortTransaction after calling commitTransaction'
      );
    }

    const command: {
      abortTransaction: 1;
      writeConcern?: WriteConcernOptions;
      recoveryToken?: Document;
    } = { abortTransaction: 1 };

    const timeoutMS =
      typeof options?.timeoutMS === 'number'
        ? options.timeoutMS
        : this.timeoutContext?.csotEnabled()
          ? this.timeoutContext.timeoutMS // refresh timeoutMS for abort operation
          : typeof this.timeoutMS === 'number'
            ? this.timeoutMS
            : null;

    const timeoutContext =
      timeoutMS != null
        ? TimeoutContext.create({
            timeoutMS,
            serverSelectionTimeoutMS: this.clientOptions.serverSelectionTimeoutMS,
            socketTimeoutMS: this.clientOptions.socketTimeoutMS
          })
        : null;

    const wc = this.transaction.options.writeConcern ?? this.clientOptions?.writeConcern;
    if (wc != null && timeoutMS == null) {
      WriteConcern.apply(command, { wtimeoutMS: 10000, w: 'majority', ...wc });
    }

    if (this.transaction.recoveryToken) {
      command.recoveryToken = this.transaction.recoveryToken;
    }

    const operation = new RunCommandOperation(new MongoDBNamespace('admin'), command, {
      session: this,
      readPreference: ReadPreference.primary,
      bypassPinningCheck: true
    });

    try {
      await executeOperation(this.client, operation, timeoutContext);
      this.unpin();
      return;
    } catch (firstAbortError) {
      this.unpin();

      if (firstAbortError.name === 'MongoRuntimeError') throw firstAbortError;
      if (options?.throwTimeout && firstAbortError.name === 'MongoOperationTimeoutError') {
        throw firstAbortError;
      }

      if (firstAbortError instanceof MongoError && isRetryableWriteError(firstAbortError)) {
        try {
          await executeOperation(this.client, operation, timeoutContext);
          return;
        } catch (secondAbortError) {
          if (secondAbortError.name === 'MongoRuntimeError') throw secondAbortError;
          if (options?.throwTimeout && secondAbortError.name === 'MongoOperationTimeoutError') {
            throw secondAbortError;
          }
          // we do not retry the retry
        }
      }

      // The spec indicates that if the operation times out or fails with a non-retryable error, we should ignore all errors on `abortTransaction`
    } finally {
      this.transaction.transition(TxnState.TRANSACTION_ABORTED);
      if (this.loadBalanced) {
        maybeClearPinnedConnection(this, { force: false });
      }
    }
  }

  /**
   * This is here to ensure that ClientSession is never serialized to BSON.
   */
  toBSON(): never {
    throw new MongoRuntimeError('ClientSession cannot be serialized to BSON.');
  }

  /**
   * Starts a transaction and runs a provided function, ensuring the commitTransaction is always attempted when all operations run in the function have completed.
   *
   * **IMPORTANT:** This method requires the function passed in to return a Promise. That promise must be made by `await`-ing all operations in such a way that rejections are propagated to the returned promise.
   *
   * **IMPORTANT:** Running operations in parallel is not supported during a transaction. The use of `Promise.all`,
   * `Promise.allSettled`, `Promise.race`, etc to parallelize operations inside a transaction is
   * undefined behaviour.
   *
   * **IMPORTANT:** When running an operation inside a `withTransaction` callback, if it is not
   * provided the explicit session in its options, it will not be part of the transaction and it will not respect timeoutMS.
   *
   *
   * @remarks
   * - If all operations successfully complete and the `commitTransaction` operation is successful, then the provided function will return the result of the provided function.
   * - If the transaction is unable to complete or an error is thrown from within the provided function, then the provided function will throw an error.
   *   - If the transaction is manually aborted within the provided function it will not throw.
   * - If the driver needs to attempt to retry the operations, the provided function may be called multiple times.
   *
   * Checkout a descriptive example here:
   * @see https://www.mongodb.com/blog/post/quick-start-nodejs--mongodb--how-to-implement-transactions
   *
   * If a command inside withTransaction fails:
   * - It may cause the transaction on the server to be aborted.
   * - This situation is normally handled transparently by the driver.
   * - However, if the application catches such an error and does not rethrow it, the driver will not be able to determine whether the transaction was aborted or not.
   * - The driver will then retry the transaction indefinitely.
   *
   * To avoid this situation, the application must not silently handle errors within the provided function.
   * If the application needs to handle errors within, it must await all operations such that if an operation is rejected it becomes the rejection of the callback function passed into withTransaction.
   *
   * @param fn - callback to run within a transaction
   * @param options - optional settings for the transaction
   * @returns A raw command response or undefined
   */
  async withTransaction<T = any>(
    fn: WithTransactionCallback<T>,
    options?: TransactionOptions & {
      /**
       * Configures a timeoutMS expiry for the entire withTransactionCallback.
       *
       * @remarks
       * - The remaining timeout will not be applied to callback operations that do not use the ClientSession.
       * - Overriding timeoutMS for operations executed using the explicit session inside the provided callback will result in a client-side error.
       */
      timeoutMS?: number;
    }
  ): Promise<T> {
    const MAX_TIMEOUT = 120000;

    const timeoutMS = options?.timeoutMS ?? this.timeoutMS ?? null;
    this.timeoutContext =
      timeoutMS != null
        ? TimeoutContext.create({
            timeoutMS,
            serverSelectionTimeoutMS: this.clientOptions.serverSelectionTimeoutMS,
            socketTimeoutMS: this.clientOptions.socketTimeoutMS
          })
        : null;

    // 1. Record the current monotonic time, which will be used to enforce the 120-second timeout before later retry attempts.
    const startTime = this.timeoutContext?.csotEnabled() // This is strictly to appease TS.  We must narrow the context to a CSOT context before accessing `.start`.
      ? this.timeoutContext.start
      : processTimeMS();

    let committed = false;
    let result: T;

    let lastError: Error | null = null;

    try {
      retryTransaction: for (
        // 2. Set `transactionAttempt` to `0`.
        let transactionAttempt = 0, isRetry = false;
        !committed;
        ++transactionAttempt, isRetry = transactionAttempt > 0
      ) {
        // 2. If `transactionAttempt` > 0:
        if (isRetry) {
          // 2.i If elapsed time + `backoffMS` > `TIMEOUT_MS`, then raise the previously encountered error. If the elapsed time of
          //     `withTransaction` is less than TIMEOUT_MS, calculate the backoffMS to be
          //     `jitter * min(BACKOFF_INITIAL * 1.5 ** (transactionAttempt - 1), BACKOFF_MAX)`. sleep for `backoffMS`.
          // 2.i.i jitter is a random float between \[0, 1)
          // 2.i.ii `transactionAttempt` is the variable defined in step 1.
          // 2.i.iii `BACKOFF_INITIAL` is 5ms
          // 2.i.iv `BACKOFF_MAX` is 500ms
          const BACKOFF_INITIAL_MS = 5;
          const BACKOFF_MAX_MS = 500;
          const BACKOFF_GROWTH = 1.5;
          const jitter = Math.random();
          const backoffMS =
            jitter *
            Math.min(
              BACKOFF_INITIAL_MS * BACKOFF_GROWTH ** (transactionAttempt - 1),
              BACKOFF_MAX_MS
            );

          const willExceedTransactionDeadline =
            (this.timeoutContext?.csotEnabled() &&
              backoffMS > this.timeoutContext.remainingTimeMS) ||
            processTimeMS() + backoffMS > startTime + MAX_TIMEOUT;

          if (willExceedTransactionDeadline) {
            throw (
              lastError ??
              new MongoRuntimeError(
                `Transaction retry did not record an error: should never occur. Please file a bug.`
              )
            );
          }

          await setTimeout(backoffMS);
        }

        // 3. Invoke startTransaction on the session
        // 4. If `startTransaction` reported an error, propagate that error to the caller of `withTransaction` and return immediately.
        this.startTransaction(options); // may throw on error

        try {
          // 5. Invoke the callback.
          // 6. Control returns to withTransaction. (continued below)
          const promise = fn(this);
          if (!isPromiseLike(promise)) {
            throw new MongoInvalidArgumentError(
              'Function provided to `withTransaction` must return a Promise'
            );
          }

          result = await promise;

          // 6. (cont.) Determine the current state of the ClientSession (continued below)
          if (
            this.transaction.state === TxnState.NO_TRANSACTION ||
            this.transaction.state === TxnState.TRANSACTION_COMMITTED ||
            this.transaction.state === TxnState.TRANSACTION_ABORTED
          ) {
            // 8. If the ClientSession is in the "no transaction", "transaction aborted", or "transaction committed" state,
            // assume the callback intentionally aborted or committed the transaction and return immediately.
            return result;
          }
          // 5. (cont.) and whether the callback reported an error
          // 7. If the callback reported an error:
        } catch (fnError) {
          if (!(fnError instanceof MongoError) || fnError instanceof MongoInvalidArgumentError) {
            // This first preemptive abort regardless of TxnState isn't spec,
            // and it's unclear whether it's serving a practical purpose, but this logic is OLD
            await this.abortTransaction();
            throw fnError;
          }

          if (
            this.transaction.state === TxnState.STARTING_TRANSACTION ||
            this.transaction.state === TxnState.TRANSACTION_IN_PROGRESS
          ) {
            // 7.i If the ClientSession is in the "starting transaction" or "transaction in progress" state,
            // invoke abortTransaction on the session
            await this.abortTransaction();
          }

          if (
            fnError.hasErrorLabel(MongoErrorLabel.TransientTransactionError) &&
            (this.timeoutContext?.csotEnabled() || processTimeMS() - startTime < MAX_TIMEOUT)
          ) {
            // 7.ii If the callback's error includes a "TransientTransactionError" label and the elapsed time of `withTransaction`
            // is less than 120 seconds, jump back to step two.
            lastError = fnError;
            continue retryTransaction;
          }

          // 7.iii If the callback's error includes a "UnknownTransactionCommitResult" label, the callback must have manually committed a transaction,
          // propagate the callback's error to the caller of withTransaction and return immediately.
          // The 7.iii check is redundant with 6.iv, so we don't write code for it
          // 7.iv Otherwise, propagate the callback's error to the caller of withTransaction and return immediately.
          throw fnError;
        }

        retryCommit: while (!committed) {
          try {
            /*
             * We will rely on ClientSession.commitTransaction() to
             * apply a majority write concern if commitTransaction is
             * being retried (see: DRIVERS-601)
             */
            // 9. Invoke commitTransaction on the session.
            await this.commitTransaction();
            committed = true;
            // 10. If commitTransaction reported an error:
          } catch (commitError) {
            // If CSOT is enabled, we repeatedly retry until timeoutMS expires.  This is enforced by providing a
            // timeoutContext to each async API, which know how to cancel themselves (i.e., the next retry will
            // abort the withTransaction call).
            // If CSOT is not enabled, do we still have time remaining or have we timed out?
            const hasTimedOut =
              !this.timeoutContext?.csotEnabled() && processTimeMS() - startTime >= MAX_TIMEOUT;

            if (!hasTimedOut) {
              /*
               * Note: a maxTimeMS error will have the MaxTimeMSExpired
               * code (50) and can be reported as a top-level error or
               * inside writeConcernError, ex.
               * { ok:0, code: 50, codeName: 'MaxTimeMSExpired' }
               * { ok:1, writeConcernError: { code: 50, codeName: 'MaxTimeMSExpired' } }
               */
              if (
                !isMaxTimeMSExpiredError(commitError) &&
                commitError.hasErrorLabel(MongoErrorLabel.UnknownTransactionCommitResult)
              ) {
                // 10.i If the `commitTransaction` error includes a "UnknownTransactionCommitResult" label and the error is not
                // MaxTimeMSExpired and the elapsed time of `withTransaction` is less than 120 seconds, jump back to step eight.
                continue retryCommit;
              }

              if (commitError.hasErrorLabel(MongoErrorLabel.TransientTransactionError)) {
                // 10.ii If the commitTransaction error includes a "TransientTransactionError" label
                // and the elapsed time of withTransaction is less than 120 seconds, jump back to step two.
                lastError = commitError;

                continue retryTransaction;
              }
            }

            // 10.iii Otherwise, propagate the commitTransaction error to the caller of withTransaction and return immediately.
            throw commitError;
          }
        }
      }

      // @ts-expect-error Result is always defined if we reach here, the for-loop above convinces TS it is not.
      return result;
    } finally {
      this.timeoutContext = null;
    }
  }
}

const NON_DETERMINISTIC_WRITE_CONCERN_ERRORS = new Set([
  'CannotSatisfyWriteConcern',
  'UnknownReplWriteConcern',
  'UnsatisfiableWriteConcern'
]);

function shouldUnpinAfterCommitError(commitError: Error) {
  if (commitError instanceof MongoError) {
    if (
      isRetryableWriteError(commitError) ||
      commitError instanceof MongoWriteConcernError ||
      isMaxTimeMSExpiredError(commitError)
    ) {
      if (isUnknownTransactionCommitResult(commitError)) {
        // per txns spec, must unpin session in this case
        return true;
      }
    } else if (commitError.hasErrorLabel(MongoErrorLabel.TransientTransactionError)) {
      return true;
    }
  }
  return false;
}

function shouldAddUnknownTransactionCommitResultLabel(commitError: MongoError) {
  let ok = isRetryableWriteError(commitError);
  ok ||= commitError instanceof MongoWriteConcernError;
  ok ||= isMaxTimeMSExpiredError(commitError);
  ok &&= isUnknownTransactionCommitResult(commitError);
  return ok;
}

function isUnknownTransactionCommitResult(err: MongoError): err is MongoError {
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

export function maybeClearPinnedConnection(
  session: ClientSession,
  options?: EndSessionOptions
): void {
  // unpin a connection if it has been pinned
  const conn = session.pinnedConnection;
  const error = options?.error;

  if (
    session.inTransaction() &&
    error &&
    error instanceof MongoError &&
    error.hasErrorLabel(MongoErrorLabel.TransientTransactionError)
  ) {
    return;
  }

  const topology = session.client.topology;
  // NOTE: the spec talks about what to do on a network error only, but the tests seem to
  //       to validate that we don't unpin on _all_ errors?
  if (conn && topology != null) {
    const servers = Array.from(topology.s.servers.values());
    const loadBalancer = servers[0];

    if (options?.error == null || options?.force) {
      loadBalancer.pool.checkIn(conn);
      session.pinnedConnection = undefined;
      conn.emit(
        UNPINNED,
        session.transaction.state !== TxnState.NO_TRANSACTION
          ? ConnectionPoolMetrics.TXN
          : ConnectionPoolMetrics.CURSOR
      );

      if (options?.forceClear) {
        loadBalancer.pool.clear({ serviceId: conn.serviceId });
      }
    }
  }
}

function isMaxTimeMSExpiredError(err: MongoError): boolean {
  if (err == null || !(err instanceof MongoServerError)) {
    return false;
  }

  return (
    err.code === MONGODB_ERROR_CODES.MaxTimeMSExpired ||
    err.writeConcernError?.code === MONGODB_ERROR_CODES.MaxTimeMSExpired
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
  constructor(cloned?: ServerSession | null) {
    if (cloned != null) {
      const idBytes = ByteUtils.allocateUnsafe(16);
      idBytes.set(cloned.id.id.buffer);
      this.id = { id: new Binary(idBytes, cloned.id.id.sub_type) };
      this.lastUse = cloned.lastUse;
      this.txnNumber = cloned.txnNumber;
      this.isDirty = cloned.isDirty;
      return;
    }
    this.id = { id: new Binary(uuidV4(), Binary.SUBTYPE_UUID) };
    this.lastUse = processTimeMS();
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
  client: MongoClient;
  sessions: List<ServerSession>;

  constructor(client: MongoClient) {
    if (client == null) {
      throw new MongoRuntimeError('ServerSessionPool requires a MongoClient');
    }

    this.client = client;
    this.sessions = new List<ServerSession>();
  }

  /**
   * Acquire a Server Session from the pool.
   * Iterates through each session in the pool, removing any stale sessions
   * along the way. The first non-stale session found is removed from the
   * pool and returned. If no non-stale session is found, a new ServerSession is created.
   */
  acquire(): ServerSession {
    const sessionTimeoutMinutes = this.client.topology?.logicalSessionTimeoutMinutes ?? 10;

    let session: ServerSession | null = null;

    // Try to obtain from session pool
    while (this.sessions.length > 0) {
      const potentialSession = this.sessions.shift();
      if (
        potentialSession != null &&
        (!!this.client.topology?.loadBalanced ||
          !potentialSession.hasTimedOut(sessionTimeoutMinutes))
      ) {
        session = potentialSession;
        break;
      }
    }

    // If nothing valid came from the pool make a new one
    if (session == null) {
      session = new ServerSession();
    }

    return session;
  }

  /**
   * Release a session to the session pool
   * Adds the session back to the session pool if the session has not timed out yet.
   * This method also removes any stale sessions from the pool.
   *
   * @param session - The session to release to the pool
   */
  release(session: ServerSession): void {
    const sessionTimeoutMinutes = this.client.topology?.logicalSessionTimeoutMinutes ?? 10;

    if (this.client.topology?.loadBalanced && !sessionTimeoutMinutes) {
      this.sessions.unshift(session);
    }

    if (!sessionTimeoutMinutes) {
      return;
    }

    this.sessions.prune(session => session.hasTimedOut(sessionTimeoutMinutes));

    if (!session.hasTimedOut(sessionTimeoutMinutes)) {
      if (session.isDirty) {
        return;
      }

      // otherwise, readd this session to the session pool
      this.sessions.unshift(session);
    }
  }
}

/**
 * Optionally decorate a command with sessions specific keys
 *
 * @param session - the session tracking transaction state
 * @param command - the command to decorate
 * @param options - Optional settings passed to calling operation
 *
 * @internal
 */
export function applySession(
  session: ClientSession,
  command: Document,
  options: CommandOptions
): MongoDriverError | undefined {
  if (session.hasEnded) {
    return new MongoExpiredSessionError();
  }

  // May acquire serverSession here
  const serverSession = session.serverSession;
  if (serverSession == null) {
    return new MongoRuntimeError('Unable to acquire server session');
  }

  if (options.writeConcern?.w === 0) {
    if (session && session.explicit) {
      // Error if user provided an explicit session to an unacknowledged write (SPEC-1019)
      return new MongoAPIError('Cannot have explicit session with unacknowledged writes');
    }
    return;
  }

  // mark the last use of this session, and apply the `lsid`
  serverSession.lastUse = processTimeMS();
  command.lsid = serverSession.id;

  const inTxnOrTxnCommand = session.inTransaction() || isTransactionCommand(command);
  const isRetryableWrite = !!options.willRetryWrite;

  if (isRetryableWrite || inTxnOrTxnCommand) {
    serverSession.txnNumber += session.txnNumberIncrement;
    session.txnNumberIncrement = 0;
    // TODO(NODE-2674): Preserve int64 sent from MongoDB
    command.txnNumber = Long.fromNumber(serverSession.txnNumber);
  }

  if (!inTxnOrTxnCommand) {
    if (session.transaction.state !== TxnState.NO_TRANSACTION) {
      session.transaction.transition(TxnState.NO_TRANSACTION);
    }

    if (
      session.supports.causalConsistency &&
      session.operationTime &&
      commandSupportsReadConcern(command)
    ) {
      command.readConcern = command.readConcern || {};
      Object.assign(command.readConcern, { afterClusterTime: session.operationTime });
    } else if (session.snapshotEnabled) {
      command.readConcern = command.readConcern || { level: ReadConcernLevel.snapshot };
      if (session.snapshotTime != null) {
        Object.assign(command.readConcern, { atClusterTime: session.snapshotTime });
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
  return;
}

export function updateSessionFromResponse(session: ClientSession, document: MongoDBResponse): void {
  if (document.$clusterTime) {
    _advanceClusterTime(session, document.$clusterTime);
  }

  if (document.operationTime && session && session.supports.causalConsistency) {
    session.advanceOperationTime(document.operationTime);
  }

  if (document.recoveryToken && session && session.inTransaction()) {
    session.transaction._recoveryToken = document.recoveryToken;
  }

  if (session?.snapshotEnabled && session.snapshotTime == null) {
    // find and aggregate commands return atClusterTime on the cursor
    // distinct includes it in the response body
    const atClusterTime = document.atClusterTime;
    if (atClusterTime) {
      session.snapshotTime = atClusterTime;
    }
  }
}
