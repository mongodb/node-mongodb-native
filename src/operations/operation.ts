import type { Document } from '../types';

const Aspect = {
  READ_OPERATION: Symbol('READ_OPERATION'),
  WRITE_OPERATION: Symbol('WRITE_OPERATION'),
  RETRYABLE: Symbol('RETRYABLE'),
  EXECUTE_WITH_SELECTION: Symbol('EXECUTE_WITH_SELECTION'),
  NO_INHERIT_OPTIONS: Symbol('NO_INHERIT_OPTIONS')
};

/**
 * This class acts as a parent class for any operation and is responsible for setting this.options,
 * as well as setting and getting a session.
 * Additionally, this class implements `hasAspect`, which determines whether an operation has
 * a specific aspect.
 */
class OperationBase {
  options: any;
  cmd?: Document;

  constructor(options: any) {
    this.options = Object.assign({}, options);
  }

  hasAspect(aspect: any) {
    const ctor: any = this.constructor;
    if (ctor.aspects == null) {
      return false;
    }

    return ctor.aspects.has(aspect);
  }

  set session(session: any) {
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

  get canRetryWrite() {
    return true;
  }

  /**
   * @param {any} [server]
   * @param {any} [callback]
   */
  // eslint-disable-next-line
  execute(server?: any, callback?: any) {
    throw new TypeError('`execute` must be implemented for OperationBase subclasses');
  }
}

function defineAspects(operation: any, aspects: any) {
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

export { Aspect, defineAspects, OperationBase };
