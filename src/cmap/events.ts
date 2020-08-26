import { GetMore, KillCursor, Msg, WriteProtocolMessageType } from './commands';
import { calculateDurationInMs } from '../utils';
import type { ConnectionPool, ConnectionPoolOptions } from './connection_pool';
import type { Connection } from './connection';
import type { Document } from '../bson';
import type { AnyError } from '../error';

/**
 * The base export class for all monitoring events published from the connection pool
 * @category Event
 */
export class ConnectionPoolMonitoringEvent {
  /** A timestamp when the event was created  */
  time: Date;
  /** The address (host/port pair) of the pool */
  address: string;

  constructor(pool: ConnectionPool) {
    this.time = new Date();
    this.address = pool.address;
  }
}

/**
 * An event published when a connection pool is created
 * @category Event
 */
export class ConnectionPoolCreatedEvent extends ConnectionPoolMonitoringEvent {
  /** The options used to create this connection pool */
  options?: ConnectionPoolOptions;

  constructor(pool: ConnectionPool) {
    super(pool);
    this.options = pool.options;
  }
}

/**
 * An event published when a connection pool is closed
 * @category Event
 */
export class ConnectionPoolClosedEvent extends ConnectionPoolMonitoringEvent {
  constructor(pool: ConnectionPool) {
    super(pool);
  }
}

/**
 * An event published when a connection pool creates a new connection
 * @category Event
 */
export class ConnectionCreatedEvent extends ConnectionPoolMonitoringEvent {
  /** A monotonically increasing, per-pool id for the newly created connection */
  connectionId: number;

  constructor(pool: ConnectionPool, connection: Connection) {
    super(pool);
    this.connectionId = connection.id;
  }
}

/**
 * An event published when a connection is ready for use
 * @category Event
 */
export class ConnectionReadyEvent extends ConnectionPoolMonitoringEvent {
  /** The id of the connection */
  connectionId: number;

  constructor(pool: ConnectionPool, connection: Connection) {
    super(pool);
    this.connectionId = connection.id;
  }
}

/**
 * An event published when a connection is closed
 * @category Event
 */
export class ConnectionClosedEvent extends ConnectionPoolMonitoringEvent {
  /** The id of the connection */
  connectionId: number;
  /** The reason the connection was closed */
  reason: string;

  constructor(pool: ConnectionPool, connection: Connection, reason: string) {
    super(pool);
    this.connectionId = connection.id;
    this.reason = reason || 'unknown';
  }
}

/** An event published when a request to check a connection out begins @category Event */
export class ConnectionCheckOutStartedEvent extends ConnectionPoolMonitoringEvent {
  constructor(pool: ConnectionPool) {
    super(pool);
  }
}

/**
 * An event published when a request to check a connection out fails
 * @category Event
 */
export class ConnectionCheckOutFailedEvent extends ConnectionPoolMonitoringEvent {
  /** The reason the attempt to check out failed */
  reason: AnyError | string;

  constructor(pool: ConnectionPool, reason: AnyError | string) {
    super(pool);
    this.reason = reason;
  }
}

/**
 * An event published when a connection is checked out of the connection pool
 * @category Event
 */
export class ConnectionCheckedOutEvent extends ConnectionPoolMonitoringEvent {
  /** The id of the connection */
  connectionId: number;

  constructor(pool: ConnectionPool, connection: Connection) {
    super(pool);
    this.connectionId = connection.id;
  }
}

/**
 * An event published when a connection is checked into the connection pool
 * @category Event
 */
export class ConnectionCheckedInEvent extends ConnectionPoolMonitoringEvent {
  /** The id of the connection */
  connectionId: number;

  constructor(pool: ConnectionPool, connection: Connection) {
    super(pool);
    this.connectionId = connection.id;
  }
}

/**
 * An event published when a connection pool is cleared
 * @category Event
 */
export class ConnectionPoolClearedEvent extends ConnectionPoolMonitoringEvent {
  constructor(pool: ConnectionPool) {
    super(pool);
  }
}

