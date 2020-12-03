import { Aspect, defineAspects } from './operation';
import { CommandOperation, CommandOperationOptions } from './command';
import type { Callback } from '../utils';
import type { Document } from '../bson';
import type { Server } from '../sdam/server';
import type { Collection } from '../collection';
import type { Db } from '../db';
import type { ClientSession } from '../sessions';

/** @public */
export interface CollStatsOptions extends CommandOperationOptions {
  /** Divide the returned sizes by scale value. */
  scale?: number;
}

/**
 * Get all the collection statistics.
 * @internal
 */
export class CollStatsOperation extends CommandOperation<Document> {
  options: CollStatsOptions;
  collectionName: string;

  /**
   * Construct a Stats operation.
   *
   * @param collection - Collection instance
   * @param options - Optional settings. See Collection.prototype.stats for a list of options.
   */
  constructor(collection: Collection, options?: CollStatsOptions) {
    super(collection, options);
    this.options = options ?? {};
    this.collectionName = collection.collectionName;
  }

  execute(server: Server, session: ClientSession, callback: Callback<Document>): void {
    const command: Document = { collStats: this.collectionName };
    if (this.options.scale != null) {
      command.scale = this.options.scale;
    }

    super.executeCommand(server, session, command, callback);
  }
}

/** @public */
export interface DbStatsOptions extends CommandOperationOptions {
  /** Divide the returned sizes by scale value. */
  scale?: number;
}

/** @internal */
export class DbStatsOperation extends CommandOperation<Document> {
  options: DbStatsOptions;

  constructor(db: Db, options: DbStatsOptions) {
    super(db, options);
    this.options = options;
  }

  execute(server: Server, session: ClientSession, callback: Callback<Document>): void {
    const command: Document = { dbStats: true };
    if (this.options.scale != null) {
      command.scale = this.options.scale;
    }

    super.executeCommand(server, session, command, callback);
  }
}

defineAspects(CollStatsOperation, [Aspect.READ_OPERATION]);
defineAspects(DbStatsOperation, [Aspect.READ_OPERATION]);
