import {
  isRetryableReadError,
  isRetryableWriteError,
  MongoCompatibilityError,
  MONGODB_ERROR_CODES,
  MongoError,
  MongoErrorLabel,
  MongoExpiredSessionError,
  MongoInvalidArgumentError,
  MongoNetworkError,
  MongoNotConnectedError,
  MongoRuntimeError,
  MongoServerError,
  MongoTransactionError,
  MongoUnexpectedServerResponseError
} from '../error';
import type { MongoClient } from '../mongo_client';
import { ReadPreference } from '../read_preference';
import { type Server } from '../sdam/server';
import type { ServerDescription } from '../sdam/server_description';
import {
  sameServerSelector,
  secondaryWritableServerSelector,
  type ServerSelector
} from '../sdam/server_selection';
import type { Topology } from '../sdam/topology';
import type { ClientSession } from '../sessions';
import { TimeoutContext } from '../timeout';
import { supportsRetryableWrites } from '../utils';
import { AbstractOperation, Aspect } from './operation';

const MMAPv1_RETRY_WRITES_ERROR_CODE = MONGODB_ERROR_CODES.IllegalOperation;
const MMAPv1_RETRY_WRITES_ERROR_MESSAGE =
  'This MongoDB deployment does not support retryable writes. Please add retryWrites=false to your connection string.';

type ResultTypeFromOperation<TOperation> = TOperation extends AbstractOperation<infer K>
  ? K
  : never;

/**
 * Executes the given operation with provided arguments.
 * @internal
 *
 * @remarks
 * Allows for a single point of entry to provide features such as implicit sessions, which
 * are required by the Driver Sessions specification in the event that a ClientSession is
 * not provided.
 *
 * The expectation is that this function:
 * - Connects the MongoClient if it has not already been connected
 * - Creates a session if none is provided and cleans up the session it creates
 * - Selects a server based on readPreference or various factors
 * - Retries an operation if it fails for certain errors, see {@link retryOperation}
 *
 * @typeParam T - The operation's type
 * @typeParam TResult - The type of the operation's result, calculated from T
 *
 * @param client - The MongoClient to execute this operation with
 * @param operation - The operation to execute
 */
export async function executeOperation<
  T extends AbstractOperation<TResult>,
  TResult = ResultTypeFromOperation<T>
