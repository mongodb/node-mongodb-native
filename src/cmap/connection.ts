import { EventEmitter } from 'events';
import MessageStream = require('./message_stream');
import { CommandResult } from './commands';
import { StreamDescription } from './stream_description';
import wp = require('./wire_protocol');
import { CommandStartedEvent, CommandFailedEvent, CommandSucceededEvent } from './events';
import { updateSessionFromResponse } from '../sessions';
import { uuidV4 } from '../utils';
import {
  MongoError,
  MongoNetworkError,
  MongoNetworkTimeoutError,
  MongoWriteConcernError
} from '../error';
import { now, calculateDurationInMs } from '../utils';

const kStream = Symbol('stream');
const kQueue = Symbol('queue');
const kMessageStream = Symbol('messageStream');
const kGeneration = Symbol('generation');
const kLastUseTime = Symbol('lastUseTime');
const kClusterTime = Symbol('clusterTime');
const kDescription = Symbol('description');
const kIsMaster = Symbol('ismaster');
const kAutoEncrypter = Symbol('autoEncrypter');

class Connection extends EventEmitter {
  id: any;
  address: any;
  socketTimeout: any;
  monitorCommands: any;
  closed: any;
  destroyed: any;
  [kDescription]: any;
  [kGeneration]: any;
  [kLastUseTime]: any;
  [kAutoEncrypter]: any;
  [kQueue]: any;
  [kMessageStream]: any;
  [kStream]: any;
  [kIsMaster]: any;
  [kClusterTime]: any;

  constructor(stream: any, options: any) {
    super(options);
    this.id = options.id;
    this.address = streamIdentifier(stream);
    this.socketTimeout = typeof options.socketTimeout === 'number' ? options.socketTimeout : 360000;
    this.monitorCommands =
      typeof options.monitorCommands === 'boolean' ? options.monitorCommands : false;
    this.closed = false;
    this.destroyed = false;

    this[kDescription] = new StreamDescription(this.address, options);
    this[kGeneration] = options.generation;
    this[kLastUseTime] = now();

    // retain a reference to an `AutoEncrypter` if present
    if (options.autoEncrypter) {
      this[kAutoEncrypter] = options.autoEncrypter;
    }

    // setup parser stream and message handling
    this[kQueue] = new Map();
    this[kMessageStream] = new MessageStream(options);
    this[kMessageStream].on('message', messageHandler(this));
    this[kStream] = stream;
    stream.on('error', () => {
      /* ignore errors, listen to `close` instead */
    });

    stream.on('close', () => {
      if (this.closed) {
        return;
      }

      this.closed = true;
      this[kQueue].forEach((op: any) =>
        op.cb(new MongoNetworkError(`connection ${this.id} to ${this.address} closed`))
      );
      this[kQueue].clear();

      this.emit('close');
    });

    stream.on('timeout', () => {
      if (this.closed) {
        return;
      }

      stream.destroy();
      this.closed = true;
      this[kQueue].forEach((op: any) =>
        op.cb(
          new MongoNetworkTimeoutError(`connection ${this.id} to ${this.address} timed out`, {
            beforeHandshake: this[kIsMaster] == null
          })
        )
      );

      this[kQueue].clear();
      this.emit('close');
    });

    // hook the message stream up to the passed in stream
    stream.pipe(this[kMessageStream]);
    this[kMessageStream].pipe(stream);
  }

  get description() {
    return this[kDescription];
  }

  get ismaster() {
    return this[kIsMaster];
  }

  // the `connect` method stores the result of the handshake ismaster on the connection
  set ismaster(response: any) {
    this[kDescription].receiveResponse(response);

    // TODO: remove this, and only use the `StreamDescription` in the future
    this[kIsMaster] = response;
  }

  get generation() {
    return this[kGeneration] || 0;
  }

  get idleTime() {
    return calculateDurationInMs(this[kLastUseTime]);
  }

  get clusterTime() {
    return this[kClusterTime];
  }

  get stream() {
    return this[kStream];
  }

  markAvailable() {
    this[kLastUseTime] = now();
  }

  destroy(options: any, callback: Function) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }

    options = Object.assign({ force: false }, options);
    if (this[kStream] == null || this.destroyed) {
      this.destroyed = true;
      if (typeof callback === 'function') {
        callback();
      }

      return;
    }

    if (options.force) {
      this[kStream].destroy();
      this.destroyed = true;
      if (typeof callback === 'function') {
        callback();
      }

      return;
    }

    this[kStream].end((err: any) => {
      this.destroyed = true;
      if (typeof callback === 'function') {
        callback(err);
      }
    });
  }

  // Wire protocol methods
  command(ns: any, cmd: any, options: any, callback: Function) {
    wp.command(makeServerTrampoline(this), ns, cmd, options, callback);
  }

  query(ns: any, cmd: any, cursorState: any, options: any, callback: Function) {
    wp.query(makeServerTrampoline(this), ns, cmd, cursorState, options, callback);
  }

  getMore(ns: any, cursorState: any, batchSize: any, options: any, callback: Function) {
    wp.getMore(makeServerTrampoline(this), ns, cursorState, batchSize, options, callback);
  }

  killCursors(ns: any, cursorState: any, callback: Function) {
    wp.killCursors(makeServerTrampoline(this), ns, cursorState, callback);
  }

  insert(ns: any, ops: any, options: any, callback: Function) {
    wp.insert(makeServerTrampoline(this), ns, ops, options, callback);
  }

  update(ns: any, ops: any, options: any, callback: Function) {
    wp.update(makeServerTrampoline(this), ns, ops, options, callback);
  }

  remove(ns: any, ops: any, options: any, callback: Function) {
    wp.remove(makeServerTrampoline(this), ns, ops, options, callback);
  }
}

