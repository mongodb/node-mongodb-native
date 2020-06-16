'use strict';

const Aspect = {
  READ_OPERATION: Symbol('READ_OPERATION'),
  WRITE_OPERATION: Symbol('WRITE_OPERATION'),
  RETRYABLE: Symbol('RETRYABLE'),
  EXECUTE_WITH_SELECTION: Symbol('EXECUTE_WITH_SELECTION')
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
  }

  hasAspect(aspect) {
    const ctor = this.constructor;
    if (ctor.aspects == null) {
      return false;
    }

    return ctor.aspects.has(aspect);
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

  /**
   * @param {any} [server]
   * @param {any} [callback]
   */
  // eslint-disable-next-line
  execute(server, callback) {
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
