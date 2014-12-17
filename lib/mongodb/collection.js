/**
 * Module dependencies.
 * @ignore
 */
var InsertCommand = require('./commands/insert_command').InsertCommand
  , QueryCommand = require('./commands/query_command').QueryCommand
  , DeleteCommand = require('./commands/delete_command').DeleteCommand
  , UpdateCommand = require('./commands/update_command').UpdateCommand
  , DbCommand = require('./commands/db_command').DbCommand
  , ObjectID = require('bson').ObjectID
  , Code = require('bson').Code
  , Cursor = require('./cursor').Cursor
  , utils = require('./utils')
  , shared = require('./collection/shared')
  , core = require('./collection/core')
  , query = require('./collection/query')
  , index = require('./collection/index')
  , geo = require('./collection/geo')
  , commands = require('./collection/commands')
  , aggregation = require('./collection/aggregation')
  , unordered = require('./collection/batch/unordered')
  , ordered = require('./collection/batch/ordered');

/**
 * Create a new Collection instance (INTERNAL TYPE, do not instantiate directly)
 *
 * Options
 *  - **readPreference** {String}, the prefered read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
 *  - **slaveOk** {Boolean, default:false}, Allow reads from secondaries.
 *  - **serializeFunctions** {Boolean, default:false}, serialize functions on the document.
 *  - **raw** {Boolean, default:false}, perform all operations using raw bson objects.
 *  - **pkFactory** {Object}, object overriding the basic ObjectID primary key generation.
 *
 * @class Represents a Collection
 * @param {Object} db db instance.
 * @param {String} collectionName collection name.
 * @param {Object} [pkFactory] alternative primary key factory.
 * @param {Object} [options] additional options for the collection.
 * @return {Object} a collection instance.
 */
function Collection (db, collectionName, pkFactory, options) {
  if(!(this instanceof Collection)) return new Collection(db, collectionName, pkFactory, options);

  shared.checkCollectionName(collectionName);

  this.db = db;
  this.collectionName = collectionName;
  this.internalHint = null;
  this.opts = options != null && ('object' === typeof options) ? options : {};
  this.slaveOk = options == null || options.slaveOk == null ? db.slaveOk : options.slaveOk;
  this.serializeFunctions = options == null || options.serializeFunctions == null ? db.serializeFunctions : options.serializeFunctions;
  this.raw = options == null || options.raw == null ? db.raw : options.raw;

  // Assign the right collection level readPreference
  if(options && options.readPreference) {
    this.readPreference = options.readPreference;
  } else if(this.db.options.readPreference) {
    this.readPreference = this.db.options.readPreference;
  } else if(this.db.serverConfig.options.readPreference) {
    this.readPreference = this.db.serverConfig.options.readPreference;
  }

  // Set custom primary key factory if provided
  this.pkFactory = pkFactory == null
    ? ObjectID
    : pkFactory;

  // Server Capabilities
  this.serverCapabilities = this.db.serverConfig._serverCapabilities;
}

/**
 * Inserts a single document or a an array of documents into MongoDB.
 *
 * Options
 *  - **w**, {Number/String, > -1 || 'majority' || tag name} the write concern for the operation where < 1 is no acknowlegement of write and w >= 1, w = 'majority' or tag acknowledges the write
 *  - **wtimeout**, {Number, 0} set the timeout for waiting for write concern to finish (combines with w option)
 *  - **fsync**, (Boolean, default:false) write waits for fsync before returning, from MongoDB 2.6 on, fsync cannot be combined with journal
 *  - **j**, (Boolean, default:false) write waits for journal sync before returning
 *  - **continueOnError/keepGoing** {Boolean, default:false}, keep inserting documents even if one document has an error, *mongodb 1.9.1 >*.
 *  - **serializeFunctions** {Boolean, default:false}, serialize functions on the document.
 *  - **forceServerObjectId** {Boolean, default:false}, let server assign ObjectId instead of the driver
 *  - **checkKeys** {Boolean, default:true}, allows for disabling of document key checking (WARNING OPENS YOU UP TO INJECTION ATTACKS)
 *  - **fullResult** {Boolean, default:false}, returns the full result document (document returned will differ by server version)
 *
 * @param {Array|Object} docs
 * @param {Object} [options] optional options for insert command
 * @param {Function} [callback] optional callback for the function, must be provided when using a writeconcern
 * @return {Collection}
 * @api public
 */
Collection.prototype.insert = function() { return core.insert; }();

