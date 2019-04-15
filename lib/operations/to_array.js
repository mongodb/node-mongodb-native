'use strict';

const Aspect = require('./operation').Aspect;
const defineAspects = require('./operation').defineAspects;
const handleCallback = require('../utils').handleCallback;
const loadCursor = require('../dynamic_loaders').loadCursor;
const OperationBase = require('./operation').OperationBase;
const push = Array.prototype.push;

class ToArrayOperation extends OperationBase {
  constructor(cursor) {
    super();

    this.cursor = cursor;
  }

  execute(callback) {
    const cursor = this.cursor;

    let Cursor = loadCursor();

    const items = [];

    // Reset cursor
    cursor.rewind();
    cursor.s.state = Cursor.INIT;

    // Fetch all the documents
    const fetchDocs = () => {
      cursor._next((err, doc) => {
        if (err) {
          return cursor._endSession
            ? cursor._endSession(() => handleCallback(callback, err))
            : handleCallback(callback, err);
        }
        if (doc == null) {
          return cursor.close({ skipKillCursors: true }, () =>
            handleCallback(callback, null, items)
          );
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
}

defineAspects(ToArrayOperation, Aspect.SKIP_SESSION);

module.exports = ToArrayOperation;
