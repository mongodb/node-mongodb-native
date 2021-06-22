'use strict';

const Logger = require('./connection/logger');
const retrieveBSON = require('./connection/utils').retrieveBSON;
const MongoError = require('./error').MongoError;
const MongoNetworkError = require('./error').MongoNetworkError;
const collationNotSupported = require('./utils').collationNotSupported;
const ReadPreference = require('./topologies/read_preference');
const isUnifiedTopology = require('./utils').isUnifiedTopology;
const executeOperation = require('../operations/execute_operation');
const Readable = require('stream').Readable;
const SUPPORTS = require('../utils').SUPPORTS;
const MongoDBNamespace = require('../utils').MongoDBNamespace;
const mergeOptions = require('../utils').mergeOptions;
const OperationBase = require('../operations/operation').OperationBase;

const BSON = retrieveBSON();
const Long = BSON.Long;

// Possible states for a cursor
const CursorState = {
  INIT: 0,
  OPEN: 1,
  CLOSED: 2,
  GET_MORE: 3
};

//
// Handle callback (including any exceptions thrown)
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
 * @fileOverview The **Cursor** class is an internal class that embodies a cursor on MongoDB
 * allowing for iteration over the results returned from the underlying query.
 *
 * **CURSORS Cannot directly be instantiated**
 */

/**
 * The core cursor class. All cursors in the driver build off of this one.
 *
 * @property {number} cursorBatchSize The current cursorBatchSize for the cursor
 * @property {number} cursorLimit The current cursorLimit for the cursor
 * @property {number} cursorSkip The current cursorSkip for the cursor
 */
class CoreCursor extends Readable {
  /**
   * Create a new core `Cursor` instance.
   * **NOTE** Not to be instantiated directly
   *
   * @param {object} topology The server topology instance.
   * @param {string} ns The MongoDB fully qualified namespace (ex: db1.collection1)
   * @param {{object}|Long} cmd The selector (can be a command or a cursorId)
   * @param {object} [options=null] Optional settings.
   * @param {object} [options.batchSize=1000] The number of documents to return per batch. See {@link https://docs.mongodb.com/manual/reference/command/find/| find command documentation} and {@link https://docs.mongodb.com/manual/reference/command/aggregate|aggregation documentation}.
   * @param {array} [options.documents=[]] Initial documents list for cursor
   * @param {object} [options.transforms=null] Transform methods for the cursor results
   * @param {function} [options.transforms.query] Transform the value returned from the initial query
   * @param {function} [options.transforms.doc] Transform each document returned from Cursor.prototype._next
   */
  constructor(topology, ns, cmd, options) {
    super({ objectMode: true });
    options = options || {};

    if (ns instanceof OperationBase) {
      this.operation = ns;
      ns = this.operation.ns.toString();
      options = this.operation.options;
      cmd = this.operation.cmd ? this.operation.cmd : {};
    }

    // Cursor pool
    this.pool = null;
    // Cursor server
    this.server = null;

    // Do we have a not connected handler
    this.disconnectHandler = options.disconnectHandler;

    // Set local values
    this.bson = topology.s.bson;
    this.ns = ns;
    this.namespace = MongoDBNamespace.fromString(ns);
    this.cmd = cmd;
    this.options = options;
    this.topology = topology;

    // All internal state
    this.cursorState = {
      cursorId: null,
      cmd,
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
      transforms: options.transforms,
      raw: options.raw || (cmd && cmd.raw)
    };

    if (typeof options.session === 'object') {
      this.cursorState.session = options.session;
    }

    // Add promoteLong to cursor state
    const topologyOptions = topology.s.options;
    if (typeof topologyOptions.promoteLongs === 'boolean') {
      this.cursorState.promoteLongs = topologyOptions.promoteLongs;
    } else if (typeof options.promoteLongs === 'boolean') {
      this.cursorState.promoteLongs = options.promoteLongs;
    }

    // Add promoteValues to cursor state
    if (typeof topologyOptions.promoteValues === 'boolean') {
      this.cursorState.promoteValues = topologyOptions.promoteValues;
    } else if (typeof options.promoteValues === 'boolean') {
      this.cursorState.promoteValues = options.promoteValues;
    }

    // Add promoteBuffers to cursor state
    if (typeof topologyOptions.promoteBuffers === 'boolean') {
      this.cursorState.promoteBuffers = topologyOptions.promoteBuffers;
    } else if (typeof options.promoteBuffers === 'boolean') {
      this.cursorState.promoteBuffers = options.promoteBuffers;
    }

    if (topologyOptions.reconnect) {
      this.cursorState.reconnect = topologyOptions.reconnect;
    }

    // Logger
    this.logger = Logger('Cursor', topologyOptions);

    //
    // Did we pass in a cursor id
    if (typeof cmd === 'number') {
      this.cursorState.cursorId = Long.fromNumber(cmd);
      this.cursorState.lastCursorId = this.cursorState.cursorId;
    } else if (cmd instanceof Long) {
      this.cursorState.cursorId = cmd;
      this.cursorState.lastCursorId = cmd;
    }

    // TODO: remove as part of NODE-2104
    if (this.operation) {
      this.operation.cursorState = this.cursorState;
    }
  }