/**
 * Removes documents specified by `selector` from the db.
 *
 * Options
 *  - **w**, {Number/String, > -1 || 'majority' || tag name} the write concern for the operation where < 1 is no acknowlegement of write and w >= 1, w = 'majority' or tag acknowledges the write
 *  - **wtimeout**, {Number, 0} set the timeout for waiting for write concern to finish (combines with w option)
 *  - **fsync**, (Boolean, default:false) write waits for fsync before returning, from MongoDB 2.6 on, fsync cannot be combined with journal
 *  - **j**, (Boolean, default:false) write waits for journal sync before returning
 *  - **single** {Boolean, default:false}, removes the first document found.
 *  - **fullResult** {Boolean, default:false}, returns the full result document (document returned will differ by server version)
 *
 * @param {Object} [selector] optional select, no selector is equivalent to removing all documents.
 * @param {Object} [options] additional options during remove.
 * @param {Function} [callback] must be provided if you performing a remove with a writeconcern
 * @return {null}
 * @api public
 */
Collection.prototype.remove = function() { return core.remove; }();

/**
 * Renames the collection.
 *
 * Options
 *  - **dropTarget** {Boolean, default:false}, drop the target name collection if it previously exists.
 *
 * @param {String} newName the new name of the collection.
 * @param {Object} [options] returns option results.
 * @param {Function} callback the callback accepting the result
 * @return {null}
 * @api public
 */
Collection.prototype.rename = function() { return commands.rename; }();

/**
 * Save a document. Simple full document replacement function. Not recommended for efficiency, use atomic
 * operators and update instead for more efficient operations.
 *
 * Options
 *  - **w**, {Number/String, > -1 || 'majority' || tag name} the write concern for the operation where < 1 is no acknowlegement of write and w >= 1, w = 'majority' or tag acknowledges the write
 *  - **wtimeout**, {Number, 0} set the timeout for waiting for write concern to finish (combines with w option)
 *  - **fsync**, (Boolean, default:false) write waits for fsync before returning, from MongoDB 2.6 on, fsync cannot be combined with journal
 *  - **j**, (Boolean, default:false) write waits for journal sync before returning
 *
 * @param {Object} [doc] the document to save
 * @param {Object} [options] additional options during remove.
 * @param {Function} [callback] must be provided if you performing an update with a writeconcern
 * @return {null}
 * @api public
 */
Collection.prototype.save = function() { return core.save; }();

/**
 * Updates documents.
 *
 * Options
 *  - **w**, {Number/String, > -1 || 'majority' || tag name} the write concern for the operation where < 1 is no acknowlegement of write and w >= 1, w = 'majority' or tag acknowledges the write
 *  - **wtimeout**, {Number, 0} set the timeout for waiting for write concern to finish (combines with w option)
 *  - **fsync**, (Boolean, default:false) write waits for fsync before returning, from MongoDB 2.6 on, fsync cannot be combined with journal
 *  - **j**, (Boolean, default:false) write waits for journal sync before returning
 *  - **upsert** {Boolean, default:false}, perform an upsert operation.
 *  - **multi** {Boolean, default:false}, update all documents matching the selector.
 *  - **serializeFunctions** {Boolean, default:false}, serialize functions on the document.
 *  - **checkKeys** {Boolean, default:true}, allows for disabling of document key checking (WARNING OPENS YOU UP TO INJECTION ATTACKS)
 *  - **fullResult** {Boolean, default:false}, returns the full result document (document returned will differ by server version)
 *
 * @param {Object} selector the query to select the document/documents to be updated
 * @param {Object} document the fields/vals to be updated, or in the case of an upsert operation, inserted.
 * @param {Object} [options] additional options during update.
 * @param {Function} [callback] must be provided if you performing an update with a writeconcern
 * @return {null}
 * @api public
 */
Collection.prototype.update = function() { return core.update; }();

/**
 * The distinct command returns returns a list of distinct values for the given key across a collection.
 *
 * Options
 *  - **readPreference** {String}, the preferred read preference, require('mongodb').ReadPreference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
 *
 * @param {String} key key to run distinct against.
 * @param {Object} [query] option query to narrow the returned objects.
 * @param {Object} [options] additional options during update.
 * @param {Function} callback this will be called after executing this method. The first parameter will contain the Error object if an error occured, or null otherwise. While the second parameter will contain the results from distinct or null if an error occured.
 * @return {null}
 * @api public
 */
Collection.prototype.distinct = function() { return commands.distinct; }();

