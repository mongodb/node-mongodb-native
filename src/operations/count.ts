import { type Connection } from '..';
import type { Document } from '../bson';
import { MongoDBResponse } from '../cmap/wire_protocol/responses';
import type { Collection } from '../collection';
import type { ClientSession } from '../sessions';
import type { MongoDBNamespace } from '../utils';
import { type CommandOperationOptions, ModernizedCommandOperation } from './command';
import { Aspect, defineAspects } from './operation';

/** @public */
export interface CountOptions extends CommandOperationOptions {
  /** The number of documents to skip. */
  skip?: number;
  /** The maximum amounts to count before aborting. */
  limit?: number;
  /**
   * Number of milliseconds to wait before aborting the query.
   */
  maxTimeMS?: number;
  /** An index name hint for the query. */
  hint?: string | Document;
}

class CountResponse extends MongoDBResponse {
  get n(): number {
    return this.getNumber('n') ?? 0;
  }
}

/** @internal */
export class CountOperation extends ModernizedCommandOperation<number> {
  override SERVER_COMMAND_RESPONSE_TYPE = CountResponse;
  override options: CountOptions;
  collectionName?: string;
  query: Document;

  constructor(namespace: MongoDBNamespace, filter: Document, options: CountOptions) {
    super({ s: { namespace: namespace } } as unknown as Collection, options);

    this.options = options;
    this.collectionName = namespace.collection;
    this.query = filter;
  }

  override get commandName() {
    return 'count' as const;
  }

  override buildCommandDocument(_connection: Connection, _session?: ClientSession): Document {
    const cmd: Document = {
      count: this.collectionName,
      query: this.query
    };

    if (typeof this.options.limit === 'number') {
      cmd.limit = this.options.limit;
    }

    if (typeof this.options.skip === 'number') {
      cmd.skip = this.options.skip;
    }

    if (this.options.hint != null) {
      cmd.hint = this.options.hint;
    }

    if (typeof this.options.maxTimeMS === 'number') {
      cmd.maxTimeMS = this.options.maxTimeMS;
    }

    return cmd;
  }

  override handleOk(response: InstanceType<typeof this.SERVER_COMMAND_RESPONSE_TYPE>): number {
    return response.n;
  }
}

defineAspects(CountOperation, [Aspect.READ_OPERATION, Aspect.RETRYABLE]);
