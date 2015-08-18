"use strict";

var inherits = require('util').inherits
  , f = require('util').format
  , toError = require('./utils').toError
  , getSingleProperty = require('./utils').getSingleProperty
  , formattedOrderClause = require('./utils').formattedOrderClause
  , handleCallback = require('./utils').handleCallback
  , Logger = require('mongodb-core').Logger
  , EventEmitter = require('events').EventEmitter
  , ReadPreference = require('./read_preference')
  , MongoError = require('mongodb-core').MongoError
  , Readable = require('stream').Readable || require('readable-stream').Readable
  , CoreCursor = require('mongodb-core').Cursor
  , Query = require('mongodb-core').Query
  , CoreReadPreference = require('mongodb-core').ReadPreference;

/**
 * @fileOverview The **Cursor** class is an internal class that embodies a cursor on MongoDB
 * allowing for iteration over the results returned from the underlying query. It supports
 * one by one document iteration, conversion to an array or can be iterated as a Node 0.10.X
 * or higher stream
 *
 * **CURSORS Cannot directly be instantiated**
 * @example
 * var MongoClient = require('mongodb').MongoClient,
 *   test = require('assert');
 * // Connection url
 * var url = 'mongodb://localhost:27017/test';
 * // Connect using MongoClient
 * MongoClient.connect(url, function(err, db) {
 *   // Create a collection we want to drop later
 *   var col = db.collection('createIndexExample1');
 *   // Insert a bunch of documents
 *   col.insert([{a:1, b:1}
 *     , {a:2, b:2}, {a:3, b:3}
 *     , {a:4, b:4}], {w:1}, function(err, result) {
 *     test.equal(null, err);
 *
 *     // Show that duplicate records got dropped
 *     col.find({}).toArray(function(err, items) {
 *       test.equal(null, err);
 *       test.equal(4, items.length);
 *       db.close();
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
 * Some example
 */
