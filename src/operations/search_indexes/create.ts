import type { Document } from 'bson';

import type { Collection } from '../../collection';
import type { Server } from '../../sdam/server';
import type { ClientSession } from '../../sessions';
import type { Callback } from '../../utils';
import { AbstractOperation } from '../operation';

export interface SearchIndexDescription {
  name?: string;
  description: Document;
}

export class CreateSearchIndexesOperation extends AbstractOperation<string[]> {
  constructor(
    private collection: Collection<any>,
    private descriptions: ReadonlyArray<SearchIndexDescription>,
    override options: Document = {}
  ) {
    super(options);
  }

  execute(server: Server, session: ClientSession | undefined, callback: Callback<any>): void {
    const namespace = this.collection.mongoDBNamespace;
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
