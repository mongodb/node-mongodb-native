'use strict';

const Logger = require('../connection/logger');
const BSON = require('../connection/utils').retrieveBSON();
const MongoError = require('../error').MongoError;
const MongoNetworkError = require('../error').MongoNetworkError;
const mongoErrorContextSymbol = require('../error').mongoErrorContextSymbol;
const Long = BSON.Long;
const deprecate = require('util').deprecate;
const readPreferenceServerSelector = require('./server_selectors').readPreferenceServerSelector;
const ReadPreference = require('../topologies/read_preference');

/**
 * Handle callback (including any exceptions thrown)
 */
function handleCallback(callback, err, result) {
  try {
    callback(err, result);
  } catch (err) {
    process.nextTick(function() {
      throw err;
    });
  }
}

/**
 * This is a cursor results callback
 *
 * @callback resultCallback
 * @param {error} error An error object. Set to null if no error present
 * @param {object} document
 */

/**
 * An internal class that embodies a cursor on MongoDB, allowing for iteration over the
 * results returned from a query.
 *
 * @property {number} cursorBatchSize The current cursorBatchSize for the cursor
 * @property {number} cursorLimit The current cursorLimit for the cursor
 * @property {number} cursorSkip The current cursorSkip for the cursor
 */
class Cursor {
  /**
   * Create a cursor
   *
   * @param {object} bson An instance of the BSON parser
   * @param {string} ns The MongoDB fully qualified namespace (ex: db1.collection1)
   * @param {{object}|Long} cmd The selector (can be a command or a cursorId)
   * @param {object} [options=null] Optional settings.
   * @param {object} [options.batchSize=1000] Batchsize for the operation
   * @param {array} [options.documents=[]] Initial documents list for cursor
   * @param {object} [options.transforms=null] Transform methods for the cursor results
   * @param {function} [options.transforms.query] Transform the value returned from the initial query
   * @param {function} [options.transforms.doc] Transform each document returned from Cursor.prototype.next
   * @param {object} topology The server topology instance.
   * @param {object} topologyOptions The server topology options.
   */
  constructor(bson, ns, cmd, options, topology, topologyOptions) {
    options = options || {};

    // Cursor pool
    this.pool = null;
    // Cursor server
    this.server = null;

    // Do we have a not connected handler
    this.disconnectHandler = options.disconnectHandler;

    // Set local values
    this.bson = bson;
    this.ns = ns;
    this.cmd = cmd;
    this.options = options;
    this.topology = topology;

    // All internal state
    this.s = {
      cursorId: null,
      cmd: cmd,
      documents: options.documents || [],
      cursorIndex: 0,
      dead: false,
      killed: false,
      init: false,
      notified: false,
      limit: options.limit || cmd.limit || 0,
      skip: options.skip || cmd.skip || 0,
      batchSize: options.batchSize || cmd.batchSize || 1000,
      currentLimit: 0,
      // Result field name if not a cursor (contains the array of results)
      transforms: options.transforms
    };

    if (typeof options.session === 'object') {
      this.s.session = options.session;
    }

    // Add promoteLong to cursor state
    if (typeof topologyOptions.promoteLongs === 'boolean') {
      this.s.promoteLongs = topologyOptions.promoteLongs;
    } else if (typeof options.promoteLongs === 'boolean') {
      this.s.promoteLongs = options.promoteLongs;
    }

    // Add promoteValues to cursor state
    if (typeof topologyOptions.promoteValues === 'boolean') {
      this.s.promoteValues = topologyOptions.promoteValues;
    } else if (typeof options.promoteValues === 'boolean') {
      this.s.promoteValues = options.promoteValues;
    }

    // Add promoteBuffers to cursor state
    if (typeof topologyOptions.promoteBuffers === 'boolean') {
      this.s.promoteBuffers = topologyOptions.promoteBuffers;
    } else if (typeof options.promoteBuffers === 'boolean') {
      this.s.promoteBuffers = options.promoteBuffers;
    }

    if (topologyOptions.reconnect) {
      this.s.reconnect = topologyOptions.reconnect;
    }

    // Logger
    this.logger = Logger('Cursor', topologyOptions);

    //
    // Did we pass in a cursor id
    if (typeof cmd === 'number') {
      this.s.cursorId = Long.fromNumber(cmd);
      this.s.lastCursorId = this.s.cursorId;
    } else if (cmd instanceof Long) {
      this.s.cursorId = cmd;
      this.s.lastCursorId = cmd;
    }
  }

