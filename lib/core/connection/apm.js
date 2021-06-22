'use strict';
const KillCursor = require('../connection/commands').KillCursor;
const GetMore = require('../connection/commands').GetMore;
const calculateDurationInMs = require('../../utils').calculateDurationInMs;
const extractCommand = require('../../command_utils').extractCommand;

// helper methods
const namespace = command => command.ns;
const databaseName = command => command.ns.split('.')[0];
const generateConnectionId = pool =>
  pool.options ? `${pool.options.host}:${pool.options.port}` : pool.address;
const isLegacyPool = pool => pool.s && pool.queue;

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

const extractConnectionDetails = pool => {
  if (isLegacyPool(pool)) {
    return {
      connectionId: generateConnectionId(pool)
    };
  }

  // APM in the modern pool is done at the `Connection` level, so we rename it here for
  // readability.
  const connection = pool;
  return {
    address: connection.address,
    connectionId: connection.id
  };
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
    const extractedCommand = extractCommand(command);
    const commandName = extractedCommand.name;
    const connectionDetails = extractConnectionDetails(pool);

    Object.assign(this, connectionDetails, {
      requestId: command.requestId,
      databaseName: databaseName(command),
      commandName,
      command: extractedCommand.shouldRedact ? {} : extractedCommand.cmd
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
    const extractedCommand = extractCommand(command);
    const commandName = extractedCommand.name;
    const connectionDetails = extractConnectionDetails(pool);

    Object.assign(this, connectionDetails, {
      requestId: command.requestId,
      commandName,
      duration: calculateDurationInMs(started),
      reply: extractedCommand.shouldRedact ? {} : extractReply(command, reply)
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
    const extractedCommand = extractCommand(command);
    const commandName = extractedCommand.name;
    const connectionDetails = extractConnectionDetails(pool);

    Object.assign(this, connectionDetails, {
      requestId: command.requestId,
      commandName,
      duration: calculateDurationInMs(started),
      failure: extractedCommand.shouldRedact ? {} : error
    });
  }
}

module.exports = {
  CommandStartedEvent,
  CommandSucceededEvent,
  CommandFailedEvent
};
