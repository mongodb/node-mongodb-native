import { Aspect, defineAspects, Hint } from './operation';
import { CommandOperation, CommandOperationOptions } from './command';
import type { Callback, Document } from '../types';
import type { Server } from '../sdam/server';
import type { Collection } from '../collection';

export interface EstimatedDocumentCountOptions extends CommandOperationOptions {
  skip?: number;
  limit?: number;
  hint?: Hint;
}

export class EstimatedDocumentCountOperation extends CommandOperation<
  EstimatedDocumentCountOptions
> {
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
    this.collectionName = collection.s.namespace.collection;
    if (query) {
      this.query = query;
    }
  }

  execute(server: Server, callback: Callback<number>): void {
    const options = this.options;
    const cmd: Document = { count: this.collectionName };

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

    super.executeCommand(server, cmd, (err, response) => {
      if (err) {
        callback(err);
        return;
      }

      callback(undefined, response.n || 0);
    });
  }
}

defineAspects(EstimatedDocumentCountOperation, [
  Aspect.READ_OPERATION,
  Aspect.RETRYABLE,
  Aspect.EXECUTE_WITH_SELECTION
]);
