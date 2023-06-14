/* eslint-disable @typescript-eslint/no-var-requires */

import { MONGO_CLIENT_EVENTS } from './constants';
import { type AutoEncrypter, type AutoEncryptionOptions, getMongoDBClientEncryption } from './deps';
import { MongoInvalidArgumentError } from './error';
import { MongoClient, type MongoClientOptions } from './mongo_client';
import { type Callback } from './utils';

let AutoEncrypterClass: { new (...args: ConstructorParameters<AutoEncrypter>): AutoEncrypter };

/** @internal */
const kInternalClient = Symbol('internalClient');

/** @internal */
export interface EncrypterOptions {
  autoEncryption: AutoEncryptionOptions;
  maxPoolSize?: number;
}

/** @internal */
export class Encrypter {
  [kInternalClient]: MongoClient | null;
  bypassAutoEncryption: boolean;
  needsConnecting: boolean;
  autoEncrypter: AutoEncrypter;

  constructor(client: MongoClient, uri: string, options: MongoClientOptions) {
    if (typeof options.autoEncryption !== 'object') {
      throw new MongoInvalidArgumentError('Option "autoEncryption" must be specified');
    }
    // initialize to null, if we call getInternalClient, we may set this it is important to not overwrite those function calls.
    this[kInternalClient] = null;

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

    this.autoEncrypter = new AutoEncrypterClass(client, options.autoEncryption);
  }

  getInternalClient(client: MongoClient, uri: string, options: MongoClientOptions): MongoClient {
    // TODO(NODE-4144): Remove new variable for type narrowing
    let internalClient = this[kInternalClient];
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

      internalClient = new MongoClient(uri, clonedOptions);
      this[kInternalClient] = internalClient;

      for (const eventName of MONGO_CLIENT_EVENTS) {
        for (const listener of client.listeners(eventName)) {
          internalClient.on(eventName, listener);
        }
      }

      client.on('newListener', (eventName, listener) => {
        internalClient?.on(eventName, listener);
      });

      this.needsConnecting = true;
    }
    return internalClient;
  }

  async connectInternalClient(): Promise<void> {
    // TODO(NODE-4144): Remove new variable for type narrowing
    const internalClient = this[kInternalClient];
    if (this.needsConnecting && internalClient != null) {
      this.needsConnecting = false;
      await internalClient.connect();
    }
  }

  close(client: MongoClient, force: boolean, callback: Callback): void {
    this.autoEncrypter.teardown(!!force, e => {
      const internalClient = this[kInternalClient];
      if (internalClient != null && client !== internalClient) {
        internalClient.close(force).then(
          () => callback(),
          error => callback(error)
        );
        return;
      }
      callback(e);
    });
  }

  static checkForMongoCrypt(): void {
    if (AutoEncrypterClass == null) {
      const moduleOrError = getMongoDBClientEncryption();
      if (moduleOrError.status === 'rejected') {
        throw moduleOrError.reason;
      }
      AutoEncrypterClass = moduleOrError.value.extension(require('../lib/index')).AutoEncrypter;
    }
  }
}
