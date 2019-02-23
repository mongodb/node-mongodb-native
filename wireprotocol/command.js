'use strict';

const Query = require('../connection/commands').Query;
const Msg = require('../connection/msg').Msg;
const retrieveBSON = require('../connection/utils').retrieveBSON;
const MongoError = require('../error').MongoError;
const getReadPreference = require('./shared').getReadPreference;
const BSON = retrieveBSON();
const ReadPreference = require('../topologies/read_preference');
const TxnState = require('../transactions').TxnState;
const isSharded = require('./shared').isSharded;
const databaseNamespace = require('./shared').databaseNamespace;

function command(server, ns, cmd, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = options || {};

  if (cmd == null) {
    return callback(new MongoError(`command ${JSON.stringify(cmd)} does not return a cursor`));
  }

  const bson = server.s.bson;
  const pool = server.s.pool;
  const readPreference = getReadPreference(cmd, options);
  const shouldUseOpMsg = supportsOpMsg(server);

  let finalCmd = Object.assign({}, cmd);
  if (
    isSharded(server) &&
    !shouldUseOpMsg &&
    readPreference &&
    readPreference.preference !== 'primary'
  ) {
    finalCmd = {
      $query: finalCmd,
      $readPreference: readPreference.toJSON()
    };
  }

  const err = decorateWithSessionsData(finalCmd, options.session, options);
  if (err) {
    return callback(err);
  }

  const commandOptions = Object.assign(
    {
      command: true,
      numberToSkip: 0,
      numberToReturn: -1,
      checkKeys: false
    },
    options
  );

  // This value is not overridable
  commandOptions.slaveOk = readPreference.slaveOk();

  const cmdNs = `${databaseNamespace(ns)}.$cmd`;
  const message = shouldUseOpMsg
    ? new Msg(bson, cmdNs, finalCmd, commandOptions)
    : new Query(bson, cmdNs, finalCmd, commandOptions);

  const commandResponseHandler = function(err) {
    if (
      options.session &&
      options.session.transaction &&
      err &&
      err instanceof MongoError &&
      err.hasErrorLabel('TransientTransactionError')
    ) {
      options.session.transaction.unpinServer();
    }

    return callback.apply(null, arguments);
  };

  try {
    pool.write(message, commandOptions, commandResponseHandler);
  } catch (err) {
    callback(commandResponseHandler);
  }
}

function supportsOpMsg(topologyOrServer) {
  const description = topologyOrServer.ismaster
    ? topologyOrServer.ismaster
    : topologyOrServer.description;

  if (description == null) {
    return false;
  }

  return description.maxWireVersion >= 6 && description.__nodejs_mock_server__ == null;
}

function isTransactionCommand(command) {
  return !!(command.commitTransaction || command.abortTransaction);
}

/**
 * Optionally decorate a command with sessions specific keys
 *
 * @param {Object} command the command to decorate
 * @param {ClientSession} session the session tracking transaction state
 * @param {Object} [options] Optional settings passed to calling operation
 * @return {MongoError|null} An error, if some error condition was met
 */
function decorateWithSessionsData(command, session, options) {
  if (!session) {
    return;
  }

  // first apply non-transaction-specific sessions data
  const serverSession = session.serverSession;
  const inTransaction = session.inTransaction() || isTransactionCommand(command);
  const isRetryableWrite = options.willRetryWrite;

  if (serverSession.txnNumber && (isRetryableWrite || inTransaction)) {
    command.txnNumber = BSON.Long.fromNumber(serverSession.txnNumber);
  }

  // now attempt to apply transaction-specific sessions data
  if (!inTransaction) {
    if (session.transaction.state !== TxnState.NO_TRANSACTION) {
      session.transaction.transition(TxnState.NO_TRANSACTION);
    }

    // for causal consistency
    if (session.supports.causalConsistency && session.operationTime) {
      command.readConcern = command.readConcern || {};
      Object.assign(command.readConcern, { afterClusterTime: session.operationTime });
    }

    return;
  }

  if (options.readPreference && !options.readPreference.equals(ReadPreference.primary)) {
    return new MongoError(
      `Read preference in a transaction must be primary, not: ${options.readPreference.mode}`
    );
  }

  // `autocommit` must always be false to differentiate from retryable writes
  command.autocommit = false;

  if (session.transaction.state === TxnState.STARTING_TRANSACTION) {
    session.transaction.transition(TxnState.TRANSACTION_IN_PROGRESS);
    command.startTransaction = true;

    const readConcern =
      session.transaction.options.readConcern || session.clientOptions.readConcern;
    if (readConcern) {
      command.readConcern = readConcern;
    }

    if (session.supports.causalConsistency && session.operationTime) {
      command.readConcern = command.readConcern || {};
      Object.assign(command.readConcern, { afterClusterTime: session.operationTime });
    }
  }
}

module.exports = command;
