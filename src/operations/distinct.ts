import { Aspect, defineAspects } from './operation';
import { CommandOperation } from './command';
import { decorateWithCollation, decorateWithReadConcern } from '../utils';
import type { Callback, Document } from '../types';
import type { Server } from '../sdam/server';
import type { Collection } from '../collection';
import type { CollationOptions } from '../cmap/wire_protocol/write_command';
import type { ClientSession } from '../sessions';
import type { ReadPreference } from '../read_preference';

export interface DistinctOperationOptions {
  readPreference: ReadPreference;
  maxTimeMS: number;
  collation: CollationOptions;
  session: ClientSession;
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
export class DistinctOperation extends CommandOperation {
  collection: Collection;
  key: string;
  query: Document;

  /**
   * Construct a Distinct operation.
   *
   * @param collection Collection instance.
   * @param key Field of the document to find distinct values for.
   * @param query The query for filtering the set of documents to which we apply the distinct filter.
   * @param options Optional settings. See Collection.prototype.distinct for a list of options.
   */
  constructor(
    collection: Collection,
    key: string,
    query: Document,
    options?: DistinctOperationOptions
  ) {
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
  execute(server: Server, callback: Callback): void {
    const coll = this.collection;
    const key = this.key;
    const query = this.query;
    const options: DistinctOperationOptions = this.options;

    // Distinct command
    const cmd: Document = {
      distinct: coll.collectionName,
      key: key,
      query: query
    };

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

    super.executeCommand(server, cmd, (err, result) => {
      if (err) {
        callback(err);
        return;
      }

      callback(undefined, this.options.full ? result : result.values);
    });
  }
}

defineAspects(DistinctOperation, [
  Aspect.READ_OPERATION,
  Aspect.RETRYABLE,
  Aspect.EXECUTE_WITH_SELECTION
]);
