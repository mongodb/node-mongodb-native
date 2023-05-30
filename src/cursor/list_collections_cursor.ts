import type { Document } from '../bson';
import type { Db } from '../db';
import { executeOperation, ExecutionResult } from '../operations/execute_operation';
import {
  CollectionInfo,
  ListCollectionsOperation,
  ListCollectionsOptions
} from '../operations/list_collections';
import type { ClientSession } from '../sessions';
import type { Callback } from '../utils';
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
  _initialize(session: ClientSession | undefined, callback: Callback<ExecutionResult>): void {
    const operation = new ListCollectionsOperation(this.parent, this.filter, {
      ...this.cursorOptions,
      ...this.options,
      session
    });

    executeOperation(this.parent.client, operation, (err, response) => {
      if (err || response == null) return callback(err);

      // TODO: NODE-2882
      callback(undefined, { server: operation.server, session, response });
    });
  }
}
