import type { Document } from '../bson';
import type { BulkWriteOptions } from '../bulk/common';
import type { Collection } from '../collection';
import { MongoServerError } from '../error';
import type { InferIdType } from '../mongo_types';
import type { Server } from '../sdam/server';
import type { ClientSession } from '../sessions';
import { type TimeoutContext } from '../timeout';
import { maybeAddIdToDocuments, type MongoDBNamespace } from '../utils';
import { CommandOperation, type CommandOperationOptions } from './command';
import { Aspect, defineAspects } from './operation';

/** @internal */
export class InsertOperation extends CommandOperation<Document> {
  override options: BulkWriteOptions;
  documents: Document[];

  constructor(ns: MongoDBNamespace, documents: Document[], options: BulkWriteOptions) {
    super(undefined, options);
    this.options = { ...options, checkKeys: options.checkKeys ?? false };
    this.ns = ns;
    this.documents = documents;
  }

  override get commandName() {
    return 'insert' as const;
  }

  override async execute(
    server: Server,
    session: ClientSession | undefined,
    timeoutContext: TimeoutContext
  ): Promise<Document> {
    const options = this.options ?? {};
    const ordered = typeof options.ordered === 'boolean' ? options.ordered : true;
    const command: Document = {
      insert: this.ns.collection,
      documents: this.documents,
      ordered
    };

    if (typeof options.bypassDocumentValidation === 'boolean') {
      command.bypassDocumentValidation = options.bypassDocumentValidation;
    }

    // we check for undefined specifically here to allow falsy values
    // eslint-disable-next-line no-restricted-syntax
    if (options.comment !== undefined) {
      command.comment = options.comment;
    }

    return await super.executeCommand(server, session, command, timeoutContext);
  }
}

/** @public */
export interface InsertOneOptions extends CommandOperationOptions {
  /** Allow driver to bypass schema validation. */
  bypassDocumentValidation?: boolean;
  /** Force server to assign _id values instead of driver. */
  forceServerObjectId?: boolean;
}

/** @public */
export interface InsertOneResult<TSchema = Document> {
  /** Indicates whether this write result was acknowledged. If not, then all other members of this result will be undefined */
  acknowledged: boolean;
  /** The identifier that was inserted. If the server generated the identifier, this value will be null as the driver does not have access to that data */
  insertedId: InferIdType<TSchema>;
}

export class InsertOneOperation extends InsertOperation {
  constructor(collection: Collection, doc: Document, options: InsertOneOptions) {
    super(collection.s.namespace, [maybeAddIdToDocuments(collection, doc, options)], options);
  }

  override async execute(
    server: Server,
    session: ClientSession | undefined,
    timeoutContext: TimeoutContext
  ): Promise<InsertOneResult> {
    const res = await super.execute(server, session, timeoutContext);
    if (res.code) throw new MongoServerError(res);
    if (res.writeErrors) {
      // This should be a WriteError but we can't change it now because of error hierarchy
      throw new MongoServerError(res.writeErrors[0]);
    }

    return {
      acknowledged: this.writeConcern?.w !== 0,
      insertedId: this.documents[0]._id
    };
  }
}

/** @public */
export interface InsertManyResult<TSchema = Document> {
  /** Indicates whether this write result was acknowledged. If not, then all other members of this result will be undefined */
  acknowledged: boolean;
  /** The number of inserted documents for this operations */
  insertedCount: number;
  /** Map of the index of the inserted document to the id of the inserted document */
  insertedIds: { [key: number]: InferIdType<TSchema> };
}

defineAspects(InsertOperation, [Aspect.RETRYABLE, Aspect.WRITE_OPERATION]);
defineAspects(InsertOneOperation, [Aspect.RETRYABLE, Aspect.WRITE_OPERATION]);
