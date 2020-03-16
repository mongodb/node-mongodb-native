'use strict';

const Transform = require('stream').Transform;
const PassThrough = require('stream').PassThrough;
const deprecate = require('util').deprecate;
const handleCallback = require('./utils').handleCallback;
const ReadPreference = require('./core').ReadPreference;
const MongoError = require('./core').MongoError;
const CoreCursor = require('./core/cursor').CoreCursor;
const CursorState = require('./core/cursor').CursorState;
const Map = require('./core').BSON.Map;
const maybePromise = require('./utils').maybePromise;
const executeOperation = require('./operations/execute_operation');
const formattedOrderClause = require('./utils').formattedOrderClause;

const each = require('./operations/cursor_ops').each;
const CountOperation = require('./operations/count');

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
 * Namespace provided by the code module
 * @external CoreCursor
 * @external Readable
 */

// Flags allowed for cursor
const flags = ['tailable', 'oplogReplay', 'noCursorTimeout', 'awaitData', 'exhaust', 'partial'];
const fields = ['numberOfRetries', 'tailableRetryInterval'];

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
 * collection.find({}).returnKey(true)                            // Set the cursor returnKey
 * collection.find({}).setReadPreference(ReadPreference.PRIMARY)  // Set the cursor readPreference
 * collection.find({}).showRecordId(true)                         // Set the cursor showRecordId
 * collection.find({}).sort([['a', 1]])                           // Sets the sort order of the cursor query
 * collection.find({}).hint('a_1')                                // Set the cursor hint
 *
 * All options are chainable, so one can do the following.
 *
 * collection.find({}).maxTimeMS(1000).maxScan(100).skip(1).toArray(..)
 */
class Cursor extends CoreCursor {
  constructor(topology, ns, cmd, options) {
    super(topology, ns, cmd, options);
    if (this.operation) {
      options = this.operation.options;
    }

    // Tailable cursor options
    const numberOfRetries = options.numberOfRetries || 5;
    const tailableRetryInterval = options.tailableRetryInterval || 500;
    const currentNumberOfRetries = numberOfRetries;

    // Get the promiseLibrary
    const promiseLibrary = options.promiseLibrary || Promise;

    // Internal cursor state
    this.s = {
      // Tailable cursor options
      numberOfRetries: numberOfRetries,
      tailableRetryInterval: tailableRetryInterval,
      currentNumberOfRetries: currentNumberOfRetries,
      // State
      state: CursorState.INIT,
      // Promise library
      promiseLibrary,
      // explicitlyIgnoreSession
      explicitlyIgnoreSession: !!options.explicitlyIgnoreSession
    };

    // Optional ClientSession
    if (!options.explicitlyIgnoreSession && options.session) {
      this.cursorState.session = options.session;
    }

    // Translate correctly
    if (this.options.noCursorTimeout === true) {
      this.addCursorFlag('noCursorTimeout', true);
    }

    // Get the batchSize
    let batchSize = 1000;
    if (this.cmd.cursor && this.cmd.cursor.batchSize) {
      batchSize = this.cmd.cursor.batchSize;
    } else if (options.cursor && options.cursor.batchSize) {
      batchSize = options.cursor.batchSize;
    } else if (typeof options.batchSize === 'number') {
      batchSize = options.batchSize;
    }

    // Set the batchSize
    this.setCursorBatchSize(batchSize);
  }

  get readPreference() {
    if (this.operation) {
      return this.operation.readPreference;
    }

    return this.options.readPreference;
  }

  get sortValue() {
    return this.cmd.sort;
  }

  _initializeCursor(callback) {
    if (this.operation && this.operation.session != null) {
      this.cursorState.session = this.operation.session;
    } else {
      // implicitly create a session if one has not been provided
      if (
        !this.s.explicitlyIgnoreSession &&
        !this.cursorState.session &&
        this.topology.hasSessionSupport()
      ) {
        this.cursorState.session = this.topology.startSession({ owner: this });

        if (this.operation) {
          this.operation.session = this.cursorState.session;
        }
      }
    }

    super._initializeCursor(callback);
  }

