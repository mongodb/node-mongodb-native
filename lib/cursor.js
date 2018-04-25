'use strict';

const inherits = require('util').inherits;
const f = require('util').format;
const deprecate = require('util').deprecate;
const formattedOrderClause = require('./utils').formattedOrderClause;
const handleCallback = require('./utils').handleCallback;
const ReadPreference = require('mongodb-core').ReadPreference;
const MongoError = require('mongodb-core').MongoError;
const Readable = require('stream').Readable;
const CoreCursor = require('mongodb-core').Cursor;
const Map = require('mongodb-core').BSON.Map;
const executeOperation = require('./utils').executeOperation;

/**
 * @fileOverview The **Cursor** class is an internal class that embodies a cursor on MongoDB
 * allowing for iteration over the results returned from the underlying query. It supports
 * one by one document iteration, conversion to an array or can be iterated as a Node 4.X
 * or higher stream
 *
 * **CURSORS Cannot directly be instantiated**
 * @example
 * const MongoClient = require('mongodb').MongoClient;
 * const test = require('assert');
 * // Connection url
 * const url = 'mongodb://localhost:27017';
 * // Database Name
 * const dbName = 'test';
 * // Connect using MongoClient
 * MongoClient.connect(url, function(err, client) {
 *   // Create a collection we want to drop later
 *   const col = client.db(dbName).collection('createIndexExample1');
 *   // Insert a bunch of documents
 *   col.insert([{a:1, b:1}
 *     , {a:2, b:2}, {a:3, b:3}
 *     , {a:4, b:4}], {w:1}, function(err, result) {
 *     test.equal(null, err);
 *     // Show that duplicate records got dropped
 *     col.find({}).toArray(function(err, items) {
 *       test.equal(null, err);
 *       test.equal(4, items.length);
 *       client.close();
 *     });
 *   });
 * });
 */

/**
 * Namespace provided by the mongodb-core and node.js
 * @external CoreCursor
 * @external Readable
 */

// Flags allowed for cursor
var flags = ['tailable', 'oplogReplay', 'noCursorTimeout', 'awaitData', 'exhaust', 'partial'];
var fields = ['numberOfRetries', 'tailableRetryInterval'];
var push = Array.prototype.push;

/**
 * Creates a new Cursor instance (INTERNAL TYPE, do not instantiate directly)
 * @class Cursor
 * @extends external:CoreCursor
 * @extends external:Readable
 * @property {string} sortValue Cursor query sort setting.
 * @property {boolean} timeout Is Cursor able to time out.
 * @property {ReadPreference} readPreference Get cursor ReadPreference.
 * @fires Cursor#data
 * @fires Cursor#end
 * @fires Cursor#close
 * @fires Cursor#readable
 * @return {Cursor} a Cursor instance.
 * @example
 * Cursor cursor options.
 *
 * collection.find({}).project({a:1})                             // Create a projection of field a
 * collection.find({}).skip(1).limit(10)                          // Skip 1 and limit 10
 * collection.find({}).batchSize(5)                               // Set batchSize on cursor to 5
 * collection.find({}).filter({a:1})                              // Set query on the cursor
 * collection.find({}).comment('add a comment')                   // Add a comment to the query, allowing to correlate queries
 * collection.find({}).addCursorFlag('tailable', true)            // Set cursor as tailable
 * collection.find({}).addCursorFlag('oplogReplay', true)         // Set cursor as oplogReplay
 * collection.find({}).addCursorFlag('noCursorTimeout', true)     // Set cursor as noCursorTimeout
 * collection.find({}).addCursorFlag('awaitData', true)           // Set cursor as awaitData
 * collection.find({}).addCursorFlag('partial', true)             // Set cursor as partial
 * collection.find({}).addQueryModifier('$orderby', {a:1})        // Set $orderby {a:1}
 * collection.find({}).max(10)                                    // Set the cursor max
 * collection.find({}).maxTimeMS(1000)                            // Set the cursor maxTimeMS
 * collection.find({}).min(100)                                   // Set the cursor min
 * collection.find({}).returnKey(10)                              // Set the cursor returnKey
 * collection.find({}).setReadPreference(ReadPreference.PRIMARY)  // Set the cursor readPreference
 * collection.find({}).showRecordId(true)                         // Set the cursor showRecordId
 * collection.find({}).sort([['a', 1]])                           // Sets the sort order of the cursor query
 * collection.find({}).hint('a_1')                                // Set the cursor hint
 *
 * All options are chainable, so one can do the following.
 *
 * collection.find({}).maxTimeMS(1000).maxScan(100).skip(1).toArray(..)
 */
