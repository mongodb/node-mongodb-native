import { Aspect, defineAspects, Hint } from './operation';
import { CommandOperation, CommandOpOptions } from './command';
import type { Callback, Document } from '../types';
import type { Server } from '../sdam/server';
import type { Collection } from '../collection';

export interface EstimatedDocumentCountOperationOptions extends CommandOpOptions {
  skip: number;
  limit: number;
  hint: Hint;
}

export class EstimatedDocumentCountOperation extends CommandOperation {
  collectionName: string;
  query?: Document;

  constructor(collection: Collection, options: EstimatedDocumentCountOperationOptions);
  constructor(
    collection: Collection,
    query: Document,
    options: EstimatedDocumentCountOperationOptions
  );
  constructor(
    collection: Collection,
    query?: Document | EstimatedDocumentCountOperationOptions,
    options?: EstimatedDocumentCountOperationOptions
  ) {
    if (typeof options === 'undefined') {
      options = query as EstimatedDocumentCountOperationOptions;
      query = undefined;
    }

    super(collection, options);
    this.collectionName = collection.s.namespace.collection;
    if (query) {
      this.query = query;
    }
  }

  execute(server: Server, callback: Callback): void {
    const options: EstimatedDocumentCountOperationOptions = this.options;
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

      callback(undefined, response.n);
    });
  }
}

defineAspects(EstimatedDocumentCountOperation, [
  Aspect.READ_OPERATION,
  Aspect.RETRYABLE,
  Aspect.EXECUTE_WITH_SELECTION
]);