export const CMAP_EVENT_NAMES = [
  'connectionPoolCreated',
  'connectionPoolClosed',
  'connectionCreated',
  'connectionReady',
  'connectionClosed',
  'connectionCheckOutStarted',
  'connectionCheckOutFailed',
  'connectionCheckedOut',
  'connectionCheckedIn',
  'connectionPoolCleared'
];

/**
 * An event indicating the start of a given
 * @category Event
 */
export class CommandStartedEvent {
  commandObj?: Document;
  requestId: number;
  databaseName: string;
  commandName: string;
  command: Document;
  address: string;
  connectionId?: string | number;

  /**
   * Create a started event
   *
   * @param pool - the pool that originated the command
   * @param command - the command
   */
  constructor(pool: Connection | ConnectionPool, command: WriteProtocolMessageType) {
    const cmd = extractCommand(command);
    const commandName = extractCommandName(cmd);
    const { address, connectionId } = extractConnectionDetails(pool);

    // TODO: remove in major revision, this is not spec behavior
    if (SENSITIVE_COMMANDS.has(commandName)) {
      this.commandObj = {};
      this.commandObj[commandName] = true;
    }

    this.address = address;
    this.connectionId = connectionId;
    this.requestId = command.requestId;
    this.databaseName = databaseName(command);
    this.commandName = commandName;
    this.command = cmd;
  }
}

/**
 * An event indicating the success of a given command
 * @category Event
 */
export class CommandSucceededEvent {
  address: string;
  connectionId?: string | number;
  requestId: number;
  duration: number;
  commandName: string;
  reply: unknown;

  /**
   * Create a succeeded event
   *
   * @param pool - the pool that originated the command
   * @param command - the command
   * @param reply - the reply for this command from the server
   * @param started - a high resolution tuple timestamp of when the command was first sent, to calculate duration
   */
  constructor(
    pool: Connection | ConnectionPool,
    command: WriteProtocolMessageType,
    reply: Document | undefined,
    started: number
  ) {
    const cmd = extractCommand(command);
    const commandName = extractCommandName(cmd);
    const { address, connectionId } = extractConnectionDetails(pool);

    this.address = address;
    this.connectionId = connectionId;
    this.requestId = command.requestId;
    this.commandName = commandName;
    this.duration = calculateDurationInMs(started);
    this.reply = maybeRedact(commandName, extractReply(command, reply));
  }
}

/**
 * An event indicating the failure of a given command
 * @category Event
 */
export class CommandFailedEvent {
  address: string;
  connectionId?: string | number;
  requestId: number;
  duration: number;
  commandName: string;
  failure: Error;
  /**
   * Create a failure event
   *
   * @param pool - the pool that originated the command
   * @param command - the command
   * @param error - the generated error or a server error response
   * @param started - a high resolution tuple timestamp of when the command was first sent, to calculate duration
   */
  constructor(
    pool: Connection | ConnectionPool,
    command: WriteProtocolMessageType,
    error: Error | Document,
    started: number
  ) {
    const cmd = extractCommand(command);
    const commandName = extractCommandName(cmd);
    const { address, connectionId } = extractConnectionDetails(pool);

    this.address = address;
    this.connectionId = connectionId;

    this.requestId = command.requestId;
    this.commandName = commandName;
    this.duration = calculateDurationInMs(started);
    this.failure = maybeRedact(commandName, error) as Error;
  }
}

/** Commands that we want to redact because of the sensitive nature of their contents */
const SENSITIVE_COMMANDS = new Set([
  'authenticate',
  'saslStart',
  'saslContinue',
  'getnonce',
  'createUser',
  'updateUser',
  'copydbgetnonce',
  'copydbsaslstart',
  'copydb'
]);

