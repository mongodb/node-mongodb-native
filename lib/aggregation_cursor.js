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
  // , CoreCursor = require('mongodb-core').Cursor
  , CoreCursor = require('./cursor')
  , Query = require('mongodb-core').Query
  , CoreReadPreference = require('mongodb-core').ReadPreference;

/**
 * @fileOverview The **AggregationCursor** class is an internal class that embodies an aggregation cursor on MongoDB
 * allowing for iteration over the results returned from the underlying query. It supports
 * one by one document iteration, conversion to an array or can be iterated as a Node 0.10.X 
 * or higher stream
 * 
 * **AGGREGATIONCURSOR Cannot directly be instantiated**
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
 *     col.aggregation({}, {cursor: {}}).toArray(function(err, items) {
 *       test.equal(null, err);
 *       test.equal(4, items.length);
 *       db.close();
 *     });
 *   });
 * });
 */

/**
 * Namespace provided by the browser.
 * @external Readable
 */

/**
 * Creates a new Aggregation Cursor instance (INTERNAL TYPE, do not instantiate directly)
 * @class
 * @extends external:Readable
 * @property {number} cursorBatchSize The current cursorBatchSize for the cursor
 * @property {number} cursorLimit The current cursorLimit for the cursor
 * @property {number} cursorSkip The current cursorSkip for the cursor
 * @fires AggregationCursor#data
 * @fires AggregationCursor#end
 * @fires AggregationCursor#close
 * @fires AggregationCursor#readable
 * @return {AggregationCursor} an AggregationCursor instance.
 */
