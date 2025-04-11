import type { Document } from '../bson';
import type { Collection } from '../collection';
import type { Server } from '../sdam/server';
import type { ClientSession } from '../sessions';
import { type TimeoutContext } from '../timeout';
import { decorateWithCollation, decorateWithReadConcern } from '../utils';
import { CommandOperation, type CommandOperationOptions } from './command';
import { Aspect, defineAspects } from './operation';

/** @public */
export type DistinctOptions = CommandOperationOptions & {
  /**
   * @sinceServerVersion 7.1
   *
   * The index to use. Specify either the index name as a string or the index key pattern.
   * If specified, then the query system will only consider plans using the hinted index.
   *
   * If provided as a string, `hint` must be index name for an index on the collection.
   * If provided as an object, `hint` must be an index description for an index defined on the collection.
   *
   * See https://www.mongodb.com/docs/manual/reference/command/distinct/#command-fields.
   */
  hint?: Document | string;
};

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

  override get commandName() {
    return 'distinct' as const;
  }

  override async execute(
    server: Server,
    session: ClientSession | undefined,
    timeoutContext: TimeoutContext
  ): Promise<any[]> {
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

    // we check for undefined specifically here to allow falsy values
    // eslint-disable-next-line no-restricted-syntax
    if (typeof options.comment !== 'undefined') {
      cmd.comment = options.comment;
    }

    if (options.hint != null) {
      cmd.hint = options.hint;
    }

    // Do we have a readConcern specified
    decorateWithReadConcern(cmd, coll, options);

    // Have we specified collation
    decorateWithCollation(cmd, coll, options);

    const result = await super.executeCommand(server, session, cmd, timeoutContext);

    return this.explain ? result : result.values;
  }
}

defineAspects(DistinctOperation, [Aspect.READ_OPERATION, Aspect.RETRYABLE, Aspect.EXPLAINABLE]);