/**
 * Count number of matching documents in the db to a query.
 *
 * Options
 *  - **skip** {Number}, The number of documents to skip for the count.
 *  - **limit** {Number}, The limit of documents to count.
 *  - **readPreference** {String}, the preferred read preference, require('mongodb').ReadPreference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
 *
 * @param {Object} [query] query to filter by before performing count.
 * @param {Object} [options] additional options during count.
 * @param {Function} callback this will be called after executing this method. The first parameter will contain the Error object if an error occured, or null otherwise. While the second parameter will contain the results from the count method or null if an error occured.
 * @return {null}
 * @api public
 */
Collection.prototype.count = function() { return commands.count; }();

/**
 * Drop the collection
 *
 * @param {Function} callback this will be called after executing this method. The first parameter will contain the Error object if an error occured, or null otherwise. While the second parameter will contain the results from the drop method or null if an error occured.
 * @return {null}
 * @api public
 */
Collection.prototype.drop = function drop(callback) {
  this.db.dropCollection(this.collectionName, callback);
};

/**
 * Find and update a document.
 *
 * Options
 *  - **w**, {Number/String, > -1 || 'majority' || tag name} the write concern for the operation where < 1 is no acknowlegement of write and w >= 1, w = 'majority' or tag acknowledges the write
 *  - **wtimeout**, {Number, 0} set the timeout for waiting for write concern to finish (combines with w option)
 *  - **fsync**, (Boolean, default:false) write waits for fsync before returning, from MongoDB 2.6 on, fsync cannot be combined with journal
 *  - **j**, (Boolean, default:false) write waits for journal sync before returning
 *  - **remove** {Boolean, default:false}, set to true to remove the object before returning.
 *  - **upsert** {Boolean, default:false}, perform an upsert operation.
 *  - **new** {Boolean, default:false}, set to true if you want to return the modified object rather than the original. Ignored for remove.
 *
 * @param {Object} query query object to locate the object to modify
 * @param {Array}  sort - if multiple docs match, choose the first one in the specified sort order as the object to manipulate
 * @param {Object} doc - the fields/vals to be updated
 * @param {Object} [options] additional options during update.
 * @param {Function} callback this will be called after executing this method. The first parameter will contain the Error object if an error occured, or null otherwise. While the second parameter will contain the results from the findAndModify method or null if an error occured.
 * @return {null}
 * @api public
 */
Collection.prototype.findAndModify = function() { return core.findAndModify; }();

/**
 * Find and remove a document
 *
 * Options
 *  - **w**, {Number/String, > -1 || 'majority' || tag name} the write concern for the operation where < 1 is no acknowlegement of write and w >= 1, w = 'majority' or tag acknowledges the write
 *  - **wtimeout**, {Number, 0} set the timeout for waiting for write concern to finish (combines with w option)
 *  - **fsync**, (Boolean, default:false) write waits for fsync before returning, from MongoDB 2.6 on, fsync cannot be combined with journal
 *  - **j**, (Boolean, default:false) write waits for journal sync before returning
 *
 * @param {Object} query query object to locate the object to modify
 * @param {Array}  sort - if multiple docs match, choose the first one in the specified sort order as the object to manipulate
 * @param {Object} [options] additional options during update.
 * @param {Function} callback this will be called after executing this method. The first parameter will contain the Error object if an error occured, or null otherwise. While the second parameter will contain the results from the findAndRemove method or null if an error occured.
 * @return {null}
 * @api public
 */
Collection.prototype.findAndRemove = function() { return core.findAndRemove; }();

