import type { Document } from '../bson';
import type { Db } from '../db';
import { MONGODB_ERROR_CODES, MongoServerError } from '../error';
import type { Server } from '../sdam/server';
import type { ClientSession } from '../sessions';
import { type TimeoutContext } from '../timeout';
import { CommandOperation, type CommandOperationOptions } from './command';
import { Aspect, defineAspects } from './operation';

/** @public */
export interface DropCollectionOptions extends CommandOperationOptions {
  /** @experimental */
  encryptedFields?: Document;
}

/** @internal */
export class DropCollectionOperation extends CommandOperation<boolean> {
  override options: DropCollectionOptions;
  db: Db;
  name: string;

  constructor(db: Db, name: string, options: DropCollectionOptions = {}) {
    super(db, options);
    this.db = db;
    this.options = options;
    this.name = name;
  }

  override get commandName() {
    return 'drop' as const;
  }

  override async execute(
    server: Server,
    session: ClientSession | undefined,
    timeoutContext: TimeoutContext
  ): Promise<boolean> {
    await super.executeCommand(server, session, { drop: this.name }, timeoutContext);
    return true;
  }
}

/** @public */
export type DropDatabaseOptions = CommandOperationOptions;

/** @internal */
export class DropDatabaseOperation extends CommandOperation<boolean> {
  override options: DropDatabaseOptions;

  constructor(db: Db, options: DropDatabaseOptions) {
    super(db, options);
    this.options = options;
  }
  override get commandName() {
    return 'dropDatabase' as const;
  }

  override async execute(
    server: Server,
    session: ClientSession | undefined,
    timeoutContext: TimeoutContext
  ): Promise<boolean> {
    await super.executeCommand(server, session, { dropDatabase: 1 }, timeoutContext);
    return true;
  }
}

defineAspects(DropCollectionOperation, [Aspect.WRITE_OPERATION]);
defineAspects(DropDatabaseOperation, [Aspect.WRITE_OPERATION]);
