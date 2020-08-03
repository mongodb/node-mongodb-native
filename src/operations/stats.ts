import { Aspect, defineAspects } from './operation';
import { CommandOperation } from './command';

/**
 * Get all the collection statistics.
 *
 * @class
 * @property {Collection} collection Collection instance.
 * @property {object} [options] Optional settings. See Collection.prototype.stats for a list of options.
 */
class CollStatsOperation extends CommandOperation {
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

  execute(server: any, callback: Function) {
    const command: any = { collStats: this.collectionName };
    if (this.options.scale != null) {
      command.scale = this.options.scale;
    }

    super.executeCommand(server, command, callback);
  }
}

class DbStatsOperation extends CommandOperation {
  execute(server: any, callback: Function) {
    const command: any = { dbStats: true };
    if (this.options.scale != null) {
      command.scale = this.options.scale;
    }

    super.executeCommand(server, command, callback);
  }
}

defineAspects(CollStatsOperation, [Aspect.READ_OPERATION, Aspect.EXECUTE_WITH_SELECTION]);
defineAspects(DbStatsOperation, [Aspect.READ_OPERATION, Aspect.EXECUTE_WITH_SELECTION]);
export { DbStatsOperation, CollStatsOperation };
