/* eslint-disable @typescript-eslint/no-var-requires */
import { deserialize, serialize } from './bson';
import { MONGO_CLIENT_EVENTS } from './constants';
import type { AutoEncrypter, AutoEncryptionOptions } from './deps';
import { MongoInvalidArgumentError, MongoMissingDependencyError } from './error';
import { MongoClient, MongoClientOptions } from './mongo_client';
import { Callback, getMongoDBClientEncryption } from './utils';

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

    options.autoEncryption.bson = Object.create(null);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    options.autoEncryption.bson!.serialize = serialize;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    options.autoEncryption.bson!.deserialize = deserialize;

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
        return internalClient.close(force, callback);
      }
      callback(e);
    });
  }

  static checkForMongoCrypt(): void {
    const mongodbClientEncryption = getMongoDBClientEncryption();
    if (mongodbClientEncryption == null) {
      throw new MongoMissingDependencyError(
        'Auto-encryption requested, but the module is not installed. ' +
          'Please add `mongodb-client-encryption` as a dependency of your project'
      );
    }
    AutoEncrypterClass = mongodbClientEncryption.extension(require('../lib/index')).AutoEncrypter;
  }
}
