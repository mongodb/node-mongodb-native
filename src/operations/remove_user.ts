import type { Db } from '../db';
import type { Server } from '../sdam/server';
import type { ClientSession } from '../sessions';
import { type Callback } from '../utils';
import { CommandOperation, type CommandOperationOptions } from './command';
import { Aspect, defineAspects } from './operation';

/** @public */
export type RemoveUserOptions = CommandOperationOptions;

/** @internal */
export class RemoveUserOperation extends CommandOperation<boolean> {
  override options: RemoveUserOptions;
  username: string;

  constructor(db: Db, username: string, options: RemoveUserOptions) {
    super(db, options);
    this.options = options;
    this.username = username;
  }

  override async execute(server: Server, session: ClientSession | undefined): Promise<boolean> {
    await super.executeCommand(server, session, { dropUser: this.username });
    return true;
  }

  protected executeCallback(
    _server: Server,
    _session: ClientSession | undefined,
    _callback: Callback<boolean>
  ): void {
    throw new Error('Method not implemented.');
  }
}

defineAspects(RemoveUserOperation, [Aspect.WRITE_OPERATION]);
