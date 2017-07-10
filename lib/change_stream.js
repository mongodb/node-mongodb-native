var EventEmitter = require('events'),
    inherits = require('util').inherits,
    changeStreamSimulator = require('./change_stream_simulator');

/**
 * Creates a new Change Stream instance (INTERNAL TYPE, do not instantiate directly)
 * @class ChangeStream
 * @fires ChangeStream#change
 * @return {ChangeStream} a ChangeStream instance.
 */
var ChangeStream = function(changeDomain, pipeline, options) {
  var self = this;

  var createChangeStreamCursor = function () {
    var serverSupportsChangeNotifications = false;
    if (serverSupportsChangeNotifications) {
      // An implementation something like this once the server supports the $changeNotifications aggregation pipeline stage
      if (changeDomain.collectionName) {
        // changeStreamCursor = changeDomain.aggregate([{$changeNotifications:{}}].concat(pipeline), options)
      } else if (changeDomain.databaseName) {
        // Somehow create an aggregation with database 1
      } else {
        throw new Error('changeDomain must be either a database or collection.');
      }
    } else {
      var namespace = [];
      var serverConfig;
      if (changeDomain.collectionName) {
        namespace.database = changeDomain.s.db.databaseName;
        namespace.collection = changeDomain.collectionName;
        serverConfig = changeDomain.s.db.serverConfig;
      } else if (changeDomain.databaseName) {
        namespace.database = changeDomain.databaseName;
        serverConfig = changeDomain.serverConfig;
      } else {
        throw new Error('changeDomain must be either a database or collection.');
      }

      // Set a no conflict value for this Change Stream if it does not already exist
      options.cursorNoConflict = options.cursorNoConflict || Math.random().toString().substring(2, 12);

      // Create the change stream cursor using the black box simulator
      var changeStreamCursor = changeStreamSimulator.createChangeStreamCursorSimulation(serverConfig, namespace, pipeline, options);
    }

    if (self.changeListenerExists) {
      changeStreamCursor.on('data', function (data) {
        self.emit('change', data);
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
        createChangeStreamCursor();

      }
    });

    self.cursor = changeStreamCursor;
  };

  createChangeStreamCursor();

  self.on('newListener', function(eventName) {
    if (eventName === 'change') {
      self.changeListenerExists = true;
      self.cursor.on('data', function (data) {
        self.emit('change', data);
      });
    }
  });

};

/**
 * Get the resume token of the most recently returned document
 * @method
 * @return {ResumeToken}
 */
ChangeStream.prototype.resumeToken = function () {
  return this.resumeToken;
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
  if (this.isClosed()) {
    if (callback) return callback(new Error('Change Stream is not open.'), null);
    return Promise.reject('Change Stream is not open.');
  }
  if (typeof callback === 'function') {
    return this.cursor.next(callback);
  }
  return this.cursor.next();
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

/**
 * The callback format for results
 * @callback AggregationCursor~resultCallback
 * @param {MongoError} error An error instance representing the error during the execution.
 * @param {(object|null)} result The result object if the command was executed successfully.
 */

inherits(ChangeStream, EventEmitter);

module.exports = ChangeStream;
