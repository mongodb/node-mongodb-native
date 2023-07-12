'use strict';

module.exports = function (modules) {
  const mc = require('bindings')('mongocrypt');
  const common = require('./common');
  const databaseNamespace = common.databaseNamespace;
  const StateMachine = modules.stateMachine.StateMachine;
  const MongocryptdManager = require('./mongocryptdManager').MongocryptdManager;
  const MongoClient = modules.mongodb.MongoClient;
  const MongoError = modules.mongodb.MongoError;
  const BSON = modules.mongodb.BSON;
  const { loadCredentials } = require('./providers/index');
  const cryptoCallbacks = require('./cryptoCallbacks');

  /**
   * Configuration options for a automatic client encryption.
   *
   * @typedef {Object} AutoEncrypter~AutoEncryptionOptions
   * @property {MongoClient} [keyVaultClient] A `MongoClient` used to fetch keys from a key vault
   * @property {string} [keyVaultNamespace] The namespace where keys are stored in the key vault
   * @property {KMSProviders} [kmsProviders] Configuration options that are used by specific KMS providers during key generation, encryption, and decryption.
   * @property {object} [schemaMap] A map of namespaces to a local JSON schema for encryption
   * @property {boolean} [bypassAutoEncryption] Allows the user to bypass auto encryption, maintaining implicit decryption
   * @property {AutoEncrypter~logger} [options.logger] An optional hook to catch logging messages from the underlying encryption engine
   * @property {AutoEncrypter~AutoEncryptionExtraOptions} [extraOptions] Extra options related to the mongocryptd process
   */

  /**
   * Extra options related to the mongocryptd process
   * \* _Available in MongoDB 6.0 or higher._
   * @typedef {object} AutoEncrypter~AutoEncryptionExtraOptions
   * @property {string} [mongocryptdURI] A local process the driver communicates with to determine how to encrypt values in a command. Defaults to "mongodb://%2Fvar%2Fmongocryptd.sock" if domain sockets are available or "mongodb://localhost:27020" otherwise
   * @property {boolean} [mongocryptdBypassSpawn=false] If true, autoEncryption will not attempt to spawn a mongocryptd before connecting
   * @property {string} [mongocryptdSpawnPath] The path to the mongocryptd executable on the system
   * @property {string[]} [mongocryptdSpawnArgs] Command line arguments to use when auto-spawning a mongocryptd
   * @property {string} [cryptSharedLibPath] Full path to a MongoDB Crypt shared library on the system. If specified, autoEncryption will not attempt to spawn a mongocryptd, but makes use of the shared library file specified. Note that the path must point to the shared libary file itself, not the folder which contains it \*
   * @property {boolean} [cryptSharedLibRequired] If true, never use mongocryptd and fail when the MongoDB Crypt shared libary cannot be loaded. Defaults to true if [cryptSharedLibPath] is specified and false otherwise \*
   */

  /**
   * @callback AutoEncrypter~logger
   * @description A callback that is invoked with logging information from
   * the underlying C++ Bindings.
   * @param {AutoEncrypter~logLevel} level The level of logging.
   * @param {string} message The message to log
   */

  /**
   * @name AutoEncrypter~logLevel
   * @enum {number}
   * @description
   * The level of severity of the log message
   *
   * | Value | Level |
   * |-------|-------|
   * | 0 | Fatal Error |
   * | 1 | Error |
   * | 2 | Warning |
   * | 3 | Info |
   * | 4 | Trace |
   */

  /**
   * @classdesc An internal class to be used by the driver for auto encryption
   * **NOTE**: Not meant to be instantiated directly, this is for internal use only.
   */
  class AutoEncrypter {
    /**
     * Create an AutoEncrypter
     *
     * **Note**: Do not instantiate this class directly. Rather, supply the relevant options to a MongoClient
     *
     * **Note**: Supplying `options.schemaMap` provides more security than relying on JSON Schemas obtained from the server.
     * It protects against a malicious server advertising a false JSON Schema, which could trick the client into sending unencrypted data that should be encrypted.
     * Schemas supplied in the schemaMap only apply to configuring automatic encryption for Client-Side Field Level Encryption.
     * Other validation rules in the JSON schema will not be enforced by the driver and will result in an error.
     * @param {MongoClient} client The client autoEncryption is enabled on
     * @param {AutoEncrypter~AutoEncryptionOptions} [options] Optional settings
     *
     * @example <caption>Create an AutoEncrypter that makes use of mongocryptd</caption>
     * // Enabling autoEncryption via a MongoClient using mongocryptd
     * const { MongoClient } = require('mongodb');
     * const client = new MongoClient(URL, {
     *   autoEncryption: {
     *     kmsProviders: {
     *       aws: {
     *         accessKeyId: AWS_ACCESS_KEY,
     *         secretAccessKey: AWS_SECRET_KEY
     *       }
     *     }
     *   }
     * });
     *
     * await client.connect();
     * // From here on, the client will be encrypting / decrypting automatically
     * @example <caption>Create an AutoEncrypter that makes use of libmongocrypt's CSFLE shared library</caption>
     * // Enabling autoEncryption via a MongoClient using CSFLE shared library
     * const { MongoClient } = require('mongodb');
     * const client = new MongoClient(URL, {
     *   autoEncryption: {
     *     kmsProviders: {
     *       aws: {}
     *     },
     *     extraOptions: {
     *       cryptSharedLibPath: '/path/to/local/crypt/shared/lib',
     *       cryptSharedLibRequired: true
     *     }
     *   }
     * });
     *
     * await client.connect();
     * // From here on, the client will be encrypting / decrypting automatically
     */
    constructor(client, options) {
      this._client = client;
      this._bson = options.bson || BSON || client.topology.bson;
      this._bypassEncryption = options.bypassAutoEncryption === true;

      this._keyVaultNamespace = options.keyVaultNamespace || 'admin.datakeys';
      this._keyVaultClient = options.keyVaultClient || client;
      this._metaDataClient = options.metadataClient || client;
      this._proxyOptions = options.proxyOptions || {};
      this._tlsOptions = options.tlsOptions || {};
      this._onKmsProviderRefresh = options.onKmsProviderRefresh;
      this._kmsProviders = options.kmsProviders || {};

      const mongoCryptOptions = {};
      if (options.schemaMap) {
        mongoCryptOptions.schemaMap = Buffer.isBuffer(options.schemaMap)
          ? options.schemaMap
          : this._bson.serialize(options.schemaMap);
      }

      if (options.encryptedFieldsMap) {
        mongoCryptOptions.encryptedFieldsMap = Buffer.isBuffer(options.encryptedFieldsMap)
          ? options.encryptedFieldsMap
          : this._bson.serialize(options.encryptedFieldsMap);
      }

      mongoCryptOptions.kmsProviders = !Buffer.isBuffer(this._kmsProviders)
        ? this._bson.serialize(this._kmsProviders)
        : this._kmsProviders;

      if (options.logger) {
        mongoCryptOptions.logger = options.logger;
      }

      if (options.extraOptions && options.extraOptions.cryptSharedLibPath) {
        mongoCryptOptions.cryptSharedLibPath = options.extraOptions.cryptSharedLibPath;
      }

      if (options.bypassQueryAnalysis) {
        mongoCryptOptions.bypassQueryAnalysis = options.bypassQueryAnalysis;
      }

      this._bypassMongocryptdAndCryptShared = this._bypassEncryption || options.bypassQueryAnalysis;

      if (options.extraOptions && options.extraOptions.cryptSharedLibSearchPaths) {
        // Only for driver testing
        mongoCryptOptions.cryptSharedLibSearchPaths =
          options.extraOptions.cryptSharedLibSearchPaths;
      } else if (!this._bypassMongocryptdAndCryptShared) {
        mongoCryptOptions.cryptSharedLibSearchPaths = ['$SYSTEM'];
      }

      Object.assign(mongoCryptOptions, { cryptoCallbacks });
      this._mongocrypt = new mc.MongoCrypt(mongoCryptOptions);
      this._contextCounter = 0;

      if (
        options.extraOptions &&
        options.extraOptions.cryptSharedLibRequired &&
        !this.cryptSharedLibVersionInfo
      ) {
        throw new MongoError('`cryptSharedLibRequired` set but no crypt_shared library loaded');
      }

      // Only instantiate mongocryptd manager/client once we know for sure
      // that we are not using the CSFLE shared library.
      if (!this._bypassMongocryptdAndCryptShared && !this.cryptSharedLibVersionInfo) {
        this._mongocryptdManager = new MongocryptdManager(options.extraOptions);
        const clientOptions = {
          useNewUrlParser: true,
          useUnifiedTopology: true,
          serverSelectionTimeoutMS: 10000
        };

        if (
          options.extraOptions == null ||
          typeof options.extraOptions.mongocryptdURI !== 'string'
        ) {
          clientOptions.family = 4;
        }

        this._mongocryptdClient = new MongoClient(this._mongocryptdManager.uri, clientOptions);
      }
    }

    /**
     * @ignore
     * @param {Function} callback Invoked when the mongocryptd client either successfully connects or errors
     */
    init(callback) {
      if (this._bypassMongocryptdAndCryptShared || this.cryptSharedLibVersionInfo) {
        return callback();
      }
      const _callback = (err, res) => {
        if (
          err &&
          err.message &&
          (err.message.match(/timed out after/) || err.message.match(/ENOTFOUND/))
        ) {
          callback(
            new MongoError(
              'Unable to connect to `mongocryptd`, please make sure it is running or in your PATH for auto-spawn'
            )
          );
          return;
        }

        callback(err, res);
      };

      if (this._mongocryptdManager.bypassSpawn) {
        return this._mongocryptdClient.connect().then(
          result => {
            return _callback(null, result);
          },
          error => {
            _callback(error, null);
          }
        );
      }

      this._mongocryptdManager.spawn(() => {
        this._mongocryptdClient.connect().then(
          result => {
            return _callback(null, result);
          },
          error => {
            _callback(error, null);
          }
        );
      });
    }

    /**
     * @ignore
     * @param {Function} callback Invoked when the mongocryptd client either successfully disconnects or errors
     */
    teardown(force, callback) {
      if (this._mongocryptdClient) {
        this._mongocryptdClient.close(force).then(
          result => {
            return callback(null, result);
          },
          error => {
            callback(error);
          }
        );
      } else {
        callback();
      }
    }

    /**
     * @ignore
     * Encrypt a command for a given namespace.
     *
     * @param {string} ns The namespace for this encryption context
     * @param {object} cmd The command to encrypt
     * @param {Function} callback
     */
    encrypt(ns, cmd, options, callback) {
      if (typeof ns !== 'string') {
        throw new TypeError('Parameter `ns` must be a string');
      }

      if (typeof cmd !== 'object') {
        throw new TypeError('Parameter `cmd` must be an object');
      }

      if (typeof options === 'function' && callback == null) {
        callback = options;
        options = {};
      }

      // If `bypassAutoEncryption` has been specified, don't encrypt
      if (this._bypassEncryption) {
        callback(undefined, cmd);
        return;
      }

      const bson = this._bson;
      const commandBuffer = Buffer.isBuffer(cmd) ? cmd : bson.serialize(cmd, options);

      let context;
      try {
        context = this._mongocrypt.makeEncryptionContext(databaseNamespace(ns), commandBuffer);
      } catch (err) {
        callback(err, null);
        return;
      }

      // TODO: should these be accessors from the addon?
      context.id = this._contextCounter++;
      context.ns = ns;
      context.document = cmd;

      const stateMachine = new StateMachine({
        bson,
        ...options,
        promoteValues: false,
        promoteLongs: false,
        proxyOptions: this._proxyOptions,
        tlsOptions: this._tlsOptions
      });
      stateMachine.execute(this, context, callback);
    }

    /**
     * @ignore
     * Decrypt a command response
     *
     * @param {Buffer} buffer
     * @param {Function} callback
     */
    decrypt(response, options, callback) {
      if (typeof options === 'function' && callback == null) {
        callback = options;
        options = {};
      }

      const bson = this._bson;
      const buffer = Buffer.isBuffer(response) ? response : bson.serialize(response, options);

      let context;
      try {
        context = this._mongocrypt.makeDecryptionContext(buffer);
      } catch (err) {
        callback(err, null);
        return;
      }

      // TODO: should this be an accessor from the addon?
      context.id = this._contextCounter++;

      const stateMachine = new StateMachine({
        bson,
        ...options,
        proxyOptions: this._proxyOptions,
        tlsOptions: this._tlsOptions
      });

      const decorateResult = this[Symbol.for('@@mdb.decorateDecryptionResult')];
      stateMachine.execute(this, context, function (err, result) {
        // Only for testing/internal usage
        if (!err && result && decorateResult) {
          err = decorateDecryptionResult(result, response, bson);
          if (err) return callback(err);
        }
        callback(err, result);
      });
    }

    /**
     * Ask the user for KMS credentials.
     *
     * This returns anything that looks like the kmsProviders original input
     * option. It can be empty, and any provider specified here will override
     * the original ones.
     */
    async askForKMSCredentials() {
      return this._onKmsProviderRefresh
        ? this._onKmsProviderRefresh()
        : loadCredentials(this._kmsProviders);
    }

    /**
     * Return the current libmongocrypt's CSFLE shared library version
     * as `{ version: bigint, versionStr: string }`, or `null` if no CSFLE
     * shared library was loaded.
     */
    get cryptSharedLibVersionInfo() {
      return this._mongocrypt.cryptSharedLibVersionInfo;
    }

    static get libmongocryptVersion() {
      return mc.MongoCrypt.libmongocryptVersion;
    }
  }

  return { AutoEncrypter };
};

