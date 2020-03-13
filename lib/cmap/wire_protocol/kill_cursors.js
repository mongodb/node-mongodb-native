'use strict';
const { KillCursor } = require('../commands');
const { maxWireVersion, collectionNamespace } = require('../../utils');
const command = require('./command');
const { MongoError, MongoNetworkError } = require('../../error');

function killCursors(server, ns, cursorState, callback) {
  callback = typeof callback === 'function' ? callback : () => {};
  const cursorId = cursorState.cursorId;

  if (maxWireVersion(server) < 4) {
    const pool = server.s.pool;
    const killCursor = new KillCursor(ns, [cursorId]);
    const options = {
      immediateRelease: true,
      noResponse: true
    };

    if (typeof cursorState.session === 'object') {
      options.session = cursorState.session;
    }

    if (pool && pool.isConnected()) {
      try {
        pool.write(killCursor, options, callback);
      } catch (err) {
        if (typeof callback === 'function') {
          callback(err, null);
        } else {
          console.warn(err);
        }
      }
    }

    return;
  }

  const killCursorCmd = {
    killCursors: collectionNamespace(ns),
    cursors: [cursorId]
  };

  const options = {};
  if (typeof cursorState.session === 'object') options.session = cursorState.session;

  command(server, ns, killCursorCmd, options, (err, result) => {
    if (err) {
      return callback(err);
    }

    const response = result.message;
    if (response.cursorNotFound) {
      return callback(new MongoNetworkError('cursor killed or timed out'), null);
    }

    if (!Array.isArray(response.documents) || response.documents.length === 0) {
      return callback(
        new MongoError(`invalid killCursors result returned for cursor id ${cursorId}`)
      );
    }

    callback(null, response.documents[0]);
  });
}

module.exports = killCursors;
