'use strict';

const MongoNetworkError = require('./core').MongoNetworkError;

// From spec@https://github.com/mongodb/specifications/blob/f93d78191f3db2898a59013a7ed5650352ef6da8/source/change-streams/change-streams.rst#resumable-error
const GET_MORE_RESUMABLE_CODES = new Set([
  6, // HostUnreachable
  7, // HostNotFound
  89, // NetworkTimeout
  91, // ShutdownInProgress
  189, // PrimarySteppedDown
  262, // ExceededTimeLimit
  9001, // SocketException
  10107, // NotMaster
  11600, // InterruptedAtShutdown
  11602, // InterruptedDueToReplStateChange
  13435, // NotMasterNoSlaveOk
  13436, // NotMasterOrSecondary
  63, // StaleShardVersion
  150, // StaleEpoch
  13388, // StaleConfig
  234, // RetryChangeStream
  133, // FailedToSatisfyReadPreference
  43 // CursorNotFound
]);

function isResumableError(error, wireVersion) {
  if (error instanceof MongoNetworkError) {
    return true;
  }

  if (wireVersion >= 9) {
    // DRIVERS-1308: For 4.4 drivers running against 4.4 servers, drivers will add a special case to treat the CursorNotFound error code as resumable
    if (error.code === 43) {
      return true;
    }
    return error.hasErrorLabel('ResumableChangeStreamError');
  }

  return GET_MORE_RESUMABLE_CODES.has(error.code);
}

module.exports = { GET_MORE_RESUMABLE_CODES, isResumableError };
