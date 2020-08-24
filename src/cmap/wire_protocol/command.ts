import { Query, Msg, CommandResult } from '../commands';
import { getReadPreference, isSharded } from './shared';
import { isTransactionCommand } from '../../transactions';
import { applySession, ClientSession } from '../../sessions';
import { maxWireVersion, databaseNamespace, Callback } from '../../utils';
import { MongoError, MongoNetworkError } from '../../error';
import type { Document, BSONSerializeOptions } from '../../bson';
import type { Server } from '../../sdam/server';
import type { Topology } from '../../sdam/topology';
import type { ReadPreferenceLike } from '../../read_preference';
import type { WriteConcernOptions, WriteConcern, W } from '../../write_concern';
import type { WriteCommandOptions } from './write_command';

/** @internal */
export interface CommandOptions extends BSONSerializeOptions {
  command?: Document;
  slaveOk?: boolean;
  /** Specify read preference if command supports it */
  readPreference?: ReadPreferenceLike;
  raw?: boolean;
  monitoring?: boolean;
  fullResult?: boolean;
  socketTimeout?: number;
  /** Session to use for the operation */
  session?: ClientSession;
  documentsReturnedIn?: string;
  noResponse?: boolean;

  // NOTE: these are for retryable writes and will be removed soon
  willRetryWrite?: boolean;
  retryWrites?: boolean;
  retrying?: boolean;

  // FIXME: NODE-2781
  writeConcern?: WriteConcernOptions | WriteConcern | W;
}

function isClientEncryptionEnabled(server: Server) {
  const wireVersion = maxWireVersion(server);
  return wireVersion && server.autoEncrypter;
}

export function command(
  server: Server,
  ns: string,
  cmd: Document,
  callback: Callback<CommandResult>
): void;
export function command(
  server: Server,
  ns: string,
  cmd: Document,
  options: CommandOptions,
  callback?: Callback<CommandResult>
): void;
export function command(
  server: Server,
  ns: string,
  cmd: Document,
  _options: Callback | CommandOptions,
  _callback?: Callback<CommandResult>
): void {
  let options = _options as CommandOptions;
  const callback = (_callback ?? _options) as Callback<CommandResult>;
  if ('function' === typeof options) {
    options = {};
  }

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

function _command(
  server: Server,
  ns: string,
  cmd: Document,
  options: CommandOptions | WriteCommandOptions,
  callback: Callback<CommandResult>
) {
  const pool = server.s.pool;
  const readPreference = getReadPreference(cmd, options);
  const shouldUseOpMsg = supportsOpMsg(server);
  const session = options.session;

  let clusterTime = server.clusterTime;
  let finalCmd = Object.assign({}, cmd);
  if (hasSessionSupport(server) && session) {
    if (
      session.clusterTime &&
      clusterTime &&
      session.clusterTime.clusterTime.greaterThan(clusterTime.clusterTime)
    ) {
      clusterTime = session.clusterTime;
    }

    const err = applySession(session, finalCmd, options as WriteCommandOptions);
    if (err) {
      return callback(err);
    }
  }

  // if we have a known cluster time, gossip it
  if (clusterTime) {
    finalCmd.$clusterTime = clusterTime;
  }

  if (isSharded(server) && !shouldUseOpMsg && readPreference && readPreference.mode !== 'primary') {
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
      checkKeys: false
    },
    options
  );

  // This value is not overridable
  commandOptions.slaveOk = readPreference.slaveOk();

  const cmdNs = `${databaseNamespace(ns)}.$cmd`;
  const message = shouldUseOpMsg
    ? new Msg(cmdNs, finalCmd, commandOptions)
    : new Query(cmdNs, finalCmd, commandOptions);

  const inTransaction = session && (session.inTransaction() || isTransactionCommand(finalCmd));
  const commandResponseHandler = inTransaction
    ? (err: MongoError, ...args: CommandResult[]) => {
        // We need to add a TransientTransactionError errorLabel, as stated in the transaction spec.
        if (
          err &&
          err instanceof MongoNetworkError &&
          !err.hasErrorLabel('TransientTransactionError')
        ) {
          err.addErrorLabel('TransientTransactionError');
        }

        if (
          session &&
          !cmd.commitTransaction &&
          err &&
          err instanceof MongoError &&
          err.hasErrorLabel('TransientTransactionError')
        ) {
          session.transaction.unpinServer();
        }

        return callback(err, ...args);
      }
    : callback;

  try {
    pool.write(message, commandOptions, commandResponseHandler);
  } catch (err) {
    commandResponseHandler(err);
  }
}

function hasSessionSupport(server: Server) {
  return server.description.logicalSessionTimeoutMinutes != null;
}

function supportsOpMsg(topologyOrServer: Server | Topology) {
  const description = topologyOrServer.ismaster
    ? topologyOrServer.ismaster
    : topologyOrServer.description;

  if (description == null) {
    return false;
  }

  return description.maxWireVersion >= 6 && !description.__nodejs_mock_server__;
}

function _cryptCommand(
  server: Server,
  ns: string,
  cmd: Document,
  options: CommandOptions,
  callback: Callback
) {
  const autoEncrypter = server.autoEncrypter;
  if (!autoEncrypter) {
    return callback(new MongoError('no AutoEncrypter available for encryption'));
  }

  const commandResponseHandler: Callback<Document> = function (err, response) {
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
      callback(undefined, response);
    });
  };

  autoEncrypter.encrypt(ns, cmd, options, (err, encrypted) => {
    if (err || encrypted == null) {
      callback(err, null);
      return;
    }

    _command(server, ns, encrypted, options, commandResponseHandler);
  });
}