var AggregationCursor = function(bson, ns, cmd, options, topology, topologyOptions) {
  CoreCursor.apply(this, Array.prototype.slice.call(arguments, 0));
  var self = this;
  var state = AggregationCursor.INIT;
  var streamOptions = {};

  // MaxTimeMS
  var maxTimeMS = null;

  // Set up
  Readable.call(this, {objectMode: true});

  /**
   * Set the batch size for the cursor.
   * @method
   * @param {number} value The batchSize for the cursor.
   * @throws {MongoError}
   * @return {AggregationCursor}
   */
  this.batchSize = function(value) {
    if(state == AggregationCursor.CLOSED || self.isDead()) throw new MongoError("Cursor is closed");
    if(typeof value != 'number') throw new MongoError("batchSize requires an integer");
    if(cmd.cursor) cmd.cursor.batchSize = value;
    this.cursorBatchSize = value;
    return self;
  }

  /**
   * Add a geoNear stage to the aggregation pipeline
   * @method
   * @param {object} document The geoNear stage document.
   * @return {AggregationCursor}
   */
  this.geoNear = function(document) {
    cmd.pipeline.push({$geoNear: document});
    return self;
  }

  /**
   * Add a group stage to the aggregation pipeline
   * @method
   * @param {object} document The group stage document.
   * @return {AggregationCursor}
   */
  this.group = function(document) {
    cmd.pipeline.push({$group: document});
    return self;
  }

  /**
   * Add a limit stage to the aggregation pipeline
   * @method
   * @param {number} value The state limit value.
   * @return {AggregationCursor}
   */
  this.limit = function(value) {
    cmd.pipeline.push({$limit: value});
    return self; 
  }

  /**
   * Add a match stage to the aggregation pipeline
   * @method
   * @param {object} document The match stage document.
   * @return {AggregationCursor}
   */
  this.match = function(document) {
    cmd.pipeline.push({$match: document});
    return self; 
  }

  /**
   * Add a maxTimeMS stage to the aggregation pipeline
   * @method
   * @param {number} value The state maxTimeMS value.
   * @return {AggregationCursor}
   */
  this.maxTimeMS = function(value) {
    if(topology.lastIsMaster().minWireVersion > 2) {
      cmd.maxTimeMS = value;
    }
    return self; 
  }

  /**
   * Add a out stage to the aggregation pipeline
   * @method
   * @param {number} destination The destination name.
   * @return {AggregationCursor}
   */
  this.out = function(destination) {
    cmd.pipeline.push({$out: destination});
    return self; 
  }

  /**
   * Add a project stage to the aggregation pipeline
   * @method
   * @param {object} document The project stage document.
   * @return {AggregationCursor}
   */
  this.project = function(document) {
    cmd.pipeline.push({$project: document});
    return self; 
  }

  /**
   * Add a redact stage to the aggregation pipeline
   * @method
   * @param {object} document The redact stage document.
   * @return {AggregationCursor}
   */
  this.redact = function(document) {
    cmd.pipeline.push({$redact: document});
    return self; 
  }

  /**
   * Add a skip stage to the aggregation pipeline
   * @method
   * @param {number} value The state skip value.
   * @return {AggregationCursor}
   */
  this.skip = function(value) {
    cmd.pipeline.push({$skip: value});
    return self; 
  }

  /**
   * Add a sort stage to the aggregation pipeline
   * @method
   * @param {object} document The sort stage document.
   * @return {AggregationCursor}
   */
  this.sort = function(document) {
    cmd.pipeline.push({$sort: document});
    return self; 
  }

  /**
   * Add a unwind stage to the aggregation pipeline
   * @method
   * @param {number} field The unwind field name.
   * @return {AggregationCursor}
   */
  this.unwind = function(field) {
    cmd.pipeline.push({$unwind: field});
    return self; 
  }

  this.get = this.toArray;

  /**
   * Get the next available document from the cursor, returns null if no more documents are available.
   * @function AggregationCursor.prototype.next
   * @param {AggregationCursor~resultCallback} callback The result callback.
   * @throws {MongoError}
   * @return {null}
   */

  /**
   * The callback format for results
   * @callback AggregationCursor~toArrayResultCallback
   * @param {MongoError} error An error instance representing the error during the execution.
   * @param {object[]} documents All the documents the satisfy the cursor.
   */

  /**
   * Returns an array of documents. The caller is responsible for making sure that there
   * is enough memory to store the results. Note that the array only contain partial
   * results when this cursor had been previouly accessed. In that case,
   * cursor.rewind() can be used to reset the cursor.
   * @method AggregationCursor.prototype.toArray
   * @param {AggregationCursor~toArrayResultCallback} callback The result callback.
   * @throws {MongoError}
   * @return {null}
   */

  /**
   * The callback format for results
   * @callback AggregationCursor~resultCallback
   * @param {MongoError} error An error instance representing the error during the execution.
   * @param {(object|null)} result The result object if the command was executed successfully.
   */

  /**
   * Iterates over all the documents for this cursor. As with **{cursor.toArray}**,
   * not all of the elements will be iterated if this cursor had been previouly accessed.
   * In that case, **{cursor.rewind}** can be used to reset the cursor. However, unlike
   * **{cursor.toArray}**, the cursor will only hold a maximum of batch size elements
   * at any given time if batch size is specified. Otherwise, the caller is responsible
   * for making sure that the entire result can fit the memory.
   * @method AggregationCursor.prototype.each
   * @param {AggregationCursor~resultCallback} callback The result callback.
   * @throws {MongoError}
   * @return {null}
   */

  /**
   * Close the cursor, sending a KillCursor command and emitting close.
   * @method AggregationCursor.prototype.close
   * @param {AggregationCursor~resultCallback} [callback] The result callback.
   * @return {null}
   */   

  /**
   * Is the cursor closed
   * @method AggregationCursor.prototype.isClosed
   * @return {boolean}
   */   

  /**
   * Execute the explain for the cursor
   * @method AggregationCursor.prototype.explain
   * @param {AggregationCursor~resultCallback} [callback] The result callback.
   * @return {null}
   */

  /**
   * Clone the cursor
   * @function AggregationCursor.prototype.clone
   * @return {AggregationCursor}
   */     

  /**
   * Resets the cursor
   * @function AggregationCursor.prototype.rewind
   * @return {AggregationCursor}
   */  

  /**
   * The callback format for the forEach iterator method
   * @callback AggregationCursor~iteratorCallback
   * @param {Object} doc An emitted document for the iterator
   */

  /**
   * The callback error format for the forEach iterator method
   * @callback AggregationCursor~endCallback
   * @param {MongoError} error An error instance representing the error during the execution.
   */

  /*
   * Iterates over all the documents for this cursor using the iterator, callback pattern.
   * @method AggregationCursor.prototype.forEach
   * @param {AggregationCursor~iteratorCallback} iterator The iteration callback.
   * @param {AggregationCursor~endCallback} callback The end callback.
   * @throws {MongoError}
   * @return {null}
   */
}

/**
 * AggregationCursor stream data event, fired for each document in the cursor.
 *
 * @event AggregationCursor#data
 * @type {object}
 */

/**
 * AggregationCursor stream end event
 *
 * @event AggregationCursor#end
 * @type {null}
 */

/**
 * AggregationCursor stream close event
 *
 * @event AggregationCursor#close
 * @type {null}
 */

/**
 * AggregationCursor stream readable event
 *
 * @event AggregationCursor#readable
 * @type {null}
 */

// Extend the Cursor
inherits(AggregationCursor, CoreCursor);

// Inherit from Readable
inherits(AggregationCursor, Readable);  

AggregationCursor.INIT = 0;
AggregationCursor.OPEN = 1;
AggregationCursor.CLOSED = 2;

module.exports = AggregationCursor;