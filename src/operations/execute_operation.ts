import { PromiseProvider } from '../promise_provider';
import { ReadPreference } from '../read_preference';
import { MongoError, isRetryableError } from '../error';
import { Aspect, OperationBase } from './operation';
import { maxWireVersion } from '../utils';
import { ServerType } from '../sdam/common';
import type { Callback } from '../types';
import type { Server } from '../sdam/server';
import type { Topology } from '../sdam/topology';

const MMAPv1_RETRY_WRITES_ERROR_CODE = 20;
const MMAPv1_RETRY_WRITES_ERROR_MESSAGE =
  'This MongoDB deployment does not support retryable writes. Please add retryWrites=false to your connection string.';

type Tail<T extends any[]> = ((...t: T) => void) extends (arg: any, ...args: infer R) => void
  ? R
  : never;
type Last<T extends any[]> = T[Exclude<keyof T, keyof Tail<T>>];
type LastParameter<F extends (...args: any) => any> = Last<Parameters<F>>;
type ResultType<T extends (...args: any) => any> = NonNullable<LastParameter<LastParameter<T>>>;

/**
 * Executes the given operation with provided arguments.
 *
 * This method reduces large amounts of duplication in the entire codebase by providing
 * a single point for determining whether callbacks or promises should be used. Additionally
 * it allows for a single point of entry to provide features such as implicit sessions, which
 * are required by the Driver Sessions specification in the event that a ClientSession is
 * not provided
 *
 * @param {any} topology The topology to execute this operation on
 * @param {Operation} operation The operation to execute
 * @param {Function} callback The command result callback
 */
export function executeOperation<T extends OperationBase>(
  topology: Topology,
  operation: T
): Promise<ResultType<T['execute']>>;
export function executeOperation<T extends OperationBase>(
  topology: Topology,
  operation: T,
  callback: Callback<ResultType<T['execute']>>
): void;
export function executeOperation<T extends OperationBase>(
  topology: Topology,
  operation: T,
  callback?: Callback<ResultType<T['execute']>>
): Promise<ResultType<T['execute']>> | void;
export function executeOperation<T extends OperationBase>(
  topology: Topology,
  operation: T,
  callback?: Callback<ResultType<T['execute']>>
): Promise<ResultType<T['execute']>> | void {
  const Promise = PromiseProvider.get();

  if (topology == null) {
    throw new TypeError('This method requires a valid topology instance');
  }

  if (!(operation instanceof OperationBase)) {
    throw new TypeError('This method requires a valid operation instance');
  }

  if (topology.shouldCheckForSessionSupport()) {
    return selectServerForSessionSupport<ResultType<T['execute']>>(topology, operation, callback);
  }

  // The driver sessions spec mandates that we implicitly create sessions for operations
  // that are not explicitly provided with a session.
  let session: any, owner: any;
  if (topology.hasSessionSupport()) {
    if (operation.session == null) {
      owner = Symbol();
      session = topology.startSession({ owner, explicit: false });
      operation.session = session;
    } else if (operation.session.hasEnded) {
      throw new MongoError('Use of expired sessions is not permitted');
    }
  }

  let result;
  if (typeof callback !== 'function') {
    result = new Promise((resolve: any, reject: any) => {
      callback = (err, res) => {
        if (err) return reject(err);
        resolve(res);
      };
    });
  }

  function executeCallback(err?: any, result?: any) {
    if (session && session.owner === owner) {
      session.endSession();
      if (operation.session === session) {
        operation.clearSession();
      }
    }

    callback!(err, result);
  }

  try {
    if (operation.hasAspect(Aspect.EXECUTE_WITH_SELECTION)) {
      executeWithServerSelection(topology, operation, executeCallback);
    } else {
      operation.execute(executeCallback);
    }
  } catch (e) {
    if (session && session.owner === owner) {
      session.endSession();
      if (operation.session === session) {
        operation.clearSession();
      }
    }

    throw e;
  }

  return result as any;
}

function supportsRetryableReads(server: Server) {
  return maxWireVersion(server) >= 6;
}