var Cursor = function(bson, ns, cmd, options, topology, topologyOptions) {
  CoreCursor.apply(this, Array.prototype.slice.call(arguments, 0));
  var state = Cursor.INIT;
  var streamOptions = {};

  // Tailable cursor options
  var numberOfRetries = options.numberOfRetries || 5;
  var tailableRetryInterval = options.tailableRetryInterval || 500;
  var currentNumberOfRetries = numberOfRetries;

  // Get the promiseLibrary
  var promiseLibrary = options.promiseLibrary || Promise;

  // Set up
  Readable.call(this, { objectMode: true });

  // Internal cursor state
  this.s = {
    // Tailable cursor options
    numberOfRetries: numberOfRetries,
    tailableRetryInterval: tailableRetryInterval,
    currentNumberOfRetries: currentNumberOfRetries,
    // State
    state: state,
    // Stream options
    streamOptions: streamOptions,
    // BSON
    bson: bson,
    // Namespace
    ns: ns,
    // Command
    cmd: cmd,
    // Options
    options: options,
    // Topology
    topology: topology,
    // Topology options
    topologyOptions: topologyOptions,
    // Promise library
    promiseLibrary: promiseLibrary,
    // Current doc
    currentDoc: null,
    // Optional ClientSession
    session: options.session
  };

  // Translate correctly
  if (this.s.options.noCursorTimeout === true) {
    this.addCursorFlag('noCursorTimeout', true);
  }

  // Set the sort value
  this.sortValue = this.s.cmd.sort;

  // Get the batchSize
  var batchSize =
    cmd.cursor && cmd.cursor.batchSize
      ? cmd.cursor && cmd.cursor.batchSize
      : options.cursor && options.cursor.batchSize
        ? options.cursor.batchSize
        : 1000;

  // Set the batchSize
  this.setCursorBatchSize(batchSize);
};

/**
 * Cursor stream data event, fired for each document in the cursor.
 *
 * @event Cursor#data
 * @type {object}
 */

/**
 * Cursor stream end event
 *
 * @event Cursor#end
 * @type {null}
 */

/**
 * Cursor stream close event
 *
 * @event Cursor#close
 * @type {null}
 */

/**
 * Cursor stream readable event
 *
 * @event Cursor#readable
 * @type {null}
 */

// Inherit from Readable
inherits(Cursor, Readable);

// Map core cursor _next method so we can apply mapping
Cursor.prototype._next = function() {
  if (this._initImplicitSession) {
    this._initImplicitSession();
  }
  return CoreCursor.prototype.next.apply(this, arguments);
};

for (var name in CoreCursor.prototype) {
  Cursor.prototype[name] = CoreCursor.prototype[name];
}

Cursor.prototype._initImplicitSession = function() {
  if (!this.s.session && this.s.topology.hasSessionSupport()) {
    this.s.session = this.s.topology.startSession({ owner: this });
    this.cursorState.session = this.s.session;
  }
};

Cursor.prototype._endSession = function() {
  const didCloseCursor = CoreCursor.prototype._endSession.apply(this, arguments);
  if (didCloseCursor) {
    this.s.session = undefined;
  }
};

/**
 * Check if there is any document still available in the cursor
 * @method
 * @param {Cursor~resultCallback} [callback] The result callback.
 * @throws {MongoError}
 * @return {Promise} returns Promise if no callback passed
 */
Cursor.prototype.hasNext = function(callback) {
  return executeOperation(this.s.topology, hasNext, [this, callback], {
    skipSessions: true
  });
};

const hasNext = (self, callback) => {
  if (self.s.currentDoc) {
    return callback(null, true);
  }

  nextObject(self, function(err, doc) {
    if (err) return callback(err, null);
    if (self.s.state === Cursor.CLOSED || self.isDead()) return callback(null, false);
    if (!doc) return callback(null, false);
    self.s.currentDoc = doc;
    callback(null, true);
  });
};

/**
 * Get the next available document from the cursor, returns null if no more documents are available.
 * @method
 * @param {Cursor~resultCallback} [callback] The result callback.
 * @throws {MongoError}
 * @return {Promise} returns Promise if no callback passed
 */
Cursor.prototype.next = function(callback) {
  return executeOperation(this.s.topology, next, [this, callback], {
    skipSessions: true
  });
};

const next = (self, callback) => {
  // Return the currentDoc if someone called hasNext first
  if (self.s.currentDoc) {
    var doc = self.s.currentDoc;
    self.s.currentDoc = null;
    return callback(null, doc);
  }

  // Return the next object
  nextObject(self, callback);
};

/**
 * Set the cursor query
 * @method
 * @param {object} filter The filter object used for the cursor.
 * @return {Cursor}
 */
Cursor.prototype.filter = function(filter) {
  if (this.s.state === Cursor.CLOSED || this.s.state === Cursor.OPEN || this.isDead()) {
    throw MongoError.create({ message: 'Cursor is closed', driver: true });
  }

  this.s.cmd.query = filter;
  return this;
};

/**
 * Set the cursor maxScan
 * @method
 * @param {object} maxScan Constrains the query to only scan the specified number of documents when fulfilling the query
 * @deprecated as of MongoDB 4.0
 * @return {Cursor}
 */