  /**
   * Check if there is any document still available in the cursor
   * @method
   * @param {Cursor~resultCallback} [callback] The result callback.
   * @throws {MongoError}
   * @return {Promise} returns Promise if no callback passed
   */
  hasNext(callback) {
    if (this.s.state === CursorState.CLOSED || (this.isDead && this.isDead())) {
      throw MongoError.create({ message: 'Cursor is closed', driver: true });
    }

    return maybePromise(this, callback, cb => {
      const cursor = this;
      if (cursor.isNotified()) {
        return cb(null, false);
      }

      cursor._next((err, doc) => {
        if (err) return cb(err);
        if (doc == null || cursor.s.state === Cursor.CLOSED || cursor.isDead()) {
          return cb(null, false);
        }

        cursor.s.state = CursorState.OPEN;

        // NODE-2482: merge this into the core cursor implementation
        cursor.cursorState.cursorIndex--;
        if (cursor.cursorState.limit > 0) {
          cursor.cursorState.currentLimit--;
        }

        cb(null, true);
      });
    });
  }

  /**
   * Get the next available document from the cursor, returns null if no more documents are available.
   * @method
   * @param {Cursor~resultCallback} [callback] The result callback.
   * @throws {MongoError}
   * @return {Promise} returns Promise if no callback passed
   */
  next(callback) {
    return maybePromise(this, callback, cb => {
      const cursor = this;
      if (cursor.s.state === CursorState.CLOSED || (cursor.isDead && cursor.isDead())) {
        cb(MongoError.create({ message: 'Cursor is closed', driver: true }));
        return;
      }

      if (cursor.s.state === CursorState.INIT && cursor.cmd.sort) {
        try {
          cursor.cmd.sort = formattedOrderClause(cursor.cmd.sort);
        } catch (err) {
          return cb(err);
        }
      }

      cursor._next((err, doc) => {
        if (err) return cb(err);
        cursor.s.state = CursorState.OPEN;
        cb(null, doc);
      });
    });
  }

  /**
   * Set the cursor query
   * @method
   * @param {object} filter The filter object used for the cursor.
   * @return {Cursor}
   */
  filter(filter) {
    if (this.s.state === CursorState.CLOSED || this.s.state === CursorState.OPEN || this.isDead()) {
      throw MongoError.create({ message: 'Cursor is closed', driver: true });
    }

    this.cmd.query = filter;
    return this;
  }

  /**
   * Set the cursor maxScan
   * @method
   * @param {object} maxScan Constrains the query to only scan the specified number of documents when fulfilling the query
   * @deprecated as of MongoDB 4.0
   * @return {Cursor}
   */
  maxScan(maxScan) {
    if (this.s.state === CursorState.CLOSED || this.s.state === CursorState.OPEN || this.isDead()) {
      throw MongoError.create({ message: 'Cursor is closed', driver: true });
    }

    this.cmd.maxScan = maxScan;
    return this;
  }

  /**
   * Set the cursor hint
   * @method
   * @param {object} hint If specified, then the query system will only consider plans using the hinted index.
   * @return {Cursor}
   */
  hint(hint) {
    if (this.s.state === CursorState.CLOSED || this.s.state === CursorState.OPEN || this.isDead()) {
      throw MongoError.create({ message: 'Cursor is closed', driver: true });
    }

    this.cmd.hint = hint;
    return this;
  }

  /**
   * Set the cursor min
   * @method
   * @param {object} min Specify a $min value to specify the inclusive lower bound for a specific index in order to constrain the results of find(). The $min specifies the lower bound for all keys of a specific index in order.
   * @return {Cursor}
   */
  min(min) {
    if (this.s.state === CursorState.CLOSED || this.s.state === CursorState.OPEN || this.isDead()) {
      throw MongoError.create({ message: 'Cursor is closed', driver: true });
    }

    this.cmd.min = min;
    return this;
  }

