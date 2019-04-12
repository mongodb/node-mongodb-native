'use strict';

const Aspect = require('./operation').Aspect;
const CoreCursor = require('mongodb-core').Cursor;
const defineAspects = require('./operation').defineAspects;
const OperationBase = require('./operation').OperationBase;

class ExplainOperation extends OperationBase {
  constructor(cursor) {
    super();

    this.cursor = cursor;
  }

  execute() {
    const cursor = this.cursor;

    if (cursor._initImplicitSession) {
      cursor._initImplicitSession();
    }
    return CoreCursor.prototype.next.apply(cursor, arguments);
  }
}

defineAspects(ExplainOperation, Aspect.SKIP_SESSION);

module.exports = ExplainOperation;
