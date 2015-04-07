"use strict";

var checkCollectionName = require('./utils').checkCollectionName
  , ObjectID = require('mongodb-core').BSON.ObjectID
  , Long = require('mongodb-core').BSON.Long
  , Code = require('mongodb-core').BSON.Code
  , f = require('util').format
  , AggregationCursor = require('./aggregation_cursor')
  , MongoError = require('mongodb-core').MongoError
  , shallowClone = require('./utils').shallowClone
  , isObject = require('./utils').isObject
  , toError = require('./utils').toError
  , normalizeHintField = require('./utils').normalizeHintField
  , handleCallback = require('./utils').handleCallback
  , decorateCommand = require('./utils').decorateCommand
  , formattedOrderClause = require('./utils').formattedOrderClause
  , ReadPreference = require('./read_preference')
  , CoreReadPreference = require('mongodb-core').ReadPreference
  , CommandCursor = require('./command_cursor')
  , Cursor = require('./cursor')
  , unordered = require('./bulk/unordered')
  , ordered = require('./bulk/ordered');

/**
 * @fileOverview The **Collection** class is an internal class that embodies a MongoDB collection
 * allowing for insert/update/remove/find and other command operation on that MongoDB collection.
 * 
 * **COLLECTION Cannot directly be instantiated**
 * @example
 * var MongoClient = require('mongodb').MongoClient,
 *   test = require('assert');
 * // Connection url
 * var url = 'mongodb://localhost:27017/test';
 * // Connect using MongoClient
 * MongoClient.connect(url, function(err, db) {
 *   // Create a collection we want to drop later
 *   var col = db.collection('createIndexExample1');
 *   // Show that duplicate records got dropped
 *   col.find({}).toArray(function(err, items) {
 *     test.equal(null, err);
 *     test.equal(4, items.length);
 *     db.close();
 *   });
 * });
 */

/**
 * Create a new Collection instance (INTERNAL TYPE, do not instantiate directly)
 * @class
 * @property {string} collectionName Get the collection name.
 * @property {string} namespace Get the full collection namespace.
 * @property {object} writeConcern The current write concern values.
 * @property {object} hint Get current index hint for collection.
 * @return {Collection} a Collection instance.
 */
var Collection = function(db, topology, dbName, name, pkFactory, options) {  
  checkCollectionName(name);
  var self = this;
  // Unpack variables
  var internalHint = null;
  var opts = options != null && ('object' === typeof options) ? options : {};
  var slaveOk = options == null || options.slaveOk == null ? db.slaveOk : options.slaveOk;
  var serializeFunctions = options == null || options.serializeFunctions == null ? db.serializeFunctions : options.serializeFunctions;
  var raw = options == null || options.raw == null ? db.raw : options.raw;
  var readPreference = null;
  var collectionHint = null;
  var namespace = f("%s.%s", dbName, name);

  // Assign the right collection level readPreference
  if(options && options.readPreference) {
    readPreference = options.readPreference;
  } else if(db.options.readPreference) {
    readPreference = db.options.readPreference;
  }

  // Set custom primary key factory if provided
  pkFactory = pkFactory == null
    ? ObjectID
    : pkFactory;

  // Internal state
  this.s = {
    // Set custom primary key factory if provided
      pkFactory: pkFactory
    // Db
    , db: db
    // Topology
    , topology: topology
    // dbName
    , dbName: dbName
    // Options
    , options: options
    // Namespace
    , namespace: namespace
    // Read preference
    , readPreference: readPreference
    // Raw
    , raw: raw
    // SlaveOK
    , slaveOk: slaveOk
    // Serialize functions
    , serializeFunctions: serializeFunctions
    // internalHint
    , internalHint: internalHint
    // collectionHint
    , collectionHint: collectionHint
    // Name
    , name: name
  }
}

Object.defineProperty(Collection.prototype, 'collectionName', {
  enumerable: true, get: function() { return this.s.name; }
});

Object.defineProperty(Collection.prototype, 'namespace', {
  enumerable: true, get: function() { return this.s.namespace; }
});

Object.defineProperty(Collection.prototype, 'writeConcern', {
  enumerable:true,
  get: function() { 
    var ops = {};
    if(this.s.options.w != null) ops.w = this.s.options.w;
    if(this.s.options.j != null) ops.j = this.s.options.j;
    if(this.s.options.fsync != null) ops.fsync = this.s.options.fsync;
    if(this.s.options.wtimeout != null) ops.wtimeout = this.s.options.wtimeout;
    return ops;
  }
});

/**
 * @ignore
 */
Object.defineProperty(Collection.prototype, "hint", {
    enumerable: true
  , get: function () { return this.s.collectionHint; }
  , set: function (v) { this.s.collectionHint = normalizeHintField(v); }
});

/**
 * Creates a cursor for a query that can be used to iterate over results from MongoDB
 * @method
 * @param {object} query The cursor query object.
 * @throws {MongoError}
 * @return {Cursor}
 */
Collection.prototype.find = function() {
  var options
    , args = Array.prototype.slice.call(arguments, 0)
    , has_callback = typeof args[args.length - 1] === 'function'
    , has_weird_callback = typeof args[0] === 'function'
    , callback = has_callback ? args.pop() : (has_weird_callback ? args.shift() : null)
    , len = args.length
    , selector = len >= 1 ? args[0] : {}
    , fields = len >= 2 ? args[1] : undefined;

  if(len === 1 && has_weird_callback) {
    // backwards compat for callback?, options case
    selector = {};
    options = args[0];
  }

  if(len === 2 && !Array.isArray(fields)) {
    var fieldKeys = Object.keys(fields);
    var is_option = false;

    for(var i = 0; i < fieldKeys.length; i++) {
      if(testForFields[fieldKeys[i]] != null) {
        is_option = true;
        break;
      }
    }

    if(is_option) {
      options = fields;
      fields = undefined;
    } else {
      options = {};
    }
  } else if(len === 2 && Array.isArray(fields) && !Array.isArray(fields[0])) {
    var newFields = {};
    // Rewrite the array
    for(var i = 0; i < fields.length; i++) {
      newFields[fields[i]] = 1;
    }
    // Set the fields
    fields = newFields;
  }

  if(3 === len) {
    options = args[2];
  }

  // Ensure selector is not null
  selector = selector == null ? {} : selector;
  // Validate correctness off the selector
  var object = selector;
  if(Buffer.isBuffer(object)) {
    var object_size = object[0] | object[1] << 8 | object[2] << 16 | object[3] << 24;
    if(object_size != object.length)  {
      var error = new Error("query selector raw message size does not match message header size [" + object.length + "] != [" + object_size + "]");
      error.name = 'MongoError';
      throw error;
    }
  }

  // Validate correctness of the field selector
  var object = fields;
  if(Buffer.isBuffer(object)) {
    var object_size = object[0] | object[1] << 8 | object[2] << 16 | object[3] << 24;
    if(object_size != object.length)  {
      var error = new Error("query fields raw message size does not match message header size [" + object.length + "] != [" + object_size + "]");
      error.name = 'MongoError';
      throw error;
    }
  }

  // Check special case where we are using an objectId
  if(selector instanceof ObjectID || (selector != null && selector._bsontype == 'ObjectID')) {
    selector = {_id:selector};
  }

  // If it's a serialized fields field we need to just let it through
  // user be warned it better be good
  if(options && options.fields && !(Buffer.isBuffer(options.fields))) {
    fields = {};

    if(Array.isArray(options.fields)) {
      if(!options.fields.length) {
        fields['_id'] = 1;
      } else {
        for (var i = 0, l = options.fields.length; i < l; i++) {
          fields[options.fields[i]] = 1;
        }
      }
    } else {
      fields = options.fields;
    }
  }

  if (!options) options = {};

  var newOptions = {};
  // Make a shallow copy of options
  for (var key in options) {
    newOptions[key] = options[key];
  }

  // Unpack options
  newOptions.skip = len > 3 ? args[2] : options.skip ? options.skip : 0;
  newOptions.limit = len > 3 ? args[3] : options.limit ? options.limit : 0;
  newOptions.raw = options.raw != null && typeof options.raw === 'boolean' ? options.raw : this.s.raw;
  newOptions.hint = options.hint != null ? normalizeHintField(options.hint) : this.s.collectionHint;
  newOptions.timeout = len == 5 ? args[4] : typeof options.timeout === 'undefined' ? undefined : options.timeout;
  // // If we have overridden slaveOk otherwise use the default db setting
  newOptions.slaveOk = options.slaveOk != null ? options.slaveOk : this.s.db.slaveOk;

  // Add read preference if needed
  newOptions = getReadPreference(this, newOptions, this.s.db, this);
  // Set slave ok to true if read preference different from primary
  if(newOptions.readPreference != null
    && (newOptions.readPreference != 'primary' || newOptions.readPreference.mode != 'primary')) {
    newOptions.slaveOk = true;
  }

  // Ensure the query is an object
  if(selector != null && typeof selector != 'object') {
    throw new MongoError("query selector must be an object");
  }

  // Build the find command
  var findCommand = {
      find: this.s.namespace
    , limit: newOptions.limit
    , skip: newOptions.skip
    , query: selector
  }

  // Ensure we use the right await data option
  if(typeof newOptions.awaitdata == 'boolean')  {
    newOptions.awaitData = newOptions.awaitdata
  };
  
  // Translate to new command option noCursorTimeout
  if(typeof newOptions.timeout == 'boolean') newOptions.noCursorTimeout = newOptions.timeout;

  // Merge in options to command
  for(var name in newOptions) {
    if(newOptions[name] != null) findCommand[name] = newOptions[name];
  }

  // Format the fields
  var formatFields = function(fields) {
    var object = {};
    if(Array.isArray(fields)) {
      for(var i = 0; i < fields.length; i++) {
        if(Array.isArray(fields[i])) {
          object[fields[i][0]] = fields[i][1];
        } else {
          object[fields[i][0]] = 1;
        }
      }
    } else {
      object = fields;
    }

    return object;
  }

  // Special treatment for the fields selector
  if(fields) findCommand.fields = formatFields(fields);

  // Add db object to the new options
  newOptions.db = this.s.db;

  // Set raw if available at collection level
  if(newOptions.raw == null && this.s.raw) newOptions.raw = this.s.raw;

  // Sort options
  if(findCommand.sort) 
    findCommand.sort = formattedOrderClause(findCommand.sort);

  // Create the cursor
  if(typeof callback == 'function') return handleCallback(callback, null, this.s.topology.cursor(this.s.namespace, findCommand, newOptions));
  return this.s.topology.cursor(this.s.namespace, findCommand, newOptions);
}

