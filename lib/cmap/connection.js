'use strict';

const EventEmitter = require('events');
const MessageStream = require('./message_stream');
const MongoError = require('../core/error').MongoError;
const MongoWriteConcernError = require('../core/error').MongoWriteConcernError;
const wp = require('../core/wireprotocol');
const apm = require('../core/connection/apm');
const updateSessionFromResponse = require('../core/sessions').updateSessionFromResponse;
const uuidV4 = require('../core/utils').uuidV4;

const kStream = Symbol('stream');
const kQueue = Symbol('queue');
const kMessageStream = Symbol('messageStream');

class Connection extends EventEmitter {
  constructor(stream, options) {
    super(options);

    this.id = streamIdentifier(stream);
    this.bson = options.bson;
    this.description = null;
    this.socketTimeout = typeof options.socketTimeout === 'number' ? options.socketTimeout : 360000;
    this.monitorCommands =
      typeof options.monitorCommands === 'boolean' ? options.monitorCommands : false;

    // setup parser stream and message handling
    this[kQueue] = new Map();
    this[kMessageStream] = new MessageStream(options);
    this[kMessageStream].on('message', messageHandler(this));
    this[kStream] = stream;
    stream.on('error', () => {
      /* ignore errors, listen to `close` instead */
    });

    stream.on('close', () => {
      this[kQueue].forEach(op => op.callback(new MongoError('Connection closed')));
      this[kQueue].clear();

      this.emit('close');
    });

    // hook the message stream up to the passed in stream
    stream.pipe(this[kMessageStream]);
    this[kMessageStream].pipe(stream);
  }

  // the `connect` method stores the result of the handshake ismaster on the connection
  set ismaster(response) {
    this.description = response;
  }

  destroy(options, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }

    options = Object.assign({ force: false }, options);
    if (this[kStream] == null || this.destroyed) {
      this.destroyed = true;
      return;
    }

    if (options.force) {
      this[kStream].destroy();
      this.destroyed = true;
      if (typeof callback === 'function') {
        callback(null, null);
      }

      return;
    }

    this[kStream].end(err => {
      this.destroyed = true;
      if (typeof callback === 'function') {
        callback(err, null);
      }
    });
  }

  command(ns, cmd, options, callback) {
    // NOTE: The wire protocol methods will eventually be migrated to this class, but for now
    //       we need to pretend we _are_ a server.
    const server = {
      description: this.description,
      s: {
        bson: this.bson,
        pool: { write: write.bind(this) }
      }
    };

    wp.command(server, ns, cmd, options, callback);
  }
}

function messageHandler(conn) {
  return function(message) {
    // always emit the message, in case we are streaming
    conn.emit('message', message);
    if (!conn[kQueue].has(message.responseTo)) {
      return;
    }

    const operationDescription = conn[kQueue].get(message.responseTo);
    conn[kQueue].delete(message.responseTo);

    const callback = operationDescription.cb;
    if (operationDescription.socketTimeoutOverride) {
      this[kStream].setSocketTimeout(this.socketTimeout);
    }

    try {
      // Pass in the entire description because it has BSON parsing options
      message.parse(operationDescription);
    } catch (err) {
      callback(new MongoError(err));
      return;
    }

    if (message.documents[0]) {
      const document = message.documents[0];
      const session = operationDescription.session;
      if (session) {
        updateSessionFromResponse(session, document);
      }

      if (document.$clusterTime) {
        this.emit('clusterTimeReceived', document.$clusterTime);
      }

      if (document.writeConcernError) {
        callback(new MongoWriteConcernError(document.writeConcernError, document));
        return;
      }

      if (document.ok === 0 || document.$err || document.errmsg || document.code) {
        callback(new MongoError(document));
        return;
      }
    }

    callback(null, operationDescription.fullResult ? message : message.documents[0]);
  };
}

function streamIdentifier(stream) {
  if (typeof stream.address === 'function') {
    return `${stream.address().address}:${stream.address().port}`;
  }

  return uuidV4().toString('hex');
}

// Not meant to be called directly, the wire protocol methods call this assuming it is a `Pool` instance
function write(command, options, callback) {
  if (typeof options === 'function') {
    callback = options;
  }

  options = options || {};
  const operationDescription = {
    requestId: command.requestId,
    cb: callback,
    fullResult: typeof options.fullResult === 'boolean' ? options.fullResult : false,
    session: options.session,

    // For BSON parsing
    promoteLongs: typeof options.promoteLongs === 'boolean' ? options.promoteLongs : true,
    promoteValues: typeof options.promoteValues === 'boolean' ? options.promoteValues : true,
    promoteBuffers: typeof options.promoteBuffers === 'boolean' ? options.promoteBuffers : false,
    raw: typeof options.raw === 'boolean' ? options.raw : false,

    // NOTE: This property is set on the connection as part of `connect`, but should
    //       eventually live in the `StreamDescription` attached to this connection.
    agreedCompressor: this.agreedCompressor
  };

  if (typeof options.socketTimeout === 'number') {
    operationDescription.socketTimeoutOverride = true;
    this[kStream].setSocketTimeout(options.socketTimeout);
  }

  // if command monitoring is enabled we need to modify the callback here
  if (this.monitorCommands) {
    this.emit('commandStarted', new apm.CommandStartedEvent(this, command));

    operationDescription.started = process.hrtime();
    operationDescription.cb = (err, reply) => {
      if (err) {
        this.emit(
          'commandFailed',
          new apm.CommandFailedEvent(this, command, err, operationDescription.started)
        );
      } else {
        if (reply && reply.result && (reply.result.ok === 0 || reply.result.$err)) {
          this.emit(
            'commandFailed',
            new apm.CommandFailedEvent(this, command, reply.result, operationDescription.started)
          );
        } else {
          this.emit(
            'commandSucceeded',
            new apm.CommandSucceededEvent(this, command, reply, operationDescription.started)
          );
        }
      }

      if (typeof callback === 'function') {
        callback(err, reply);
      }
    };
  }

  this[kQueue].set(operationDescription.requestId, operationDescription);
  this[kMessageStream].writeCommand(command, operationDescription);
}

class CMAPConnection {
  constructor(options) {
    options = options || {};
    this.generation = options.generation;
    this.id = options.id;
    this.maxIdleTimeMS = options.maxIdleTimeMS;
    this.poolId = options.poolId;
    this.address = options.address;
    this.readyToUse = false;
    this.lastMadeAvailable = undefined;
    this.callbacks = [];
  }

  get metadata() {
    return {
      id: this.id,
      generation: this.generation,
      poolId: this.poolId,
      address: this.adress
    };
  }

  timeIdle() {
    return this.readyToUse ? Date.now() - this.lastMadeAvailable : 0;
  }

  write(callback) {
    setTimeout(() => callback());
  }

  makeReadyToUse() {
    this.readyToUse = true;
    this.lastMadeAvailable = Date.now();
  }

  makeInUse() {
    this.readyToUse = false;
    this.lastMadeAvailable = undefined;
  }

  waitUntilConnect(callback) {
    if (this.readyToUse) {
      return callback(null, this);
    }

    this.callbacks.push(callback);
  }

  connect(callback) {
    this.callbacks.push(callback);
    setTimeout(() => {
      this.makeReadyToUse();
      this.callbacks.forEach(c => c(null, this));
      this.callbacks = [];
    });
  }

  destroy() {}
}

module.exports = {
  Connection,
  CMAPConnection
};
