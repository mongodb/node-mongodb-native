import { type EventEmitter } from 'events';

import { List, promiseWithResolvers } from '../../utils';

type PendingPromises = Omit<
  ReturnType<typeof promiseWithResolvers<IteratorResult<Buffer>>>,
  'promise'
>;

export function onData(emitter: EventEmitter, options: { signal: AbortSignal }) {
  const signal = options.signal;
  signal.throwIfAborted();

  // Preparing controlling queues and variables
  const unconsumedEvents = new List<Buffer>();
  const unconsumedPromises = new List<PendingPromises>();
  let error: Error | null = null;
  let finished = false;

  const iterator: AsyncGenerator<Buffer> = {
    next() {
      // First, we consume all unread events
      const value = unconsumedEvents.shift();
      if (value != null) {
        return Promise.resolve({ value, done: false });
      }

      // Then we error, if an error happened
      // This happens one time if at all, because after 'error'
      // we stop listening
      if (error != null) {
        const p = Promise.reject(error);
        // Only the first element errors
        error = null;
        return p;
      }

      // If the iterator is finished, resolve to done
      if (finished) return closeHandler();

      // Wait until an event happens
      const { promise, resolve, reject } = promiseWithResolvers<IteratorResult<Buffer>>();
      unconsumedPromises.push({ resolve, reject });
      return promise;
    },

    return() {
      return closeHandler();
    },

    throw(err: Error) {
      errorHandler(err);
      return Promise.resolve({ value: undefined, done: true });
    },

    [Symbol.asyncIterator]() {
      return this;
    }
  };

  // Adding event handlers
  emitter.on('data', eventHandler);
  emitter.on('error', errorHandler);
  signal.addEventListener('abort', abortListener, { once: true });

  return iterator;

  function abortListener() {
    errorHandler(signal.reason);
  }

  function eventHandler(value: Buffer) {
    const promise = unconsumedPromises.shift();
    if (promise != null) promise.resolve({ value, done: false });
    else unconsumedEvents.push(value);
  }

  function errorHandler(err: Error) {
    const promise = unconsumedPromises.shift();
    if (promise != null) promise.reject(err);
    else error = err;
    void closeHandler();
  }

  function closeHandler() {
    // Adding event handlers
    emitter.off('data', eventHandler);
    emitter.off('error', errorHandler);
    signal.removeEventListener('abort', abortListener);
    finished = true;
    const doneResult = { value: undefined, done: finished } as const;

    for (const promise of unconsumedPromises) {
      promise.resolve(doneResult);
    }

    return Promise.resolve(doneResult);
  }
}
