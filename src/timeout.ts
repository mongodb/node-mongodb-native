import { clearTimeout, setTimeout } from 'timers';

import { type CursorTimeoutMode } from './cursor/abstract_cursor';
import { MongoInvalidArgumentError, MongoOperationTimeoutError, MongoRuntimeError } from './error';
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
  public cleared = false;

  get remainingTime(): number {
    if (this.timedOut) return 0;
    if (this.duration === 0) return Infinity;
    return this.start + this.duration - Math.trunc(performance.now());
  }

  get timeElapsed(): number {
    return Math.trunc(performance.now()) - this.start;
  }

  /** Create a new timeout that expires in `duration` ms */
  private constructor(executor: Executor = () => null, duration: number, unref = true) {
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
    this.cleared = true;
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
      // eslint-disable-next-line github/no-then
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
  cursorTimeoutMode?: CursorTimeoutMode;
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

  abstract get timeoutForSocketWrite(): Timeout | null;

  abstract get timeoutForSocketRead(): Timeout | null;

  abstract csotEnabled(): this is CSOTTimeoutContext;

  abstract refresh(): void;

  abstract clear(): void;
}

/** @internal */
export class CSOTTimeoutContext extends TimeoutContext {
  timeoutMS: number;
  serverSelectionTimeoutMS: number;
  socketTimeoutMS?: number;

  clearConnectionCheckoutTimeout: boolean;
  clearServerSelectionTimeout: boolean;
  cursorTimeoutMode?: CursorTimeoutMode;

  private _serverSelectionTimeout?: Timeout | null;
  private _connectionCheckoutTimeout?: Timeout | null;
  public minRoundTripTime = 0;
  private start: number;

  constructor(options: CSOTTimeoutContextOptions) {
    super();
    this.start = Math.trunc(performance.now());

    this.timeoutMS = options.timeoutMS;

    this.serverSelectionTimeoutMS = options.serverSelectionTimeoutMS;

    this.socketTimeoutMS = options.socketTimeoutMS;
    this.cursorTimeoutMode = options.cursorTimeoutMode;

    this.clearServerSelectionTimeout = false;
    this.clearConnectionCheckoutTimeout = true;
  }

  get maxTimeMS(): number {
    console.log(this.remainingTimeMS, this.minRoundTripTime);
    return this.remainingTimeMS - this.minRoundTripTime;
  }

  get remainingTimeMS() {
    const timePassed = Math.trunc(performance.now()) - this.start;
    return this.timeoutMS <= 0 ? Infinity : this.timeoutMS - timePassed;
  }

  csotEnabled(): this is CSOTTimeoutContext {
    return true;
  }

  get serverSelectionTimeout(): Timeout | null {
    // check for undefined
    if (typeof this._serverSelectionTimeout !== 'object' || this._serverSelectionTimeout?.cleared) {
      const { remainingTimeMS, serverSelectionTimeoutMS } = this;
      if (remainingTimeMS <= 0)
        throw new MongoOperationTimeoutError(
          `Timed out in server selection after ${this.timeoutMS}ms`
        );
      const usingServerSelectionTimeoutMS =
        serverSelectionTimeoutMS !== 0 &&
        csotMin(remainingTimeMS, serverSelectionTimeoutMS) === serverSelectionTimeoutMS;
      if (usingServerSelectionTimeoutMS) {
        this._serverSelectionTimeout = Timeout.expires(serverSelectionTimeoutMS);
      } else {
        if (remainingTimeMS > 0 && Number.isFinite(remainingTimeMS)) {
          this._serverSelectionTimeout = Timeout.expires(remainingTimeMS);
        } else {
          this._serverSelectionTimeout = null;
        }
      }
    }

    return this._serverSelectionTimeout;
  }

  get connectionCheckoutTimeout(): Timeout | null {
    if (
      typeof this._connectionCheckoutTimeout !== 'object' ||
      this._connectionCheckoutTimeout?.cleared
    ) {
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

  get timeoutForSocketWrite(): Timeout | null {
    const { remainingTimeMS } = this;
    if (!Number.isFinite(remainingTimeMS)) return null;
    if (remainingTimeMS > 0) return Timeout.expires(remainingTimeMS);
    throw new MongoOperationTimeoutError('Timed out before socket write');
  }

  get timeoutForSocketRead(): Timeout | null {
    const { remainingTimeMS } = this;
    if (!Number.isFinite(remainingTimeMS)) return null;
    if (remainingTimeMS > 0) return Timeout.expires(remainingTimeMS);
    throw new MongoOperationTimeoutError('Timed out before socket read');
  }

  refresh(): void {
    this.start = Math.trunc(performance.now());
    this.minRoundTripTime = 0;
    this._serverSelectionTimeout?.clear();
    this._connectionCheckoutTimeout?.clear();
  }

  clear(): void {
    this._serverSelectionTimeout?.clear();
    this._connectionCheckoutTimeout?.clear();
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

  get timeoutForSocketWrite(): Timeout | null {
    return null;
  }

  get timeoutForSocketRead(): Timeout | null {
    return null;
  }

  refresh(): void {
    return;
  }

  clear(): void {
    return;
  }
}
