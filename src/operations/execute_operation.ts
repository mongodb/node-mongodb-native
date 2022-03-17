import type { Document } from '../bson';
import {
  isRetryableReadError,
  MongoCompatibilityError,
  MONGODB_ERROR_CODES,
  MongoError,
  MongoErrorLabel,
  MongoExpiredSessionError,
  MongoNetworkError,
  MongoRuntimeError,
  MongoServerError,
  MongoTransactionError,
  MongoUnexpectedServerResponseError
} from '../error';
import { ReadPreference } from '../read_preference';
import type { Server } from '../sdam/server';
import {
  sameServerSelector,
  secondaryWritableServerSelector,
  ServerSelector
} from '../sdam/server_selection';
import type { Topology } from '../sdam/topology';
import type { ClientSession } from '../sessions';
import {
  Callback,
  getTopology,
  maybePromise,
  supportsRetryableWrites,
  TopologyProvider
} from '../utils';
import { AbstractOperation, Aspect } from './operation';

const MMAPv1_RETRY_WRITES_ERROR_CODE = MONGODB_ERROR_CODES.IllegalOperation;
const MMAPv1_RETRY_WRITES_ERROR_MESSAGE =
  'This MongoDB deployment does not support retryable writes. Please add retryWrites=false to your connection string.';

type ResultTypeFromOperation<TOperation> = TOperation extends AbstractOperation<infer K>
  ? K
  : never;

/** @internal */
export interface ExecutionResult {
  /** The server selected for the operation */
  server: Server;
  /** The session used for this operation, may be implicitly created */
  session?: ClientSession;
  /** The raw server response for the operation */
  response: Document;
}

/**
 * Executes the given operation with provided arguments.
 * @internal
 *
 * @remarks
 * This method reduces large amounts of duplication in the entire codebase by providing
 * a single point for determining whether callbacks or promises should be used. Additionally
 * it allows for a single point of entry to provide features such as implicit sessions, which
 * are required by the Driver Sessions specification in the event that a ClientSession is
 * not provided
 *
 * @param topology - The topology to execute this operation on
 * @param operation - The operation to execute
 * @param callback - The command result callback
 */
export function executeOperation<
  T extends AbstractOperation<TResult>,
  TResult = ResultTypeFromOperation<T>
>(topologyProvider: TopologyProvider, operation: T): Promise<TResult>;
export function executeOperation<
  T extends AbstractOperation<TResult>,
  TResult = ResultTypeFromOperation<T>
>(topologyProvider: TopologyProvider, operation: T, callback: Callback<TResult>): void;
export function executeOperation<
  T extends AbstractOperation<TResult>,
  TResult = ResultTypeFromOperation<T>
>(
  topologyProvider: TopologyProvider,
  operation: T,
  callback?: Callback<TResult>
): Promise<TResult> | void;
export function executeOperation<
  T extends AbstractOperation<TResult>,
  TResult = ResultTypeFromOperation<T>
>(
  topologyProvider: TopologyProvider,
  operation: T,
  callback?: Callback<TResult>
): Promise<TResult> | void {
  if (!(operation instanceof AbstractOperation)) {
    // TODO(NODE-3483): Extend MongoRuntimeError
    throw new MongoRuntimeError('This method requires a valid operation instance');
  }

  return maybePromise(callback, callback => {
    let topology: Topology;
    try {
      topology = getTopology(topologyProvider);
    } catch (error) {
      return callback(error);
    }
    if (topology.shouldCheckForSessionSupport()) {
      return topology.selectServer(ReadPreference.primaryPreferred, {}, err => {
        if (err) return callback(err);

        executeOperation<T, TResult>(topologyProvider, operation, callback);
      });
    }

    // The driver sessions spec mandates that we implicitly create sessions for operations
    // that are not explicitly provided with a session.
    let session = operation.session;
    let owner: symbol | undefined;
    if (topology.hasSessionSupport()) {
      if (session == null) {
        owner = Symbol();
        session = topology.startSession({ owner, explicit: false });
      } else if (session.hasEnded) {
        return callback(new MongoExpiredSessionError('Use of expired sessions is not permitted'));
      } else if (session.snapshotEnabled && !topology.capabilities.supportsSnapshotReads) {
        return callback(new MongoCompatibilityError('Snapshot reads require MongoDB 5.0 or later'));
      }
    } else if (session) {
      // If the user passed an explicit session and we are still, after server selection,
      // trying to run against a topology that doesn't support sessions we error out.
      return callback(new MongoCompatibilityError('Current topology does not support sessions'));
    }

    try {
      executeWithServerSelection<TResult>(topology, session, operation, (error, result) => {
        if (session?.owner != null && session.owner === owner) {
          return session.endSession(endSessionError => callback(endSessionError ?? error, result));
        }

        callback(error, result);
      });
    } catch (error) {
      if (session?.owner != null && session.owner === owner) {
        session.endSession();
      }
      throw error;
    }
  });
}