  setCursorBatchSize(value) {
    this.cursorState.batchSize = value;
  }

  cursorBatchSize() {
    return this.cursorState.batchSize;
  }

  setCursorLimit(value) {
    this.cursorState.limit = value;
  }

  cursorLimit() {
    return this.cursorState.limit;
  }

  setCursorSkip(value) {
    this.cursorState.skip = value;
  }

  cursorSkip() {
    return this.cursorState.skip;
  }

  /**
   * Retrieve the next document from the cursor
   * @method
   * @param {resultCallback} callback A callback function
   */
  _next(callback) {
    nextFunction(this, callback);
  }

  /**
   * Clone the cursor
   * @method
   * @return {Cursor}
   */
  clone() {
    const clonedOptions = mergeOptions({}, this.options);
    delete clonedOptions.session;
    return this.topology.cursor(this.ns, this.cmd, clonedOptions);
  }

  /**
   * Checks if the cursor is dead
   * @method
   * @return {boolean} A boolean signifying if the cursor is dead or not
   */
  isDead() {
    return this.cursorState.dead === true;
  }

  /**
   * Checks if the cursor was killed by the application
   * @method
   * @return {boolean} A boolean signifying if the cursor was killed by the application
   */
  isKilled() {
    return this.cursorState.killed === true;
  }

  /**
   * Checks if the cursor notified it's caller about it's death
   * @method
   * @return {boolean} A boolean signifying if the cursor notified the callback
   */
  isNotified() {
    return this.cursorState.notified === true;
  }

  /**
   * Returns current buffered documents length
   * @method
   * @return {number} The number of items in the buffered documents
   */
  bufferedCount() {
    return this.cursorState.documents.length - this.cursorState.cursorIndex;
  }

  /**
   * Returns current buffered documents
   * @method
   * @return {Array} An array of buffered documents
   */
  readBufferedDocuments(number) {
    const unreadDocumentsLength = this.cursorState.documents.length - this.cursorState.cursorIndex;
    const length = number < unreadDocumentsLength ? number : unreadDocumentsLength;
    let elements = this.cursorState.documents.slice(
      this.cursorState.cursorIndex,
      this.cursorState.cursorIndex + length
    );

    // Transform the doc with passed in transformation method if provided
    if (this.cursorState.transforms && typeof this.cursorState.transforms.doc === 'function') {
      // Transform all the elements
      for (let i = 0; i < elements.length; i++) {
        elements[i] = this.cursorState.transforms.doc(elements[i]);
      }
    }

    // Ensure we do not return any more documents than the limit imposed
    // Just return the number of elements up to the limit
    if (
      this.cursorState.limit > 0 &&
      this.cursorState.currentLimit + elements.length > this.cursorState.limit
    ) {
      elements = elements.slice(0, this.cursorState.limit - this.cursorState.currentLimit);
      this.kill();
    }

    // Adjust current limit
    this.cursorState.currentLimit = this.cursorState.currentLimit + elements.length;
    this.cursorState.cursorIndex = this.cursorState.cursorIndex + elements.length;

    // Return elements
    return elements;
  }

