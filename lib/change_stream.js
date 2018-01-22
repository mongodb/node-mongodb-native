'use strict';

var EventEmitter = require('events'),
  inherits = require('util').inherits,
  MongoNetworkError = require('mongodb-core').MongoNetworkError;

var cursorOptionNames = ['maxAwaitTimeMS', 'collation', 'readPreference'];

/**
 * Creates a new Change Stream instance. Normally created using {@link Collection#watch|Collection.watch()}.
 * @class ChangeStream
 * @since 3.0.0
 * @param {(Db|Collection)} changeDomain The collection against which to create the change stream
 * @param {Array} pipeline An array of {@link https://docs.mongodb.com/manual/reference/operator/aggregation-pipeline/|aggregation pipeline stages} through which to pass change stream documents
 * @param {object} [options=null] Optional settings
 * @param {string} [options.fullDocument='default'] Allowed values: ‘default’, ‘updateLookup’. When set to ‘updateLookup’, the change stream will include both a delta describing the changes to the document, as well as a copy of the entire document that was changed from some time after the change occurred.
 * @param {number} [options.maxAwaitTimeMS] The maximum amount of time for the server to wait on new documents to satisfy a change stream query
 * @param {object} [options.resumeAfter=null] Specifies the logical starting point for the new change stream. This should be the _id field from a previously returned change stream document.
 * @param {number} [options.batchSize=null] The number of documents to return per batch. See {@link https://docs.mongodb.com/manual/reference/command/aggregate|aggregation documentation}.
 * @param {object} [options.collation=null] Specify collation settings for operation. See {@link https://docs.mongodb.com/manual/reference/command/aggregate|aggregation documentation}.
 * @param {ReadPreference} [options.readPreference=null] The read preference. Defaults to the read preference of the database or collection. See {@link https://docs.mongodb.com/manual/reference/read-preference|read preference documentation}.
 * @fires ChangeStream#close
 * @fires ChangeStream#change
 * @fires ChangeStream#end
 * @fires ChangeStream#error
 * @return {ChangeStream} a ChangeStream instance.
 */
var ChangeStream = function(collection, pipeline, options) {
  var Collection = require('./collection');

  // Ensure the provided collection is actually a collection
  if (!(collection instanceof Collection)) {
    throw new Error(
      'collection provided to ChangeStream constructor is not an instance of Collection'
    );
  }

  var self = this;
  self.pipeline = pipeline || [];
  self.options = options || {};
  self.promiseLibrary = collection.s.promiseLibrary;

  // Extract namespace and serverConfig from the collection
  self.namespace = {
    collection: collection.collectionName,
    database: collection.s.db.databaseName
  };

  self.serverConfig = collection.s.db.serverConfig;

  // Determine correct read preference
  self.options.readPreference = self.options.readPreference || collection.s.readPreference;

  // Create contained Change Stream cursor
  self.cursor = createChangeStreamCursor(self);

  // Listen for any `change` listeners being added to ChangeStream
  self.on('newListener', function(eventName) {
    if (eventName === 'change' && self.cursor && self.cursor.listenerCount('change') === 0) {
      self.cursor.on('data', function(change) {
        processNewChange(self, null, change);
      });
    }
  });

  // Listen for all `change` listeners being removed from ChangeStream
  self.on('removeListener', function(eventName) {
    if (eventName === 'change' && self.listenerCount('change') === 0 && self.cursor) {
      self.cursor.removeAllListeners('data');
    }
  });
};

inherits(ChangeStream, EventEmitter);