  setCursorBatchSize(value) {
    this.s.batchSize = value;
  }

  cursorBatchSize() {
    return this.s.batchSize;
  }

  setCursorLimit(value) {
    this.s.limit = value;
  }

  cursorLimit() {
    return this.s.limit;
  }

  setCursorSkip(value) {
    this.s.skip = value;
  }

  cursorSkip() {
    return this.s.skip;
  }

  _endSession(options, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    options = options || {};

    const session = this.s.session;
    if (session && (options.force || session.owner === this)) {
      this.s.session = undefined;
      session.endSession(callback);
      return true;
    }

    if (callback) {
      callback();
    }

    return false;
  }

  /**
   * Clone the cursor
   * @method
   * @return {Cursor}
   */
  clone() {
    return this.topology.cursor(this.ns, this.cmd, this.options);
  }

  /**
   * Checks if the cursor is dead
   * @method
   * @return {boolean} A boolean signifying if the cursor is dead or not
   */
  isDead() {
    return this.s.dead === true;
  }

  /**
   * Checks if the cursor was killed by the application
   * @method
   * @return {boolean} A boolean signifying if the cursor was killed by the application
   */
  isKilled() {
    return this.s.killed === true;
  }

  /**
   * Checks if the cursor notified it's caller about it's death
   * @method
   * @return {boolean} A boolean signifying if the cursor notified the callback
   */
  isNotified() {
    return this.s.notified === true;
  }

  /**
   * Returns current buffered documents length
   * @method
   * @return {number} The number of items in the buffered documents
   */
  bufferedCount() {
    return this.s.documents.length - this.s.cursorIndex;
  }

  /**
   * Kill the cursor
   *
   * @param {resultCallback} callback A callback function
   */
  kill(callback) {
    // Set cursor to dead
    this.s.dead = true;
    this.s.killed = true;
    // Remove documents
    this.s.documents = [];

    // If no cursor id just return
    if (this.s.cursorId == null || this.s.cursorId.isZero() || this.s.init === false) {
      if (callback) callback(null, null);
      return;
    }

    // Default pool
    const pool = this.s.server.s.pool;

    // Execute command
    this.s.server.s.wireProtocolHandler.killCursor(this.bson, this.ns, this.s, pool, callback);
  }

  /**
   * Resets the cursor
   */
  rewind() {
    if (this.s.init) {
      if (!this.s.dead) {
        this.kill();
      }

      this.s.currentLimit = 0;
      this.s.init = false;
      this.s.dead = false;
      this.s.killed = false;
      this.s.notified = false;
      this.s.documents = [];
      this.s.cursorId = null;
      this.s.cursorIndex = 0;
    }
  }

  /**
   * Returns current buffered documents
   * @method
   * @return {Array} An array of buffered documents
   */
  readBufferedDocuments(number) {
    const unreadDocumentsLength = this.s.documents.length - this.s.cursorIndex;
    const length = number < unreadDocumentsLength ? number : unreadDocumentsLength;
    let elements = this.s.documents.slice(this.s.cursorIndex, this.s.cursorIndex + length);

    // Transform the doc with passed in transformation method if provided
    if (this.s.transforms && typeof this.s.transforms.doc === 'function') {
      // Transform all the elements
      for (let i = 0; i < elements.length; i++) {
        elements[i] = this.s.transforms.doc(elements[i]);
      }
    }

    // Ensure we do not return any more documents than the limit imposed
    // Just return the number of elements up to the limit
    if (this.s.limit > 0 && this.s.currentLimit + elements.length > this.s.limit) {
      elements = elements.slice(0, this.s.limit - this.s.currentLimit);
      this.kill();
    }

    // Adjust current limit
    this.s.currentLimit = this.s.currentLimit + elements.length;
    this.s.cursorIndex = this.s.cursorIndex + elements.length;

    // Return elements
    return elements;
  }

  /**
   * Retrieve the next document from the cursor
   *
   * @param {resultCallback} callback A callback function
   */
  next(callback) {
    nextFunction(this, callback);
  }
}

Cursor.prototype._find = deprecate(
  callback => _find(this, callback),
  '_find() is deprecated, please stop using it'
);

