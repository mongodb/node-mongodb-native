/* eslint-disable @typescript-eslint/no-var-requires */
import { MongoClient, MongoClientOptions } from './mongo_client';
import type { AutoEncrypter, AutoEncryptionOptions } from './deps';
import { MongoError } from './error';
import { deserialize, serialize } from './bson';
import type { Callback } from './utils';
import { Connection } from './cmap/connection';
import { Topology } from './sdam/topology';
import { Server } from './sdam/server';
import { CMAP_EVENT_NAMES } from './cmap/connection_pool';

let AutoEncrypterClass: AutoEncrypter;

const kInternalClient = Symbol('internalClient');

/** @internal */
export interface EncrypterOptions {
  autoEncryption: AutoEncryptionOptions;
  maxPoolSize?: number;
}

/** @internal */
export class Encrypter {
  [kInternalClient]: MongoClient;
  bypassAutoEncryption: boolean;
  needsConnecting: boolean;
  autoEncrypter: AutoEncrypter;

  constructor(client: MongoClient, uri: string, options: MongoClientOptions) {
    if (typeof options.autoEncryption !== 'object') {
      throw new TypeError('Options autoEncryption must be specified');
    }

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

    options.autoEncryption.bson = Object.create(null);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    options.autoEncryption.bson!.serialize = serialize;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    options.autoEncryption.bson!.deserialize = deserialize;

    this.autoEncrypter = new AutoEncrypterClass(client, options.autoEncryption);
  }

  getInternalClient(client: MongoClient, uri: string, options: MongoClientOptions): MongoClient {
    if (!this[kInternalClient]) {
      const clonedOptions: MongoClientOptions = {};

      for (const key of Object.keys(options)) {
        if (['autoEncryption', 'minPoolSize', 'servers', 'caseTranslate', 'dbName'].includes(key))
          continue;
        Reflect.set(clonedOptions, key, Reflect.get(options, key));
      }

      clonedOptions.minPoolSize = 0;

      const allEvents = [
        // APM
        Connection.COMMAND_STARTED,
        Connection.COMMAND_SUCCEEDED,
        Connection.COMMAND_FAILED,

        // SDAM
        Topology.SERVER_OPENING,
        Topology.SERVER_CLOSED,
        Topology.SERVER_DESCRIPTION_CHANGED,
        Topology.TOPOLOGY_OPENING,
        Topology.TOPOLOGY_CLOSED,
        Topology.SERVER_DESCRIPTION_CHANGED,
        Server.SERVER_HEARTBEAT_STARTED,
        Server.SERVER_HEARTBEAT_FAILED,
        Server.SERVER_HEARTBEAT_SUCCEEDED,

        // CMAP
        ...CMAP_EVENT_NAMES
      ];

      this[kInternalClient] = new MongoClient(uri, clonedOptions);

      for (const eventName of allEvents) {
        for (const listener of client.listeners(eventName)) {
          this[kInternalClient].on(eventName, listener as (...args: any[]) => void);
        }
      }

      client.on('newListener', (eventName, listener) => {
        this[kInternalClient].on(eventName, listener);
      });

      this.needsConnecting = true;
    }
    return this[kInternalClient];
  }

  connectInternalClient(callback: Callback): void {
    if (this.needsConnecting) {
      this.needsConnecting = false;
      return this[kInternalClient].connect(callback);
    }

    return callback();
  }

  close(client: MongoClient, force: boolean, callback: Callback): void {
    this.autoEncrypter.teardown(!!force, e => {
      if (this[kInternalClient] && client !== this[kInternalClient]) {
        return this[kInternalClient].close(force, callback);
      }
      callback(e);
    });
  }

  static checkForMongoCrypt(): void {
    try {
      require.resolve('mongodb-client-encryption');
    } catch (err) {
      throw new MongoError(
        'Auto-encryption requested, but the module is not installed. ' +
          'Please add `mongodb-client-encryption` as a dependency of your project'
      );
    }

    const mongodbClientEncryption = require('mongodb-client-encryption');
    if (typeof mongodbClientEncryption.extension !== 'function') {
      throw new MongoError(
        'loaded version of `mongodb-client-encryption` does not have property `extension`. ' +
          'Please make sure you are loading the correct version of `mongodb-client-encryption`'
      );
    }

    AutoEncrypterClass = mongodbClientEncryption.extension(require('../lib/index')).AutoEncrypter;
  }
}
