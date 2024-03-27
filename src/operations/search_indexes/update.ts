import type { Collection } from '../../collection';
import type { Server } from '../../sdam/server';
import type { ClientSession } from '../../sessions';
import { AbstractOperation } from '../operation';
import type { SearchIndexDefinition } from './definition';

/** @internal */
export class UpdateSearchIndexOperation extends AbstractOperation<void> {
  constructor(
    private readonly collection: Collection,
    private readonly name: string,
    private readonly definition: SearchIndexDefinition
  ) {
    super();
  }

  override get commandName() {
    return 'updateSearchIndex' as const;
  }

  override async execute(server: Server, session: ClientSession | undefined): Promise<void> {
    const namespace = this.collection.fullNamespace;
    const command = {
      updateSearchIndex: namespace.collection,
      name: this.name,
      definition: this.definition
    };

    await server.command(namespace, command, { session });
    return;
  }
}
