import { MongoParseError } from '../error';
import { MongoClient, type MongoClientOptions } from '../mongo_client';
import { StreamProcessors } from './stream_processors';

/**
 * A client for Atlas Stream Processing workspaces.
 *
 * Wraps a standard `MongoClient` with ASP-specific validation:
 * requires a `mongodb://` URI, enforces TLS, and defaults `authSource` to `admin`.
 *
 * @public
 * @experimental
 */
export class StreamProcessingClient {
  /** @internal */
  readonly _mongoClient: MongoClient;

  /**
   * @param url - A `mongodb://` connection string for the ASP workspace.
   *   `mongodb+srv://` is rejected.
   * @param options - Standard `MongoClientOptions`. TLS is forced on; `ssl: false` is rejected.
   */
  constructor(url: string, options?: MongoClientOptions) {
    if (url.startsWith('mongodb+srv://')) {
      throw new MongoParseError(
        'Atlas Stream Processing does not support mongodb+srv:// URIs; use mongodb:// instead'
      );
    }

    const mergedOptions: MongoClientOptions = { ...options };

    if (mergedOptions.tls === false || mergedOptions.ssl === false) {
      throw new MongoParseError('TLS cannot be disabled for Atlas Stream Processing connections');
    }

    const qsMark = url.indexOf('?');
    if (qsMark !== -1) {
      const params = new URLSearchParams(url.slice(qsMark + 1));
      if (params.get('tls') === 'false' || params.get('ssl') === 'false') {
        throw new MongoParseError('TLS cannot be disabled for Atlas Stream Processing connections');
      }
    }

    delete (mergedOptions as Record<string, unknown>).ssl;
    mergedOptions.tls = true;

    const hasAuthSourceInUrl =
      qsMark !== -1 && new URLSearchParams(url.slice(qsMark + 1)).has('authSource');
    if (!hasAuthSourceInUrl && !mergedOptions.authSource) {
      mergedOptions.authSource = 'admin';
    }

    this._mongoClient = new MongoClient(url, mergedOptions);
  }

  /**
   * Returns a handle for managing stream processors in this workspace.
   *
   * @returns A `StreamProcessors` instance bound to this client.
   * @experimental
   */
  streamProcessors(): StreamProcessors {
    return new StreamProcessors(this);
  }

  /**
   * Closes the underlying connection and releases all resources.
   *
   * @experimental
   */
  async close(): Promise<void> {
    await this._mongoClient.close();
  }

  /**
   * Alias for {@link StreamProcessingClient.close} for use with `await using`.
   *
   * @experimental
   */
  async [Symbol.asyncDispose](): Promise<void> {
    await this.close();
  }
}

/** @internal */
export function isWorkspaceEndpoint(host: string): boolean {
  return host.startsWith('atlas-stream-') || host.endsWith('.a.query.mongodb.net');
}
