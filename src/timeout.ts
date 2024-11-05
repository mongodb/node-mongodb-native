import { clearTimeout, setTimeout } from 'timers';

import { MongoInvalidArgumentError, MongoRuntimeError } from './error';
import { csotMin, noop } from './utils';

/** @internal */
export class TimeoutError extends Error {
  override get name(): 'TimeoutError' {
    return 'TimeoutError';
  }

  constructor(message: string, options?: { cause?: Error }) {
    super(message, options);
  }

  static is(error: unknown): error is TimeoutError {
    return (
      error != null && typeof error === 'object' && 'name' in error && error.name === 'TimeoutError'
    );
  }
}

type Executor = ConstructorParameters<typeof Promise<never>>[0];
type Reject = Parameters<ConstructorParameters<typeof Promise<never>>[0]>[1];
/**
 * @internal
 * This class is an abstraction over timeouts
 * The Timeout class can only be in the pending or rejected states. It is guaranteed not to resolve
 * if interacted with exclusively through its public API
 * */
export class Timeout extends Promise<never> {
  get [Symbol.toStringTag](): 'MongoDBTimeout' {
    return 'MongoDBTimeout';
  }

  private id?: NodeJS.Timeout;

  public readonly start: number;
  public ended: number | null = null;
  public duration: number;
  public timedOut = false;

  get remainingTime(): number {
    if (this.timedOut) return 0;
    if (this.duration === 0) return Infinity;
    return this.start + this.duration - Math.trunc(performance.now());
  }

  get timeElapsed(): number {
    return Math.trunc(performance.now()) - this.start;
  }

  /** Create a new timeout that expires in `duration` ms */
  private constructor(executor: Executor = () => null, duration: number, unref = false) {
    let reject!: Reject;

    if (duration < 0) {
      throw new MongoInvalidArgumentError('Cannot create a Timeout with a negative duration');
    }

    super((_, promiseReject) => {
      reject = promiseReject;

      executor(noop, promiseReject);
    });

    this.duration = duration;
    this.start = Math.trunc(performance.now());

    if (this.duration > 0) {
      this.id = setTimeout(() => {
        this.ended = Math.trunc(performance.now());
        this.timedOut = true;
        reject(new TimeoutError(`Expired after ${duration}ms`));
      }, this.duration);
      if (typeof this.id.unref === 'function' && unref) {
        // Ensure we do not keep the Node.js event loop running
        this.id.unref();
      }
    }
  }

  /**
   * Clears the underlying timeout. This method is idempotent
   */
  clear(): void {
    clearTimeout(this.id);
    this.id = undefined;
  }

  throwIfExpired(): void {
    if (this.timedOut) throw new TimeoutError('Timed out');
  }

  public static expires(durationMS: number, unref?: boolean): Timeout {
    return new Timeout(undefined, durationMS, unref);
  }

  static is(timeout: unknown): timeout is Timeout {
    return (
      typeof timeout === 'object' &&
      timeout != null &&
      Symbol.toStringTag in timeout &&
      timeout[Symbol.toStringTag] === 'MongoDBTimeout' &&
      'then' in timeout &&
      typeof timeout.then === 'function'
    );
  }
}

/** @internal */
export type TimeoutContextOptions = LegacyTimeoutContextOptions | CSOTTimeoutContextOptions;

/** @internal */
export type LegacyTimeoutContextOptions = {
  serverSelectionTimeoutMS: number;
  waitQueueTimeoutMS: number;
  socketTimeoutMS?: number;
};

/** @internal */
export type CSOTTimeoutContextOptions = {
  timeoutMS: number;
  serverSelectionTimeoutMS: number;
  socketTimeoutMS?: number;
};

function isLegacyTimeoutContextOptions(v: unknown): v is LegacyTimeoutContextOptions {
  return (
    v != null &&
    typeof v === 'object' &&
    'serverSelectionTimeoutMS' in v &&
    typeof v.serverSelectionTimeoutMS === 'number' &&
    'waitQueueTimeoutMS' in v &&
    typeof v.waitQueueTimeoutMS === 'number'
  );
}

function isCSOTTimeoutContextOptions(v: unknown): v is CSOTTimeoutContextOptions {
  return (
    v != null &&
    typeof v === 'object' &&
    'serverSelectionTimeoutMS' in v &&
    typeof v.serverSelectionTimeoutMS === 'number' &&
    'timeoutMS' in v &&
    typeof v.timeoutMS === 'number'
  );
}

