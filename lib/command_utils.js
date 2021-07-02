'use strict';
const Msg = require('./core/connection/msg').Msg;
const KillCursor = require('./core/connection/commands').KillCursor;
const GetMore = require('./core/connection/commands').GetMore;
const deepCopy = require('./utils').deepCopy;

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

const collectionName = command => command.ns.split('.')[1];

const shouldRedactCommand = (commandName, cmd) =>
  SENSITIVE_COMMANDS.has(commandName) ||
  (HELLO_COMMANDS.has(commandName) && !!cmd.speculativeAuthenticate);

/**
 * Extract the actual command from the query, possibly upconverting if it's a legacy
 * format
 *
 * @param {Object} command the command
 */
const extractCommand = command => {
  let extractedCommand;
  if (command instanceof GetMore) {
    extractedCommand = {
      getMore: deepCopy(command.cursorId),
      collection: collectionName(command),
      batchSize: command.numberToReturn
    };
  } else if (command instanceof KillCursor) {
    extractedCommand = {
      killCursors: collectionName(command),
      cursors: deepCopy(command.cursorIds)
    };
  } else if (command instanceof Msg) {
    extractedCommand = deepCopy(command.command);
  } else if (command.query && command.query.$query) {
    let result;
    if (command.ns === 'admin.$cmd') {
      // upconvert legacy command
      result = Object.assign({}, command.query.$query);
    } else {
      // upconvert legacy find command
      result = { find: collectionName(command) };
      Object.keys(LEGACY_FIND_QUERY_MAP).forEach(key => {
        if (typeof command.query[key] !== 'undefined')
          result[LEGACY_FIND_QUERY_MAP[key]] = deepCopy(command.query[key]);
      });
    }

    Object.keys(LEGACY_FIND_OPTIONS_MAP).forEach(key => {
      if (typeof command[key] !== 'undefined')
        result[LEGACY_FIND_OPTIONS_MAP[key]] = deepCopy(command[key]);
    });

    OP_QUERY_KEYS.forEach(key => {
      if (command[key]) result[key] = command[key];
    });

    if (typeof command.pre32Limit !== 'undefined') {
      result.limit = command.pre32Limit;
    }

    if (command.query.$explain) {
      extractedCommand = { explain: result };
    } else {
      extractedCommand = result;
    }
  } else {
    extractedCommand = deepCopy(command.query || command);
  }

  const commandName = Object.keys(extractedCommand)[0];
  return {
    cmd: extractedCommand,
    name: commandName,
    shouldRedact: shouldRedactCommand(commandName, extractedCommand)
  };
};

module.exports = {
  extractCommand
};
