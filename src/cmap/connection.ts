import { BSONSerializeOptions, Document, Long, ObjectId, pluckBSONSerializeOptions } from '../bson';
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
import { ReadPreference, ReadPreferenceLike } from '../read_preference';
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
import {
  BinMsg,
  GetMore,
  KillCursor,
  Msg,
  OpQueryOptions,
  Query,
  Response,
  WriteProtocolMessageType
} from './commands';
import type { Stream } from './connect';
import { MessageStream, OperationDescription } from './message_stream';
import { StreamDescription, StreamDescriptionOptions } from './stream_description';
import { applyCommonQueryOptions, getReadPreference, isSharded } from './wire_protocol/shared';

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
const kFullResult = Symbol('fullResult');
/** @internal */
const kDelayedTimeoutId = Symbol('delayedTimeoutId');

/** @internal */
export interface QueryOptions extends BSONSerializeOptions {
  readPreference: ReadPreference;
  documentsReturnedIn?: string;
  batchSize?: number;
  limit?: number;
  skip?: number;
  projection?: Document;
  tailable?: boolean;
  awaitData?: boolean;
  noCursorTimeout?: boolean;
  /** @deprecated use `noCursorTimeout` instead */
  timeout?: boolean;
  partial?: boolean;
  oplogReplay?: boolean;
}

/** @internal */
export interface CommandOptions extends BSONSerializeOptions {
  command?: boolean;
  secondaryOk?: boolean;
  /** Specify read preference if command supports it */
  readPreference?: ReadPreferenceLike;
  raw?: boolean;
  monitoring?: boolean;
  [kFullResult]?: boolean;
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
  force?: boolean;
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
  closed: boolean;
  destroyed: boolean;
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
    this.destroyed = false;
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

    this[kStream].destroy(error);

    this.closed = true;

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

    this.closed = true;

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
      this[kStream].destroy();

      this.closed = true;

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
    const operationDescription = this[kQueue].get(message.responseTo);
    if (!operationDescription) {
      return;
    }

    const callback = operationDescription.cb;

    // SERVER-45775: For exhaust responses we should be able to use the same requestId to
    // track response, however the server currently synthetically produces remote requests
    // making the `responseTo` change on each response
    this[kQueue].delete(message.responseTo);
    if ('moreToCome' in message && message.moreToCome) {
      // requeue the callback for next synthetic request
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

    callback(undefined, operationDescription.fullResult ? message : message.documents[0]);
  }

