'use strict';

const MongoNetworkError = require('./core').MongoNetworkError;
const mongoErrorContextSymbol = require('./core').mongoErrorContextSymbol;

const GET_MORE_NON_RESUMABLE_CODES = new Set([
  136, // CappedPositionLost
  237, // CursorKilled
  11601 // Interrupted
]);

// From spec@https://github.com/mongodb/specifications/blob/7a2e93d85935ee4b1046a8d2ad3514c657dc74fa/source/change-streams/change-streams.rst#resumable-error:
//
// An error is considered resumable if it meets any of the following criteria:
// - any error encountered which is not a server error (e.g. a timeout error or network error)
// - any server error response from a getMore command excluding those containing the error label
//   NonRetryableChangeStreamError and those containing the following error codes:
//   - Interrupted: 11601
//   - CappedPositionLost: 136
//   - CursorKilled: 237
//
// An error on an aggregate command is not a resumable error. Only errors on a getMore command may be considered resumable errors.

function isGetMoreError(error) {
  if (error[mongoErrorContextSymbol]) {
    return error[mongoErrorContextSymbol].isGetMore;
  }
}

function isResumableError(error) {
  if (!isGetMoreError(error)) {
    return false;
  }

  if (error instanceof MongoNetworkError) {
    return true;
  }

  return !(
    GET_MORE_NON_RESUMABLE_CODES.has(error.code) ||
    error.hasErrorLabel('NonRetryableChangeStreamError')
  );
}

module.exports = { GET_MORE_NON_RESUMABLE_CODES, isResumableError };
