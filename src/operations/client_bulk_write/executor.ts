import { type Document } from 'bson';

import { ClientBulkWriteCursor } from '../../cursor/client_bulk_write_cursor';
import { MongoClientBulkWriteExecutionError } from '../../error';
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
    const topologyDescription = this.client.topology?.description;
    const maxMessageSizeBytes = topologyDescription?.maxMessageSizeBytes;
    const maxWriteBatchSize = topologyDescription?.maxWriteBatchSize;
    // If we don't know the maxMessageSizeBytes or for some reason it's 0
    // then we cannot calculate the batch.
    if (!maxMessageSizeBytes) {
      throw new MongoClientBulkWriteExecutionError(
        'No maxMessageSizeBytes value found - client bulk writes cannot execute without this value set from the monitoring connections.'
      );
    }

    if (!maxWriteBatchSize) {
      throw new MongoClientBulkWriteExecutionError(
        'No maxWriteBatchSize value found - client bulk writes cannot execute without this value set from the monitoring connections.'
      );
    }

    // The command builder will take the user provided models and potential split the batch
    // into multiple commands due to size.
    const pkFactory = this.client.s.options.pkFactory;
    const commandBuilder = new ClientBulkWriteCommandBuilder(
      this.operations,
      this.options,
      pkFactory
    );
    const commands = commandBuilder.buildCommands(maxMessageSizeBytes, maxWriteBatchSize);
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
  let currentBatchOffset = 0;
  for (const command of commands) {
    const cursor = new ClientBulkWriteCursor(client, command, options);
    const docs = await cursor.toArray();
    const operations = command.ops.documents;
    resultsMerger.merge(currentBatchOffset, operations, cursor.response, docs);
    // Set the new batch index so we can back back to the index in the original models.
    currentBatchOffset += operations.length;
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
