var EventEmitter = require('events'),
    inherits = require('util').inherits,
    changeStreamSimulator = require('./change_stream_simulator');

/**
 * Creates a new Change Stream instance (INTERNAL TYPE, do not instantiate directly)
 * @class ChangeStream
 * @param {(Db|Collection)} changeDomain The database or collection against which to create the change stream
 * @param {Array} pipeline An array of aggregation pipeline stages through which to pass change stream documents
 * @param {object} [options=null] Optional settings
 * @param {string} [options.fullDocument=none] Allowed values: ‘none’, ‘lookup’. When set to ‘lookup’, the change stream will include both a delta describing the changes to the document, as well as a copy of the entire document that was changed from some time after the change occurred.
 * @param {number} [options.maxAwaitTimeMS] The maximum amount of time for the server to wait on new documents to satisfy a change stream query
 * @param {object} [options.resumeAfter=null] Specifies the logical starting point for the new change stream. This should be the _id field from a previously returned change stream document.
 * @param {boolean} [options.disableResume=false] Whether the driver should automatically attempt to resume the change stream in the event of a potentially resumable error (such as a network error)
 * @param {number} [options.batchSize=null] The number of documents to return per batch. See {@link https://docs.mongodb.com/manual/reference/command/aggregate|aggregation documentation}.
 * @param {object} [options.collation=null] Specify collation settings for operation. See {@link https://docs.mongodb.com/manual/reference/command/aggregate|aggregation documentation}.
 * @param {ReadPreference} [options.readPreference=null] The read preference. Defaults to the read preference of the database or collection. See {@link https://docs.mongodb.com/manual/reference/read-preference|read preference documentation}.
 * @fires ChangeStream#change
 * @return {ChangeStream} a ChangeStream instance.
 */
var ChangeStream = function(changeDomain, pipeline, options) {
  var self = this;
  self.changeDomain = changeDomain;
  self.pipeline = pipeline || [];
  self.options = options || {};

  // Extract the resume token (if it exists)
  if (options.resumeAfter) {
    self.cachedResumeToken = options.resumeAfter;
  }

  // Extract namespace and serverConfig from changeDomain
  self.namespace = {};
  if (changeDomain.collectionName) {
    self.namespace.database = self.changeDomain.s.db.databaseName;
    self.namespace.collection = self.changeDomain.collectionName;
    self.serverConfig = self.changeDomain.s.db.serverConfig;
  } else if (self.changeDomain.databaseName) {
    self.namespace.database = self.changeDomain.databaseName;
    self.serverConfig = self.changeDomain.serverConfig;
  } else {
    throw new Error('changeDomain must be either a database or collection.');
  }

  self.cursor = createChangeStreamCursor(self);

  self.on('newListener', function(eventName) {
    if (eventName === 'change') {
      self.changeListenerExists = true;
      self.cursor.on('data', function (change) {
        processNewChange(self, null, change, 'eventEmitter');
      });
    }
  });

};

// Create a new change stream cursor based on self's configuration
var createChangeStreamCursor = function (self) {
  var changeStreamCursor;

  var serverSupportsChangeNotifications = false;
  if (serverSupportsChangeNotifications) {
    var collectionName = self.changeDomain.collectionName ? self.changeDomain.collectionName : 1;
    changeStreamCursor = buildChangeStreamAggregationCommand(self, collectionName);

  } else {
    // Generate a no conflict value for this Change Stream if it does not already exist.
    // This prevents collisions when multiple change stream simulations exist simulataneously.
    self.options.cursorNoConflict = self.options.cursorNoConflict || Math.random().toString().substring(2, 12);

    // Create the change stream cursor using the black box simulator
    changeStreamCursor = changeStreamSimulator.createChangeStreamCursorSimulation(self.serverConfig, self.namespace, self.pipeline, self.options);
  }

  if (self.changeListenerExists) {
    changeStreamCursor.on('data', function (change) {
      processNewChange(self, null, change, 'eventEmitter');
    });
  }

  changeStreamCursor.on('close', function() {
    if (!self.shuttingDown) {
      // Try to determine why the cursor closed

      // If it is a resumable error and has happened only once, follow resume process:
      //   - Perform server selection
      //   - Connect to selected server
      //   - Issue a command to kill the previous cursor
      //   - Execute the known aggregation command, specifying a ``resumeAfter`` with the last known ``resumeToken``

      // For now, we will just try to re-open the cursor
      self.cursor = createChangeStreamCursor(self);

    }
  });

  return changeStreamCursor;
};

