import { type Document } from '../../bson';
import { type ClientBulkWriteCursorResponse } from '../../cmap/wire_protocol/responses';
import {
  type ClientBulkWriteOptions,
  type ClientBulkWriteResult,
  type ClientDeleteResult,
  type ClientInsertOneResult,
  type ClientUpdateResult
} from './common';

/**
 * Merges client bulk write cursor responses together into a single result.
 * @internal
 */
export class ClientBulkWriteResultsMerger {
  result: ClientBulkWriteResult;
  options: ClientBulkWriteOptions;

  /**
   * Instantiate the merger.
   * @param options - The options.
   */
  constructor(options: ClientBulkWriteOptions) {
    this.options = options;
    this.result = {
      insertedCount: 0,
      upsertedCount: 0,
      matchedCount: 0,
      modifiedCount: 0,
      deletedCount: 0,
      insertResults: undefined,
      updateResults: undefined,
      deleteResults: undefined
    };

    if (options.verboseResults) {
      this.result.insertResults = new Map<number, ClientInsertOneResult>();
      this.result.updateResults = new Map<number, ClientUpdateResult>();
      this.result.deleteResults = new Map<number, ClientDeleteResult>();
    }
  }

  /**
   * Merge the results in the cursor to the existing result.
   * @param currentBatchOffset - The offset index to the original models.
   * @param response - The cursor response.
   * @param documents - The documents in the cursor.
   * @returns The current result.
   */
  merge(
    currentBatchOffset: number,
    operations: Document[],
    response: ClientBulkWriteCursorResponse,
    documents: Document[]
  ): ClientBulkWriteResult {
    // Update the counts from the cursor response.
    this.result.insertedCount += response.insertedCount;
    this.result.upsertedCount += response.upsertedCount;
    this.result.matchedCount += response.matchedCount;
    this.result.modifiedCount += response.modifiedCount;
    this.result.deletedCount += response.deletedCount;

    if (this.options.verboseResults) {
      // Iterate all the documents in the cursor and update the result.
      for (const document of documents) {
        // Only add to maps if ok: 1
        if (document.ok === 1) {
          // Get the corresponding operation from the command.
          const operation = operations[document.idx];
          // Handle insert results.
          if ('insert' in operation) {
            this.result.insertResults?.set(document.idx + currentBatchOffset, {
              insertedId: operation.document._id
            });
          }
          // Handle update results.
          if ('update' in operation) {
            const result: ClientUpdateResult = {
              matchedCount: document.n,
              modifiedCount: document.nModified ?? 0,
              // Check if the bulk did actually upsert.
              didUpsert: document.upserted != null
            };
            if (document.upserted) {
              result.upsertedId = document.upserted._id;
            }
            this.result.updateResults?.set(document.idx + currentBatchOffset, result);
          }
          // Handle delete results.
          if ('delete' in operation) {
            this.result.deleteResults?.set(document.idx + currentBatchOffset, {
              deletedCount: document.n
            });
          }
        }
      }
    }

    return this.result;
  }
}
