import PromiseProvider = require('../promise_provider');
import ReadPreference = require('../read_preference');
import { MongoError, isRetryableError } from '../error';
import { Aspect, OperationBase } from './operation';
import { maxWireVersion } from '../utils';
import { ServerType } from '../sdam/common';

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
function executeOperation(topology: any, operation: any, callback?: Function) {
  const Promise = PromiseProvider.get();

  if (topology == null) {
    throw new TypeError('This method requires a valid topology instance');
  }

  if (!(operation instanceof OperationBase)) {
    throw new TypeError('This method requires a valid operation instance');
  }

  if (topology.shouldCheckForSessionSupport()) {
    return selectServerForSessionSupport(topology, operation, callback!);
  }

  // The driver sessions spec mandates that we implicitly create sessions for operations
  // that are not explicitly provided with a session.
  let session: any, owner: any;
  if (topology.hasSessionSupport()) {
    if (operation.session == null) {
      owner = Symbol();
      session = topology.startSession({ owner });
      operation.session = session;
    } else if (operation.session.hasEnded) {
      throw new MongoError('Use of expired sessions is not permitted');
    }
  }

  let result;
  if (typeof callback !== 'function') {
    result = new Promise((resolve: any, reject: any) => {
      callback = (err?: any, res?: any) => {
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

  return result;
}

function supportsRetryableReads(server: any) {
  return maxWireVersion(server) >= 6;
}

function executeWithServerSelection(topology: any, operation: any, callback: Function) {
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
    readPreference,
    session: operation.session
  };

  function callbackWithRetry(err?: any, result?: any) {
    if (err == null) {
      return callback(null, result);
    }

    if (
      (operation.hasAspect(Aspect.READ_OPERATION) && !isRetryableError(err)) ||
      (operation.hasAspect(Aspect.WRITE_OPERATION) && !shouldRetryWrite(err))
    ) {
      return callback(err);
    }

    // select a new server, and attempt to retry the operation
    topology.selectServer(serverSelectionOptions, (err?: any, server?: any) => {
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
  topology.selectServer(serverSelectionOptions, (err?: any, server?: any) => {
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
      supportsRetryableWrites(server);

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

function supportsRetryableWrites(server: any) {
  return (
    server.description.maxWireVersion >= 6 &&
    server.description.logicalSessionTimeoutMinutes &&
    server.description.type !== ServerType.Standalone
  );
}

// TODO: This is only supported for unified topology, it should go away once
//       we remove support for legacy topology types.
function selectServerForSessionSupport(topology: any, operation: any, callback: Function) {
  const Promise = PromiseProvider.get();

  let result;
  if (typeof callback !== 'function') {
    result = new Promise((resolve: any, reject: any) => {
      callback = (err?: any, result?: any) => {
        if (err) return reject(err);
        resolve(result);
      };
    });
  }

  topology.selectServer(ReadPreference.primaryPreferred, (err: any) => {
    if (err) {
      callback(err);
      return;
    }

    executeOperation(topology, operation, callback);
  });

  return result;
}

export = executeOperation;
