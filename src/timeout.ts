import { clearTimeout, setTimeout } from 'timers';

import { type Document } from './bson';
import { MongoInvalidArgumentError, MongoOperationTimeoutError, MongoRuntimeError } from './error';
import { type ClientSession } from './sessions';
import { addAbortListener, csotMin, kDispose, noop, promiseWithResolvers } from './utils';

/** @internal */
export class TimeoutError extends Error {
  duration: number;
  override get name(): 'TimeoutError' {
    return 'TimeoutError';
  }

  constructor(message: string, options: { cause?: Error; duration: number }) {
    super(message, options);
    this.duration = options.duration;
  }

  static is(error: unknown): error is TimeoutError {
    return (
      error != null && typeof error === 'object' && 'name' in error && error.name === 'TimeoutError'
    );
  }
}

/** @internal */
export type MongoDBTimeoutWrap = { id: NodeJS.Timeout; clearTimeout(): void };
export function clearOnAbortTimeout(
  cb: () => void,
  ms: number,
  closeSignal: AbortSignal
): MongoDBTimeoutWrap {
  if (closeSignal == null) throw new Error('!!!');
  // eslint-disable-next-line no-restricted-syntax
  const id = setTimeout(() => {
    abortListener[kDispose]();
    return cb();
  }, ms);

  if ('unref' in id && typeof id.unref === 'function') {
    // id.unref();
  }

  const abortListener = addAbortListener(closeSignal, function clearId() {
    // eslint-disable-next-line no-restricted-syntax
    clearTimeout(id);
  });

  return {
    id,
    clearTimeout() {
      abortListener[kDispose]();
      // eslint-disable-next-line no-restricted-syntax
      clearTimeout(id);
    }
  };
}

/** The signal will clear the timeout if aborted */
export async function sleep(ms: number, closeSignal: AbortSignal) {
  const { resolve, promise } = promiseWithResolvers<void>();
  clearOnAbortTimeout(resolve, ms, closeSignal);
  return await promise;
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
  private id?: MongoDBTimeoutWrap;

  public readonly start: number;
  public ended: number | null = null;
  public duration: number;
  private timedOut = false;
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
  private constructor(
    executor: Executor = () => null,
    options:
      | { duration: number; closeSignal: AbortSignal; rejection?: Error }
      | { duration: 0; closeSignal: null; rejection?: Error }
  ) {
    const duration = options?.duration ?? 0;
    const rejection = options?.rejection;

    if (duration < 0) {
      throw new MongoInvalidArgumentError('Cannot create a Timeout with a negative duration');
    }

    let reject!: Reject;
    super((_, promiseReject) => {
      reject = promiseReject;

      executor(noop, promiseReject);
    });

    this.duration = duration;
    this.start = Math.trunc(performance.now());

    if (rejection == null && this.duration > 0) {
      if (options.closeSignal == null) {
        throw new Error('You must provide a close signal to timeoutContext');
      }

      this.id = clearOnAbortTimeout(
        () => {
          this.ended = Math.trunc(performance.now());
          this.timedOut = true;
          reject(new TimeoutError(`Expired after ${duration}ms`, { duration }));
        },
        this.duration,
        options.closeSignal
      );
    } else if (rejection != null) {
      this.ended = Math.trunc(performance.now());
      this.timedOut = true;
      reject(rejection);
    }
  }

  /**
   * Clears the underlying timeout. This method is idempotent
   */
  clear(): void {
    this.id?.clearTimeout();
    this.id = undefined;
    this.timedOut = false;
    this.cleared = true;
  }

  throwIfExpired(): void {
    if (this.timedOut) throw new TimeoutError('Timed out', { duration: this.duration });
  }

  public static expires(duration: number, closeSignal: AbortSignal): Timeout {
    return new Timeout(undefined, { duration, closeSignal });
  }

  static override reject(rejection?: Error | undefined): Timeout {
    return new Timeout(undefined, { duration: 0, closeSignal: null, rejection });
  }

  ref() {
    if (this.id != null && 'ref' in this.id && typeof this.id.ref === 'function') {
      this.id.ref();
    }
  }

  unref() {
    if (this.id != null && 'unref' in this.id && typeof this.id.unref === 'function') {
      this.id.unref();
    }
  }
}