/**
 * Inserts a single document into MongoDB.
 * @method
 * @param {object} doc Document to insert.
 * @param {object} [options=null] Optional settings.
 * @param {(number|string)} [options.w=null] The write concern.
 * @param {number} [options.wtimeout=null] The write concern timeout.
 * @param {boolean} [options.j=false] Specify a journal write concern.
 * @param {boolean} [options.serializeFunctions=false] Serialize functions on any object.
 * @param {boolean} [options.forceServerObjectId=false] Force server to assign _id values instead of driver.
 * @param {Collection~writeOpCallback} callback The command result callback   
 * @return {null}
 */
Collection.prototype.insertOne = function(doc, options, callback) {
  if(typeof options == 'function') callback = options, options = {};
  if(Array.isArray(doc)) return callback(new MongoError('doc parameter must be an object'));
  insertDocuments(this, [doc], options, function(err, r) {
    if(err) return callback(err);
    r.insertedCount = r.result.n;
    r.insertedId = doc._id;
    callback(null, r);
  });
}

/**
 * Inserts an array of documents into MongoDB.
 * @method
 * @param {object[]} docs Documents to insert.
 * @param {object} [options=null] Optional settings.
 * @param {(number|string)} [options.w=null] The write concern.
 * @param {number} [options.wtimeout=null] The write concern timeout.
 * @param {boolean} [options.j=false] Specify a journal write concern.
 * @param {boolean} [options.serializeFunctions=false] Serialize functions on any object.
 * @param {boolean} [options.forceServerObjectId=false] Force server to assign _id values instead of driver.
 * @param {Collection~writeOpCallback} callback The command result callback   
 * @return {null}
 */
Collection.prototype.insertMany = function(docs, options, callback) {
  if(typeof options == 'function') callback = options, options = {};
  if(!Array.isArray(docs)) return callback(new MongoError('docs parameter must be an array of documents'));    
  insertDocuments(this, docs, options, function(err, r) {
    if(err) return callback(err);
    r.insertedCount = r.result.n;
    var ids = [];
    for(var i = 0; i < docs.length; i++) {
      if(docs[i]._id) ids.push(docs[i]._id);
    }
    r.insertedIds = ids;
    callback(null, r);
  });
}

/**
 * @typedef {Object} Collection~BulkWriteOpResult
 * @property {number} insertedCount Number of documents inserted.
 * @property {number} matchedCount Number of documents matched for update.
 * @property {number} modifiedCount Number of documents modified.
 * @property {number} deletedCount Number of documents deleted.
 * @property {number} upsertedCount Number of documents upserted.
 * @property {object} insertedIds Inserted document generated Id's, hash key is the index of the originating operation
 * @property {object} upsertedIds Upserted document generated Id's, hash key is the index of the originating operation
 * @property {object} result The command result object.
 */

/**
 * The callback format for inserts
 * @callback Collection~bulkWriteOpCallback
 * @param {MongoError} error An error instance representing the error during the execution.
 * @param {Collection~BulkWriteOpResult} result The result object if the command was executed successfully.
 */

/**
 * Perform a bulkWrite operation without a fluent API
 *
 * Legal operation types are
 *
 *  { insertOne: { document: { a: 1 } } }
 *  { updateOne: { filter: {a:2}, update: {$set: {a:2}}, upsert:true } }
 *  { updateMany: { filter: {a:2}, update: {$set: {a:2}}, upsert:true } }
 *  { deleteOne: { filter: {c:1} } }
 *  { deleteMany: { filter: {c:1} } }
 *  { replaceOne: { filter: {c:3}, replacement: {c:4}, upsert:true}}]
 * 
 *
 * @method
 * @param {object[]} operations Bulk operations to perform.
 * @param {object} [options=null] Optional settings.
 * @param {(number|string)} [options.w=null] The write concern.
 * @param {number} [options.wtimeout=null] The write concern timeout.
 * @param {boolean} [options.j=false] Specify a journal write concern.
 * @param {boolean} [options.serializeFunctions=false] Serialize functions on any object.
 * @param {Collection~bulkWriteOpCallback} callback The command result callback   
 * @return {null}
 */
Collection.prototype.bulkWrite = function(operations, options, callback) {
  if(typeof options == 'function') callback = options, options = {};
  if(typeof callback != 'function') throw new MongoError("bulkWrite must have a callback function specified");
  if(!Array.isArray(operations)) throw new MongoError("operations must be an array of documents");
  var bulk = options.ordered == true || options.ordered == null ? this.initializeOrderedBulkOp() : this.initializeUnorderedBulkOp();
  
  // for each op go through and add to the bulk
  for(var i = 0; i < operations.length; i++) {
    bulk.raw(operations[i]);
  }

  // Final options for write concern
  var finalOptions = writeConcern(shallowClone(options), this.s.db, this, options);
  var writeCon = finalOptions.writeConcern ? finalOptions.writeConcern : {};

  // Execute the bulk
  bulk.execute(writeCon, function(err, r) {
    r.insertedCount = r.nInserted;
    r.matchedCount = r.nMatched;
    r.modifiedCount = r.nModified || 0;
    r.deletedCount = r.nRemoved;
    r.upsertedCount = r.getUpsertedIds().length;
    r.upsertedIds = {};
    r.insertedIds = {};

    // Inserted documents
    var inserted = r.getInsertedIds();
    // Map inserted ids
    for(var i = 0; i < inserted.length; i++) {
      r.insertedIds[inserted[i].index] = inserted[i]._id;
    }

    // Upserted documents
    var upserted = r.getUpsertedIds();
    // Map upserted ids
    for(var i = 0; i < upserted.length; i++) {
      r.upsertedIds[upserted[i].index] = upserted[i]._id;
    }    

    // Return the results
    callback(null, r);
  });
}

var insertDocuments = function(self, docs, options, callback) {
  if(typeof options == 'function') callback = options, options = {};
  options = options || {};
  // Ensure we are operating on an array op docs
  docs = Array.isArray(docs) ? docs : [docs];

  // Get the write concern options
  var finalOptions = writeConcern(shallowClone(options), self.s.db, self, options);
  if(typeof finalOptions.checkKeys != 'boolean') finalOptions.checkKeys = true;

  // If keep going set unordered
  if(options.keepGoing == true) finalOptions.ordered = false;
  finalOptions['serializeFunctions'] = options['serializeFunctions'] || self.s.serializeFunctions;

  // Add _id if not specified
  for(var i = 0; i < docs.length; i++) {
    if(docs[i]._id == null) docs[i]._id = self.s.pkFactory.createPk();
  }

  // File inserts
  self.s.topology.insert(self.s.namespace, docs, finalOptions, function(err, result) {
    if(callback == null) return;
    if(err) return handleCallback(callback, err);
    if(result == null) return handleCallback(callback, null, null);
    if(result.result.code) return handleCallback(callback, toError(result.result));
    if(result.result.writeErrors) return handleCallback(callback, toError(result.result.writeErrors[0]));
    // Add docs to the list
    result.ops = docs;
    // Return the results
    handleCallback(callback, null, result);   
  });  
}

/**
 * @typedef {Object} Collection~WriteOpResult
 * @property {object[]} ops All the documents inserted with their new _id values if forceServerObjectId == false.
 * @property {object} connection The connection object used for the operation.
 * @property {object} result The command result object.
 */

/**
 * The callback format for inserts
 * @callback Collection~writeOpCallback
 * @param {MongoError} error An error instance representing the error during the execution.
 * @param {Collection~WriteOpResult} result The result object if the command was executed successfully.
 */

/**
 * Inserts a single document or a an array of documents into MongoDB.
 * @method
 * @param {(object|object[])} docs Documents to insert.
 * @param {object} [options=null] Optional settings.
 * @param {(number|string)} [options.w=null] The write concern.
 * @param {number} [options.wtimeout=null] The write concern timeout.
 * @param {boolean} [options.j=false] Specify a journal write concern.
 * @param {boolean} [options.serializeFunctions=false] Serialize functions on any object.
 * @param {boolean} [options.forceServerObjectId=false] Force server to assign _id values instead of driver.
 * @param {Collection~writeOpCallback} callback The command result callback   
 * @return {null}
 * @deprecated
 */
Collection.prototype.insert = function(docs, options, callback) {
  return insertDocuments(this, docs, options, callback);
}

