import { defineAspects, Aspect, Hint } from './operation';
import { updateDocuments } from './common_functions';
import { hasAtomicOperators } from '../utils';
import { CommandOperation, CommandOpOptions } from './command';
import type { Callback, Document, AnyError } from '../types';
import type { Server } from '../sdam/server';
import type { Collection } from '../collection';
import type { CollationOptions } from '../cmap/wire_protocol/write_command';

export interface ReplaceOneOptions extends CommandOpOptions {
  /** Allow driver to bypass schema validation in MongoDB 3.2 or higher. */
  bypassDocumentValidation: boolean;
  /** Specify collation (MongoDB 3.4 or higher) settings for update operation (see 3.4 documentation for available fields). */
  collation: CollationOptions;
  /** An optional hint for query optimization. See the {@link https://docs.mongodb.com/manual/reference/command/update/#update-command-hint|update command} reference for more information. */
  hint: Hint;
  /** When true, creates a new document if no document matches the query. */
  upsert: boolean;
  /** The write concern. */
  w: number | string;
  /** The write concern timeout. */
  wtimeout: number;
  /** Specify a journal write concern. */
  j: boolean;
  /** If true, will throw if bson documents start with `$` or include a `.` in any key value */
  checkKeys: boolean;
  /** Serialize functions on any object. */
  serializeFunctions: boolean;
  /** Specify if the BSON serializer should ignore undefined fields. */
  ignoreUndefined: boolean;
}

export class ReplaceOneOperation extends CommandOperation {
  collection: Collection;
  filter: Document;
  replacement: Document;

  constructor(
    collection: Collection,
    filter: Document,
    replacement: Document,
    options: ReplaceOneOptions
  ) {
    super(collection, options);

    if (hasAtomicOperators(replacement)) {
      throw new TypeError('Replacement document must not contain atomic operators');
    }

    this.collection = collection;
    this.filter = filter;
    this.replacement = replacement;
  }

  execute(server: Server, callback: Callback): void {
    const coll = this.collection;
    const filter = this.filter;
    const replacement = this.replacement;
    const options = this.options;

    // Set single document update
    options.multi = false;

    // Execute update
    updateDocuments(server, coll, filter, replacement, options, (err, r) =>
      replaceCallback(err, r, replacement, callback)
    );
  }
}

function replaceCallback(
  err: AnyError | undefined,
  r: Document,
  doc: Document,
  callback: Callback
) {
  if (callback == null) return;
  if (err && callback) return callback(err);
  if (r == null) return callback(undefined, { result: { ok: 1 } });

  r.modifiedCount = r.result.nModified != null ? r.result.nModified : r.result.n;
  r.upsertedId =
    Array.isArray(r.result.upserted) && r.result.upserted.length > 0
      ? r.result.upserted[0] // FIXME(major): should be `r.result.upserted[0]._id`
      : null;
  r.upsertedCount =
    Array.isArray(r.result.upserted) && r.result.upserted.length ? r.result.upserted.length : 0;
  r.matchedCount =
    Array.isArray(r.result.upserted) && r.result.upserted.length > 0 ? 0 : r.result.n;
  r.ops = [doc]; // TODO: Should we still have this?
  if (callback) callback(undefined, r);
}

defineAspects(ReplaceOneOperation, [
  Aspect.RETRYABLE,
  Aspect.WRITE_OPERATION,
  Aspect.EXECUTE_WITH_SELECTION
]);