Cursor.prototype.maxScan = deprecate(function(maxScan) {
  if (this.s.state === Cursor.CLOSED || this.s.state === Cursor.OPEN || this.isDead()) {
    throw MongoError.create({ message: 'Cursor is closed', driver: true });
  }

  this.s.cmd.maxScan = maxScan;
  return this;
}, 'Cursor.maxScan is deprecated, and will be removed in a later version');

/**
 * Set the cursor hint
 * @method
 * @param {object} hint If specified, then the query system will only consider plans using the hinted index.
 * @return {Cursor}
 */
Cursor.prototype.hint = function(hint) {
  if (this.s.state === Cursor.CLOSED || this.s.state === Cursor.OPEN || this.isDead()) {
    throw MongoError.create({ message: 'Cursor is closed', driver: true });
  }

  this.s.cmd.hint = hint;
  return this;
};

/**
 * Set the cursor min
 * @method
 * @param {object} min Specify a $min value to specify the inclusive lower bound for a specific index in order to constrain the results of find(). The $min specifies the lower bound for all keys of a specific index in order.
 * @return {Cursor}
 */
Cursor.prototype.min = function(min) {
  if (this.s.state === Cursor.CLOSED || this.s.state === Cursor.OPEN || this.isDead())
    throw MongoError.create({ message: 'Cursor is closed', driver: true });
  this.s.cmd.min = min;
  return this;
};

/**
 * Set the cursor max
 * @method
 * @param {object} max Specify a $max value to specify the exclusive upper bound for a specific index in order to constrain the results of find(). The $max specifies the upper bound for all keys of a specific index in order.
 * @return {Cursor}
 */
Cursor.prototype.max = function(max) {
  if (this.s.state === Cursor.CLOSED || this.s.state === Cursor.OPEN || this.isDead()) {
    throw MongoError.create({ message: 'Cursor is closed', driver: true });
  }

  this.s.cmd.max = max;
  return this;
};

/**
 * Set the cursor returnKey
 * @method
 * @param {object} returnKey Only return the index field or fields for the results of the query. If $returnKey is set to true and the query does not use an index to perform the read operation, the returned documents will not contain any fields. Use one of the following forms:
 * @return {Cursor}
 */
Cursor.prototype.returnKey = function(value) {
  if (this.s.state === Cursor.CLOSED || this.s.state === Cursor.OPEN || this.isDead()) {
    throw MongoError.create({ message: 'Cursor is closed', driver: true });
  }

  this.s.cmd.returnKey = value;
  return this;
};

/**
 * Set the cursor showRecordId
 * @method
 * @param {object} showRecordId The $showDiskLoc option has now been deprecated and replaced with the showRecordId field. $showDiskLoc will still be accepted for OP_QUERY stye find.
 * @return {Cursor}
 */
Cursor.prototype.showRecordId = function(value) {
  if (this.s.state === Cursor.CLOSED || this.s.state === Cursor.OPEN || this.isDead()) {
    throw MongoError.create({ message: 'Cursor is closed', driver: true });
  }

  this.s.cmd.showDiskLoc = value;
  return this;
};

/**
 * Set the cursor snapshot
 * @method
 * @param {object} snapshot The $snapshot operator prevents the cursor from returning a document more than once because an intervening write operation results in a move of the document.
 * @deprecated as of MongoDB 4.0
 * @return {Cursor}
 */
Cursor.prototype.snapshot = deprecate(function(value) {
  if (this.s.state === Cursor.CLOSED || this.s.state === Cursor.OPEN || this.isDead()) {
    throw MongoError.create({ message: 'Cursor is closed', driver: true });
  }

  this.s.cmd.snapshot = value;
  return this;
}, 'Cursor Snapshot is deprecated, and will be removed in a later version');

/**
 * Set a node.js specific cursor option
 * @method
 * @param {string} field The cursor option to set ['numberOfRetries', 'tailableRetryInterval'].
 * @param {object} value The field value.
 * @throws {MongoError}
 * @return {Cursor}
 */
Cursor.prototype.setCursorOption = function(field, value) {
  if (this.s.state === Cursor.CLOSED || this.s.state === Cursor.OPEN || this.isDead()) {
    throw MongoError.create({ message: 'Cursor is closed', driver: true });
  }

  if (fields.indexOf(field) === -1) {
    throw MongoError.create({
      message: f('option %s not a supported option %s', field, fields),
      driver: true
    });
  }

  this.s[field] = value;
  if (field === 'numberOfRetries') this.s.currentNumberOfRetries = value;
  return this;
};

/**
 * Add a cursor flag to the cursor
 * @method
 * @param {string} flag The flag to set, must be one of following ['tailable', 'oplogReplay', 'noCursorTimeout', 'awaitData', 'partial'].
 * @param {boolean} value The flag boolean value.
 * @throws {MongoError}
 * @return {Cursor}
 */
