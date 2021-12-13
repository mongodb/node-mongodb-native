import type { Document, Long } from '../bson';
import { MongoRuntimeError } from '../error';
import type { Server } from '../sdam/server';
import type { ClientSession } from '../sessions';
import type { Callback, MongoDBNamespace } from '../utils';
import { AbstractOperation, Aspect, defineAspects, OperationOptions } from './operation';

/**
 * @public
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface GetMoreOptions extends OperationOptions {
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
  server: Server;

  constructor(ns: MongoDBNamespace, cursorId: Long, server: Server, options: GetMoreOptions = {}) {
    super(options);
    this.options = options;
    this.ns = ns;
    this.cursorId = cursorId;
    this.server = server;
  }

  /**
   * Although there is a server already associated with the get more operation, the signature
   * for execute passes a server so we will just use that one.
   */
  execute(server: Server, session: ClientSession, callback: Callback<Document>): void {
    if (server !== this.server) {
      return callback(
        new MongoRuntimeError('Getmore must run on the same server operation began on')
      );
    }
    server.getMore(this.ns, this.cursorId, this.options, callback);
  }
}

defineAspects(GetMoreOperation, [Aspect.READ_OPERATION, Aspect.CURSOR_ITERATING]);