/**
 * Creates a cursor for a query that can be used to iterate over results from MongoDB
 *
 * Various argument possibilities
 *  - callback?
 *  - selector, callback?,
 *  - selector, fields, callback?
 *  - selector, options, callback?
 *  - selector, fields, options, callback?
 *  - selector, fields, skip, limit, callback?
 *  - selector, fields, skip, limit, timeout, callback?
 *
 * Options
 *  - **limit** {Number, default:0}, sets the limit of documents returned in the query.
 *  - **sort** {Array | Object}, set to sort the documents coming back from the query. Array of indexes, [['a', 1]] etc.
 *  - **fields** {Object}, the fields to return in the query. Object of fields to include or exclude (not both), {'a':1}
 *  - **skip** {Number, default:0}, set to skip N documents ahead in your query (useful for pagination).
 *  - **hint** {Object}, tell the query to use specific indexes in the query. Object of indexes to use, {'_id':1}
 *  - **explain** {Boolean, default:false}, explain the query instead of returning the data.
 *  - **snapshot** {Boolean, default:false}, snapshot query.
 *  - **timeout** {Boolean, default:false}, specify if the cursor can timeout.
 *  - **tailable** {Boolean, default:false}, specify if the cursor is tailable.
 *  - **tailableRetryInterval** {Number, default:100}, specify the miliseconds between getMores on tailable cursor.
 *  - **numberOfRetries** {Number, default:5}, specify the number of times to retry the tailable cursor.
 *  - **awaitdata** {Boolean, default:false} allow the cursor to wait for data, only applicable for tailable cursor.
 *  - **oplogReplay** {Boolean, default:false} sets an internal flag, only applicable for tailable cursor.
 *  - **exhaust** {Boolean, default:false} have the server send all the documents at once as getMore packets, not recommended.
 *  - **batchSize** {Number, default:0}, set the batchSize for the getMoreCommand when iterating over the query results.
 *  - **returnKey** {Boolean, default:false}, only return the index key.
 *  - **maxScan** {Number}, Limit the number of items to scan.
 *  - **min** {Number}, Set index bounds.
 *  - **max** {Number}, Set index bounds.
 *  - **showDiskLoc** {Boolean, default:false}, Show disk location of results.
 *  - **comment** {String}, You can put a $comment field on a query to make looking in the profiler logs simpler.
 *  - **raw** {Boolean, default:false}, Return all BSON documents as Raw Buffer documents.
 *  - **readPreference** {String}, the preferred read preference, require('mongodb').ReadPreference ((ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
 *  - **numberOfRetries** {Number, default:5}, if using awaidata specifies the number of times to retry on timeout.
 *  - **partial** {Boolean, default:false}, specify if the cursor should return partial results when querying against a sharded system
 *  - **maxTimeMS** {Number}, number of miliseconds to wait before aborting the query.
 *
 * @param {Object|ObjectID} query query object to locate the object to modify
 * @param {Object} [options] additional options during update.
 * @param {Function} callback this will be called after executing this method. The first parameter will contain the Error object if an error occured, or null otherwise. While the second parameter will contain the results from the find method or null if an error occured.
 * @return {Cursor} returns a cursor to the query
 * @api public
 */
Collection.prototype.find = function() { return query.find; }();

/**
 * Finds a single document based on the query
 *
 * Various argument possibilities
 *  - callback?
 *  - selector, callback?,
 *  - selector, fields, callback?
 *  - selector, options, callback?
 *  - selector, fields, options, callback?
 *  - selector, fields, skip, limit, callback?
 *  - selector, fields, skip, limit, timeout, callback?
 *
 * Options
 *  - **limit** {Number, default:0}, sets the limit of documents returned in the query.
 *  - **sort** {Array | Object}, set to sort the documents coming back from the query. Array of indexes, [['a', 1]] etc.
 *  - **fields** {Object}, the fields to return in the query. Object of fields to include or exclude (not both), {'a':1}
 *  - **skip** {Number, default:0}, set to skip N documents ahead in your query (useful for pagination).
 *  - **hint** {Object}, tell the query to use specific indexes in the query. Object of indexes to use, {'_id':1}
 *  - **explain** {Boolean, default:false}, explain the query instead of returning the data.
 *  - **snapshot** {Boolean, default:false}, snapshot query.
 *  - **timeout** {Boolean, default:false}, specify if the cursor can timeout.
 *  - **tailable** {Boolean, default:false}, specify if the cursor is tailable.
 *  - **batchSize** {Number, default:0}, set the batchSize for the getMoreCommand when iterating over the query results.
 *  - **returnKey** {Boolean, default:false}, only return the index key.
 *  - **maxScan** {Number}, Limit the number of items to scan.
 *  - **min** {Number}, Set index bounds.
 *  - **max** {Number}, Set index bounds.
 *  - **showDiskLoc** {Boolean, default:false}, Show disk location of results.
 *  - **comment** {String}, You can put a $comment field on a query to make looking in the profiler logs simpler.
 *  - **raw** {Boolean, default:false}, Return all BSON documents as Raw Buffer documents.
 *  - **readPreference** {String}, the preferred read preference, require('mongodb').ReadPreference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
 *  - **partial** {Boolean, default:false}, specify if the cursor should return partial results when querying against a sharded system
 *  - **maxTimeMS** {Number}, number of miliseconds to wait before aborting the query.
 *
 * @param {Object|ObjectID} query query object to locate the object to modify
 * @param {Object} [options] additional options during update.
 * @param {Function} callback this will be called after executing this method. The first parameter will contain the Error object if an error occured, or null otherwise. While the second parameter will contain the results from the findOne method or null if an error occured.
 * @return {Cursor} returns a cursor to the query
 * @api public
 */
