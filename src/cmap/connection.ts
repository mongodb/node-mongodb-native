import { clearTimeout, setTimeout } from 'timers';

import type { BSONSerializeOptions, Document, ObjectId } from '../bson';
import {
  CLOSE,
  CLUSTER_TIME_RECEIVED,
  COMMAND_FAILED,
  COMMAND_STARTED,
  COMMAND_SUCCEEDED,
  MESSAGE,
  PINNED,
  UNPINNED
} from '../constants';
import type { AutoEncrypter } from '../deps';
import {
  MongoCompatibilityError,
  MongoMissingDependencyError,
  MongoNetworkError,
  MongoNetworkTimeoutError,
  MongoRuntimeError,
  MongoServerError,
  MongoWriteConcernError
} from '../error';
import type { ServerApi, SupportedNodeConnectionOptions } from '../mongo_client';
import { CancellationToken, TypedEventEmitter } from '../mongo_types';
import type { ReadPreferenceLike } from '../read_preference';
import { applySession, ClientSession, updateSessionFromResponse } from '../sessions';
import {
  calculateDurationInMs,
  Callback,
  ClientMetadata,
  HostAddress,
  maxWireVersion,
  MongoDBNamespace,
  now,
  uuidV4
} from '../utils';
import type { WriteConcern } from '../write_concern';
import type { MongoCredentials } from './auth/mongo_credentials';
import {
  CommandFailedEvent,
  CommandStartedEvent,
  CommandSucceededEvent
} from './command_monitoring_events';
import { BinMsg, Msg, Query, Response, WriteProtocolMessageType } from './commands';
import type { Stream } from './connect';
import { MessageStream, OperationDescription } from './message_stream';
import { StreamDescription, StreamDescriptionOptions } from './stream_description';
import { getReadPreference, isSharded } from './wire_protocol/shared';

/** @internal */
const kStream = Symbol('stream');
/** @internal */
const kQueue = Symbol('queue');
/** @internal */
const kMessageStream = Symbol('messageStream');
/** @internal */
const kGeneration = Symbol('generation');
/** @internal */
const kLastUseTime = Symbol('lastUseTime');
/** @internal */
const kClusterTime = Symbol('clusterTime');
/** @internal */
const kDescription = Symbol('description');
/** @internal */
const kHello = Symbol('hello');
/** @internal */
const kAutoEncrypter = Symbol('autoEncrypter');
/** @internal */
const kDelayedTimeoutId = Symbol('delayedTimeoutId');

const INVALID_QUEUE_SIZE = 'Connection internal queue contains more than 1 operation description';

/** @internal */
export interface CommandOptions extends BSONSerializeOptions {
  command?: boolean;
  secondaryOk?: boolean;
  /** Specify read preference if command supports it */
  readPreference?: ReadPreferenceLike;
  monitoring?: boolean;
  socketTimeoutMS?: number;
  /** Session to use for the operation */
  session?: ClientSession;
  documentsReturnedIn?: string;
  noResponse?: boolean;
  omitReadPreference?: boolean;

  // TODO(NODE-2802): Currently the CommandOptions take a property willRetryWrite which is a hint
  // from executeOperation that the txnNum should be applied to this command.
  // Applying a session to a command should happen as part of command construction,
  // most likely in the CommandOperation#executeCommand method, where we have access to
  // the details we need to determine if a txnNum should also be applied.
  willRetryWrite?: boolean;

  writeConcern?: WriteConcern;
}

/** @internal */
export interface GetMoreOptions extends CommandOptions {
  batchSize?: number;
  maxTimeMS?: number;
  maxAwaitTimeMS?: number;
  /**
   * Comment to apply to the operation.
   *
   * In server versions pre-4.4, 'comment' must be string.  A server
   * error will be thrown if any other type is provided.
   *
   * In server versions 4.4 and above, 'comment' can be any valid BSON type.
   */
  comment?: unknown;
}

/** @public */
export interface ProxyOptions {
  proxyHost?: string;
  proxyPort?: number;
  proxyUsername?: string;
  proxyPassword?: string;
}

/** @public */
export interface ConnectionOptions
  extends SupportedNodeConnectionOptions,
    StreamDescriptionOptions,
    ProxyOptions {
  // Internal creation info
  id: number | '<monitor>';
  generation: number;
  hostAddress: HostAddress;
  // Settings
  autoEncrypter?: AutoEncrypter;
  serverApi?: ServerApi;
  monitorCommands: boolean;
  /** @internal */
  connectionType?: typeof Connection;
  credentials?: MongoCredentials;
  connectTimeoutMS?: number;
  tls: boolean;
  keepAlive?: boolean;
  keepAliveInitialDelay?: number;
  noDelay?: boolean;
  socketTimeoutMS?: number;
  cancellationToken?: CancellationToken;

  metadata: ClientMetadata;
}

