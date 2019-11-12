'use strict';
const Msg = require('../connection/msg').Msg;
const KillCursor = require('../connection/commands').KillCursor;
const GetMore = require('../connection/commands').GetMore;
const calculateDurationInMs = require('../utils').calculateDurationInMs;

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
const extractCommandName = commandDoc => Object.keys(commandDoc)[0];
const namespace = command => command.ns;
const databaseName = command => command.ns.split('.')[0];
const collectionName = command => command.ns.split('.')[1];
const generateConnectionId = pool =>
  pool.options ? `${pool.options.host}:${pool.options.port}` : pool.id;
const maybeRedact = (commandName, result) => (SENSITIVE_COMMANDS.has(commandName) ? {} : result);

const LEGACY_FIND_QUERY_MAP = {
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
  returnFieldsSelector: 'projection'
};

const OP_QUERY_KEYS = [
  'tailable',
  'oplogReplay',
  'noCursorTimeout',
  'awaitData',
  'partial',
  'exhaust'
];

/**
 * Extract the actual command from the query, possibly upconverting if it's a legacy
 * format
 *
 * @param {Object} command the command
 */
const extractCommand = command => {
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
    let result;
    if (command.ns === 'admin.$cmd') {
      // upconvert legacy command
      result = Object.assign({}, command.query.$query);
    } else {
      // upconvert legacy find command
      result = { find: collectionName(command) };
      Object.keys(LEGACY_FIND_QUERY_MAP).forEach(key => {
        if (typeof command.query[key] !== 'undefined')
          result[LEGACY_FIND_QUERY_MAP[key]] = command.query[key];
      });
    }

    Object.keys(LEGACY_FIND_OPTIONS_MAP).forEach(key => {
      if (typeof command[key] !== 'undefined') result[LEGACY_FIND_OPTIONS_MAP[key]] = command[key];
    });

    OP_QUERY_KEYS.forEach(key => {
      if (command[key]) result[key] = command[key];
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
};

const extractReply = (command, reply) => {
  if (command instanceof GetMore) {
    return {
      ok: 1,
      cursor: {
        id: reply.message.cursorId,
        ns: namespace(command),
        nextBatch: reply.message.documents
      }
    };
  }

  if (command instanceof KillCursor) {
    return {
      ok: 1,
      cursorsUnknown: command.cursorIds
    };
  }

  // is this a legacy find command?
  if (command.query && typeof command.query.$query !== 'undefined') {
    return {
      ok: 1,
      cursor: {
        id: reply.message.cursorId,
        ns: namespace(command),
        firstBatch: reply.message.documents
      }
    };
  }

  return reply && reply.result ? reply.result : reply;
};

/** An event indicating the start of a given command */
class CommandStartedEvent {
  /**
   * Create a started event
   *
   * @param {Pool} pool the pool that originated the command
   * @param {Object} command the command
   */
  constructor(pool, command) {
    const cmd = extractCommand(command);
    const commandName = extractCommandName(cmd);

    // NOTE: remove in major revision, this is not spec behavior
    if (SENSITIVE_COMMANDS.has(commandName)) {
      this.commandObj = {};
      this.commandObj[commandName] = true;
    }

    Object.assign(this, {
      connectionId: generateConnectionId(pool),
      requestId: command.requestId,
      databaseName: databaseName(command),
      commandName,
      command: cmd
    });
  }
}

/** An event indicating the success of a given command */
class CommandSucceededEvent {
  /**
   * Create a succeeded event
   *
   * @param {Pool} pool the pool that originated the command
   * @param {Object} command the command
   * @param {Object} reply the reply for this command from the server
   * @param {Array} started a high resolution tuple timestamp of when the command was first sent, to calculate duration
   */
  constructor(pool, command, reply, started) {
    const cmd = extractCommand(command);
    const commandName = extractCommandName(cmd);

    Object.assign(this, {
      connectionId: generateConnectionId(pool),
      requestId: command.requestId,
      commandName,
      duration: calculateDurationInMs(started),
      reply: maybeRedact(commandName, extractReply(command, reply))
    });
  }
}

/** An event indicating the failure of a given command */
class CommandFailedEvent {
  /**
   * Create a failure event
   *
   * @param {Pool} pool the pool that originated the command
   * @param {Object} command the command
   * @param {MongoError|Object} error the generated error or a server error response
   * @param {Array} started a high resolution tuple timestamp of when the command was first sent, to calculate duration
   */
  constructor(pool, command, error, started) {
    const cmd = extractCommand(command);
    const commandName = extractCommandName(cmd);

    Object.assign(this, {
      connectionId: generateConnectionId(pool),
      requestId: command.requestId,
      commandName,
      duration: calculateDurationInMs(started),
      failure: maybeRedact(commandName, error)
    });
  }
}

module.exports = {
  CommandStartedEvent,
  CommandSucceededEvent,
  CommandFailedEvent
};
