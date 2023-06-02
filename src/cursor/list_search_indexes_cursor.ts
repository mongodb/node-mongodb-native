import type { Collection } from '../collection';
import type { AggregateOptions } from '../operations/aggregate';
import { AggregationCursor } from './aggregation_cursor';

/** @internal */
export type ListSearchIndexesOptions = AggregateOptions;

/** @internal */
export class ListSearchIndexesCursor extends AggregationCursor<{ name: string }> {
  /** @internal */
  constructor(
    { fullNamespace: ns, client }: Collection,
    name: string | null,
    options: ListSearchIndexesOptions = {}
  ) {
    const pipeline =
      name == null ? [{ $listSearchIndexes: {} }] : [{ $listSearchIndexes: { name } }];
    super(client, ns, pipeline, options);
  }
}
