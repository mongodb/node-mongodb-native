'use strict';

const Msg = require('../../connection/msg').Msg;
const errors = require('../../error');
const MongoError = errors.MongoError;
const MongoNetworkError = errors.MongoNetworkError;

function executeKillCursor(bson, ns, cursorState, pool, callback) {
  // Build command namespace
  const parts = ns.split(/\./);
  const $db = parts.shift();
  const cursorId = cursorState.cursorId;

  const killcursorCmd = {
    killCursors: parts.join('.'),
    cursors: [cursorId],
    $db
  };

  const msg = new Msg(bson, killcursorCmd, { checkKeys: false });

  // Kill cursor callback
  const killCursorCallback = (err, result) => {
    if (err) {
      return evaluatePotentialCallback(callback, err);
    }

    // Result
    const r = result.message;
    // If we have a timed out query or a cursor that was killed
    if ((r.responseFlags & (1 << 0)) !== 0) {
      return evaluatePotentialCallback(
        callback,
        new MongoNetworkError('cursor killed or timed out'),
        null
      );
    }

    if (!Array.isArray(r.documents) || r.documents.length === 0) {
      return evaluatePotentialCallback(
        callback,
        new MongoError(`invalid killCursors result returned for cursor id ${cursorId}`)
      );
    }

    evaluatePotentialCallback(callback, null, r.documents[0]);
  };

  const options = { command: true };
  if (typeof cursorState.session === 'object') {
    options.session = cursorState.session;
  }

  if (!(pool && pool.isConnected())) {
    return evaluatePotentialCallback(callback, null, null);
  }

  try {
    pool.write(msg, options, killCursorCallback);
  } catch (err) {
    killCursorCallback(err, null);
  }
}

function evaluatePotentialCallback(cb, err, payload) {
  if (typeof cb === 'function') {
    return cb(err, payload);
  }
}

module.exports = executeKillCursor;