/**
 * Update a single document on MongoDB
 * @method
 * @param {object} filter The Filter used to select the document to update
 * @param {object} update The update operations to be applied to the document
 * @param {object} [options=null] Optional settings.
 * @param {boolean} [options.upsert=false] Update operation is an upsert.
 * @param {(number|string)} [options.w=null] The write concern.
 * @param {number} [options.wtimeout=null] The write concern timeout.
 * @param {boolean} [options.j=false] Specify a journal write concern.
 * @param {Collection~writeOpCallback} callback The command result callback   
 * @return {null}
 */
Collection.prototype.updateOne = function(filter, update, options, callback) {
  if(typeof options == 'function') callback = options, options = {};
  options = shallowClone(options)
  // Set single document update
  options.multi = false;
  // Execute update
  updateDocuments(this, filter, update, options, function(err, r) {
    if(err) return callback(err);
    r.matchedCount = r.result.n;
    r.modifiedCount = r.result.nModified != null ? r.result.nModified : r.result.n;
    r.upsertedId = Array.isArray(r.result.upserted) && r.result.upserted.length > 0 ? r.result.upserted[0] : null;
    r.upsertedCount = Array.isArray(r.result.upserted) && r.result.upserted.length ? r.result.upserted.length : 0;
    callback(null, r);      
  });
}

/**
 * Replace a document on MongoDB
 * @method
 * @param {object} filter The Filter used to select the document to update
 * @param {object} doc The Document that replaces the matching document
 * @param {object} [options=null] Optional settings.
 * @param {boolean} [options.upsert=false] Update operation is an upsert.
 * @param {(number|string)} [options.w=null] The write concern.
 * @param {number} [options.wtimeout=null] The write concern timeout.
 * @param {boolean} [options.j=false] Specify a journal write concern.
 * @param {Collection~writeOpCallback} callback The command result callback   
 * @return {null}
 */
Collection.prototype.replaceOne = function(filter, update, options, callback) {
  if(typeof options == 'function') callback = options, options = {};
  options = shallowClone(options)
  // Set single document update
  options.multi = false;
  // Execute update
  updateDocuments(this, filter, update, options, function(err, r) {
    if(err) return callback(err);
    r.matchedCount = r.result.n;
    r.modifiedCount = r.result.nModified != null ? r.result.nModified : r.result.n;
    r.upsertedId = Array.isArray(r.result.upserted) && r.result.upserted.length > 0 ? r.result.upserted[0] : null;
    r.upsertedCount = Array.isArray(r.result.upserted) && r.result.upserted.length ? r.result.upserted.length : 0;
    callback(null, r);      
  });
}

/**
 * Update multiple documents on MongoDB
 * @method
 * @param {object} filter The Filter used to select the document to update
 * @param {object} update The update operations to be applied to the document
 * @param {object} [options=null] Optional settings.
 * @param {boolean} [options.upsert=false] Update operation is an upsert.
 * @param {(number|string)} [options.w=null] The write concern.
 * @param {number} [options.wtimeout=null] The write concern timeout.
 * @param {boolean} [options.j=false] Specify a journal write concern.
 * @param {Collection~writeOpCallback} callback The command result callback   
 * @return {null}
 */
Collection.prototype.updateMany = function(filter, update, options, callback) {
  if(typeof options == 'function') callback = options, options = {};
  options = shallowClone(options)
  // Set single document update
  options.multi = true;
  // Execute update
  updateDocuments(this, filter, update, options, function(err, r) {
    if(err) return callback(err);
    r.matchedCount = r.result.n;
    r.modifiedCount = r.result.nModified != null ? r.result.nModified : r.result.n;
    r.upsertedId = Array.isArray(r.result.upserted) && r.result.upserted.length > 0 ? r.result.upserted[0] : null;
    r.upsertedCount = Array.isArray(r.result.upserted) && r.result.upserted.length ? r.result.upserted.length : 0;
    callback(null, r);      
  });
}

var updateDocuments = function(self, selector, document, options, callback) {
  if('function' === typeof options) callback = options, options = null;
  if(options == null) options = {};
  if(!('function' === typeof callback)) callback = null;

  // If we are not providing a selector or document throw
  if(selector == null || typeof selector != 'object') return callback(toError("selector must be a valid JavaScript object"));
  if(document == null || typeof document != 'object') return callback(toError("document must be a valid JavaScript object"));

  // Get the write concern options
  var finalOptions = writeConcern(shallowClone(options), self.s.db, self, options);

  // Do we return the actual result document
  // Either use override on the function, or go back to default on either the collection
  // level or db
  finalOptions['serializeFunctions'] = options['serializeFunctions'] || self.s.serializeFunctions;

  // Execute the operation
  var op = {q: selector, u: document};
  if(options.upsert) op.upsert = true;
  if(options.multi) op.multi = true;

  // Update options
  self.s.topology.update(self.s.namespace, [op], finalOptions, function(err, result) {
    if(callback == null) return;
    if(err) return handleCallback(callback, err, null);
    if(result == null) return handleCallback(callback, null, null);
    if(result.result.code) return handleCallback(callback, toError(result.result));
    if(result.result.writeErrors) return handleCallback(callback, toError(result.result.writeErrors[0]));
    // Return the results
    handleCallback(callback, null, result);   
  });  
}

/**
 * Updates documents.
 * @method
 * @param {object} selector The selector for the update operation.
 * @param {object} document The update document.
 * @param {object} [options=null] Optional settings.
 * @param {(number|string)} [options.w=null] The write concern.
 * @param {number} [options.wtimeout=null] The write concern timeout.
 * @param {boolean} [options.j=false] Specify a journal write concern.
 * @param {boolean} [options.upsert=false] Update operation is an upsert.
 * @param {boolean} [options.multi=false] Update one/all documents with operation.
 * @param {Collection~writeOpCallback} callback The command result callback
 * @throws {MongoError}
 * @return {null}
 * @deprecated
 */
Collection.prototype.update = function(selector, document, options, callback) {
  return updateDocuments(this, selector, document, options, callback);
}

/**
 * Delete a document on MongoDB
 * @method
 * @param {object} filter The Filter used to select the document to remove
 * @param {object} [options=null] Optional settings.
 * @param {(number|string)} [options.w=null] The write concern.
 * @param {number} [options.wtimeout=null] The write concern timeout.
 * @param {boolean} [options.j=false] Specify a journal write concern.
 * @param {Collection~writeOpCallback} callback The command result callback   
 * @return {null}
 */
Collection.prototype.deleteOne = function(filter, options, callback) {
  if(typeof options == 'function') callback = options, options = {};
  var options = shallowClone(options);    
  options.single = true;
  removeDocuments(this, filter, options, function(err, r) {
    if(err) return callback(err);
    r.deletedCount = r.result.n;
    callback(null, r);
  });
}

Collection.prototype.removeOne = Collection.prototype.deleteOne;

/**
 * Delete multiple documents on MongoDB
 * @method
 * @param {object} filter The Filter used to select the documents to remove
 * @param {object} [options=null] Optional settings.
 * @param {(number|string)} [options.w=null] The write concern.
 * @param {number} [options.wtimeout=null] The write concern timeout.
 * @param {boolean} [options.j=false] Specify a journal write concern.
 * @param {Collection~writeOpCallback} callback The command result callback   
 * @return {null}
 */
Collection.prototype.deleteMany = function(filter, options, callback) {
  if(typeof options == 'function') callback = options, options = {};
  var options = shallowClone(options);    
  options.single = false;
  removeDocuments(this, filter, options, function(err, r) {
    if(err) return callback(err);
    r.deletedCount = r.result.n;
    callback(null, r);
  });
}

Collection.prototype.removeMany = Collection.prototype.deleteMany;

var removeDocuments = function(self, selector, options, callback) {
  if(typeof options == 'function') {
    callback = options, options = {};
  } else if (typeof selector === 'function') {
    callback = selector;
    options = {};
    selector = {};
  }

  // Create an empty options object if the provided one is null
  options = options || {};

  // Get the write concern options
  var finalOptions = writeConcern(shallowClone(options), self.s.db, self, options);

  // If selector is null set empty
  if(selector == null) selector = {};

  // Build the op
  var op = {q: selector, limit: 0};
  if(options.single) op.limit = 1;

  // Execute the remove
  self.s.topology.remove(self.s.namespace, [op], finalOptions, function(err, result) {
    if(callback == null) return;
    if(err) return handleCallback(callback, err, null);
    if(result == null) return handleCallback(callback, null, null);
    if(result.result.code) return handleCallback(callback, toError(result.result));
    if(result.result.writeErrors) return handleCallback(callback, toError(result.result.writeErrors[0]));
    // Return the results
    handleCallback(callback, null, result);   
  });  
}

/**
 * Remove documents.
 * @method
 * @param {object} selector The selector for the update operation.
 * @param {object} [options=null] Optional settings.
 * @param {(number|string)} [options.w=null] The write concern.
 * @param {number} [options.wtimeout=null] The write concern timeout.
 * @param {boolean} [options.j=false] Specify a journal write concern.
 * @param {boolean} [options.single=false] Removes the first document found.
 * @param {Collection~writeOpCallback} callback The command result callback
 * @return {null}
 * @deprecated
 */
Collection.prototype.remove = function(selector, options, callback) {
  return removeDocuments(this, selector, options, callback);
}

