import type { Collection } from '../collection';
import { executeOperation } from '../operations/execute_operation';
import { ListIndexesOperation, type ListIndexesOptions } from '../operations/indexes';
import type { ClientSession } from '../sessions';
import {
  AbstractCursor,
  type CursorInitializeOptions,
  type InitialCursorResponse
} from './abstract_cursor';

/** @public */
export class ListIndexesCursor extends AbstractCursor {
  parent: Collection;
  options?: ListIndexesOptions;

  constructor(collection: Collection, options?: ListIndexesOptions) {
    super(collection.client, collection.s.namespace, options);
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
  async _initialize(
    session: ClientSession | undefined,
    options?: CursorInitializeOptions
  ): Promise<InitialCursorResponse> {
    const operation = new ListIndexesOperation(this.parent, {
      ...this.cursorOptions,
      ...this.options,
      omitMaxTimeMS: options?.omitMaxTimeMS,
      session
    });

    const response = await executeOperation(this.parent.client, operation);

    return { server: operation.server, session, response };
  }
}
