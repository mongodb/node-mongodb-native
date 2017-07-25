var EventEmitter = require('events'),
    inherits = require('util').inherits,
    MongoNetworkError = require('mongodb-core').MongoNetworkError,
    changeStreamSimulator = require('./change_stream_simulator');

/**
 * Creates a new Change Stream instance (INTERNAL TYPE, do not instantiate directly). Normally created using {@link Collection#watch|Collection.watch()} or {@link Db#watch|Db.watch()}.
 * @class ChangeStream
 * @since 3.0.0
 * @param {(Db|Collection)} changeDomain The database or collection against which to create the change stream
 * @param {Array} pipeline An array of {@link https://docs.mongodb.com/manual/reference/operator/aggregation-pipeline/|aggregation pipeline stages} through which to pass change stream documents
 * @param {object} [options=null] Optional settings
 * @param {string} [options.fullDocument=none] Allowed values: ‘none’, ‘lookup’. When set to ‘lookup’, the change stream will include both a delta describing the changes to the document, as well as a copy of the entire document that was changed from some time after the change occurred.
 * @param {number} [options.maxAwaitTimeMS] The maximum amount of time for the server to wait on new documents to satisfy a change stream query
 * @param {object} [options.resumeAfter=null] Specifies the logical starting point for the new change stream. This should be the _id field from a previously returned change stream document.
 * @param {number} [options.batchSize=null] The number of documents to return per batch. See {@link https://docs.mongodb.com/manual/reference/command/aggregate|aggregation documentation}.
 * @param {object} [options.collation=null] Specify collation settings for operation. See {@link https://docs.mongodb.com/manual/reference/command/aggregate|aggregation documentation}.
 * @param {ReadPreference} [options.readPreference=null] The read preference. Defaults to the read preference of the database or collection. See {@link https://docs.mongodb.com/manual/reference/read-preference|read preference documentation}.
 * @fires ChangeStream#close
 * @fires ChangeStream#data
 * @fires ChangeStream#end
 * @fires ChangeStream#error
 * @return {ChangeStream} a ChangeStream instance.
 */
var ChangeStream = function(changeDomain, pipeline, options) {
  var Collection = require('./collection');
  var Db = require('./db');

  var self = this;
  self.changeDomain = changeDomain;
  self.pipeline = pipeline || [];
  self.options = options || {};

  // Extract namespace and serverConfig from changeDomain
  self.namespace = {};
  var changeDb;
  if (changeDomain instanceof Collection) {
    self.namespace.collection = changeDomain.collectionName;
    changeDb = changeDomain.s.db;
  } else if (changeDomain instanceof Db) {
    changeDb = changeDomain;
  } else {
    throw new Error('changeDomain must be either a database or collection.');
  }
  self.namespace.database = changeDb.databaseName;
  self.serverConfig = changeDb.serverConfig;

  // Determine correct read preference
  self.options.readPreference = self.options.readPreference || changeDomain.readPreference || changeDomain.s.readPreference;

  // Create contained Change Stream cursor
  self.cursor = createChangeStreamCursor(self);

  self.on('newListener', function(eventName) {
    if (eventName === 'data' && self.cursor && self.cursor.listenerCount('data') === 0) {
      self.cursor.on('data', function (change) {
        processNewChange(self, null, change);
      });
    }
  });

};

// Create a new change stream cursor based on self's configuration
var createChangeStreamCursor = function (self) {
  var changeStreamCursor;

  if (self.resumeToken) {
    self.options.resumeAfter = self.resumeToken;
  }

  // Create the Change Stream cursor (either using the server or the simulator)
  var serverSupportsChangeNotifications = true;
  if (serverSupportsChangeNotifications) {
    changeStreamCursor = buildChangeStreamAggregationCommand(self.serverConfig, self.namespace, self.pipeline, self.resumeToken, self.options);
  } else {
    // Create the change stream cursor using the black box simulator
    changeStreamCursor = changeStreamSimulator.createChangeStreamCursorSimulation(self.serverConfig, self.namespace, self.pipeline, self.options);
  }

  /**
   * Fired for each new matching change in the specified namespace. Attaching a 'data' event listener to a Change Stream will switch the stream into flowing mode. Data will then be passed as soon as it is available.
   *
   * @event ChangeStream#data
   * @type {object}
   */
  if (self.listenerCount('data') > 0) {
    changeStreamCursor.on('data', function (change) {
      processNewChange(self, null, change);
    });
  }

  /**
   * Change stream close event
   *
   * @event ChangeStream#close
   * @type {null}
   */
  changeStreamCursor.on('close', function () {
    self.emit('close');
  });

  /**
   * Change stream end event
   *
   * @event ChangeStream#end
   * @type {null}
   */
  changeStreamCursor.on('end', function () {
    self.emit('end');
  });

  /**
   * Fired when the stream encounters an error.
   *
   * @event ChangeStream#error
   * @type {Error}
   */
  changeStreamCursor.on('error', function(error) {
    self.emit('error', error);
  });

  return changeStreamCursor;
};

