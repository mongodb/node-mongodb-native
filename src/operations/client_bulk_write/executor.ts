import { type Document } from 'bson';

import { ClientBulkWriteCursor } from '../../cursor/client_bulk_write_cursor';
import { type MongoClient } from '../../mongo_client';
import { WriteConcern } from '../../write_concern';
import { executeOperation } from '../execute_operation';
import { ClientBulkWriteOperation } from './client_bulk_write';
import { type ClientBulkWriteCommand, ClientBulkWriteCommandBuilder } from './command_builder';
import {
  type AnyClientBulkWriteModel,
  type ClientBulkWriteOptions,
  type ClientBulkWriteResult
} from './common';
import { ClientBulkWriteResultsMerger } from './results_merger';

/**
 * Responsible for executing a client bulk write.
 * @internal
 */
export class ClientBulkWriteExecutor {
  client: MongoClient;
  options: ClientBulkWriteOptions;
  operations: AnyClientBulkWriteModel[];

  /**
   * Instantiate the executor.
   * @param client - The mongo client.
   * @param operations - The user supplied bulk write models.
   * @param options - The bulk write options.
   */
  constructor(
    client: MongoClient,
    operations: AnyClientBulkWriteModel[],
    options?: ClientBulkWriteOptions
  ) {
    this.client = client;
    this.operations = operations;
    this.options = { ...options };

    // If no write concern was provided, we inherit one from the client.
    if (!this.options.writeConcern) {
      this.options.writeConcern = WriteConcern.fromOptions(this.client.options);
    }
  }

  /**
   * Execute the client bulk write. Will split commands into batches and exhaust the cursors
   * for each, then merge the results into one.
   * @returns The result.
   */
  async execute(): Promise<ClientBulkWriteResult | { ok: 1 }> {
    // The command builder will take the user provided models and potential split the batch
    // into multiple commands due to size.
    const pkFactory = this.client.s.options.pkFactory;
    const commandBuilder = new ClientBulkWriteCommandBuilder(
      this.operations,
      this.options,
      pkFactory
    );
    const commands = commandBuilder.buildCommands();
    if (this.options.writeConcern?.w === 0) {
      return await executeUnacknowledged(this.client, this.options, commands);
    }
    return await executeAcknowledged(this.client, this.options, commands);
  }
}

/**
 * Execute an acknowledged bulk write.
 */
async function executeAcknowledged(
  client: MongoClient,
  options: ClientBulkWriteOptions,
  commands: ClientBulkWriteCommand[]
): Promise<ClientBulkWriteResult> {
  const resultsMerger = new ClientBulkWriteResultsMerger(options);
  // For each command will will create and exhaust a cursor for the results.
  for (const command of commands) {
    const cursor = new ClientBulkWriteCursor(client, command, options);
    const docs = await cursor.toArray();
    resultsMerger.merge(command.ops.documents, cursor.response, docs);
  }
  return resultsMerger.result;
}

/**
 * Execute an unacknowledged bulk write.
 */
async function executeUnacknowledged(
  client: MongoClient,
  options: ClientBulkWriteOptions,
  commands: Document[]
): Promise<{ ok: 1 }> {
  for (const command of commands) {
    const operation = new ClientBulkWriteOperation(command, options);
    await executeOperation(client, operation);
  }
  return { ok: 1 };
}
