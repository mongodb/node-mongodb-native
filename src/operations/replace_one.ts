import { defineAspects, Aspect } from './operation';
import { updateDocuments } from './common_functions';
import { hasAtomicOperators } from '../utils';
import { CommandOperation, CommandOperationOptions } from './command';
import type { Callback, Document, AnyError } from '../types';
import type { Server } from '../sdam/server';
import type { Collection } from '../collection';
import type { CollationOptions } from '../cmap/wire_protocol/write_command';

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

export class ReplaceOneOperation extends CommandOperation<ReplaceOptions> {
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
