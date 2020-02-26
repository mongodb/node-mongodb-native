'use strict';

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
function executeOperation(topology, operation, callback) {
  if (topology == null) {
    throw new TypeError('This method requires a valid topology instance');
  }

  if (!(operation instanceof OperationBase)) {
    throw new TypeError('This method requires a valid operation instance');
  }

  if (isUnifiedTopology(topology) && topology.shouldCheckForSessionSupport()) {
    return selectServerForSessionSupport(topology, operation, callback);
  }

  const Promise = topology.s.promiseLibrary;

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

  let result;
  if (typeof callback !== 'function') {
    result = new Promise((resolve, reject) => {
      callback = (err, res) => {
        if (err) return reject(err);
        resolve(res);
      };
    });
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

// TODO: This is only supported for unified topology, it should go away once
//       we remove support for legacy topology types.
function selectServerForSessionSupport(topology, operation, callback) {
  const Promise = topology.s.promiseLibrary;

  let result;
  if (typeof callback !== 'function') {
    result = new Promise((resolve, reject) => {
      callback = (err, result) => {
        if (err) return reject(err);
        resolve(result);
      };
    });
  }

  topology.selectServer(ReadPreference.primaryPreferred, err => {
    if (err) {
      callback(err);
      return;
    }

    executeOperation(topology, operation, callback);
  });

  return result;
}

module.exports = executeOperation;
