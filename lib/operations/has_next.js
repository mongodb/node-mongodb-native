'use strict';

const Aspect = require('./operation').Aspect;
const defineAspects = require('./operation').defineAspects;
const loadCursor = require('../dynamic_loaders').loadCursor;
const OperationBase = require('./operation').OperationBase;
const nextObject = require('./common_functions').nextObject;

class HasNextOperation extends OperationBase {
  constructor(cursor) {
    super();

    this.cursor = cursor;
  }

  execute(callback) {
    const cursor = this.cursor;
    let Cursor = loadCursor();

    if (cursor.s.currentDoc) {
      return callback(null, true);
    }

    if (cursor.isNotified()) {
      return callback(null, false);
    }

    nextObject(cursor, (err, doc) => {
      if (err) return callback(err, null);
      if (cursor.s.state === Cursor.CLOSED || cursor.isDead()) return callback(null, false);
      if (!doc) return callback(null, false);
      cursor.s.currentDoc = doc;
      callback(null, true);
    });
  }
}

defineAspects(HasNextOperation, Aspect.SKIP_SESSION);

module.exports = HasNextOperation;