Cursor.prototype._getmore = deprecate(
  callback => _getmore(this, callback),
  '_getmore() is deprecated, please stop using it'
);

function _getmore(cursor, callback) {
  if (cursor.logger.isDebug()) {
    cursor.logger.debug(`schedule getMore call for query [${JSON.stringify(cursor.query)}]`);
  }

  // Determine if it's a raw query
  const raw = cursor.options.raw || cursor.cmd.raw;

  // Set the current batchSize
  let batchSize = cursor.s.batchSize;
  if (cursor.s.limit > 0 && cursor.s.currentLimit + batchSize > cursor.s.limit) {
    batchSize = cursor.s.limit - cursor.s.currentLimit;
  }

  // Default pool
  const pool = cursor.s.server.s.pool;

  // We have a wire protocol handler
  cursor.s.server.s.wireProtocolHandler.getMore(
    cursor.bson,
    cursor.ns,
    cursor.s,
    batchSize,
    raw,
    pool,
    cursor.options,
    callback
  );
}

function _find(cursor, callback) {
  if (cursor.logger.isDebug()) {
    cursor.logger.debug(
      `issue initial query [${JSON.stringify(cursor.cmd)}] with flags [${JSON.stringify(
        cursor.query
      )}]`
    );
  }

  const queryCallback = (err, r) => {
    if (err) return callback(err);

    // Get the raw message
    const result = r.message;

    // Query failure bit set
    if (result.queryFailure) {
      return callback(new MongoError(result.documents[0]), null);
    }

    // Check if we have a command cursor
    if (
      Array.isArray(result.documents) &&
      result.documents.length === 1 &&
      (!cursor.cmd.find || (cursor.cmd.find && cursor.cmd.virtual === false)) &&
      (result.documents[0].cursor !== 'string' ||
        result.documents[0]['$err'] ||
        result.documents[0]['errmsg'] ||
        Array.isArray(result.documents[0].result))
    ) {
      // We have a an error document return the error
      if (result.documents[0]['$err'] || result.documents[0]['errmsg']) {
        return callback(new MongoError(result.documents[0]), null);
      }

      // We have a cursor document
      if (result.documents[0].cursor != null && typeof result.documents[0].cursor !== 'string') {
        const id = result.documents[0].cursor.id;
        // If we have a namespace change set the new namespace for getmores
        if (result.documents[0].cursor.ns) {
          cursor.ns = result.documents[0].cursor.ns;
        }
        // Promote id to long if needed
        cursor.s.cursorId = typeof id === 'number' ? Long.fromNumber(id) : id;
        cursor.s.lastCursorId = cursor.s.cursorId;
        // If we have a firstBatch set it
        if (Array.isArray(result.documents[0].cursor.firstBatch)) {
          cursor.s.documents = result.documents[0].cursor.firstBatch;
        }

        // Return after processing command cursor
        return callback(null, result);
      }

      if (Array.isArray(result.documents[0].result)) {
        cursor.s.documents = result.documents[0].result;
        cursor.s.cursorId = Long.ZERO;
        return callback(null, result);
      }
    }

    // Otherwise fall back to regular find path
    cursor.s.cursorId = result.cursorId;
    cursor.s.documents = result.documents;
    cursor.s.lastCursorId = result.cursorId;

    // Transform the results with passed in transformation method if provided
    if (cursor.s.transforms && typeof cursor.s.transforms.query === 'function') {
      cursor.s.documents = cursor.s.transforms.query(result);
    }

    // Return callback
    callback(null, result);
  };

  // Options passed to the pool
  const queryOptions = {};

  // If we have a raw query decorate the function
  if (cursor.options.raw || cursor.cmd.raw) {
    queryOptions.raw = cursor.options.raw || cursor.cmd.raw;
  }

  // Do we have documentsReturnedIn set on the query
  if (typeof cursor.query.documentsReturnedIn === 'string') {
    queryOptions.documentsReturnedIn = cursor.query.documentsReturnedIn;
  }

  // Add promote Long value if defined
  if (typeof cursor.s.promoteLongs === 'boolean') {
    queryOptions.promoteLongs = cursor.s.promoteLongs;
  }

  // Add promote values if defined
  if (typeof cursor.s.promoteValues === 'boolean') {
    queryOptions.promoteValues = cursor.s.promoteValues;
  }

  // Add promote values if defined
  if (typeof cursor.s.promoteBuffers === 'boolean') {
    queryOptions.promoteBuffers = cursor.s.promoteBuffers;
  }

  if (typeof cursor.s.session === 'object') {
    queryOptions.session = cursor.s.session;
  }

  // Write the initial command out
  cursor.s.server.s.pool.write(cursor.query, queryOptions, queryCallback);
}

