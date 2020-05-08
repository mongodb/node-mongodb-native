'use strict';

const PromiseProvider = require('./promise_provider');
const EventEmitter = require('events');
const { MongoError, isResumableError } = require('./error');
const { Cursor } = require('./cursor');
const { relayEvents, maxWireVersion } = require('./utils');
const maybePromise = require('./utils').maybePromise;
const AggregateOperation = require('./operations/aggregate');

const CHANGE_STREAM_OPTIONS = ['resumeAfter', 'startAfter', 'startAtOperationTime', 'fullDocument'];
const CURSOR_OPTIONS = ['batchSize', 'maxAwaitTimeMS', 'collation', 'readPreference'].concat(
  CHANGE_STREAM_OPTIONS
);

const CHANGE_DOMAIN_TYPES = {
  COLLECTION: Symbol('Collection'),
  DATABASE: Symbol('Database'),
  CLUSTER: Symbol('Cluster')
};

/**
 * @typedef ResumeToken
 * @description Represents the logical starting point for a new or resuming {@link ChangeStream} on the server.
 * @see https://docs.mongodb.com/master/changeStreams/#change-stream-resume-token
 */

/**
 * @typedef OperationTime
 * @description Represents a specific point in time on a server. Can be retrieved by using {@link Db#command}
 * @see https://docs.mongodb.com/manual/reference/method/db.runCommand/#response
 */

/**
 * @typedef ChangeStreamOptions
 * @description Options that can be passed to a ChangeStream. Note that startAfter, resumeAfter, and startAtOperationTime are all mutually exclusive, and the server will error if more than one is specified.
 * @property {string} [fullDocument='default'] Allowed values: ‘default’, ‘updateLookup’. When set to ‘updateLookup’, the change stream will include both a delta describing the changes to the document, as well as a copy of the entire document that was changed from some time after the change occurred.
 * @property {number} [maxAwaitTimeMS] The maximum amount of time for the server to wait on new documents to satisfy a change stream query.
 * @property {ResumeToken} [resumeAfter] Allows you to start a changeStream after a specified event. See {@link https://docs.mongodb.com/master/changeStreams/#resumeafter-for-change-streams|ChangeStream documentation}.
 * @property {ResumeToken} [startAfter] Similar to resumeAfter, but will allow you to start after an invalidated event. See {@link https://docs.mongodb.com/master/changeStreams/#startafter-for-change-streams|ChangeStream documentation}.
 * @property {OperationTime} [startAtOperationTime] Will start the changeStream after the specified operationTime.
 * @property {number} [batchSize=1000] The number of documents to return per batch. See {@link https://docs.mongodb.com/manual/reference/command/aggregate|aggregation documentation}.
 * @property {object} [collation] Specify collation settings for operation. See {@link https://docs.mongodb.com/manual/reference/command/aggregate|aggregation documentation}.
 * @property {ReadPreference} [readPreference] The read preference. Defaults to the read preference of the database or collection. See {@link https://docs.mongodb.com/manual/reference/read-preference|read preference documentation}.
 */

/**
 * Creates a new Change Stream instance. Normally created using {@link Collection#watch|Collection.watch()}.
 *
 * @class ChangeStream
 * @since 3.0.0
 * @param {(MongoClient|Db|Collection)} parent The parent object that created this change stream
 * @param {Array} pipeline An array of {@link https://docs.mongodb.com/manual/reference/operator/aggregation-pipeline/|aggregation pipeline stages} through which to pass change stream documents
 * @param {ChangeStreamOptions} [options] Optional settings
 * @fires ChangeStream#close
 * @fires ChangeStream#change
 * @fires ChangeStream#end
 * @fires ChangeStream#error
 * @fires ChangeStream#resumeTokenChanged
 * @returns {ChangeStream} a ChangeStream instance.
 */