/**
 * Recurse through the (identically-shaped) `decrypted` and `original`
 * objects and attach a `decryptedKeys` property on each sub-object that
 * contained encrypted fields. Because we only call this on BSON responses,
 * we do not need to worry about circular references.
 *
 * @internal
 * @ignore
 */
function decorateDecryptionResult(decrypted, original, bson, isTopLevelDecorateCall = true) {
  const decryptedKeys = Symbol.for('@@mdb.decryptedKeys');
  if (isTopLevelDecorateCall) {
    // The original value could have been either a JS object or a BSON buffer
    if (Buffer.isBuffer(original)) {
      original = bson.deserialize(original);
    }
    if (Buffer.isBuffer(decrypted)) {
      return new Error('Expected result of decryption to be deserialized BSON object');
    }
  }

  if (!decrypted || typeof decrypted !== 'object') return;
  for (const k of Object.keys(decrypted)) {
    const originalValue = original[k];

    // An object was decrypted by libmongocrypt if and only if it was
    // a BSON Binary object with subtype 6.
    if (originalValue && originalValue._bsontype === 'Binary' && originalValue.sub_type === 6) {
      if (!decrypted[decryptedKeys]) {
        Object.defineProperty(decrypted, decryptedKeys, {
          value: [],
          configurable: true,
          enumerable: false,
          writable: false
        });
      }
      decrypted[decryptedKeys].push(k);
      // Do not recurse into this decrypted value. It could be a subdocument/array,
      // in which case there is no original value associated with its subfields.
      continue;
    }

    decorateDecryptionResult(decrypted[k], originalValue, bson, false);
  }
}
