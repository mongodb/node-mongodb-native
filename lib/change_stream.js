'use strict';

const Denque = require('denque');
const EventEmitter = require('events');
const isResumableError = require('./error').isResumableError;
const MongoError = require('./core').MongoError;
const Cursor = require('./cursor');
const relayEvents = require('./core/utils').relayEvents;
const maxWireVersion = require('./core/utils').maxWireVersion;
const maybePromise = require('./utils').maybePromise;
const now = require('./utils').now;
const calculateDurationInMs = require('./utils').calculateDurationInMs;
const AggregateOperation = require('./operations/aggregate');

const kResumeQueue = Symbol('resumeQueue');

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
 * @return {ChangeStream} a ChangeStream instance.
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

    this.promiseLibrary = parent.s.promiseLibrary;
    if (!this.options.readPreference && parent.s.readPreference) {
      this.options.readPreference = parent.s.readPreference;
    }

    this[kResumeQueue] = new Denque();

    // Create contained Change Stream cursor
    this.cursor = createChangeStreamCursor(this, options);

    this.closed = false;

    // Listen for any `change` listeners being added to ChangeStream
    this.on('newListener', eventName => {
      if (eventName === 'change' && this.cursor && this.listenerCount('change') === 0) {
        this.cursor.on('data', change => processNewChange(this, change));
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
   * @function ChangeStream.prototype.hasNext
   * @param {ChangeStream~resultCallback} [callback] The result callback.
   * @throws {MongoError}
   * @returns {Promise|void} returns Promise if no callback passed
   */
  hasNext(callback) {
    return maybePromise(this.parent, callback, cb => {
      getCursor(this, (err, cursor) => {
        if (err) return cb(err); // failed to resume, raise an error
        cursor.hasNext(cb);
      });
    });
  }

  /**
   * Get the next available document from the Change Stream, returns null if no more documents are available.
   * @function ChangeStream.prototype.next
   * @param {ChangeStream~resultCallback} [callback] The result callback.
   * @throws {MongoError}
   * @returns {Promise|void} returns Promise if no callback passed
   */
  next(callback) {
    return maybePromise(this.parent, callback, cb => {
      getCursor(this, (err, cursor) => {
        if (err) return cb(err); // failed to resume, raise an error
        cursor.next((error, change) => {
          if (error) {
            this[kResumeQueue].push(() => this.next(cb));
            processError(this, error, cb);
            return;
          }
          processNewChange(this, change, cb);
        });
      });
    });
  }

  /**
   * Is the change stream closed
   * @method ChangeStream.prototype.isClosed
   * @return {boolean}
   */
  isClosed() {
    return this.closed || (this.cursor && this.cursor.isClosed());
  }

  /**
   * Close the Change Stream
   * @method ChangeStream.prototype.close
   * @param {ChangeStream~resultCallback} [callback] The result callback.
   * @return {Promise} returns Promise if no callback passed
   */
  close(callback) {
    return maybePromise(this.parent, callback, cb => {
      if (this.closed) return cb();

      // flag the change stream as explicitly closed
      this.closed = true;

      if (!this.cursor) return cb();

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
      if (err || result == null) {
        callback(err, result);
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
 * @ignore
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
      processNewChange(self, change);
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
    processError(self, error);
  });

  if (self.pipeDestinations) {
    const cursorStream = changeStreamCursor.stream(self.streamOptions);
    for (let pipeDestination of self.pipeDestinations) {
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
    if (options && options.start == null) {
      options.start = now();
    }

    const start = options.start || now();
    const timeout = options.timeout || SELECTION_TIMEOUT;
    const readPreference = options.readPreference;
    if (topology.isConnected({ readPreference })) {
      return callback();
    }

    if (calculateDurationInMs(start) > timeout) {
      return callback(new MongoError('Timed out waiting for connection'));
    }

    waitForTopologyConnected(topology, options, callback);
  }, 500); // this is an arbitrary wait time to allow SDAM to transition
}

function processNewChange(changeStream, change, callback) {
  const cursor = changeStream.cursor;

  // a null change means the cursor has been notified, implicitly closing the change stream
  if (change == null) {
    changeStream.closed = true;
  }

  if (changeStream.closed) {
    if (callback) callback(new MongoError('ChangeStream is closed'));
    return;
  }

  if (change && !change._id) {
    const noResumeTokenError = new Error(
      'A change stream document has been received that lacks a resume token (_id).'
    );

    if (!callback) return changeStream.emit('error', noResumeTokenError);
    return callback(noResumeTokenError);
  }

  // cache the resume token
  cursor.cacheResumeToken(change._id);

  // wipe the startAtOperationTime if there was one so that there won't be a conflict
  // between resumeToken and startAtOperationTime if we need to reconnect the cursor
  changeStream.options.startAtOperationTime = undefined;

  // Return the change
  if (!callback) return changeStream.emit('change', change);
  return callback(undefined, change);
}

function processError(changeStream, error, callback) {
  const topology = changeStream.topology;
  const cursor = changeStream.cursor;

  // If the change stream has been closed explictly, do not process error.
  if (changeStream.closed) {
    if (callback) callback(new MongoError('ChangeStream is closed'));
    return;
  }

  // if the resume succeeds, continue with the new cursor
  function resumeWithCursor(newCursor) {
    changeStream.cursor = newCursor;
    processResumeQueue(changeStream);
  }

  // otherwise, raise an error and close the change stream
  function unresumableError(err) {
    if (!callback) {
      changeStream.emit('error', err);
      changeStream.emit('close');
    }
    processResumeQueue(changeStream, err);
    changeStream.closed = true;
  }

  if (cursor && isResumableError(error, maxWireVersion(cursor.server))) {
    changeStream.cursor = undefined;

    // stop listening to all events from old cursor
    ['data', 'close', 'end', 'error'].forEach(event => cursor.removeAllListeners(event));

    // close internal cursor, ignore errors
    cursor.close();

    waitForTopologyConnected(topology, { readPreference: cursor.options.readPreference }, err => {
      // if the topology can't reconnect, close the stream
      if (err) return unresumableError(err);

      // create a new cursor, preserving the old cursor's options
      const newCursor = createChangeStreamCursor(changeStream, cursor.resumeOptions);

      // attempt to continue in emitter mode
      if (!callback) return resumeWithCursor(newCursor);

      // attempt to continue in iterator mode
      newCursor.hasNext(err => {
        // if there's an error immediately after resuming, close the stream
        if (err) return unresumableError(err);
        resumeWithCursor(newCursor);
      });
    });
    return;
  }

  if (!callback) return changeStream.emit('error', error);
  return callback(error);
}

/**
 * Safely provides a cursor across resume attempts
 *
 * @param {ChangeStream} changeStream the parent ChangeStream
 * @param {function} callback gets the cursor or error
 * @param {ChangeStreamCursor} [oldCursor] when resuming from an error, carry over options from previous cursor
 */
function getCursor(changeStream, callback) {
  if (changeStream.isClosed()) {
    callback(new MongoError('ChangeStream is closed.'));
    return;
  }

  // if a cursor exists and it is open, return it
  if (changeStream.cursor) {
    callback(undefined, changeStream.cursor);
    return;
  }

  // no cursor, queue callback until topology reconnects
  changeStream[kResumeQueue].push(callback);
}

/**
 * Drain the resume queue when a new has become available
 *
 * @param {ChangeStream} changeStream the parent ChangeStream
 * @param {ChangeStreamCursor?} changeStream.cursor the new cursor
 * @param {Error} [err] error getting a new cursor
 */
function processResumeQueue(changeStream, err) {
  while (changeStream[kResumeQueue].length) {
    const request = changeStream[kResumeQueue].pop();
    if (changeStream.isClosed() && !err) {
      request(new MongoError('Change Stream is not open.'));
      return;
    }
    request(err, changeStream.cursor);
  }
}

/**
 * The callback format for results
 * @callback ChangeStream~resultCallback
 * @param {MongoError} error An error instance representing the error during the execution.
 * @param {(object|null)} result The result object if the command was executed successfully.
 */

module.exports = ChangeStream;