class ChangeStream extends EventEmitter {
  constructor(parent, pipeline, options) {
    super();
    const Collection = require('./collection');
    const Db = require('./db');
    const MongoClient = require('./mongo_client');

    this.pipeline = pipeline || [];
    this.options = options || {};

    this.parent = parent;
    this.namespace = parent.s.namespace;
    if (parent instanceof Collection) {
      this.type = CHANGE_DOMAIN_TYPES.COLLECTION;
      this.topology = parent.s.db.serverConfig;
    } else if (parent instanceof Db) {
      this.type = CHANGE_DOMAIN_TYPES.DATABASE;
      this.topology = parent.serverConfig;
    } else if (parent instanceof MongoClient) {
      this.type = CHANGE_DOMAIN_TYPES.CLUSTER;
      this.topology = parent.topology;
    } else {
      throw new TypeError(
        'parent provided to ChangeStream constructor is not an instance of Collection, Db, or MongoClient'
      );
    }

    if (!this.options.readPreference && parent.s.readPreference) {
      this.options.readPreference = parent.s.readPreference;
    }

    // Create contained Change Stream cursor
    this.cursor = createChangeStreamCursor(this, options);

    this.closed = false;

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
   * @property {ResumeToken} resumeToken
   * The cached resume token that will be used to resume
   * after the most recently returned change.
   */
  get resumeToken() {
    return this.cursor.resumeToken;
  }

  /**
   * Check if there is any document still available in the Change Stream
   *
   * @function ChangeStream.prototype.hasNext
   * @param {ChangeStream~resultCallback} [callback] The result callback.
   * @throws {MongoError}
   * @returns {Promise|void} returns Promise if no callback passed
   */
  hasNext(callback) {
    return maybePromise(callback, cb => this.cursor.hasNext(cb));
  }

  /**
   * Get the next available document from the Change Stream, returns null if no more documents are available.
   *
   * @function ChangeStream.prototype.next
   * @param {ChangeStream~resultCallback} [callback] The result callback.
   * @throws {MongoError}
   * @returns {Promise|void} returns Promise if no callback passed
   */
  next(callback) {
    return maybePromise(callback, cb => {
      if (this.isClosed()) {
        return cb(new MongoError('ChangeStream is closed'));
      }
      this.cursor.next((error, change) => {
        processNewChange({ changeStream: this, error, change, callback: cb });
      });
    });
  }

  /**
   * Is the cursor closed
   *
   * @function ChangeStream.prototype.isClosed
   * @returns {boolean}
   */
  isClosed() {
    return this.closed || (this.cursor && this.cursor.isClosed());
  }

  /**
   * Close the Change Stream
   *
   * @function ChangeStream.prototype.close
   * @param {ChangeStream~resultCallback} [callback] The result callback.
   * @returns {Promise} returns Promise if no callback passed
   */
  close(callback) {
    return maybePromise(callback, cb => {
      if (this.closed) return cb();

      // flag the change stream as explicitly closed
      this.closed = true;

      // Tidy up the existing cursor
      const cursor = this.cursor;

      return cursor.close(err => {
        ['data', 'close', 'end', 'error'].forEach(event => cursor.removeAllListeners(event));
        this.cursor = undefined;

        return cb(err);
      });
    });
  }

  /**
   * This method pulls all the data out of a readable stream, and writes it to the supplied destination, automatically managing the flow so that the destination is not overwhelmed by a fast readable stream.
   *
   * @function
   * @param {Writable} destination The destination for writing data
   * @param {object} [options] {@link https://nodejs.org/api/stream.html#stream_readable_pipe_destination_options|Pipe options}
   * @returns {null}
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
   *
   * @param {Writable} [destination] The destination for writing data
   * @returns {null}
   */
  unpipe(destination) {
    if (this.pipeDestinations && this.pipeDestinations.indexOf(destination) > -1) {
      this.pipeDestinations.splice(this.pipeDestinations.indexOf(destination), 1);
    }
    return this.cursor.unpipe(destination);
  }

  /**
   * Return a modified Readable stream including a possible transform method.
   *
   * @function
   * @param {object} [options] Optional settings.
   * @param {Function} [options.transform] A transformation method applied to each document emitted by the stream.
   * @returns {Cursor}
   */
  stream(options) {
    this.streamOptions = options;
    return this.cursor.stream(options);
  }

  /**
   * This method will cause a stream in flowing mode to stop emitting data events. Any data that becomes available will remain in the internal buffer.
   *
   * @returns {null}
   */
  pause() {
    return this.cursor.pause();
  }

  /**
   * This method will cause the readable stream to resume emitting data events.
   *
   * @returns {null}
   */
  resume() {
    return this.cursor.resume();
  }
}

class ChangeStreamCursor extends Cursor {
  constructor(topology, operation, options) {
    super(topology, operation, options);

    options = options || {};
    this._resumeToken = null;
    this.startAtOperationTime = options.startAtOperationTime;

    if (options.startAfter) {
      this.resumeToken = options.startAfter;
    } else if (options.resumeAfter) {
      this.resumeToken = options.resumeAfter;
    }
  }

