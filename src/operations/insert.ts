import { MongoError } from '../error';
import { defineAspects, Aspect, AbstractOperation } from './operation';
import { CommandOperation } from './command';
import { prepareDocs } from './common_functions';
import type { Callback, MongoDBNamespace } from '../utils';
import type { Server } from '../sdam/server';
import type { Collection } from '../collection';
import type { ObjectId, Document, BSONSerializeOptions } from '../bson';
import type { BulkWriteOptions } from '../bulk/common';
import { WriteConcern, WriteConcernOptions } from '../write_concern';
import type { ClientSession } from '../sessions';
import { BulkWriteOperation } from './bulk_write';

/** @internal */
export class InsertOperation extends CommandOperation<Document> {
  options: BulkWriteOptions;
  documents: Document[];

  constructor(ns: MongoDBNamespace, documents: Document[], options: BulkWriteOptions) {
    super(undefined, options);
    this.options = { ...options, checkKeys: options.checkKeys ?? true };
    this.ns = ns;
    this.documents = documents;
  }

  execute(server: Server, session: ClientSession, callback: Callback<Document>): void {
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

    if (typeof options.comment !== 'undefined') {
      command.comment = options.comment;
    }

    super.executeCommand(server, session, command, callback);
  }
}

/** @public */
export interface InsertOneOptions extends BSONSerializeOptions, WriteConcernOptions {
  /** Allow driver to bypass schema validation in MongoDB 3.2 or higher. */
  bypassDocumentValidation?: boolean;
  /** Force server to assign _id values instead of driver. */
  forceServerObjectId?: boolean;
}

/** @public */
export interface InsertOneResult {
  /** Indicates whether this write result was acknowledged. If not, then all other members of this result will be undefined */
  acknowledged: boolean;
  /** The identifier that was inserted. If the server generated the identifier, this value will be null as the driver does not have access to that data */
  insertedId: ObjectId;
}

export class InsertOneOperation extends InsertOperation {
  constructor(collection: Collection, doc: Document, options: InsertOneOptions) {
    super(collection.s.namespace, prepareDocs(collection, [doc], options), options);
  }

  execute(server: Server, session: ClientSession, callback: Callback<InsertOneResult>): void {
    super.execute(server, session, (err, res) => {
      if (err || res == null) return callback(err);
      if (res.code) return callback(new MongoError(res));
      if (res.writeErrors) return callback(new MongoError(res.writeErrors[0]));

      callback(undefined, {
        acknowledged: this.writeConcern?.w !== 0 ?? true,
        insertedId: this.documents[0]._id
      });
    });
  }
}

/** @public */
export interface InsertManyResult {
  /** Indicates whether this write result was acknowledged. If not, then all other members of this result will be undefined */
  acknowledged: boolean;
  /** The number of inserted documents for this operations */
  insertedCount: number;
  /** Map of the index of the inserted document to the id of the inserted document */
  insertedIds: { [key: number]: ObjectId };
}

/** @internal */
export class InsertManyOperation extends AbstractOperation<InsertManyResult> {
  options: BulkWriteOptions;
  collection: Collection;
  docs: Document[];

  constructor(collection: Collection, docs: Document[], options: BulkWriteOptions) {
    super(options);

    if (!Array.isArray(docs)) {
      throw new TypeError('docs parameter must be an array of documents');
    }

    this.options = options;
    this.collection = collection;
    this.docs = docs;
  }

  execute(server: Server, session: ClientSession, callback: Callback<InsertManyResult>): void {
    const coll = this.collection;
    const options = { ...this.options, ...this.bsonOptions, readPreference: this.readPreference };
    const writeConcern = WriteConcern.fromOptions(options);
    const bulkWriteOperation = new BulkWriteOperation(
      coll,
      [{ insertMany: prepareDocs(coll, this.docs, options) }],
      options
    );

    bulkWriteOperation.execute(server, session, (err, res) => {
      if (err || res == null) return callback(err);
      callback(undefined, {
        acknowledged: writeConcern?.w !== 0 ?? true,
        insertedCount: res.insertedCount,
        insertedIds: res.insertedIds
      });
    });
  }
}

defineAspects(InsertOperation, [Aspect.RETRYABLE, Aspect.WRITE_OPERATION]);
defineAspects(InsertOneOperation, [Aspect.RETRYABLE, Aspect.WRITE_OPERATION]);
defineAspects(InsertManyOperation, [Aspect.WRITE_OPERATION]);
