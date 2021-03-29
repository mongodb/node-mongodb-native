'use strict';
const MongoClient = require('./mongo_client');
const BSON = require('./core/connection/utils').retrieveBSON();
const MongoError = require('./core/error').MongoError;

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
const AutoEncrypter = mongodbClientEncryption.extension(require('../index')).AutoEncrypter;

const kInternalClient = Symbol('internalClient');

class Encrypter {
  /**
   * @param {MongoClient} client
   * @param {{autoEncryption: import('./mongo_client').AutoEncryptionOptions, bson: object}} options
   */
  constructor(client, options) {
    this.bypassAutoEncryption = !!options.autoEncryption.bypassAutoEncryption;
    this.needsConnecting = false;

    if (options.maxPoolSize === 0 && options.autoEncryption.keyVaultClient == null) {
      options.autoEncryption.keyVaultClient = client;
    } else if (options.autoEncryption.keyVaultClient == null) {
      options.autoEncryption.keyVaultClient = this.getInternalClient(client);
    }

    if (this.bypassAutoEncryption) {
      options.autoEncryption.metadataClient = undefined;
    } else if (options.maxPoolSize === 0) {
      options.autoEncryption.metadataClient = client;
    } else {
      options.autoEncryption.metadataClient = this.getInternalClient(client);
    }

    options.autoEncryption.bson = Encrypter.makeBSON(options);

    this.autoEncrypter = new AutoEncrypter(client, options.autoEncryption);
  }

  getInternalClient(client) {
    if (!this[kInternalClient]) {
      const clonedOptions = {};

      for (const key of Object.keys(client.s.options)) {
        if (
          ['autoEncryption', 'minPoolSize', 'servers', 'caseTranslate', 'dbName'].indexOf(key) !==
          -1
        )
          continue;
        clonedOptions[key] = client.s.options[key];
      }

      clonedOptions.minPoolSize = 0;

      const allEvents = [
        // APM
        'commandStarted',
        'commandSucceeded',
        'commandFailed',

        // SDAM
        'serverOpening',
        'serverClosed',
        'serverDescriptionChanged',
        'serverHeartbeatStarted',
        'serverHeartbeatSucceeded',
        'serverHeartbeatFailed',
        'topologyOpening',
        'topologyClosed',
        'topologyDescriptionChanged',

        // Legacy
        'joined',
        'left',
        'ping',
        'ha',

        // CMAP
        'connectionPoolCreated',
        'connectionPoolClosed',
        'connectionCreated',
        'connectionReady',
        'connectionClosed',
        'connectionCheckOutStarted',
        'connectionCheckOutFailed',
        'connectionCheckedOut',
        'connectionCheckedIn',
        'connectionPoolCleared'
      ];

      this[kInternalClient] = new MongoClient(client.s.url, clonedOptions);

      for (const eventName of allEvents) {
        for (const listener of client.listeners(eventName)) {
          this[kInternalClient].on(eventName, listener);
        }
      }

      client.on('newListener', (eventName, listener) => {
        this[kInternalClient].on(eventName, listener);
      });

      this.needsConnecting = true;
    }
    return this[kInternalClient];
  }

  connectInternalClient(callback) {
    if (this.needsConnecting) {
      this.needsConnecting = false;
      return this[kInternalClient].connect(callback);
    }

    return callback();
  }

  close(client, force, callback) {
    this.autoEncrypter.teardown(e => {
      if (this[kInternalClient] && client !== this[kInternalClient]) {
        return this[kInternalClient].close(force, callback);
      }
      callback(e);
    });
  }

  static makeBSON(options) {
    return (
      (options || {}).bson ||
      new BSON([
        BSON.Binary,
        BSON.Code,
        BSON.DBRef,
        BSON.Decimal128,
        BSON.Double,
        BSON.Int32,
        BSON.Long,
        BSON.Map,
        BSON.MaxKey,
        BSON.MinKey,
        BSON.ObjectId,
        BSON.BSONRegExp,
        BSON.Symbol,
        BSON.Timestamp
      ])
    );
  }
}

module.exports = { Encrypter };