Cursor.prototype.addCursorFlag = function(flag, value) {
  if (this.s.state === Cursor.CLOSED || this.s.state === Cursor.OPEN || this.isDead()) {
    throw MongoError.create({ message: 'Cursor is closed', driver: true });
  }

  if (flags.indexOf(flag) === -1) {
    throw MongoError.create({
      message: f('flag %s not a supported flag %s', flag, flags),
      driver: true
    });
  }

  if (typeof value !== 'boolean') {
    throw MongoError.create({ message: f('flag %s must be a boolean value', flag), driver: true });
  }

  this.s.cmd[flag] = value;
  return this;
};

/**
 * Add a query modifier to the cursor query
 * @method
 * @param {string} name The query modifier (must start with $, such as $orderby etc)
 * @param {boolean} value The flag boolean value.
 * @throws {MongoError}
 * @return {Cursor}
 */
Cursor.prototype.addQueryModifier = function(name, value) {
  if (this.s.state === Cursor.CLOSED || this.s.state === Cursor.OPEN || this.isDead()) {
    throw MongoError.create({ message: 'Cursor is closed', driver: true });
  }

  if (name[0] !== '$') {
    throw MongoError.create({ message: f('%s is not a valid query modifier'), driver: true });
  }

  // Strip of the $
  var field = name.substr(1);
  // Set on the command
  this.s.cmd[field] = value;
  // Deal with the special case for sort
  if (field === 'orderby') this.s.cmd.sort = this.s.cmd[field];
  return this;
};

/**
 * Add a comment to the cursor query allowing for tracking the comment in the log.
 * @method
 * @param {string} value The comment attached to this query.
 * @throws {MongoError}
 * @return {Cursor}
 */
Cursor.prototype.comment = function(value) {
  if (this.s.state === Cursor.CLOSED || this.s.state === Cursor.OPEN || this.isDead()) {
    throw MongoError.create({ message: 'Cursor is closed', driver: true });
  }

  this.s.cmd.comment = value;
  return this;
};

/**
 * Set a maxAwaitTimeMS on a tailing cursor query to allow to customize the timeout value for the option awaitData (Only supported on MongoDB 3.2 or higher, ignored otherwise)
 * @method
 * @param {number} value Number of milliseconds to wait before aborting the tailed query.
 * @throws {MongoError}
 * @return {Cursor}
 */
Cursor.prototype.maxAwaitTimeMS = function(value) {
  if (typeof value !== 'number') {
    throw MongoError.create({ message: 'maxAwaitTimeMS must be a number', driver: true });
  }

  if (this.s.state === Cursor.CLOSED || this.s.state === Cursor.OPEN || this.isDead()) {
    throw MongoError.create({ message: 'Cursor is closed', driver: true });
  }

  this.s.cmd.maxAwaitTimeMS = value;
  return this;
};

/**
 * Set a maxTimeMS on the cursor query, allowing for hard timeout limits on queries (Only supported on MongoDB 2.6 or higher)
 * @method
 * @param {number} value Number of milliseconds to wait before aborting the query.
 * @throws {MongoError}
 * @return {Cursor}
 */
Cursor.prototype.maxTimeMS = function(value) {
  if (typeof value !== 'number') {
    throw MongoError.create({ message: 'maxTimeMS must be a number', driver: true });
  }

  if (this.s.state === Cursor.CLOSED || this.s.state === Cursor.OPEN || this.isDead()) {
    throw MongoError.create({ message: 'Cursor is closed', driver: true });
  }

  this.s.cmd.maxTimeMS = value;
  return this;
};

Cursor.prototype.maxTimeMs = Cursor.prototype.maxTimeMS;

/**
 * Sets a field projection for the query.
 * @method
 * @param {object} value The field projection object.
 * @throws {MongoError}
 * @return {Cursor}
 */
Cursor.prototype.project = function(value) {
  if (this.s.state === Cursor.CLOSED || this.s.state === Cursor.OPEN || this.isDead()) {
    throw MongoError.create({ message: 'Cursor is closed', driver: true });
  }

  this.s.cmd.fields = value;
  return this;
};

/**
 * Sets the sort order of the cursor query.
 * @method
 * @param {(string|array|object)} keyOrList The key or keys set for the sort.
 * @param {number} [direction] The direction of the sorting (1 or -1).
 * @throws {MongoError}
 * @return {Cursor}
 */