var buildChangeStreamAggregationCommand = function (self, collectionName) {
    var changeNotificationStageOptions = {};
    if (self.options.fullDocument) {
      changeNotificationStageOptions.fullDocument = self.options.fullDocument;
    }
    if (self.cachedResumeToken && !self.options.disableResume) {
      changeNotificationStageOptions.resumeAfter = self.cachedResumeToken;
    }

    var changeStreamPipeline = [{$changeNotification: changeNotificationStageOptions}].concat(self.pipeline);
    var command = { aggregate : collectionName, pipeline : changeStreamPipeline };

    // Execute the cursor
    return self.serverConfig.cursor(self.namespace.database + '.' + collectionName, command, self.options);
};

/**
 * Get the resume token of the most recently returned document
 * @method
 * @return {ResumeToken}
 */
ChangeStream.prototype.resumeToken = function () {
  return this.cachedResumeToken;
};

/**
 * Check if there is any document still available in the Change Stream
 * @function ChangeStream.prototype.hasNext
 * @param {ChangeStream~resultCallback} [callback] The result callback.
 * @throws {MongoError}
 * @return {Promise} returns Promise if no callback passed
 */
ChangeStream.prototype.hasNext = function (callback) {
  if (typeof callback === 'function') {
    return this.cursor.hasNext(callback);
  }
  return this.cursor.hasNext();
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
    return Promise.reject(new Error('Change Stream is not open.'));
  }
  if (typeof callback === 'function') {
    return this.cursor.next(function(err, change) {
      return processNewChange(self, err, change, callback);
    });
  }
  return this.cursor.next().then(function(change) {
    return processNewChange(self, null, change);
  });
};

/**
 * Is the cursor closed
 * @method ChangeStream.prototype.isClosed
 * @return {boolean}
 */
ChangeStream.prototype.isClosed = function () {
  if (!this.cursor) {
    return true;
  }
  return this.cursor.isClosed();
};

/**
 * Close the Change Stream
 * @method ChangeStream.prototype.close
 * @param {ChangeStream~resultCallback} [callback] The result callback.
 * @return {Promise} returns Promise if no callback passed
 */
ChangeStream.prototype.close = function (callback) {
  this.shuttingDown = true;
  if (typeof callback === 'function') {
    return this.cursor.close(callback);
  }
  return this.cursor.close();
};

// Handle new change events. This method brings together the routes from the callback, event emitter, and promise ways of using ChangeStream.
var processNewChange = function (self, err, change, callback) {
  // Cache the resume token if it is present. If it is not present and disableResume is false, return an error.
  if (!err && !self.options.disableResume) {
    if (!change._id) {
      var noResumeTokenError = new Error('A change stream document has been recieved that lacks a resume token (_id) and resumability has not been disabled for this change stream.');
      if (typeof callback === 'function') return callback(noResumeTokenError, null);
      if (typeof callback === 'string') return self.emit('error', noResumeTokenError);
      return Promise.reject(noResumeTokenError);
    }
    self.cachedResumeToken = change._id;
  }

  // Close the change stream if an invalidation occurs
  if (change.operationType === 'invalidate') {
    self.close();
  }

  // Return the change
  if (typeof callback === 'function') return callback(err, change);
  if (typeof callback === 'string') return self.emit('change', change);
  return Promise.resolve(change);
};

/**
 * The callback format for results
 * @callback AggregationCursor~resultCallback
 * @param {MongoError} error An error instance representing the error during the execution.
 * @param {(object|null)} result The result object if the command was executed successfully.
 */

inherits(ChangeStream, EventEmitter);

module.exports = ChangeStream;
