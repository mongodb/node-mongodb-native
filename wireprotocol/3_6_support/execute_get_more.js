'use strict';

const Msg = require('../../connection/msg').Msg;
const errors = require('../../error');
const MongoError = errors.MongoError;
const MongoNetworkError = errors.MongoNetworkError;
const retrieveBSON = require('../../connection/utils').retrieveBSON;

const BSON = retrieveBSON();

function executeGetMore(bson, ns, cursorState, batchSize, raw, connection, options, callback) {
  options = options || {};
  // Build command namespace
  const parts = ns.split(/\./);

  // database name
  const $db = parts.shift();

  // Create getMore command
  var getMoreCmd = {
    $db,
    getMore: cursorState.cursorId,
    collection: parts.join('.'),
    batchSize: Math.abs(batchSize)
  };

  if (cursorState.cmd.tailable && typeof cursorState.cmd.maxAwaitTimeMS === 'number') {
    getMoreCmd.maxTimeMS = cursorState.cmd.maxAwaitTimeMS;
  }

  // Build Query object
  const msg = new Msg(bson, getMoreCmd, { checkKeys: false });

  // Query callback
  const queryCallback = function(err, result) {
    if (err) return callback(err);
    // Get the raw message
    var r = result.message;

    // If we have a timed out query or a cursor that was killed
    if ((r.responseFlags & (1 << 0)) !== 0) {
      return callback(new MongoNetworkError('cursor killed or timed out'), null);
    }

    // Raw, return all the extracted documents
    if (raw) {
      cursorState.documents = r.documents;
      cursorState.cursorId = r.cursorId;
      return callback(null, r.documents);
    }

    // We have an error detected
    if (r.documents[0].ok === 0) {
      return callback(new MongoError(r.documents[0]));
    }

    // Ensure we have a Long valid cursor id
    var cursorId =
      typeof r.documents[0].cursor.id === 'number'
        ? BSON.Long.fromNumber(r.documents[0].cursor.id)
        : r.documents[0].cursor.id;

    // Set all the values
    cursorState.documents = r.documents[0].cursor.nextBatch;
    cursorState.cursorId = cursorId;

    // Return the result
    callback(null, r.documents[0], r.connection);
  };

  // Query options
  const queryOptions = { command: true };

  // If we have a raw query decorate the function
  if (raw) {
    queryOptions.raw = raw;
  }

  // Add the result field needed
  queryOptions.documentsReturnedIn = 'nextBatch';

  // Check if we need to promote longs
  if (typeof cursorState.promoteLongs === 'boolean') {
    queryOptions.promoteLongs = cursorState.promoteLongs;
  }

  if (typeof cursorState.promoteValues === 'boolean') {
    queryOptions.promoteValues = cursorState.promoteValues;
  }

  if (typeof cursorState.promoteBuffers === 'boolean') {
    queryOptions.promoteBuffers = cursorState.promoteBuffers;
  }

  if (typeof cursorState.session === 'object') {
    queryOptions.session = cursorState.session;
  }

  // Write out the getMore command
  connection.write(msg, queryOptions, queryCallback);
}

module.exports = executeGetMore;
