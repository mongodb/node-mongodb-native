import { MongoClientBulkWriteExecutionError, ServerType } from '../../beta';
import { ClientBulkWriteCursorResponse } from '../../cmap/wire_protocol/responses';
import type { Server } from '../../sdam/server';
import type { ClientSession } from '../../sessions';
import { MongoDBNamespace } from '../../utils';
import { CommandOperation } from '../command';
import { Aspect, defineAspects } from '../operation';
import { type ClientBulkWriteCommandBuilder } from './command_builder';
import { type ClientBulkWriteOptions } from './common';

/**
 * Executes a single client bulk write operation within a potential batch.
 * @internal
 */
export class ClientBulkWriteOperation extends CommandOperation<ClientBulkWriteCursorResponse> {
  commandBuilder: ClientBulkWriteCommandBuilder;
  override options: ClientBulkWriteOptions;

  override get commandName() {
    return 'bulkWrite' as const;
  }

  constructor(commandBuilder: ClientBulkWriteCommandBuilder, options: ClientBulkWriteOptions) {
    super(undefined, options);
    this.commandBuilder = commandBuilder;
    this.options = options;
    this.ns = new MongoDBNamespace('admin', '$cmd');
  }

  override resetBatch(): boolean {
    return this.commandBuilder.resetBatch();
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
    let command;

    if (server.description.type === ServerType.LoadBalancer) {
      if (session) {
        // Checkout a connection to build the command.
        const connection = await server.pool.checkOut();
        // Pin the connection to the session so it get used to execute the command and we do not
        // perform a double check-in/check-out.
        session.pin(connection);
        command = this.commandBuilder.buildBatch(
          connection.hello?.maxMessageSizeBytes,
          connection.hello?.maxWriteBatchSize,
          connection.hello?.maxBsonObjectSize
        );
      } else {
        throw new MongoClientBulkWriteExecutionError(
          'Session provided to the client bulk write operation must be present.'
        );
      }
    } else {
      // At this point we have a server and the auto connect code has already
      // run in executeOperation, so the server description will be populated.
      // We can use that to build the command.
      if (
        !server.description.maxWriteBatchSize ||
        !server.description.maxMessageSizeBytes ||
        !server.description.maxBsonObjectSize
      ) {
        throw new MongoClientBulkWriteExecutionError(
          'In order to execute a client bulk write, both maxWriteBatchSize, maxMessageSizeBytes and maxBsonObjectSize must be provided by the servers hello response.'
        );
      }
      command = this.commandBuilder.buildBatch(
        server.description.maxMessageSizeBytes,
        server.description.maxWriteBatchSize,
        server.description.maxBsonObjectSize
      );
    }
    return await super.executeCommand(server, session, command, ClientBulkWriteCursorResponse);
  }
}

// Skipping the collation as it goes on the individual ops.
defineAspects(ClientBulkWriteOperation, [
  Aspect.WRITE_OPERATION,
  Aspect.SKIP_COLLATION,
  Aspect.CURSOR_CREATING,
  Aspect.RETRYABLE,
  Aspect.COMMAND_BATCHING
]);