/**
 * Save a document. Simple full document replacement function. Not recommended for efficiency, use atomic
 * operators and update instead for more efficient operations.
 * @method
 * @param {object} doc Document to save
 * @param {object} [options=null] Optional settings.
 * @param {(number|string)} [options.w=null] The write concern.
 * @param {number} [options.wtimeout=null] The write concern timeout.
 * @param {boolean} [options.j=false] Specify a journal write concern.
 * @param {Collection~writeOpCallback} callback The command result callback
 * @return {null}
 */
Collection.prototype.save = function(doc, options, callback) {
  if(typeof options == 'function') callback = options, options = {};
  options = options || {};

  // Get the write concern options
  var finalOptions = writeConcern(shallowClone(options), this.s.db, this, options);
  // Establish if we need to perform an insert or update
  if(doc._id != null) {
    finalOptions.upsert = true;
    return updateDocuments(this, {_id: doc._id}, doc, finalOptions, callback);
  }

  // Insert the document
  insertDocuments(this, [doc], options, function(err, r) {
    if(callback == null) return;
    if(doc == null) return handleCallback(callback, null, null);
    if(err) return handleCallback(callback, err, null);
    handleCallback(callback, null, r);
  });
}

/**
 * The callback format for results
 * @callback Collection~resultCallback
 * @param {MongoError} error An error instance representing the error during the execution.
 * @param {object} result The result object if the command was executed successfully.
 */

/**
 * Fetches the first document that matches the query
 * @method
 * @param {object} query Query for find Operation
 * @param {object} [options=null] Optional settings.
 * @param {number} [options.limit=0] Sets the limit of documents returned in the query.
 * @param {(array|object)} [options.sort=null] Set to sort the documents coming back from the query. Array of indexes, [['a', 1]] etc.
 * @param {object} [options.fields=null] The fields to return in the query. Object of fields to include or exclude (not both), {'a':1} 
 * @param {number} [options.skip=0] Set to skip N documents ahead in your query (useful for pagination).
 * @param {Object} [options.hint=null] Tell the query to use specific indexes in the query. Object of indexes to use, {'_id':1}
 * @param {boolean} [options.explain=false] Explain the query instead of returning the data.
 * @param {boolean} [options.snapshot=false] Snapshot query.
 * @param {boolean} [options.timeout=false] Specify if the cursor can timeout.
 * @param {boolean} [options.tailable=false] Specify if the cursor is tailable.
 * @param {number} [options.batchSize=0] Set the batchSize for the getMoreCommand when iterating over the query results.
 * @param {boolean} [options.returnKey=false] Only return the index key.
 * @param {number} [options.maxScan=null] Limit the number of items to scan. 
 * @param {number} [options.min=null] Set index bounds.
 * @param {number} [options.max=null] Set index bounds.
 * @param {boolean} [options.showDiskLoc=false] Show disk location of results.
 * @param {string} [options.comment=null] You can put a $comment field on a query to make looking in the profiler logs simpler.
 * @param {boolean} [options.raw=false] Return all BSON documents as Raw Buffer documents.
 * @param {(ReadPreference|string)} [options.readPreference=null] The preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
 * @param {boolean} [options.partial=false] Specify if the cursor should return partial results when querying against a sharded system
 * @param {number} [options.maxTimeMS=null] Number of miliseconds to wait before aborting the query.
 * @param {Collection~resultCallback} callback The command result callback
 * @return {null}
 */
Collection.prototype.findOne = function() {    
  var self = this;
  var args = Array.prototype.slice.call(arguments, 0);
  var callback = args.pop();
  var cursor = this.find.apply(this, args).limit(-1).batchSize(1);

  // Return the item
  cursor.next(function(err, item) {
    if(err != null) return handleCallback(callback, toError(err), null);
    handleCallback(callback, null, item);
  });
}

/**
 * The callback format for the collection method, must be used if strict is specified
 * @callback Collection~collectionResultCallback
 * @param {MongoError} error An error instance representing the error during the execution.
 * @param {Collection} collection The collection instance.
 */

/**
 * Rename the collection.
 *
 * @method
 * @param {string} newName New name of of the collection.
 * @param {object} [options=null] Optional settings.
 * @param {boolean} [options.dropTarget=false] Drop the target name collection if it previously exists.
 * @param {Collection~collectionResultCallback} callback The results callback
 * @return {null}
 */
Collection.prototype.rename = function(newName, opt, callback) {
  var self = this;
  if(typeof opt == 'function') callback = opt, opt = {};
  // Check the collection name
  checkCollectionName(newName);
  // Build the command
  var renameCollection = f("%s.%s", this.s.dbName, this.s.name);
  var toCollection =  f("%s.%s", this.s.dbName, newName);
  var dropTarget = typeof opt.dropTarget == 'boolean' ? opt.dropTarget : false;
  var cmd = {'renameCollection':renameCollection, 'to':toCollection, 'dropTarget':dropTarget};

  // Execute against admin
  self.s.db.admin().command(cmd, opt, function(err, doc) {
    if(err) return handleCallback(callback, err, null);
    // We have an error
    if(doc.errmsg) return handleCallback(callback, toError(doc), null);
    try {
      return handleCallback(callback, null, new Collection(self.s.db, self.s.topology, self.s.dbName, newName, self.s.pkFactory, self.s.options));
    } catch(err) {
      return handleCallback(callback, toError(err), null);
    }
  });
}

/**
 * Drop the collection from the database, removing it permanently. New accesses will create a new collection.
 *
 * @method
 * @param {Collection~resultCallback} callback The results callback
 * @return {null}
 */
Collection.prototype.drop = function(callback) {
  this.s.db.dropCollection(this.s.name, callback);
}

/**
 * Returns the options of the collection.
 *
 * @method
 * @param {Collection~resultCallback} callback The results callback
 * @return {null}
 */
Collection.prototype.options = function(callback) {
  var self = this;
  this.s.db.listCollections({name: this.s.name}).toArray(function(err, collections) {
    if(err) return handleCallback(callback, err);
    if(collections.length == 0) return handleCallback(callback, new MongoError(f("collection %s not found", self.s.namespace)));
    handleCallback(callback, err, collections[0].options || null);      
  });
}  

/**
 * Returns if the collection is a capped collection
 *
 * @method
 * @param {Collection~resultCallback} callback The results callback
 * @return {null}
 */
Collection.prototype.isCapped = function(callback) {
  this.options(function(err, document) {
    if(err) return handleCallback(callback, err);
    handleCallback(callback, null, document && document.capped);
  });    
}

/**
 * Creates an index on the db and collection collection.
 * @method
 * @param {(string|object)} fieldOrSpec Defines the index.
 * @param {object} [options=null] Optional settings.
 * @param {(number|string)} [options.w=null] The write concern.
 * @param {number} [options.wtimeout=null] The write concern timeout.
 * @param {boolean} [options.j=false] Specify a journal write concern.
 * @param {boolean} [options.unique=false] Creates an unique index.
 * @param {boolean} [options.sparse=false] Creates a sparse index.
 * @param {boolean} [options.background=false] Creates the index in the background, yielding whenever possible.
 * @param {boolean} [options.dropDups=false] A unique index cannot be created on a key that has pre-existing duplicate values. If you would like to create the index anyway, keeping the first document the database indexes and deleting all subsequent documents that have duplicate value
 * @param {number} [options.min=null] For geospatial indexes set the lower bound for the co-ordinates.
 * @param {number} [options.max=null] For geospatial indexes set the high bound for the co-ordinates.
 * @param {number} [options.v=null] Specify the format version of the indexes.
 * @param {number} [options.expireAfterSeconds=null] Allows you to expire data on indexes applied to a data (MongoDB 2.2 or higher)
 * @param {number} [options.name=null] Override the autogenerated index name (useful if the resulting name is larger than 128 bytes)
 * @param {Collection~resultCallback} callback The command result callback
 * @return {null}
 */
Collection.prototype.createIndex = function(fieldOrSpec, options, callback) {
  var args = Array.prototype.slice.call(arguments, 1);
  callback = args.pop();
  options = args.length ? args.shift() || {} : {};
  options = typeof callback === 'function' ? options : callback;
  options = options == null ? {} : options;
  // Execute create index
  this.s.db.createIndex(this.s.name, fieldOrSpec, options, callback);
}

/**
 * Creates multiple indexes in the collection, this method is only supported for
 * MongoDB 2.6 or higher. Earlier version of MongoDB will throw a command not supported
 * error. Index specifications are defined at http://docs.mongodb.org/manual/reference/command/createIndexes/.
 * @method
 * @param {array} indexSpecs An array of index specifications to be created 
 * @param {Collection~resultCallback} callback The command result callback
 * @return {null}
 */
Collection.prototype.createIndexes = function(indexSpecs, callback) {
  // Ensure we generate the correct name if the parameter is not set
  for(var i = 0; i < indexSpecs.length; i++) {
    if(indexSpecs[i].name == null) {
      var keys = [];

      for(var name in indexSpecs[i].key) {
        keys.push(f('%s_%s', name, indexSpecs[i].key[name]));
      }

      // Set the name
      indexSpecs[i].name = keys.join('_');
    }
  }

  // Execute the index
  this.s.db.command({ 
    createIndexes: this.s.name, indexes: indexSpecs
  }, callback);
}

/**
 * Drops an index from this collection.
 * @method
 * @param {string} indexName Name of the index to drop.
 * @param {object} [options=null] Optional settings.
 * @param {(number|string)} [options.w=null] The write concern.
 * @param {number} [options.wtimeout=null] The write concern timeout.
 * @param {boolean} [options.j=false] Specify a journal write concern.
 * @param {Collection~resultCallback} callback The command result callback
 * @return {null}
 */
