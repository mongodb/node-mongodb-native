import type { Document } from 'bson';

import type { Collection } from '../../collection';
import type { Server } from '../../sdam/server';
import type { ClientSession } from '../../sessions';
import type { Callback } from '../../utils';
import { AbstractOperation } from '../operation';

export class DropSearchIndexOperation extends AbstractOperation<void> {
  /** @internal */
  constructor(
    private collection: Collection<any>,
    private name: string,
    override options: Document = {}
  ) {
    super(options);
  }

  execute(server: Server, session: ClientSession | undefined, callback: Callback<void>): void {
    const namespace = this.collection.mongoDBNamespace;

    const command: Document = {
      dropSearchIndex: namespace.collection
    };

    if (typeof this.name === 'string') {
      command.name = this.name;
    }

    server.command(namespace, command, { session }, err => {
      if (err) {
        callback(err);
        return;
      }

      callback();
    });
  }
}