>(client: MongoClient, operation: T, timeoutContext?: TimeoutContext): Promise<TResult> {
  if (!(operation instanceof AbstractOperation)) {
    // TODO(NODE-3483): Extend MongoRuntimeError
    throw new MongoRuntimeError('This method requires a valid operation instance');
  }

  if (client.topology == null) {
    // Auto connect on operation
    if (client.s.hasBeenClosed) {
      throw new MongoNotConnectedError('Client must be connected before running operations');
    }
    client.s.options[Symbol.for('@@mdb.skipPingOnConnect')] = true;
    try {
      await client.connect();
    } finally {
      delete client.s.options[Symbol.for('@@mdb.skipPingOnConnect')];
    }
  }

  const { topology } = client;
  if (topology == null) {
    throw new MongoRuntimeError('client.connect did not create a topology but also did not throw');
  }

  // The driver sessions spec mandates that we implicitly create sessions for operations
  // that are not explicitly provided with a session.
  let session = operation.session;
  let owner: symbol | undefined;

  if (session == null) {
    owner = Symbol();
    session = client.startSession({ owner, explicit: false });
  } else if (session.hasEnded) {
    throw new MongoExpiredSessionError('Use of expired sessions is not permitted');
  } else if (session.snapshotEnabled && !topology.capabilities.supportsSnapshotReads) {
    throw new MongoCompatibilityError('Snapshot reads require MongoDB 5.0 or later');
  } else if (session.client !== client) {
    throw new MongoInvalidArgumentError('ClientSession must be from the same MongoClient');
  }
  if (session.explicit && session?.timeoutMS != null && operation.options.timeoutMS != null) {
    throw new MongoInvalidArgumentError(
      'Do not specify timeoutMS on operation if already specified on an explicit session'
    );
  }

  timeoutContext ??= TimeoutContext.create({
    serverSelectionTimeoutMS: client.s.options.serverSelectionTimeoutMS,
    waitQueueTimeoutMS: client.s.options.waitQueueTimeoutMS,
    timeoutMS: operation.options.timeoutMS
  });

  const readPreference = operation.readPreference ?? ReadPreference.primary;
  const inTransaction = !!session?.inTransaction();

  const hasReadAspect = operation.hasAspect(Aspect.READ_OPERATION);

  if (
    inTransaction &&
    !readPreference.equals(ReadPreference.primary) &&
    (hasReadAspect || operation.commandName === 'runCommand')
  ) {
    throw new MongoTransactionError(
      `Read preference in a transaction must be primary, not: ${readPreference.mode}`
    );
  }

  if (session?.isPinned && session.transaction.isCommitted && !operation.bypassPinningCheck) {
    session.unpin();
  }

  let selector: ReadPreference | ServerSelector;

  if (operation.hasAspect(Aspect.MUST_SELECT_SAME_SERVER)) {
    // GetMore and KillCursor operations must always select the same server, but run through
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

  const server = await topology.selectServer(selector, {
    session,
    operationName: operation.commandName,
    timeoutContext
  });

  // TODO: Look into which operations do and don't have this aspect
  try {
    return await executeOperationWithRetry(operation, {
      server,
      topology,
      timeoutContext,
      session,
      selector
    });
  } finally {
    if (session?.owner != null && session.owner === owner) {
      await session.endSession();
    }
  }
}

/** @internal */
type RetryOptions = {
  server: Server;
  session: ClientSession | undefined;
  topology: Topology;
  selector: ReadPreference | ServerSelector;
  timeoutContext: TimeoutContext;
};

async function executeOperationWithRetry<
  T extends AbstractOperation<TResult>,
  TResult = ResultTypeFromOperation<T>
>(
  operation: T,
  { server, topology, timeoutContext, session, selector }: RetryOptions
): Promise<TResult> {
  const hasReadAspect = operation.hasAspect(Aspect.READ_OPERATION);
  const hasWriteAspect = operation.hasAspect(Aspect.WRITE_OPERATION);
  const inTransaction = session?.inTransaction() ?? false;

  const willRetryRead = topology.s.options.retryReads && !inTransaction && operation.canRetryRead;

  const willRetryWrite =
    topology.s.options.retryWrites &&
    !inTransaction &&
    supportsRetryableWrites(server) &&
    operation.canRetryWrite;

  const willRetry =
    operation.hasAspect(Aspect.RETRYABLE) &&
    session != null &&
    ((hasReadAspect && willRetryRead) || (hasWriteAspect && willRetryWrite));

  if (hasWriteAspect && willRetryWrite) {
    operation.options.willRetryWrite = true;
    session?.incrementTransactionNumber();
  }

  const tries = willRetry ? 2 : 1;
  let previousError: MongoError | undefined;
  let previousServer: ServerDescription | undefined;

  for (let attemptNumber = 0; attemptNumber < tries; attemptNumber++) {
    if (previousError) {
      if (hasWriteAspect && previousError.code === MMAPv1_RETRY_WRITES_ERROR_CODE) {
        throw new MongoServerError({
          message: MMAPv1_RETRY_WRITES_ERROR_MESSAGE,
          errmsg: MMAPv1_RETRY_WRITES_ERROR_MESSAGE,
          originalError: previousError
        });
      }

      if (hasWriteAspect && !isRetryableWriteError(previousError)) throw previousError;

      if (hasReadAspect && !isRetryableReadError(previousError)) throw previousError;

      if (
        previousError instanceof MongoNetworkError &&
        session?.isPinned &&
        !session?.inTransaction() &&
        operation.hasAspect(Aspect.CURSOR_CREATING)
      ) {
        session.unpin({ force: true, forceClear: true });
      }

      server = await topology.selectServer(selector, {
        session,
        operationName: operation.commandName,
        previousServer
      });

      if (hasWriteAspect && !supportsRetryableWrites(server)) {
        throw new MongoUnexpectedServerResponseError(
          'Selected server does not support retryable writes'
        );
      }
    }

    try {
      const rv = await operation.execute(server, session, timeoutContext);

      return rv;
    } catch (error) {
      previousServer = server.description;
      if (error instanceof MongoError) {
        previousError = error;
      } else {
        throw error;
      }
    }
  }

  throw previousError;
}
/**
 * Executes a read command in the context of a MongoClient where a retryable
 * read have been enabled. The session parameter may be an implicit or
 * explicit client session (depending on how the CRUD method was invoked).
 */
async function executeRetryableRead<
  T extends AbstractOperation<TResult>,
  TResult = ResultTypeFromOperation<T>
>(
  operation: T,
  options: {
    topology: Topology;
    timeoutContext: TimeoutContext;
    session: ClientSession;
    selector: ReadPreference | ServerSelector;
  }
): Promise<TResult> {
  let previousError: MongoError | undefined;
  let retrying = false;
  let previousServer: Server | undefined;
  let server: Server;

  const { topology, timeoutContext, selector, session } = options;
  for (;;) {
    if (previousError != null) {
      retrying = true;
    }
    try {
      if (previousServer == null) {
        server = await topology.selectServer(selector, {
          timeoutContext,
          session,
          operationName: operation.commandName
        });
      } else {
        // If a previous attempt was made, deprioritize the previous server
        // where the command failed.
        server = await topology.selectServer(selector, {
          previousServer: previousServer.description,
          session,
          timeoutContext,
          operationName: operation.commandName
        });
      }
    } catch (exception) {
      if (previousError == null) {
        // If this is the first attempt, propagate the exception.
        throw exception;
      }
      // For retries, propagate the previous error.
      throw previousError;
    }

    if (topology.s.options.retryReads || session.inTransaction()) {
      /* If this is the first loop iteration and we determine that retryable
       * reads are not supported, execute the command once and allow any
       * errors to propagate */

      if (!previousError) {
        return await operation.execute(server, session, timeoutContext);
      }

      /* If the server selected for retrying is too old, throw the previous error.
       * The caller can then infer that an attempt was made and failed. This case
       * is very rare, and likely means that the cluster is in the midst of a
       * downgrade. */
      throw previousError;
    }

    /* NetworkException and NotWritablePrimaryException are both retryable errors. If
     * caught, remember the exception, update SDAM accordingly, and proceed with
     * retrying the operation.
     *
     * Exceptions that originate from the driver (e.g. no socket available
     * from the connection pool) are treated as fatal. Any such exception
     * that occurs on the previous attempt is propagated as-is. On retries,
     * the error from the previous attempt is raised as it will be more
     * relevant for the user. */
    try {
      return await operation.execute(server, session, timeoutContext);
    } catch (error) {
      if (error instanceof MongoError) {
        if (isRetryableReadError(error)) {
          previousError = error;
          previousServer = server;
        } else {
          throw previousError ?? error;
        }
      } else {
        throw previousError ?? error;
      }

      /* If CSOT is not enabled, allow any retryable error from the second
       * attempt to propagate to our caller, as it will be just as relevant
       * (if not more relevant) than the original error. */
      if (retrying) {
        throw previousError;
      }
      // TODO(NODE-6231): Implement CSOT logic
    }
  }
}

async function executeRetryableWrite<
  T extends AbstractOperation<TResult>,
  TResult = ResultTypeFromOperation<T>
>(
  operation: T,
  options: {
    topology: Topology;
    timeoutContext: TimeoutContext;
    session: ClientSession;
    selector: ReadPreference | ServerSelector;
  }
): Promise<TResult> {
  const { topology, timeoutContext, selector, session } = options;
  /* Allow ServerSelectionException to propagate to our caller, which can then
   * assume that no attempts were made. */
  let server = await topology.selectServer(selector, {
    timeoutContext,
    session,
    operationName: operation.commandName
  });

  /* If the server does not support retryable writes, execute the write as if
   * retryable writes are not enabled. */
  if (!supportsRetryableWrites(server)) {
    return await operation.execute(server, session, timeoutContext);
  }

  let previousError: MongoError | undefined;
  let retrying = false;
  for (;;) {
    try {
      return await operation.execute(server, session, timeoutContext);
    } catch (currentError) {
      if (!(currentError instanceof MongoError)) throw currentError;
      handleError(operation, session, currentError);

      /* If the error has a RetryableWriteError label, remember the exception
       * and proceed with retrying the operation.
       *
       * IllegalOperation (code 20) with errmsg starting with "Transaction
       * numbers" MUST be re-raised with an actionable error message.
       */

      if (!isRetryableWriteError(currentError)) {
        if (currentError.code === 20) {
          throw new MongoServerError({
            message: MMAPv1_RETRY_WRITES_ERROR_MESSAGE,
            errmsg: MMAPv1_RETRY_WRITES_ERROR_MESSAGE,
            originalError: currentError
          });
        }
        throw currentError;
      }

      /*
       * If the "previousError" is "null", then the "currentError" is the
       * first error encountered during the retry attempt cycle. We must
       * persist the first error in the case where all succeeding errors are
       * labeled "NoWritesPerformed", which would otherwise raise "null" as
       * the error.
       */
      if (previousError == null) {
        previousError = currentError;
      }

      /*
       * For exceptions that originate from the driver (e.g. no socket available
       * from the connection pool), we should raise the previous error if there
       * was one.
       */
      if (
        !(currentError instanceof MongoError) &&
        !previousError?.hasErrorLabel('NoWritesPerformed')
      ) {
        previousError = currentError;
      }
    }

    /*
     * We try to select server that is not the one that failed by passing the
     * failed server as a deprioritized server.
     * If we cannot select a writable server, do not proceed with retrying and
     * throw the previous error. The caller can then infer that an attempt was
     * made and failed. */
    try {
      server = await topology.selectServer(selector, {
        timeoutContext,
        session,
        operationName: operation.commandName,
        previousServer: server.description
      });
    } catch {
      throw previousError;
    }

    /* If the server selected for retrying is too old, throw the previous error.
     * The caller can then infer that an attempt was made and failed. This case
     * is very rare, and likely means that the cluster is in the midst of a
     * downgrade. */
    if (!supportsRetryableWrites(server)) {
      throw previousError;
    }

    /* If CSOT is not enabled, allow any retryable error from the second
     * attempt to propagate to our caller, as it will be just as relevant
     * (if not more relevant) than the original error. */
    if (retrying) {
      throw previousError;
    }
    //TODO(NODE-6231): Implement CSOT behaviour
    retrying = true;
  }
}

function handleError<T extends AbstractOperation>(
  operation: T,
  session: ClientSession,
  error: MongoError
) {
  const isWriteOperation = operation.hasAspect(Aspect.WRITE_OPERATION);
  const isReadOperation = operation.hasAspect(Aspect.READ_OPERATION);

  if (
    (isWriteOperation && !isRetryableWriteError(error)) ||
    (isReadOperation && !isRetryableReadError(error))
  ) {
    throw error;
  }

  if (
    error instanceof MongoNetworkError &&
    session.isPinned &&
    !session.inTransaction() &&
    operation.hasAspect(Aspect.CURSOR_CREATING)
  ) {
    session.unpin({ force: true, forceClear: true });
  }
}