  /**
   * Resets local state for this cursor instance, and issues a `killCursors` command to the server
   *
   * @param {resultCallback} callback A callback function
   */
  kill(callback) {
    // Set cursor to dead
    this.cursorState.dead = true;
    this.cursorState.killed = true;
    // Remove documents
    this.cursorState.documents = [];

    // If no cursor id just return
    if (
      this.cursorState.cursorId == null ||
      this.cursorState.cursorId.isZero() ||
      this.cursorState.init === false
    ) {
      if (callback) callback(null, null);
      return;
    }

    this.server.killCursors(this.ns, this.cursorState, callback);
  }

  /**
   * Resets the cursor
   */
  rewind() {
    if (this.cursorState.init) {
      if (!this.cursorState.dead) {
        this.kill();
      }

      this.cursorState.currentLimit = 0;
      this.cursorState.init = false;
      this.cursorState.dead = false;
      this.cursorState.killed = false;
      this.cursorState.notified = false;
      this.cursorState.documents = [];
      this.cursorState.cursorId = null;
      this.cursorState.cursorIndex = 0;
    }
  }

  // Internal methods
  _read() {
    if ((this.s && this.s.state === CursorState.CLOSED) || this.isDead()) {
      return this.push(null);
    }

    // Get the next item
    this._next((err, result) => {
      if (err) {
        if (this.listeners('error') && this.listeners('error').length > 0) {
          this.emit('error', err);
        }
        if (!this.isDead()) this.close();

        // Emit end event
        this.emit('end');
        return this.emit('finish');
      }

      // If we provided a transformation method
      if (
        this.cursorState.streamOptions &&
        typeof this.cursorState.streamOptions.transform === 'function' &&
        result != null
      ) {
        return this.push(this.cursorState.streamOptions.transform(result));
      }

      // Return the result
      this.push(result);

      if (result === null && this.isDead()) {
        this.once('end', () => {
          this.close();
          this.emit('finish');
        });
      }
    });
  }

  _endSession(options, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    options = options || {};

    const session = this.cursorState.session;

    if (session && (options.force || session.owner === this)) {
      this.cursorState.session = undefined;

      if (this.operation) {
        this.operation.clearSession();
      }

      session.endSession(callback);
      return true;
    }

    if (callback) {
      callback();
    }

    return false;
  }

  _getMore(callback) {
    if (this.logger.isDebug()) {
      this.logger.debug(`schedule getMore call for query [${JSON.stringify(this.query)}]`);
    }

    // Set the current batchSize
    let batchSize = this.cursorState.batchSize;
    if (
      this.cursorState.limit > 0 &&
      this.cursorState.currentLimit + batchSize > this.cursorState.limit
    ) {
      batchSize = this.cursorState.limit - this.cursorState.currentLimit;
    }

    const cursorState = this.cursorState;
    this.server.getMore(this.ns, cursorState, batchSize, this.options, (err, result, conn) => {
      // NOTE: `getMore` modifies `cursorState`, would be very ideal not to do so in the future
      if (err || (cursorState.cursorId && cursorState.cursorId.isZero())) {
        this._endSession();
      }

      callback(err, result, conn);
    });
  }