Collection.prototype.findOne = function() { return query.findOne; }();

/**
 * Creates an index on the collection.
 *
 * Options
 *  - **w**, {Number/String, > -1 || 'majority' || tag name} the write concern for the operation where < 1 is no acknowlegement of write and w >= 1, w = 'majority' or tag acknowledges the write
 *  - **wtimeout**, {Number, 0} set the timeout for waiting for write concern to finish (combines with w option)
 *  - **fsync**, (Boolean, default:false) write waits for fsync before returning, from MongoDB 2.6 on, fsync cannot be combined with journal
 *  - **j**, (Boolean, default:false) write waits for journal sync before returning
 *  - **unique** {Boolean, default:false}, creates an unique index.
 *  - **sparse** {Boolean, default:false}, creates a sparse index.
 *  - **background** {Boolean, default:false}, creates the index in the background, yielding whenever possible.
 *  - **min** {Number}, for geospatial indexes set the lower bound for the co-ordinates.
 *  - **max** {Number}, for geospatial indexes set the high bound for the co-ordinates.
 *  - **v** {Number}, specify the format version of the indexes.
 *  - **expireAfterSeconds** {Number}, allows you to expire data on indexes applied to a data (MongoDB 2.2 or higher)
 *  - **name** {String}, override the autogenerated index name (useful if the resulting name is larger than 128 bytes)
 *
 * @param {Object} fieldOrSpec fieldOrSpec that defines the index.
 * @param {Object} [options] additional options during update.
 * @param {Function} callback this will be called after executing this method. The first parameter will contain the Error object if an error occured, or null otherwise. While the second parameter will contain the results from the createIndex method or null if an error occured.
 * @return {null}
 * @api public
 */
Collection.prototype.createIndex = function() { return index.createIndex; }();

/**
 * Ensures that an index exists, if it does not it creates it
 *
 * Options
 *  - **w**, {Number/String, > -1 || 'majority' || tag name} the write concern for the operation where < 1 is no acknowlegement of write and w >= 1, w = 'majority' or tag acknowledges the write
 *  - **wtimeout**, {Number, 0} set the timeout for waiting for write concern to finish (combines with w option)
 *  - **fsync**, (Boolean, default:false) write waits for fsync before returning, from MongoDB 2.6 on, fsync cannot be combined with journal
 *  - **j**, (Boolean, default:false) write waits for journal sync before returning
 *  - **unique** {Boolean, default:false}, creates an unique index.
 *  - **sparse** {Boolean, default:false}, creates a sparse index.
 *  - **background** {Boolean, default:false}, creates the index in the background, yielding whenever possible.
 *  - **min** {Number}, for geospatial indexes set the lower bound for the co-ordinates.
 *  - **max** {Number}, for geospatial indexes set the high bound for the co-ordinates.
 *  - **v** {Number}, specify the format version of the indexes.
 *  - **expireAfterSeconds** {Number}, allows you to expire data on indexes applied to a data (MongoDB 2.2 or higher)
 *  - **name** {String}, override the autogenerated index name (useful if the resulting name is larger than 128 bytes)
 *
 * @param {Object} fieldOrSpec fieldOrSpec that defines the index.
 * @param {Object} [options] additional options during update.
 * @param {Function} callback this will be called after executing this method. The first parameter will contain the Error object if an error occured, or null otherwise. While the second parameter will contain the results from the ensureIndex method or null if an error occured.
 * @return {null}
 * @api public
 */
Collection.prototype.ensureIndex = function() { return index.ensureIndex; }();

/**
 * Get the list of all indexes information for the collection.
 *
 * Options
 *  - **batchSize**, {Number, 0} The batchSize for the returned command cursor or if pre 2.8 the systems batch collection
 *
 * @param {Object} [options] additional options during update.
 * @return {Cursor}
 */
Collection.prototype.listIndexes = function() { return index.listIndexes; }();

/**
 * Retrieves this collections index info.
 *
 * Options
 *  - **full** {Boolean, default:false}, returns the full raw index information.
 *
 * @param {Object} [options] additional options during update.
 * @param {Function} callback this will be called after executing this method. The first parameter will contain the Error object if an error occured, or null otherwise. While the second parameter will contain the results from the indexInformation method or null if an error occured.
 * @return {null}
 * @api public
 */
Collection.prototype.indexInformation = function() { return index.indexInformation; }();

