import type { Document } from 'bson';

import type { Collection } from '../../collection';
import type { Server } from '../../sdam/server';
import type { ClientSession } from '../../sessions';
import type { Callback } from '../../utils';
import { AbstractCallbackOperation } from '../operation';

/**
 * @public
 */
export interface SearchIndexDescription {
  /** The name of the index. */
  name?: string;

  /** The index definition. */
  definition: Document;
}

/** @internal */
export class CreateSearchIndexesOperation extends AbstractCallbackOperation<string[]> {
  constructor(
    private readonly collection: Collection,
    private readonly descriptions: ReadonlyArray<SearchIndexDescription>
  ) {
    super();
  }

  executeCallback(
    server: Server,
    session: ClientSession | undefined,
    callback: Callback<string[]>
  ): void {
    const namespace = this.collection.fullNamespace;
    const command = {
      createSearchIndexes: namespace.collection,
      indexes: this.descriptions
    };

    server.command(namespace, command, { session }, (err, res) => {
      if (err || !res) {
        callback(err);
        return;
      }

      const indexesCreated: Array<{ name: string }> = res?.indexesCreated ?? [];

      callback(
        undefined,
        indexesCreated.map(({ name }) => name)
      );
    });
  }
}
