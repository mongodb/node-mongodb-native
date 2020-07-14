import { handleCallback } from '../utils';
import { MongoError } from '../error';
import { CursorState } from '../cursor/core_cursor';
const push = Array.prototype.push;

/**
 * Iterates over all the documents for this cursor. See Cursor.prototype.each for more information.
 *
 * @function
 * @deprecated
 * @param {Cursor} cursor The Cursor instance on which to run.
 * @param {Cursor~resultCallback} callback The result callback.
 */
function each(cursor: any, callback: Function) {
  if (!callback) throw MongoError.create({ message: 'callback is mandatory', driver: true });
  if (cursor.isNotified()) return;
  if (cursor.s.state === CursorState.CLOSED || cursor.isDead()) {
    return handleCallback(
      callback,
      MongoError.create({ message: 'Cursor is closed', driver: true })
    );
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
    cursor.next((err?: any, item?: any) => {
      if (err) return handleCallback(callback, err);
      if (item == null) {
        return cursor.close({ skipKillCursors: true }, () => handleCallback(callback, null, null));
      }

      if (handleCallback(callback, null, item) === false) return;
      each(cursor, callback);
    });
  }
}

// Trampoline emptying the number of retrieved items
// without incurring a nextTick operation
function loop(cursor: any, callback: Function) {
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
 * @function
 * @param {Cursor} cursor The Cursor instance from which to get the next document.
 * @param {Cursor~toArrayResultCallback} [callback] The result callback.
 */
function toArray(cursor: any, callback: Function) {
  const items: any = [];

  // Reset cursor
  cursor.rewind();
  cursor.s.state = CursorState.INIT;

  // Fetch all the documents
  const fetchDocs = () => {
    cursor._next((err?: any, doc?: any) => {
      if (err) {
        return handleCallback(callback, err);
      }

      if (doc == null) {
        return cursor.close({ skipKillCursors: true }, () => handleCallback(callback, null, items));
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

        push.apply(items, docs);
      }

      // Attempt a fetch
      fetchDocs();
    });
  };

  fetchDocs();
}

export { each, toArray };
