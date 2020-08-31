import { defineAspects, Aspect } from './operation';
import { updateDocuments } from './common_functions';
import { hasAtomicOperators, Callback } from '../utils';
import { CommandOperation, CommandOperationOptions } from './command';
import type { Document } from '../bson';
import type { Server } from '../sdam/server';
import type { Collection } from '../collection';
import type { CollationOptions } from '../cmap/wire_protocol/write_command';
import type { UpdateResult } from './update';

/** @public */
export interface ReplaceOptions extends CommandOperationOptions {
  /** If true, allows the write to opt-out of document level validation */
  bypassDocumentValidation?: boolean;
  /** Specifies a collation */
  collation?: CollationOptions;
  /** Specify that the update query should only consider plans using the hinted index */
  hint?: string | Document;
  /** When true, creates a new document if no document matches the query */
  upsert?: boolean;

  // FIXME:
  multi?: boolean;
}

/** @internal */
export class ReplaceOneOperation extends CommandOperation<ReplaceOptions, UpdateResult> {
  collection: Collection;
  filter: Document;
  replacement: Document;

  constructor(
    collection: Collection,
    filter: Document,
    replacement: Document,
    options: ReplaceOptions
  ) {
    super(collection, options);

    if (hasAtomicOperators(replacement)) {
      throw new TypeError('Replacement document must not contain atomic operators');
    }

    this.collection = collection;
    this.filter = filter;
    this.replacement = replacement;
  }

  execute(server: Server, callback: Callback<UpdateResult>): void {
    const coll = this.collection;
    const filter = this.filter;
    const replacement = this.replacement;
    const options = this.options;

    // Set single document update
    options.multi = false;

    // Execute update
    updateDocuments(server, coll, filter, replacement, options, (err, r) => {
      if (err || !r) return callback(err);

      const result: UpdateResult = {
        modifiedCount: r.nModified != null ? r.nModified : r.n,
        upsertedId:
          Array.isArray(r.upserted) && r.upserted.length > 0
            ? r.upserted[0] // FIXME(major): should be `r.upserted[0]._id`
            : null,
        upsertedCount: Array.isArray(r.upserted) && r.upserted.length ? r.upserted.length : 0,
        matchedCount: Array.isArray(r.upserted) && r.upserted.length > 0 ? 0 : r.n,
        result: r
      };

      callback(undefined, result);
    });
  }
}

defineAspects(ReplaceOneOperation, [Aspect.RETRYABLE, Aspect.WRITE_OPERATION]);