Collection.prototype.dropIndex = function(indexName, options, callback) {
  var args = Array.prototype.slice.call(arguments, 1);
  callback = args.pop();
  options = args.length ? args.shift() || {} : {};

  // Delete index command
  var cmd = {'deleteIndexes':this.s.name, 'index':indexName};  

  // Execute command
  this.s.db.command(cmd, options, function(err, result) {
    if(typeof callback != 'function') return;
    if(err) return handleCallback(callback, err, null);
    handleCallback(callback, null, result);
  });
}

/**
 * Drops all indexes from this collection.
 * @method
 * @param {Collection~resultCallback} callback The command result callback
 * @return {null}
 */
Collection.prototype.dropIndexes = function(callback) {
  this.dropIndex('*', function (err, result) {
    if(err) return handleCallback(callback, err, false);
    handleCallback(callback, null, true);
  });  
}

/**
 * Drops all indexes from this collection.
 * @method
 * @deprecated since version 2.0
 * @param {Collection~resultCallback} callback The command result callback
 * @return {null}
 */
Collection.prototype.dropAllIndexes = Collection.prototype.dropIndexes;

/**
 * Reindex all indexes on the collection
 * Warning: reIndex is a blocking operation (indexes are rebuilt in the foreground) and will be slow for large collections.
 * @method
 * @param {Collection~resultCallback} callback The command result callback
 * @return {null}
 */
Collection.prototype.reIndex = function(options, callback) {
  if(typeof options == 'function') callback = options, options = {};
  options = options || {};
  
  // Reindex
  var cmd = {'reIndex':this.s.name};

  // Execute the command
  this.s.db.command(cmd, options, function(err, result) {
    if(callback == null) return;
    if(err) return handleCallback(callback, err, null);
    handleCallback(callback, null, result.ok ? true : false);
  });
}

/**
 * Get the list of all indexes information for the collection.
 *
 * @method
 * @param {object} [options=null] Optional settings.
 * @param {number} [options.batchSize=null] The batchSize for the returned command cursor or if pre 2.8 the systems batch collection
 * @return {CommandCursor}
 */
Collection.prototype.listIndexes = function(options) {
  options = options || {};
  // Clone the options
  options = shallowClone(options);
  // Set the CommandCursor constructor
  options.cursorFactory = CommandCursor;

  // We have a list collections command
  if(this.s.db.serverConfig.capabilities().hasListIndexesCommand) {
    // Cursor options
    var cursor = options.batchSize ? {batchSize: options.batchSize} : {}
    // Build the command
    var command = { listIndexes: this.s.name, cursor: cursor };
    // Execute the cursor
    return this.s.topology.cursor(f('%s.$cmd', this.s.dbName), command, options);
  }

  // Get the namespace
  var ns = f('%s.system.indexes', this.s.dbName);
  // Get the query
  return this.s.topology.cursor(ns, {find: ns, query: {ns: this.s.namespace}}, options);
};

/**
 * Ensures that an index exists, if it does not it creates it
 * @method
 * @deprecated since version 2.0
 * @param {(string|object)} fieldOrSpec Defines the index.
 * @param {object} [options=null] Optional settings.
 * @param {(number|string)} [options.w=null] The write concern.
 * @param {number} [options.wtimeout=null] The write concern timeout.
 * @param {boolean} [options.j=false] Specify a journal write concern.
 * @param {boolean} [options.unique=false] Creates an unique index.
 * @param {boolean} [options.sparse=false] Creates a sparse index.
 * @param {boolean} [options.background=false] Creates the index in the background, yielding whenever possible.
 * @param {boolean} [options.dropDups=false] A unique index cannot be created on a key that has pre-existing duplicate values. If you would like to create the index anyway, keeping the first document the database indexes and deleting all subsequent documents that have duplicate value
 * @param {number} [options.min=null] For geospatial indexes set the lower bound for the co-ordinates.
 * @param {number} [options.max=null] For geospatial indexes set the high bound for the co-ordinates.
 * @param {number} [options.v=null] Specify the format version of the indexes.
 * @param {number} [options.expireAfterSeconds=null] Allows you to expire data on indexes applied to a data (MongoDB 2.2 or higher)
 * @param {number} [options.name=null] Override the autogenerated index name (useful if the resulting name is larger than 128 bytes)
 * @param {Collection~resultCallback} callback The command result callback
 * @return {null}
 */
Collection.prototype.ensureIndex = function(fieldOrSpec, options, callback) {
  if(typeof options == 'function') callback = options, options = {};
  options = options || {};
  this.s.db.ensureIndex(this.s.name, fieldOrSpec, options, callback);
}

/**
 * Checks if one or more indexes exist on the collection, fails on first non-existing index
 * @method
 * @param {(string|array)} indexes One or more index names to check.
 * @param {Collection~resultCallback} callback The command result callback
 * @return {null}
 */
Collection.prototype.indexExists = function(indexes, callback) {
  this.indexInformation(function(err, indexInformation) {
    // If we have an error return
    if(err != null) return handleCallback(callback, err, null);
    // Let's check for the index names
    if(!Array.isArray(indexes)) return handleCallback(callback, null, indexInformation[indexes] != null);
    // Check in list of indexes
    for(var i = 0; i < indexes.length; i++) {
      if(indexInformation[indexes[i]] == null) {
        return handleCallback(callback, null, false);
      }
    }

    // All keys found return true
    return handleCallback(callback, null, true);
  });    
}

/**
 * Retrieves this collections index info.
 * @method
 * @param {object} [options=null] Optional settings.
 * @param {boolean} [options.full=false] Returns the full raw index information.
 * @param {Collection~resultCallback} callback The command result callback
 * @return {null}
 */
Collection.prototype.indexInformation = function(options, callback) {
  // Unpack calls
  var args = Array.prototype.slice.call(arguments, 0);
  callback = args.pop();
  options = args.length ? args.shift() || {} : {};
  // Call the index information
  this.s.db.indexInformation(this.s.name, options, callback);    
}

/**
 * The callback format for results
 * @callback Collection~countCallback
 * @param {MongoError} error An error instance representing the error during the execution.
 * @param {number} result The count of documents that matched the query.
 */

/**
 * Count number of matching documents in the db to a query.
 * @method
 * @param {object} query The query for the count.
 * @param {object} [options=null] Optional settings.
 * @param {boolean} [options.limit=null] The limit of documents to count.
 * @param {boolean} [options.skip=null] The number of documents to skip for the count.
 * @param {string} [options.hint=null] An index name hint for the query.
 * @param {(ReadPreference|string)} [options.readPreference=null] The preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
 * @param {Collection~countCallback} callback The command result callback
 * @return {null}
 */
Collection.prototype.count = function(query, options, callback) {
  var args = Array.prototype.slice.call(arguments, 0);
  callback = args.pop();
  query = args.length ? args.shift() || {} : {};
  options = args.length ? args.shift() || {} : {};
  var skip = options.skip;
  var limit = options.limit;
  var hint = options.hint;
  var maxTimeMS = options.maxTimeMS;

  // Final query
  var cmd = {
      'count': this.s.name, 'query': query
    , 'fields': null
  };

  // Add limit and skip if defined
  if(typeof skip == 'number') cmd.skip = skip;
  if(typeof limit == 'number') cmd.limit = limit;
  if(hint) options.hint = hint;

  // Ensure we have the right read preference inheritance
  options = getReadPreference(this, options, this.s.db, this);

  // Execute command
  this.s.db.command(cmd, options, function(err, result) {
    if(err) return handleCallback(callback, err);
    handleCallback(callback, null, result.n);
  });
};

/**
 * The distinct command returns returns a list of distinct values for the given key across a collection.
 * @method
 * @param {string} key Field of the document to find distinct values for.
 * @param {object} query The query for filtering the set of documents to which we apply the distinct filter.
 * @param {object} [options=null] Optional settings.
 * @param {(ReadPreference|string)} [options.readPreference=null] The preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
 * @param {Collection~resultCallback} callback The command result callback
 * @return {null}
 */
Collection.prototype.distinct = function(key, query, options, callback) {
  var args = Array.prototype.slice.call(arguments, 1);
  callback = args.pop();
  query = args.length ? args.shift() || {} : {};
  options = args.length ? args.shift() || {} : {};

  // maxTimeMS option
  var maxTimeMS = options.maxTimeMS;

  // Distinct command
  var cmd = {
    'distinct': this.s.name, 'key': key, 'query': query
  };

  // Ensure we have the right read preference inheritance
  options = getReadPreference(this, options, this.s.db, this);

  // Execute the command
  this.s.db.command(cmd, options, function(err, result) {
    if(err) return handleCallback(callback, err);
    handleCallback(callback, null, result.values);
  });
};

/**
 * Retrieve all the indexes on the collection.
 * @method
 * @param {Collection~resultCallback} callback The command result callback
 * @return {null}
 */
Collection.prototype.indexes = function(callback) {
  this.s.db.indexInformation(this.s.name, {full:true}, callback);    
}

/**
 * Get all the collection statistics.
 *
 * @method
 * @param {object} [options=null] Optional settings.
 * @param {number} [options.scale=null] Divide the returned sizes by scale value.
 * @param {Collection~resultCallback} callback The collection result callback
 * @return {null}
 */