  destroy(options?: DestroyOptions, callback?: Callback): void {
    if (typeof options === 'function') {
      callback = options;
      options = { force: false };
    }

    this.removeAllListeners(Connection.PINNED);
    this.removeAllListeners(Connection.UNPINNED);

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

  command(
    ns: MongoDBNamespace,
    cmd: Document,
    options: CommandOptions | undefined,
    callback: Callback
  ): void {
    if (!(ns instanceof MongoDBNamespace)) {
      // TODO(NODE-3483): Replace this with a MongoCommandError
      throw new MongoRuntimeError('Must provide a MongoDBNamespace instance');
    }

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

      const err = applySession(session, finalCmd, options as CommandOptions);
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

  query(ns: MongoDBNamespace, cmd: Document, options: QueryOptions, callback: Callback): void {
    const isExplain = cmd.$explain != null;
    const readPreference = options.readPreference ?? ReadPreference.primary;
    const batchSize = options.batchSize || 0;
    const limit = options.limit;
    const numberToSkip = options.skip || 0;
    let numberToReturn = 0;
    if (
      limit &&
      (limit < 0 || (limit !== 0 && limit < batchSize) || (limit > 0 && batchSize === 0))
    ) {
      numberToReturn = limit;
    } else {
      numberToReturn = batchSize;
    }

    if (isExplain) {
      // nToReturn must be 0 (match all) or negative (match N and close cursor)
      // nToReturn > 0 will give explain results equivalent to limit(0)
      numberToReturn = -Math.abs(limit || 0);
    }

    const queryOptions: OpQueryOptions = {
      numberToSkip,
      numberToReturn,
      pre32Limit: typeof limit === 'number' ? limit : undefined,
      checkKeys: false,
      secondaryOk: readPreference.secondaryOk()
    };

    if (options.projection) {
      queryOptions.returnFieldSelector = options.projection;
    }

    const query = new Query(ns.toString(), cmd, queryOptions);
    if (typeof options.tailable === 'boolean') {
      query.tailable = options.tailable;
    }

    if (typeof options.oplogReplay === 'boolean') {
      query.oplogReplay = options.oplogReplay;
    }

    if (typeof options.timeout === 'boolean') {
      query.noCursorTimeout = !options.timeout;
    } else if (typeof options.noCursorTimeout === 'boolean') {
      query.noCursorTimeout = options.noCursorTimeout;
    }

    if (typeof options.awaitData === 'boolean') {
      query.awaitData = options.awaitData;
    }

    if (typeof options.partial === 'boolean') {
      query.partial = options.partial;
    }

    write(
      this,
      query,
      { [kFullResult]: true, ...pluckBSONSerializeOptions(options) },
      (err, result) => {
        if (err || !result) return callback(err, result);
        if (isExplain && result.documents && result.documents[0]) {
          return callback(undefined, result.documents[0]);
        }

        callback(undefined, result);
      }
    );
  }

  getMore(
    ns: MongoDBNamespace,
    cursorId: Long,
    options: GetMoreOptions,
    callback: Callback<Document>
  ): void {
    const fullResult = !!options[kFullResult];
    const wireVersion = maxWireVersion(this);
    if (!cursorId) {
      // TODO(NODE-3483): Replace this with a MongoCommandError
      callback(new MongoRuntimeError('Invalid internal cursor state, no known cursor id'));
      return;
    }

    if (wireVersion < 4) {
      const getMoreOp = new GetMore(ns.toString(), cursorId, { numberToReturn: options.batchSize });
      const queryOptions = applyCommonQueryOptions(
        {},
        Object.assign(options, { ...pluckBSONSerializeOptions(options) })
      );

      queryOptions[kFullResult] = true;
      queryOptions.command = true;
      write(this, getMoreOp, queryOptions, (err, response) => {
        if (fullResult) return callback(err, response);
        if (err) return callback(err);
        callback(undefined, { cursor: { id: response.cursorId, nextBatch: response.documents } });
      });

      return;
    }

    const getMoreCmd: Document = {
      getMore: cursorId,
      collection: ns.collection
    };

    if (typeof options.batchSize === 'number') {
      getMoreCmd.batchSize = Math.abs(options.batchSize);
    }

    if (typeof options.maxAwaitTimeMS === 'number') {
      getMoreCmd.maxTimeMS = options.maxAwaitTimeMS;
    }
    // we check for undefined specifically here to allow falsy values
    // eslint-disable-next-line no-restricted-syntax
    if (options.comment !== undefined) {
      getMoreCmd.comment = options.comment;
    }

    const commandOptions = Object.assign(
      {
        returnFieldSelector: null,
        documentsReturnedIn: 'nextBatch'
      },
      options
    );

    this.command(ns, getMoreCmd, commandOptions, callback);
  }

  killCursors(
    ns: MongoDBNamespace,
    cursorIds: Long[],
    options: CommandOptions,
    callback: Callback
  ): void {
    if (!cursorIds || !Array.isArray(cursorIds)) {
      // TODO(NODE-3483): Replace this with a MongoCommandError
      throw new MongoRuntimeError(`Invalid list of cursor ids provided: ${cursorIds}`);
    }

    if (maxWireVersion(this) < 4) {
      try {
        write(
          this,
          new KillCursor(ns.toString(), cursorIds),
          { noResponse: true, ...options },
          callback
        );
      } catch (err) {
        callback(err);
      }

      return;
    }

    this.command(
      ns,
      { killCursors: ns.collection, cursors: cursorIds },
      { [kFullResult]: true, ...options },
      (err, response) => {
        if (err || !response) return callback(err);
        if (response.cursorNotFound) {
          return callback(new MongoNetworkError('cursor killed or timed out'), null);
        }

        if (!Array.isArray(response.documents) || response.documents.length === 0) {
          return callback(
            // TODO(NODE-3483)
            new MongoRuntimeError(
              `invalid killCursors result returned for cursor id ${cursorIds[0]}`
            )
          );
        }

        callback(undefined, response.documents[0]);
      }
    );
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

    autoEncrypter.encrypt(ns.toString(), cmd, options, (err, encrypted) => {
      if (err || encrypted == null) {
        callback(err, null);
        return;
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

  if (typeof stream.address === 'function') {
    return `${stream.remoteAddress}:${stream.remotePort}`;
  }

  return uuidV4().toString('hex');
}

function write(
  conn: Connection,
  command: WriteProtocolMessageType,
  options: CommandOptions,
  callback: Callback
) {
  if (typeof options === 'function') {
    callback = options;
  }

  options = options ?? {};
  const operationDescription: OperationDescription = {
    requestId: command.requestId,
    cb: callback,
    session: options.session,
    fullResult: !!options[kFullResult],
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
