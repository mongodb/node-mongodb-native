import { Aspect, defineAspects } from './operation';
import { CommandOperation, CommandOperationOptions } from './command';
import { decorateWithCollation, decorateWithReadConcern } from '../utils';

interface DistinctOperationOptions extends CommandOperationOptions {
  full?: any;
}

/**
 * Return a list of distinct values for the given key across a collection.
 *
 * @class
 * @property {Collection} collection Collection instance.
 * @property {string} key Field of the document to find distinct values for.
 * @property {object} query The query for filtering the set of documents to which we apply the distinct filter.
 * @property {object} [options] Optional settings. See Collection.prototype.distinct for a list of options.
 */
class DistinctOperation extends CommandOperation<DistinctOperationOptions> {
  collection: any;
  key: any;
  query: any;

  /**
   * Construct a Distinct operation.
   *
   * @param {Collection} collection Collection instance.
   * @param {string} key Field of the document to find distinct values for.
   * @param {object} query The query for filtering the set of documents to which we apply the distinct filter.
   * @param {object} [options] Optional settings. See Collection.prototype.distinct for a list of options.
   */
  constructor(collection: any, key: string, query: object, options?: DistinctOperationOptions) {
    super(collection, options);

    this.collection = collection;
    this.key = key;
    this.query = query;
  }

  /**
   * Execute the operation.
   *
   * @param {any} server
   * @param {Collection~resultCallback} [callback] The command result callback
   */
  execute(server: any, callback: Function) {
    const coll = this.collection;
    const key = this.key;
    const query = this.query;
    const options = this.options;

    // Distinct command
    const cmd = {
      distinct: coll.collectionName,
      key: key,
      query: query
    } as any;

    // Add maxTimeMS if defined
    if (typeof options.maxTimeMS === 'number') {
      cmd.maxTimeMS = options.maxTimeMS;
    }

    // Do we have a readConcern specified
    decorateWithReadConcern(cmd, coll, options);

    // Have we specified collation
    try {
      decorateWithCollation(cmd, coll, options);
    } catch (err) {
      return callback(err, null);
    }

    super.executeCommand(server, cmd, (err?: any, result?: any) => {
      if (err) {
        callback(err);
        return;
      }

      callback(null, this.options.full ? result : result.values);
    });
  }
}

defineAspects(DistinctOperation, [
  Aspect.READ_OPERATION,
  Aspect.RETRYABLE,
  Aspect.EXECUTE_WITH_SELECTION
]);

export = DistinctOperation;
