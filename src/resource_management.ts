import { ChangeStream } from './change_stream';
import { AbstractCursor } from './cursor/abstract_cursor';
import { MongoClient } from './mongo_client';
import { ClientSession } from './sessions';

/**
 * @public
 * @experimental
 */
export interface AsyncDisposable {
  /** @beta */
  [Symbol.asyncDispose]: () => Promise<void>;
}

/**
 * @beta
 *
 * Attaches `Symbol.asyncDispose` methods to the MongoClient, Cursors, sessions and change streams
 * if Symbol.asyncDispose is defined.
 *
 * It's usually not necessary to call this method - the driver attempts to attach these methods
 * itself when its loaded.  However, sometimes the driver may be loaded before `Symbol.asyncDispose`
 * is defined, in which case it is necessary to call this method directly.  This can happen if the
 * application is polyfilling `Symbol.asyncDispose`.
 *
 * Example:
 *
 * ```typescript
 * import { configureExplicitResourceManagement, MongoClient } from 'mongodb/lib/beta';
 *
 * Symbol.asyncDispose ??= Symbol('dispose');
 * load();
 *
 * await using client = new MongoClient(...);
 * ```
 */
export function configureExplicitResourceManagement() {
  Symbol.asyncDispose &&
    Object.defineProperty(MongoClient.prototype, Symbol.asyncDispose, {
      value: async function asyncDispose(this: { close(): Promise<void> }) {
        await this.close();
      },
      enumerable: false,
      configurable: true,
      writable: true
    });

  Symbol.asyncDispose &&
    Object.defineProperty(AbstractCursor.prototype, Symbol.asyncDispose, {
      value: async function asyncDispose(this: { close(): Promise<void> }) {
        await this.close();
      },
      enumerable: false,
      configurable: true,
      writable: true
    });

  Symbol.asyncDispose &&
    Object.defineProperty(ChangeStream.prototype, Symbol.asyncDispose, {
      value: async function asyncDispose(this: { close(): Promise<void> }) {
        await this.close();
      },
      enumerable: false,
      configurable: true,
      writable: true
    });

  Symbol.asyncDispose &&
    Object.defineProperty(ClientSession.prototype, Symbol.asyncDispose, {
      value: async function asyncDispose(this: { endSession(): Promise<void> }) {
        await this.endSession();
      },
      enumerable: false,
      configurable: true,
      writable: true
    });
}