  _initializeCursor(callback) {
    const cursor = this;

    // NOTE: this goes away once cursors use `executeOperation`
    if (isUnifiedTopology(cursor.topology) && cursor.topology.shouldCheckForSessionSupport()) {
      cursor.topology.selectServer(ReadPreference.primaryPreferred, err => {
        if (err) {
          callback(err);
          return;
        }

        this._initializeCursor(callback);
      });

      return;
    }

    function done(err, result) {
      const cursorState = cursor.cursorState;
      if (err || (cursorState.cursorId && cursorState.cursorId.isZero())) {
        cursor._endSession();
      }

      if (
        cursorState.documents.length === 0 &&
        cursorState.cursorId &&
        cursorState.cursorId.isZero() &&
        !cursor.cmd.tailable &&
        !cursor.cmd.awaitData
      ) {
        return setCursorNotified(cursor, callback);
      }

      callback(err, result);
    }

    const queryCallback = (err, r) => {
      if (err) {
        return done(err);
      }

      const result = r.message;

      if (Array.isArray(result.documents) && result.documents.length === 1) {
        const document = result.documents[0];

        if (result.queryFailure) {
          return done(new MongoError(document), null);
        }

        // Check if we have a command cursor
        if (!cursor.cmd.find || (cursor.cmd.find && cursor.cmd.virtual === false)) {
          // We have an error document, return the error
          if (document.$err || document.errmsg) {
            return done(new MongoError(document), null);
          }

          // We have a cursor document
          if (document.cursor != null && typeof document.cursor !== 'string') {
            const id = document.cursor.id;
            // If we have a namespace change set the new namespace for getmores
            if (document.cursor.ns) {
              cursor.ns = document.cursor.ns;
            }
            // Promote id to long if needed
            cursor.cursorState.cursorId = typeof id === 'number' ? Long.fromNumber(id) : id;
            cursor.cursorState.lastCursorId = cursor.cursorState.cursorId;
            cursor.cursorState.operationTime = document.operationTime;

            // If we have a firstBatch set it
            if (Array.isArray(document.cursor.firstBatch)) {
              cursor.cursorState.documents = document.cursor.firstBatch; //.reverse();
            }

            // Return after processing command cursor
            return done(null, result);
          }
        }
      }

      // Otherwise fall back to regular find path
      const cursorId = result.cursorId || 0;
      cursor.cursorState.cursorId = cursorId instanceof Long ? cursorId : Long.fromNumber(cursorId);
      cursor.cursorState.documents = result.documents;
      cursor.cursorState.lastCursorId = result.cursorId;

      // Transform the results with passed in transformation method if provided
      if (
        cursor.cursorState.transforms &&
        typeof cursor.cursorState.transforms.query === 'function'
      ) {
        cursor.cursorState.documents = cursor.cursorState.transforms.query(result);
      }

      done(null, result);
    };

    if (cursor.operation) {
      if (cursor.logger.isDebug()) {
        cursor.logger.debug(
          `issue initial query [${JSON.stringify(cursor.cmd)}] with flags [${JSON.stringify(
            cursor.query
          )}]`
        );
      }

      executeOperation(cursor.topology, cursor.operation, (err, result) => {
        if (err) {
          done(err);
          return;
        }

        cursor.server = cursor.operation.server;
        cursor.cursorState.init = true;

        // NOTE: this is a special internal method for cloning a cursor, consider removing
        if (cursor.cursorState.cursorId != null) {
          return done();
        }

        queryCallback(err, result);
      });

      return;
    }

    // Very explicitly choose what is passed to selectServer
    const serverSelectOptions = {};
    if (cursor.cursorState.session) {
      serverSelectOptions.session = cursor.cursorState.session;
    }

    if (cursor.operation) {
      serverSelectOptions.readPreference = cursor.operation.readPreference;
    } else if (cursor.options.readPreference) {
      serverSelectOptions.readPreference = cursor.options.readPreference;
    }

    return cursor.topology.selectServer(serverSelectOptions, (err, server) => {
      if (err) {
        const disconnectHandler = cursor.disconnectHandler;
        if (disconnectHandler != null) {
          return disconnectHandler.addObjectAndMethod(
            'cursor',
            cursor,
            'next',
            [callback],
            callback
          );
        }

        return callback(err);
      }

      cursor.server = server;
      cursor.cursorState.init = true;
      if (collationNotSupported(cursor.server, cursor.cmd)) {
        return callback(new MongoError(`server ${cursor.server.name} does not support collation`));
      }

      // NOTE: this is a special internal method for cloning a cursor, consider removing
      if (cursor.cursorState.cursorId != null) {
        return done();
      }

      if (cursor.logger.isDebug()) {
        cursor.logger.debug(
          `issue initial query [${JSON.stringify(cursor.cmd)}] with flags [${JSON.stringify(
            cursor.query
          )}]`
        );
      }

      if (cursor.cmd.find != null) {
        server.query(cursor.ns, cursor.cmd, cursor.cursorState, cursor.options, queryCallback);
        return;
      }

      const commandOptions = Object.assign({ session: cursor.cursorState.session }, cursor.options);
      server.command(cursor.ns, cursor.cmd, commandOptions, queryCallback);
    });
  }
}

