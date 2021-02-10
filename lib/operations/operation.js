'use strict';

const Explain = require('../explain').Explain;
const MongoError = require('../core/error').MongoError;

const Aspect = {
  READ_OPERATION: Symbol('READ_OPERATION'),
  WRITE_OPERATION: Symbol('WRITE_OPERATION'),
  RETRYABLE: Symbol('RETRYABLE'),
  EXECUTE_WITH_SELECTION: Symbol('EXECUTE_WITH_SELECTION'),
  NO_INHERIT_OPTIONS: Symbol('NO_INHERIT_OPTIONS'),
  EXPLAINABLE: Symbol('EXPLAINABLE')
};

/**
 * This class acts as a parent class for any operation and is responsible for setting this.options,
 * as well as setting and getting a session.
 * Additionally, this class implements `hasAspect`, which determines whether an operation has
 * a specific aspect.
 */
class OperationBase {
  constructor(options) {
    this.options = Object.assign({}, options);

    if (this.hasAspect(Aspect.EXPLAINABLE)) {
      this.explain = Explain.fromOptions(options);
    } else if (this.options.explain !== undefined) {
      throw new MongoError(`explain is not supported on this command`);
    }
  }

  hasAspect(aspect) {
    if (this.constructor.aspects == null) {
      return false;
    }
    return this.constructor.aspects.has(aspect);
  }

  set session(session) {
    Object.assign(this.options, { session });
  }

  get session() {
    return this.options.session;
  }

  clearSession() {
    delete this.options.session;
  }

  get canRetryRead() {
    return true;
  }

  execute() {
    throw new TypeError('`execute` must be implemented for OperationBase subclasses');
  }
}

function defineAspects(operation, aspects) {
  if (!Array.isArray(aspects) && !(aspects instanceof Set)) {
    aspects = [aspects];
  }
  aspects = new Set(aspects);
  Object.defineProperty(operation, 'aspects', {
    value: aspects,
    writable: false
  });
  return aspects;
}

module.exports = {
  Aspect,
  defineAspects,
  OperationBase
};
