import { type Document, type ObjectId } from '../bson';
import {
  COMMAND_FAILED,
  COMMAND_STARTED,
  COMMAND_SUCCEEDED,
  LEGACY_HELLO_COMMAND,
  LEGACY_HELLO_COMMAND_CAMEL_CASE
} from '../constants';
import { calculateDurationInMs, deepCopy } from '../utils';
import {
  DocumentSequence,
  OpMsgRequest,
  type OpQueryRequest,
  type WriteProtocolMessageType
} from './commands';
import type { Connection } from './connection';

/**
 * An event indicating the start of a given command
 * @public
 * @category Event
 */
export class CommandStartedEvent {
  commandObj?: Document;
  requestId: number;
  databaseName: string;
  commandName: string;
  private _command?: Document;
  private _commandRef?: WriteProtocolMessageType;
  address: string;
  /** Driver generated connection id */
  connectionId?: string | number;
  /**
   * Server generated connection id
   * Distinct from the connection id and is returned by the hello or legacy hello response as "connectionId"
   * from the server on 4.2+.
   */
  serverConnectionId: bigint | null;
  serviceId?: ObjectId;
  /** @internal */
  name = COMMAND_STARTED;

  /**
   * Create a started event
   *
   * @internal
   * @param pool - the pool that originated the command
   * @param command - the command
   */
  constructor(
    connection: Connection,
    command: WriteProtocolMessageType,
    serverConnectionId: bigint | null
  ) {
    const commandName = extractCommandName(command);
    const { address, connectionId, serviceId } = extractConnectionDetails(connection);

    // TODO: remove in major revision, this is not spec behavior
    if (SENSITIVE_COMMANDS.has(commandName)) {
      this.commandObj = {};
      this.commandObj[commandName] = true;
    } else {
      this._commandRef = command;
    }

    this.address = address;
    this.connectionId = connectionId;
    this.serviceId = serviceId;
    this.requestId = command.requestId;
    this.databaseName = command.databaseName;
    this.commandName = commandName;
    this.serverConnectionId = serverConnectionId;
  }

  /* @internal */
  get hasServiceId(): boolean {
    return !!this.serviceId;
  }

  get command(): Document {
    if (this._command) return this._command;
    if (!this._commandRef) return {};
    const cmd = extractCommand(this._commandRef);
    const sensitive = isSensitive(this.commandName, cmd);
    this._command = maybeRedact(sensitive, cmd);
    delete this._commandRef;

    return this._command;
  }
}

/**
 * An event indicating the success of a given command
 * @public
 * @category Event
 */
export class CommandSucceededEvent {
  address: string;
  /** Driver generated connection id */
  connectionId?: string | number;
  /**
   * Server generated connection id
   * Distinct from the connection id and is returned by the hello or legacy hello response as "connectionId" from the server on 4.2+.
   */
  serverConnectionId: bigint | null;
  requestId: number;
  duration: number;
  commandName: string;
  private _reply: unknown;
  private _replyRef?: Document | undefined;
  private _commandIsLegacyFind: boolean;
  private _commandIsOpMsg: boolean;
  private _namespace?: string;
  serviceId?: ObjectId;
  private sensitive: boolean;
  /** @internal */
  name = COMMAND_SUCCEEDED;

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
    started: number,
    serverConnectionId: bigint | null
  ) {
    const commandName = extractCommandName(command);
    const { address, connectionId, serviceId } = extractConnectionDetails(connection);

    const isOpMsg = command instanceof OpMsgRequest;
    this._commandIsLegacyFind = !isOpMsg && command.query != null && command.query.$query != null;
    this._commandIsOpMsg = isOpMsg;
    if (this._commandIsLegacyFind) this._namespace = namespace(command as OpQueryRequest);

    this.sensitive = isSensitive(commandName, command);
    if (this.sensitive) this._reply = {};
    else {
      this._replyRef = reply;
    }
    this.address = address;
    this.connectionId = connectionId;
    this.serviceId = serviceId;
    this.requestId = command.requestId;
    this.commandName = commandName;
    this.duration = calculateDurationInMs(started);
    this.serverConnectionId = serverConnectionId;
  }

  /* @internal */
  get hasServiceId(): boolean {
    return !!this.serviceId;
  }

  get reply(): unknown {
    if (this._reply) return this._reply;
    if (this.sensitive) this._reply = {};
    this._reply = extractReply(
      this._commandIsOpMsg,
      this._commandIsLegacyFind,
      this._namespace,
      this._replyRef
    );
    return this._reply;
  }
}

