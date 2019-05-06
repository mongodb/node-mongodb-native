'use strict';

const MongoError = require('../core').MongoError;
const Aspect = require('./operation').Aspect;
const OperationBase = require('./operation').OperationBase;
const ReadPreference = require('mongodb-core').ReadPreference;

/**
 * Executes the given operation with provided arguments.
 *
 * This method reduces large amounts of duplication in the entire codebase by providing
 * a single point for determining whether callbacks or promises should be used. Additionally
 * it allows for a single point of entry to provide features such as implicit sessions, which
 * are required by the Driver Sessions specification in the event that a ClientSession is
 * not provided
 *
 * @param {object} topology The topology to execute this operation on
 * @param {Operation} operation The operation to execute
 * @param {function} callback The command result callback
 */
function executeOperationV2(topology, operation, callback) {
  if (topology == null) {
    throw new TypeError('This method requires a valid topology instance');
  }

  if (!(operation instanceof OperationBase)) {
    throw new TypeError('This method requires a valid operation instance');
  }

  const Promise = topology.s.promiseLibrary;

  // The driver sessions spec mandates that we implicitly create sessions for operations
  // that are not explicitly provided with a session.
  let session, owner;
  if (!operation.hasAspect(Aspect.SKIP_SESSION) && topology.hasSessionSupport()) {
    if (operation.session == null) {
      owner = Symbol();
      session = topology.startSession({ owner });
      operation.session = session;
    } else if (operation.session.hasEnded) {
      throw new MongoError('Use of expired sessions is not permitted');
    }
  }

  const makeExecuteCallback = (resolve, reject) =>
    function executeCallback(err, result) {
      if (session && session.owner === owner) {
        session.endSession(() => {
          if (operation.session === session) {
            operation.clearSession();
          }
          if (err) return reject(err);
          resolve(result);
        });
      } else {
        if (err) return reject(err);
        resolve(result);
      }
    };

  // Execute using callback
  if (typeof callback === 'function') {
    const handler = makeExecuteCallback(
      result => callback(null, result),
      err => callback(err, null)
    );

    try {
      if (operation.hasAspect(Aspect.EXECUTE_WITH_SELECTION)) {
        executeWithServerSelection(topology, operation, handler);
      } else {
        return operation.execute(handler);
      }
    } catch (e) {
      handler(e);
      throw e;
    }
  }

  return new Promise(function(resolve, reject) {
    const handler = makeExecuteCallback(resolve, reject);

    try {
      if (operation.hasAspect(Aspect.EXECUTE_WITH_SELECTION)) {
        executeWithServerSelection(topology, operation, handler);
      } else {
        return operation.execute(handler);
      }
    } catch (e) {
      handler(e);
    }
  });
}

const MongoNetworkError = require('mongodb-core').MongoNetworkError;
const RETRYABLE_WIRE_VERSION = 6;

// see: https://github.com/mongodb/specifications/blob/master/source/retryable-writes/retryable-writes.rst#terms
const RETRYABLE_ERROR_CODES = new Set([
  6, // HostUnreachable
  7, // HostNotFound
  89, // NetworkTimeout
  91, // ShutdownInProgress
  189, // PrimarySteppedDown
  9001, // SocketException
  10107, // NotMaster
  11600, // InterruptedAtShutdown
  11602, // InterruptedDueToReplStateChange
  13435, // NotMasterNoSlaveOk
  13436 // NotMasterOrSecondary
]);

/**
 * Determines whether an error is something the driver should attempt to retry
 *
 * @param {MongoError|Error} error
 */
function isRetryableError(error) {
  return (
    RETRYABLE_ERROR_CODES.has(error.code) ||
    error instanceof MongoNetworkError ||
    error.message.match(/not master/) ||
    error.message.match(/node is recovering/)
  );
}

function isSingleServer(topology) {
  if (topology.type && topology.type === 'server') {
    return true;
  }

  if (topology.description && topology.description.type === 'Single') {
    return true;
  }

  return false;
}

/**
 * Determines whether the provided topology supports retryable writes
 *
 * @param {*} topology
 */
const isRetryabilitySupported = function(topology) {
  if (isSingleServer(topology)) {
    return false;
  }

  const maxWireVersion = topology.lastIsMaster().maxWireVersion;
  if (maxWireVersion < RETRYABLE_WIRE_VERSION) {
    return false;
  }

  if (!topology.logicalSessionTimeoutMinutes) {
    return false;
  }

  return true;
};

function executeWithServerSelection(topology, operation, callback) {
  const readPreference = operation.readPreference || ReadPreference.primary;
  const session = operation.session;
  const options = Object.assign({}, operation.options);

  const willRetryWrite =
    operation.hasAspect(Aspect.RETRY) &&
    !!options.retryWrites &&
    session &&
    isRetryabilitySupported(topology) &&
    !options.session.inTransaction();

  function callbackWithRetry(err, result) {
    if (err == null) {
      return callback(null, result);
    }

    if (!isRetryableError(err)) {
      return callback(err);
    }

    // select a new server, and attempt to retry the operation
    topology.selectServer(readPreference, (err, server) => {
      if (err) {
        callback(err, null);
        return;
      }

      operation.execute(server, callback);
    });
  }

  // select a server, and execute the operation against it
  topology.selectServer(readPreference, (err, server) => {
    if (err) {
      callback(err, null);
      return;
    }

    if (willRetryWrite) {
      options.willRetryWrite = true;
      session.incrementTransactionNumber();

      operation.execute(server, callbackWithRetry);
      return;
    }

    operation.execute(server, callback);
  });
}

module.exports = executeOperationV2;