/** @internal */
export type TimeoutContextOptions = (LegacyTimeoutContextOptions | CSOTTimeoutContextOptions) & {
  session?: ClientSession;
};

/** @internal */
export type LegacyTimeoutContextOptions = {
  serverSelectionTimeoutMS: number;
  waitQueueTimeoutMS: number;
  socketTimeoutMS?: number;
  closeSignal: AbortSignal;
};

/** @internal */
export type CSOTTimeoutContextOptions = {
  timeoutMS: number;
  serverSelectionTimeoutMS: number;
  socketTimeoutMS?: number;
  closeSignal: AbortSignal;
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
  closeSignal: AbortSignal;
  constructor(options: { closeSignal: AbortSignal }) {
    this.closeSignal = options.closeSignal;
  }

  static create(options: TimeoutContextOptions): TimeoutContext {
    if (options.session?.timeoutContext != null) return options.session?.timeoutContext;
    if (isCSOTTimeoutContextOptions(options)) return new CSOTTimeoutContext(options);
    else if (isLegacyTimeoutContextOptions(options)) return new LegacyTimeoutContext(options);
    else throw new MongoRuntimeError('Unrecognized options');
  }

  abstract get maxTimeMS(): number | null;

  abstract get serverSelectionTimeout(): Timeout | null;

  abstract get connectionCheckoutTimeout(): Timeout | null;

  abstract get clearServerSelectionTimeout(): boolean;

  abstract get timeoutForSocketWrite(): Timeout | null;

  abstract get timeoutForSocketRead(): Timeout | null;

  abstract csotEnabled(): this is CSOTTimeoutContext;

  abstract refresh(): void;

  abstract clear(): void;

  /** Returns a new instance of the TimeoutContext, with all timeouts refreshed and restarted. */
  abstract refreshed(): TimeoutContext;

  abstract addMaxTimeMSToCommand(command: Document, options: { omitMaxTimeMS?: boolean }): void;

  abstract getSocketTimeoutMS(): number | undefined;
}

/** @internal */
export class CSOTTimeoutContext extends TimeoutContext {
  timeoutMS: number;
  serverSelectionTimeoutMS: number;
  socketTimeoutMS?: number;

  clearServerSelectionTimeout: boolean;

  private _serverSelectionTimeout?: Timeout | null;
  private _connectionCheckoutTimeout?: Timeout | null;
  public minRoundTripTime = 0;
  public start: number;

  constructor(options: CSOTTimeoutContextOptions) {
    super(options);
    this.start = Math.trunc(performance.now());

    this.timeoutMS = options.timeoutMS;

    this.serverSelectionTimeoutMS = options.serverSelectionTimeoutMS;

    this.socketTimeoutMS = options.socketTimeoutMS;

    this.clearServerSelectionTimeout = false;
  }

