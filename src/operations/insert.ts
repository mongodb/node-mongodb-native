import { MongoError } from '../error';
import { defineAspects, Aspect, AbstractOperation } from './operation';
import { CommandOperation } from './command';
import { prepareDocs } from './common_functions';
import type { Callback, MongoDBNamespace } from '../utils';
import type { Server } from '../sdam/server';
import type { Collection } from '../collection';
import type { WriteCommandOptions } from '../cmap/wire_protocol/write_command';
import type { ObjectId, Document, BSONSerializeOptions } from '../bson';
import type { BulkWriteOptions } from '../bulk/common';
import type { WriteConcernOptions } from '../write_concern';
import type { ClientSession } from '../sessions';
import { ReadPreference } from '../read_preference';

/** @internal */
export class InsertOperation extends AbstractOperation<Document> {
  options: BulkWriteOptions;
  operations: Document[];

  constructor(ns: MongoDBNamespace, ops: Document[], options: BulkWriteOptions) {
    super(options);
    this.options = options;
    this.ns = ns;
    this.operations = ops;
  }

  execute(server: Server, session: ClientSession, callback: Callback<Document>): void {
    server.insert(
      this.ns.toString(),
      this.operations,
      { ...this.options, readPreference: this.readPreference, session } as WriteCommandOptions,
      callback
    );
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

export class InsertOneOperation extends CommandOperation<InsertOneResult> {
  options: InsertOneOptions;
  collection: Collection;
  doc: Document;

  constructor(collection: Collection, doc: Document, options: InsertOneOptions) {
    super(collection, options);

    this.options = options;
    this.collection = collection;
    this.doc = doc;
  }

  execute(server: Server, session: ClientSession, callback: Callback<InsertOneResult>): void {
    const coll = this.collection;
    const doc = this.doc;
    const options = {
      ...this.options,
      ...this.bsonOptions,
      readPreference: ReadPreference.primary,
      session
    };

    // File inserts
    server.insert(
      coll.s.namespace.toString(),
      prepareDocs(coll, [this.doc], options),
      options as WriteCommandOptions,
      (err, result) => {
        if (err || result == null) return callback(err);
        if (result.code) return callback(new MongoError(result));
        if (result.writeErrors) return callback(new MongoError(result.writeErrors[0]));

        callback(undefined, {
          acknowledged: this.writeConcern?.w !== 0 ?? true,
          insertedId: doc._id
        });
      }
    );
  }
}

defineAspects(InsertOperation, [Aspect.RETRYABLE, Aspect.WRITE_OPERATION]);
defineAspects(InsertOneOperation, [Aspect.RETRYABLE, Aspect.WRITE_OPERATION]);