/**
 * Drops an index from this collection.
 *
 * @param {String} name
 * @param {Function} callback this will be called after executing this method. The first parameter will contain the Error object if an error occured, or null otherwise. While the second parameter will contain the results from the dropIndex method or null if an error occured.
 * @return {null}
 * @api public
 */
Collection.prototype.dropIndex = function dropIndex (name, options, callback) {
  if(typeof options == 'function') {
    callback = options;
    options = {};
  }  
  // Execute dropIndex command
  this.db.dropIndex(this.collectionName, name, options, callback);
};

/**
 * Drops all indexes from this collection.
 *
 * @param {Function} callback this will be called after executing this method. The first parameter will contain the Error object if an error occured, or null otherwise. While the second parameter will contain the results from the dropAllIndexes method or null if an error occured.
 * @return {null}
 * @api public
 */
Collection.prototype.dropAllIndexes = function() { return index.dropAllIndexes; }();

/**
 * Drops all indexes from this collection.
 *
 * @deprecated
 * @param {Function} callback this will be called after executing this method. The first parameter will contain the Error object if an error occured, or null otherwise. While the second parameter will contain the results from the dropIndexes method or null if an error occured.
 * @return {null}
 * @api private
 */
Collection.prototype.dropIndexes = function() { return Collection.prototype.dropAllIndexes; }();

/**
 * Reindex all indexes on the collection
 * Warning: reIndex is a blocking operation (indexes are rebuilt in the foreground) and will be slow for large collections.
 *
 * @param {Function} callback this will be called after executing this method. The first parameter will contain the Error object if an error occured, or null otherwise. While the second parameter will contain the results from the reIndex method or null if an error occured.
 * @return {null}
 * @api public
**/
Collection.prototype.reIndex = function(options, callback) {
  if(typeof options == 'function') {
    callback = options;
    options = {};
  }  
  // Execute reIndex
  this.db.reIndex(this.collectionName, options, callback);
}

/**
 * Run Map Reduce across a collection. Be aware that the inline option for out will return an array of results not a collection.
 *
 * Options
 *  - **out** {Object}, sets the output target for the map reduce job. *{inline:1} | {replace:'collectionName'} | {merge:'collectionName'} | {reduce:'collectionName'}*
 *  - **query** {Object}, query filter object.
 *  - **sort** {Object}, sorts the input objects using this key. Useful for optimization, like sorting by the emit key for fewer reduces.
 *  - **limit** {Number}, number of objects to return from collection.
 *  - **keeptemp** {Boolean, default:false}, keep temporary data.
 *  - **finalize** {Function | String}, finalize function.
 *  - **scope** {Object}, can pass in variables that can be access from map/reduce/finalize.
 *  - **jsMode** {Boolean, default:false}, it is possible to make the execution stay in JS. Provided in MongoDB > 2.0.X.
 *  - **verbose** {Boolean, default:false}, provide statistics on job execution time.
 *  - **readPreference** {String, only for inline results}, the preferred read preference, require('mongodb').ReadPreference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
 *
 * @param {Function|String} map the mapping function.
 * @param {Function|String} reduce the reduce function.
 * @param {Objects} [options] options for the map reduce job.
 * @param {Function} callback this will be called after executing this method. The first parameter will contain the Error object if an error occured, or null otherwise. While the second parameter will contain the results from the mapReduce method or null if an error occured.
 * @return {null}
 * @api public
 */
Collection.prototype.mapReduce = function() { return aggregation.mapReduce; }();

/**
 * Run a group command across a collection
 *
 * Options
 *  - **readPreference** {String}, the preferred read preference, require('mongodb').ReadPreference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
 *
 * @param {Object|Array|Function|Code} keys an object, array or function expressing the keys to group by.
 * @param {Object} condition an optional condition that must be true for a row to be considered.
 * @param {Object} initial initial value of the aggregation counter object.
 * @param {Function|Code} reduce the reduce function aggregates (reduces) the objects iterated
 * @param {Function|Code} finalize an optional function to be run on each item in the result set just before the item is returned.
 * @param {Boolean} command specify if you wish to run using the internal group command or using eval, default is true.
 * @param {Object} [options] additional options during update.
 * @param {Function} callback this will be called after executing this method. The first parameter will contain the Error object if an error occured, or null otherwise. While the second parameter will contain the results from the group method or null if an error occured.
 * @return {null}
 * @api public
 */
Collection.prototype.group = function() { return aggregation.group; }();

