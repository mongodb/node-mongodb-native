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
  // , CoreCursor = require('mongodb-core').Cursor
  , CoreCursor = require('./cursor')
  , Query = require('mongodb-core').Query
  , CoreReadPreference = require('mongodb-core').ReadPreference;

/**
 * @fileOverview The **GeneralCursor** class is an internal class that embodies an aggregation cursor on MongoDB
 * allowing for iteration over the results returned from the underlying query. It supports
 * one by one document iteration, conversion to an array or can be iterated as a Node 0.10.X 
 * or higher stream
 * 
 * **GeneralCursor Cannot directly be instantiated**
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
 * @fires GeneralCursor#data
 * @fires GeneralCursor#end
 * @fires GeneralCursor#close
 * @fires GeneralCursor#readable
 * @return {GeneralCursor} an GeneralCursor instance.
 */
var GeneralCursor = function(bson, ns, cmd, options, topology, topologyOptions) {
  CoreCursor.apply(this, Array.prototype.slice.call(arguments, 0));
  var self = this;
  var state = GeneralCursor.INIT;
  var streamOptions = {};

  // MaxTimeMS
  var maxTimeMS = null;

  // Set up
  Readable.call(this, {objectMode: true});

  // Internal state
  this.s = {
    // MaxTimeMS
      maxTimeMS: maxTimeMS
    // State
    , state: state
    // Stream options
    , streamOptions: streamOptions
    // BSON
    , bson: bson
    // Namespae
    , ns: ns
    // Command
    , cmd: cmd
    // Options
    , options: options
    // Topology
    , topology: topology
    // Topology Options
    , topologyOptions: topologyOptions
  }
}

/**
 * GeneralCursor stream data event, fired for each document in the cursor.
 *
 * @event GeneralCursor#data
 * @type {object}
 */

/**
 * GeneralCursor stream end event
 *
 * @event GeneralCursor#end
 * @type {null}
 */

/**
 * GeneralCursor stream close event
 *
 * @event GeneralCursor#close
 * @type {null}
 */

/**
 * GeneralCursor stream readable event
 *
 * @event GeneralCursor#readable
 * @type {null}
 */

// Inherit from Readable
inherits(GeneralCursor, Readable);  

// Set the methods to inherit from prototype
var methodsToInherit = ['next', 'each', 'forEach', 'toArray', 'rewind', 'bufferedCount', 'readBufferedDocuments'];

// Only inherit the types we need
for(var i = 0; i < methodsToInherit.length; i++) {
  GeneralCursor.prototype[methodsToInherit[i]] = CoreCursor.prototype[methodsToInherit[i]];
}

/**
 * Set the batch size for the cursor.
 * @method
 * @param {number} value The batchSize for the cursor.
 * @throws {MongoError}
 * @return {GeneralCursor}
 */
GeneralCursor.prototype.batchSize = function(value) {
  if(this.s.state == GeneralCursor.CLOSED || this.isDead()) throw new MongoError("Cursor is closed");
  if(typeof value != 'number') throw new MongoError("batchSize requires an integer");
  if(this.s.cmd.cursor) this.s.cmd.cursor.batchSize = value;
  this.cursorBatchSize = value;
  return this;
}

/**
 * Add a maxTimeMS stage to the aggregation pipeline
 * @method
 * @param {number} value The state maxTimeMS value.
 * @return {GeneralCursor}
 */
GeneralCursor.prototype.maxTimeMS = function(value) {
  if(this.s.topology.lastIsMaster().minWireVersion > 2) {
    this.s.cmd.maxTimeMS = value;
  }
  return this;
}

GeneralCursor.prototype.get = GeneralCursor.prototype.toArray;

/**
 * Get the next available document from the cursor, returns null if no more documents are available.
 * @function GeneralCursor.prototype.next
 * @param {GeneralCursor~resultCallback} callback The result callback.
 * @throws {MongoError}
 * @return {null}
 */

/**
 * The callback format for results
 * @callback GeneralCursor~toArrayResultCallback
 * @param {MongoError} error An error instance representing the error during the execution.
 * @param {object[]} documents All the documents the satisfy the cursor.
 */

/**
 * Returns an array of documents. The caller is responsible for making sure that there
 * is enough memory to store the results. Note that the array only contain partial
 * results when this cursor had been previouly accessed. In that case,
 * cursor.rewind() can be used to reset the cursor.
 * @method GeneralCursor.prototype.toArray
 * @param {GeneralCursor~toArrayResultCallback} callback The result callback.
 * @throws {MongoError}
 * @return {null}
 */

/**
 * The callback format for results
 * @callback GeneralCursor~resultCallback
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
 * @method GeneralCursor.prototype.each
 * @param {GeneralCursor~resultCallback} callback The result callback.
 * @throws {MongoError}
 * @return {null}
 */

/**
 * Close the cursor, sending a KillCursor command and emitting close.
 * @method GeneralCursor.prototype.close
 * @param {GeneralCursor~resultCallback} [callback] The result callback.
 * @return {null}
 */   

/**
 * Is the cursor closed
 * @method GeneralCursor.prototype.isClosed
 * @return {boolean}
 */   

/**
 * Execute the explain for the cursor
 * @method GeneralCursor.prototype.explain
 * @param {GeneralCursor~resultCallback} [callback] The result callback.
 * @return {null}
 */

/**
 * Clone the cursor
 * @function GeneralCursor.prototype.clone
 * @return {GeneralCursor}
 */     

/**
 * Resets the cursor
 * @function GeneralCursor.prototype.rewind
 * @return {GeneralCursor}
 */  

/**
 * The callback format for the forEach iterator method
 * @callback GeneralCursor~iteratorCallback
 * @param {Object} doc An emitted document for the iterator
 */

/**
 * The callback error format for the forEach iterator method
 * @callback GeneralCursor~endCallback
 * @param {MongoError} error An error instance representing the error during the execution.
 */

/*
 * Iterates over all the documents for this cursor using the iterator, callback pattern.
 * @method GeneralCursor.prototype.forEach
 * @param {GeneralCursor~iteratorCallback} iterator The iteration callback.
 * @param {GeneralCursor~endCallback} callback The end callback.
 * @throws {MongoError}
 * @return {null}
 */

GeneralCursor.INIT = 0;
GeneralCursor.OPEN = 1;
GeneralCursor.CLOSED = 2;

module.exports = GeneralCursor;