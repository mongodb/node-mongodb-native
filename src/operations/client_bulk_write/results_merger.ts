import { MongoWriteConcernError } from '../..';
import { type Document } from '../../bson';
import { type ClientBulkWriteCursor } from '../../cursor/client_bulk_write_cursor';
import {
  type ClientBulkWriteError,
  type ClientBulkWriteOptions,
  type ClientBulkWriteResult,
  type ClientDeleteResult,
  type ClientInsertOneResult,
  type ClientUpdateResult,
  MongoClientBulkWriteError
} from './common';

/**
 * Merges client bulk write cursor responses together into a single result.
 * @internal
 */
export class ClientBulkWriteResultsMerger {
  result: ClientBulkWriteResult;
  options: ClientBulkWriteOptions;
  currentBatchOffset: number;
  writeConcernErrors: Document[];
  writeErrors: Map<number, ClientBulkWriteError>;

  /**
   * Instantiate the merger.
   * @param options - The options.
   */
  constructor(options: ClientBulkWriteOptions) {
    this.options = options;
    this.currentBatchOffset = 0;
    this.writeConcernErrors = [];
    this.writeErrors = new Map();
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
  async merge(cursor: ClientBulkWriteCursor): Promise<ClientBulkWriteResult> {
    let writeConcernErrorResult;
    try {
      for await (const document of cursor) {
        // Only add to maps if ok: 1
        if (document.ok === 1 && this.options.verboseResults) {
          // Get the corresponding operation from the command.
          const operation = cursor.operations[document.idx];
          // Handle insert results.
          if ('insert' in operation) {
            this.result.insertResults?.set(document.idx + this.currentBatchOffset, {
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
            this.result.updateResults?.set(document.idx + this.currentBatchOffset, result);
          }
          // Handle delete results.
          if ('delete' in operation) {
            this.result.deleteResults?.set(document.idx + this.currentBatchOffset, {
              deletedCount: document.n
            });
          }
        } else {
          // If an individual write error is encountered during an ordered bulk write, drivers MUST
          // record the error in writeErrors and immediately throw the exception. Otherwise, drivers
          // MUST continue to iterate the results cursor and execute any further bulkWrite batches.
          if (this.options.ordered) {
            const error = new MongoClientBulkWriteError({
              message: 'Mongo client ordered bulk write encountered a write error.'
            });
            error.writeErrors.set(document.idx + this.currentBatchOffset, {
              code: document.code,
              message: document.errmsg
            });
            error.partialResult = this.result;
            throw error;
          } else {
            this.writeErrors.set(document.idx + this.currentBatchOffset, {
              code: document.code,
              message: document.errmsg
            });
          }
        }
      }
    } catch (error) {
      if (error instanceof MongoWriteConcernError) {
        const result = error.result;
        writeConcernErrorResult = {
          insertedCount: result.nInserted,
          upsertedCount: result.nUpserted,
          matchedCount: result.nMatched,
          modifiedCount: result.nModified,
          deletedCount: result.nDeleted,
          writeConcernError: result.writeConcernError
        };
        // docs = result.cursor.firstBatch;
      } else {
        throw error;
      }
    } finally {
      // Update the counts from the cursor response.
      if (cursor.response) {
        const response = cursor.response;
        this.incrementCounts(response);
      }

      // Increment the batch offset.
      this.currentBatchOffset += cursor.operations.length;
    }

    // If we have write concern errors ensure they are added.
    if (writeConcernErrorResult) {
      const writeConcernError = writeConcernErrorResult.writeConcernError as Document;
      this.incrementCounts(writeConcernErrorResult);
      this.writeConcernErrors.push({
        code: writeConcernError.code,
        message: writeConcernError.errmsg
      });
    }

    return this.result;
  }

  /**
   * Increment the result counts.
   * @param document - The document with the results.
   */
  private incrementCounts(document: Document) {
    this.result.insertedCount += document.insertedCount;
    this.result.upsertedCount += document.upsertedCount;
    this.result.matchedCount += document.matchedCount;
    this.result.modifiedCount += document.modifiedCount;
    this.result.deletedCount += document.deletedCount;
  }
}
