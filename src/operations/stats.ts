import { Aspect, defineAspects } from './operation';
import { CommandOperation } from './command';
import type { Callback } from '../types';
import type { Server } from '../sdam/server';

/**
 * Get all the collection statistics.
 *
 * @class
 * @property {Collection} collection Collection instance.
 * @property {object} [options] Optional settings. See Collection.prototype.stats for a list of options.
 */
export class CollStatsOperation extends CommandOperation {
  collectionName: string;

  /**
   * Construct a Stats operation.
   *
   * @param {Collection} collection Collection instance
   * @param {object} [options] Optional settings. See Collection.prototype.stats for a list of options.
   */
  constructor(collection: any, options?: object) {
    super(collection, options);
    this.collectionName = collection.collectionName;
  }

  execute(server: Server, callback: Callback) {
    const command: any = { collStats: this.collectionName };
    if (this.options.scale != null) {
      command.scale = this.options.scale;
    }

    super.executeCommand(server, command, callback);
  }
}

export class DbStatsOperation extends CommandOperation {
  execute(server: Server, callback: Callback) {
    const command: any = { dbStats: true };
    if (this.options.scale != null) {
      command.scale = this.options.scale;
    }

    super.executeCommand(server, command, callback);
  }
}

defineAspects(CollStatsOperation, [Aspect.READ_OPERATION, Aspect.EXECUTE_WITH_SELECTION]);
defineAspects(DbStatsOperation, [Aspect.READ_OPERATION, Aspect.EXECUTE_WITH_SELECTION]);
