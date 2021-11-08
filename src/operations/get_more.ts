import type { Document, Long } from '../bson';
import type { Callback, MongoDBNamespace } from '../utils';
import type { Server } from '../sdam/server';
import { Aspect, AbstractOperation, OperationOptions, defineAspects } from './operation';
import type { ClientSession } from '../sessions';

/**
 * @public
 * @typeParam TSchema - Unused schema definition, deprecated usage, only specify `FindOptions` with no generic
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface GetMoreOptions<TSchema extends Document = Document> extends OperationOptions {
  /** Set the batchSize for the getMoreCommand when iterating over the query results. */
  batchSize?: number;
  /** You can put a $comment field on a query to make looking in the profiler logs simpler. */
  comment?: string | Document;
  /** Number of milliseconds to wait before aborting the query. */
  maxTimeMS?: number;
}

/** @internal */
export class GetMoreOperation extends AbstractOperation {
  cursorId: Long;
  options: GetMoreOptions;

  constructor(ns: MongoDBNamespace, cursorId: Long, options: GetMoreOptions = {}) {
    super(options);
    this.options = options;
    this.ns = ns;
    this.cursorId = cursorId;
  }

  execute(server: Server, session: ClientSession, callback: Callback<Document>): void {
    this.server = server;

    server.getMore(
      this.ns,
      this.cursorId,
      {
        ...this.options,
        session: session
      },
      callback
    );
  }
}

defineAspects(GetMoreOperation, [Aspect.READ_OPERATION, Aspect.RETRYABLE, Aspect.CURSOR_ITERATING]);