  /**
   * Set the cursor max
   * @method
   * @param {object} max Specify a $max value to specify the exclusive upper bound for a specific index in order to constrain the results of find(). The $max specifies the upper bound for all keys of a specific index in order.
   * @return {Cursor}
   */
  max(max) {
    if (this.s.state === CursorState.CLOSED || this.s.state === CursorState.OPEN || this.isDead()) {
      throw MongoError.create({ message: 'Cursor is closed', driver: true });
    }

    this.cmd.max = max;
    return this;
  }

  /**
   * Set the cursor returnKey. If set to true, modifies the cursor to only return the index field or fields for the results of the query, rather than documents. If set to true and the query does not use an index to perform the read operation, the returned documents will not contain any fields.
   * @method
   * @param {bool} returnKey the returnKey value.
   * @return {Cursor}
   */
  returnKey(value) {
    if (this.s.state === CursorState.CLOSED || this.s.state === CursorState.OPEN || this.isDead()) {
      throw MongoError.create({ message: 'Cursor is closed', driver: true });
    }

    this.cmd.returnKey = value;
    return this;
  }

  /**
   * Set the cursor showRecordId
   * @method
   * @param {object} showRecordId The $showDiskLoc option has now been deprecated and replaced with the showRecordId field. $showDiskLoc will still be accepted for OP_QUERY stye find.
   * @return {Cursor}
   */
  showRecordId(value) {
    if (this.s.state === CursorState.CLOSED || this.s.state === CursorState.OPEN || this.isDead()) {
      throw MongoError.create({ message: 'Cursor is closed', driver: true });
    }

    this.cmd.showDiskLoc = value;
    return this;
  }

  /**
   * Set the cursor snapshot
   * @method
   * @param {object} snapshot The $snapshot operator prevents the cursor from returning a document more than once because an intervening write operation results in a move of the document.
   * @deprecated as of MongoDB 4.0
   * @return {Cursor}
   */
  snapshot(value) {
    if (this.s.state === CursorState.CLOSED || this.s.state === CursorState.OPEN || this.isDead()) {
      throw MongoError.create({ message: 'Cursor is closed', driver: true });
    }

    this.cmd.snapshot = value;
    return this;
  }

  /**
   * Set a node.js specific cursor option
   * @method
   * @param {string} field The cursor option to set ['numberOfRetries', 'tailableRetryInterval'].
   * @param {object} value The field value.
   * @throws {MongoError}
   * @return {Cursor}
   */
  setCursorOption(field, value) {
    if (this.s.state === CursorState.CLOSED || this.s.state === CursorState.OPEN || this.isDead()) {
      throw MongoError.create({ message: 'Cursor is closed', driver: true });
    }

    if (fields.indexOf(field) === -1) {
      throw MongoError.create({
        message: `option ${field} is not a supported option ${fields}`,
        driver: true
      });
    }

    this.s[field] = value;
    if (field === 'numberOfRetries') this.s.currentNumberOfRetries = value;
    return this;
  }

  /**
   * Add a cursor flag to the cursor
   * @method
   * @param {string} flag The flag to set, must be one of following ['tailable', 'oplogReplay', 'noCursorTimeout', 'awaitData', 'partial'].
   * @param {boolean} value The flag boolean value.
   * @throws {MongoError}
   * @return {Cursor}
   */
  addCursorFlag(flag, value) {
    if (this.s.state === CursorState.CLOSED || this.s.state === CursorState.OPEN || this.isDead()) {
      throw MongoError.create({ message: 'Cursor is closed', driver: true });
    }

    if (flags.indexOf(flag) === -1) {
      throw MongoError.create({
        message: `flag ${flag} is not a supported flag ${flags}`,
        driver: true
      });
    }

    if (typeof value !== 'boolean') {
      throw MongoError.create({ message: `flag ${flag} must be a boolean value`, driver: true });
    }

    this.cmd[flag] = value;
    return this;
  }