var Cursor = function(bson, ns, cmd, options, topology, topologyOptions) {
  CoreCursor.apply(this, Array.prototype.slice.call(arguments, 0));
  var self = this;
  var state = Cursor.INIT;
  var streamOptions = {};

  // Tailable cursor options
  var numberOfRetries = options.numberOfRetries || 5;
  var tailableRetryInterval = options.tailableRetryInterval || 500;
  var currentNumberOfRetries = numberOfRetries;

  // Get the promiseLibrary
  var promiseLibrary = options.promiseLibrary;

  // No promise library selected fall back
  if(!promiseLibrary) {
    promiseLibrary = typeof global.Promise == 'function' ?
      global.Promise : require('es6-promise').Promise;
  }

  // Set up
  Readable.call(this, {objectMode: true});

  // Internal cursor state
  this.s = {
    // Tailable cursor options
      numberOfRetries: numberOfRetries
    , tailableRetryInterval: tailableRetryInterval
    , currentNumberOfRetries: currentNumberOfRetries
    // State
    , state: state
    // Stream options
    , streamOptions: streamOptions
    // BSON
    , bson: bson
    // Namespace
    , ns: ns
    // Command
    , cmd: cmd
    // Options
    , options: options
    // Topology
    , topology: topology
    // Topology options
    , topologyOptions: topologyOptions
    // Promise library
    , promiseLibrary: promiseLibrary
    // Current doc
    , currentDoc: null
  }

  // Legacy fields
  this.timeout = self.s.options.noCursorTimeout == true;
  this.sortValue = self.s.cmd.sort;
  this.readPreference = self.s.options.readPreference;
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

// Inherit from Readable
inherits(Cursor, Readable);

// Map core cursor _next method so we can apply mapping
CoreCursor.prototype._next = CoreCursor.prototype.next;

for(var name in CoreCursor.prototype) {
  Cursor.prototype[name] = CoreCursor.prototype[name];
}

/**
 * Check if there is any document still available in the cursor
 * @method
 * @param {Cursor~resultCallback} [callback] The result callback.
 * @throws {MongoError}
 * @deprecated
 * @return {Promise} returns Promise if no callback passed
 */
Cursor.prototype.hasNext = function(callback) {
  var self = this;

  // Execute using callback
  if(typeof callback == 'function') return nextObject(self, function(err, doc) {
    if(!doc) return callback(null, false);
    self.s.currentDoc = doc;
    callback(null, true);
  });

  // Return a Promise
  return new this.s.promiseLibrary(function(resolve, reject) {
    nextObject(self, function(err, doc) {
      if(self.s.state == Cursor.CLOSED || self.isDead()) return resolve(false);
      if(err) return reject(err);
      if(!doc) return resolve(false);
      self.s.currentDoc = doc;
      resolve(true);
    });
  });
}


/**
 * Get the next available document from the cursor, returns null if no more documents are available.
 * @method
 * @param {Cursor~resultCallback} [callback] The result callback.
 * @throws {MongoError}
 * @deprecated
 * @return {Promise} returns Promise if no callback passed
 */
Cursor.prototype.next = function(callback) {
  var self = this;

  // Execute using callback
  if(typeof callback == 'function') {
    // Return the currentDoc if someone called hasNext first
    if(self.s.currentDoc) {
      var doc = self.s.currentDoc;
      self.s.currentDoc = null;
      return callback(null, doc);
    }

    // Return the next object
    return nextObject(self, callback)
  };

  // Return a Promise
  return new this.s.promiseLibrary(function(resolve, reject) {
    // Return the currentDoc if someone called hasNext first
    if(self.s.currentDoc) {
      var doc = self.s.currentDoc;
      self.s.currentDoc = null;
      return resolve(doc);
    }

    nextObject(self, function(err, r) {
      if(err) return reject(err);
      resolve(r);
    });
  });
}

/**
 * Set the cursor query
 * @method
 * @param {object} filter The filter object used for the cursor.
 * @return {Cursor}
 */
Cursor.prototype.filter = function(filter) {
  if(this.s.state == Cursor.CLOSED || this.s.state == Cursor.OPEN || this.isDead()) throw MongoError.create({message: "Cursor is closed", driver:true});
  this.s.cmd.query = filter;
  return this;
}

/**
 * Set the cursor maxScan
 * @method
 * @param {object} maxScan Constrains the query to only scan the specified number of documents when fulfilling the query
 * @return {Cursor}
 */
Cursor.prototype.maxScan = function(maxScan) {
  if(this.s.state == Cursor.CLOSED || this.s.state == Cursor.OPEN || this.isDead()) throw MongoError.create({message: "Cursor is closed", driver:true});
  this.s.cmd.maxScan = maxScan;
  return this;
}

/**
 * Set the cursor hint
 * @method
 * @param {object} hint If specified, then the query system will only consider plans using the hinted index.
 * @return {Cursor}
 */
Cursor.prototype.hint = function(hint) {
  if(this.s.state == Cursor.CLOSED || this.s.state == Cursor.OPEN || this.isDead()) throw MongoError.create({message: "Cursor is closed", driver:true});
  this.s.cmd.hint = hint;
  return this;
}

/**
 * Set the cursor min
 * @method
 * @param {object} min Specify a $min value to specify the inclusive lower bound for a specific index in order to constrain the results of find(). The $min specifies the lower bound for all keys of a specific index in order.
 * @return {Cursor}
 */
Cursor.prototype.min = function(min) {
  if(this.s.state == Cursor.CLOSED || this.s.state == Cursor.OPEN || this.isDead()) throw MongoError.create({message: "Cursor is closed", driver:true});
  this.s.cmd.min = min;
  return this;
}

/**
 * Set the cursor max
 * @method
 * @param {object} max Specify a $max value to specify the exclusive upper bound for a specific index in order to constrain the results of find(). The $max specifies the upper bound for all keys of a specific index in order.
 * @return {Cursor}
 */
Cursor.prototype.max = function(max) {
  if(this.s.state == Cursor.CLOSED || this.s.state == Cursor.OPEN || this.isDead()) throw MongoError.create({message: "Cursor is closed", driver:true});
  this.s.cmd.max = max;
  return this;
}

/**
 * Set the cursor returnKey
 * @method
 * @param {object} returnKey Only return the index field or fields for the results of the query. If $returnKey is set to true and the query does not use an index to perform the read operation, the returned documents will not contain any fields. Use one of the following forms:
 * @return {Cursor}
 */
Cursor.prototype.returnKey = function(value) {
  if(this.s.state == Cursor.CLOSED || this.s.state == Cursor.OPEN || this.isDead()) throw MongoError.create({message: "Cursor is closed", driver:true});
  this.s.cmd.returnKey = value;
  return this;
}

/**
 * Set the cursor showRecordId
 * @method
 * @param {object} showRecordId The $showDiskLoc option has now been deprecated and replaced with the showRecordId field. $showDiskLoc will still be accepted for OP_QUERY stye find.
 * @return {Cursor}
 */
Cursor.prototype.showRecordId = function(value) {
  if(this.s.state == Cursor.CLOSED || this.s.state == Cursor.OPEN || this.isDead()) throw MongoError.create({message: "Cursor is closed", driver:true});
  this.s.cmd.showDiskLoc = value;
  return this;
}

/**
 * Set the cursor snapshot
 * @method
 * @param {object} snapshot The $snapshot operator prevents the cursor from returning a document more than once because an intervening write operation results in a move of the document.
 * @return {Cursor}
 */
Cursor.prototype.snapshot = function(value) {
  if(this.s.state == Cursor.CLOSED || this.s.state == Cursor.OPEN || this.isDead()) throw MongoError.create({message: "Cursor is closed", driver:true});
  this.s.cmd.snapshot = value;
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
Cursor.prototype.setCursorOption = function(field, value) {
  if(this.s.state == Cursor.CLOSED || this.s.state == Cursor.OPEN || this.isDead()) throw MongoError.create({message: "Cursor is closed", driver:true});
  if(fields.indexOf(field) == -1) throw MongoError.create({message: f("option %s not a supported option %s", field, fields), driver:true });
  this.s[field] = value;
  if(field == 'numberOfRetries')
    this.s.currentNumberOfRetries = value;
  return this;
}

/**
 * Add a cursor flag to the cursor
 * @method
 * @param {string} flag The flag to set, must be one of following ['tailable', 'oplogReplay', 'noCursorTimeout', 'awaitData', 'exhaust', 'partial'].
 * @param {boolean} value The flag boolean value.
 * @throws {MongoError}
 * @return {Cursor}
 */
Cursor.prototype.addCursorFlag = function(flag, value) {
  if(this.s.state == Cursor.CLOSED || this.s.state == Cursor.OPEN || this.isDead()) throw MongoError.create({message: "Cursor is closed", driver:true});
  if(flags.indexOf(flag) == -1) throw MongoError.create({message: f("flag %s not a supported flag %s", flag, flags), driver:true });
  if(typeof value != 'boolean') throw MongoError.create({message: f("flag %s must be a boolean value", flag), driver:true});
  this.s.cmd[flag] = value;
  return this;
}

/**
 * Add a query modifier to the cursor query
 * @method
 * @param {string} name The query modifier (must start with $, such as $orderby etc)
 * @param {boolean} value The flag boolean value.
 * @throws {MongoError}
 * @return {Cursor}
 */
Cursor.prototype.addQueryModifier = function(name, value) {
  if(this.s.state == Cursor.CLOSED || this.s.state == Cursor.OPEN || this.isDead()) throw MongoError.create({message: "Cursor is closed", driver:true});
  if(name[0] != '$') throw MongoError.create({message: f("%s is not a valid query modifier"), driver:true});
  // Strip of the $
  var field = name.substr(1);
  // Set on the command
  this.s.cmd[field] = value;
  // Deal with the special case for sort
  if(field == 'orderby') this.s.cmd.sort = this.s.cmd[field];
  return this;
}

/**
 * Add a comment to the cursor query allowing for tracking the comment in the log.
 * @method
 * @param {string} value The comment attached to this query.
 * @throws {MongoError}
 * @return {Cursor}
 */
Cursor.prototype.comment = function(value) {
  if(this.s.state == Cursor.CLOSED || this.s.state == Cursor.OPEN || this.isDead()) throw MongoError.create({message: "Cursor is closed", driver:true});
  this.s.cmd.comment = value;
  return this;
}

/**
 * Set a maxTimeMS on the cursor query, allowing for hard timeout limits on queries (Only supported on MongoDB 2.6 or higher)
 * @method
 * @param {number} value Number of milliseconds to wait before aborting the query.
 * @throws {MongoError}
 * @return {Cursor}
 */
Cursor.prototype.maxTimeMS = function(value) {
  if(typeof value != 'number') throw MongoError.create({message: "maxTimeMS must be a number", driver:true});
  if(this.s.state == Cursor.CLOSED || this.s.state == Cursor.OPEN || this.isDead()) throw MongoError.create({message: "Cursor is closed", driver:true});
  this.s.cmd.maxTimeMS = value;
  return this;
}

Cursor.prototype.maxTimeMs = Cursor.prototype.maxTimeMS;

/**
 * Sets a field projection for the query.
 * @method
 * @param {object} value The field projection object.
 * @throws {MongoError}
 * @return {Cursor}
 */
Cursor.prototype.project = function(value) {
  if(this.s.state == Cursor.CLOSED || this.s.state == Cursor.OPEN || this.isDead()) throw MongoError.create({message: "Cursor is closed", driver:true});
  this.s.cmd.fields = value;
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
Cursor.prototype.sort = function(keyOrList, direction) {
  if(this.s.options.tailable) throw MongoError.create({message: "Tailable cursor doesn't support sorting", driver:true});
  if(this.s.state == Cursor.CLOSED || this.s.state == Cursor.OPEN || this.isDead()) throw MongoError.create({message: "Cursor is closed", driver:true});
  var order = keyOrList;

  if(direction != null) {
    order = [[keyOrList, direction]];
  }

  this.s.cmd.sort = order;
  this.sortValue = order;
  return this;
}

/**
 * Set the batch size for the cursor.
 * @method
 * @param {number} value The batchSize for the cursor.
 * @throws {MongoError}
 * @return {Cursor}
 */
Cursor.prototype.batchSize = function(value) {
  if(this.s.options.tailable) throw MongoError.create({message: "Tailable cursor doesn't support batchSize", driver:true});
  if(this.s.state == Cursor.CLOSED || this.isDead()) throw MongoError.create({message: "Cursor is closed", driver:true});
  if(typeof value != 'number') throw MongoError.create({message: "batchSize requires an integer", driver:true});
  this.s.cmd.batchSize = value;
  this.setCursorBatchSize(value);
  return this;
}

/**
 * Set the limit for the cursor.
 * @method
 * @param {number} value The limit for the cursor query.
 * @throws {MongoError}
 * @return {Cursor}
 */
Cursor.prototype.limit = function(value) {
  if(this.s.options.tailable) throw MongoError.create({message: "Tailable cursor doesn't support limit", driver:true});
  if(this.s.state == Cursor.OPEN || this.s.state == Cursor.CLOSED || this.isDead()) throw MongoError.create({message: "Cursor is closed", driver:true});
  if(typeof value != 'number') throw MongoError.create({message: "limit requires an integer", driver:true});
  this.s.cmd.limit = value;
  // this.cursorLimit = value;
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
Cursor.prototype.skip = function(value) {
  if(this.s.options.tailable) throw MongoError.create({message: "Tailable cursor doesn't support skip", driver:true});
  if(this.s.state == Cursor.OPEN || this.s.state == Cursor.CLOSED || this.isDead()) throw MongoError.create({message: "Cursor is closed", driver:true});
  if(typeof value != 'number') throw MongoError.create({message: "skip requires an integer", driver:true});
  this.s.cmd.skip = value;
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
 * Set the new batchSize of the cursor
 * @function Cursor.prototype.setBatchSize
 * @param {number} value The new batchSize for the cursor
 * @return {null}
 */

/**
 * Get the batchSize of the cursor
 * @function Cursor.prototype.batchSize
 * @param {number} value The current batchSize for the cursor
 * @return {null}
 */

/**
 * Set the new skip value of the cursor
 * @function Cursor.prototype.setCursorSkip
 * @param {number} value The new skip for the cursor
 * @return {null}
 */

/**
 * Get the skip value of the cursor
 * @function Cursor.prototype.cursorSkip
 * @param {number} value The current skip value for the cursor
 * @return {null}
 */

/**
 * Set the new limit value of the cursor
 * @function Cursor.prototype.setCursorLimit
 * @param {number} value The new limit for the cursor
 * @return {null}
 */

/**
 * Get the limit value of the cursor
 * @function Cursor.prototype.cursorLimit
 * @param {number} value The current limit value for the cursor
 * @return {null}
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
 * Get the next available document from the cursor, returns null if no more documents are available.
 * @method
 * @param {Cursor~resultCallback} [callback] The result callback.
 * @throws {MongoError}
 * @deprecated
 * @return {Promise} returns Promise if no callback passed
 */
Cursor.prototype.nextObject = Cursor.prototype.next;

var nextObject = function(self, callback) {
  if(self.s.state == Cursor.CLOSED || self.isDead && self.isDead()) return handleCallback(callback, MongoError.create({message: "Cursor is closed", driver:true}));
  if(self.s.state == Cursor.INIT && self.s.cmd.sort) {
    try {
      self.s.cmd.sort = formattedOrderClause(self.s.cmd.sort);
    } catch(err) {
      return handleCallback(callback, err);
    }
  }
  // Get the next object
  self._next(function(err, doc) {
    if(err && err.tailable && self.s.currentNumberOfRetries == 0) return callback(err);
    if(err && err.tailable && self.s.currentNumberOfRetries > 0) {
      self.s.currentNumberOfRetries = self.s.currentNumberOfRetries - 1;

      return setTimeout(function() {
        self.nextObject(callback);
      }, self.s.tailableRetryInterval);
    }

    self.s.state = Cursor.OPEN;
    if(err) return handleCallback(callback, err);
    handleCallback(callback, null, doc);
  });
}

// Trampoline emptying the number of retrieved items
// without incurring a nextTick operation
var loop = function(self, callback) {
  // No more items we are done
  if(self.bufferedCount() == 0) return;
  // Get the next document
  self._next(callback);
  // Loop
  return loop;
}

/**
 * Get the next available document from the cursor, returns null if no more documents are available.
 * @method
 * @param {Cursor~resultCallback} [callback] The result callback.
 * @throws {MongoError}
 * @deprecated
 * @return {Promise} returns Promise if no callback passed
 */
Cursor.prototype.next = Cursor.prototype.nextObject;

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
  if(!callback) throw MongoError.create({message: 'callback is mandatory', driver:true});
  if(self.isNotified()) return;
  if(self.s.state == Cursor.CLOSED || self.isDead()) {
    return handleCallback(callback, MongoError.create({message: "Cursor is closed", driver:true}));
  }

  if(self.s.state == Cursor.INIT) self.s.state = Cursor.OPEN;

  // Define function to avoid global scope escape
  var fn = null;
  // Trampoline all the entries
  if(self.bufferedCount() > 0) {
    while(fn = loop(self, callback)) fn(self, callback);
    _each(self, callback);
  } else {
    self._next(function(err, item) {
      if(err) return handleCallback(callback, err);
      if(item == null) {
        self.s.state = Cursor.CLOSED;
        return handleCallback(callback, null, null);
      }

      if(handleCallback(callback, null, item) == false) return;
      _each(self, callback);
    })
  }
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
 * @return {null}
 */
Cursor.prototype.forEach = function(iterator, callback) {
  this.each(function(err, doc){
    if(err) { callback(err); return false; }
    if(doc != null) { iterator(doc); return true; }
    if(doc == null && callback) {
      var internalCallback = callback;
      callback = null;
      internalCallback(null);
      return false;
    }
  });
}

/**
 * Set the ReadPreference for the cursor.
 * @method
 * @param {(string|ReadPreference)} readPreference The new read preference for the cursor.
 * @throws {MongoError}
 * @return {Cursor}
 */
Cursor.prototype.setReadPreference = function(r) {
  if(this.s.state != Cursor.INIT) throw MongoError.create({message: 'cannot change cursor readPreference after cursor has been accessed', driver:true});
  if(r instanceof ReadPreference) {
    this.s.options.readPreference = new CoreReadPreference(r.mode, r.tags);
  } else {
    this.s.options.readPreference = new CoreReadPreference(r);
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
  if(self.s.options.tailable) throw MongoError.create({message: 'Tailable cursor cannot be converted to array', driver:true});

  // Execute using callback
  if(typeof callback == 'function') return toArray(self, callback);

  // Return a Promise
  return new this.s.promiseLibrary(function(resolve, reject) {
    toArray(self, function(err, r) {
      if(err) return reject(err);
      resolve(r);
    });
  });
}

var toArray = function(self, callback) {
  var items = [];

  // Reset cursor
  self.rewind();
  self.s.state = Cursor.INIT;


  // Fetch all the documents
  var fetchDocs = function() {
    self._next(function(err, doc) {
      if(err) return handleCallback(callback, err);
      if(doc == null) {
        self.s.state = Cursor.CLOSED;
        return handleCallback(callback, null, items);
      }

      // Add doc to items
      items.push(doc)

      // Get all buffered objects
      if(self.bufferedCount() > 0) {
        var docs = self.readBufferedDocuments(self.bufferedCount())

        // Transform the doc if transform method added
        if(self.s.transforms && typeof self.s.transforms.doc == 'function') {
          docs = docs.map(self.s.transforms.doc);
        }

        items = items.concat(docs);
      }

      // Attempt a fetch
      fetchDocs();
    })
  }

  fetchDocs();
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
 * @param {boolean} applySkipLimit Should the count command apply limit and skip settings on the cursor or in the passed in options.
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
  var self = this;
  if(self.s.cmd.query == null) throw MongoError.create({message: "count can only be used with find command", driver:true});
  if(typeof opts == 'function') callback = opts, opts = {};
  opts = opts || {};

  // Execute using callback
  if(typeof callback == 'function') return count(self, applySkipLimit, opts, callback);

  // Return a Promise
  return new this.s.promiseLibrary(function(resolve, reject) {
    count(self, applySkipLimit, opts, function(err, r) {
      if(err) return reject(err);
      resolve(r);
    });
  });
};

var count = function(self, applySkipLimit, opts, callback) {
  if(typeof applySkipLimit == 'function') {
    callback = applySkipLimit;
    applySkipLimit = true;
  }

  if(applySkipLimit) {
    if(typeof self.cursorSkip() == 'number') opts.skip = self.cursorSkip();
    if(typeof self.cursorLimit() == 'number') opts.limit = self.cursorLimit();
  }

  // Command
  var delimiter = self.s.ns.indexOf('.');

  var command = {
    'count': self.s.ns.substr(delimiter+1), 'query': self.s.cmd.query
  }

  if(typeof opts.maxTimeMS == 'number') {
    command.maxTimeMS = opts.maxTimeMS;
  } else if(typeof self.s.maxTimeMS == 'number') {
    command.maxTimeMS = self.s.maxTimeMS;
  }

  // Get a server
  var server = self.s.topology.getServer(opts);
  // Get a connection
  var connection = self.s.topology.getConnection(opts);
  // Get the callbacks
  var callbacks = server.getCallbacks();

  // Merge in any options
  if(opts.skip) command.skip = opts.skip;
  if(opts.limit) command.limit = opts.limit;
  if(self.s.options.hint) command.hint = self.s.options.hint;

  // Build Query object
  var query = new Query(self.s.bson, f("%s.$cmd", self.s.ns.substr(0, delimiter)), command, {
      numberToSkip: 0, numberToReturn: -1
    , checkKeys: false
  });

  // Set up callback
  callbacks.register(query.requestId, function(err, result) {
    if(err) return handleCallback(callback, err);
    if(result.documents.length == 1
      && (result.documents[0].errmsg
      || result.documents[0].err
      || result.documents[0]['$err'])) return callback(MongoError.create(result.documents[0]));
    handleCallback(callback, null, result.documents[0].n);
  });

  // Write the initial command out
  connection.write(query.toBin());
}

/**
 * Close the cursor, sending a KillCursor command and emitting close.
 * @method
 * @param {Cursor~resultCallback} [callback] The result callback.
 * @return {Promise} returns Promise if no callback passed
 */
Cursor.prototype.close = function(callback) {
  this.s.state = Cursor.CLOSED;
  // Kill the cursor
  this.kill();
  // Emit the close event for the cursor
  this.emit('close');
  // Callback if provided
  if(typeof callback == 'function') return handleCallback(callback, null, this);
  // Return a Promise
  return new this.s.promiseLibrary(function(resolve, reject) {
    resolve();
  });
}

/**
 * Map all documents using the provided function
 * @method
 * @param {function} [transform] The mapping transformation method.
 * @return {null}
 */
Cursor.prototype.map = function(transform) {
  this.cursorState.transforms = { doc: transform };
  return this;
}

/**
 * Is the cursor closed
 * @method
 * @return {boolean}
 */
Cursor.prototype.isClosed = function() {
  return this.isDead();
}

Cursor.prototype.destroy = function(err) {
  this.pause();
  this.close();
  if(err) this.emit('error', err);
}

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
}

/**
 * Execute the explain for the cursor
 * @method
 * @param {Cursor~resultCallback} [callback] The result callback.
 * @return {Promise} returns Promise if no callback passed
 */
Cursor.prototype.explain = function(callback) {
  var self = this;
  this.s.cmd.explain = true;

  // Execute using callback
  if(typeof callback == 'function') return this._next(callback);

  // Return a Promise
  return new this.s.promiseLibrary(function(resolve, reject) {
    self._next(function(err, r) {
      if(err) return reject(err);
      resolve(r);
    });
  });
}

Cursor.prototype._read = function(n) {
  var self = this;
  if(self.s.state == Cursor.CLOSED || self.isDead()) {
    return self.push(null);
  }

  // Get the next item
  self.nextObject(function(err, result) {
    if(err) {
      if(!self.isDead()) self.close();
      if(self.listeners('error') && self.listeners('error').length > 0) {
        self.emit('error', err);
      }

      // Emit end event
      self.emit('end');
      return self.emit('finish');
    }

    // If we provided a transformation method
    if(typeof self.s.streamOptions.transform == 'function' && result != null) {
      return self.push(self.s.streamOptions.transform(result));
    }

    // If we provided a map function
    if(self.cursorState.transforms && typeof self.cursorState.transforms.doc == 'function' && result != null) {
      return self.push(self.cursorState.transforms.doc(result));
    }

    // Return the result
    self.push(result);
  });
}

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