/// This lets us emulate a legacy `Server` instance so we can work with the existing wire
/// protocol methods. Eventually, the operation executor will return a `Connection` to execute
/// against.
function makeServerTrampoline(connection: any) {
  const server = {
    description: connection.description,
    clusterTime: connection[kClusterTime],
    s: {
      pool: { write: write.bind(connection), isConnected: () => true }
    }
  } as any;

  if (connection[kAutoEncrypter]) {
    server.autoEncrypter = connection[kAutoEncrypter];
  }

  return server;
}

function messageHandler(conn: any) {
  return function messageHandler(message: any) {
    // always emit the message, in case we are streaming
    conn.emit('message', message);
    if (!conn[kQueue].has(message.responseTo)) {
      return;
    }

    const operationDescription = conn[kQueue].get(message.responseTo);
    const callback = operationDescription.cb;

    // SERVER-45775: For exhaust responses we should be able to use the same requestId to
    // track response, however the server currently synthetically produces remote requests
    // making the `responseTo` change on each response
    conn[kQueue].delete(message.responseTo);
    if (message.moreToCome) {
      // requeue the callback for next synthetic request
      conn[kQueue].set(message.requestId, operationDescription);
    } else if (operationDescription.socketTimeoutOverride) {
      conn[kStream].setTimeout(conn.socketTimeout);
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
        conn[kClusterTime] = document.$clusterTime;
        conn.emit('clusterTimeReceived', document.$clusterTime);
      }

      if (operationDescription.command) {
        if (document.writeConcernError) {
          callback(new MongoWriteConcernError(document.writeConcernError, document));
          return;
        }

        if (document.ok === 0 || document.$err || document.errmsg || document.code) {
          callback(new MongoError(document));
          return;
        }
      }
    }

    // NODE-2382: reenable in our glorious non-leaky abstraction future
    // callback(null, operationDescription.fullResult ? message : message.documents[0]);

    callback(
      undefined,
      new CommandResult(
        operationDescription.fullResult ? message : message.documents[0],
        conn,
        message
      )
    );
  };
}

function streamIdentifier(stream: any) {
  if (typeof stream.address === 'function') {
    return `${stream.remoteAddress}:${stream.remotePort}`;
  }

  return uuidV4().toString('hex');
}

// Not meant to be called directly, the wire protocol methods call this assuming it is a `Pool` instance
function write(this: any, command: any, options: any, callback: Function) {
  const connection = this;
  if (typeof options === 'function') {
    callback = options;
  }

  options = options || {};
  const operationDescription = {
    requestId: command.requestId,
    cb: callback,
    session: options.session,
    fullResult: typeof options.fullResult === 'boolean' ? options.fullResult : false,
    noResponse: typeof options.noResponse === 'boolean' ? options.noResponse : false,
    documentsReturnedIn: options.documentsReturnedIn,
    command: !!options.command,

    // for BSON parsing
    promoteLongs: typeof options.promoteLongs === 'boolean' ? options.promoteLongs : true,
    promoteValues: typeof options.promoteValues === 'boolean' ? options.promoteValues : true,
    promoteBuffers: typeof options.promoteBuffers === 'boolean' ? options.promoteBuffers : false,
    raw: typeof options.raw === 'boolean' ? options.raw : false
  } as any;

  if (connection[kDescription] && connection[kDescription].compressor) {
    operationDescription.agreedCompressor = connection[kDescription].compressor;

    if (connection[kDescription].zlibCompressionLevel) {
      operationDescription.zlibCompressionLevel = connection[kDescription].zlibCompressionLevel;
    }
  }

  if (typeof options.socketTimeout === 'number') {
    operationDescription.socketTimeoutOverride = true;
    connection[kStream].setTimeout(options.socketTimeout);
  }

  // if command monitoring is enabled we need to modify the callback here
  if (connection.monitorCommands) {
    connection.emit('commandStarted', new CommandStartedEvent(connection, command));

    operationDescription.started = now();
    operationDescription.cb = (err?: any, reply?: any) => {
      if (err) {
        connection.emit(
          'commandFailed',
          new CommandFailedEvent(connection, command, err, operationDescription.started)
        );
      } else {
        if (reply && reply.result && (reply.result.ok === 0 || reply.result.$err)) {
          connection.emit(
            'commandFailed',
            new CommandFailedEvent(connection, command, reply.result, operationDescription.started)
          );
        } else {
          connection.emit(
            'commandSucceeded',
            new CommandSucceededEvent(connection, command, reply, operationDescription.started)
          );
        }
      }

      if (typeof callback === 'function') {
        callback(err, reply);
      }
    };
  }

  if (!operationDescription.noResponse) {
    connection[kQueue].set(operationDescription.requestId, operationDescription);
  }

  try {
    connection[kMessageStream].writeCommand(command, operationDescription);
  } catch (e) {
    if (!operationDescription.noResponse) {
      connection[kQueue].delete(operationDescription.requestId);
      operationDescription.cb(e);
      return;
    }
  }

  if (operationDescription.noResponse) {
    operationDescription.cb();
  }
}

export { Connection };
