'use strict';

const MongoError = require('mongodb-core').MongoError;
const Aspect = require('./operation').Aspect;
const OperationBase = require('./operation').OperationBase;

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
      return operation.execute(handler);
    } catch (e) {
      handler(e);
      throw e;
    }
  }

  return new Promise(function(resolve, reject) {
    const handler = makeExecuteCallback(resolve, reject);

    try {
      return operation.execute(handler);
    } catch (e) {
      handler(e);
    }
  });
}

module.exports = executeOperationV2;