/**
 * Returns the options of the collection.
 *
 * @param {Function} callback this will be called after executing this method. The first parameter will contain the Error object if an error occured, or null otherwise. While the second parameter will contain the results from the options method or null if an error occured.
 * @return {null}
 * @api public
 */
Collection.prototype.options = function() { return commands.options; }();

/**
 * Returns if the collection is a capped collection
 *
 * @param {Function} callback this will be called after executing this method. The first parameter will contain the Error object if an error occured, or null otherwise. While the second parameter will contain the results from the isCapped method or null if an error occured.
 * @return {null}
 * @api public
 */
Collection.prototype.isCapped = function() { return commands.isCapped; }();

/**
 * Checks if one or more indexes exist on the collection
 *
 * @param {String|Array} indexNames check if one or more indexes exist on the collection.
 * @param {Function} callback this will be called after executing this method. The first parameter will contain the Error object if an error occured, or null otherwise. While the second parameter will contain the results from the indexExists method or null if an error occured.
 * @return {null}
 * @api public
 */
Collection.prototype.indexExists = function() { return index.indexExists; }();

/**
 * Execute the geoNear command to search for items in the collection
 *
 * Options
 *  - **num** {Number}, max number of results to return.
 *  - **minDistance** {Number}, include results starting at minDistance from a point (2.6 or higher)
 *  - **maxDistance** {Number}, include results up to maxDistance from the point.
 *  - **distanceMultiplier** {Number}, include a value to multiply the distances with allowing for range conversions.
 *  - **query** {Object}, filter the results by a query.
 *  - **spherical** {Boolean, default:false}, perform query using a spherical model.
 *  - **uniqueDocs** {Boolean, default:false}, the closest location in a document to the center of the search region will always be returned MongoDB > 2.X.
 *  - **includeLocs** {Boolean, default:false}, include the location data fields in the top level of the results MongoDB > 2.X.
 *  - **readPreference** {String}, the preferred read preference, require('mongodb').ReadPreference ((ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
 *
 * @param {Number} x point to search on the x axis, ensure the indexes are ordered in the same order.
 * @param {Number} y point to search on the y axis, ensure the indexes are ordered in the same order.
 * @param {Objects} [options] options for the map reduce job.
 * @param {Function} callback this will be called after executing this method. The first parameter will contain the Error object if an error occured, or null otherwise. While the second parameter will contain the results from the geoNear method or null if an error occured.
 * @return {null}
 * @api public
 */
Collection.prototype.geoNear = function() { return geo.geoNear; }();

/**
 * Execute a geo search using a geo haystack index on a collection.
 *
 * Options
 *  - **maxDistance** {Number}, include results up to maxDistance from the point.
 *  - **search** {Object}, filter the results by a query.
 *  - **limit** {Number}, max number of results to return.
 *  - **readPreference** {String}, the preferred read preference, require('mongodb').ReadPreference ((ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
 *
 * @param {Number} x point to search on the x axis, ensure the indexes are ordered in the same order.
 * @param {Number} y point to search on the y axis, ensure the indexes are ordered in the same order.
 * @param {Objects} [options] options for the map reduce job.
 * @param {Function} callback this will be called after executing this method. The first parameter will contain the Error object if an error occured, or null otherwise. While the second parameter will contain the results from the geoHaystackSearch method or null if an error occured.
 * @return {null}
 * @api public
 */
Collection.prototype.geoHaystackSearch = function() { return geo.geoHaystackSearch; }();

/**
 * Retrieve all the indexes on the collection.
 *
 * @param {Function} callback this will be called after executing this method. The first parameter will contain the Error object if an error occured, or null otherwise. While the second parameter will contain the results from the indexes method or null if an error occured.
 * @return {null}
 * @api public
 */
Collection.prototype.indexes = function indexes(callback) {
  this.db.indexInformation(this.collectionName, {full:true}, callback);
}

/**
 * Execute an aggregation framework pipeline against the collection, needs MongoDB >= 2.2
 *
 * Options
 *  - **readPreference** {String}, the preferred read preference, require('mongodb').ReadPreference ((ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
 *  - **cursor** {Object}, return the query as cursor, on 2.6 > it returns as a real cursor on pre 2.6 it returns as an emulated cursor.
 *  - **cursor.batchSize** {Number}, the batchSize for the cursor
 *  - **out** {String}, the collection name to where to write the results from the aggregation (MongoDB 2.6 or higher). Warning any existing collection will be overwritten.
 *  - **explain** {Boolean, default:false}, explain returns the aggregation execution plan (requires mongodb 2.6 >).
 *  - **allowDiskUse** {Boolean, default:false}, allowDiskUse lets the server know if it can use disk to store temporary results for the aggregation (requires mongodb 2.6 >).
 *
 * @param {Array} array containing all the aggregation framework commands for the execution.
 * @param {Object} [options] additional options during update.
 * @param {Function} callback this will be called after executing this method. The first parameter will contain the Error object if an error occured, or null otherwise. While the second parameter will contain the results from the aggregate method or null if an error occured.
 * @return {null}
 * @api public
 */
