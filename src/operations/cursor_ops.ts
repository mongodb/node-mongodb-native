import { MongoError, AnyError } from '../error';
import { CursorState } from '../cursor/core_cursor';
import type { Cursor } from '../cursor';
import type { Callback } from '../utils';
import type { Document } from '../bson';

/** @public */
export type EachCallback = (error?: AnyError, result?: Document | null) => boolean | void;

/**
 * Iterates over all the documents for this cursor. See Cursor.prototype.each for more information.
 *
 * @deprecated Please use forEach instead
 * @param cursor - The Cursor instance on which to run.
 * @param callback - The result callback.
 */
export function each(cursor: Cursor, callback: EachCallback): void {
  if (!callback) throw new MongoError('callback is mandatory');
  if (cursor.isNotified()) return;
  if (cursor.s.state === CursorState.CLOSED || cursor.isDead()) {
    callback(new MongoError('Cursor is closed'));
    return;
  }

  if (cursor.s.state === CursorState.INIT) {
    cursor.s.state = CursorState.OPEN;
  }

  // Define function to avoid global scope escape
  let fn = null;
  // Trampoline all the entries
  if (cursor.bufferedCount() > 0) {
    while ((fn = loop(cursor, callback))) fn(cursor, callback);
    each(cursor, callback);
  } else {
    cursor.next((err, item) => {
      if (err) return callback(err);
      if (item == null) {
        return cursor.close({ skipKillCursors: true }, () => callback(undefined, null));
      }

      if (callback(undefined, item) === false) return;
      each(cursor, callback);
    });
  }
}

/** Trampoline emptying the number of retrieved items without incurring a nextTick operation */
function loop(cursor: Cursor, callback: Callback) {
  // No more items we are done
  if (cursor.bufferedCount() === 0) return;
  // Get the next document
  cursor._next(callback);
  // Loop
  return loop;
}

/**
 * Returns an array of documents. See Cursor.prototype.toArray for more information.
 *
 * @param cursor - The Cursor instance from which to get the next document.
 */
export function toArray(cursor: Cursor, callback: Callback<Document[]>): void {
  const items: Document[] = [];

  // Reset cursor
  cursor.rewind();
  cursor.s.state = CursorState.INIT;

  // Fetch all the documents
  const fetchDocs = () => {
    cursor._next((err, doc) => {
      if (err) {
        return callback(err);
      }

      if (doc == null) {
        return cursor.close({ skipKillCursors: true }, () => callback(undefined, items));
      }

      // Add doc to items
      items.push(doc);

      // Get all buffered objects
      if (cursor.bufferedCount() > 0) {
        let docs = cursor.readBufferedDocuments(cursor.bufferedCount());

        // Transform the doc if transform method added
        if (cursor.s.transforms && typeof cursor.s.transforms.doc === 'function') {
          docs = docs.map(cursor.s.transforms.doc);
        }

        items.push(...docs);
      }

      // Attempt a fetch
      fetchDocs();
    });
  };

  fetchDocs();
}
