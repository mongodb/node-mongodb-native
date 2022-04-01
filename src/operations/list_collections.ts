import type { Binary, Document } from '../bson';
import { AbstractCursor } from '../cursor/abstract_cursor';
import type { Db } from '../db';
import type { Server } from '../sdam/server';
import type { ClientSession } from '../sessions';
import { Callback, getTopology, maxWireVersion } from '../utils';
import { CommandOperation, CommandOperationOptions } from './command';
import { executeOperation, ExecutionResult } from './execute_operation';
import { Aspect, defineAspects } from './operation';

/** @public */
export interface ListCollectionsOptions extends CommandOperationOptions {
  /** Since 4.0: If true, will only return the collection name in the response, and will omit additional info */
  nameOnly?: boolean;
  /** Since 4.0: If true and nameOnly is true, allows a user without the required privilege (i.e. listCollections action on the database) to run the command when access control is enforced. */
  authorizedCollections?: boolean;
  /** The batchSize for the returned command cursor or if pre 2.8 the systems batch collection */
  batchSize?: number;
}

/** @internal */
export class ListCollectionsOperation extends CommandOperation<string[]> {
  override options: ListCollectionsOptions;
  db: Db;
  filter: Document;
  nameOnly: boolean;
  authorizedCollections: boolean;
  batchSize?: number;

  constructor(db: Db, filter: Document, options?: ListCollectionsOptions) {
    super(db, options);

    this.options = options ?? {};
    this.db = db;
    this.filter = filter;
    this.nameOnly = !!this.options.nameOnly;
    this.authorizedCollections = !!this.options.authorizedCollections;

    if (typeof this.options.batchSize === 'number') {
      this.batchSize = this.options.batchSize;
    }
  }

  override execute(
    server: Server,
    session: ClientSession | undefined,
    callback: Callback<string[]>
  ): void {
    return super.executeCommand(
      server,
      session,
      this.generateCommand(maxWireVersion(server)),
      callback
    );
  }

  /* This is here for the purpose of unit testing the final command that gets sent. */
  generateCommand(wireVersion: number): Document {
    const command: Document = {
      listCollections: 1,
      filter: this.filter,
      cursor: this.batchSize ? { batchSize: this.batchSize } : {},
      nameOnly: this.nameOnly,
      authorizedCollections: this.authorizedCollections
    };

    // we check for undefined specifically here to allow falsy values
    // eslint-disable-next-line no-restricted-syntax
    if (wireVersion >= 9 && this.options.comment !== undefined) {
      command.comment = this.options.comment;
    }

    return command;
  }
}

/** @public */
export interface CollectionInfo extends Document {
  name: string;
  type?: string;
  options?: Document;
  info?: {
    readOnly?: false;
    uuid?: Binary;
  };
  idIndex?: Document;
}

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
    super(getTopology(db), db.s.namespace, options);
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

    executeOperation(this.parent, operation, (err, response) => {
      if (err || response == null) return callback(err);

      // TODO: NODE-2882
      callback(undefined, { server: operation.server, session, response });
    });
  }
}

defineAspects(ListCollectionsOperation, [
  Aspect.READ_OPERATION,
  Aspect.RETRYABLE,
  Aspect.CURSOR_CREATING
]);
