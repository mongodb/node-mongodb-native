import type { Document } from '../bson';
import { type Connection } from '../cmap/connection';
import { DistinctResponse } from '../cmap/wire_protocol/responses';
import type { Collection } from '../collection';
import { type CommandOperationOptions, ModernizedCommandOperation } from './command';
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
export class DistinctOperation extends ModernizedCommandOperation<any[]> {
  override SERVER_COMMAND_RESPONSE_TYPE = DistinctResponse;
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

  override buildCommandDocument(_connection: Connection): Document {
    return {
      distinct: this.collection.collectionName,
      key: this.key,
      query: this.query
    };
  }

  override handleOk(response: InstanceType<typeof this.SERVER_COMMAND_RESPONSE_TYPE>): any[] {
    this.explain ? response.toObject() : response.values;
  }
}

defineAspects(DistinctOperation, [Aspect.READ_OPERATION, Aspect.RETRYABLE, Aspect.EXPLAINABLE]);
