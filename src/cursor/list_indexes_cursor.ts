import type { Collection } from '../collection';
import { executeOperation, ExecutionResult } from '../operations/execute_operation';
import { ListIndexesOperation, ListIndexesOptions } from '../operations/indexes';
import type { ClientSession } from '../sessions';
import type { Callback } from '../utils';
import { AbstractCursor } from './abstract_cursor';

/** @public */
export class ListIndexesCursor extends AbstractCursor {
  parent: Collection;
  options?: ListIndexesOptions;

  constructor(collection: Collection, options?: ListIndexesOptions) {
    super(collection.s.db.s.client, collection.s.namespace, options);
    this.parent = collection;
    this.options = options;
  }

  clone(): ListIndexesCursor {
    return new ListIndexesCursor(this.parent, {
      ...this.options,
      ...this.cursorOptions
    });
  }

  /** @internal */
  _initialize(session: ClientSession | undefined, callback: Callback<ExecutionResult>): void {
    const operation = new ListIndexesOperation(this.parent, {
      ...this.cursorOptions,
      ...this.options,
      session
    });

    executeOperation(this.parent.s.db.s.client, operation, (err, response) => {
      if (err || response == null) return callback(err);

      // TODO: NODE-2882
      callback(undefined, { server: operation.server, session, response });
    });
  }
}