  /**
   * Add a query modifier to the cursor query
   * @method
   * @param {string} name The query modifier (must start with $, such as $orderby etc)
   * @param {string|boolean|number} value The modifier value.
   * @throws {MongoError}
   * @return {Cursor}
   */
  addQueryModifier(name, value) {
    if (this.s.state === CursorState.CLOSED || this.s.state === CursorState.OPEN || this.isDead()) {
      throw MongoError.create({ message: 'Cursor is closed', driver: true });
    }

    if (name[0] !== '$') {
      throw MongoError.create({ message: `${name} is not a valid query modifier`, driver: true });
    }

    // Strip of the $
    const field = name.substr(1);
    // Set on the command
    this.cmd[field] = value;
    // Deal with the special case for sort
    if (field === 'orderby') this.cmd.sort = this.cmd[field];
    return this;
  }

  /**
   * Add a comment to the cursor query allowing for tracking the comment in the log.
   * @method
   * @param {string} value The comment attached to this query.
   * @throws {MongoError}
   * @return {Cursor}
   */
  comment(value) {
    if (this.s.state === CursorState.CLOSED || this.s.state === CursorState.OPEN || this.isDead()) {
      throw MongoError.create({ message: 'Cursor is closed', driver: true });
    }

    this.cmd.comment = value;
    return this;
  }

  /**
   * Set a maxAwaitTimeMS on a tailing cursor query to allow to customize the timeout value for the option awaitData (Only supported on MongoDB 3.2 or higher, ignored otherwise)
   * @method
   * @param {number} value Number of milliseconds to wait before aborting the tailed query.
   * @throws {MongoError}
   * @return {Cursor}
   */
  maxAwaitTimeMS(value) {
    if (typeof value !== 'number') {
      throw MongoError.create({ message: 'maxAwaitTimeMS must be a number', driver: true });
    }

    if (this.s.state === CursorState.CLOSED || this.s.state === CursorState.OPEN || this.isDead()) {
      throw MongoError.create({ message: 'Cursor is closed', driver: true });
    }

    this.cmd.maxAwaitTimeMS = value;
    return this;
  }

  /**
   * Set a maxTimeMS on the cursor query, allowing for hard timeout limits on queries (Only supported on MongoDB 2.6 or higher)
   * @method
   * @param {number} value Number of milliseconds to wait before aborting the query.
   * @throws {MongoError}
   * @return {Cursor}
   */
  maxTimeMS(value) {
    if (typeof value !== 'number') {
      throw MongoError.create({ message: 'maxTimeMS must be a number', driver: true });
    }

    if (this.s.state === CursorState.CLOSED || this.s.state === CursorState.OPEN || this.isDead()) {
      throw MongoError.create({ message: 'Cursor is closed', driver: true });
    }

    this.cmd.maxTimeMS = value;
    return this;
  }

  /**
   * Sets a field projection for the query.
   * @method
   * @param {object} value The field projection object.
   * @throws {MongoError}
   * @return {Cursor}
   */
  project(value) {
    if (this.s.state === CursorState.CLOSED || this.s.state === CursorState.OPEN || this.isDead()) {
      throw MongoError.create({ message: 'Cursor is closed', driver: true });
    }

    this.cmd.fields = value;
    return this;
  }

