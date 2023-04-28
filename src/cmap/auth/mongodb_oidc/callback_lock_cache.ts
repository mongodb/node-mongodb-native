import { MongoInvalidArgumentError } from '../../../error';
import type { Connection } from '../../connection';
import type { MongoCredentials } from '../mongo_credentials';
import type {
  IdPServerInfo,
  IdPServerResponse,
  OIDCCallbackContext,
  OIDCRefreshFunction,
  OIDCRequestFunction
} from '../mongodb_oidc';

/** Error message for when request callback is missing. */
const REQUEST_CALLBACK_REQUIRED_ERROR =
  'Auth mechanism property REQUEST_TOKEN_CALLBACK is required.';

/**
 * An entry of callbacks in the cache.
 */
interface CallbacksEntry {
  requestCallback: OIDCRequestFunction;
  refreshCallback?: OIDCRefreshFunction;
}

/**
 * A cache of request and refresh callbacks per server/user.
 */
export class CallbackLockCache {
  entries: Map<string, CallbacksEntry>;

  /**
   * Instantiate the new cache.
   */
  constructor() {
    this.entries = new Map<string, CallbacksEntry>();
  }

  /**
   * Get the callbacks for the connection and credentials. If an entry does not
   * exist a new one will get set.
   */
  getCallbacks(connection: Connection, credentials: MongoCredentials): CallbacksEntry {
    const entry = this.entries.get(cacheKey(connection, credentials));
    if (entry) {
      return entry;
    }
    return this.setCallbacks(connection, credentials);
  }

  /**
   * Set locked callbacks on for connection and credentials.
   */
  private setCallbacks(connection: Connection, credentials: MongoCredentials): CallbacksEntry {
    const requestCallback = credentials.mechanismProperties.REQUEST_TOKEN_CALLBACK;
    const refreshCallback = credentials.mechanismProperties.REFRESH_TOKEN_CALLBACK;
    if (!requestCallback) {
      throw new MongoInvalidArgumentError(REQUEST_CALLBACK_REQUIRED_ERROR);
    }
    const entry = {
      requestCallback: withLock(requestCallback),
      refreshCallback: refreshCallback ? withLock(refreshCallback) : undefined
    };
    this.entries.set(cacheKey(connection, credentials), entry);
    return entry;
  }
}

/**
 * Get a cache key based on connection and credentials.
 */
function cacheKey(connection: Connection, credentials: MongoCredentials): string {
  return `${connection.address}-${credentials.username}`;
}

/**
 * Ensure the callback is only executed one at a time.
 */
function withLock(callback: OIDCRequestFunction | OIDCRefreshFunction) {
  let lock: Promise<any> = Promise.resolve();
  return async (info: IdPServerInfo, context: OIDCCallbackContext): Promise<IdPServerResponse> => {
    await lock;
    lock = lock.then(() => callback(info, context));
    return lock;
  };
}