Cursor.prototype.sort = function(keyOrList, direction) {
  if (this.s.options.tailable) {
    throw MongoError.create({ message: "Tailable cursor doesn't support sorting", driver: true });
  }

  if (this.s.state === Cursor.CLOSED || this.s.state === Cursor.OPEN || this.isDead()) {
    throw MongoError.create({ message: 'Cursor is closed', driver: true });
  }

  var order = keyOrList;

  // We have an array of arrays, we need to preserve the order of the sort
  // so we will us a Map
  if (Array.isArray(order) && Array.isArray(order[0])) {
    order = new Map(
      order.map(function(x) {
        var value = [x[0], null];
        if (x[1] === 'asc') {
          value[1] = 1;
        } else if (x[1] === 'desc') {
          value[1] = -1;
        } else if (x[1] === 1 || x[1] === -1) {
          value[1] = x[1];
        } else {
          throw new MongoError(
            "Illegal sort clause, must be of the form [['field1', '(ascending|descending)'], ['field2', '(ascending|descending)']]"
          );
        }

        return value;
      })
    );
  }

  if (direction != null) {
    order = [[keyOrList, direction]];
  }

  this.s.cmd.sort = order;
  this.sortValue = order;
  return this;
};

/**
 * Set the batch size for the cursor.
 * @method
 * @param {number} value The batchSize for the cursor.
 * @throws {MongoError}
 * @return {Cursor}
 */
Cursor.prototype.batchSize = function(value) {
  if (this.s.options.tailable) {
    throw MongoError.create({ message: "Tailable cursor doesn't support batchSize", driver: true });
  }

  if (this.s.state === Cursor.CLOSED || this.isDead()) {
    throw MongoError.create({ message: 'Cursor is closed', driver: true });
  }

  if (typeof value !== 'number') {
    throw MongoError.create({ message: 'batchSize requires an integer', driver: true });
  }

  this.s.cmd.batchSize = value;
  this.setCursorBatchSize(value);
  return this;
};

/**
 * Set the collation options for the cursor.
 * @method
 * @param {object} value The cursor collation options (MongoDB 3.4 or higher) settings for update operation (see 3.4 documentation for available fields).
 * @throws {MongoError}
 * @return {Cursor}
 */
Cursor.prototype.collation = function(value) {
  this.s.cmd.collation = value;
  return this;
};

/**
 * Set the limit for the cursor.
 * @method
 * @param {number} value The limit for the cursor query.
 * @throws {MongoError}
 * @return {Cursor}
 */
Cursor.prototype.limit = function(value) {
  if (this.s.options.tailable) {
    throw MongoError.create({ message: "Tailable cursor doesn't support limit", driver: true });
  }

  if (this.s.state === Cursor.OPEN || this.s.state === Cursor.CLOSED || this.isDead()) {
    throw MongoError.create({ message: 'Cursor is closed', driver: true });
  }

  if (typeof value !== 'number') {
    throw MongoError.create({ message: 'limit requires an integer', driver: true });
  }

  this.s.cmd.limit = value;
  // this.cursorLimit = value;
  this.setCursorLimit(value);
  return this;
};

/**
 * Set the skip for the cursor.
 * @method
 * @param {number} value The skip for the cursor query.
 * @throws {MongoError}
 * @return {Cursor}
 */
Cursor.prototype.skip = function(value) {
  if (this.s.options.tailable) {
    throw MongoError.create({ message: "Tailable cursor doesn't support skip", driver: true });
  }

  if (this.s.state === Cursor.OPEN || this.s.state === Cursor.CLOSED || this.isDead()) {
    throw MongoError.create({ message: 'Cursor is closed', driver: true });
  }

  if (typeof value !== 'number') {
    throw MongoError.create({ message: 'skip requires an integer', driver: true });
  }

  this.s.cmd.skip = value;
  this.setCursorSkip(value);
  return this;
};

/**
 * The callback format for results
 * @callback Cursor~resultCallback
 * @param {MongoError} error An error instance representing the error during the execution.
 * @param {(object|null|boolean)} result The result object if the command was executed successfully.
 */

/**
 * Clone the cursor
 * @function external:CoreCursor#clone
 * @return {Cursor}
 */

/**
 * Resets the cursor
 * @function external:CoreCursor#rewind
 * @return {null}
 */

// Get the next available document from the cursor, returns null if no more documents are available.
var nextObject = function(self, callback) {
  if (self.s.state === Cursor.CLOSED || (self.isDead && self.isDead()))
    return handleCallback(
      callback,
      MongoError.create({ message: 'Cursor is closed', driver: true })
    );
  if (self.s.state === Cursor.INIT && self.s.cmd.sort) {
    try {
      self.s.cmd.sort = formattedOrderClause(self.s.cmd.sort);
    } catch (err) {
      return handleCallback(callback, err);
    }
  }

  // Get the next object
  self._next(function(err, doc) {
    self.s.state = Cursor.OPEN;
    if (err) return handleCallback(callback, err);
    handleCallback(callback, null, doc);
  });
};

// Trampoline emptying the number of retrieved items
// without incurring a nextTick operation
var loop = function(self, callback) {
  // No more items we are done
  if (self.bufferedCount() === 0) return;
  // Get the next document
  self._next(callback);
  // Loop
  return loop;
};