if (SUPPORTS.ASYNC_ITERATOR) {
  CoreCursor.prototype[Symbol.asyncIterator] = require('../async/async_iterator').asyncIterator;
}

/**
 * Validate if the pool is dead and return error
 */
function isConnectionDead(self, callback) {
  if (self.pool && self.pool.isDestroyed()) {
    self.cursorState.killed = true;
    const err = new MongoNetworkError(
      `connection to host ${self.pool.host}:${self.pool.port} was destroyed`
    );

    _setCursorNotifiedImpl(self, () => callback(err));
    return true;
  }

  return false;
}

/**
 * Validate if the cursor is dead but was not explicitly killed by user
 */
function isCursorDeadButNotkilled(self, callback) {
  // Cursor is dead but not marked killed, return null
  if (self.cursorState.dead && !self.cursorState.killed) {
    self.cursorState.killed = true;
    setCursorNotified(self, callback);
    return true;
  }

  return false;
}

/**
 * Validate if the cursor is dead and was killed by user
 */
function isCursorDeadAndKilled(self, callback) {
  if (self.cursorState.dead && self.cursorState.killed) {
    handleCallback(callback, new MongoError('cursor is dead'));
    return true;
  }

  return false;
}

/**
 * Validate if the cursor was killed by the user
 */
function isCursorKilled(self, callback) {
  if (self.cursorState.killed) {
    setCursorNotified(self, callback);
    return true;
  }

  return false;
}

/**
 * Mark cursor as being dead and notified
 */
function setCursorDeadAndNotified(self, callback) {
  self.cursorState.dead = true;
  setCursorNotified(self, callback);
}

/**
 * Mark cursor as being notified
 */
function setCursorNotified(self, callback) {
  _setCursorNotifiedImpl(self, () => handleCallback(callback, null, null));
}

function _setCursorNotifiedImpl(self, callback) {
  self.cursorState.notified = true;
  self.cursorState.documents = [];
  self.cursorState.cursorIndex = 0;

  if (self.cursorState.session) {
    self._endSession(callback);
    return;
  }

  return callback();
}