Collection.prototype.stats = function(options, callback) {
  var args = Array.prototype.slice.call(arguments, 0);
  callback = args.pop();
  // Fetch all commands
  options = args.length ? args.shift() || {} : {};

  // Build command object
  var commandObject = {
    collStats:this.s.name
  }

  // Check if we have the scale value
  if(options['scale'] != null) commandObject['scale'] = options['scale'];

  // Ensure we have the right read preference inheritance
  options = getReadPreference(this, options, this.s.db, this);

  // Execute the command
  this.s.db.command(commandObject, options, callback);
}

/**
 * Find a document and delete it in one atomic operation, requires a write lock for the duration of the operation.
 *
 * @method
 * @param {object} filter Document selection filter.
 * @param {object} [options=null] Optional settings.
 * @param {object} [options.projection=null] Limits the fields to return for all matching documents.
 * @param {object} [options.sort=null] Determines which document the operation modifies if the query selects multiple documents.
 * @param {number} [options.maxTimeMS=null] The maximum amount of time to allow the query to run.
 * @param {Collection~resultCallback} callback The collection result callback
 * @return {null}
 */
Collection.prototype.findOneAndDelete = function(filter, options, callback) {
  if(typeof options == 'function') callback = options, options = {};
  this.findAndModify(
      filter
    , options.sort
    , null
    , {
        fields: options.projection
      , remove:true
    }
    , callback
  );
}

/**
 * Find a document and replace it in one atomic operation, requires a write lock for the duration of the operation.
 *
 * @method
 * @param {object} filter Document selection filter.
 * @param {object} replacement Document replacing the matching document.
 * @param {object} [options=null] Optional settings.
 * @param {object} [options.projection=null] Limits the fields to return for all matching documents.
 * @param {object} [options.sort=null] Determines which document the operation modifies if the query selects multiple documents.
 * @param {number} [options.maxTimeMS=null] The maximum amount of time to allow the query to run.
 * @param {boolean} [options.upsert=false] Upsert the document if it does not exist.
 * @param {boolean} [options.returnOriginal=true] When false, returns the updated document rather than the original. The default is true.
 * @param {Collection~resultCallback} callback The collection result callback
 * @return {null}
 */
Collection.prototype.findOneAndReplace = function(filter, replacement, options, callback) {
  if(typeof options == 'function') callback = options, options = {};
  this.findAndModify(
      filter
    , options.sort
    , replacement
    , {
        fields: options.projection
      , update: true
      , new: typeof options.returnOriginal == 'boolean' ? !options.returnOriginal : false
      , upsert: typeof options.upsert == 'boolean' ? options.upsert : false
    }
    , callback
  );
}

/**
 * Find a document and update it in one atomic operation, requires a write lock for the duration of the operation.
 *
 * @method
 * @param {object} filter Document selection filter.
 * @param {object} update Update operations to be performed on the document
 * @param {object} [options=null] Optional settings.
 * @param {object} [options.projection=null] Limits the fields to return for all matching documents.
 * @param {object} [options.sort=null] Determines which document the operation modifies if the query selects multiple documents.
 * @param {number} [options.maxTimeMS=null] The maximum amount of time to allow the query to run.
 * @param {boolean} [options.upsert=false] Upsert the document if it does not exist.
 * @param {boolean} [options.returnOriginal=true] When false, returns the updated document rather than the original. The default is true.
 * @param {Collection~resultCallback} callback The collection result callback
 * @return {null}
 */
Collection.prototype.findOneAndUpdate = function(filter, update, options, callback) {
  if(typeof options == 'function') callback = options, options = {};
  this.findAndModify(
      filter
    , options.sort
    , update
    , {
        fields: options.projection
      , update: true
      , new: typeof options.returnOriginal == 'boolean' ? !options.returnOriginal : false
      , upsert: typeof options.upsert == 'boolean' ? options.upsert : false
    }
    , callback
  );
}

/**
 * Find and update a document.
 * @method
 * @param {object} query Query object to locate the object to modify.
 * @param {array} sort If multiple docs match, choose the first one in the specified sort order as the object to manipulate.
 * @param {object} doc The fields/vals to be updated.
 * @param {object} [options=null] Optional settings.
 * @param {(number|string)} [options.w=null] The write concern.
 * @param {number} [options.wtimeout=null] The write concern timeout.
 * @param {boolean} [options.j=false] Specify a journal write concern.
 * @param {boolean} [options.remove=false] Set to true to remove the object before returning.
 * @param {boolean} [options.upsert=false] Perform an upsert operation.
 * @param {boolean} [options.new=false] Set to true if you want to return the modified object rather than the original. Ignored for remove.
 * @param {object} [options.fields=null] Object containing the field projection for the result returned from the operation.
 * @param {Collection~resultCallback} callback The command result callback
 * @return {null}
 * @deprecated 
 */
Collection.prototype.findAndModify = function(query, sort, doc, options, callback) {
  var args = Array.prototype.slice.call(arguments, 1);
  callback = args.pop();
  sort = args.length ? args.shift() || [] : [];
  doc = args.length ? args.shift() : null;
  options = args.length ? args.shift() || {} : {};

  var queryObject = {
     'findandmodify': this.s.name
   , 'query': query
  };

  sort = formattedOrderClause(sort);
  if(sort) {
    queryObject.sort = sort;
  }

  queryObject.new = options.new ? true : false;
  queryObject.remove = options.remove ? true : false;
  queryObject.upsert = options.upsert ? true : false;

  if(options.fields) {
    queryObject.fields = options.fields;
  }

  if(doc && !options.remove) {
    queryObject.update = doc;
  }

  // Either use override on the function, or go back to default on either the collection
  // level or db
  if(options['serializeFunctions'] != null) {
    options['serializeFunctions'] = options['serializeFunctions'];
  } else {
    options['serializeFunctions'] = this.s.serializeFunctions;
  }

  // No check on the documents
  options.checkKeys = false;

  // Execute the command
  this.s.db.command(queryObject
    , options, function(err, result) {
      if(err) return handleCallback(callback, err, null);
      return handleCallback(callback, null, result);
  });
}

/**
 * Find and remove a document.
 * @method
 * @param {object} query Query object to locate the object to modify.
 * @param {array} sort If multiple docs match, choose the first one in the specified sort order as the object to manipulate.
 * @param {object} [options=null] Optional settings.
 * @param {(number|string)} [options.w=null] The write concern.
 * @param {number} [options.wtimeout=null] The write concern timeout.
 * @param {boolean} [options.j=false] Specify a journal write concern.
 * @param {Collection~resultCallback} callback The command result callback
 * @return {null}
 * @deprecated
 */
Collection.prototype.findAndRemove = function(query, sort, options, callback) {
  var args = Array.prototype.slice.call(arguments, 1);
  callback = args.pop();
  sort = args.length ? args.shift() || [] : [];
  options = args.length ? args.shift() || {} : {};
  // Add the remove option
  options['remove'] = true;
  // Execute the callback
  this.findAndModify(query, sort, null, options, callback);
}

/**
 * Execute an aggregation framework pipeline against the collection, needs MongoDB >= 2.2
 * @method
 * @param {object} pipeline Array containing all the aggregation framework commands for the execution.
 * @param {object} [options=null] Optional settings.
 * @param {(ReadPreference|string)} [options.readPreference=null] The preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
 * @param {object} [options.cursor=null] Return the query as cursor, on 2.6 > it returns as a real cursor on pre 2.6 it returns as an emulated cursor.
 * @param {number} [options.cursor.batchSize=null] The batchSize for the cursor
 * @param {boolean} [options.explain=false] Explain returns the aggregation execution plan (requires mongodb 2.6 >).
 * @param {boolean} [options.allowDiskUse=false] allowDiskUse lets the server know if it can use disk to store temporary results for the aggregation (requires mongodb 2.6 >).
 * @param {number} [options.maxTimeMS=null] maxTimeMS specifies a cumulative time limit in milliseconds for processing operations on the cursor. MongoDB interrupts the operation at the earliest following interrupt point.
 * @param {Collection~resultCallback} callback The command result callback
 * @return {(null|AggregationCursor)}
 */
