import { ReadPreference, ReadPreferenceLike } from '../read_preference';
import type { ClientSession } from '../sessions';
import { Document, BSONSerializeOptions, resolveBSONOptions } from '../bson';
import type { MongoDBNamespace, Callback } from '../utils';
import type { Server } from '../sdam/server';

export const Aspect = {
  READ_OPERATION: Symbol('READ_OPERATION'),
  WRITE_OPERATION: Symbol('WRITE_OPERATION'),
  RETRYABLE: Symbol('RETRYABLE'),
  EXPLAINABLE: Symbol('EXPLAINABLE')
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
}

/**
 * This class acts as a parent class for any operation and is responsible for setting this.options,
 * as well as setting and getting a session.
 * Additionally, this class implements `hasAspect`, which determines whether an operation has
 * a specific aspect.
 * @internal
 */
export abstract class OperationBase<
  T extends OperationOptions = OperationOptions,
  TResult = Document
> {
  options: T;
  ns!: MongoDBNamespace;
  cmd!: Document;
  readPreference: ReadPreference;
  server!: Server;
  fullResponse?: boolean;

  // BSON serialization options
  bsonOptions?: BSONSerializeOptions;

  constructor(options: T = {} as T) {
    this.options = Object.assign({}, options);

    this.readPreference = this.hasAspect(Aspect.WRITE_OPERATION)
      ? ReadPreference.primary
      : ReadPreference.fromOptions(options) ?? ReadPreference.primary;
    // TODO: A lot of our code depends on having the read preference in the options. This should
    //       go away, but also requires massive test rewrites.
    this.options.readPreference = this.readPreference;

    // Pull the BSON serialize options from the already-resolved options
    this.bsonOptions = resolveBSONOptions(options);
  }

  abstract execute(server: Server, callback: Callback<TResult>): void;

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
    // NOTE: Using the bang operator here because we know there is always a
    //       session, explicit or implicit. We should disambiguate the session
    //       from the options and set it as an explicit field
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return this.options.session!;
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
