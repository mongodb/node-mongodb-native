import type { ClientSession } from '../sessions';
import type { Document } from '../types';

export const Aspect = {
  READ_OPERATION: Symbol('READ_OPERATION'),
  WRITE_OPERATION: Symbol('WRITE_OPERATION'),
  RETRYABLE: Symbol('RETRYABLE'),
  EXECUTE_WITH_SELECTION: Symbol('EXECUTE_WITH_SELECTION'),
  NO_INHERIT_OPTIONS: Symbol('NO_INHERIT_OPTIONS')
} as const;

export type Hint = string | Document;

export interface OperationConstructor extends Function {
  aspects?: Set<symbol>;
}
export interface OperationOptions {
  multi?: boolean;
  session?: ClientSession;
}

/**
 * This class acts as a parent class for any operation and is responsible for setting this.options,
 * as well as setting and getting a session.
 * Additionally, this class implements `hasAspect`, which determines whether an operation has
 * a specific aspect.
 */
export class OperationBase {
  options: any;

  constructor(options: any) {
    this.options = Object.assign({}, options);
  }

  hasAspect(aspect: symbol): boolean {
    const ctor = this.constructor as OperationConstructor;
    if (ctor.aspects == null) {
      return false;
    }

    return ctor.aspects.has(aspect);
  }

  set session(session: ClientSession) {
    Object.assign(this.options, { session });
  }

  get session(): ClientSession {
    return this.options.session;
  }

  clearSession(): void {
    delete this.options.session;
  }

  get canRetryRead(): boolean {
    return true;
  }

  get canRetryWrite(): boolean {
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

export function defineAspects(
  operation: OperationConstructor,
  aspects: symbol | symbol[] | Set<symbol>
): Set<symbol> {
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
