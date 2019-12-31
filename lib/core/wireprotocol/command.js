'use strict';

const Query = require('../connection/commands').Query;
const Msg = require('../connection/msg').Msg;
const MongoError = require('../error').MongoError;
const getReadPreference = require('./shared').getReadPreference;
const isSharded = require('./shared').isSharded;
const databaseNamespace = require('./shared').databaseNamespace;
const isTransactionCommand = require('../transactions').isTransactionCommand;
const applySession = require('../sessions').applySession;
const MongoNetworkError = require('../error').MongoNetworkError;
const maxWireVersion = require('../utils').maxWireVersion;

function isClientEncryptionEnabled(server) {
  const wireVersion = maxWireVersion(server);
  return wireVersion && server.autoEncrypter;
}

function command(server, ns, cmd, options, callback) {
  if (typeof options === 'function') (callback = options), (options = {});
  options = options || {};

  if (cmd == null) {
    return callback(new MongoError(`command ${JSON.stringify(cmd)} does not return a cursor`));
  }

  if (!isClientEncryptionEnabled(server)) {
    _command(server, ns, cmd, options, callback);
    return;
  }

  const wireVersion = maxWireVersion(server);
  if (typeof wireVersion !== 'number' || wireVersion < 8) {
    callback(new MongoError('Auto-encryption requires a minimum MongoDB version of 4.2'));
    return;
  }

  _cryptCommand(server, ns, cmd, options, callback);
}

function _command(server, ns, cmd, options, callback) {
  const bson = server.s.bson;
  const pool = server.s.pool;
  const readPreference = getReadPreference(cmd, options);
  const shouldUseOpMsg = supportsOpMsg(server);
  const session = options.session;

  let clusterTime = server.clusterTime;
  let finalCmd = Object.assign({}, cmd);
  if (hasSessionSupport(server) && session) {
    if (
      session.clusterTime &&
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

  const inTransaction = session && (session.inTransaction() || isTransactionCommand(finalCmd));
  const commandResponseHandler = inTransaction
    ? function(err) {
        // We need to add a TransientTransactionError errorLabel, as stated in the transaction spec.
        if (
          err &&
          err instanceof MongoNetworkError &&
          !err.hasErrorLabel('TransientTransactionError')
        ) {
          if (err.errorLabels == null) {
            err.errorLabels = [];
          }
          err.errorLabels.push('TransientTransactionError');
        }

        if (
          !cmd.commitTransaction &&
          err &&
          err instanceof MongoError &&
          err.hasErrorLabel('TransientTransactionError')
        ) {
          session.transaction.unpinServer();
        }

        return callback.apply(null, arguments);
      }
    : callback;

  try {
    pool.write(message, commandOptions, commandResponseHandler);
  } catch (err) {
    commandResponseHandler(err);
  }
}

function hasSessionSupport(topology) {
  if (topology == null) return false;
  if (topology.description) {
    return topology.description.maxWireVersion >= 6;
  }

  return topology.ismaster == null ? false : topology.ismaster.maxWireVersion >= 6;
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

function _cryptCommand(server, ns, cmd, options, callback) {
  const autoEncrypter = server.autoEncrypter;
  function commandResponseHandler(err, response) {
    if (err || response == null) {
      callback(err, response);
      return;
    }

    autoEncrypter.decrypt(response.result, options, (err, decrypted) => {
      if (err) {
        callback(err, null);
        return;
      }

      response.result = decrypted;
      response.message.documents = [decrypted];
      callback(null, response);
    });
  }

  autoEncrypter.encrypt(ns, cmd, options, (err, encrypted) => {
    if (err) {
      callback(err, null);
      return;
    }

    _command(server, ns, encrypted, options, commandResponseHandler);
  });
}

module.exports = command;
