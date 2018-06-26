'use strict';

const EventEmitter = require('events');
const isResumableError = require('./error').isResumableError;
const MongoError = require('mongodb-core').MongoError;

var cursorOptionNames = ['maxAwaitTimeMS', 'collation', 'readPreference'];

const CHANGE_DOMAIN_TYPES = {
  COLLECTION: Symbol('Collection'),
  DATABASE: Symbol('Database'),
  CLUSTER: Symbol('Cluster')
};

/**
 * Creates a new Change Stream instance. Normally created using {@link Collection#watch|Collection.watch()}.
 * @class ChangeStream
 * @since 3.0.0
 * @param {(MongoClient|Db|Collection)} changeDomain The domain against which to create the change stream
 * @param {Array} pipeline An array of {@link https://docs.mongodb.com/manual/reference/operator/aggregation-pipeline/|aggregation pipeline stages} through which to pass change stream documents
 * @param {object} [options] Optional settings
 * @param {string} [options.fullDocument='default'] Allowed values: ‘default’, ‘updateLookup’. When set to ‘updateLookup’, the change stream will include both a delta describing the changes to the document, as well as a copy of the entire document that was changed from some time after the change occurred.
 * @param {number} [options.maxAwaitTimeMS] The maximum amount of time for the server to wait on new documents to satisfy a change stream query
 * @param {object} [options.resumeAfter] Specifies the logical starting point for the new change stream. This should be the _id field from a previously returned change stream document.
 * @param {number} [options.batchSize] The number of documents to return per batch. See {@link https://docs.mongodb.com/manual/reference/command/aggregate|aggregation documentation}.
 * @param {object} [options.collation] Specify collation settings for operation. See {@link https://docs.mongodb.com/manual/reference/command/aggregate|aggregation documentation}.
 * @param {ReadPreference} [options.readPreference] The read preference. Defaults to the read preference of the database or collection. See {@link https://docs.mongodb.com/manual/reference/read-preference|read preference documentation}.
 * @fires ChangeStream#close
 * @fires ChangeStream#change
 * @fires ChangeStream#end
 * @fires ChangeStream#error
 * @return {ChangeStream} a ChangeStream instance.
 */

class ChangeStream extends EventEmitter {
  constructor(changeDomain, pipeline, options) {
    super();
    const Collection = require('./collection');
    const Db = require('./db');
    const MongoClient = require('./mongo_client');

    this.pipeline = pipeline || [];
    this.options = options || {};
    this.cursorNamespace = undefined;
    this.namespace = {};

    if (changeDomain instanceof Collection) {
      this.type = CHANGE_DOMAIN_TYPES.COLLECTION;
      this.serverConfig = changeDomain.s.db.serverConfig;

      this.namespace = {
        collection: changeDomain.collectionName,
        database: changeDomain.s.db.databaseName
      };

      this.cursorNamespace = `${this.namespace.database}.${this.namespace.collection}`;
    } else if (changeDomain instanceof Db) {
      this.type = CHANGE_DOMAIN_TYPES.DATABASE;
      this.namespace = { collection: '', database: changeDomain.databaseName };
      this.cursorNamespace = this.namespace.database;
      this.serverConfig = changeDomain.serverConfig;
    } else if (changeDomain instanceof MongoClient) {
      this.type = CHANGE_DOMAIN_TYPES.CLUSTER;
      this.namespace = { collection: '', database: 'admin' };
      this.cursorNamespace = this.namespace.database;
      this.serverConfig = changeDomain.topology;
    } else {
      throw new TypeError(
        'changeDomain provided to ChangeStream constructor is not an instance of Collection, Db, or MongoClient'
      );
    }

    this.promiseLibrary = changeDomain.s.promiseLibrary;
    if (!this.options.readPreference && changeDomain.s.readPreference) {
      this.options.readPreference = changeDomain.s.readPreference;
    }

    // We need to get the operationTime as early as possible
    const isMaster = this.serverConfig.lastIsMaster();
    if (!isMaster) {
      throw new MongoError('ServerConfig does not have an ismaster yet.');
    }

    this.operationTime = isMaster.operationTime;

    // Create contained Change Stream cursor
    this.cursor = createChangeStreamCursor(this);

    // Listen for any `change` listeners being added to ChangeStream
    this.on('newListener', eventName => {
      if (eventName === 'change' && this.cursor && this.cursor.listenerCount('change') === 0) {
        this.cursor.on('data', change => processNewChange(this, null, change));
      }
    });

    // Listen for all `change` listeners being removed from ChangeStream
    this.on('removeListener', eventName => {
      if (eventName === 'change' && this.listenerCount('change') === 0 && this.cursor) {
        this.cursor.removeAllListeners('data');
      }
    });
  }

  /**
   * Check if there is any document still available in the Change Stream
   * @function ChangeStream.prototype.hasNext
   * @param {ChangeStream~resultCallback} [callback] The result callback.
   * @throws {MongoError}
   * @return {Promise} returns Promise if no callback passed
   */
  hasNext(callback) {
    return this.cursor.hasNext(callback);
  }

  /**
   * Get the next available document from the Change Stream, returns null if no more documents are available.
   * @function ChangeStream.prototype.next
   * @param {ChangeStream~resultCallback} [callback] The result callback.
   * @throws {MongoError}
   * @return {Promise} returns Promise if no callback passed
   */
  next(callback) {
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
  }

  /**
   * Is the cursor closed
   * @method ChangeStream.prototype.isClosed
   * @return {boolean}
   */
  isClosed() {
    if (this.cursor) {
      return this.cursor.isClosed();
    }
    return true;
  }