/**
 * An event indicating the failure of a given command
 * @public
 * @category Event
 */
export class CommandFailedEvent {
  address: string;
  /** Driver generated connection id */
  connectionId?: string | number;
  /**
   * Server generated connection id
   * Distinct from the connection id and is returned by the hello or legacy hello response as "connectionId" from the server on 4.2+.
   */
  serverConnectionId: bigint | null;
  requestId: number;
  duration: number;
  commandName: string;
  private sensitive: boolean;
  failure: Error;
  serviceId?: ObjectId;
  /** @internal */
  name = COMMAND_FAILED;

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
    started: number,
    serverConnectionId: bigint | null
  ) {
    const cmd = extractCommand(command);
    const commandName = extractCommandName(cmd);
    const { address, connectionId, serviceId } = extractConnectionDetails(connection);

    this.sensitive = isSensitive(commandName, command);

    this.address = address;
    this.connectionId = connectionId;
    this.serviceId = serviceId;

    this.requestId = command.requestId;
    this.commandName = commandName;
    this.duration = calculateDurationInMs(started);
    this.failure = maybeRedact(this.sensitive, error) as Error;
    this.serverConnectionId = serverConnectionId;
  }

  /* @internal */
  get hasServiceId(): boolean {
    return !!this.serviceId;
  }
}

/**
 * Commands that we want to redact because of the sensitive nature of their contents
 * @internal
 */
export const SENSITIVE_COMMANDS = new Set([
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

const HELLO_COMMANDS = new Set(['hello', LEGACY_HELLO_COMMAND, LEGACY_HELLO_COMMAND_CAMEL_CASE]);

// helper methods
const extractCommandName = (commandDoc: Document) => {
  if (commandDoc.query != null) {
    if (commandDoc.query.$query != null) return Object.keys(commandDoc.query.$query)[0];
    return Object.keys(commandDoc.query)[0];
  }
  if (commandDoc.command != null) return Object.keys(commandDoc.command)[0];
  return Object.keys(commandDoc)[0];
};
const namespace = (command: OpQueryRequest) => command.ns;
const collectionName = (command: OpQueryRequest) => command.ns.split('.')[1];
const isSensitive = (commandName: string, commandDoc: Document): boolean =>
  SENSITIVE_COMMANDS.has(commandName) ||
  (HELLO_COMMANDS.has(commandName) && commandDoc.speculativeAuthenticate);
const maybeRedact = (isSensitive: boolean, result: Error | Document) => (isSensitive ? {} : result);

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
  if (command instanceof OpMsgRequest) {
    const cmd = deepCopy(command.command);
    // For OP_MSG with payload type 1 we need to pull the documents
    // array out of the document sequence for monitoring.
    if (cmd.ops instanceof DocumentSequence) {
      cmd.ops = cmd.ops.documents;
    }
    if (cmd.nsInfo instanceof DocumentSequence) {
      cmd.nsInfo = cmd.nsInfo.documents;
    }
    return cmd;
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
      if (command[key]) {
        result[key] = command[key];
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

function extractReply(
  isOpMsg: boolean,
  isLegacyFind: boolean,
  namespace?: string,
  reply?: Document
) {
  if (!reply) {
    return reply;
  }

  if (isOpMsg) {
    return deepCopy(reply.result ? reply.result : reply);
  }

  // is this a legacy find command?
  if (isLegacyFind) {
    return {
      ok: 1,
      cursor: {
        id: deepCopy(reply.cursorId),
        ns: namespace,
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
