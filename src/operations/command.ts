import { Aspect, AbstractOperation, OperationOptions } from './operation';
import { ReadConcern } from '../read_concern';
import { WriteConcern, WriteConcernOptions } from '../write_concern';
import { maxWireVersion, MongoDBNamespace, Callback, decorateWithExplain } from '../utils';
import type { ReadPreference } from '../read_preference';
import { ClientSession, commandSupportsReadConcern } from '../sessions';
import { MongoInvalidArgumentError, MongoCompatibilityError } from '../error';
import type { Logger } from '../logger';
import type { Server } from '../sdam/server';
import type { BSONSerializeOptions, Document } from '../bson';
import type { ReadConcernLike } from './../read_concern';
import { Explain, ExplainOptions } from '../explain';
import { MIN_SECONDARY_WRITE_WIRE_VERSION } from '../sdam/server_selection';

const SUPPORTS_WRITE_CONCERN_AND_COLLATION = 5;

/** @public */
export interface CollationOptions {
  locale: string;
  caseLevel?: boolean;
  caseFirst?: string;
  strength?: number;
  numericOrdering?: boolean;
  alternate?: string;
  maxVariable?: string;
  backwards?: boolean;
  normalization?: boolean;
}

/** @public */
export interface CommandOperationOptions
  extends OperationOptions,
    WriteConcernOptions,
    ExplainOptions {
  /** @deprecated This option does nothing */
  fullResponse?: boolean;
  /** Specify a read concern and level for the collection. (only MongoDB 3.2 or higher supported) */
  readConcern?: ReadConcernLike;
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

/** @internal */
export interface OperationParent {
  s: { namespace: MongoDBNamespace };
  readConcern?: ReadConcern;
  writeConcern?: WriteConcern;
  readPreference?: ReadPreference;
  logger?: Logger;
  bsonOptions?: BSONSerializeOptions;
}

/** @internal */
export abstract class CommandOperation<T> extends AbstractOperation<T> {
  options: CommandOperationOptions;
  ns: MongoDBNamespace;
  readConcern?: ReadConcern;
  writeConcern?: WriteConcern;
  explain?: Explain;
  logger?: Logger;

  constructor(parent?: OperationParent, options?: CommandOperationOptions) {
    super(options);
    this.options = options ?? {};

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

    this.readConcern = ReadConcern.fromOptions(options);
    this.writeConcern = WriteConcern.fromOptions(options);

    // TODO(NODE-2056): make logger another "inheritable" property
    if (parent && parent.logger) {
      this.logger = parent.logger;
    }

    if (this.hasAspect(Aspect.EXPLAINABLE)) {
      this.explain = Explain.fromOptions(options);
    } else if (options?.explain != null) {
      throw new MongoInvalidArgumentError(`Option "explain" is not supported on this command`);
    }
  }

  get canRetryWrite(): boolean {
    if (this.hasAspect(Aspect.EXPLAINABLE)) {
      return this.explain == null;
    }
    return true;
  }

  abstract execute(server: Server, session: ClientSession, callback: Callback<T>): void;

  executeCommand(server: Server, session: ClientSession, cmd: Document, callback: Callback): void {
    // TODO: consider making this a non-enumerable property
    this.server = server;

    const options = {
      ...this.options,
      ...this.bsonOptions,
      readPreference: this.readPreference,
      session
    };

    const serverWireVersion = maxWireVersion(server);
    const inTransaction = this.session && this.session.inTransaction();

    if (this.readConcern && commandSupportsReadConcern(cmd) && !inTransaction) {
      Object.assign(cmd, { readConcern: this.readConcern });
    }

    if (this.trySecondaryWrite && serverWireVersion < MIN_SECONDARY_WRITE_WIRE_VERSION) {
      options.omitReadPreference = true;
    }

    if (options.collation && serverWireVersion < SUPPORTS_WRITE_CONCERN_AND_COLLATION) {
      callback(
        new MongoCompatibilityError(
          `Server ${server.name}, which reports wire version ${serverWireVersion}, does not support collation`
        )
      );
      return;
    }

    if (this.writeConcern && this.hasAspect(Aspect.WRITE_OPERATION) && !inTransaction) {
      Object.assign(cmd, { writeConcern: this.writeConcern });
    }

    if (serverWireVersion >= SUPPORTS_WRITE_CONCERN_AND_COLLATION) {
      if (
        options.collation &&
        typeof options.collation === 'object' &&
        !this.hasAspect(Aspect.SKIP_COLLATION)
      ) {
        Object.assign(cmd, { collation: options.collation });
      }
    }

    if (typeof options.maxTimeMS === 'number') {
      cmd.maxTimeMS = options.maxTimeMS;
    }

    if (typeof options.comment === 'string') {
      cmd.comment = options.comment;
    }

    if (this.hasAspect(Aspect.EXPLAINABLE) && this.explain) {
      if (serverWireVersion < 6 && cmd.aggregate) {
        // Prior to 3.6, with aggregate, verbosity is ignored, and we must pass in "explain: true"
        cmd.explain = true;
      } else {
        cmd = decorateWithExplain(cmd, this.explain);
      }
    }

    server.command(this.ns, cmd, options, callback);
  }
}
