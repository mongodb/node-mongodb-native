import type { Document } from '../bson';
import type { Db } from '../db';
import { executeOperation, type ExecutionResult } from '../operations/execute_operation';
import {
  type CollectionInfo,
  ListCollectionsOperation,
  type ListCollectionsOptions
} from '../operations/list_collections';
import type { ClientSession } from '../sessions';
import { AbstractCursor } from './abstract_cursor';

/** @public */
export class ListCollectionsCursor<
  T extends Pick<CollectionInfo, 'name' | 'type'> | CollectionInfo =
    | Pick<CollectionInfo, 'name' | 'type'>
    | CollectionInfo
> extends AbstractCursor<T> {
  parent: Db;
  filter: Document;
  options?: ListCollectionsOptions;

  constructor(db: Db, filter: Document, options?: ListCollectionsOptions) {
    super(db.client, db.s.namespace, options);
    this.parent = db;
    this.filter = filter;
    this.options = options;
  }

  clone(): ListCollectionsCursor<T> {
    return new ListCollectionsCursor(this.parent, this.filter, {
      ...this.options,
      ...this.cursorOptions
    });
  }

  /** @internal */
  async _initialize(session: ClientSession | undefined): Promise<ExecutionResult> {
    const operation = new ListCollectionsOperation(this.parent, this.filter, {
      ...this.cursorOptions,
      ...this.options,
      session
    });

    const response = await executeOperation(this.parent.client, operation);

    // TODO: NODE-2882
    return { server: operation.server, session, response };
  }
}