  /**
   * Close the Change Stream
   * @method ChangeStream.prototype.close
   * @param {ChangeStream~resultCallback} [callback] The result callback.
   * @return {Promise} returns Promise if no callback passed
   */
  close(callback) {
    if (!this.cursor) {
      if (callback) return callback();
      return this.promiseLibrary.resolve();
    }

    // Tidy up the existing cursor
    var cursor = this.cursor;
    delete this.cursor;
    return cursor.close(callback);
  }

  /**
   * This method pulls all the data out of a readable stream, and writes it to the supplied destination, automatically managing the flow so that the destination is not overwhelmed by a fast readable stream.
   * @method
   * @param {Writable} destination The destination for writing data
   * @param {object} [options] {@link https://nodejs.org/api/stream.html#stream_readable_pipe_destination_options|Pipe options}
   * @return {null}
   */
  pipe(destination, options) {
    if (!this.pipeDestinations) {
      this.pipeDestinations = [];
    }
    this.pipeDestinations.push(destination);
    return this.cursor.pipe(destination, options);
  }

  /**
   * This method will remove the hooks set up for a previous pipe() call.
   * @param {Writable} [destination] The destination for writing data
   * @return {null}
   */
  unpipe(destination) {
    if (this.pipeDestinations && this.pipeDestinations.indexOf(destination) > -1) {
      this.pipeDestinations.splice(this.pipeDestinations.indexOf(destination), 1);
    }
    return this.cursor.unpipe(destination);
  }

  /**
   * Return a modified Readable stream including a possible transform method.
   * @method
   * @param {object} [options] Optional settings.
   * @param {function} [options.transform] A transformation method applied to each document emitted by the stream.
   * @return {Cursor}
   */
  stream(options) {
    this.streamOptions = options;
    return this.cursor.stream(options);
  }

  /**
   * This method will cause a stream in flowing mode to stop emitting data events. Any data that becomes available will remain in the internal buffer.
   * @return {null}
   */
  pause() {
    return this.cursor.pause();
  }

  /**
   * This method will cause the readable stream to resume emitting data events.
   * @return {null}
   */
  resume() {
    return this.cursor.resume();
  }
}

// Create a new change stream cursor based on self's configuration
var createChangeStreamCursor = function(self) {
  if (self.resumeToken) {
    self.options.resumeAfter = self.resumeToken;
  }

  var changeStreamCursor = buildChangeStreamAggregationCommand(self);

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

  if (self.pipeDestinations) {
    const cursorStream = changeStreamCursor.stream(self.streamOptions);
    for (let pipeDestination in self.pipeDestinations) {
      cursorStream.pipe(pipeDestination);
    }
  }

  return changeStreamCursor;
};

function getResumeToken(self) {
  return self.resumeToken || self.options.resumeAfter;
}

function getStartAtOperationTime(self) {
  const isMaster = self.serverConfig.lastIsMaster() || {};
  return (
    isMaster.maxWireVersion && isMaster.maxWireVersion >= 7 && self.options.startAtOperationTime
  );
}

var buildChangeStreamAggregationCommand = function(self) {
  const serverConfig = self.serverConfig;
  const namespace = self.namespace;
  const pipeline = self.pipeline;
  const options = self.options;
  const cursorNamespace = self.cursorNamespace;

  var changeStreamStageOptions = {
    fullDocument: options.fullDocument || 'default'
  };

  const resumeToken = getResumeToken(self);
  const startAtOperationTime = getStartAtOperationTime(self);
  if (resumeToken) {
    changeStreamStageOptions.resumeAfter = resumeToken;
  }

  if (startAtOperationTime) {
    changeStreamStageOptions.startAtOperationTime = startAtOperationTime;
  }

  // Map cursor options
  var cursorOptions = {};
  cursorOptionNames.forEach(function(optionName) {
    if (options[optionName]) {
      cursorOptions[optionName] = options[optionName];
    }
  });

  if (self.type === CHANGE_DOMAIN_TYPES.CLUSTER) {
    changeStreamStageOptions.allChangesForCluster = true;
  }

  var changeStreamPipeline = [{ $changeStream: changeStreamStageOptions }];

  changeStreamPipeline = changeStreamPipeline.concat(pipeline);

  var command = {
    aggregate: self.type === CHANGE_DOMAIN_TYPES.COLLECTION ? namespace.collection : 1,
    pipeline: changeStreamPipeline,
    readConcern: { level: 'majority' },
    cursor: {
      batchSize: options.batchSize || 1
    }
  };

  // Create and return the cursor
  return serverConfig.cursor(cursorNamespace, command, cursorOptions);
};

// Handle new change events. This method brings together the routes from the callback, event emitter, and promise ways of using ChangeStream.
var processNewChange = function(self, err, change, callback) {
  // Handle errors
  if (err) {
    // Handle resumable MongoNetworkErrors
    if (isResumableError(err) && !self.attemptingResume) {
      self.attemptingResume = true;

      if (!(getResumeToken(self) || getStartAtOperationTime(self))) {
        const startAtOperationTime = self.cursor.cursorState.operationTime;
        self.options = Object.assign({ startAtOperationTime }, self.options);
      }

      if (callback) {
        return self.cursor.close(function(closeErr) {
          if (closeErr) {
            return callback(err, null);
          }

          self.cursor = createChangeStreamCursor(self);

          return self.next(callback);
        });
      }

      return self.cursor
        .close()
        .then(() => (self.cursor = createChangeStreamCursor(self)))
        .then(() => self.next());
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