function nextFunction(self, callback) {
  // We have notified about it
  if (self.cursorState.notified) {
    return callback(new Error('cursor is exhausted'));
  }

  // Cursor is killed return null
  if (isCursorKilled(self, callback)) return;

  // Cursor is dead but not marked killed, return null
  if (isCursorDeadButNotkilled(self, callback)) return;

  // We have a dead and killed cursor, attempting to call next should error
  if (isCursorDeadAndKilled(self, callback)) return;

  // We have just started the cursor
  if (!self.cursorState.init) {
    // Topology is not connected, save the call in the provided store to be
    // Executed at some point when the handler deems it's reconnected
    if (!self.topology.isConnected(self.options)) {
      // Only need this for single server, because repl sets and mongos
      // will always continue trying to reconnect
      if (self.topology._type === 'server' && !self.topology.s.options.reconnect) {
        // Reconnect is disabled, so we'll never reconnect
        return callback(new MongoError('no connection available'));
      }

      if (self.disconnectHandler != null) {
        if (self.topology.isDestroyed()) {
          // Topology was destroyed, so don't try to wait for it to reconnect
          return callback(new MongoError('Topology was destroyed'));
        }

        self.disconnectHandler.addObjectAndMethod('cursor', self, 'next', [callback], callback);
        return;
      }
    }

    self._initializeCursor((err, result) => {
      if (err || result === null) {
        callback(err, result);
        return;
      }

      nextFunction(self, callback);
    });

    return;
  }

  if (self.cursorState.limit > 0 && self.cursorState.currentLimit >= self.cursorState.limit) {
    // Ensure we kill the cursor on the server
    self.kill(() =>
      // Set cursor in dead and notified state
      setCursorDeadAndNotified(self, callback)
    );
  } else if (
    self.cursorState.cursorIndex === self.cursorState.documents.length &&
    !Long.ZERO.equals(self.cursorState.cursorId)
  ) {
    // Ensure an empty cursor state
    self.cursorState.documents = [];
    self.cursorState.cursorIndex = 0;

    // Check if topology is destroyed
    if (self.topology.isDestroyed())
      return callback(
        new MongoNetworkError('connection destroyed, not possible to instantiate cursor')
      );

    // Check if connection is dead and return if not possible to
    // execute a getMore on this connection
    if (isConnectionDead(self, callback)) return;

    // Execute the next get more
    self._getMore(function(err, doc, connection) {
      if (err) {
        return handleCallback(callback, err);
      }

      // Save the returned connection to ensure all getMore's fire over the same connection
      self.connection = connection;

      // Tailable cursor getMore result, notify owner about it
      // No attempt is made here to retry, this is left to the user of the
      // core module to handle to keep core simple
      if (
        self.cursorState.documents.length === 0 &&
        self.cmd.tailable &&
        Long.ZERO.equals(self.cursorState.cursorId)
      ) {
        // No more documents in the tailed cursor
        return handleCallback(
          callback,
          new MongoError({
            message: 'No more documents in tailed cursor',
            tailable: self.cmd.tailable,
            awaitData: self.cmd.awaitData
          })
        );
      } else if (
        self.cursorState.documents.length === 0 &&
        self.cmd.tailable &&
        !Long.ZERO.equals(self.cursorState.cursorId)
      ) {
        return nextFunction(self, callback);
      }

      if (self.cursorState.limit > 0 && self.cursorState.currentLimit >= self.cursorState.limit) {
        return setCursorDeadAndNotified(self, callback);
      }

      nextFunction(self, callback);
    });
  } else if (
    self.cursorState.documents.length === self.cursorState.cursorIndex &&
    self.cmd.tailable &&
    Long.ZERO.equals(self.cursorState.cursorId)
  ) {
    return handleCallback(
      callback,
      new MongoError({
        message: 'No more documents in tailed cursor',
        tailable: self.cmd.tailable,
        awaitData: self.cmd.awaitData
      })
    );
  } else if (
    self.cursorState.documents.length === self.cursorState.cursorIndex &&
    Long.ZERO.equals(self.cursorState.cursorId)
  ) {
    setCursorDeadAndNotified(self, callback);
  } else {
    if (self.cursorState.limit > 0 && self.cursorState.currentLimit >= self.cursorState.limit) {
      // Ensure we kill the cursor on the server
      self.kill(() =>
        // Set cursor in dead and notified state
        setCursorDeadAndNotified(self, callback)
      );

      return;
    }

    // Increment the current cursor limit
    self.cursorState.currentLimit += 1;

    // Get the document
    let doc = self.cursorState.documents[self.cursorState.cursorIndex++];

    // Doc overflow
    if (!doc || doc.$err) {
      // Ensure we kill the cursor on the server
      self.kill(() =>
        // Set cursor in dead and notified state
        setCursorDeadAndNotified(self, function() {
          handleCallback(callback, new MongoError(doc ? doc.$err : undefined));
        })
      );

      return;
    }

    // Transform the doc with passed in transformation method if provided
    if (self.cursorState.transforms && typeof self.cursorState.transforms.doc === 'function') {
      doc = self.cursorState.transforms.doc(doc);
    }

    // Return the document
    handleCallback(callback, null, doc);
  }
}

module.exports = {
  CursorState,
  CoreCursor
};