var buildChangeStreamAggregationCommand = function (serverConfig, namespace, pipeline, resumeToken, options) {
  var changeNotificationStageOptions = {};
  if (options.fullDocument) {
    changeNotificationStageOptions.fullDocument = options.fullDocument;
  }
  if (resumeToken || options.resumeAfter) {
    changeNotificationStageOptions.resumeAfter = resumeToken || options.resumeAfter;
  }

  // Map cursor options
  var cursorOptions = {};
  ['maxAwaitTimeMS', 'collation', 'readPreference'].forEach(function(optionName) {
    if (options[optionName]) {
      cursorOptions[optionName] = options[optionName];
    }
  });

  var changeStreamPipeline = [{$changeNotification: changeNotificationStageOptions}].concat(pipeline);
  var command = {
    aggregate : namespace.collection ? namespace.collection : 1,
    pipeline : changeStreamPipeline,
    cursor: {
      batchSize: options.batchSize || 1
    }
  };

  // Create and return the cursor
  return serverConfig.cursor(namespace.database + '.' + namespace.collection, command, cursorOptions);
};

/**
 * Check if there is any document still available in the Change Stream
 * @function ChangeStream.prototype.hasNext
 * @param {ChangeStream~resultCallback} [callback] The result callback.
 * @throws {MongoError}
 * @return {Promise} returns Promise if no callback passed
 */
ChangeStream.prototype.hasNext = function (callback) {
  return this.cursor.hasNext(callback);
};

/**
 * Get the next available document from the Change Stream, returns null if no more documents are available.
 * @function ChangeStream.prototype.next
 * @param {ChangeStream~resultCallback} [callback] The result callback.
 * @throws {MongoError}
 * @return {Promise} returns Promise if no callback passed
 */
ChangeStream.prototype.next = function (callback) {
  var self = this;
  if (this.isClosed()) {
    if (callback) return callback(new Error('Change Stream is not open.'), null);
    return self.changeDomain.s.promiseLibrary.reject(new Error('Change Stream is not open.'));
  }
  return this.cursor.next().then(function(change) {
    return processNewChange(self, null, change, callback);
  }).catch(function(err) {
    return processNewChange(self, err, null, callback);
  });
};

/**
 * Is the cursor closed
 * @method ChangeStream.prototype.isClosed
 * @return {boolean}
 */
ChangeStream.prototype.isClosed = function () {
  if (this.cursor) {
    return this.cursor.isClosed();
  }
  return true;
};

/**
 * Close the Change Stream
 * @method ChangeStream.prototype.close
 * @param {ChangeStream~resultCallback} [callback] The result callback.
 * @return {Promise} returns Promise if no callback passed
 */
ChangeStream.prototype.close = function (callback) {
  if (!this.cursor) {
    if (callback) return callback();
    return this.changeDomain.s.promiseLibrary.resolve();
  }

  // Tidy up the existing cursor
  var cursor = this.cursor;
  delete this.cursor;
  return cursor.close(callback);
};

/**
 * This method pulls all the data out of a readable stream, and writes it to the supplied destination, automatically managing the flow so that the destination is not overwhelmed by a fast readable stream.
 * @function external:Readable#pipe
 * @param {Writable} destination The destination for writing data
 * @param {object} [options] Pipe options
 * @return {null}
 */
ChangeStream.prototype.pipe = function (destination, options) {
  return this.cursor.pipe(destination, options);
};
ChangeStream.prototype.stream = function (options) {
  return this.cursor.stream(options);
};

// Handle new change events. This method brings together the routes from the callback, event emitter, and promise ways of using ChangeStream.
var processNewChange = function (self, err, change, callback) {
  // Handle errors
  if (err) {
    // Handle resumable MongoNetworkErrors
    if (err instanceof MongoNetworkError && !self.attemptingResume) {

      self.attemptingResume = true;
      return self.cursor.close(function(closeErr) {
        if (closeErr) {
          if (callback) return callback(err, null);
          return self.changeDomain.s.promiseLibrary.reject(err);
        }

        // Establish a new cursor
        self.cursor = createChangeStreamCursor(self);
        // Attempt the next() operation again
        if (callback) return self.next(callback);
        return self.next();
      });
    }

    if (typeof callback === 'function') return callback(err, null);
    if (self.listenerCount('error')) return self.emit('error', err);
    return self.changeDomain.s.promiseLibrary.reject(err);
  }
  self.attemptingResume = false;

  // Cache the resume token if it is present. If it is not present return an error.
  if (!change._id) {
    var noResumeTokenError = new Error('A change stream document has been recieved that lacks a resume token (_id).');
    if (typeof callback === 'function') return callback(noResumeTokenError, null);
    if (self.listenerCount('error')) return self.emit('error', noResumeTokenError);
    return self.changeDomain.s.promiseLibrary.reject(noResumeTokenError);
  }
  self.resumeToken = change._id;

  // Return the change
  if (typeof callback === 'function') return callback(err, change);
  if (self.listenerCount('data')) return self.emit('data', change);
  return self.changeDomain.s.promiseLibrary.resolve(change);
};

/**
 * The callback format for results
 * @callback ChangeStream~resultCallback
 * @param {MongoError} error An error instance representing the error during the execution.
 * @param {(object|null)} result The result object if the command was executed successfully.
 */

inherits(ChangeStream, EventEmitter);

module.exports = ChangeStream;
