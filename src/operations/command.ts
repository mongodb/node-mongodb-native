import { Aspect, OperationBase, OperationOptions } from './operation';
import { ReadConcern } from '../read_concern';
import { WriteConcern, WriteConcernOptions } from '../write_concern';
import { maxWireVersion, MongoDBNamespace, Callback } from '../utils';
import { ReadPreference, ReadPreferenceLike } from '../read_preference';
import { commandSupportsReadConcern, ClientSession } from '../sessions';
import { MongoError } from '../error';
import type { Logger } from '../logger';
import type { Server } from '../sdam/server';
import type { Document } from '../bson';
import type { CollationOptions } from '../cmap/wire_protocol/write_command';

const SUPPORTS_WRITE_CONCERN_AND_COLLATION = 5;

/** @public */
export interface CommandOperationOptions extends OperationOptions, WriteConcernOptions {
  fullResponse?: boolean;
  /** Specify a read concern and level for the collection. (only MongoDB 3.2 or higher supported) */
  readConcern?: ReadConcern;
  /** The preferred read preference (ReadPreference.primary, ReadPreference.primary_preferred, ReadPreference.secondary, ReadPreference.secondary_preferred, ReadPreference.nearest). */
  readPreference?: ReadPreferenceLike;
  /** Specify ClientSession for this command */
  session?: ClientSession;
  /** Collation */
  collation?: CollationOptions;
  maxTimeMS?: number;
  /** A user-provided comment to attach to this command */
  comment?: string | Document;
  /** Should retry failed writes */
  retryWrites?: boolean;

  // Admin command overrides.
  dbName?: string;
  authdb?: string;
}

/** @internal */
export interface OperationParent {
  s: { namespace: MongoDBNamespace };
  readConcern?: ReadConcern;
  writeConcern?: WriteConcern;
  readPreference?: ReadPreference;
  logger?: Logger;
}

/** @internal */
export abstract class CommandOperation<
  T extends CommandOperationOptions = CommandOperationOptions,
  TResult = Document
> extends OperationBase<T> {
  ns: MongoDBNamespace;
  readPreference: ReadPreference;
  readConcern?: ReadConcern;
  writeConcern?: WriteConcern;
  explain: boolean;
  fullResponse?: boolean;
  logger?: Logger;

  constructor(parent: OperationParent, options?: T) {
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
    this.fullResponse =
      options && typeof options.fullResponse === 'boolean' ? options.fullResponse : false;

    // TODO: A lot of our code depends on having the read preference in the options. This should
    //       go away, but also requires massive test rewrites.
    this.options.readPreference = this.readPreference;

    // TODO(NODE-2056): make logger another "inheritable" property
    if (parent.logger) {
      this.logger = parent.logger;
    }
  }

  abstract execute(server: Server, callback: Callback<TResult>): void;

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

    server.command(
      this.ns.toString(),
      cmd,
      { fullResult: !!this.fullResponse, ...this.options },
      callback
    );
  }
}

function resolveWriteConcern(parent: OperationParent | undefined, options: any) {
  return WriteConcern.fromOptions(options) || parent?.writeConcern;
}

function resolveReadConcern(parent: OperationParent | undefined, options: any) {
  return ReadConcern.fromOptions(options) || parent?.readConcern;
}
