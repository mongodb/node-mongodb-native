import type { Collection } from '../../collection';
import { AggregationCursor } from '../../cursor/aggregation_cursor';
import type { AggregateOptions } from '../aggregate';

/** @public */
export type ListSearchIndexesOptions = AggregateOptions;

/** @public */
export class ListSearchIndexesCursor extends AggregationCursor<{ name: string }> {
  /** @internal */
  static create(
    { fullNamespace: ns, client }: Collection,
    name: string | null,
    options: ListSearchIndexesOptions = {}
  ): ListSearchIndexesCursor {
    const pipeline =
      name == null ? [{ $listSearchIndexes: {} }] : [{ $listSearchIndexes: { name } }];
    return new ListSearchIndexesCursor(client, ns, pipeline, options);
  }
}