function executeWithServerSelection<TResult>(
  topology: Topology,
  session: ClientSession | undefined,
  operation: AbstractOperation,
  callback: Callback<TResult>
) {
  const readPreference = operation.readPreference ?? ReadPreference.primary;
  const inTransaction = !!session?.inTransaction();

  if (inTransaction && !readPreference.equals(ReadPreference.primary)) {
    return callback(
      new MongoTransactionError(
        `Read preference in a transaction must be primary, not: ${readPreference.mode}`
      )
    );
  }

  if (session?.isPinned && session.transaction.isCommitted && !operation.bypassPinningCheck) {
    session.unpin();
  }

  let selector: ReadPreference | ServerSelector;

  if (operation.hasAspect(Aspect.CURSOR_ITERATING)) {
    // Get more operations must always select the same server, but run through
    // server selection to potentially force monitor checks if the server is
    // in an unknown state.
    selector = sameServerSelector(operation.server?.description);
  } else if (operation.trySecondaryWrite) {
    // If operation should try to write to secondary use the custom server selector
    // otherwise provide the read preference.
    selector = secondaryWritableServerSelector(topology.commonWireVersion, readPreference);
  } else {
    selector = readPreference;
  }

  const serverSelectionOptions = { session };
  function retryOperation(originalError: MongoError) {
    const isWriteOperation = operation.hasAspect(Aspect.WRITE_OPERATION);
    const isReadOperation = operation.hasAspect(Aspect.READ_OPERATION);

    if (isWriteOperation && originalError.code === MMAPv1_RETRY_WRITES_ERROR_CODE) {
      return callback(
        new MongoServerError({
          message: MMAPv1_RETRY_WRITES_ERROR_MESSAGE,
          errmsg: MMAPv1_RETRY_WRITES_ERROR_MESSAGE,
          originalError
        })
      );
    }

    if (isWriteOperation && !originalError.hasErrorLabel(MongoErrorLabel.RetryableWriteError)) {
      return callback(originalError);
    }

    if (isReadOperation && !isRetryableReadError(originalError)) {
      return callback(originalError);
    }

    if (
      originalError instanceof MongoNetworkError &&
      session?.isPinned &&
      !session.inTransaction() &&
      operation.hasAspect(Aspect.CURSOR_CREATING)
    ) {
      // If we have a cursor and the initial command fails with a network error,
      // we can retry it on another connection. So we need to check it back in, clear the
      // pool for the service id, and retry again.
      session.unpin({ force: true, forceClear: true });
    }

    // select a new server, and attempt to retry the operation
    topology.selectServer(selector, serverSelectionOptions, (error?: Error, server?: Server) => {
      if (!error && isWriteOperation && !supportsRetryableWrites(server)) {
        return callback(
          new MongoUnexpectedServerResponseError(
            'Selected server does not support retryable writes'
          )
        );
      }

      if (error || !server) {
        return callback(
          error ?? new MongoUnexpectedServerResponseError('Server selection failed without error')
        );
      }

      operation.execute(server, session, callback);
    });
  }

  if (
    readPreference &&
    !readPreference.equals(ReadPreference.primary) &&
    session?.inTransaction()
  ) {
    callback(
      new MongoTransactionError(
        `Read preference in a transaction must be primary, not: ${readPreference.mode}`
      )
    );

    return;
  }

  // select a server, and execute the operation against it
  topology.selectServer(selector, serverSelectionOptions, (error, server) => {
    if (error || !server) {
      return callback(error);
    }

    if (session && operation.hasAspect(Aspect.RETRYABLE)) {
      const willRetryRead =
        topology.s.options.retryReads && !inTransaction && operation.canRetryRead;

      const willRetryWrite =
        topology.s.options.retryWrites &&
        !inTransaction &&
        supportsRetryableWrites(server) &&
        operation.canRetryWrite;

      const hasReadAspect = operation.hasAspect(Aspect.READ_OPERATION);
      const hasWriteAspect = operation.hasAspect(Aspect.WRITE_OPERATION);

      if ((hasReadAspect && willRetryRead) || (hasWriteAspect && willRetryWrite)) {
        if (hasWriteAspect && willRetryWrite) {
          operation.options.willRetryWrite = true;
          session.incrementTransactionNumber();
        }

        return operation.execute(server, session, (error, result) => {
          if (error instanceof MongoError) {
            return retryOperation(error);
          } else if (error) {
            return callback(error);
          }
          callback(undefined, result);
        });
      }
    }

    return operation.execute(server, session, callback);
  });
}
