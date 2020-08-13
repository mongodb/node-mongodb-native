import { Aspect, OperationBase, OperationOptions } from './operation';
import { ReadConcern } from '../read_concern';
import { WriteConcern } from '../write_concern';
import { maxWireVersion, MongoDBNamespace } from '../utils';
import { ReadPreference } from '../read_preference';
import { commandSupportsReadConcern, ClientSession } from '../sessions';
import { MongoError } from '../error';
import type { Logger } from '../logger';

import type { Server } from '../sdam/server';
import type { Callback, Document } from '../types';
import type { Collection } from '../collection';
import type { Db } from '../db';
import type { MongoClient } from '../mongo_client';
import type { CommandOptions } from '../cmap/wire_protocol/command';
import type { CollationOptions } from '../cmap/wire_protocol/write_command';

const SUPPORTS_WRITE_CONCERN_AND_COLLATION = 5;

export interface CommandOperationOptions extends OperationOptions {
  fullResponse?: boolean;
  /** Specify a read concern and level for the collection. (only MongoDB 3.2 or higher supported) */
  readConcern?: ReadConcern;
  /** The preferred read preference (ReadPreference.primary, ReadPreference.primary_preferred, ReadPreference.secondary, ReadPreference.secondary_preferred, ReadPreference.nearest). */
  readPreference?: ReadPreference;
  /** Specify ClientSession for this command */
  session?: ClientSession;
  /** WriteConcern for this command */
  writeConcern?: WriteConcern;
  /** Collation */
  collation?: CollationOptions;
  maxTimeMS?: number;
  /** A user-provided comment to attach to this command */
  comment?: string | Document;

  // Admin command overrides.
  dbName?: string;
  authdb?: string;
}

export type Parent = MongoClient | Db | Collection | { s: any };

export class CommandOperation<
  T extends CommandOperationOptions = CommandOperationOptions
> extends OperationBase<T> {
  ns: MongoDBNamespace;
  readPreference: ReadPreference;
  readConcern?: ReadConcern;
  writeConcern?: WriteConcern;
  explain: boolean;
  fullResponse?: boolean;
  logger?: Logger;

  constructor(parent: Parent, options?: T) {
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

    if (options && typeof options.fullResponse === 'boolean') {
      this.fullResponse = options.fullResponse;
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

  executeCommand(server: Server, cmd: Document, callback: Callback): void {
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

    server.command(this.ns.toString(), cmd, this.options as CommandOptions, (err, result) => {
      if (err) {
        callback(err, null);
        return;
      }

      if (this.fullResponse) {
        callback(undefined, result);
        return;
      }

      callback(undefined, result.result);
    });
  }
}

function resolveWriteConcern(parent: Parent | undefined, options: any) {
  return (
    WriteConcern.fromOptions(options) || (parent && 'writeConcern' in parent && parent.writeConcern)
  );
}

function resolveReadConcern(parent: Parent | undefined, options: any) {
  return (
    ReadConcern.fromOptions(options) || (parent && 'readConcern' in parent && parent.readConcern)
  );
}