Collection.prototype.aggregate = function(pipeline, options, callback) {
  if(Array.isArray(pipeline)) {
    // Set up callback if one is provided
    if(typeof options == 'function') {
      callback = options;
      options = {};
    }

    // If we have no options or callback we are doing
    // a cursor based aggregation
    if(options == null && callback == null) {
      options = {};
    }      
  } else {
    // Aggregation pipeline passed as arguments on the method
    var args = Array.prototype.slice.call(arguments, 0);
    // Get the callback
    callback = args.pop();
    // Get the possible options object
    var opts = args[args.length - 1];
    // If it contains any of the admissible options pop it of the args
    options = opts && (opts.readPreference 
      || opts.explain || opts.cursor || opts.out
      || opts.maxTimeMS || opts.allowDiskUse) ? args.pop() : {};
      // Left over arguments is the pipeline
    pipeline = args;
  }

  // If out was specified
  if(typeof options.out == 'string') {
    pipeline.push({$out: options.out});
  }

  // Build the command
  var command = { aggregate : this.s.name, pipeline : pipeline};
  // If we have allowDiskUse defined
  if(options.allowDiskUse) command.allowDiskUse = options.allowDiskUse;
  if(typeof options.maxTimeMS == 'number') command.maxTimeMS = options.maxTimeMS;

  // Ensure we have the right read preference inheritance
  options = getReadPreference(this, options, this.s.db, this);

  // If explain has been specified add it
  if(options.explain) command.explain = options.explain;

  // Validate that cursor options is valid
  if(options.cursor != null && typeof options.cursor != 'object') {
    throw toError('cursor options must be an object');
  }

  // Set the AggregationCursor constructor
  options.cursorFactory = AggregationCursor;
  if(typeof callback != 'function') {
    if(this.s.topology.capabilities().hasAggregationCursor) {
      options.cursor = options.cursor || { batchSize : 1000 };
      command.cursor = options.cursor;        
    }

    // Allow disk usage command
    if(typeof options.allowDiskUse == 'boolean') command.allowDiskUse = options.allowDiskUse;
    if(typeof options.maxTimeMS == 'number') command.maxTimeMS = options.maxTimeMS;

    // Execute the cursor
    return this.s.topology.cursor(this.s.namespace, command, options);
  }

  var cursor = null;
  // We do not allow cursor
  if(options.cursor) {
    return this.s.topology.cursor(this.s.namespace, command, options);
  }

  // Execute the command
  this.s.db.command(command, options, function(err, result) {
    if(err) {
      handleCallback(callback, err);
    } else if(result['err'] || result['errmsg']) {
      handleCallback(callback, toError(result));
    } else if(typeof result == 'object' && result['serverPipeline']) {
      handleCallback(callback, null, result['serverPipeline']);
    } else if(typeof result == 'object' && result['stages']) {
      handleCallback(callback, null, result['stages']);
    } else {
      handleCallback(callback, null, result.result);
    }
  });
}

/**
 * The callback format for results
 * @callback Collection~parallelCollectionScanCallback
 * @param {MongoError} error An error instance representing the error during the execution.
 * @param {Cursor[]} cursors A list of cursors returned allowing for parallel reading of collection.
 */

/**
 * Return N number of parallel cursors for a collection allowing parallel reading of entire collection. There are
 * no ordering guarantees for returned results.
 * @method
 * @param {object} [options=null] Optional settings.
 * @param {(ReadPreference|string)} [options.readPreference=null] The preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
 * @param {number} [options.batchSize=null] Set the batchSize for the getMoreCommand when iterating over the query results.
 * @param {number} [options.numCursors=1] The maximum number of parallel command cursors to return (the number of returned cursors will be in the range 1:numCursors)
 * @param {boolean} [options.raw=false] Return all BSON documents as Raw Buffer documents.
 * @param {Collection~parallelCollectionScanCallback} callback The command result callback
 * @return {null}
 */
Collection.prototype.parallelCollectionScan = function(options, callback) {
  var self = this;
  if(typeof options == 'function') callback = options, options = {numCursors: 1};
  // Set number of cursors to 1
  options.numCursors = options.numCursors || 1;
  options.batchSize = options.batchSize || 1000;

  // Ensure we have the right read preference inheritance
  options = getReadPreference(this, options, this.s.db, this);
  
  // Create command object
  var commandObject = {
      parallelCollectionScan: this.s.name
    , numCursors: options.numCursors
  }

  // Execute the command
  this.s.db.command(commandObject, options, function(err, result) {
    if(err) return handleCallback(callback, err, null);
    if(result == null) return handleCallback(callback, new Error("no result returned for parallelCollectionScan"), null);

    var cursors = [];
    // Create command cursors for each item
    for(var i = 0; i < result.cursors.length; i++) {
      var rawId = result.cursors[i].cursor.id
      // Convert cursorId to Long if needed
      var cursorId = typeof rawId == 'number' ? Long.fromNumber(rawId) : rawId;

      // Command cursor options
      var cmd = {
          batchSize: options.batchSize
        , cursorId: cursorId
        , items: result.cursors[i].cursor.firstBatch
      }

      // Add a command cursor
      cursors.push(self.s.topology.cursor(self.s.namespace, cursorId, options));
    }

    handleCallback(callback, null, cursors);
  });
}

/**
 * Execute the geoNear command to search for items in the collection
 *
 * @method   
 * @param {number} x Point to search on the x axis, ensure the indexes are ordered in the same order.
 * @param {number} y Point to search on the y axis, ensure the indexes are ordered in the same order.
 * @param {object} [options=null] Optional settings.
 * @param {(ReadPreference|string)} [options.readPreference=null] The preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
 * @param {number} [options.num=null] Max number of results to return.
 * @param {number} [options.minDistance=null] Include results starting at minDistance from a point (2.6 or higher)
 * @param {number} [options.maxDistance=null] Include results up to maxDistance from the point.
 * @param {number} [options.distanceMultiplier=null] Include a value to multiply the distances with allowing for range conversions.
 * @param {object} [options.query=null] Filter the results by a query.
 * @param {boolean} [options.spherical=false] Perform query using a spherical model.
 * @param {boolean} [options.uniqueDocs=false] The closest location in a document to the center of the search region will always be returned MongoDB > 2.X.
 * @param {boolean} [options.includeLocs=false] Include the location data fields in the top level of the results MongoDB > 2.X. 
 * @param {Collection~resultCallback} callback The command result callback
 * @return {null}
 */
Collection.prototype.geoNear = function(x, y, options, callback) {
  var point = typeof(x) == 'object' && x
    , args = Array.prototype.slice.call(arguments, point?1:2);

  callback = args.pop();
  // Fetch all commands
  options = args.length ? args.shift() || {} : {};

  // Build command object
  var commandObject = {
    geoNear:this.s.name,
    near: point || [x, y]
  }

  // Ensure we have the right read preference inheritance
  options = getReadPreference(this, options, this.s.db, this);

  // Exclude readPreference and existing options to prevent user from
  // shooting themselves in the foot
  var exclude = {
    readPreference: true, 
    geoNear: true,
    near: true  
  };

  // Filter out any excluded objects
  commandObject = decorateCommand(commandObject, options, exclude);

  // Execute the command
  this.s.db.command(commandObject, options, function (err, res) {
    if(err) return handleCallback(callback, err);
    if(res.err || res.errmsg) return handleCallback(callback, toError(res));
    // should we only be returning res.results here? Not sure if the user
    // should see the other return information
    handleCallback(callback, null, res);
  });
}

/**
 * Execute a geo search using a geo haystack index on a collection.
 *
 * @method   
 * @param {number} x Point to search on the x axis, ensure the indexes are ordered in the same order.
 * @param {number} y Point to search on the y axis, ensure the indexes are ordered in the same order.
 * @param {object} [options=null] Optional settings.
 * @param {(ReadPreference|string)} [options.readPreference=null] The preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
 * @param {number} [options.maxDistance=null] Include results up to maxDistance from the point.
 * @param {object} [options.search=null] Filter the results by a query.
 * @param {number} [options.limit=false] Max number of results to return.
 * @param {Collection~resultCallback} callback The command result callback
 * @return {null}
 */
Collection.prototype.geoHaystackSearch = function(x, y, options, callback) {
  var args = Array.prototype.slice.call(arguments, 2);
  callback = args.pop();
  // Fetch all commands
  options = args.length ? args.shift() || {} : {};

  // Build command object
  var commandObject = {
    geoSearch: this.s.name,
    near: [x, y]
  }

  // Remove read preference from hash if it exists
  commandObject = decorateCommand(commandObject, options, {readPreference: true});

  // Ensure we have the right read preference inheritance
  options = getReadPreference(this, options, this.s.db, this);

  // Execute the command
  this.s.db.command(commandObject, options, function (err, res) {
    if(err) return handleCallback(callback, err);
    if(res.err || res.errmsg) handleCallback(callback, utils.toError(res));
    // should we only be returning res.results here? Not sure if the user
    // should see the other return information
    handleCallback(callback, null, res);
  });
}

/**
 * Group function helper
 * @ignore
 */
var groupFunction = function () {
  var c = db[ns].find(condition);
  var map = new Map();
  var reduce_function = reduce;

  while (c.hasNext()) {
    var obj = c.next();
    var key = {};

    for (var i = 0, len = keys.length; i < len; ++i) {
      var k = keys[i];
      key[k] = obj[k];
    }

    var aggObj = map.get(key);

    if (aggObj == null) {
      var newObj = Object.extend({}, key);
      aggObj = Object.extend(newObj, initial);
      map.put(key, aggObj);
    }

    reduce_function(obj, aggObj);
  }

  return { "result": map.values() };
}.toString();

/**
 * Run a group command across a collection
 *
 * @method   
 * @param {(object|array|function|code)} keys An object, array or function expressing the keys to group by.
 * @param {object} condition An optional condition that must be true for a row to be considered.
 * @param {object} initial Initial value of the aggregation counter object.
 * @param {(function|Code)} reduce The reduce function aggregates (reduces) the objects iterated
 * @param {(function|Code)} finalize An optional function to be run on each item in the result set just before the item is returned.
 * @param {boolean} command Specify if you wish to run using the internal group command or using eval, default is true.
 * @param {object} [options=null] Optional settings.
 * @param {(ReadPreference|string)} [options.readPreference=null] The preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
 * @param {Collection~resultCallback} callback The command result callback
 * @return {null}
 */
