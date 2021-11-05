import { ReadPreference, ReadPreferenceLike } from '../read_preference';
import type { ClientSession } from '../sessions';
import { Document, BSONSerializeOptions, resolveBSONOptions } from '../bson';
import type { MongoDBNamespace, Callback } from '../utils';
import type { Server } from '../sdam/server';

export const Aspect = {
  READ_OPERATION: Symbol('READ_OPERATION'),
  WRITE_OPERATION: Symbol('WRITE_OPERATION'),
  RETRYABLE: Symbol('RETRYABLE'),
  EXPLAINABLE: Symbol('EXPLAINABLE'),
  SKIP_COLLATION: Symbol('SKIP_COLLATION'),
  CURSOR_CREATING: Symbol('CURSOR_CREATING')
} as const;

/** @public */
export type Hint = string | Document;

export interface OperationConstructor extends Function {
  aspects?: Set<symbol>;
}

/** @public */
export interface OperationOptions extends BSONSerializeOptions {
  /** Specify ClientSession for this command */
  session?: ClientSession;
  willRetryWrites?: boolean;

  /** The preferred read preference (ReadPreference.primary, ReadPreference.primary_preferred, ReadPreference.secondary, ReadPreference.secondary_preferred, ReadPreference.nearest). */
  readPreference?: ReadPreferenceLike;

  /** @internal Hints to `executeOperation` that this operation should not unpin on an ended transaction */
  bypassPinningCheck?: boolean;
  omitReadPreference?: boolean;
}

/** @internal */
const kSession = Symbol('session');

/**
 * This class acts as a parent class for any operation and is responsible for setting this.options,
 * as well as setting and getting a session.
 * Additionally, this class implements `hasAspect`, which determines whether an operation has
 * a specific aspect.
 * @internal
 */
export abstract class AbstractOperation<TResult = any> {
  ns!: MongoDBNamespace;
  cmd!: Document;
  readPreference: ReadPreference;
  server!: Server;
  bypassPinningCheck: boolean;
  trySecondaryWrite: boolean;

  // BSON serialization options
  bsonOptions?: BSONSerializeOptions;

  // TODO: Each operation defines its own options, there should be better typing here
  options: Document;

  [kSession]: ClientSession;

  constructor(options: OperationOptions = {}) {
    this.readPreference = this.hasAspect(Aspect.WRITE_OPERATION)
      ? ReadPreference.primary
      : ReadPreference.fromOptions(options) ?? ReadPreference.primary;

    // Pull the BSON serialize options from the already-resolved options
    this.bsonOptions = resolveBSONOptions(options);

    if (options.session) {
      this[kSession] = options.session;
    }

    this.options = options;
    this.bypassPinningCheck = !!options.bypassPinningCheck;
    this.trySecondaryWrite = false;
  }

  abstract execute(server: Server, session: ClientSession, callback: Callback<TResult>): void;

  hasAspect(aspect: symbol): boolean {
    const ctor = this.constructor as OperationConstructor;
    if (ctor.aspects == null) {
      return false;
    }

    return ctor.aspects.has(aspect);
  }

  get session(): ClientSession {
    return this[kSession];
  }

  get canRetryRead(): boolean {
    return true;
  }

  get canRetryWrite(): boolean {
    return true;
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
