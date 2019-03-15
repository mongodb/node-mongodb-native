'use strict';

const Aspect = {
  SKIP_SESSION: Symbol('SKIP_SESSION')
};

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
    throw new TypeError('`execute` must be implemented for Operation subclasses');
  }
}

module.exports = { OperationBase, Aspect };