  set resumeToken(token) {
    this._resumeToken = token;
    this.emit('resumeTokenChanged', token);
  }

  get resumeToken() {
    return this._resumeToken;
  }

  get resumeOptions() {
    const result = {};
    for (const optionName of CURSOR_OPTIONS) {
      if (this.options[optionName]) result[optionName] = this.options[optionName];
    }

    if (this.resumeToken || this.startAtOperationTime) {
      ['resumeAfter', 'startAfter', 'startAtOperationTime'].forEach(key => delete result[key]);

      if (this.resumeToken) {
        const resumeKey =
          this.options.startAfter && !this.hasReceived ? 'startAfter' : 'resumeAfter';
        result[resumeKey] = this.resumeToken;
      } else if (this.startAtOperationTime && maxWireVersion(this.server) >= 7) {
        result.startAtOperationTime = this.startAtOperationTime;
      }
    }

    return result;
  }

  cacheResumeToken(resumeToken) {
    if (this.bufferedCount() === 0 && this.cursorState.postBatchResumeToken) {
      this.resumeToken = this.cursorState.postBatchResumeToken;
    } else {
      this.resumeToken = resumeToken;
    }
    this.hasReceived = true;
  }

  _processBatch(batchName, response) {
    const cursor = response.cursor;
    if (cursor.postBatchResumeToken) {
      this.cursorState.postBatchResumeToken = cursor.postBatchResumeToken;

      if (cursor[batchName].length === 0) {
        this.resumeToken = cursor.postBatchResumeToken;
      }
    }
  }

  _initializeCursor(callback) {
    super._initializeCursor((err, result) => {
      if (err) {
        callback(err);
        return;
      }

      const response = result.documents[0];

      if (
        this.startAtOperationTime == null &&
        this.resumeAfter == null &&
        this.startAfter == null &&
        maxWireVersion(this.server) >= 7
      ) {
        this.startAtOperationTime = response.operationTime;
      }

      this._processBatch('firstBatch', response);

      this.emit('init', result);
      this.emit('response');
      callback(err, result);
    });
  }

