'use strict';

const GET_MORE_NON_RESUMABLE_CODES = new Set([
  136, // CappedPositionLost
  237, // CursorKilled
  11601 // Interrupted
]);

module.exports = { GET_MORE_NON_RESUMABLE_CODES };
