import type { Document } from '../bson';
import type { Collection } from '../collection';
import { MongoCompatibilityError } from '../error';
import type { Server } from '../sdam/server';
import type { ClientSession } from '../sessions';
import { Callback, decorateWithCollation, decorateWithReadConcern, maxWireVersion } from '../utils';
import { CommandOperation, CommandOperationOptions } from './command';
import { Aspect, defineAspects } from './operation';

/** @public */
export type DistinctOptions = CommandOperationOptions;

/**
 * Return a list of distinct values for the given key across a collection.
 * @internal
 */
export class DistinctOperation extends CommandOperation<any[]> {
  override options: DistinctOptions;
  collection: Collection;
  /** Field of the document to find distinct values for. */
  key: string;
  /** The query for filtering the set of documents to which we apply the distinct filter. */
  query: Document;

  /**
   * Construct a Distinct operation.
   *
   * @param collection - Collection instance.
   * @param key - Field of the document to find distinct values for.
   * @param query - The query for filtering the set of documents to which we apply the distinct filter.
   * @param options - Optional settings. See Collection.prototype.distinct for a list of options.
   */
  constructor(collection: Collection, key: string, query: Document, options?: DistinctOptions) {
    super(collection, options);

    this.options = options ?? {};
    this.collection = collection;
    this.key = key;
    this.query = query;
  }

  override execute(
    server: Server,
    session: ClientSession | undefined,
    callback: Callback<any[]>
  ): void {
    const coll = this.collection;
    const key = this.key;
    const query = this.query;
    const options = this.options;

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
      return callback(err);
    }

    if (this.explain && maxWireVersion(server) < 4) {
      callback(
        new MongoCompatibilityError(`Server ${server.name} does not support explain on distinct`)
      );
      return;
    }

    super.executeCommand(server, session, cmd, (err, result) => {
      if (err) {
        callback(err);
        return;
      }

      callback(undefined, this.explain ? result : result.values);
    });
  }
}

defineAspects(DistinctOperation, [Aspect.READ_OPERATION, Aspect.RETRYABLE, Aspect.EXPLAINABLE]);
