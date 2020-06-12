'use strict';

const ReadPreference = require('../read_preference');
const { MongoError, isRetryableError } = require('../error');
const { Aspect, OperationBase } = require('./operation');
const { maxWireVersion, maybePromise } = require('../utils');

/**
 * Executes the given operation with provided arguments.
 *
 * This method reduces large amounts of duplication in the entire codebase by providing
 * a single point for determining whether callbacks or promises should be used. Additionally
 * it allows for a single point of entry to provide features such as implicit sessions, which
 * are required by the Driver Sessions specification in the event that a ClientSession is
 * not provided
 *
 * @param {Topology} topology The topology to execute this operation on
 * @param {Operation} operation The operation to execute
 * @param {Function} callback The command result callback
 */
function executeOperation(topology, operation, callback) {
  if (topology == null) {
    throw new TypeError('This method requires a valid topology instance');
  }

  if (!(operation instanceof OperationBase)) {
    throw new TypeError('This method requires a valid operation instance');
  }

  if (topology.shouldCheckForSessionSupport()) {
    return selectServerForSessionSupport(topology, operation, callback);
  }

  // The driver sessions spec mandates that we implicitly create sessions for operations
  // that are not explicitly provided with a session.
  let session, owner;
  if (topology.hasSessionSupport()) {
    if (operation.session == null) {
      owner = Symbol();
      session = topology.startSession({ owner });
      operation.session = session;
    } else if (operation.session.hasEnded) {
      throw new MongoError('Use of expired sessions is not permitted');
    }
  }

  function clearSession() {
    if (session && session.owner === owner) {
      session.endSession();
      if (operation.session === session) {
        operation.clearSession();
      }
    }
  }

  return maybePromise(callback, cb => {
    function executeCallback(err, result) {
      clearSession();
      cb(err, result);
    }

    try {
      if (operation.hasAspect(Aspect.EXECUTE_WITH_SELECTION)) {
        executeWithServerSelection(topology, operation, executeCallback);
      } else {
        operation.execute(executeCallback);
      }
    } catch (e) {
      clearSession();
      throw e;
    }
  });
}

function supportsRetryableReads(server) {
  return maxWireVersion(server) >= 6;
}

function executeWithServerSelection(topology, operation, callback) {
  const readPreference = operation.readPreference || ReadPreference.primary;
  const inTransaction = operation.session && operation.session.inTransaction();

  if (inTransaction && !readPreference.isPrimary) {
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

  function callbackWithRetry(err, result) {
    if (err == null) {
      return callback(null, result);
    }

    if (!isRetryableError(err)) {
      return callback(err);
    }

    // select a new server, and attempt to retry the operation
    topology.selectServer(serverSelectionOptions, (err, server) => {
      if (err || !supportsRetryableReads(server)) {
        callback(err, null);
        return;
      }

      operation.execute(server, callback);
    });
  }

  // select a server, and execute the operation against it
  topology.selectServer(serverSelectionOptions, (err, server) => {
    if (err) {
      callback(err, null);
      return;
    }

    const shouldRetryReads =
      topology.s.options.retryReads !== false &&
      operation.session &&
      !inTransaction &&
      supportsRetryableReads(server) &&
      operation.canRetryRead;

    if (operation.hasAspect(Aspect.RETRYABLE) && shouldRetryReads) {
      if (operation.hasAspect(Aspect.WRITE_OPERATION)) {
        operation.options.willRetryWrite = true;
        if (operation.session) {
          // moved this in here b/c this:
          // https://mongodb.slack.com/archives/C72LB5RPV/p1591911519020300
          operation.session.incrementTransactionNumber();
        }
      }
      operation.execute(server, callbackWithRetry);
      return;
    }

    operation.execute(server, callback);
  });
}

// TODO: This is only supported for unified topology, it should go away once
//       we remove support for legacy topology types.
function selectServerForSessionSupport(topology, operation, callback) {
  return topology.selectServer(ReadPreference.primaryPreferred, err => {
    if (err) return callback(err);
    return executeOperation(topology, operation, callback);
  });
}

module.exports = executeOperation;