// Create a new change stream cursor based on self's configuration
var createChangeStreamCursor = function(self) {
  if (self.resumeToken) {
    self.options.resumeAfter = self.resumeToken;
  }

  var changeStreamCursor = buildChangeStreamAggregationCommand(
    self.serverConfig,
    self.namespace,
    self.pipeline,
    self.resumeToken,
    self.options
  );

  /**
   * Fired for each new matching change in the specified namespace. Attaching a `change` event listener to a Change Stream will switch the stream into flowing mode. Data will then be passed as soon as it is available.
   *
   * @event ChangeStream#change
   * @type {object}
   */
  if (self.listenerCount('change') > 0) {
    changeStreamCursor.on('data', function(change) {
      processNewChange(self, null, change);
    });
  }

  /**
   * Change stream close event
   *
   * @event ChangeStream#close
   * @type {null}
   */
  changeStreamCursor.on('close', function() {
    self.emit('close');
  });

  /**
   * Change stream end event
   *
   * @event ChangeStream#end
   * @type {null}
   */
  changeStreamCursor.on('end', function() {
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

var buildChangeStreamAggregationCommand = function(
  serverConfig,
  namespace,
  pipeline,
  resumeToken,
  options
) {
  var changeStreamStageOptions = {};
  if (options.fullDocument) {
    changeStreamStageOptions.fullDocument = options.fullDocument;
  }

  if (resumeToken || options.resumeAfter) {
    changeStreamStageOptions.resumeAfter = resumeToken || options.resumeAfter;
  }

  // Map cursor options
  var cursorOptions = {};
  cursorOptionNames.forEach(function(optionName) {
    if (options[optionName]) {
      cursorOptions[optionName] = options[optionName];
    }
  });

  var changeStreamPipeline = [{ $changeStream: changeStreamStageOptions }];

  changeStreamPipeline = changeStreamPipeline.concat(pipeline);

  var command = {
    aggregate: namespace.collection,
    pipeline: changeStreamPipeline,
    readConcern: { level: 'majority' },
    cursor: {
      batchSize: options.batchSize || 1
    }
  };

  // Create and return the cursor
  return serverConfig.cursor(
    namespace.database + '.' + namespace.collection,
    command,
    cursorOptions
  );
};

/**
 * Check if there is any document still available in the Change Stream
 * @function ChangeStream.prototype.hasNext
 * @param {ChangeStream~resultCallback} [callback] The result callback.
 * @throws {MongoError}
 * @return {Promise} returns Promise if no callback passed
 */
ChangeStream.prototype.hasNext = function(callback) {
  return this.cursor.hasNext(callback);
};

/**
 * Get the next available document from the Change Stream, returns null if no more documents are available.
 * @function ChangeStream.prototype.next
 * @param {ChangeStream~resultCallback} [callback] The result callback.
 * @throws {MongoError}
 * @return {Promise} returns Promise if no callback passed
 */
ChangeStream.prototype.next = function(callback) {
  var self = this;
  if (this.isClosed()) {
    if (callback) return callback(new Error('Change Stream is not open.'), null);
    return self.promiseLibrary.reject(new Error('Change Stream is not open.'));
  }
  return this.cursor
    .next()
    .then(function(change) {
      return processNewChange(self, null, change, callback);
    })
    .catch(function(err) {
      return processNewChange(self, err, null, callback);
    });
};

/**
 * Is the cursor closed
 * @method ChangeStream.prototype.isClosed
 * @return {boolean}
 */
ChangeStream.prototype.isClosed = function() {
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
ChangeStream.prototype.close = function(callback) {
  if (!this.cursor) {
    if (callback) return callback();
    return this.promiseLibrary.resolve();
  }

  // Tidy up the existing cursor
  var cursor = this.cursor;
  delete this.cursor;
  return cursor.close(callback);
};

/**
 * This method pulls all the data out of a readable stream, and writes it to the supplied destination, automatically managing the flow so that the destination is not overwhelmed by a fast readable stream.
 * @method
 * @param {Writable} destination The destination for writing data
 * @param {object} [options] {@link https://nodejs.org/api/stream.html#stream_readable_pipe_destination_options|Pipe options}
 * @return {null}
 */
ChangeStream.prototype.pipe = function(destination, options) {
  if (!this.pipeDestinations) {
    this.pipeDestinations = [];
  }
  this.pipeDestinations.push(destination);
  return this.cursor.pipe(destination, options);
};

/**
 * This method will remove the hooks set up for a previous pipe() call.
 * @param {Writable} [destination] The destination for writing data
 * @return {null}
 */
ChangeStream.prototype.unpipe = function(destination) {
  if (this.pipeDestinations && this.pipeDestinations.indexOf(destination) > -1) {
    this.pipeDestinations.splice(this.pipeDestinations.indexOf(destination), 1);
  }
  return this.cursor.unpipe(destination);
};

/**
 * This method will cause a stream in flowing mode to stop emitting data events. Any data that becomes available will remain in the internal buffer.
 * @return {null}
 */
ChangeStream.prototype.pause = function() {
  return this.cursor.pause();
};

/**
 * This method will cause the readable stream to resume emitting data events.
 * @return {null}
 */
ChangeStream.prototype.resume = function() {
  return this.cursor.resume();
};

/**
 * Return a modified Readable stream including a possible transform method.
 * @method
 * @param {object} [options=null] Optional settings.
 * @param {function} [options.transform=null] A transformation method applied to each document emitted by the stream.
 * @return {Cursor}
 */
ChangeStream.prototype.stream = function(options) {
  this.streamOptions = options;
  return this.cursor.stream(options);
};

// Handle new change events. This method brings together the routes from the callback, event emitter, and promise ways of using ChangeStream.
var processNewChange = function(self, err, change, callback) {
  // Handle errors
  if (err) {
    // Handle resumable MongoNetworkErrors
    if (err instanceof MongoNetworkError && !self.attemptingResume) {
      self.attemptingResume = true;
      return self.cursor.close(function(closeErr) {
        if (closeErr) {
          if (callback) return callback(err, null);
          return self.promiseLibrary.reject(err);
        }

        // Establish a new cursor
        self.cursor = createChangeStreamCursor(self);

        // Attempt to reconfigure piping
        if (self.pipeDestinations) {
          var cursorStream = self.cursor.stream(self.streamOptions);
          for (var pipeDestination in self.pipeDestinations) {
            cursorStream.pipe(pipeDestination);
          }
        }

        // Attempt the next() operation again
        if (callback) return self.next(callback);
        return self.next();
      });
    }

    if (typeof callback === 'function') return callback(err, null);
    if (self.listenerCount('error')) return self.emit('error', err);
    return self.promiseLibrary.reject(err);
  }
  self.attemptingResume = false;

  // Cache the resume token if it is present. If it is not present return an error.
  if (!change || !change._id) {
    var noResumeTokenError = new Error(
      'A change stream document has been received that lacks a resume token (_id).'
    );
    if (typeof callback === 'function') return callback(noResumeTokenError, null);
    if (self.listenerCount('error')) return self.emit('error', noResumeTokenError);
    return self.promiseLibrary.reject(noResumeTokenError);
  }
  self.resumeToken = change._id;

  // Return the change
  if (typeof callback === 'function') return callback(err, change);
  if (self.listenerCount('change')) return self.emit('change', change);
  return self.promiseLibrary.resolve(change);
};

/**
 * The callback format for results
 * @callback ChangeStream~resultCallback
 * @param {MongoError} error An error instance representing the error during the execution.
 * @param {(object|null)} result The result object if the command was executed successfully.
 */

module.exports = ChangeStream;
