'use strict';

const MongoNetworkError = require('./core').MongoNetworkError;
const MONGODB_ERROR_CODES = require('./error_codes').MONGODB_ERROR_CODES;

// From spec@https://github.com/mongodb/specifications/blob/f93d78191f3db2898a59013a7ed5650352ef6da8/source/change-streams/change-streams.rst#resumable-error
const GET_MORE_RESUMABLE_CODES = new Set([
  MONGODB_ERROR_CODES.HostUnreachable,
  MONGODB_ERROR_CODES.HostNotFound,
  MONGODB_ERROR_CODES.NetworkTimeout,
  MONGODB_ERROR_CODES.ShutdownInProgress,
  MONGODB_ERROR_CODES.PrimarySteppedDown,
  MONGODB_ERROR_CODES.ExceededTimeLimit,
  MONGODB_ERROR_CODES.SocketException,
  MONGODB_ERROR_CODES.NotMaster,
  MONGODB_ERROR_CODES.InterruptedAtShutdown,
  MONGODB_ERROR_CODES.InterruptedDueToReplStateChange,
  MONGODB_ERROR_CODES.NotMasterNoSlaveOk,
  MONGODB_ERROR_CODES.NotMasterOrSecondary,
  MONGODB_ERROR_CODES.StaleShardVersion,
  MONGODB_ERROR_CODES.StaleEpoch,
  MONGODB_ERROR_CODES.StaleConfig,
  MONGODB_ERROR_CODES.RetryChangeStream,
  MONGODB_ERROR_CODES.FailedToSatisfyReadPreference,
  MONGODB_ERROR_CODES.CursorNotFound
]);

function isResumableError(error, wireVersion) {
  if (error instanceof MongoNetworkError) {
    return true;
  }

  if (wireVersion >= 9) {
    // DRIVERS-1308: For 4.4 drivers running against 4.4 servers, drivers will add a special case to treat the CursorNotFound error code as resumable
    if (error.code === MONGODB_ERROR_CODES.CursorNotFound) {
      return true;
    }
    return error.hasErrorLabel('ResumableChangeStreamError');
  }

  return GET_MORE_RESUMABLE_CODES.has(error.code);
}

module.exports = { GET_MORE_RESUMABLE_CODES, isResumableError, MONGODB_ERROR_CODES };
