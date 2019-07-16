'use strict';

const GetMore = require('../connection/commands').GetMore;
const retrieveBSON = require('../connection/utils').retrieveBSON;
const MongoError = require('../error').MongoError;
const MongoNetworkError = require('../error').MongoNetworkError;
const BSON = retrieveBSON();
const Long = BSON.Long;
const collectionNamespace = require('./shared').collectionNamespace;
const maxWireVersion = require('../utils').maxWireVersion;
const applyCommonQueryOptions = require('./shared').applyCommonQueryOptions;
const command = require('./command');

function getMore(server, ns, cursorState, batchSize, options, callback) {
  options = options || {};

  const wireVersion = maxWireVersion(server);
  function queryCallback(err, result) {
    if (err) return callback(err);
    const response = result.message;

    // If we have a timed out query or a cursor that was killed
    if (response.cursorNotFound) {
      return callback(new MongoNetworkError('cursor killed or timed out'), null);
    }

    if (wireVersion < 4) {
      const cursorId =
        typeof response.cursorId === 'number'
          ? Long.fromNumber(response.cursorId)
          : response.cursorId;

      cursorState.documents = response.documents;
      cursorState.cursorId = cursorId;

      callback(null, null, response.connection);
      return;
    }

    // We have an error detected
    if (response.documents[0].ok === 0) {
      return callback(new MongoError(response.documents[0]));
    }

    // Ensure we have a Long valid cursor id
    const cursorId =
      typeof response.documents[0].cursor.id === 'number'
        ? Long.fromNumber(response.documents[0].cursor.id)
        : response.documents[0].cursor.id;

    cursorState.documents = response.documents[0].cursor.nextBatch;
    cursorState.cursorId = cursorId;

    callback(null, response.documents[0], response.connection);
  }

  if (wireVersion < 4) {
    const bson = server.s.bson;
    const getMoreOp = new GetMore(bson, ns, cursorState.cursorId, { numberToReturn: batchSize });
    const queryOptions = applyCommonQueryOptions({}, cursorState);
    server.s.pool.write(getMoreOp, queryOptions, queryCallback);
    return;
  }

  const getMoreCmd = {
    getMore: cursorState.cursorId,
    collection: collectionNamespace(ns),
    batchSize: Math.abs(batchSize)
  };

  if (cursorState.cmd.tailable && typeof cursorState.cmd.maxAwaitTimeMS === 'number') {
    getMoreCmd.maxTimeMS = cursorState.cmd.maxAwaitTimeMS;
  }

  const commandOptions = Object.assign(
    {
      returnFieldSelector: null,
      documentsReturnedIn: 'nextBatch'
    },
    options
  );

  if (cursorState.session) {
    commandOptions.session = cursorState.session;
  }

  command(server, ns, getMoreCmd, commandOptions, queryCallback);
}

module.exports = getMore;
