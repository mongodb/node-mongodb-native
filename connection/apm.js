'use strict';

/** Commands that we want to redact because of the sensitive nature of their contents */
const SENSITIVE_COMMANDS = [
  'authenticate',
  'saslStart',
  'saslContinue',
  'getnonce',
  'createUser',
  'updateUser',
  'copydbgetnonce',
  'copydbsaslstart',
  'copydb'
];

// helper methods
function extractCommand(command) { return command.query ? command.query : command; }
function extractCommandName(command) { return Object.keys(command)[0]; }
function calculateDuration(started) { return Date.now() - started; }
function generateConnectionId(pool) { return `${pool.options.host}:${pool.options.port}`; }
function maybeRedact(commandName, result) {
  return SENSITIVE_COMMANDS.indexOf(commandName) !== -1 ? {} : result;
}

/** An event indicating the start of a given command */
class CommandStartedEvent {
  /**
   * Create a started event
   *
   * @param {Pool} pool the pool that originated the command
   * @param {Object} command the command
   */
  constructor (pool, command) {
    const cmd = extractCommand(command);
    const commandName = extractCommandName(cmd);

    // NOTE: remove in major revision, this is not spec behavior
    if (SENSITIVE_COMMANDS.indexOf(commandName) !== -1) {
      this.commandObj = {};
      this.commandObj[commandName] = true;
    }

    Object.assign(this, {
      command: cmd,
      databaseName: command.ns.split('.')[0],
      commandName: extractCommandName(cmd),
      requestId: command.requestId,
      connectionId: generateConnectionId(pool)
    });
  }
};

/** An event indicating the success of a given command */
class CommandSucceededEvent {
  /**
   * Create a succeeded event
   *
   * @param {Pool} pool the pool that originated the command
   * @param {Object} command the command
   * @param {Object} reply the reply for this command from the server
   * @param {Number} started a timestamp of when the command was first sent to calculate duration
   */
  constructor(pool, command, reply, started) {
    const cmd = extractCommand(command);
    const commandName = extractCommandName(cmd);

    Object.assign(this, {
      duration: calculateDuration(started),
      commandName,
      reply: maybeRedact(commandName, reply.result),
      requestId: command.requestId,
      connectionId: generateConnectionId(pool)
    });
  }
};

/** An event indicating the failure of a given command */
class CommandFailedEvent {
  /**
   * Create a failure event
   *
   * @param {Pool} pool the pool that originated the command
   * @param {Object} command the command
   * @param {MongoError|Object} error the generated error or a server error response
   * @param {Number} started a timestamp of when the command was first sent to calculate duration
   */
  constructor(pool, command, error, started) {
    const cmd = extractCommand(command);
    const commandName = extractCommandName(cmd);

    Object.assign(this, {
      duration: calculateDuration(started),
      commandName,
      failure: maybeRedact(commandName, error),
      requestId: command.requestId,
      connectionId: generateConnectionId(pool)
    });
  }
};

module.exports = {
  CommandStartedEvent,
  CommandSucceededEvent,
  CommandFailedEvent
};