/**
 * Iterates over all the documents for this cursor. As with **{cursor.toArray}**,
 * not all of the elements will be iterated if this cursor had been previouly accessed.
 * In that case, **{cursor.rewind}** can be used to reset the cursor. However, unlike
 * **{cursor.toArray}**, the cursor will only hold a maximum of batch size elements
 * at any given time if batch size is specified. Otherwise, the caller is responsible
 * for making sure that the entire result can fit the memory.
 * @method
 * @deprecated
 * @param {Cursor~resultCallback} callback The result callback.
 * @throws {MongoError}
 * @return {null}
 */
Cursor.prototype.each = function(callback) {
  // Rewind cursor state
  this.rewind();
  // Set current cursor to INIT
  this.s.state = Cursor.INIT;
  // Run the query
  _each(this, callback);
};

// Run the each loop
var _each = function(self, callback) {
  if (!callback) throw MongoError.create({ message: 'callback is mandatory', driver: true });
  if (self.isNotified()) return;
  if (self.s.state === Cursor.CLOSED || self.isDead()) {
    return handleCallback(
      callback,
      MongoError.create({ message: 'Cursor is closed', driver: true })
    );
  }

  if (self.s.state === Cursor.INIT) self.s.state = Cursor.OPEN;

  // Define function to avoid global scope escape
  var fn = null;
  // Trampoline all the entries
  if (self.bufferedCount() > 0) {
    while ((fn = loop(self, callback))) fn(self, callback);
    _each(self, callback);
  } else {
    self.next(function(err, item) {
      if (err) return handleCallback(callback, err);
      if (item == null) {
        return self.close({ skipKillCursors: true }, () => handleCallback(callback, null, null));
      }

      if (handleCallback(callback, null, item) === false) return;
      _each(self, callback);
    });
  }
};

/**
 * The callback format for the forEach iterator method
 * @callback Cursor~iteratorCallback
 * @param {Object} doc An emitted document for the iterator
 */

/**
 * The callback error format for the forEach iterator method
 * @callback Cursor~endCallback
 * @param {MongoError} error An error instance representing the error during the execution.
 */

/**
 * Iterates over all the documents for this cursor using the iterator, callback pattern.
 * @method
 * @param {Cursor~iteratorCallback} iterator The iteration callback.
 * @param {Cursor~endCallback} callback The end callback.
 * @throws {MongoError}
 * @return {null}
 */
Cursor.prototype.forEach = function(iterator, callback) {
  this.each(function(err, doc) {
    if (err) {
      callback(err);
      return false;
    }
    if (doc != null) {
      iterator(doc);
      return true;
    }
    if (doc == null && callback) {
      var internalCallback = callback;
      callback = null;
      internalCallback(null);
      return false;
    }
  });
};

/**
 * Set the ReadPreference for the cursor.
 * @method
 * @param {(string|ReadPreference)} readPreference The new read preference for the cursor.
 * @throws {MongoError}
 * @return {Cursor}
 */
Cursor.prototype.setReadPreference = function(readPreference) {
  if (this.s.state !== Cursor.INIT) {
    throw MongoError.create({
      message: 'cannot change cursor readPreference after cursor has been accessed',
      driver: true
    });
  }

  if (readPreference instanceof ReadPreference) {
    this.s.options.readPreference = readPreference;
  } else if (typeof readPreference === 'string') {
    this.s.options.readPreference = new ReadPreference(readPreference);
  } else {
    throw new TypeError('Invalid read preference: ' + readPreference);
  }

  return this;
};

/**
 * The callback format for results
 * @callback Cursor~toArrayResultCallback
 * @param {MongoError} error An error instance representing the error during the execution.
 * @param {object[]} documents All the documents the satisfy the cursor.
 */

/**
 * Returns an array of documents. The caller is responsible for making sure that there
 * is enough memory to store the results. Note that the array only contain partial
 * results when this cursor had been previouly accessed. In that case,
 * cursor.rewind() can be used to reset the cursor.
 * @method
 * @param {Cursor~toArrayResultCallback} [callback] The result callback.
 * @throws {MongoError}
 * @return {Promise} returns Promise if no callback passed
 */
Cursor.prototype.toArray = function(callback) {
  var self = this;
  if (self.s.options.tailable) {
    throw MongoError.create({
      message: 'Tailable cursor cannot be converted to array',
      driver: true
    });
  }

  return executeOperation(this.s.topology, toArray, [this, callback], {
    skipSessions: true
  });
};

var toArray = function(self, callback) {
  var items = [];

  // Reset cursor
  self.rewind();
  self.s.state = Cursor.INIT;

  // Fetch all the documents
  var fetchDocs = function() {
    self._next(function(err, doc) {
      if (err) {
        return self._endSession
          ? self._endSession(() => handleCallback(callback, err))
          : handleCallback(callback, err);
      }
      if (doc == null) {
        return self.close({ skipKillCursors: true }, () => handleCallback(callback, null, items));
      }

      // Add doc to items
      items.push(doc);

      // Get all buffered objects
      if (self.bufferedCount() > 0) {
        var docs = self.readBufferedDocuments(self.bufferedCount());

        // Transform the doc if transform method added
        if (self.s.transforms && typeof self.s.transforms.doc === 'function') {
          docs = docs.map(self.s.transforms.doc);
        }

        push.apply(items, docs);
      }

      // Attempt a fetch
      fetchDocs();
    });
  };

  fetchDocs();
};