/**
 * Validate if the pool is dead and return error
 */
function isConnectionDead(cursor, callback) {
  if (cursor.pool && cursor.pool.isDestroyed()) {
    cursor.s.killed = true;
    const err = new MongoNetworkError(
      `connection to host ${cursor.pool.host}:${cursor.pool.port} was destroyed`
    );
    _setCursorNotifiedImpl(cursor, () => callback(err));
    return true;
  }

  return false;
}

/**
 * Validate if the cursor is dead but was not explicitly killed by user
 */
function isCursorDeadButNotkilled(cursor, callback) {
  // Cursor is dead but not marked killed, return null
  if (cursor.s.dead && !cursor.s.killed) {
    cursor.s.killed = true;
    setCursorNotified(cursor, callback);
    return true;
  }

  return false;
}

/**
 * Validate if the cursor is dead and was killed by user
 */
function isCursorDeadAndKilled(cursor, callback) {
  if (cursor.s.dead && cursor.s.killed) {
    handleCallback(callback, new MongoError('cursor is dead'));
    return true;
  }

  return false;
}

/**
 * Validate if the cursor was killed by the user
 */
function isCursorKilled(cursor, callback) {
  if (cursor.s.killed) {
    setCursorNotified(cursor, callback);
    return true;
  }

  return false;
}

/**
 * Mark cursor as being dead and notified
 */
function setCursorDeadAndNotified(cursor, callback) {
  cursor.s.dead = true;
  setCursorNotified(cursor, callback);
}

/**
 * Mark cursor as being notified
 */
function setCursorNotified(cursor, callback) {
  _setCursorNotifiedImpl(cursor, () => handleCallback(callback, null, null));
}

function _setCursorNotifiedImpl(cursor, callback) {
  cursor.s.notified = true;
  cursor.s.documents = [];
  cursor.s.cursorIndex = 0;
  if (cursor._endSession) {
    return cursor._endSession(undefined, () => callback());
  }
  return callback();
}

function initializeCursorAndRetryNext(cursor, callback) {
  cursor.topology.selectServer(
    readPreferenceServerSelector(cursor.options.readPreference || ReadPreference.primary),
    (err, server) => {
      if (err) {
        callback(err, null);
        return;
      }

      cursor.s.server = server;
      cursor.s.init = true;

      // check if server supports collation
      // NOTE: this should be a part of the selection predicate!
      if (cursor.cmd && cursor.cmd.collation && cursor.server.description.maxWireVersion < 5) {
        callback(new MongoError(`server ${cursor.server.name} does not support collation`));
        return;
      }

      try {
        cursor.query = cursor.s.server.s.wireProtocolHandler.command(
          cursor.bson,
          cursor.ns,
          cursor.cmd,
          cursor.s,
          cursor.topology,
          cursor.options
        );

        nextFunction(cursor, callback);
      } catch (err) {
        callback(err);
        return;
      }
    }
  );
}

