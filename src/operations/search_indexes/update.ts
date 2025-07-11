import type { Document } from '../../bson';
import type { Collection } from '../../collection';
import type { Server } from '../../sdam/server';
import type { ClientSession } from '../../sessions';
import { type TimeoutContext } from '../../timeout';
import { AbstractOperation } from '../operation';

/** @internal */
export class UpdateSearchIndexOperation extends AbstractOperation<void> {
  private readonly collection: Collection;
  private readonly name: string;
  private readonly definition: Document;

  constructor(collection: Collection, name: string, definition: Document) {
    super();
    this.collection = collection;
    this.name = name;
    this.definition = definition;
  }

  override get commandName() {
    return 'updateSearchIndex' as const;
  }

  override async execute(
    server: Server,
    session: ClientSession | undefined,
    timeoutContext: TimeoutContext
  ): Promise<void> {
    const namespace = this.collection.fullNamespace;
    const command = {
      updateSearchIndex: namespace.collection,
      name: this.name,
      definition: this.definition
    };

    await server.command(namespace, command, { session, timeoutContext });
    return;
  }
}
