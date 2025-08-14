import { type Document } from '../bson';
import { type Connection } from '../cmap/connection';
import { MongoDBResponse } from '../cmap/wire_protocol/responses';
import type { Db } from '../db';
import { type CommandOperationOptions, ModernizedCommandOperation } from './command';
import { Aspect, defineAspects } from './operation';

/** @public */
export type RemoveUserOptions = CommandOperationOptions;

/** @internal */
export class RemoveUserOperation extends ModernizedCommandOperation<boolean> {
  override SERVER_COMMAND_RESPONSE_TYPE = MongoDBResponse;
  override options: RemoveUserOptions;
  username: string;

  constructor(db: Db, username: string, options: RemoveUserOptions) {
    super(db, options);
    this.options = options;
    this.username = username;
  }

  override get commandName() {
    return 'dropUser' as const;
  }

  override buildCommandDocument(_connection: Connection): Document {
    return { dropUser: this.username };
  }

  override handleOk(_response: InstanceType<typeof this.SERVER_COMMAND_RESPONSE_TYPE>): boolean {
    return true;
  }
}

defineAspects(RemoveUserOperation, [Aspect.WRITE_OPERATION]);
