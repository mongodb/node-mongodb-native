'use strict';

const KillCursor = require('../connection/commands').KillCursor;
const MongoError = require('../error').MongoError;
const MongoNetworkError = require('../error').MongoNetworkError;
const collectionNamespace = require('./shared').collectionNamespace;
const maxWireVersion = require('../utils').maxWireVersion;
const command = require('./command');

function killCursors(server, ns, cursorState, callback) {
  callback = typeof callback === 'function' ? callback : () => {};
  const cursorId = cursorState.cursorId;

  if (maxWireVersion(server) < 4) {
    const bson = server.s.bson;
    const pool = server.s.pool;
    const killCursor = new KillCursor(bson, ns, [cursorId]);
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
