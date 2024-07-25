import { AbstractCursor, ChangeStream } from './beta';
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
 * @public
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
 * import { load, MongoClient } from 'mongodb/beta';
 *
 * Symbol.asyncDispose ??= Symbol('dispose');
 * load();
 *
 * await using client = new MongoClient(...);
 * ```
 */
export function configureExplicitResourceManagement() {
  Symbol.asyncDispose &&
    (MongoClient.prototype[Symbol.asyncDispose] = async function () {
      await this.close();
    });

  Symbol.asyncDispose &&
    (ClientSession.prototype[Symbol.asyncDispose] = async function () {
      await this.endSession({ force: true });
    });

  Symbol.asyncDispose &&
    (AbstractCursor.prototype[Symbol.asyncDispose] = async function () {
      await this.close();
    });

  Symbol.asyncDispose &&
    (ChangeStream.prototype[Symbol.asyncDispose] = async function () {
      await this.close();
    });
}
