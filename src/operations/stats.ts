import { Aspect, defineAspects } from './operation';
import { CommandOperation, CommandOperationOptions } from './command';
import type { Callback } from '../utils';
import type { Document } from '../bson';
import type { Server } from '../sdam/server';
import type { Collection } from '../collection';

export interface CollStatsOptions extends CommandOperationOptions {
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
export class CollStatsOperation extends CommandOperation<CollStatsOptions, Document> {
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

export class DbStatsOperation extends CommandOperation<DbStatsOptions, Document> {
  execute(server: Server, callback: Callback<Document>): void {
    const command: Document = { dbStats: true };
    if (this.options.scale != null) {
      command.scale = this.options.scale;
    }

    super.executeCommand(server, command, callback);
  }
}

defineAspects(CollStatsOperation, [Aspect.READ_OPERATION]);
defineAspects(DbStatsOperation, [Aspect.READ_OPERATION]);
