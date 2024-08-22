import { type Document } from 'bson';

import { ClientBulkWriteCursorResponse } from '../../cmap/wire_protocol/responses';
import type { Server } from '../../sdam/server';
import type { ClientSession } from '../../sessions';
import { MongoDBNamespace } from '../../utils';
import { CommandOperation } from '../command';
import { Aspect, defineAspects } from '../operation';
import { type ClientBulkWriteOptions } from './common';

/**
 * Executes a single vlient bulk write operation within a potential batch.
 * @internal
 */
export class ClientBulkWriteOperation extends CommandOperation<ClientBulkWriteCursorResponse> {
  command: Document;
  override options: ClientBulkWriteOptions;

  override get commandName() {
    return 'bulkWrite' as const;
  }

  constructor(command: Document, options: ClientBulkWriteOptions) {
    super(undefined, options);
    this.command = command;
    this.options = options;
    this.ns = new MongoDBNamespace('admin', '$cmd');
  }

  /**
   * Execute the command. Superclass will handle write concern, etc.
   * @param server - The server.
   * @param session - The session.
   * @returns The response.
   */
  override async execute(
    server: Server,
    session: ClientSession | undefined
  ): Promise<ClientBulkWriteCursorResponse> {
    return await super.executeCommand(server, session, this.command, ClientBulkWriteCursorResponse);
  }
}

// Skipping the collation as it goes on the individual ops.
defineAspects(ClientBulkWriteOperation, [Aspect.WRITE_OPERATION, Aspect.SKIP_COLLATION]);