/** @internal */
export abstract class TimeoutContext {
  static create(options: TimeoutContextOptions): TimeoutContext {
    if (isCSOTTimeoutContextOptions(options)) return new CSOTTimeoutContext(options);
    else if (isLegacyTimeoutContextOptions(options)) return new LegacyTimeoutContext(options);
    else throw new MongoRuntimeError('Unrecognized options');
  }

  abstract get serverSelectionTimeout(): Timeout | null;

  abstract get connectionCheckoutTimeout(): Timeout | null;

  abstract get clearServerSelectionTimeout(): boolean;

  abstract get clearConnectionCheckoutTimeout(): boolean;

  abstract csotEnabled(): this is CSOTTimeoutContext;
}

/** @internal */
export class CSOTTimeoutContext extends TimeoutContext {
  timeoutMS: number;
  serverSelectionTimeoutMS: number;
  socketTimeoutMS?: number;

  clearConnectionCheckoutTimeout: boolean;
  clearServerSelectionTimeout: boolean;

  private _maxTimeMS?: number;

  private _serverSelectionTimeout?: Timeout | null;
  private _connectionCheckoutTimeout?: Timeout | null;

  constructor(options: CSOTTimeoutContextOptions) {
    super();
    this.timeoutMS = options.timeoutMS;

    this.serverSelectionTimeoutMS = options.serverSelectionTimeoutMS;

    this.socketTimeoutMS = options.socketTimeoutMS;

    this.clearServerSelectionTimeout = false;
    this.clearConnectionCheckoutTimeout = true;
  }

  get maxTimeMS(): number {
    return this._maxTimeMS ?? -1;
  }

  set maxTimeMS(v: number) {
    this._maxTimeMS = v;
  }

  csotEnabled(): this is CSOTTimeoutContext {
    return true;
  }

  get serverSelectionTimeout(): Timeout | null {
    // check for undefined
    if (typeof this._serverSelectionTimeout !== 'object') {
      const usingServerSelectionTimeoutMS =
        this.serverSelectionTimeoutMS !== 0 &&
        csotMin(this.timeoutMS, this.serverSelectionTimeoutMS) === this.serverSelectionTimeoutMS;

      if (usingServerSelectionTimeoutMS) {
        this._serverSelectionTimeout = Timeout.expires(this.serverSelectionTimeoutMS);
      } else {
        if (this.timeoutMS > 0) {
          this._serverSelectionTimeout = Timeout.expires(this.timeoutMS);
        } else {
          this._serverSelectionTimeout = null;
        }
      }
    }

    return this._serverSelectionTimeout;
  }

  get connectionCheckoutTimeout(): Timeout | null {
    if (typeof this._connectionCheckoutTimeout !== 'object') {
      if (typeof this._serverSelectionTimeout === 'object') {
        // null or Timeout
        this._connectionCheckoutTimeout = this._serverSelectionTimeout;
      } else {
        throw new MongoRuntimeError(
          'Unreachable. If you are seeing this error, please file a ticket on the NODE driver project on Jira'
        );
      }
    }
    return this._connectionCheckoutTimeout;
  }
}

/** @internal */
export class LegacyTimeoutContext extends TimeoutContext {
  options: LegacyTimeoutContextOptions;
  clearServerSelectionTimeout: boolean;
  clearConnectionCheckoutTimeout: boolean;

  constructor(options: LegacyTimeoutContextOptions) {
    super();
    this.options = options;
    this.clearServerSelectionTimeout = true;
    this.clearConnectionCheckoutTimeout = true;
  }

  csotEnabled(): this is CSOTTimeoutContext {
    return false;
  }

  get serverSelectionTimeout(): Timeout | null {
    if (this.options.serverSelectionTimeoutMS != null && this.options.serverSelectionTimeoutMS > 0)
      return Timeout.expires(this.options.serverSelectionTimeoutMS);
    return null;
  }

  get connectionCheckoutTimeout(): Timeout | null {
    if (this.options.waitQueueTimeoutMS != null && this.options.waitQueueTimeoutMS > 0)
      return Timeout.expires(this.options.waitQueueTimeoutMS);
    return null;
  }
}
