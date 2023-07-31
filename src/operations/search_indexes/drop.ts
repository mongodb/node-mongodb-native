import type { Document } from 'bson';

import type { Collection } from '../../collection';
import { MONGODB_ERROR_CODES, MongoServerError } from '../../error';
import type { Server } from '../../sdam/server';
import type { ClientSession } from '../../sessions';
import { AbstractOperation } from '../operation';

/** @internal */
export class DropSearchIndexOperation extends AbstractOperation<void> {
  constructor(private readonly collection: Collection, private readonly name: string) {
    super();
  }

  override async execute(server: Server, session: ClientSession | undefined): Promise<void> {
    const namespace = this.collection.fullNamespace;

    const command: Document = {
      dropSearchIndex: namespace.collection
    };

    if (typeof this.name === 'string') {
      command.name = this.name;
    }

    try {
      await server.commandAsync(namespace, command, { session });
    } catch (error) {
      const isNamespaceNotFoundError =
        error instanceof MongoServerError && error.code === MONGODB_ERROR_CODES.NamespaceNotFound;
      if (!isNamespaceNotFoundError) {
        throw error;
      }
    }
  }
}
