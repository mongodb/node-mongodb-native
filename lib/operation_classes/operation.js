'use strict';

const Aspects = {
  SKIP_SESSION: Symbol('SKIP_SESSION')
};

class Operation {
  constructor(options) {
    /*
    if (this.constructor.aspects == null) {
      throw new TypeError('Operations must have aspects.');
    }
    */

    this.options = options || {};
  }

  hasAspect(aspect) {
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

module.exports = { Operation, Aspects };
