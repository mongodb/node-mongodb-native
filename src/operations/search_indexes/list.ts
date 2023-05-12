import type { Collection } from '../../collection';
import { AggregationCursor } from '../../cursor/aggregation_cursor';
import type { AggregateOptions } from '../aggregate';

export type ListSearchIndexesOptions = AggregateOptions;

export class ListSearchIndexesCursor extends AggregationCursor<{ name: string }> {
  /** @internal */
  static create(
    collection: Collection<any>,
    name: string | null,
    options: ListSearchIndexesOptions = {}
  ): ListSearchIndexesCursor {
    const client = collection.client;
    const ns = collection.mongoDBNamespace;
    const pipeline = name == null ? [{ $listIndexes: {} }] : [{ $listSearchIndexes: { name } }];
    return new ListSearchIndexesCursor(client, ns, pipeline, options);
  }
}
