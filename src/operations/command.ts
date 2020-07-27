import { Aspect, OperationBase } from './operation';
import ReadConcern = require('../read_concern');
import { WriteConcern } from '../write_concern';
import { maxWireVersion, MongoDBNamespace } from '../utils';
import { ReadPreference } from '../read_preference';
import { commandSupportsReadConcern } from '../sessions';
import { MongoError } from '../error';
import Logger = require('../logger');

import type { Server } from '../sdam/server';

const SUPPORTS_WRITE_CONCERN_AND_COLLATION = 5;

interface CommandOperationOptions {
  dbName?: string;
  authdb?: string;
  fullResponse?: boolean;
}

class CommandOperation extends OperationBase {
  ns: MongoDBNamespace;
  readPreference: ReadPreference;
  readConcern?: ReadConcern;
  writeConcern?: WriteConcern;
  explain: boolean;
  fullResponse?: boolean;
  logger?: Logger;
  server?: Server;

  /**
   * @param {any} parent
   * @param {any} [options]
   * @param {any} [operationOptions]
   */
  constructor(parent: any, options?: any, operationOptions?: CommandOperationOptions) {
    super(options);

    // NOTE: this was explicitly added for the add/remove user operations, it's likely
    //       something we'd want to reconsider. Perhaps those commands can use `Admin`
    //       as a parent?
    const dbNameOverride = options?.dbName || options?.authdb;
    this.ns = dbNameOverride
      ? new MongoDBNamespace(dbNameOverride, '$cmd')
      : parent.s.namespace.withCollection('$cmd');

    const propertyProvider = this.hasAspect(Aspect.NO_INHERIT_OPTIONS) ? undefined : parent;
    this.readPreference = this.hasAspect(Aspect.WRITE_OPERATION)
      ? ReadPreference.primary
      : ReadPreference.resolve(propertyProvider, this.options);
    this.readConcern = resolveReadConcern(propertyProvider, this.options);
    this.writeConcern = resolveWriteConcern(propertyProvider, this.options);
    this.explain = false;

    if (operationOptions && typeof operationOptions.fullResponse === 'boolean') {
      this.fullResponse = true;
    }

    // TODO: A lot of our code depends on having the read preference in the options. This should
    //       go away, but also requires massive test rewrites.
    this.options.readPreference = this.readPreference;

    // TODO(NODE-2056): make logger another "inheritable" property
    if (parent.s.logger) {
      this.logger = parent.s.logger;
    } else if (parent.s.db && parent.s.db.logger) {
      this.logger = parent.s.db.logger;
    }
  }

  executeCommand(server: any, cmd: any, callback: Function) {
    // TODO: consider making this a non-enumerable property
    this.server = server;

    const options = this.options;
    const serverWireVersion = maxWireVersion(server);
    const inTransaction = this.session && this.session.inTransaction();

    if (this.readConcern && commandSupportsReadConcern(cmd) && !inTransaction) {
      Object.assign(cmd, { readConcern: this.readConcern });
    }

    if (options.collation && serverWireVersion < SUPPORTS_WRITE_CONCERN_AND_COLLATION) {
      callback(
        new MongoError(
          `Server ${server.name}, which reports wire version ${serverWireVersion}, does not support collation`
        )
      );
      return;
    }

    if (serverWireVersion >= SUPPORTS_WRITE_CONCERN_AND_COLLATION) {
      if (this.writeConcern && this.hasAspect(Aspect.WRITE_OPERATION) && !inTransaction) {
        Object.assign(cmd, { writeConcern: this.writeConcern });
      }

      if (options.collation && typeof options.collation === 'object') {
        Object.assign(cmd, { collation: options.collation });
      }
    }

    if (typeof options.maxTimeMS === 'number') {
      cmd.maxTimeMS = options.maxTimeMS;
    }

    if (typeof options.comment === 'string') {
      cmd.comment = options.comment;
    }

    if (this.logger && this.logger.isDebug()) {
      this.logger.debug(`executing command ${JSON.stringify(cmd)} against ${this.ns}`);
    }

    server.command(this.ns.toString(), cmd, this.options, (err?: any, result?: any) => {
      if (err) {
        callback(err, null);
        return;
      }

      if (this.fullResponse) {
        callback(null, result);
        return;
      }

      callback(null, result.result);
    });
  }
}

function resolveWriteConcern(parent: any, options: any) {
  return WriteConcern.fromOptions(options) || (parent && parent.writeConcern);
}

function resolveReadConcern(parent: any, options: any) {
  return ReadConcern.fromOptions(options) || (parent && parent.readConcern);
}

export = CommandOperation;