Collection.prototype.aggregate = function() { return aggregation.aggregate; }();

/**
 * Get all the collection statistics.
 *
 * Options
 *  - **scale** {Number}, divide the returned sizes by scale value.
 *  - **readPreference** {String}, the preferred read preference, require('mongodb').ReadPreference ((ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
 *
 * @param {Objects} [options] options for the stats command.
 * @param {Function} callback this will be called after executing this method. The first parameter will contain the Error object if an error occured, or null otherwise. While the second parameter will contain the results from the stats method or null if an error occured.
 * @return {null}
 * @api public
 */
Collection.prototype.stats = function() { return commands.stats; }();

/**
 * Initiate a Out of order batch write operation. All operations will be buffered into insert/update/remove commands executed out of order.
 *
 * Options
 *  - **w**, {Number/String, > -1 || 'majority' || tag name} the write concern for the operation where < 1 is no acknowlegement of write and w >= 1, w = 'majority' or tag acknowledges the write
 *  - **wtimeout**, {Number, 0} set the timeout for waiting for write concern to finish (combines with w option)
 *  - **fsync**, (Boolean, default:false) write waits for fsync before returning, from MongoDB 2.6 on, fsync cannot be combined with journal
 *  - **j**, (Boolean, default:false) write waits for journal sync before returning
 *
 * @param {Objects} [options] options for the initializeUnorderedBatch 
 * @param {Function} callback this will be called after executing this method. The first parameter will contain the Error object if an error occured, or null otherwise. The second argument will be a UnorderedBulkOperation object.
 * @return {UnorderedBulkOperation}
 * @api public
 */
Collection.prototype.initializeUnorderedBulkOp = function() { return unordered.initializeUnorderedBulkOp; }();

/**
 * Initiate an In order bulk write operation, operations will be serially executed in the order they are added, creating a new operation for each switch in types.
 *
 * Options
 *  - **w**, {Number/String, > -1 || 'majority' || tag name} the write concern for the operation where < 1 is no acknowlegement of write and w >= 1, w = 'majority' or tag acknowledges the write
 *  - **wtimeout**, {Number, 0} set the timeout for waiting for write concern to finish (combines with w option)
 *  - **fsync**, (Boolean, default:false) write waits for fsync before returning, from MongoDB 2.6 on, fsync cannot be combined with journal
 *  - **j**, (Boolean, default:false) write waits for journal sync before returning
 *
 * @param {Objects} [options] options for the initializeOrderedBulkOp 
 * @param {Function} callback this will be called after executing this method. The first parameter will contain the Error object if an error occured, or null otherwise. The second argument will be a OrderedBulkOperation object.
 * @return {OrderedBulkOperation}
 * @api public
 */
Collection.prototype.initializeOrderedBulkOp = function() { return ordered.initializeOrderedBulkOp; }();

/**
 * Return N number of parallel cursors for a collection allowing parallel reading of entire collection. There are
 * no ordering guarantees for returned results.
 *
 * Options
 *  - **readPreference** {String}, the prefered read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
 *  - **batchSize** {Number, default:0}, set the batchSize for the getMoreCommand when iterating over the query results.
 *  - **numCursors**, {Number, 1} the maximum number of parallel command cursors to return (the number of returned cursors will be in the range 1:numCursors)
 *
 * @param {Objects} [options] options for the initializeOrderedBulkOp 
 * @param {Function} callback this will be called after executing this method. The first parameter will contain the Error object if an error occured, or null otherwise. The second argument will be an array of CommandCursor instances.
 * @return {OrderedBulkOperation}
 * @api public
 */
Collection.prototype.parallelCollectionScan = function() { return query.parallelCollectionScan; }();

/**
 * @ignore
 */
Object.defineProperty(Collection.prototype, "hint", {
    enumerable: true
  , get: function () {
      return this.internalHint;
    }
  , set: function (v) {
      this.internalHint = shared.normalizeHintField(v);
    }
});

/**
 * Expose.
 */
exports.Collection = Collection;