Collection.prototype.group = function(keys, condition, initial, reduce, finalize, command, options, callback) {
  var args = Array.prototype.slice.call(arguments, 3);
  callback = args.pop();
  // Fetch all commands
  reduce = args.length ? args.shift() : null;
  finalize = args.length ? args.shift() : null;
  command = args.length ? args.shift() : null;
  options = args.length ? args.shift() || {} : {};

  // Make sure we are backward compatible
  if(!(typeof finalize == 'function')) {
    command = finalize;
    finalize = null;
  }

  if (!Array.isArray(keys) && keys instanceof Object && typeof(keys) !== 'function' && !(keys instanceof Code)) {
    keys = Object.keys(keys);
  }

  if(typeof reduce === 'function') {
    reduce = reduce.toString();
  }

  if(typeof finalize === 'function') {
    finalize = finalize.toString();
  }

  // Set up the command as default
  command = command == null ? true : command;

  // Execute using the command
  if(command) {
    var reduceFunction = reduce instanceof Code
        ? reduce
        : new Code(reduce);

    var selector = {
      group: {
          'ns': this.s.name
        , '$reduce': reduceFunction
        , 'cond': condition
        , 'initial': initial
        , 'out': "inline"
      }
    };

    // if finalize is defined
    if(finalize != null) selector.group['finalize'] = finalize;
    // Set up group selector
    if ('function' === typeof keys || keys instanceof Code) {
      selector.group.$keyf = keys instanceof Code
        ? keys
        : new Code(keys);
    } else {
      var hash = {};
      keys.forEach(function (key) {
        hash[key] = 1;
      });
      selector.group.key = hash;
    }

    // Ensure we have the right read preference inheritance
    options = getReadPreference(this, options, this.s.db, this);
    // Execute command
    this.s.db.command(selector, options, function(err, result) {
      if(err) return handleCallback(callback, err, null);
      handleCallback(callback, null, result.retval);
    });
  } else {
    // Create execution scope
    var scope = reduce != null && reduce instanceof Code
      ? reduce.scope
      : {};

    scope.ns = this.s.name;
    scope.keys = keys;
    scope.condition = condition;
    scope.initial = initial;

    // Pass in the function text to execute within mongodb.
    var groupfn = groupFunction.replace(/ reduce;/, reduce.toString() + ';');

    this.s.db.eval(new Code(groupfn, scope), function (err, results) {
      if (err) return handleCallback(callback, err, null);
      handleCallback(callback, null, results.result || results);
    });
  }
}

/**
 * Functions that are passed as scope args must
 * be converted to Code instances.
 * @ignore
 */
function processScope (scope) {
  if(!isObject(scope)) {
    return scope;
  }

  var keys = Object.keys(scope);
  var i = keys.length;
  var key;
  var new_scope = {};

  while (i--) {
    key = keys[i];
    if ('function' == typeof scope[key]) {
      new_scope[key] = new Code(String(scope[key]));
    } else {
      new_scope[key] = processScope(scope[key]);
    }
  }

  return new_scope;
}

/**
 * Run Map Reduce across a collection. Be aware that the inline option for out will return an array of results not a collection.
 *
 * @method   
 * @param {(function|string)} map The mapping function.
 * @param {(function|string)} reduce The reduce function.
 * @param {object} [options=null] Optional settings.
 * @param {(ReadPreference|string)} [options.readPreference=null] The preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
 * @param {object} [options.out=null] Sets the output target for the map reduce job. *{inline:1} | {replace:'collectionName'} | {merge:'collectionName'} | {reduce:'collectionName'}*
 * @param {object} [options.query=null] Query filter object.
 * @param {object} [options.sort=null] Sorts the input objects using this key. Useful for optimization, like sorting by the emit key for fewer reduces.
 * @param {number} [options.limit=null] Number of objects to return from collection.
 * @param {boolean} [options.keeptemp=false] Keep temporary data.
 * @param {(function|string)} [options.finalize=null] Finalize function.
 * @param {object} [options.scope=null] Can pass in variables that can be access from map/reduce/finalize.
 * @param {boolean} [options.jsMode=false] It is possible to make the execution stay in JS. Provided in MongoDB > 2.0.X.
 * @param {boolean} [options.verbose=false] Provide statistics on job execution time.
 * @param {Collection~resultCallback} callback The command result callback
 * @throws {MongoError}
 * @return {null}
 */
Collection.prototype.mapReduce = function(map, reduce, options, callback) {
  var self = this;
  if('function' === typeof options) callback = options, options = {};
  // Out must allways be defined (make sure we don't break weirdly on pre 1.8+ servers)
  if(null == options.out) {
    throw new Error("the out option parameter must be defined, see mongodb docs for possible values");
  }

  if('function' === typeof map) {
    map = map.toString();
  }

  if('function' === typeof reduce) {
    reduce = reduce.toString();
  }

  if('function' === typeof options.finalize) {
    options.finalize = options.finalize.toString();
  }

  var mapCommandHash = {
      mapreduce: this.s.name
    , map: map
    , reduce: reduce
  };

  // Add any other options passed in
  for(var n in options) {
    if('scope' == n) {
      mapCommandHash[n] = processScope(options[n]);
    } else {
      mapCommandHash[n] = options[n];
    }
  }

  // Ensure we have the right read preference inheritance
  options = getReadPreference(this, options, this.s.db, this);

  // If we have a read preference and inline is not set as output fail hard
  if((options.readPreference != false && options.readPreference != 'primary') 
    && options['out'] && (options['out'].inline != 1 && options['out'] != 'inline')) {
      options.readPreference = 'primary';    
  }

  // Execute command
  this.s.db.command(mapCommandHash, {readPreference:options.readPreference}, function (err, result) {
    if(err) return handleCallback(callback, err);
    // Check if we have an error
    if(1 != result.ok || result.err || result.errmsg) {
      return handleCallback(callback, toError(result));
    }

    // Create statistics value
    var stats = {};
    if(result.timeMillis) stats['processtime'] = result.timeMillis;
    if(result.counts) stats['counts'] = result.counts;
    if(result.timing) stats['timing'] = result.timing;

    // invoked with inline?
    if(result.results) {
      // If we wish for no verbosity
      if(options['verbose'] == null || !options['verbose']) {
        return handleCallback(callback, null, result.results);
      }
      
      return handleCallback(callback, null, result.results, stats);
    }

    // The returned collection
    var collection = null;

    // If we have an object it's a different db
    if(result.result != null && typeof result.result == 'object') {
      var doc = result.result;
      collection = self.s.db.db(doc.db).collection(doc.collection);
    } else {
      // Create a collection object that wraps the result collection
      collection = self.s.db.collection(result.result)
    }

    // If we wish for no verbosity
    if(options['verbose'] == null || !options['verbose']) {
      return handleCallback(callback, err, collection);
    }

    // Return stats as third set of values
    handleCallback(callback, err, collection, stats);
  });
}

/**
 * Initiate a Out of order batch write operation. All operations will be buffered into insert/update/remove commands executed out of order.
 *
 * @method   
 * @param {object} [options=null] Optional settings.
 * @param {(number|string)} [options.w=null] The write concern.
 * @param {number} [options.wtimeout=null] The write concern timeout.
 * @param {boolean} [options.j=false] Specify a journal write concern.
 * @param {UnorderedBulkOperation} callback The command result callback
 * @return {null}
 */
Collection.prototype.initializeUnorderedBulkOp = function(options) {
  return unordered(this.s.topology, this, options);
}

/**
 * Initiate an In order bulk write operation, operations will be serially executed in the order they are added, creating a new operation for each switch in types.
 *
 * @method   
 * @param {object} [options=null] Optional settings.
 * @param {(number|string)} [options.w=null] The write concern.
 * @param {number} [options.wtimeout=null] The write concern timeout.
 * @param {boolean} [options.j=false] Specify a journal write concern.
 * @param {OrderedBulkOperation} callback The command result callback
 * @return {null}
 */
Collection.prototype.initializeOrderedBulkOp = function(options) {
  return ordered(this.s.topology, this, options);
}

// Get write concern
var writeConcern = function(target, db, col, options) {
  if(options.w != null || options.j != null || options.fsync != null) {
    var opts = {};
    if(options.w != null) opts.w = options.w;
    if(options.wtimeout != null) opts.wtimeout = options.wtimeout;
    if(options.j != null) opts.j = options.j;
    if(options.fsync != null) opts.fsync = options.fsync;
    target.writeConcern = opts;
  } else if(col.writeConcern.w != null || col.writeConcern.j != null || col.writeConcern.fsync != null) {      
    target.writeConcern = col.writeConcern;
  } else if(db.writeConcern.w != null || db.writeConcern.j != null || db.writeConcern.fsync != null) {
    target.writeConcern = db.writeConcern;
  }

  return target
}

// Figure out the read preference
var getReadPreference = function(self, options, db, coll) {
  var r = null
  if(options.readPreference) {
    r = options.readPreference
  } else if(self.s.readPreference) {
    r = self.s.readPreference
  } else if(db.readPreference) {
    r = db.readPreference;
  }

  if(r instanceof ReadPreference) {      
    options.readPreference = new CoreReadPreference(r.mode, r.tags);
  } else if(typeof r == 'string') {
    options.readPreference = new CoreReadPreference(r);
  }

  return options;
}

var testForFields = {
    limit: 1, sort: 1, fields:1, skip: 1, hint: 1, explain: 1, snapshot: 1, timeout: 1, tailable: 1, tailableRetryInterval: 1
  , numberOfRetries: 1, awaitdata: 1, awaitData: 1, exhaust: 1, batchSize: 1, returnKey: 1, maxScan: 1, min: 1, max: 1, showDiskLoc: 1
  , comment: 1, raw: 1, readPreference: 1, partial: 1, read: 1, dbName: 1, oplogReplay: 1, connection: 1, maxTimeMS: 1, transforms: 1
}

module.exports = Collection;