  /**
   * Sets the sort order of the cursor query.
   * @method
   * @param {(string|array|object)} keyOrList The key or keys set for the sort.
   * @param {number} [direction] The direction of the sorting (1 or -1).
   * @throws {MongoError}
   * @return {Cursor}
   */
  sort(keyOrList, direction) {
    if (this.options.tailable) {
      throw MongoError.create({ message: "Tailable cursor doesn't support sorting", driver: true });
    }

    if (this.s.state === CursorState.CLOSED || this.s.state === CursorState.OPEN || this.isDead()) {
      throw MongoError.create({ message: 'Cursor is closed', driver: true });
    }

    let order = keyOrList;

    // We have an array of arrays, we need to preserve the order of the sort
    // so we will us a Map
    if (Array.isArray(order) && Array.isArray(order[0])) {
      order = new Map(
        order.map(x => {
          const value = [x[0], null];
          if (x[1] === 'asc') {
            value[1] = 1;
          } else if (x[1] === 'desc') {
            value[1] = -1;
          } else if (x[1] === 1 || x[1] === -1 || x[1].$meta) {
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

    this.cmd.sort = order;
    return this;
  }

  /**
   * Set the batch size for the cursor.
   * @method
   * @param {number} value The number of documents to return per batch. See {@link https://docs.mongodb.com/manual/reference/command/find/|find command documentation}.
   * @throws {MongoError}
   * @return {Cursor}
   */
  batchSize(value) {
    if (this.options.tailable) {
      throw MongoError.create({
        message: "Tailable cursor doesn't support batchSize",
        driver: true
      });
    }

    if (this.s.state === CursorState.CLOSED || this.isDead()) {
      throw MongoError.create({ message: 'Cursor is closed', driver: true });
    }

    if (typeof value !== 'number') {
      throw MongoError.create({ message: 'batchSize requires an integer', driver: true });
    }

    this.cmd.batchSize = value;
    this.setCursorBatchSize(value);
    return this;
  }

  /**
   * Set the collation options for the cursor.
   * @method
   * @param {object} value The cursor collation options (MongoDB 3.4 or higher) settings for update operation (see 3.4 documentation for available fields).
   * @throws {MongoError}
   * @return {Cursor}
   */
  collation(value) {
    this.cmd.collation = value;
    return this;
  }

  /**
   * Set the limit for the cursor.
   * @method
   * @param {number} value The limit for the cursor query.
   * @throws {MongoError}
   * @return {Cursor}
   */
  limit(value) {
    if (this.options.tailable) {
      throw MongoError.create({ message: "Tailable cursor doesn't support limit", driver: true });
    }

    if (this.s.state === CursorState.OPEN || this.s.state === CursorState.CLOSED || this.isDead()) {
      throw MongoError.create({ message: 'Cursor is closed', driver: true });
    }

    if (typeof value !== 'number') {
      throw MongoError.create({ message: 'limit requires an integer', driver: true });
    }

    this.cmd.limit = value;
    this.setCursorLimit(value);
    return this;
  }

  /**
   * Set the skip for the cursor.
   * @method
   * @param {number} value The skip for the cursor query.
   * @throws {MongoError}
   * @return {Cursor}
   */
  skip(value) {
    if (this.options.tailable) {
      throw MongoError.create({ message: "Tailable cursor doesn't support skip", driver: true });
    }

    if (this.s.state === CursorState.OPEN || this.s.state === CursorState.CLOSED || this.isDead()) {
      throw MongoError.create({ message: 'Cursor is closed', driver: true });
    }

    if (typeof value !== 'number') {
      throw MongoError.create({ message: 'skip requires an integer', driver: true });
    }

    this.cmd.skip = value;
    this.setCursorSkip(value);
    return this;
  }

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

  /**
   * Iterates over all the documents for this cursor. As with **{cursor.toArray}**,
   * not all of the elements will be iterated if this cursor had been previously accessed.
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
  each(callback) {
    // Rewind cursor state
    this.rewind();
    // Set current cursor to INIT
    this.s.state = CursorState.INIT;
    // Run the query
    each(this, callback);
  }

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
   * @return {Promise} if no callback supplied
   */
  forEach(iterator, callback) {
    // Rewind cursor state
    this.rewind();

    // Set current cursor to INIT
    this.s.state = CursorState.INIT;

    if (typeof callback === 'function') {
      each(this, (err, doc) => {
        if (err) {
          callback(err);
          return false;
        }
        if (doc != null) {
          iterator(doc);
          return true;
        }
        if (doc == null && callback) {
          const internalCallback = callback;
          callback = null;
          internalCallback(null);
          return false;
        }
      });
    } else {
      return new this.s.promiseLibrary((fulfill, reject) => {
        each(this, (err, doc) => {
          if (err) {
            reject(err);
            return false;
          } else if (doc == null) {
            fulfill(null);
            return false;
          } else {
            iterator(doc);
            return true;
          }
        });
      });
    }
  }

  /**
   * Set the ReadPreference for the cursor.
   * @method
   * @param {(string|ReadPreference)} readPreference The new read preference for the cursor.
   * @throws {MongoError}
   * @return {Cursor}
   */
  setReadPreference(readPreference) {
    if (this.s.state !== CursorState.INIT) {
      throw MongoError.create({
        message: 'cannot change cursor readPreference after cursor has been accessed',
        driver: true
      });
    }

    if (readPreference instanceof ReadPreference) {
      this.options.readPreference = readPreference;
    } else if (typeof readPreference === 'string') {
      this.options.readPreference = new ReadPreference(readPreference);
    } else {
      throw new TypeError('Invalid read preference: ' + readPreference);
    }

    return this;
  }

  /**
   * The callback format for results
   * @callback Cursor~toArrayResultCallback
   * @param {MongoError} error An error instance representing the error during the execution.
   * @param {object[]} documents All the documents the satisfy the cursor.
   */

  /**
   * Returns an array of documents. The caller is responsible for making sure that there
   * is enough memory to store the results. Note that the array only contains partial
   * results when this cursor had been previously accessed. In that case,
   * cursor.rewind() can be used to reset the cursor.
   * @method
   * @param {Cursor~toArrayResultCallback} [callback] The result callback.
   * @throws {MongoError}
   * @return {Promise} returns Promise if no callback passed
   */
  toArray(callback) {
    if (this.options.tailable) {
      throw MongoError.create({
        message: 'Tailable cursor cannot be converted to array',
        driver: true
      });
    }

    return maybePromise(this, callback, cb => {
      const cursor = this;
      const items = [];

      // Reset cursor
      cursor.rewind();
      cursor.s.state = CursorState.INIT;

      // Fetch all the documents
      const fetchDocs = () => {
        cursor._next((err, doc) => {
          if (err) {
            return cursor._endSession
              ? cursor._endSession(() => handleCallback(cb, err))
              : handleCallback(cb, err);
          }

          if (doc == null) {
            return cursor.close({ skipKillCursors: true }, () => handleCallback(cb, null, items));
          }

          // Add doc to items
          items.push(doc);

          // Get all buffered objects
          if (cursor.bufferedCount() > 0) {
            let docs = cursor.readBufferedDocuments(cursor.bufferedCount());
            Array.prototype.push.apply(items, docs);
          }

          // Attempt a fetch
          fetchDocs();
        });
      };

      fetchDocs();
    });
  }

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
   * @param {object} [options] Optional settings.
   * @param {number} [options.skip] The number of documents to skip.
   * @param {number} [options.limit] The maximum amounts to count before aborting.
   * @param {number} [options.maxTimeMS] Number of milliseconds to wait before aborting the query.
   * @param {string} [options.hint] An index name hint for the query.
   * @param {(ReadPreference|string)} [options.readPreference] The preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
   * @param {Cursor~countResultCallback} [callback] The result callback.
   * @return {Promise} returns Promise if no callback passed
   */
  count(applySkipLimit, opts, callback) {
    if (this.cmd.query == null)
      throw MongoError.create({
        message: 'count can only be used with find command',
        driver: true
      });
    if (typeof opts === 'function') (callback = opts), (opts = {});
    opts = opts || {};

    if (typeof applySkipLimit === 'function') {
      callback = applySkipLimit;
      applySkipLimit = true;
    }

    if (this.cursorState.session) {
      opts = Object.assign({}, opts, { session: this.cursorState.session });
    }

    const countOperation = new CountOperation(this, applySkipLimit, opts);

    return executeOperation(this.topology, countOperation, callback);
  }

  /**
   * Close the cursor, sending a KillCursor command and emitting close.
   * @method
   * @param {object} [options] Optional settings.
   * @param {boolean} [options.skipKillCursors] Bypass calling killCursors when closing the cursor.
   * @param {Cursor~resultCallback} [callback] The result callback.
   * @return {Promise} returns Promise if no callback passed
   */
  close(options, callback) {
    if (typeof options === 'function') (callback = options), (options = {});
    options = Object.assign({}, { skipKillCursors: false }, options);

    this.s.state = CursorState.CLOSED;
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
      return new this.s.promiseLibrary(resolve => {
        resolve();
      });
    };

    if (this.cursorState.session) {
      if (typeof callback === 'function') {
        return this._endSession(() => completeClose());
      }

      return new this.s.promiseLibrary(resolve => {
        this._endSession(() => completeClose().then(resolve));
      });
    }

    return completeClose();
  }

  /**
   * Map all documents using the provided function
   * @method
   * @param {function} [transform] The mapping transformation method.
   * @return {Cursor}
   */
  map(transform) {
    if (this.cursorState.transforms && this.cursorState.transforms.doc) {
      const oldTransform = this.cursorState.transforms.doc;
      this.cursorState.transforms.doc = doc => {
        return transform(oldTransform(doc));
      };
    } else {
      this.cursorState.transforms = { doc: transform };
    }

    return this;
  }

  /**
   * Is the cursor closed
   * @method
   * @return {boolean}
   */
  isClosed() {
    return this.isDead();
  }

  destroy(err) {
    if (err) this.emit('error', err);
    this.pause();
    this.close();
  }

  /**
   * Return a modified Readable stream including a possible transform method.
   * @method
   * @param {object} [options] Optional settings.
   * @param {function} [options.transform] A transformation method applied to each document emitted by the stream.
   * @return {Cursor}
   * TODO: replace this method with transformStream in next major release
   */
  stream(options) {
    this.cursorState.streamOptions = options || {};
    return this;
  }

  /**
   * Return a modified Readable stream that applies a given transform function, if supplied. If none supplied,
   * returns a stream of unmodified docs.
   * @method
   * @param {object} [options] Optional settings.
   * @param {function} [options.transform] A transformation method applied to each document emitted by the stream.
   * @return {stream}
   */
  transformStream(options) {
    const streamOptions = options || {};
    if (typeof streamOptions.transform === 'function') {
      const stream = new Transform({
        objectMode: true,
        transform: function(chunk, encoding, callback) {
          this.push(streamOptions.transform(chunk));
          callback();
        }
      });

      return this.pipe(stream);
    }

    return this.pipe(new PassThrough({ objectMode: true }));
  }

  /**
   * Execute the explain for the cursor
   * @method
   * @param {Cursor~resultCallback} [callback] The result callback.
   * @return {Promise} returns Promise if no callback passed
   */
  explain(callback) {
    // NOTE: the next line includes a special case for operations which do not
    //       subclass `CommandOperationV2`. To be removed asap.
    if (this.operation && this.operation.cmd == null) {
      this.operation.options.explain = true;
      this.operation.fullResponse = false;
      return executeOperation(this.topology, this.operation, callback);
    }

    this.cmd.explain = true;

    // Do we have a readConcern
    if (this.cmd.readConcern) {
      delete this.cmd['readConcern'];
    }
    return maybePromise(this, callback, cb => {
      CoreCursor.prototype._next.apply(this, [cb]);
    });
  }

  /**
   * Return the cursor logger
   * @method
   * @return {Logger} return the cursor logger
   * @ignore
   */
  getLogger() {
    return this.logger;
  }
}

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

// aliases
Cursor.prototype.maxTimeMs = Cursor.prototype.maxTimeMS;

// deprecated methods
deprecate(Cursor.prototype.each, 'Cursor.each is deprecated. Use Cursor.forEach instead.');
deprecate(
  Cursor.prototype.maxScan,
  'Cursor.maxScan is deprecated, and will be removed in a later version'
);

deprecate(
  Cursor.prototype.snapshot,
  'Cursor Snapshot is deprecated, and will be removed in a later version'
);

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

module.exports = Cursor;
