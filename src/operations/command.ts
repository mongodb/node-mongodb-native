import { Aspect, OperationBase, OperationOptions } from './operation';
import { ReadConcern } from '../read_concern';
import { WriteConcern, WriteConcernOptions } from '../write_concern';
import { maxWireVersion, MongoDBNamespace, Callback, deepFreeze } from '../utils';
import { ReadPreference, ReadPreferenceLike } from '../read_preference';
import { commandSupportsReadConcern } from '../sessions';
import { MongoError } from '../error';
import type { Logger } from '../logger';
import type { Server } from '../sdam/server';
import { BSONSerializeOptions, Document, resolveBSONOptions } from '../bson';
import type { CollationOptions } from '../cmap/wire_protocol/write_command';
import type { ReadConcernLike } from './../read_concern';

const SUPPORTS_WRITE_CONCERN_AND_COLLATION = 5;

/** @public */
export interface CommandOperationOptions extends OperationOptions, WriteConcernOptions {
  /** Return the full server response for the command */
  fullResponse?: boolean;
  /** Specify a read concern and level for the collection. (only MongoDB 3.2 or higher supported) */
  readConcern?: ReadConcernLike;
  /** The preferred read preference (ReadPreference.primary, ReadPreference.primary_preferred, ReadPreference.secondary, ReadPreference.secondary_preferred, ReadPreference.nearest). */
  readPreference?: ReadPreferenceLike;
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
  noResponse?: boolean;
}

export interface OperationParentPrivate extends BSONSerializeOptions {
  options?: BSONSerializeOptions;
  namespace: MongoDBNamespace;
}

/** @internal */
export interface OperationParent {
  s: OperationParentPrivate;
  readConcern?: ReadConcern;
  writeConcern?: WriteConcern;
  readPreference?: ReadPreference;
  logger?: Logger;
  bsonOptions?: BSONSerializeOptions;
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
  fullResponse?: boolean;
  logger?: Logger;

  protected collation;
  protected maxTimeMS;
  protected comment;
  protected retryWrites;
  protected noResponse;

  get builtOptions(): Readonly<CommandOperationOptions> {
    return deepFreeze({
      ...super.builtOptions,
      collation: this.collation,
      maxTimeMS: this.maxTimeMS,
      comment: this.comment,
      retryWrites: this.retryWrites,
      noResponse: this.noResponse,
      fullResponse: this.fullResponse
      // Override with proper type
      // writeConcern: this.writeConcern,
      // readConcern: this.readConcern
    });
  }

  constructor(parent?: OperationParent, options?: T) {
    super(options);

    // NOTE: this was explicitly added for the add/remove user operations, it's likely
    //       something we'd want to reconsider. Perhaps those commands can use `Admin`
    //       as a parent?
    const dbNameOverride = options?.dbName || options?.authdb;
    if (dbNameOverride) {
      this.ns = new MongoDBNamespace(dbNameOverride, '$cmd');
    } else {
      this.ns = parent
        ? parent.s.namespace.withCollection('$cmd')
        : new MongoDBNamespace('admin', '$cmd');
    }

    const propertyProvider = this.hasAspect(Aspect.NO_INHERIT_OPTIONS) ? undefined : parent;
    this.readPreference = this.hasAspect(Aspect.WRITE_OPERATION)
      ? ReadPreference.primary
      : ReadPreference.resolve(propertyProvider, options);
    this.readConcern = resolveReadConcern(propertyProvider, options);
    this.writeConcern = resolveWriteConcern(propertyProvider, options);
    this.explain = false;
    this.fullResponse =
      options && typeof options.fullResponse === 'boolean' ? options.fullResponse : false;

    // if (this.writeConcern && this.writeConcern.w === 0) {
    //   if (this.session && this.session.explicit) {
    //     throw new MongoError('Cannot have explicit session with unacknowledged writes');
    //   }
    //   return;
    // }

    // TODO: A lot of our code depends on having the read preference in the options. This should
    //       go away, but also requires massive test rewrites.
    this.options.readPreference = this.readPreference;

    this.collation = options?.collation;
    this.maxTimeMS = options?.maxTimeMS;
    this.comment = options?.comment;
    this.retryWrites = options?.retryWrites;
    this.noResponse = options?.noResponse;

    // TODO(NODE-2056): make logger another "inheritable" property
    if (parent && parent.logger) {
      this.logger = parent.logger;
    }

    // Assign BSON serialize options to OperationBase, preferring options over parent options.
    this.bsonOptions = resolveBSONOptions(options, parent);
  }

  abstract execute(server: Server, callback: Callback<TResult>): void;

  executeCommand(server: Server, cmd: Document, callback: Callback): void {
    // TODO: consider making this a non-enumerable property
    this.server = server;

    const serverWireVersion = maxWireVersion(server);
    const inTransaction = this.session && this.session.inTransaction();

    if (this.readConcern && commandSupportsReadConcern(cmd) && !inTransaction) {
      Object.assign(cmd, { readConcern: this.readConcern });
    }

    if (this.builtOptions.collation && serverWireVersion < SUPPORTS_WRITE_CONCERN_AND_COLLATION) {
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

      if (this.builtOptions.collation && typeof this.builtOptions.collation === 'object') {
        Object.assign(cmd, { collation: this.builtOptions.collation });
      }
    }

    if (typeof this.builtOptions.maxTimeMS === 'number') {
      cmd.maxTimeMS = this.builtOptions.maxTimeMS;
    }

    if (typeof this.builtOptions.comment === 'string') {
      cmd.comment = this.builtOptions.comment;
    }

    if (this.logger && this.logger.isDebug()) {
      this.logger.debug(`executing command ${JSON.stringify(cmd)} against ${this.ns}`);
    }

    server.command(
      this.ns.toString(),
      cmd,
      { fullResult: !!this.fullResponse, ...this.builtOptions },
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