  _getMore(callback) {
    super._getMore((err, response) => {
      if (err) {
        callback(err);
        return;
      }

      this._processBatch('nextBatch', response);

      this.emit('more', response);
      this.emit('response');
      callback(err, response);
    });
  }
}

/**
 * @event ChangeStreamCursor#response
 * internal event DO NOT USE
 */

// Create a new change stream cursor based on self's configuration
function createChangeStreamCursor(self, options) {
  const changeStreamStageOptions = { fullDocument: options.fullDocument || 'default' };
  applyKnownOptions(changeStreamStageOptions, options, CHANGE_STREAM_OPTIONS);
  if (self.type === CHANGE_DOMAIN_TYPES.CLUSTER) {
    changeStreamStageOptions.allChangesForCluster = true;
  }

  const pipeline = [{ $changeStream: changeStreamStageOptions }].concat(self.pipeline);
  const cursorOptions = applyKnownOptions({}, options, CURSOR_OPTIONS);

  const changeStreamCursor = new ChangeStreamCursor(
    self.topology,
    new AggregateOperation(self.parent, pipeline, options),
    cursorOptions
  );

  relayEvents(changeStreamCursor, self, ['resumeTokenChanged', 'end', 'close']);

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

  /**
   * Change stream end event
   *
   * @event ChangeStream#end
   * @type {null}
   */

  /**
   * Emitted each time the change stream stores a new resume token.
   *
   * @event ChangeStream#resumeTokenChanged
   * @type {ResumeToken}
   */

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
}

function applyKnownOptions(target, source, optionNames) {
  optionNames.forEach(name => {
    if (source[name]) {
      target[name] = source[name];
    }
  });

  return target;
}

// This method performs a basic server selection loop, satisfying the requirements of
// ChangeStream resumability until the new SDAM layer can be used.
const SELECTION_TIMEOUT = 30000;
function waitForTopologyConnected(topology, options, callback) {
  setTimeout(() => {
    if (options && options.start == null) options.start = process.hrtime();
    const start = options.start || process.hrtime();
    const timeout = options.timeout || SELECTION_TIMEOUT;
    const readPreference = options.readPreference;

    if (topology.isConnected({ readPreference })) return callback();
    const hrElapsed = process.hrtime(start);
    const elapsed = (hrElapsed[0] * 1e9 + hrElapsed[1]) / 1e6;
    if (elapsed > timeout) return callback(new MongoError('Timed out waiting for connection'));
    waitForTopologyConnected(topology, options, callback);
  }, 500); // this is an arbitrary wait time to allow SDAM to transition
}

// Handle new change events. This method brings together the routes from the callback, event emitter, and promise ways of using ChangeStream.
function processNewChange(args) {
  const changeStream = args.changeStream;
  const error = args.error;
  const change = args.change;
  const callback = args.callback;
  const eventEmitter = args.eventEmitter || false;
  const cursor = changeStream.cursor;
  const Promise = PromiseProvider.get();

  // If the cursor is null or the change stream has been closed explictly, do not process a change.
  if (cursor == null || changeStream.closed) {
    // We do not error in the eventEmitter case.
    changeStream.closed = true;
    if (eventEmitter) {
      return;
    }
    callback(new MongoError('ChangeStream is closed'));
    return;
  }

  const topology = changeStream.topology;
  const options = changeStream.cursor.options;
  const wireVersion = maxWireVersion(cursor.server);

  if (error) {
    if (isResumableError(error, wireVersion) && !changeStream.attemptingResume) {
      changeStream.attemptingResume = true;

      // stop listening to all events from old cursor
      ['data', 'close', 'end', 'error'].forEach(event =>
        changeStream.cursor.removeAllListeners(event)
      );

      // close internal cursor, ignore errors
      changeStream.cursor.close();

      waitForTopologyConnected(topology, { readPreference: options.readPreference }, err => {
        if (err) {
          // if there's an error reconnecting, close the change stream
          changeStream.closed = true;
          if (eventEmitter) {
            changeStream.emit('error', err);
            changeStream.emit('close');
            return;
          }
          return callback(err);
        }

        changeStream.cursor = createChangeStreamCursor(changeStream, cursor.resumeOptions);
        if (eventEmitter) return;
        changeStream.next(callback);
      });
      return;
    }

    if (eventEmitter) return changeStream.emit('error', error);
    return callback(error);
  }

  changeStream.attemptingResume = false;

  if (change && !change._id) {
    const noResumeTokenError = new Error(
      'A change stream document has been received that lacks a resume token (_id).'
    );

    if (eventEmitter) return changeStream.emit('error', noResumeTokenError);
    return callback(noResumeTokenError);
  }

  // cache the resume token
  cursor.cacheResumeToken(change._id);

  // wipe the startAtOperationTime if there was one so that there won't be a conflict
  // between resumeToken and startAtOperationTime if we need to reconnect the cursor
  changeStream.options.startAtOperationTime = undefined;

  // Return the change
  if (eventEmitter) return changeStream.emit('change', change);
  return callback(error, change);
}

/**
 * The callback format for results
 *
 * @callback ChangeStream~resultCallback
 * @param {MongoError} error An error instance representing the error during the execution.
 * @param {(object|null)} result The result object if the command was executed successfully.
 */

module.exports = ChangeStream;
