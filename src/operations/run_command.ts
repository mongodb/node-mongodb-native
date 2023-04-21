import type { BSONSerializeOptions, Document } from '../bson';
import type { ReadPreferenceLike } from '../read_preference';
import type { Server } from '../sdam/server';
import type { ClientSession } from '../sessions';
import { Callback, MongoDBNamespace } from '../utils';
import { CommandOperation, OperationParent } from './command';

/** @public */
export type RunCommandOptions = {
  ///// OperationOptions
  /** Specify ClientSession for this command */
  session?: ClientSession;
  /** The preferred read preference (ReadPreference.primary, ReadPreference.primary_preferred, ReadPreference.secondary, ReadPreference.secondary_preferred, ReadPreference.nearest). */
  readPreference?: ReadPreferenceLike;

  /// The following options were "accidentally" supported
  /// Since the option

  /** @deprecated This is an internal option that has undefined behavior for this API */
  willRetryWrite?: any;
  /** @deprecated This is an internal option that has undefined behavior for this API */
  omitReadPreference?: any;
  /** @deprecated This is an internal option that has undefined behavior for this API */
  writeConcern?: any;
  /** @deprecated This is an internal option that has undefined behavior for this API */
  explain?: any;
  /** @deprecated This is an internal option that has undefined behavior for this API */
  readConcern?: any;
  /** @deprecated This is an internal option that has undefined behavior for this API */
  collation?: any;
  /** @deprecated This is an internal option that has undefined behavior for this API */
  maxTimeMS?: any;
  /** @deprecated This is an internal option that has undefined behavior for this API */
  comment?: any;
  /** @deprecated This is an internal option that has undefined behavior for this API */
  retryWrites?: any;
  /** @deprecated This is an internal option that has undefined behavior for this API */
  dbName?: any;
  /** @deprecated This is an internal option that has undefined behavior for this API */
  authdb?: any;
  /** @deprecated This is an internal option that has undefined behavior for this API */
  noResponse?: any;
} & BSONSerializeOptions;

/** @internal */
export class RunCommandOperation<T = Document> extends CommandOperation<T> {
  override options: RunCommandOptions;
  command: Document;

  constructor(parent: OperationParent | undefined, command: Document, options?: RunCommandOptions) {
    super(parent, options);
    this.options = options ?? {};
    this.command = command;
  }

  override execute(
    server: Server,
    session: ClientSession | undefined,
    callback: Callback<T>
  ): void {
    const command = this.command;
    this.executeCommand(server, session, command, callback);
  }
}

export class RunAdminCommandOperation<T = Document> extends RunCommandOperation<T> {
  constructor(parent: OperationParent | undefined, command: Document, options?: RunCommandOptions) {
    super(parent, command, options);
    this.ns = new MongoDBNamespace('admin');
  }
}