  get maxTimeMS(): number {
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
        return Timeout.reject(
          new MongoOperationTimeoutError(`Timed out in server selection after ${this.timeoutMS}ms`)
        );
      const usingServerSelectionTimeoutMS =
        serverSelectionTimeoutMS !== 0 &&
        csotMin(remainingTimeMS, serverSelectionTimeoutMS) === serverSelectionTimeoutMS;
      if (usingServerSelectionTimeoutMS) {
        this._serverSelectionTimeout = Timeout.expires(serverSelectionTimeoutMS, this.closeSignal);
      } else {
        if (remainingTimeMS > 0 && Number.isFinite(remainingTimeMS)) {
          this._serverSelectionTimeout = Timeout.expires(remainingTimeMS, this.closeSignal);
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
    if (remainingTimeMS > 0) return Timeout.expires(remainingTimeMS, this.closeSignal);
    return Timeout.reject(new MongoOperationTimeoutError('Timed out before socket write'));
  }

  get timeoutForSocketRead(): Timeout | null {
    const { remainingTimeMS } = this;
    if (!Number.isFinite(remainingTimeMS)) return null;
    if (remainingTimeMS > 0) return Timeout.expires(remainingTimeMS, this.closeSignal);
    return Timeout.reject(new MongoOperationTimeoutError('Timed out before socket read'));
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

  /**
   * @internal
   * Throws a MongoOperationTimeoutError if the context has expired.
   * If the context has not expired, returns the `remainingTimeMS`
   **/
  getRemainingTimeMSOrThrow(message?: string): number {
    const { remainingTimeMS } = this;
    if (remainingTimeMS <= 0)
      throw new MongoOperationTimeoutError(message ?? `Expired after ${this.timeoutMS}ms`);
    return remainingTimeMS;
  }

  /**
   * @internal
   * This method is intended to be used in situations where concurrent operation are on the same deadline, but cannot share a single `TimeoutContext` instance.
   * Returns a new instance of `CSOTTimeoutContext` constructed with identical options, but setting the `start` property to `this.start`.
   */
  clone(): CSOTTimeoutContext {
    const timeoutContext = new CSOTTimeoutContext({
      timeoutMS: this.timeoutMS,
      serverSelectionTimeoutMS: this.serverSelectionTimeoutMS,
      closeSignal: this.closeSignal
    });
    timeoutContext.start = this.start;
    return timeoutContext;
  }

  override refreshed(): CSOTTimeoutContext {
    return new CSOTTimeoutContext({
      timeoutMS: this.timeoutMS,
      serverSelectionTimeoutMS: this.serverSelectionTimeoutMS,
      socketTimeoutMS: this.socketTimeoutMS,
      closeSignal: this.closeSignal
    });
  }

  override addMaxTimeMSToCommand(command: Document, options: { omitMaxTimeMS?: boolean }): void {
    if (options.omitMaxTimeMS) return;
    const maxTimeMS = this.remainingTimeMS - this.minRoundTripTime;
    if (maxTimeMS > 0 && Number.isFinite(maxTimeMS)) command.maxTimeMS = maxTimeMS;
  }

  override getSocketTimeoutMS(): number | undefined {
    return 0;
  }
}

/** @internal */
export class LegacyTimeoutContext extends TimeoutContext {
  options: LegacyTimeoutContextOptions;
  clearServerSelectionTimeout: boolean;

  constructor(options: LegacyTimeoutContextOptions) {
    super(options);
    this.options = options;
    this.clearServerSelectionTimeout = true;
  }

  csotEnabled(): this is CSOTTimeoutContext {
    return false;
  }

  get serverSelectionTimeout(): Timeout | null {
    if (this.options.serverSelectionTimeoutMS != null && this.options.serverSelectionTimeoutMS > 0)
      return Timeout.expires(this.options.serverSelectionTimeoutMS, this.closeSignal);
    return null;
  }

  get connectionCheckoutTimeout(): Timeout | null {
    if (this.options.waitQueueTimeoutMS != null && this.options.waitQueueTimeoutMS > 0)
      return Timeout.expires(this.options.waitQueueTimeoutMS, this.closeSignal);
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

  get maxTimeMS() {
    return null;
  }

  override refreshed(): LegacyTimeoutContext {
    return new LegacyTimeoutContext(this.options);
  }

  override addMaxTimeMSToCommand(_command: Document, _options: { omitMaxTimeMS?: boolean }): void {
    // No max timeMS is added to commands in legacy timeout mode.
  }

  override getSocketTimeoutMS(): number | undefined {
    return this.options.socketTimeoutMS;
  }
}
