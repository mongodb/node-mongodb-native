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
      this.topology = changeDomain.s.db.serverConfig;

      this.namespace = {
        collection: changeDomain.collectionName,
        database: changeDomain.s.db.databaseName
      };

      this.cursorNamespace = `${this.namespace.database}.${this.namespace.collection}`;
    } else if (changeDomain instanceof Db) {
      this.type = CHANGE_DOMAIN_TYPES.DATABASE;
      this.namespace = { collection: '', database: changeDomain.databaseName };
      this.cursorNamespace = this.namespace.database;
      this.topology = changeDomain.serverConfig;
    } else if (changeDomain instanceof MongoClient) {
      this.type = CHANGE_DOMAIN_TYPES.CLUSTER;
      this.namespace = { collection: '', database: 'admin' };
      this.cursorNamespace = this.namespace.database;
      this.topology = changeDomain.topology;
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
    const isMaster = this.topology.lastIsMaster();
    if (!isMaster) {
      throw new MongoError('Topology does not have an ismaster yet.');
    }

    this.operationTime = isMaster.operationTime;

    // Create contained Change Stream cursor
    this.cursor = createChangeStreamCursor(this);

    // Listen for any `change` listeners being added to ChangeStream
    this.on('newListener', eventName => {
      if (eventName === 'change' && this.cursor && this.listenerCount('change') === 0) {
        this.cursor.on('data', change =>
          processNewChange({ changeStream: this, change, eventEmitter: true })
        );
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
      .then(change => processNewChange({ changeStream: self, change, callback }))
      .catch(error => processNewChange({ changeStream: self, error, callback }));
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
   * Fired for each new matching change in the specified namespace. Attaching a `change`
   * event listener to a Change Stream will switch the stream into flowing mode. Data will
   * then be passed as soon as it is available.
   *
   * @event ChangeStream#change
   * @type {object}
   */
  if (self.listenerCount('change') > 0) {
    changeStreamCursor.on('data', function(change) {
      processNewChange({ changeStream: self, change, eventEmitter: true });
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
    processNewChange({ changeStream: self, error, eventEmitter: true });
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
  const isMaster = self.topology.lastIsMaster() || {};
  return (
    isMaster.maxWireVersion && isMaster.maxWireVersion >= 7 && self.options.startAtOperationTime
  );
}

var buildChangeStreamAggregationCommand = function(self) {
  const topology = self.topology;
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
  return topology.cursor(cursorNamespace, command, cursorOptions);
};

// This method performs a basic server selection loop, satisfying the requirements of
// ChangeStream resumability until the new SDAM layer can be used.
const SELECTION_TIMEOUT = 30000;
function waitForTopologyConnected(topology, options, callback) {
  setTimeout(() => {
    if (options && options.start == null) options.start = process.hrtime();
    const start = options.start || process.hrtime();
    const timeout = options.timeout || SELECTION_TIMEOUT;
    const readPreference = options.readPreference;

    if (topology.isConnected({ readPreference })) return callback(null, null);
    const hrElapsed = process.hrtime(start);
    const elapsed = (hrElapsed[0] * 1e9 + hrElapsed[1]) / 1e6;
    if (elapsed > timeout) return callback(new MongoError('Timed out waiting for connection'));
    waitForTopologyConnected(topology, options, callback);
  }, 3000); // this is an arbitrary wait time to allow SDAM to transition
}

// Handle new change events. This method brings together the routes from the callback, event emitter, and promise ways of using ChangeStream.
function processNewChange(args) {
  const changeStream = args.changeStream;
  const error = args.error;
  const change = args.change;
  const callback = args.callback;
  const eventEmitter = args.eventEmitter || false;
  const topology = changeStream.topology;
  const options = changeStream.cursor.options;

  if (error) {
    if (isResumableError(error) && !changeStream.attemptingResume) {
      changeStream.attemptingResume = true;

      if (!(getResumeToken(changeStream) || getStartAtOperationTime(changeStream))) {
        const startAtOperationTime = changeStream.cursor.cursorState.operationTime;
        changeStream.options = Object.assign({ startAtOperationTime }, changeStream.options);
      }

      // stop listening to all events from old cursor
      ['data', 'close', 'end', 'error'].forEach(event =>
        changeStream.cursor.removeAllListeners(event)
      );

      // close internal cursor, ignore errors
      changeStream.cursor.close();

      // attempt recreating the cursor
      if (eventEmitter) {
        waitForTopologyConnected(topology, { readPreference: options.readPreference }, err => {
          if (err) return changeStream.emit('error', err);
          changeStream.cursor = createChangeStreamCursor(changeStream);
        });

        return;
      }

      if (callback) {
        waitForTopologyConnected(topology, { readPreference: options.readPreference }, err => {
          if (err) return callback(err, null);

          changeStream.cursor = createChangeStreamCursor(changeStream);
          changeStream.next(callback);
        });

        return;
      }

      return new Promise((resolve, reject) => {
        waitForTopologyConnected(topology, { readPreference: options.readPreference }, err => {
          if (err) return reject(err);
          resolve();
        });
      })
        .then(() => (changeStream.cursor = createChangeStreamCursor(changeStream)))
        .then(() => changeStream.next());
    }

    if (eventEmitter) return changeStream.emit('error', error);
    if (typeof callback === 'function') return callback(error, null);
    return changeStream.promiseLibrary.reject(error);
  }

  changeStream.attemptingResume = false;

  // Cache the resume token if it is present. If it is not present return an error.
  if (!change || !change._id) {
    var noResumeTokenError = new Error(
      'A change stream document has been received that lacks a resume token (_id).'
    );

    if (eventEmitter) return changeStream.emit('error', noResumeTokenError);
    if (typeof callback === 'function') return callback(noResumeTokenError, null);
    return changeStream.promiseLibrary.reject(noResumeTokenError);
  }

  changeStream.resumeToken = change._id;

  // Return the change
  if (eventEmitter) return changeStream.emit('change', change);
  if (typeof callback === 'function') return callback(error, change);
  return changeStream.promiseLibrary.resolve(change);
}

/**
 * The callback format for results
 * @callback ChangeStream~resultCallback
 * @param {MongoError} error An error instance representing the error during the execution.
 * @param {(object|null)} result The result object if the command was executed successfully.
 */

module.exports = ChangeStream;
