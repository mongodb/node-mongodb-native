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
import type { ServerDescription } from '../sdam/server_description';
import {
  sameServerSelector,
  secondaryWritableServerSelector,
  type ServerSelector
} from '../sdam/server_selection';
import type { Topology } from '../sdam/topology';
import type { ClientSession } from '../sessions';
import { TimeoutContext } from '../timeout';
import { squashError, supportsRetryableWrites } from '../utils';
import { AbstractOperation, Aspect } from './operation';

const MMAPv1_RETRY_WRITES_ERROR_CODE = MONGODB_ERROR_CODES.IllegalOperation;
const MMAPv1_RETRY_WRITES_ERROR_MESSAGE =
  'This MongoDB deployment does not support retryable writes. Please add retryWrites=false to your connection string.';

type ResultTypeFromOperation<TOperation> =
  TOperation extends AbstractOperation<infer K> ? K : never;

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
 * - Connects the MongoClient if it has not already been connected, see {@link autoConnect}
 * - Creates a session if none is provided and cleans up the session it creates
 * - Tries an operation and retries under certain conditions, see {@link tryOperation}
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

  const topology = await autoConnect(client);

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

  try {
    return await tryOperation(operation, {
      topology,
      session,
      readPreference,
      timeoutContext
    });
  } finally {
    if (session?.owner != null && session.owner === owner) {
      await session.endSession();
    }
  }
}

/**
 * Connects a client if it has not yet been connected
 * @internal
 */
async function autoConnect(client: MongoClient): Promise<Topology> {
  if (client.topology == null) {
    if (client.s.hasBeenClosed) {
      throw new MongoNotConnectedError('Client must be connected before running operations');
    }
    client.s.options[Symbol.for('@@mdb.skipPingOnConnect')] = true;
    try {
      await client.connect();
      if (client.topology == null) {
        throw new MongoRuntimeError(
          'client.connect did not create a topology but also did not throw'
        );
      }
      return client.topology;
    } finally {
      delete client.s.options[Symbol.for('@@mdb.skipPingOnConnect')];
    }
  }
  return client.topology;
}

/** @internal */
type RetryOptions = {
  session: ClientSession | undefined;
  readPreference: ReadPreference;
  topology: Topology;
};

/**
 * Executes an operation and retries as appropriate
 * @internal
 *
 * @remarks
 * Implements behaviour described in [Retryable Reads](https://github.com/mongodb/specifications/blob/master/source/retryable-reads/retryable-reads.md) and [Retryable
 * Writes](https://github.com/mongodb/specifications/blob/master/source/retryable-writes/retryable-writes.md) specification
 *
 * This function:
 * - performs initial server selection
 * - attempts to execute an operation
 * - retries the operation if it meets the criteria for a retryable read or a retryable write
 *
 * @typeParam T - The operation's type
 * @typeParam TResult - The type of the operation's result, calculated from T
 *
 * @param operation - The operation to execute
 * */
async function tryOperation<
  T extends AbstractOperation<TResult>,
  TResult = ResultTypeFromOperation<T>
>(operation: T, { topology, session, readPreference }: RetryOptions): Promise<TResult> {
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

  let server = await topology.selectServer(selector, {
    session,
    operationName: operation.commandName
  });

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

  if (hasWriteAspect && willRetryWrite && session != null) {
    operation.options.willRetryWrite = true;
    session.incrementTransactionNumber();
  }

  // TODO(NODE-6231): implement infinite retry within CSOT timeout here
  const maxTries = willRetry ? 2 : 1;
  let previousOperationError: MongoError | undefined;
  let previousServer: ServerDescription | undefined;

  // TODO(NODE-6231): implement infinite retry within CSOT timeout here
  for (let tries = 0; tries < maxTries; tries++) {
    if (previousOperationError) {
      if (hasWriteAspect && previousOperationError.code === MMAPv1_RETRY_WRITES_ERROR_CODE) {
        throw new MongoServerError({
          message: MMAPv1_RETRY_WRITES_ERROR_MESSAGE,
          errmsg: MMAPv1_RETRY_WRITES_ERROR_MESSAGE,
          originalError: previousOperationError
        });
      }

      if (operation.hasAspect(Aspect.COMMAND_BATCHING) && !operation.canRetryWrite) {
        throw previousOperationError;
      }

      if (hasWriteAspect && !isRetryableWriteError(previousOperationError))
        throw previousOperationError;

      if (hasReadAspect && !isRetryableReadError(previousOperationError))
        throw previousOperationError;

      if (
        previousOperationError instanceof MongoNetworkError &&
        operation.hasAspect(Aspect.CURSOR_CREATING) &&
        session != null &&
        session.isPinned &&
        !session.inTransaction()
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
      // If tries > 0 and we are command batching we need to reset the batch.
      if (tries > 0 && operation.hasAspect(Aspect.COMMAND_BATCHING)) {
        operation.resetBatch();
      }
      return await operation.execute(server, session, timeoutContext);
    } catch (operationError) {
      if (!(operationError instanceof MongoError)) throw operationError;

      if (
        previousOperationError != null &&
        operationError.hasErrorLabel(MongoErrorLabel.NoWritesPerformed)
      ) {
        throw previousOperationError;
      }
      previousServer = server.description;
      previousOperationError = operationError;
    }
  }

  throw (
    previousOperationError ??
    new MongoRuntimeError('Tried to propagate retryability error, but no error was found.')
  );
}
