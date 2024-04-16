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

  static from(error: TimeoutError) {
    return new TimeoutError(error.message, { cause: error });
  }
}

type Executor = ConstructorParameters<typeof Promise<never>>[0];
type Reject = Parameters<ConstructorParameters<typeof Promise<never>>[0]>[1];
/** @internal
 * This class is an abstraction over timeouts, implementing portions of the specification outlined in
 * https://github.com/mongodb/specifications/blob/master/source/client-side-operations-timeout/client-side-operations-timeout.md
 * The Timeout class can only be in the pending or rejected states. It is guaranteed not to resolve
 * if interacted with exclusively through its public API
 * */
export class Timeout extends Promise<never> {
  get [Symbol.toStringTag](): 'MongoDBTimeout' {
    return 'MongoDBTimeout';
  }

  private timeoutError: TimeoutError;
  private id?: NodeJS.Timeout;

  public readonly start: number;
  public ended: number | null = null;
  public duration: number;
  public timedOut = false;

  /**
   * Return the amount of time remaining until a TimeoutError is thrown
   * */
  public get remainingTime(): number {
    if (this.duration === 0) return Infinity;
    if (this.timedOut) return 0;
    const timePassed = Math.trunc(performance.now()) - this.start;
    return Math.max(0, this.duration - timePassed);
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

    // NOTE: Construct timeout error at point of Timeout instantiation to preserve stack traces
    // TODO(NODE-5679): Come up with better default message for CSOT error
    this.timeoutError = new TimeoutError('Timeout!');

    this.duration = duration;
    this.start = Math.trunc(performance.now());

    if (this.duration > 0) {
      this.id = setTimeout(() => {
        this.ended = Math.trunc(performance.now());
        this.timedOut = true;
        reject(this.timeoutError);
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
}
