import type { Document } from 'bson';

import type { Collection } from '../../collection';
import type { Server } from '../../sdam/server';
import type { ClientSession } from '../../sessions';
import type { Callback } from '../../utils';
import { AbstractOperation } from '../operation';

/** @internal */
export class UpdateSearchIndexOperation extends AbstractOperation<void> {
  constructor(
    private readonly collection: Collection,
    private readonly name: string,
    private readonly definition: Document
  ) {
    super();
  }

  execute(server: Server, session: ClientSession | undefined, callback: Callback<void>): void {
    const namespace = this.collection.fullNamespace;
    const command = {
      updateSearchIndex: namespace.collection,
      name: this.name,
      definition: this.definition
    };

    server.command(namespace, command, { session }, err => {
      if (err) {
        callback(err);
        return;
      }

      callback();
    });
  }
}