/** @public */
export interface DestroyOptions {
  /** Force the destruction. */
  force: boolean;
}

/** @public */
export type ConnectionEvents = {
  commandStarted(event: CommandStartedEvent): void;
  commandSucceeded(event: CommandSucceededEvent): void;
  commandFailed(event: CommandFailedEvent): void;
  clusterTimeReceived(clusterTime: Document): void;
  close(): void;
  message(message: any): void;
  pinned(pinType: string): void;
  unpinned(pinType: string): void;
};

/** @internal */
export class Connection extends TypedEventEmitter<ConnectionEvents> {
  id: number | '<monitor>';
  address: string;
  socketTimeoutMS: number;
  monitorCommands: boolean;
  /** Indicates that the connection (including underlying TCP socket) has been closed. */
  closed: boolean;
  lastHelloMS?: number;
  serverApi?: ServerApi;
  helloOk?: boolean;

  /**@internal */
  [kDelayedTimeoutId]: NodeJS.Timeout | null;
  /** @internal */
  [kDescription]: StreamDescription;
  /** @internal */
  [kGeneration]: number;
  /** @internal */
  [kLastUseTime]: number;
  /** @internal */
  [kQueue]: Map<number, OperationDescription>;
  /** @internal */
  [kMessageStream]: MessageStream;
  /** @internal */
  [kStream]: Stream;
  /** @internal */
  [kHello]: Document | null;
  /** @internal */
  [kClusterTime]: Document | null;

  /** @event */
  static readonly COMMAND_STARTED = COMMAND_STARTED;
  /** @event */
  static readonly COMMAND_SUCCEEDED = COMMAND_SUCCEEDED;
  /** @event */
  static readonly COMMAND_FAILED = COMMAND_FAILED;
  /** @event */
  static readonly CLUSTER_TIME_RECEIVED = CLUSTER_TIME_RECEIVED;
  /** @event */
  static readonly CLOSE = CLOSE;
  /** @event */
  static readonly MESSAGE = MESSAGE;
  /** @event */
  static readonly PINNED = PINNED;
  /** @event */
  static readonly UNPINNED = UNPINNED;

  constructor(stream: Stream, options: ConnectionOptions) {
    super();
    this.id = options.id;
    this.address = streamIdentifier(stream, options);
    this.socketTimeoutMS = options.socketTimeoutMS ?? 0;
    this.monitorCommands = options.monitorCommands;
    this.serverApi = options.serverApi;
    this.closed = false;
    this[kHello] = null;
    this[kClusterTime] = null;

    this[kDescription] = new StreamDescription(this.address, options);
    this[kGeneration] = options.generation;
    this[kLastUseTime] = now();

    // setup parser stream and message handling
    this[kQueue] = new Map();
    this[kMessageStream] = new MessageStream({
      ...options,
      maxBsonMessageSize: this.hello?.maxBsonMessageSize
    });
    this[kStream] = stream;

    this[kDelayedTimeoutId] = null;

    this[kMessageStream].on('message', message => this.onMessage(message));
    this[kMessageStream].on('error', error => this.onError(error));
    this[kStream].on('close', () => this.onClose());
    this[kStream].on('timeout', () => this.onTimeout());
    this[kStream].on('error', () => {
      /* ignore errors, listen to `close` instead */
    });

    // hook the message stream up to the passed in stream
    this[kStream].pipe(this[kMessageStream]);
    this[kMessageStream].pipe(this[kStream]);
  }

  get description(): StreamDescription {
    return this[kDescription];
  }

  get hello(): Document | null {
    return this[kHello];
  }

  // the `connect` method stores the result of the handshake hello on the connection
  set hello(response: Document | null) {
    this[kDescription].receiveResponse(response);
    this[kDescription] = Object.freeze(this[kDescription]);

    // TODO: remove this, and only use the `StreamDescription` in the future
    this[kHello] = response;
  }

  // Set the whether the message stream is for a monitoring connection.
  set isMonitoringConnection(value: boolean) {
    this[kMessageStream].isMonitoringConnection = value;
  }

  get isMonitoringConnection(): boolean {
    return this[kMessageStream].isMonitoringConnection;
  }

