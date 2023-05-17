import type { Document } from 'bson';

import type { Collection } from '../../collection';
import { AggregationCursor } from '../../cursor/aggregation_cursor';
import type { AggregateOptions } from '../aggregate';

/** @public */
export type ListSearchIndexesOptions = AggregateOptions;

/** @public */
export class ListSearchIndexesCursor extends AggregationCursor<{ name: string }> {
  /** @internal */
  static create<T extends Document>(
    { fullNamespace: ns, client }: Collection<T>,
    name: string | null,
    options: ListSearchIndexesOptions = {}
  ): ListSearchIndexesCursor {
    const pipeline =
      name == null ? [{ $listSearchIndexes: {} }] : [{ $listSearchIndexes: { name } }];
    return new ListSearchIndexesCursor(client, ns, pipeline, options);
  }
}