// helper methods
const extractCommandName = (commandDoc: Document) => Object.keys(commandDoc)[0];
const namespace = (command: WriteProtocolMessageType) => command.ns;
const databaseName = (command: WriteProtocolMessageType) => command.ns.split('.')[0];
const collectionName = (command: WriteProtocolMessageType) => command.ns.split('.')[1];
const maybeRedact = (commandName: string, result?: Error | Document) =>
  SENSITIVE_COMMANDS.has(commandName) ? {} : result;

const LEGACY_FIND_QUERY_MAP: { [key: string]: string } = {
  $query: 'filter',
  $orderby: 'sort',
  $hint: 'hint',
  $comment: 'comment',
  $maxScan: 'maxScan',
  $max: 'max',
  $min: 'min',
  $returnKey: 'returnKey',
  $showDiskLoc: 'showRecordId',
  $maxTimeMS: 'maxTimeMS',
  $snapshot: 'snapshot'
};

const LEGACY_FIND_OPTIONS_MAP = {
  numberToSkip: 'skip',
  numberToReturn: 'batchSize',
  returnFieldSelector: 'projection'
} as const;

const OP_QUERY_KEYS = [
  'tailable',
  'oplogReplay',
  'noCursorTimeout',
  'awaitData',
  'partial',
  'exhaust'
] as const;

/** Extract the actual command from the query, possibly up-converting if it's a legacy format */
function extractCommand(command: WriteProtocolMessageType): Document {
  if (command instanceof GetMore) {
    return {
      getMore: command.cursorId,
      collection: collectionName(command),
      batchSize: command.numberToReturn
    };
  }

  if (command instanceof KillCursor) {
    return {
      killCursors: collectionName(command),
      cursors: command.cursorIds
    };
  }

  if (command instanceof Msg) {
    return command.command;
  }

  if (command.query && command.query.$query) {
    let result: Document;
    if (command.ns === 'admin.$cmd') {
      // up-convert legacy command
      result = Object.assign({}, command.query.$query);
    } else {
      // up-convert legacy find command
      result = { find: collectionName(command) };
      Object.keys(LEGACY_FIND_QUERY_MAP).forEach(key => {
        if (typeof command.query[key] !== 'undefined') {
          result[LEGACY_FIND_QUERY_MAP[key]] = command.query[key];
        }
      });
    }

    Object.keys(LEGACY_FIND_OPTIONS_MAP).forEach(key => {
      const legacyKey = key as keyof typeof LEGACY_FIND_OPTIONS_MAP;
      if (typeof command[legacyKey] !== 'undefined') {
        result[LEGACY_FIND_OPTIONS_MAP[legacyKey]] = command[legacyKey];
      }
    });

    OP_QUERY_KEYS.forEach(key => {
      const opKey = key as typeof OP_QUERY_KEYS[number];
      if (command[opKey]) {
        result[opKey] = command[opKey];
      }
    });

    if (typeof command.pre32Limit !== 'undefined') {
      result.limit = command.pre32Limit;
    }

    if (command.query.$explain) {
      return { explain: result };
    }

    return result;
  }

  return command.query ? command.query : command;
}

function extractReply(command: WriteProtocolMessageType, reply?: Document) {
  if (command instanceof KillCursor) {
    return {
      ok: 1,
      cursorsUnknown: command.cursorIds
    };
  }

  if (!reply) {
    return reply;
  }

  if (command instanceof GetMore) {
    return {
      ok: 1,
      cursor: {
        id: reply.cursorId,
        ns: namespace(command),
        nextBatch: reply.documents
      }
    };
  }

  if (command instanceof Msg) {
    return reply.result ? reply.result : reply;
  }

  // is this a legacy find command?
  if (command.query && typeof command.query.$query !== 'undefined') {
    return {
      ok: 1,
      cursor: {
        id: reply.cursorId,
        ns: namespace(command),
        firstBatch: reply.documents
      }
    };
  }

  return reply.result ? reply.result : reply;
}

function extractConnectionDetails(connection: Connection | ConnectionPool) {
  let connectionId;
  if ('id' in connection) {
    connectionId = connection.id;
  }
  return {
    address: connection.address,
    connectionId
  };
}