  get serviceId(): ObjectId | undefined {
    return this.hello?.serviceId;
  }

  get loadBalanced(): boolean {
    return this.description.loadBalanced;
  }

  get generation(): number {
    return this[kGeneration] || 0;
  }

  set generation(generation: number) {
    this[kGeneration] = generation;
  }

  get idleTime(): number {
    return calculateDurationInMs(this[kLastUseTime]);
  }

  get clusterTime(): Document | null {
    return this[kClusterTime];
  }

  get stream(): Stream {
    return this[kStream];
  }

  markAvailable(): void {
    this[kLastUseTime] = now();
  }

  onError(error: Error) {
    if (this.closed) {
      return;
    }
    this.destroy({ force: false });

    for (const op of this[kQueue].values()) {
      op.cb(error);
    }

    this[kQueue].clear();
    this.emit(Connection.CLOSE);
  }

  onClose() {
    if (this.closed) {
      return;
    }
    this.destroy({ force: false });

    const message = `connection ${this.id} to ${this.address} closed`;
    for (const op of this[kQueue].values()) {
      op.cb(new MongoNetworkError(message));
    }

    this[kQueue].clear();
    this.emit(Connection.CLOSE);
  }

  onTimeout() {
    if (this.closed) {
      return;
    }

    this[kDelayedTimeoutId] = setTimeout(() => {
      this.destroy({ force: false });

      const message = `connection ${this.id} to ${this.address} timed out`;
      const beforeHandshake = this.hello == null;
      for (const op of this[kQueue].values()) {
        op.cb(new MongoNetworkTimeoutError(message, { beforeHandshake }));
      }

      this[kQueue].clear();
      this.emit(Connection.CLOSE);
    }, 1).unref(); // No need for this timer to hold the event loop open
  }

  onMessage(message: BinMsg | Response) {
    const delayedTimeoutId = this[kDelayedTimeoutId];
    if (delayedTimeoutId != null) {
      clearTimeout(delayedTimeoutId);
      this[kDelayedTimeoutId] = null;
    }

    // always emit the message, in case we are streaming
    this.emit('message', message);
    let operationDescription = this[kQueue].get(message.responseTo);

    if (!operationDescription && this.isMonitoringConnection) {
      // This is how we recover when the initial hello's requestId is not
      // the responseTo when hello responses have been skipped:

      // First check if the map is of invalid size
      if (this[kQueue].size > 1) {
        this.onError(new MongoRuntimeError(INVALID_QUEUE_SIZE));
      } else {
        // Get the first orphaned operation description.
        const entry = this[kQueue].entries().next();
        if (entry.value != null) {
          const [requestId, orphaned]: [number, OperationDescription] = entry.value;
          // If the orphaned operation description exists then set it.
          operationDescription = orphaned;
          // Remove the entry with the bad request id from the queue.
          this[kQueue].delete(requestId);
        }
      }
    }

    if (!operationDescription) {
      return;
    }

    const callback = operationDescription.cb;

    // SERVER-45775: For exhaust responses we should be able to use the same requestId to
    // track response, however the server currently synthetically produces remote requests
    // making the `responseTo` change on each response
    this[kQueue].delete(message.responseTo);
    if ('moreToCome' in message && message.moreToCome) {
      // If the operation description check above does find an orphaned
      // description and sets the operationDescription then this line will put one
      // back in the queue with the correct requestId and will resolve not being able
      // to find the next one via the responseTo of the next streaming hello.
      this[kQueue].set(message.requestId, operationDescription);
    } else if (operationDescription.socketTimeoutOverride) {
      this[kStream].setTimeout(this.socketTimeoutMS);
    }

    try {
      // Pass in the entire description because it has BSON parsing options
      message.parse(operationDescription);
    } catch (err) {
      // If this error is generated by our own code, it will already have the correct class applied
      // if it is not, then it is coming from a catastrophic data parse failure or the BSON library
      // in either case, it should not be wrapped
      callback(err);
      return;
    }

    if (message.documents[0]) {
      const document: Document = message.documents[0];
      const session = operationDescription.session;
      if (session) {
        updateSessionFromResponse(session, document);
      }

      if (document.$clusterTime) {
        this[kClusterTime] = document.$clusterTime;
        this.emit(Connection.CLUSTER_TIME_RECEIVED, document.$clusterTime);
      }

      if (operationDescription.command) {
        if (document.writeConcernError) {
          callback(new MongoWriteConcernError(document.writeConcernError, document));
          return;
        }

        if (document.ok === 0 || document.$err || document.errmsg || document.code) {
          callback(new MongoServerError(document));
          return;
        }
      } else {
        // Pre 3.2 support
        if (document.ok === 0 || document.$err || document.errmsg) {
          callback(new MongoServerError(document));
          return;
        }
      }
    }

    callback(undefined, message.documents[0]);
  }

