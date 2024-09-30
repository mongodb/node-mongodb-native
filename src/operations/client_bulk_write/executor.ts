import { ClientBulkWriteCursor } from '../../cursor/client_bulk_write_cursor';
import { type MongoClient } from '../../mongo_client';
import { WriteConcern } from '../../write_concern';
import { ClientBulkWriteCommandBuilder } from './command_builder';
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
    // const commands = commandBuilder.buildCommands(maxMessageSizeBytes, maxWriteBatchSize);
    // if (this.options.writeConcern?.w === 0) {
    const resultsMerger = new ClientBulkWriteResultsMerger(this.options);
    // For each command will will create and exhaust a cursor for the results.
    let currentBatchOffset = 0;
    while (commandBuilder.hasNextBatch()) {
      const cursor = new ClientBulkWriteCursor(this.client, commandBuilder, this.options);
      const docs = await cursor.toArray();
      const operations = cursor.operations;
      resultsMerger.merge(currentBatchOffset, operations, cursor.response, docs);
      // Set the new batch index so we can back back to the index in the original models.
      currentBatchOffset += operations.length;
    }
    return resultsMerger.result;
  }
}
