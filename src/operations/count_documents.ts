import type { Document } from '../bson';
import type { Collection } from '../collection';
import { type TODO_NODE_3286 } from '../mongo_types';
import type { Server } from '../sdam/server';
import type { ClientSession } from '../sessions';
import { AggregateOperation, type AggregateOptions } from './aggregate';

/** @public */
export interface CountDocumentsOptions extends AggregateOptions {
  /** The number of documents to skip. */
  skip?: number;
  /** The maximum amounts to count before aborting. */
  limit?: number;
}

/** @internal */
export class CountDocumentsOperation extends AggregateOperation {
  constructor(collection: Collection, query: Document, options: CountDocumentsOptions) {
    const pipeline = [];
    pipeline.push({ $match: query });

    if (typeof options.skip === 'number') {
      pipeline.push({ $skip: options.skip });
    }

    if (typeof options.limit === 'number') {
      pipeline.push({ $limit: options.limit });
    }

    pipeline.push({ $group: { _id: 1, n: { $sum: 1 } } });

    super(collection.s.namespace, pipeline, options);
  }

  override async execute(
    server: Server,
    session: ClientSession | undefined
  ): Promise<TODO_NODE_3286> {
    const result = await super.execute(server, session);
    return result.shift()?.n ?? 0;
  }
}
