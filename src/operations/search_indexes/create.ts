import { BSONType, type Document, parseUtf8ValidationOption } from '../../bson';
import { type Connection } from '../../cmap/connection';
import { MongoDBResponse } from '../../cmap/wire_protocol/responses';
import type { Collection } from '../../collection';
import type { ServerCommandOptions } from '../../sdam/server';
import type { ClientSession } from '../../sessions';
import { type TimeoutContext } from '../../timeout';
import { ModernizedOperation } from '../operation';

/**
 * @public
 */
export interface SearchIndexDescription extends Document {
  /** The name of the index. */
  name?: string;

  /** The index definition. */
  definition: Document;

  /** The type of the index.  Currently `search` or `vectorSearch` are supported. */
  type?: string;
}

class CreateSearchIndexesResponse extends MongoDBResponse {
  get indexesCreated() {
    return this.get('indexesCreated', BSONType.array);
  }
}

/** @internal */
export class CreateSearchIndexesOperation extends ModernizedOperation<string[]> {
  override SERVER_COMMAND_RESPONSE_TYPE = CreateSearchIndexesResponse;
  private readonly collection: Collection;
  private readonly descriptions: ReadonlyArray<SearchIndexDescription>;

  constructor(collection: Collection, descriptions: ReadonlyArray<SearchIndexDescription>) {
    super();
    this.collection = collection;
    this.descriptions = descriptions;
    this.ns = collection.fullNamespace;
  }

  override get commandName() {
    return 'createSearchIndexes' as const;
  }

  override buildCommand(_connection: Connection, _session?: ClientSession): Document {
    const namespace = this.collection.fullNamespace;
    return {
      createSearchIndexes: namespace.collection,
      indexes: this.descriptions
    };
  }

  override handleOk(response: InstanceType<typeof this.SERVER_COMMAND_RESPONSE_TYPE>): string[] {
    const indexesCreated = response.indexesCreated?.toObject({
      ...this.bsonOptions,
      validation: parseUtf8ValidationOption(this.bsonOptions)
    });
    return indexesCreated ? Object.entries(indexesCreated).map(([_key, val]) => val.name) : [];
  }

  override buildOptions(timeoutContext: TimeoutContext): ServerCommandOptions {
    return { session: this.session, timeoutContext };
  }
}
