import { type Abortable } from '..';
import type { BSONSerializeOptions, Document } from '../bson';
import { type Connection } from '../cmap/connection';
import {
  CursorResponse,
  MongoDBResponse,
  type MongoDBResponseConstructor
} from '../cmap/wire_protocol/responses';
import { type Db } from '../db';
import type { ReadPreferenceLike } from '../read_preference';
import type { ServerCommandOptions } from '../sdam/server';
import type { ClientSession } from '../sessions';
import { type TimeoutContext } from '../timeout';
import { MongoDBNamespace } from '../utils';
import { type WriteConcern } from '../write_concern';
import { ModernizedCommandOperation } from './command';

/** @public */
export type RunCommandOptions = {
  /** Specify ClientSession for this command */
  session?: ClientSession;
  /** The read preference */
  readPreference?: ReadPreferenceLike;
  /**
   * @experimental
   * Specifies the time an operation will run until it throws a timeout error
   */
  timeoutMS?: number;
  /** @internal */
  omitMaxTimeMS?: boolean;
} & BSONSerializeOptions &
  Abortable;

/** @internal */
export class RunCommandOperation<T = Document> extends ModernizedCommandOperation<T> {
  override SERVER_COMMAND_RESPONSE_TYPE = MongoDBResponse;
  command: Document;
  override options: RunCommandOptions & { responseType?: MongoDBResponseConstructor };

  constructor(
    parent: Db,
    command: Document,
    options: RunCommandOptions & { responseType?: MongoDBResponseConstructor }
  ) {
    super(undefined, options);
    this.command = command;
    this.options = options;
    this.ns = parent.s.namespace.withCollection('$cmd');
  }

  override get commandName() {
    return 'runCommand' as const;
  }

  override buildCommandDocument(_connection: Connection, _session?: ClientSession): Document {
    return this.command;
  }

  override buildOptions(timeoutContext: TimeoutContext): ServerCommandOptions {
    return {
      session: this.session,
      timeoutContext,
      signal: this.options.signal,
      readPreference: this.options.readPreference
    };
  }
}

/**
 * @internal
 *
 * A specialized subclass of RunCommandOperation for cursor-creating commands.
 */
export class RunCursorCommandOperation extends RunCommandOperation {
  override SERVER_COMMAND_RESPONSE_TYPE = CursorResponse;

  override handleOk(
    response: InstanceType<typeof this.SERVER_COMMAND_RESPONSE_TYPE>
  ): CursorResponse {
    return response;
  }
}

export class RunAdminCommandOperation<T = Document> extends ModernizedCommandOperation<T> {
  override SERVER_COMMAND_RESPONSE_TYPE = MongoDBResponse;
  command: Document;
  override options: RunCommandOptions & {
    writeConcern?: WriteConcern;
    bypassPinningCheck?: boolean;
    noResponse?: boolean;
  };

  constructor(
    command: Document,
    options: RunCommandOptions & {
      writeConcern?: WriteConcern;
      bypassPinningCheck?: boolean;
      noResponse?: boolean;
    }
  ) {
    super(undefined, options);
    this.command = command;
    this.options = options;
    this.ns = new MongoDBNamespace('admin', '$cmd');
  }

  override get commandName() {
    return 'runCommand' as const;
  }

  override buildCommandDocument(_connection: Connection, _session?: ClientSession): Document {
    return this.command;
  }

  override buildOptions(timeoutContext: TimeoutContext): ServerCommandOptions {
    return { session: this.session, timeoutContext, noResponse: this.options.noResponse };
  }
}
