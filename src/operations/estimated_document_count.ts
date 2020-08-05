import { Aspect, defineAspects } from './operation';
import { CommandOperation, CommandOperationOptions } from './command';

interface EstimatedDocumentCountOperationOptions extends CommandOperationOptions {
  hint?: any;
  limit?: any;
  skip?: any;
}

class EstimatedDocumentCountOperation extends CommandOperation<
  EstimatedDocumentCountOperationOptions
> {
  collectionName: string;
  query?: any;

  /**
   * @param {Collection} collection
   * @param {object} [query]
   * @param {object} [options]
   */
  constructor(collection: any, query?: object, options?: object) {
    if (typeof options === 'undefined') {
      options = query;
      query = undefined;
    }

    super(collection, options);
    this.collectionName = collection.s.namespace.collection;
    if (query) {
      this.query = query;
    }
  }

  execute(server: any, callback: Function) {
    const options = this.options;
    const cmd = { count: this.collectionName } as any;

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

    super.executeCommand(server, cmd, (err?: any, response?: any) => {
      if (err) {
        callback(err);
        return;
      }

      callback(null, response.n);
    });
  }
}

defineAspects(EstimatedDocumentCountOperation, [
  Aspect.READ_OPERATION,
  Aspect.RETRYABLE,
  Aspect.EXECUTE_WITH_SELECTION
]);

export = EstimatedDocumentCountOperation;
