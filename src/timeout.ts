import { clearTimeout, setTimeout } from 'timers';

import { MongoInvalidArgumentError } from './error';
import { noop } from './utils';

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
    if (this.timedOut) return -1;
    if (this.duration === 0) return Infinity;
    return this.start + this.duration - Math.trunc(performance.now());
  }

  /** Create a new timeout that expires in `duration` ms */
  private constructor(executor: Executor = () => null, duration: number) {
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
      // Ensure we do not keep the Node.js event loop running
      if (typeof this.id.unref === 'function') {
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

  public static expires(durationMS: number): Timeout {
    return new Timeout(undefined, durationMS);
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

  static min(duration1: number, duration2: number): number {
    if (duration1 === 0) return duration2;
    if (duration2 === 0) return duration1;
    return Math.min(duration1, duration2);
  }
}