/**
 * The callback format for results
 * @callback Cursor~countResultCallback
 * @param {MongoError} error An error instance representing the error during the execution.
 * @param {number} count The count of documents.
 */

/**
 * Get the count of documents for this cursor
 * @method
 * @param {boolean} [applySkipLimit=true] Should the count command apply limit and skip settings on the cursor or in the passed in options.
 * @param {object} [options=null] Optional settings.
 * @param {number} [options.skip=null] The number of documents to skip.
 * @param {number} [options.limit=null] The maximum amounts to count before aborting.
 * @param {number} [options.maxTimeMS=null] Number of miliseconds to wait before aborting the query.
 * @param {string} [options.hint=null] An index name hint for the query.
 * @param {(ReadPreference|string)} [options.readPreference=null] The preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
 * @param {Cursor~countResultCallback} [callback] The result callback.
 * @return {Promise} returns Promise if no callback passed
 */
Cursor.prototype.count = function(applySkipLimit, opts, callback) {
  if (this.s.cmd.query == null)
    throw MongoError.create({ message: 'count can only be used with find command', driver: true });
  if (typeof opts === 'function') (callback = opts), (opts = {});
  opts = opts || {};

  if (typeof applySkipLimit === 'function') {
    callback = applySkipLimit;
    applySkipLimit = true;
  }

  if (this.s.session) {
    opts = Object.assign({}, opts, { session: this.s.session });
  }

  return executeOperation(this.s.topology, count, [this, applySkipLimit, opts, callback], {
    skipSessions: !!this.s.session
  });
};

var count = function(self, applySkipLimit, opts, callback) {
  if (applySkipLimit) {
    if (typeof self.cursorSkip() === 'number') opts.skip = self.cursorSkip();
    if (typeof self.cursorLimit() === 'number') opts.limit = self.cursorLimit();
  }

  // Command
  var delimiter = self.s.ns.indexOf('.');

  var command = {
    count: self.s.ns.substr(delimiter + 1),
    query: self.s.cmd.query
  };

  // Apply a readConcern if set
  if (self.s.cmd.readConcern) {
    command.readConcern = self.s.cmd.readConcern;
  }

  // Apply a hint if set
  if (self.s.cmd.hint) {
    command.hint = self.s.cmd.hint;
  }

  if (typeof opts.maxTimeMS === 'number') {
    command.maxTimeMS = opts.maxTimeMS;
  } else if (self.s.cmd && typeof self.s.cmd.maxTimeMS === 'number') {
    command.maxTimeMS = self.s.cmd.maxTimeMS;
  }

  // Merge in any options
  if (opts.skip) command.skip = opts.skip;
  if (opts.limit) command.limit = opts.limit;
  if (self.s.options.hint) command.hint = self.s.options.hint;

  // Set cursor server to the same as the topology
  self.server = self.topology.s.coreTopology;

  // Execute the command
  self.s.topology.command(
    f('%s.$cmd', self.s.ns.substr(0, delimiter)),
    command,
    function(err, result) {
      callback(err, result ? result.result.n : null);
    },
    self.options
  );
};

/**
 * Close the cursor, sending a KillCursor command and emitting close.
 * @method
 * @param {object} [options] Optional settings.
 * @param {boolean} [options.skipKillCursors] Bypass calling killCursors when closing the cursor.
 * @param {Cursor~resultCallback} [callback] The result callback.
 * @return {Promise} returns Promise if no callback passed
 */
Cursor.prototype.close = function(options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = Object.assign({}, { skipKillCursors: false }, options);

  this.s.state = Cursor.CLOSED;
  if (!options.skipKillCursors) {
    // Kill the cursor
    this.kill();
  }

  const completeClose = () => {
    // Emit the close event for the cursor
    this.emit('close');

    // Callback if provided
    if (typeof callback === 'function') {
      return handleCallback(callback, null, this);
    }

    // Return a Promise
    return new this.s.promiseLibrary(function(resolve) {
      resolve();
    });
  };

  if (this.s.session) {
    return this._endSession(() => completeClose());
  }

  return completeClose();
};

/**
 * Map all documents using the provided function
 * @method
 * @param {function} [transform] The mapping transformation method.
 * @return {Cursor}
 */
Cursor.prototype.map = function(transform) {
  if (this.cursorState.transforms && this.cursorState.transforms.doc) {
    var oldTransform = this.cursorState.transforms.doc;
    this.cursorState.transforms.doc = function(doc) {
      return transform(oldTransform(doc));
    };
  } else {
    this.cursorState.transforms = { doc: transform };
  }
  return this;
};