function executeWithServerSelection(topology: Topology, operation: any, callback: Callback) {
  const readPreference = operation.readPreference || ReadPreference.primary;
  const inTransaction = operation.session && operation.session.inTransaction();

  if (inTransaction && !readPreference.equals(ReadPreference.primary)) {
    callback(
      new MongoError(
        `Read preference in a transaction must be primary, not: ${readPreference.mode}`
      )
    );

    return;
  }

  const serverSelectionOptions = {
    session: operation.session
  };

  function callbackWithRetry(err?: any, result?: any) {
    if (err == null) {
      return callback(undefined, result);
    }

    if (
      (operation.hasAspect(Aspect.READ_OPERATION) && !isRetryableError(err)) ||
      (operation.hasAspect(Aspect.WRITE_OPERATION) && !shouldRetryWrite(err))
    ) {
      return callback(err);
    }

    if (
      operation.hasAspect(Aspect.WRITE_OPERATION) &&
      shouldRetryWrite(err) &&
      err.code === MMAPv1_RETRY_WRITES_ERROR_CODE &&
      err.errmsg.match(/Transaction numbers/)
    ) {
      callback(
        new MongoError({
          message: MMAPv1_RETRY_WRITES_ERROR_MESSAGE,
          errmsg: MMAPv1_RETRY_WRITES_ERROR_MESSAGE,
          originalError: err
        })
      );

      return;
    }

    // select a new server, and attempt to retry the operation
    topology.selectServer(readPreference, serverSelectionOptions, (err?: any, server?: any) => {
      if (
        err ||
        (operation.hasAspect(Aspect.READ_OPERATION) && !supportsRetryableReads(server)) ||
        (operation.hasAspect(Aspect.WRITE_OPERATION) && !supportsRetryableWrites(server))
      ) {
        callback(err, null);
        return;
      }

      operation.execute(server, callback);
    });
  }

  // select a server, and execute the operation against it
  topology.selectServer(readPreference, serverSelectionOptions, (err?: any, server?: any) => {
    if (err) {
      callback(err, null);
      return;
    }

    const willRetryRead =
      topology.s.options.retryReads !== false &&
      operation.session &&
      !inTransaction &&
      supportsRetryableReads(server) &&
      operation.canRetryRead;

    const willRetryWrite =
      topology.s.options.retryWrites === true &&
      operation.session &&
      !inTransaction &&
      supportsRetryableWrites(server) &&
      operation.canRetryWrite;

    if (
      operation.hasAspect(Aspect.RETRYABLE) &&
      ((operation.hasAspect(Aspect.READ_OPERATION) && willRetryRead) ||
        (operation.hasAspect(Aspect.WRITE_OPERATION) && willRetryWrite))
    ) {
      if (operation.hasAspect(Aspect.WRITE_OPERATION) && willRetryWrite) {
        operation.options.willRetryWrite = true;
        operation.session.incrementTransactionNumber();
      }

      operation.execute(server, callbackWithRetry);
      return;
    }

    operation.execute(server, callback);
  });
}

function shouldRetryWrite(err: any) {
  return err instanceof MongoError && err.hasErrorLabel('RetryableWriteError');
}

function supportsRetryableWrites(server: Server) {
  return (
    server.description.maxWireVersion >= 6 &&
    server.description.logicalSessionTimeoutMinutes &&
    server.description.type !== ServerType.Standalone
  );
}

// TODO: This is only supported for unified topology, it should go away once
//       we remove support for legacy topology types.
function selectServerForSessionSupport<T>(
  topology: Topology,
  operation: any,
  callback?: Callback<T>
): Promise<T> | void {
  const Promise = PromiseProvider.get();

  let result: Promise<T> | void;
  if (typeof callback !== 'function') {
    result = new Promise((resolve: any, reject: any) => {
      callback = (err, result) => {
        if (err) return reject(err);
        resolve(result);
      };
    });
  }

  topology.selectServer(ReadPreference.primaryPreferred, err => {
    if (err) {
      callback!(err);
      return;
    }

    executeOperation(topology, operation, callback!);
  });

  return result;
}
