'use strict';

const Aspect = require('./operation').Aspect;
const defineAspects = require('./operation').defineAspects;
const OperationBase = require('./operation').OperationBase;
const nextObject = require('./common_functions').nextObject;

class NextOperation extends OperationBase {
  constructor(cursor) {
    super();

    this.cursor = cursor;
  }

  execute(callback) {
    const cursor = this.cursor;

    // Return the currentDoc if someone called hasNext first
    if (cursor.s.currentDoc) {
      const doc = cursor.s.currentDoc;
      cursor.s.currentDoc = null;
      return callback(null, doc);
    }

    // Return the next object
    nextObject(cursor, callback);
  }
}

defineAspects(NextOperation, Aspect.SKIP_SESSION);

module.exports = NextOperation;