/**
 * Is the cursor closed
 * @method
 * @return {boolean}
 */
Cursor.prototype.isClosed = function() {
  return this.isDead();
};

Cursor.prototype.destroy = function(err) {
  if (err) this.emit('error', err);
  this.pause();
  this.close();
};

/**
 * Return a modified Readable stream including a possible transform method.
 * @method
 * @param {object} [options=null] Optional settings.
 * @param {function} [options.transform=null] A transformation method applied to each document emitted by the stream.
 * @return {Cursor}
 */
Cursor.prototype.stream = function(options) {
  this.s.streamOptions = options || {};
  return this;
};

/**
 * Execute the explain for the cursor
 * @method
 * @param {Cursor~resultCallback} [callback] The result callback.
 * @return {Promise} returns Promise if no callback passed
 */
Cursor.prototype.explain = function(callback) {
  this.s.cmd.explain = true;

  // Do we have a readConcern
  if (this.s.cmd.readConcern) {
    delete this.s.cmd['readConcern'];
  }

  return executeOperation(this.s.topology, this._next.bind(this), [callback], {
    skipSessions: true
  });
};

Cursor.prototype._read = function() {
  var self = this;
  if (self.s.state === Cursor.CLOSED || self.isDead()) {
    return self.push(null);
  }

  // Get the next item
  self.next(function(err, result) {
    if (err) {
      if (self.listeners('error') && self.listeners('error').length > 0) {
        self.emit('error', err);
      }
      if (!self.isDead()) self.close();

      // Emit end event
      self.emit('end');
      return self.emit('finish');
    }

    // If we provided a transformation method
    if (typeof self.s.streamOptions.transform === 'function' && result != null) {
      return self.push(self.s.streamOptions.transform(result));
    }

    // If we provided a map function
    if (
      self.cursorState.transforms &&
      typeof self.cursorState.transforms.doc === 'function' &&
      result != null
    ) {
      return self.push(self.cursorState.transforms.doc(result));
    }

    // Return the result
    self.push(result);

    if (result === null && self.isDead()) {
      self.once('end', () => {
        self.close();
        self.emit('finish');
      });
    }
  });
};

Object.defineProperty(Cursor.prototype, 'readPreference', {
  enumerable: true,
  get: function() {
    if (!this || !this.s) {
      return null;
    }

    return this.s.options.readPreference;
  }
});

Object.defineProperty(Cursor.prototype, 'namespace', {
  enumerable: true,
  get: function() {
    if (!this || !this.s) {
      return null;
    }

    // TODO: refactor this logic into core
    var ns = this.s.ns || '';
    var firstDot = ns.indexOf('.');
    if (firstDot < 0) {
      return {
        database: this.s.ns,
        collection: ''
      };
    }
    return {
      database: ns.substr(0, firstDot),
      collection: ns.substr(firstDot + 1)
    };
  }
});

/**
 * The read() method pulls some data out of the internal buffer and returns it. If there is no data available, then it will return null.
 * @function external:Readable#read
 * @param {number} size Optional argument to specify how much data to read.
 * @return {(String | Buffer | null)}
 */

/**
 * Call this function to cause the stream to return strings of the specified encoding instead of Buffer objects.
 * @function external:Readable#setEncoding
 * @param {string} encoding The encoding to use.
 * @return {null}
 */

/**
 * This method will cause the readable stream to resume emitting data events.
 * @function external:Readable#resume
 * @return {null}
 */

/**
 * This method will cause a stream in flowing-mode to stop emitting data events. Any data that becomes available will remain in the internal buffer.
 * @function external:Readable#pause
 * @return {null}
 */

/**
 * This method pulls all the data out of a readable stream, and writes it to the supplied destination, automatically managing the flow so that the destination is not overwhelmed by a fast readable stream.
 * @function external:Readable#pipe
 * @param {Writable} destination The destination for writing data
 * @param {object} [options] Pipe options
 * @return {null}
 */

/**
 * This method will remove the hooks set up for a previous pipe() call.
 * @function external:Readable#unpipe
 * @param {Writable} [destination] The destination for writing data
 * @return {null}
 */

/**
 * This is useful in certain cases where a stream is being consumed by a parser, which needs to "un-consume" some data that it has optimistically pulled out of the source, so that the stream can be passed on to some other party.
 * @function external:Readable#unshift
 * @param {(Buffer|string)} chunk Chunk of data to unshift onto the read queue.
 * @return {null}
 */

/**
 * Versions of Node prior to v0.10 had streams that did not implement the entire Streams API as it is today. (See "Compatibility" below for more information.)
 * @function external:Readable#wrap
 * @param {Stream} stream An "old style" readable stream.
 * @return {null}
 */

Cursor.INIT = 0;
Cursor.OPEN = 1;
Cursor.CLOSED = 2;
Cursor.GET_MORE = 3;

module.exports = Cursor;
