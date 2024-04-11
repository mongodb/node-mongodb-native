import { clearTimeout, setTimeout } from 'timers';

import { MongoError } from './error';
import { noop } from './utils';

/** @internal */
export class CSOTError extends MongoError {
  override get name(): 'CSOTError' {
    return 'CSOTError';
  }

  constructor(message: string, options?: { cause?: Error }) {
    super(message, options);
  }

  static is(error: unknown): error is CSOTError {
    return (
      error != null && typeof error === 'object' && 'name' in error && error.name === 'CSOTError'
    );
  }

  static from(error: CSOTError) {
    return new CSOTError(error.message, { cause: error });
  }
}

/** @internal
 * This class is an abstraction over CSOT timeouts, implementing the specification outlined in
 * https://github.com/mongodb/specifications/blob/master/source/client-side-operations-timeout/client-side-operations-timeout.md
 * */
export class Timeout extends Promise<never> {
  get [Symbol.toStringTag](): 'MongoDBTimeout' {
    return 'MongoDBTimeout';
  }

  private expireTimeout: () => void;
  private timeoutError: CSOTError;
  private id: Parameters<typeof clearTimeout>[0];

  public start: number;
  public ended: number | null = null;
  public duration: number;
  public timedOut = false;

  /**
   * Return the amount of time remaining until a CSOTError is thrown
   * */
  public get remainingTime(): number {
    if (this.duration === 0) return Infinity;
    if (this.timedOut) return 0;
    const timePassed = Math.trunc(performance.now()) - this.start;
    return Math.max(0, this.duration - timePassed);
  }

  private constructor(
    executor: ConstructorParameters<typeof Promise<never>>[0] = () => null,
    duration = 0
  ) {
    // for a promise constructed as follows new Promise((resolve: (a) => void, reject: (b) => void){})
    // reject here is of type: typeof(reject)
    let reject!: Parameters<ConstructorParameters<typeof Promise<never>>[0]>[1];

    super((_, promiseReject) => {
      reject = promiseReject;
      executor(noop, promiseReject);
    });

    // NOTE: Construct timeout error at point of Timeout instantiation to preserve stack traces
    this.timeoutError = new CSOTError('Timeout!');

    this.expireTimeout = () => {
      this.ended = Math.trunc(performance.now());
      this.timedOut = true;
      // NOTE: Wrap error here: Why?
      reject(CSOTError.from(this.timeoutError));
    };

    this.duration = duration;
    this.start = Math.trunc(performance.now());
    if (this.duration > 0) {
      this.id = setTimeout(this.expireTimeout, this.duration);
      // I see no reason CSOT should keep Node.js running, that's for the sockets to do
      if (typeof this.id.unref === 'function') {
        this.id.unref();
      }
    }
  }

  public clear(): void {
    clearTimeout(this.id);
    this.id = undefined;
  }

  /** Start the timer over, this only has effect if the timer has not expired. */
  public refresh() {
    if (this.timedOut) return;
    if (this.duration <= 0) return;

    this.start = Math.trunc(performance.now());
    if (
      this.id != null &&
      typeof this.id === 'object' &&
      'refresh' in this.id &&
      typeof this.id?.refresh === 'function'
    ) {
      this.id.refresh();
      return;
    }

    clearTimeout(this.id);
    this.id = setTimeout(this.expireTimeout, this.duration);
    if (typeof this.id.unref === 'function') {
      this.id.unref();
    }
  }

  /**
   * Implement maxTimeMS calculation detailed in https://github.com/mongodb/specifications/blob/master/source/client-side-operations-timeout/client-side-operations-timeout.md#command-execution
   * */
  public getMaxTimeMS(minRoundTripTime: number): any {
    if (!Number.isFinite(this.remainingTime)) return 0;
    if (minRoundTripTime < this.remainingTime) return this.remainingTime - minRoundTripTime;
    throw CSOTError.from(this.timeoutError);
  }

  /** Create a new pending Timeout with the same duration */
  public clone() {
    return Timeout.expires(this.duration);
  }

  /** Create a new timeout that expires in `duration` ms */
  public static expires(duration: number): Timeout {
    return new Timeout(undefined, duration);
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
