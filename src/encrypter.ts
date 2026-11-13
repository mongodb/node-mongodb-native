import { AutoEncrypter, type AutoEncryptionOptions } from './client-side-encryption/auto_encrypter';
import { MONGO_CLIENT_EVENTS } from './constants';
import { getMongoDBClientEncryption } from './deps';
import { MongoInvalidArgumentError, MongoMissingDependencyError } from './error';
import { MongoClient, type MongoClientOptions } from './mongo_client';

/** @internal */
export interface EncrypterOptions {
  autoEncryption: AutoEncryptionOptions;
  maxPoolSize?: number;
}

type MongoClientListener = (...args: any[]) => void;

/** @internal */
export class Encrypter {
  private internalClient: MongoClient | null;
  /**
   * Forwards `newListener` and `removeListener` from the application client onto
   * the internal key-vault client. Held so `close()` can detach both hooks.
   */
  private listenerForwarders?: {
    client: MongoClient;
    newListener: (eventName: string | symbol, listener: MongoClientListener) => void;
    removeListener: (eventName: string | symbol, listener: MongoClientListener) => void;
  };
  bypassAutoEncryption: boolean;
  needsConnecting: boolean;
  autoEncrypter: AutoEncrypter;

  constructor(client: MongoClient, uri: string, options: MongoClientOptions) {
    if (typeof options.autoEncryption !== 'object') {
      throw new MongoInvalidArgumentError('Option "autoEncryption" must be specified');
    }
    // initialize to null, if we call getInternalClient, we may set this it is important to not overwrite those function calls.
    this.internalClient = null;

    this.bypassAutoEncryption = !!options.autoEncryption.bypassAutoEncryption;
    this.needsConnecting = false;

    if (options.maxPoolSize === 0 && options.autoEncryption.keyVaultClient == null) {
      options.autoEncryption.keyVaultClient = client;
    } else if (options.autoEncryption.keyVaultClient == null) {
      options.autoEncryption.keyVaultClient = this.getInternalClient(client, uri, options);
    }

    if (this.bypassAutoEncryption) {
      options.autoEncryption.metadataClient = undefined;
    } else if (options.maxPoolSize === 0) {
      options.autoEncryption.metadataClient = client;
    } else {
      options.autoEncryption.metadataClient = this.getInternalClient(client, uri, options);
    }

    if (options.proxyHost) {
      options.autoEncryption.proxyOptions = {
        proxyHost: options.proxyHost,
        proxyPort: options.proxyPort,
        proxyUsername: options.proxyUsername,
        proxyPassword: options.proxyPassword
      };
    }

    this.autoEncrypter = new AutoEncrypter(client, options.autoEncryption);
  }

  getInternalClient(client: MongoClient, uri: string, options: MongoClientOptions): MongoClient {
    let internalClient = this.internalClient;
    if (internalClient == null) {
      const clonedOptions: MongoClientOptions = {};

      for (const key of [
        ...Object.getOwnPropertyNames(options),
        ...Object.getOwnPropertySymbols(options)
      ] as string[]) {
        if (['autoEncryption', 'minPoolSize', 'servers', 'caseTranslate', 'dbName'].includes(key))
          continue;
        Reflect.set(clonedOptions, key, Reflect.get(options, key));
      }

      clonedOptions.minPoolSize = 0;

      const createdClient = new MongoClient(uri, clonedOptions);
      internalClient = createdClient;
      this.internalClient = createdClient;

      for (const eventName of MONGO_CLIENT_EVENTS) {
        for (const listener of client.listeners(eventName)) {
          createdClient.on(eventName, listener as MongoClientListener);
        }
      }

      // `newListener` covers every event name, including ones outside
      // MONGO_CLIENT_EVENTS, because that is what the previous hook did.
      // `removeListener` has to cover the same set. Otherwise
      // `client.removeListener('commandStarted', onStarted)` leaves `onStarted`
      // attached to the key-vault client: it keeps running for key-vault traffic
      // and the application function stays reachable from a client it no longer
      // observes.
      // Registering `removeListener` emits `newListener` and copies that function
      // onto the internal client. That copy is removed in `removeListenerForwarders`.
      const newListener = (eventName: string | symbol, listener: MongoClientListener) => {
        createdClient.on(eventName, listener);
      };
      const removeListener = (eventName: string | symbol, listener: MongoClientListener) => {
        createdClient.removeListener(eventName, listener);
      };
      client.on('newListener', newListener);
      client.on('removeListener', removeListener);
      this.listenerForwarders = { client, newListener, removeListener };

      this.needsConnecting = true;
    }
    return internalClient;
  }

  async connectInternalClient(): Promise<void> {
    const internalClient = this.internalClient;
    if (this.needsConnecting && internalClient != null) {
      this.needsConnecting = false;
      await internalClient.connect();
    }
  }

  /**
   * Stop mirroring listener changes onto the internal client.
   *
   * The `removeListener` hook is itself forwarded by `newListener`, so the
   * internal client holds that function too. Removing it from the application
   * client does not run the hook (the hook is the listener being removed),
   * so drop it from the internal client directly.
   */
  private removeListenerForwarders(): void {
    const forwarders = this.listenerForwarders;
    if (forwarders == null) {
      return;
    }
    this.listenerForwarders = undefined;

    this.internalClient?.removeListener('removeListener', forwarders.removeListener);
    forwarders.client.removeListener('newListener', forwarders.newListener);
    forwarders.client.removeListener('removeListener', forwarders.removeListener);
  }

  async close(client: MongoClient): Promise<void> {
    // Detach even when the crypt client fails to close. Otherwise the application
    // client keeps forwarding events at an internal client that is going away.
    this.removeListenerForwarders();

    let error;
    try {
      await this.autoEncrypter.close();
    } catch (autoEncrypterError) {
      error = autoEncrypterError;
    }
    const internalClient = this.internalClient;
    if (internalClient != null && client !== internalClient) {
      return await internalClient.close();
    }
    if (error != null) {
      throw error;
    }
  }

  static checkForMongoCrypt(): void {
    const mongodbClientEncryption = getMongoDBClientEncryption();
    if ('kModuleError' in mongodbClientEncryption) {
      throw new MongoMissingDependencyError(
        'Auto-encryption requested, but the module is not installed. ' +
          'Please add `mongodb-client-encryption` as a dependency of your project',
        {
          cause: mongodbClientEncryption['kModuleError'],
          dependencyName: 'mongodb-client-encryption'
        }
      );
    }
  }
}
