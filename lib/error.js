'use strict';

const MongoNetworkError = require('mongodb-core').MongoNetworkError;
const mongoErrorContextSymbol = require('mongodb-core').mongoErrorContextSymbol;

const GET_MORE_NON_RESUMABLE_CODES = new Set([
  136, // CappedPositionLost
  237, // CursorKilled
  11601 // Interrupted
]);

// From spec@https://github.com/mongodb/specifications/blob/35e466ddf25059cb30e4113de71cdebd3754657f/source/change-streams.rst#resumable-error:
//
// An error is considered resumable if it meets any of the following criteria:
// - any error encountered which is not a server error (e.g. a timeout error or network error)
// - any server error response from a getMore command excluding those containing the following error codes
//   - Interrupted: 11601
//   - CappedPositionLost: 136
//   - CursorKilled: 237
// - a server error response with an error message containing the substring "not master" or "node is recovering"
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

  return !!(
    error instanceof MongoNetworkError ||
    !GET_MORE_NON_RESUMABLE_CODES.has(error.code) ||
    error.message.match(/not master/) ||
    error.message.match(/node is recovering/)
  );
}

module.exports = { GET_MORE_NON_RESUMABLE_CODES, isResumableError };
