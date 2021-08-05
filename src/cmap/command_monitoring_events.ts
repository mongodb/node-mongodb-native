import { GetMore, KillCursor, Msg, WriteProtocolMessageType } from './commands';
import { calculateDurationInMs, deepCopy } from '../utils';
import type { Connection } from './connection';
import type { Document, ObjectId } from '../bson';

/**
 * An event indicating the start of a given
 * @public
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
  serviceId?: ObjectId;

  /**
   * Create a started event
   *
   * @internal
   * @param pool - the pool that originated the command
   * @param command - the command
   */
  constructor(connection: Connection, command: WriteProtocolMessageType) {
    const cmd = extractCommand(command);
    const commandName = extractCommandName(cmd);
    const { address, connectionId, serviceId } = extractConnectionDetails(connection);

    // TODO: remove in major revision, this is not spec behavior
    if (SENSITIVE_COMMANDS.has(commandName)) {
      this.commandObj = {};
      this.commandObj[commandName] = true;
    }

    this.address = address;
    this.connectionId = connectionId;
    this.serviceId = serviceId;
    this.requestId = command.requestId;
    this.databaseName = databaseName(command);
    this.commandName = commandName;
    this.command = maybeRedact(commandName, cmd, cmd);
  }

  /* @internal */
  get hasServiceId(): boolean {
    return !!this.serviceId;
  }
}

/**
 * An event indicating the success of a given command
 * @public
 * @category Event
 */
export class CommandSucceededEvent {
  address: string;
  connectionId?: string | number;
  requestId: number;
  duration: number;
  commandName: string;
  reply: unknown;
  serviceId?: ObjectId;

  /**
   * Create a succeeded event
   *
   * @internal
   * @param pool - the pool that originated the command
   * @param command - the command
   * @param reply - the reply for this command from the server
   * @param started - a high resolution tuple timestamp of when the command was first sent, to calculate duration
   */
  constructor(
    connection: Connection,
    command: WriteProtocolMessageType,
    reply: Document | undefined,
    started: number
  ) {
    const cmd = extractCommand(command);
    const commandName = extractCommandName(cmd);
    const { address, connectionId, serviceId } = extractConnectionDetails(connection);

    this.address = address;
    this.connectionId = connectionId;
    this.serviceId = serviceId;
    this.requestId = command.requestId;
    this.commandName = commandName;
    this.duration = calculateDurationInMs(started);
    this.reply = maybeRedact(commandName, cmd, extractReply(command, reply));
  }

  /* @internal */
  get hasServiceId(): boolean {
    return !!this.serviceId;
  }
}

/**
 * An event indicating the failure of a given command
 * @public
 * @category Event
 */
export class CommandFailedEvent {
  address: string;
  connectionId?: string | number;
  requestId: number;
  duration: number;
  commandName: string;
  failure: Error;
  serviceId?: ObjectId;

  /**
   * Create a failure event
   *
   * @internal
   * @param pool - the pool that originated the command
   * @param command - the command
   * @param error - the generated error or a server error response
   * @param started - a high resolution tuple timestamp of when the command was first sent, to calculate duration
   */
  constructor(
    connection: Connection,
    command: WriteProtocolMessageType,
    error: Error | Document,
    started: number
  ) {
    const cmd = extractCommand(command);
    const commandName = extractCommandName(cmd);
    const { address, connectionId, serviceId } = extractConnectionDetails(connection);

    this.address = address;
    this.connectionId = connectionId;
    this.serviceId = serviceId;

    this.requestId = command.requestId;
    this.commandName = commandName;
    this.duration = calculateDurationInMs(started);
    this.failure = maybeRedact(commandName, cmd, error) as Error;
  }

  /* @internal */
  get hasServiceId(): boolean {
    return !!this.serviceId;
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

const HELLO_COMMANDS = new Set(['hello', 'ismaster', 'isMaster']);

// helper methods
const extractCommandName = (commandDoc: Document) => Object.keys(commandDoc)[0];
const namespace = (command: WriteProtocolMessageType) => command.ns;
const databaseName = (command: WriteProtocolMessageType) => command.ns.split('.')[0];
const collectionName = (command: WriteProtocolMessageType) => command.ns.split('.')[1];
const maybeRedact = (commandName: string, commandDoc: Document, result: Error | Document) =>
  SENSITIVE_COMMANDS.has(commandName) ||
  (HELLO_COMMANDS.has(commandName) && commandDoc.speculativeAuthenticate)
    ? {}
    : result;

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
      getMore: deepCopy(command.cursorId),
      collection: collectionName(command),
      batchSize: command.numberToReturn
    };
  }

  if (command instanceof KillCursor) {
    return {
      killCursors: collectionName(command),
      cursors: deepCopy(command.cursorIds)
    };
  }

  if (command instanceof Msg) {
    return deepCopy(command.command);
  }

  if (command.query?.$query) {
    let result: Document;
    if (command.ns === 'admin.$cmd') {
      // up-convert legacy command
      result = Object.assign({}, command.query.$query);
    } else {
      // up-convert legacy find command
      result = { find: collectionName(command) };
      Object.keys(LEGACY_FIND_QUERY_MAP).forEach(key => {
        if (command.query[key] != null) {
          result[LEGACY_FIND_QUERY_MAP[key]] = deepCopy(command.query[key]);
        }
      });
    }

    Object.keys(LEGACY_FIND_OPTIONS_MAP).forEach(key => {
      const legacyKey = key as keyof typeof LEGACY_FIND_OPTIONS_MAP;
      if (command[legacyKey] != null) {
        result[LEGACY_FIND_OPTIONS_MAP[legacyKey]] = deepCopy(command[legacyKey]);
      }
    });

    OP_QUERY_KEYS.forEach(key => {
      const opKey = key as typeof OP_QUERY_KEYS[number];
      if (command[opKey]) {
        result[opKey] = command[opKey];
      }
    });

    if (command.pre32Limit != null) {
      result.limit = command.pre32Limit;
    }

    if (command.query.$explain) {
      return { explain: result };
    }
    return result;
  }

  const clonedQuery: Record<string, unknown> = {};
  const clonedCommand: Record<string, unknown> = {};
  if (command.query) {
    for (const k in command.query) {
      clonedQuery[k] = deepCopy(command.query[k]);
    }
    clonedCommand.query = clonedQuery;
  }

  for (const k in command) {
    if (k === 'query') continue;
    clonedCommand[k] = deepCopy((command as unknown as Record<string, unknown>)[k]);
  }
  return command.query ? clonedQuery : clonedCommand;
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
        id: deepCopy(reply.cursorId),
        ns: namespace(command),
        nextBatch: deepCopy(reply.documents)
      }
    };
  }

  if (command instanceof Msg) {
    return deepCopy(reply.result ? reply.result : reply);
  }

  // is this a legacy find command?
  if (command.query && command.query.$query != null) {
    return {
      ok: 1,
      cursor: {
        id: deepCopy(reply.cursorId),
        ns: namespace(command),
        firstBatch: deepCopy(reply.documents)
      }
    };
  }

  return deepCopy(reply.result ? reply.result : reply);
}

function extractConnectionDetails(connection: Connection) {
  let connectionId;
  if ('id' in connection) {
    connectionId = connection.id;
  }
  return {
    address: connection.address,
    serviceId: connection.serviceId,
    connectionId
  };
}
