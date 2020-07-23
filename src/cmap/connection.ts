import { EventEmitter } from 'events';
import { MessageStream } from './message_stream';
import { CommandResult, BinMsg, CommandTypes } from './commands';
import { StreamDescription, StreamDescriptionOptions } from './stream_description';
import * as wp from './wire_protocol';
import { CommandStartedEvent, CommandFailedEvent, CommandSucceededEvent } from './events';
import { updateSessionFromResponse } from '../sessions';
import { uuidV4, ClientMetadata } from '../utils';
import {
  MongoError,
  MongoNetworkError,
  MongoNetworkTimeoutError,
  MongoWriteConcernError
} from '../error';
import { now, calculateDurationInMs } from '../utils';
import type {
  OperationDescription,
  MongoDBInitialResponse,
  ClusterTimeResponse,
  CommandOptions
} from './types';

import type { Callback, Document } from '../types';
import type { TLSSocketOptions } from 'tls';
import type { TcpNetConnectOpts, Socket } from 'net';
import type { Server } from '../sdam/server';
import type { CursorState } from '../cursor/types';

const kStream = Symbol('stream');
const kQueue = Symbol('queue');
const kMessageStream = Symbol('messageStream');
const kGeneration = Symbol('generation');
const kLastUseTime = Symbol('lastUseTime');
const kClusterTime = Symbol('clusterTime');
const kDescription = Symbol('description');
const kIsMaster = Symbol('ismaster');
const kAutoEncrypter = Symbol('autoEncrypter');

export interface ConnectionOptions
  extends Partial<TcpNetConnectOpts>,
    Partial<TLSSocketOptions>,
    StreamDescriptionOptions {
  [x: string]: any;

  metadata: ClientMetadata;

  /** Required EventEmitter option */
  captureRejections?: boolean;
}

export class Connection extends EventEmitter {
  id: string | number;
  address: string;
  socketTimeout: number;
  monitorCommands: boolean;
  closed: boolean;
  destroyed: boolean;
  lastIsMasterMS?: number;
  [kDescription]: StreamDescription;
  [kGeneration]: number;
  [kLastUseTime]: number;
  [kAutoEncrypter]?: unknown;
  [kQueue]: Map<number | string, OperationDescription>;
  [kMessageStream]: MessageStream;
  [kStream]: Socket;
  [kIsMaster]: MongoDBInitialResponse;
  [kClusterTime]: ClusterTimeResponse;

  constructor(stream: Socket, options: ConnectionOptions) {
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
      this[kQueue].forEach(op =>
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
      this[kQueue].forEach(op =>
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
  set ismaster(response: MongoDBInitialResponse) {
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

  destroy(options?: { force?: boolean }, callback?: Callback) {
    if (typeof options === 'function') {
      callback = options;
      options = { force: false };
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

    this[kStream].end(() => {
      this.destroyed = true;
      if (typeof callback === 'function') {
        callback();
      }
    });
  }

  // Wire protocol methods
  command(ns: string, cmd: Document, options: CommandOptions, callback: Callback) {
    wp.command(makeServerTrampoline(this), ns, cmd, options, callback);
  }

  query(
    ns: string,
    cmd: Document,
    cursorState: CursorState,
    options: CommandOptions,
    callback: Callback
  ) {
    wp.query(makeServerTrampoline(this), ns, cmd, cursorState, options, callback);
  }

  getMore(
    ns: string,
    cursorState: Record<string, unknown>,
    batchSize: number,
    options: CommandOptions,
    callback: Callback
  ) {
    wp.getMore(makeServerTrampoline(this), ns, cursorState, batchSize, options, callback);
  }

  killCursors(ns: string, cursorState: Record<string, unknown>, callback: Callback) {
    wp.killCursors(makeServerTrampoline(this), ns, cursorState, callback);
  }

  insert(ns: string, ops: Document[], options: CommandOptions, callback: Callback) {
    wp.insert(makeServerTrampoline(this), ns, ops, options, callback);
  }

  update(ns: string, ops: Document[], options: CommandOptions, callback: Callback) {
    wp.update(makeServerTrampoline(this), ns, ops, options, callback);
  }

  remove(ns: string, ops: Document[], options: CommandOptions, callback: Callback) {
    wp.remove(makeServerTrampoline(this), ns, ops, options, callback);
  }
}

/// This lets us emulate a legacy `Server` instance so we can work with the existing wire
/// protocol methods. Eventually, the operation executor will return a `Connection` to execute
/// against.
function makeServerTrampoline(connection: Connection): Server {
  return ({
    description: connection.description,
    clusterTime: connection[kClusterTime],
    s: {
      pool: { write: write.bind(connection), isConnected: () => true }
    },
    autoEncrypter: connection[kAutoEncrypter]
  } as unknown) as Server;
}

function messageHandler(conn: Connection) {
  return function messageHandler(message: BinMsg) {
    // always emit the message, in case we are streaming
    conn.emit('message', message);
    if (!conn[kQueue].has(message.responseTo)) {
      return;
    }

    const operationDescription: OperationDescription = conn[kQueue].get(message.responseTo)!;
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
        conn[kClusterTime] = document.$clusterTime as ClusterTimeResponse;
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

    // NODE-2382: re-enable in our glorious non-leaky abstraction future
    // callback(null, operationDescription.fullResult ? message : message.documents[0]);

    callback(
      undefined,
      new CommandResult(
        operationDescription.fullResult ? ((message as unknown) as Document) : message.documents[0],
        conn,
        message
      )
    );
  };
}

function streamIdentifier(stream: Socket) {
  if (typeof stream.address === 'function') {
    return `${stream.remoteAddress}:${stream.remotePort}`;
  }

  return uuidV4().toString('hex');
}

// Not meant to be called directly, the wire protocol methods call this assuming it is a `Pool` instance
function write(
  this: Connection,
  command: CommandTypes,
  options: CommandOptions,
  callback: Callback
) {
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
  } as OperationDescription;

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
    operationDescription.cb = (err, reply) => {
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
            new CommandSucceededEvent(connection, command, reply!, operationDescription.started)
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