function nextFunction(cursor, callback) {
  // We have notified about it
  if (cursor.s.notified) {
    return callback(new Error('cursor is exhausted'));
  }

  // Cursor is killed return null
  if (isCursorKilled(cursor, callback)) return;

  // Cursor is dead but not marked killed, return null
  if (isCursorDeadButNotkilled(cursor, callback)) return;

  // We have a dead and killed cursor, attempting to call next should error
  if (isCursorDeadAndKilled(cursor, callback)) return;

  // We have just started the cursor
  if (!cursor.s.init) {
    return initializeCursorAndRetryNext(cursor, callback);
  }

  // If we don't have a cursorId execute the first query
  if (cursor.s.cursorId == null) {
    // Check if pool is dead and return if not possible to
    // execute the query against the db
    if (isConnectionDead(cursor, callback)) return;

    // query, cmd, options, s, callback
    return _find(cursor, function(err) {
      if (err) return handleCallback(callback, err, null);

      if (cursor.s.cursorId && cursor.s.cursorId.isZero() && cursor._endSession) {
        cursor._endSession();
      }

      if (
        cursor.s.documents.length === 0 &&
        cursor.s.cursorId &&
        cursor.s.cursorId.isZero() &&
        !cursor.cmd.tailable &&
        !cursor.cmd.awaitData
      ) {
        return setCursorNotified(cursor, callback);
      }

      nextFunction(cursor, callback);
    });
  }

  if (cursor.s.documents.length === cursor.s.cursorIndex && Long.ZERO.equals(cursor.s.cursorId)) {
    setCursorDeadAndNotified(cursor, callback);
    return;
  }

  if (cursor.s.limit > 0 && cursor.s.currentLimit >= cursor.s.limit) {
    // Ensure we kill the cursor on the server
    cursor.kill();
    // Set cursor in dead and notified state
    setCursorDeadAndNotified(cursor, callback);
    return;
  }

  if (
    cursor.s.documents.length === cursor.s.cursorIndex &&
    cursor.cmd.tailable &&
    Long.ZERO.equals(cursor.s.cursorId)
  ) {
    return handleCallback(
      callback,
      new MongoError({
        message: 'No more documents in tailed cursor',
        tailable: cursor.cmd.tailable,
        awaitData: cursor.cmd.awaitData
      })
    );
  }

  if (cursor.s.cursorIndex === cursor.s.documents.length && !Long.ZERO.equals(cursor.s.cursorId)) {
    // Ensure an empty cursor state
    cursor.s.documents = [];
    cursor.s.cursorIndex = 0;

    // Check if connection is dead and return if not possible to
    if (isConnectionDead(cursor, callback)) return;

    // Execute the next get more
    return _getmore(cursor, function(err, doc, connection) {
      if (err) {
        if (err instanceof MongoError) {
          err[mongoErrorContextSymbol].isGetMore = true;
        }

        return handleCallback(callback, err);
      }

      if (cursor.s.cursorId && cursor.s.cursorId.isZero() && cursor._endSession) {
        cursor._endSession();
      }

      // Save the returned connection to ensure all getMore's fire over the same connection
      cursor.connection = connection;

      // Tailable cursor getMore result, notify owner about it
      // No attempt is made here to retry, this is left to the user of the
      // core module to handle to keep core simple
      if (
        cursor.s.documents.length === 0 &&
        cursor.cmd.tailable &&
        Long.ZERO.equals(cursor.s.cursorId)
      ) {
        // No more documents in the tailed cursor
        return handleCallback(
          callback,
          new MongoError({
            message: 'No more documents in tailed cursor',
            tailable: cursor.cmd.tailable,
            awaitData: cursor.cmd.awaitData
          })
        );
      } else if (
        cursor.s.documents.length === 0 &&
        cursor.cmd.tailable &&
        !Long.ZERO.equals(cursor.s.cursorId)
      ) {
        return nextFunction(cursor, callback);
      }

      if (cursor.s.limit > 0 && cursor.s.currentLimit >= cursor.s.limit) {
        return setCursorDeadAndNotified(cursor, callback);
      }

      nextFunction(cursor, callback);
    });
  }

  if (cursor.s.limit > 0 && cursor.s.currentLimit >= cursor.s.limit) {
    // Ensure we kill the cursor on the server
    cursor.kill();
    // Set cursor in dead and notified state
    return setCursorDeadAndNotified(cursor, callback);
  }

  // Increment the current cursor limit
  cursor.s.currentLimit += 1;

  // Get the document
  let doc = cursor.s.documents[cursor.s.cursorIndex++];

  // Doc overflow
  if (!doc || doc.$err) {
    // Ensure we kill the cursor on the server
    cursor.kill();
    // Set cursor in dead and notified state
    return setCursorDeadAndNotified(cursor, function() {
      handleCallback(callback, new MongoError(doc ? doc.$err : undefined));
    });
  }

  // Transform the doc with passed in transformation method if provided
  if (cursor.s.transforms && typeof cursor.s.transforms.doc === 'function') {
    doc = cursor.s.transforms.doc(doc);
  }

  // Return the document
  handleCallback(callback, null, doc);
}

module.exports = Cursor;
