import type { Document, Long } from '../bson';
import { MongoRuntimeError } from '../error';
import type { Server } from '../sdam/server';
import type { ClientSession } from '../sessions';
import { Callback, maxWireVersion, MongoDBNamespace } from '../utils';
import { AbstractOperation, Aspect, defineAspects, OperationOptions } from './operation';

/** @internal */
export interface GetMoreOptions extends OperationOptions {
  /** Set the batchSize for the getMoreCommand when iterating over the query results. */
  batchSize?: number;
  /**
   * Comment to apply to the operation.
   *
   * getMore only supports 'comment' in server versions 4.4 and above.
   */
  comment?: unknown;
  /** Number of milliseconds to wait before aborting the query. */
  maxTimeMS?: number;
  /** TODO(NODE-4413): Address bug with maxAwaitTimeMS not being passed in from the cursor correctly */
  maxAwaitTimeMS?: number;
}

/**
 * GetMore command: https://www.mongodb.com/docs/manual/reference/command/getMore/
 * @internal
 */
export interface GetMoreCommand {
  getMore: Long;
  collection: string;
  batchSize?: number;
  maxTimeMS?: number;
  /** Only supported on wire versions 10 or greater */
  comment?: unknown;
}

/** @internal */
export class GetMoreOperation extends AbstractOperation {
  cursorId: Long;
  override options: GetMoreOptions;

  constructor(ns: MongoDBNamespace, cursorId: Long, server: Server, options: GetMoreOptions) {
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
  override execute(
    server: Server,
    session: ClientSession | undefined,
    callback: Callback<Document>
  ): void {
    if (server !== this.server) {
      return callback(
        new MongoRuntimeError('Getmore must run on the same server operation began on')
      );
    }

    if (this.cursorId == null || this.cursorId.isZero()) {
      return callback(new MongoRuntimeError('Unable to iterate cursor with no id'));
    }

    const collection = this.ns.collection;
    if (collection == null) {
      // Cursors should have adopted the namespace returned by MongoDB
      // which should always defined a collection name (even a pseudo one, ex. db.aggregate())
      return callback(new MongoRuntimeError('A collection name must be determined before getMore'));
    }

    const getMoreCmd: GetMoreCommand = {
      getMore: this.cursorId,
      collection
    };

    if (typeof this.options.batchSize === 'number') {
      getMoreCmd.batchSize = Math.abs(this.options.batchSize);
    }

    if (typeof this.options.maxAwaitTimeMS === 'number') {
      getMoreCmd.maxTimeMS = this.options.maxAwaitTimeMS;
    }

    // we check for undefined specifically here to allow falsy values
    // eslint-disable-next-line no-restricted-syntax
    if (this.options.comment !== undefined && maxWireVersion(server) >= 9) {
      getMoreCmd.comment = this.options.comment;
    }

    const commandOptions = {
      returnFieldSelector: null,
      documentsReturnedIn: 'nextBatch',
      ...this.options
    };

    server.command(this.ns, getMoreCmd, commandOptions, callback);
  }
}

defineAspects(GetMoreOperation, [Aspect.READ_OPERATION, Aspect.MUST_SELECT_SAME_SERVER]);