  destroy(options: DestroyOptions, callback?: Callback): void {
    this.removeAllListeners(Connection.PINNED);
    this.removeAllListeners(Connection.UNPINNED);

    this[kMessageStream].destroy();
    this.closed = true;

    if (options.force) {
      this[kStream].destroy();
      if (callback) {
        return process.nextTick(callback);
      }
    }

    if (!this[kStream].writableEnded) {
      this[kStream].end(callback);
    } else {
      if (callback) {
        return process.nextTick(callback);
      }
    }
  }

  command(
    ns: MongoDBNamespace,
    cmd: Document,
    options: CommandOptions | undefined,
    callback: Callback
  ): void {
    const readPreference = getReadPreference(cmd, options);
    const shouldUseOpMsg = supportsOpMsg(this);
    const session = options?.session;

    let clusterTime = this.clusterTime;
    let finalCmd = Object.assign({}, cmd);

    if (this.serverApi) {
      const { version, strict, deprecationErrors } = this.serverApi;
      finalCmd.apiVersion = version;
      if (strict != null) finalCmd.apiStrict = strict;
      if (deprecationErrors != null) finalCmd.apiDeprecationErrors = deprecationErrors;
    }

    if (hasSessionSupport(this) && session) {
      if (
        session.clusterTime &&
        clusterTime &&
        session.clusterTime.clusterTime.greaterThan(clusterTime.clusterTime)
      ) {
        clusterTime = session.clusterTime;
      }

      const err = applySession(session, finalCmd, options);
      if (err) {
        return callback(err);
      }
    }

    // if we have a known cluster time, gossip it
    if (clusterTime) {
      finalCmd.$clusterTime = clusterTime;
    }

    if (isSharded(this) && !shouldUseOpMsg && readPreference && readPreference.mode !== 'primary') {
      finalCmd = {
        $query: finalCmd,
        $readPreference: readPreference.toJSON()
      };
    }

    const commandOptions: Document = Object.assign(
      {
        command: true,
        numberToSkip: 0,
        numberToReturn: -1,
        checkKeys: false,
        // This value is not overridable
        secondaryOk: readPreference.secondaryOk()
      },
      options
    );

    const cmdNs = `${ns.db}.$cmd`;
    const message = shouldUseOpMsg
      ? new Msg(cmdNs, finalCmd, commandOptions)
      : new Query(cmdNs, finalCmd, commandOptions);

    try {
      write(this, message, commandOptions, callback);
    } catch (err) {
      callback(err);
    }
  }
}

/** @internal */
export class CryptoConnection extends Connection {
  /** @internal */
  [kAutoEncrypter]?: AutoEncrypter;

  constructor(stream: Stream, options: ConnectionOptions) {
    super(stream, options);
    this[kAutoEncrypter] = options.autoEncrypter;
  }

  /** @internal @override */
  override command(
    ns: MongoDBNamespace,
    cmd: Document,
    options: CommandOptions,
    callback: Callback
  ): void {
    const autoEncrypter = this[kAutoEncrypter];
    if (!autoEncrypter) {
      return callback(new MongoMissingDependencyError('No AutoEncrypter available for encryption'));
    }

    const serverWireVersion = maxWireVersion(this);
    if (serverWireVersion === 0) {
      // This means the initial handshake hasn't happened yet
      return super.command(ns, cmd, options, callback);
    }

    if (serverWireVersion < 8) {
      callback(
        new MongoCompatibilityError('Auto-encryption requires a minimum MongoDB version of 4.2')
      );
      return;
    }

    // Save sort or indexKeys based on the command being run
    // the encrypt API serializes our JS objects to BSON to pass to the native code layer
    // and then deserializes the encrypted result, the protocol level components
    // of the command (ex. sort) are then converted to JS objects potentially losing
    // import key order information. These fields are never encrypted so we can save the values
    // from before the encryption and replace them after encryption has been performed
    const sort: Map<string, number> | null = cmd.find || cmd.findAndModify ? cmd.sort : null;
    const indexKeys: Map<string, number>[] | null = cmd.createIndexes
      ? cmd.indexes.map((index: { key: Map<string, number> }) => index.key)
      : null;

    autoEncrypter.encrypt(ns.toString(), cmd, options, (err, encrypted) => {
      if (err || encrypted == null) {
        callback(err, null);
        return;
      }

      // Replace the saved values
      if (sort != null && (cmd.find || cmd.findAndModify)) {
        encrypted.sort = sort;
      }
      if (indexKeys != null && cmd.createIndexes) {
        for (const [offset, index] of indexKeys.entries()) {
          encrypted.indexes[offset].key = index;
        }
      }

      super.command(ns, encrypted, options, (err, response) => {
        if (err || response == null) {
          callback(err, response);
          return;
        }

        autoEncrypter.decrypt(response, options, callback);
      });
    });
  }
}

