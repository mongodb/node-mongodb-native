'use strict';

const Aspect = {
  SKIP_SESSION: Symbol('SKIP_SESSION'),
  EXECUTE_WITH_SELECTION: Symbol('EXECUTE_WITH_SELECTION')
};

/**
 * This class acts as a parent class for any operation and is responsible for setting this.options,
 * as well as setting and getting a session.
 * Additionally, this class implements `hasAspect`, which determines whether an operation has
 * a specific aspect, including `SKIP_SESSION` and other aspects to encode retryability
 * and other functionality.
 */
class OperationBase {
  constructor(options) {
    this.options = options || {};
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
