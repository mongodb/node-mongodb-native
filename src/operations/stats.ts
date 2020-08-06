import { Aspect, defineAspects } from './operation';
import { CommandOperation, CommandOpOptions } from './command';
import type { Callback, Document } from '../types';
import type { Server } from '../sdam/server';
import type { Collection } from '../collection';

export interface CollStatsOptions extends CommandOpOptions {
  /** Divide the returned sizes by scale value. */
  scale?: number;
}

/**
 * Get all the collection statistics.
 *
 * @class
 * @property {Collection} collection Collection instance.
 * @property {object} [options] Optional settings. See Collection.prototype.stats for a list of options.
 */
export class CollStatsOperation extends CommandOperation<CollStatsOptions> {
  collectionName: string;

  /**
   * Construct a Stats operation.
   *
   * @param {Collection} collection Collection instance
   * @param {object} [options] Optional settings. See Collection.prototype.stats for a list of options.
   */
  constructor(collection: Collection, options?: CollStatsOptions) {
    super(collection, options);
    this.collectionName = collection.collectionName;
  }

  execute(server: Server, callback: Callback<Document>): void {
    const command: Document = { collStats: this.collectionName };
    if (this.options.scale != null) {
      command.scale = this.options.scale;
    }

    super.executeCommand(server, command, callback);
  }
}

export interface DbStatsOptions extends CommandOperationOptions {
  /** Divide the returned sizes by scale value. */
  scale?: number;
}

export class DbStatsOperation extends CommandOperation<DbStatsOptions> {
  execute(server: Server, callback: Callback<Document>): void {
    const command: Document = { dbStats: true };
    if (this.options.scale != null) {
      command.scale = this.options.scale;
    }

    super.executeCommand(server, command, callback);
  }
}

defineAspects(CollStatsOperation, [Aspect.READ_OPERATION, Aspect.EXECUTE_WITH_SELECTION]);
defineAspects(DbStatsOperation, [Aspect.READ_OPERATION, Aspect.EXECUTE_WITH_SELECTION]);