/** @internal */
export function hasSessionSupport(conn: Connection): boolean {
  const description = conn.description;
  return description.logicalSessionTimeoutMinutes != null || !!description.loadBalanced;
}

function supportsOpMsg(conn: Connection) {
  const description = conn.description;
  if (description == null) {
    return false;
  }

  return maxWireVersion(conn) >= 6 && !description.__nodejs_mock_server__;
}

function streamIdentifier(stream: Stream, options: ConnectionOptions): string {
  if (options.proxyHost) {
    // If proxy options are specified, the properties of `stream` itself
    // will not accurately reflect what endpoint this is connected to.
    return options.hostAddress.toString();
  }

  const { remoteAddress, remotePort } = stream;
  if (typeof remoteAddress === 'string' && typeof remotePort === 'number') {
    return HostAddress.fromHostPort(remoteAddress, remotePort).toString();
  }

  return uuidV4().toString('hex');
}

function write(
  conn: Connection,
  command: WriteProtocolMessageType,
  options: CommandOptions,
  callback: Callback
) {
  options = options ?? {};
  const operationDescription: OperationDescription = {
    requestId: command.requestId,
    cb: callback,
    session: options.session,
    noResponse: typeof options.noResponse === 'boolean' ? options.noResponse : false,
    documentsReturnedIn: options.documentsReturnedIn,
    command: !!options.command,

    // for BSON parsing
    promoteLongs: typeof options.promoteLongs === 'boolean' ? options.promoteLongs : true,
    promoteValues: typeof options.promoteValues === 'boolean' ? options.promoteValues : true,
    promoteBuffers: typeof options.promoteBuffers === 'boolean' ? options.promoteBuffers : false,
    bsonRegExp: typeof options.bsonRegExp === 'boolean' ? options.bsonRegExp : false,
    enableUtf8Validation:
      typeof options.enableUtf8Validation === 'boolean' ? options.enableUtf8Validation : true,
    raw: typeof options.raw === 'boolean' ? options.raw : false,
    started: 0
  };

  if (conn[kDescription] && conn[kDescription].compressor) {
    operationDescription.agreedCompressor = conn[kDescription].compressor;

    if (conn[kDescription].zlibCompressionLevel) {
      operationDescription.zlibCompressionLevel = conn[kDescription].zlibCompressionLevel;
    }
  }

  if (typeof options.socketTimeoutMS === 'number') {
    operationDescription.socketTimeoutOverride = true;
    conn[kStream].setTimeout(options.socketTimeoutMS);
  }

  // if command monitoring is enabled we need to modify the callback here
  if (conn.monitorCommands) {
    conn.emit(Connection.COMMAND_STARTED, new CommandStartedEvent(conn, command));

    operationDescription.started = now();
    operationDescription.cb = (err, reply) => {
      if (err) {
        conn.emit(
          Connection.COMMAND_FAILED,
          new CommandFailedEvent(conn, command, err, operationDescription.started)
        );
      } else {
        if (reply && (reply.ok === 0 || reply.$err)) {
          conn.emit(
            Connection.COMMAND_FAILED,
            new CommandFailedEvent(conn, command, reply, operationDescription.started)
          );
        } else {
          conn.emit(
            Connection.COMMAND_SUCCEEDED,
            new CommandSucceededEvent(conn, command, reply, operationDescription.started)
          );
        }
      }

      if (typeof callback === 'function') {
        callback(err, reply);
      }
    };
  }

  if (!operationDescription.noResponse) {
    conn[kQueue].set(operationDescription.requestId, operationDescription);
  }

  try {
    conn[kMessageStream].writeCommand(command, operationDescription);
  } catch (e) {
    if (!operationDescription.noResponse) {
      conn[kQueue].delete(operationDescription.requestId);
      operationDescription.cb(e);
      return;
    }
  }

  if (operationDescription.noResponse) {
    operationDescription.cb();
  }
}
