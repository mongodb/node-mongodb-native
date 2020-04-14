'use strict';

const MongoNetworkError = require('./core').MongoNetworkError;
const mongoErrorContextSymbol = require('./core').mongoErrorContextSymbol;

const GET_MORE_NON_RESUMABLE_CODES = new Set([
  136, // CappedPositionLost
  237, // CursorKilled
  11601 // Interrupted
]);

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
  133 // FailedToSatisfyReadPreference
]);

function isGetMoreError(error) {
  if (error[mongoErrorContextSymbol]) {
    return error[mongoErrorContextSymbol].isGetMore;
  }
}

function isResumableError(error, wireVersion) {
  if (!isGetMoreError(error)) {
    return false;
  }

  if (error instanceof MongoNetworkError) {
    return true;
  }

  if (wireVersion >= 9) {
    return error.hasErrorLabel('ResumableChangeStreamError');
  }

  return (
    GET_MORE_RESUMABLE_CODES.has(error.code) &&
    !error.hasErrorLabel('NonResumableChangeStreamError')
  );
}

module.exports = { GET_MORE_NON_RESUMABLE_CODES, GET_MORE_RESUMABLE_CODES, isResumableError };
