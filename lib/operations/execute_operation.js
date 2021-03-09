'use strict';

const maybePromise = require('../utils').maybePromise;
const MongoError = require('../core/error').MongoError;
const Aspect = require('./operation').Aspect;
const OperationBase = require('./operation').OperationBase;
const ReadPreference = require('../core/topologies/read_preference');
const isRetryableError = require('../core/error').isRetryableError;
const maxWireVersion = require('../core/utils').maxWireVersion;
const isUnifiedTopology = require('../core/utils').isUnifiedTopology;

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
function executeOperation(topology, operation, cb) {
  if (topology == null) {
    throw new TypeError('This method requires a valid topology instance');
  }

  if (!(operation instanceof OperationBase)) {
    throw new TypeError('This method requires a valid operation instance');
  }

  return maybePromise(topology, cb, callback => {
    if (isUnifiedTopology(topology) && topology.shouldCheckForSessionSupport()) {
      // Recursive call to executeOperation after a server selection
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
        return callback(new MongoError('Use of expired sessions is not permitted'));
      }
    } else if (operation.session) {
      // If the user passed an explicit session and we are still, after server selection,
      // trying to run against a topology that doesn't support sessions we error out.
      return callback(new MongoError('Current topology does not support sessions'));
    }

    function executeCallback(err, result) {
      if (session && session.owner === owner) {
        session.endSession();
        if (operation.session === session) {
          operation.clearSession();
        }
      }

      callback(err, result);
    }

    try {
      if (operation.hasAspect(Aspect.EXECUTE_WITH_SELECTION)) {
        executeWithServerSelection(topology, operation, executeCallback);
      } else {
        operation.execute(executeCallback);
      }
    } catch (error) {
      if (session && session.owner === owner) {
        session.endSession();
        if (operation.session === session) {
          operation.clearSession();
        }
      }

      callback(error);
    }
  });
}

function supportsRetryableReads(server) {
  return maxWireVersion(server) >= 6;
}

function executeWithServerSelection(topology, operation, callback) {
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
      operation.execute(server, callbackWithRetry);
      return;
    }

    operation.execute(server, callback);
  });
}

// The Unified Topology runs serverSelection before executing every operation
// Session support is determined by the result of a monitoring check triggered by this selection
function selectServerForSessionSupport(topology, operation, callback) {
  topology.selectServer(ReadPreference.primaryPreferred, err => {
    if (err) {
      return callback(err);
    }

    executeOperation(topology, operation, callback);
  });
}

module.exports = executeOperation;
