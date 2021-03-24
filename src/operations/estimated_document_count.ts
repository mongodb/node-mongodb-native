import { Aspect, defineAspects, Hint } from './operation';
import { CommandOperation, CommandOperationOptions } from './command';
import { Callback, maxWireVersion } from '../utils';
import type { Document } from '../bson';
import type { Server } from '../sdam/server';
import type { Collection } from '../collection';
import type { ClientSession } from '../sessions';

/**
 * All supported options, including legacy options
 * @public
 */
export interface EstimatedDocumentCountOptions extends EstimatedDocumentCountOptionsV1 {
  skip?: number;
  limit?: number;
  hint?: Hint;
}

/**
 * Options supported by Server API Version 1
 * @public
 */
export interface EstimatedDocumentCountOptionsV1 extends CommandOperationOptions {
  /** specifies a cumulative time limit in milliseconds for processing operations on the cursor. MongoDB interrupts the operation at the earliest following interrupt point. */
  maxTimeMS?: number;
}

/** @internal */
export class EstimatedDocumentCountOperation extends CommandOperation<number> {
  options: EstimatedDocumentCountOptions;
  collectionName: string;
  query?: Document;

  constructor(collection: Collection, options: EstimatedDocumentCountOptions);
  constructor(collection: Collection, query: Document, options: EstimatedDocumentCountOptions);
  constructor(
    collection: Collection,
    query?: Document | EstimatedDocumentCountOptions,
    options?: EstimatedDocumentCountOptions
  ) {
    if (typeof options === 'undefined') {
      options = query as EstimatedDocumentCountOptions;
      query = undefined;
    }

    super(collection, options);
    this.options = options;
    this.collectionName = collection.collectionName;
    if (query) {
      this.query = query;
    }
  }

  execute(server: Server, session: ClientSession, callback: Callback<number>): void {
    const options = this.options;

    let cmd: Document;

    if (maxWireVersion(server) > 11) {
      const pipeline = [
        { $collStats: { count: {} } },
        { $group: { _id: 1, n: { $sum: '$count' } } }
      ];

      cmd = { aggregate: this.collectionName, pipeline, cursor: {} };

      if (typeof options.maxTimeMS === 'number') {
        cmd.maxTimeMS = options.maxTimeMS;
      }
    } else {
      cmd = { count: this.collectionName };

      if (this.query) {
        cmd.query = this.query;
      }

      if (typeof options.skip === 'number') {
        cmd.skip = options.skip;
      }

      if (typeof options.limit === 'number') {
        cmd.limit = options.limit;
      }

      if (options.hint) {
        cmd.hint = options.hint;
      }
    }

    super.executeCommand(server, session, cmd, (err, response) => {
      if (err) {
        callback(err);
        return;
      }

      callback(undefined, response.n || 0);
    });
  }
}

defineAspects(EstimatedDocumentCountOperation, [Aspect.READ_OPERATION, Aspect.RETRYABLE]);
