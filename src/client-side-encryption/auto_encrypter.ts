import {
  type MongoCrypt,
  type MongoCryptConstructor,
  type MongoCryptOptions
} from 'mongodb-client-encryption';

import { deserialize, type Document, serialize } from '../bson';
import { type CommandOptions, type ProxyOptions } from '../cmap/connection';
import { getMongoDBClientEncryption } from '../deps';
import { MongoRuntimeError } from '../error';
import { MongoClient, type MongoClientOptions } from '../mongo_client';
import { MongoDBCollectionNamespace } from '../utils';
import * as cryptoCallbacks from './crypto_callbacks';
import { MongoCryptInvalidArgumentError } from './errors';
import { MongocryptdManager } from './mongocryptd_manager';
import { type KMSProviders, refreshKMSCredentials } from './providers';
import { type CSFLEKMSTlsOptions, StateMachine } from './state_machine';

/** @public */
export interface AutoEncryptionOptions {
  /** @internal client for metadata lookups */
  metadataClient?: MongoClient;
  /** A `MongoClient` used to fetch keys from a key vault */
  keyVaultClient?: MongoClient;
  /** The namespace where keys are stored in the key vault */
  keyVaultNamespace?: string;
  /** Configuration options that are used by specific KMS providers during key generation, encryption, and decryption. */
  kmsProviders?: {
    /** Configuration options for using 'aws' as your KMS provider */
    aws?:
      | {
          /** The access key used for the AWS KMS provider */
          accessKeyId: string;
          /** The secret access key used for the AWS KMS provider */
          secretAccessKey: string;
          /**
           * An optional AWS session token that will be used as the
           * X-Amz-Security-Token header for AWS requests.
           */
          sessionToken?: string;
        }
      | Record<string, never>;
    /** Configuration options for using 'local' as your KMS provider */
    local?: {
      /**
       * The master key used to encrypt/decrypt data keys.
       * A 96-byte long Buffer or base64 encoded string.
       */
      key: Buffer | string;
    };
    /** Configuration options for using 'azure' as your KMS provider */
    azure?:
      | {
          /** The tenant ID identifies the organization for the account */
          tenantId: string;
          /** The client ID to authenticate a registered application */
          clientId: string;
          /** The client secret to authenticate a registered application */
          clientSecret: string;
          /**
           * If present, a host with optional port. E.g. "example.com" or "example.com:443".
           * This is optional, and only needed if customer is using a non-commercial Azure instance
           * (e.g. a government or China account, which use different URLs).
           * Defaults to "login.microsoftonline.com"
           */
          identityPlatformEndpoint?: string | undefined;
        }
      | {
          /**
           * If present, an access token to authenticate with Azure.
           */
          accessToken: string;
        }
      | Record<string, never>;
    /** Configuration options for using 'gcp' as your KMS provider */
    gcp?:
      | {
          /** The service account email to authenticate */
          email: string;
          /** A PKCS#8 encrypted key. This can either be a base64 string or a binary representation */
          privateKey: string | Buffer;
          /**
           * If present, a host with optional port. E.g. "example.com" or "example.com:443".
           * Defaults to "oauth2.googleapis.com"
           */
          endpoint?: string | undefined;
        }
      | {
          /**
           * If present, an access token to authenticate with GCP.
           */
          accessToken: string;
        }
      | Record<string, never>;
    /**
     * Configuration options for using 'kmip' as your KMS provider
     */
    kmip?: {
      /**
       * The output endpoint string.
       * The endpoint consists of a hostname and port separated by a colon.
       * E.g. "example.com:123". A port is always present.
       */
      endpoint?: string;
    };
  };
  /**
   * A map of namespaces to a local JSON schema for encryption
   *
   * **NOTE**: Supplying options.schemaMap provides more security than relying on JSON Schemas obtained from the server.
   * It protects against a malicious server advertising a false JSON Schema, which could trick the client into sending decrypted data that should be encrypted.
   * Schemas supplied in the schemaMap only apply to configuring automatic encryption for Client-Side Field Level Encryption.
   * Other validation rules in the JSON schema will not be enforced by the driver and will result in an error.
   */
  schemaMap?: Document;
  /** Supply a schema for the encrypted fields in the document  */
  encryptedFieldsMap?: Document;
  /** Allows the user to bypass auto encryption, maintaining implicit decryption */
  bypassAutoEncryption?: boolean;
  /** Allows users to bypass query analysis */
  bypassQueryAnalysis?: boolean;
  options?: {
    /** An optional hook to catch logging messages from the underlying encryption engine */
    logger?: (level: AutoEncryptionLoggerLevel, message: string) => void;
  };
  extraOptions?: {
    /**
     * A local process the driver communicates with to determine how to encrypt values in a command.
     * Defaults to "mongodb://%2Fvar%2Fmongocryptd.sock" if domain sockets are available or "mongodb://localhost:27020" otherwise
     */
    mongocryptdURI?: string;
    /** If true, autoEncryption will not attempt to spawn a mongocryptd before connecting  */
    mongocryptdBypassSpawn?: boolean;
    /** The path to the mongocryptd executable on the system */
    mongocryptdSpawnPath?: string;
    /** Command line arguments to use when auto-spawning a mongocryptd */
    mongocryptdSpawnArgs?: string[];
    /**
     * Full path to a MongoDB Crypt shared library to be used (instead of mongocryptd).
     *
     * This needs to be the path to the file itself, not a directory.
     * It can be an absolute or relative path. If the path is relative and
     * its first component is `$ORIGIN`, it will be replaced by the directory
     * containing the mongodb-client-encryption native addon file. Otherwise,
     * the path will be interpreted relative to the current working directory.
     *
     * Currently, loading different MongoDB Crypt shared library files from different
     * MongoClients in the same process is not supported.
     *
     * If this option is provided and no MongoDB Crypt shared library could be loaded
     * from the specified location, creating the MongoClient will fail.
     *
     * If this option is not provided and `cryptSharedLibRequired` is not specified,
     * the AutoEncrypter will attempt to spawn and/or use mongocryptd according
     * to the mongocryptd-specific `extraOptions` options.
     *
     * Specifying a path prevents mongocryptd from being used as a fallback.
     *
     * Requires the MongoDB Crypt shared library, available in MongoDB 6.0 or higher.
     */
    cryptSharedLibPath?: string;
    /**
     * If specified, never use mongocryptd and instead fail when the MongoDB Crypt
     * shared library could not be loaded.
     *
     * This is always true when `cryptSharedLibPath` is specified.
     *
     * Requires the MongoDB Crypt shared library, available in MongoDB 6.0 or higher.
     */
    cryptSharedLibRequired?: boolean;
    /**
     * Search paths for a MongoDB Crypt shared library to be used (instead of mongocryptd)
     * Only for driver testing!
     * @internal
     */
    cryptSharedLibSearchPaths?: string[];
  };
  proxyOptions?: ProxyOptions;
  /** The TLS options to use connecting to the KMS provider */
  tlsOptions?: CSFLEKMSTlsOptions;
}

/**
 * @public
 *
 * Extra options related to the mongocryptd process
 * \* _Available in MongoDB 6.0 or higher._
 */
export type AutoEncryptionExtraOptions = NonNullable<AutoEncryptionOptions['extraOptions']>;

/** @public */
export const AutoEncryptionLoggerLevel = Object.freeze({
  FatalError: 0,
  Error: 1,
  Warning: 2,
  Info: 3,
  Trace: 4
} as const);

/**
 * @public
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
export type AutoEncryptionLoggerLevel =
  (typeof AutoEncryptionLoggerLevel)[keyof typeof AutoEncryptionLoggerLevel];

// Typescript errors if we index objects with `Symbol.for(...)`, so
// to avoid TS errors we pull them out into variables.  Then we can type
// the objects (and class) that we expect to see them on and prevent TS
// errors.
/** @internal */
const kDecorateResult = Symbol.for('@@mdb.decorateDecryptionResult');
/** @internal */
const kDecoratedKeys = Symbol.for('@@mdb.decryptedKeys');

/**
 * @internal An internal class to be used by the driver for auto encryption
 * **NOTE**: Not meant to be instantiated directly, this is for internal use only.
 */
export class AutoEncrypter {
  _client: MongoClient;
  _bypassEncryption: boolean;
  _keyVaultNamespace: string;
  _keyVaultClient: MongoClient;
  _metaDataClient: MongoClient;
  _proxyOptions: ProxyOptions;
  _tlsOptions: CSFLEKMSTlsOptions;
  _kmsProviders: KMSProviders;
  _bypassMongocryptdAndCryptShared: boolean;
  _contextCounter: number;

  _mongocryptdManager?: MongocryptdManager;
  _mongocryptdClient?: MongoClient;

  /** @internal */
  _mongocrypt: MongoCrypt;

  /**
   * Used by devtools to enable decorating decryption results.
   *
   * When set and enabled, `decrypt` will automatically recursively
   * traverse a decrypted document and if a field has been decrypted,
   * it will mark it as decrypted.  Compass uses this to determine which
   * fields were decrypted.
   */
  [kDecorateResult] = false;

  /** @internal */
  static getMongoCrypt(): MongoCryptConstructor {
    const encryption = getMongoDBClientEncryption();
    if ('kModuleError' in encryption) {
      throw encryption.kModuleError;
    }
    return encryption.MongoCrypt;
  }

  /**
   * Create an AutoEncrypter
   *
   * **Note**: Do not instantiate this class directly. Rather, supply the relevant options to a MongoClient
   *
   * **Note**: Supplying `options.schemaMap` provides more security than relying on JSON Schemas obtained from the server.
   * It protects against a malicious server advertising a false JSON Schema, which could trick the client into sending unencrypted data that should be encrypted.
   * Schemas supplied in the schemaMap only apply to configuring automatic encryption for Client-Side Field Level Encryption.
   * Other validation rules in the JSON schema will not be enforced by the driver and will result in an error.
   *
   * @example <caption>Create an AutoEncrypter that makes use of mongocryptd</caption>
   * ```ts
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
   * ```
   *
   * await client.connect();
   * // From here on, the client will be encrypting / decrypting automatically
   * @example <caption>Create an AutoEncrypter that makes use of libmongocrypt's CSFLE shared library</caption>
   * ```ts
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
   * ```
   *
   * await client.connect();
   * // From here on, the client will be encrypting / decrypting automatically
   */
  constructor(client: MongoClient, options: AutoEncryptionOptions) {
    this._client = client;
    this._bypassEncryption = options.bypassAutoEncryption === true;

    this._keyVaultNamespace = options.keyVaultNamespace || 'admin.datakeys';
    this._keyVaultClient = options.keyVaultClient || client;
    this._metaDataClient = options.metadataClient || client;
    this._proxyOptions = options.proxyOptions || {};
    this._tlsOptions = options.tlsOptions || {};
    this._kmsProviders = options.kmsProviders || {};

    const mongoCryptOptions: MongoCryptOptions = {
      cryptoCallbacks
    };
    if (options.schemaMap) {
      mongoCryptOptions.schemaMap = Buffer.isBuffer(options.schemaMap)
        ? options.schemaMap
        : (serialize(options.schemaMap) as Buffer);
    }

    if (options.encryptedFieldsMap) {
      mongoCryptOptions.encryptedFieldsMap = Buffer.isBuffer(options.encryptedFieldsMap)
        ? options.encryptedFieldsMap
        : (serialize(options.encryptedFieldsMap) as Buffer);
    }

    mongoCryptOptions.kmsProviders = !Buffer.isBuffer(this._kmsProviders)
      ? (serialize(this._kmsProviders) as Buffer)
      : this._kmsProviders;

    if (options.options?.logger) {
      mongoCryptOptions.logger = options.options.logger;
    }

    if (options.extraOptions && options.extraOptions.cryptSharedLibPath) {
      mongoCryptOptions.cryptSharedLibPath = options.extraOptions.cryptSharedLibPath;
    }

    if (options.bypassQueryAnalysis) {
      mongoCryptOptions.bypassQueryAnalysis = options.bypassQueryAnalysis;
    }

    this._bypassMongocryptdAndCryptShared = this._bypassEncryption || !!options.bypassQueryAnalysis;

    if (options.extraOptions && options.extraOptions.cryptSharedLibSearchPaths) {
      // Only for driver testing
      mongoCryptOptions.cryptSharedLibSearchPaths = options.extraOptions.cryptSharedLibSearchPaths;
    } else if (!this._bypassMongocryptdAndCryptShared) {
      mongoCryptOptions.cryptSharedLibSearchPaths = ['$SYSTEM'];
    }

    const MongoCrypt = AutoEncrypter.getMongoCrypt();
    this._mongocrypt = new MongoCrypt(mongoCryptOptions);
    this._contextCounter = 0;

    if (
      options.extraOptions &&
      options.extraOptions.cryptSharedLibRequired &&
      !this.cryptSharedLibVersionInfo
    ) {
      throw new MongoCryptInvalidArgumentError(
        '`cryptSharedLibRequired` set but no crypt_shared library loaded'
      );
    }

    // Only instantiate mongocryptd manager/client once we know for sure
    // that we are not using the CSFLE shared library.
    if (!this._bypassMongocryptdAndCryptShared && !this.cryptSharedLibVersionInfo) {
      this._mongocryptdManager = new MongocryptdManager(options.extraOptions);
      const clientOptions: MongoClientOptions = {
        serverSelectionTimeoutMS: 10000
      };

      if (options.extraOptions == null || typeof options.extraOptions.mongocryptdURI !== 'string') {
        clientOptions.family = 4;
      }

      this._mongocryptdClient = new MongoClient(this._mongocryptdManager.uri, clientOptions);
    }
  }

  /**
   * Initializes the auto encrypter by spawning a mongocryptd and connecting to it.
   *
   * This function is a no-op when bypassSpawn is set or the crypt shared library is used.
   */
  async init(): Promise<MongoClient | void> {
    if (this._bypassMongocryptdAndCryptShared || this.cryptSharedLibVersionInfo) {
      return;
    }
    if (!this._mongocryptdManager) {
      throw new MongoRuntimeError(
        'Reached impossible state: mongocryptdManager is undefined when neither bypassSpawn nor the shared lib are specified.'
      );
    }
    if (!this._mongocryptdClient) {
      throw new MongoRuntimeError(
        'Reached impossible state: mongocryptdClient is undefined when neither bypassSpawn nor the shared lib are specified.'
      );
    }

    if (!this._mongocryptdManager.bypassSpawn) {
      await this._mongocryptdManager.spawn();
    }

    try {
      const client = await this._mongocryptdClient.connect();
      return client;
    } catch (error) {
      const { message } = error;
      if (message && (message.match(/timed out after/) || message.match(/ENOTFOUND/))) {
        throw new MongoRuntimeError(
          'Unable to connect to `mongocryptd`, please make sure it is running or in your PATH for auto-spawn',
          { cause: error }
        );
      }
      throw error;
    }
  }

  /**
   * Cleans up the `_mongocryptdClient`, if present.
   */
  async teardown(force: boolean): Promise<void> {
    await this._mongocryptdClient?.close(force);
  }

  /**
   * Encrypt a command for a given namespace.
   */
  async encrypt(
    ns: string,
    cmd: Document,
    options: CommandOptions = {}
  ): Promise<Document | Uint8Array> {
    if (this._bypassEncryption) {
      // If `bypassAutoEncryption` has been specified, don't encrypt
      return cmd;
    }

    const commandBuffer = Buffer.isBuffer(cmd) ? cmd : serialize(cmd, options);

    const context = this._mongocrypt.makeEncryptionContext(
      MongoDBCollectionNamespace.fromString(ns).db,
      commandBuffer
    );

    context.id = this._contextCounter++;
    context.ns = ns;
    context.document = cmd;

    const stateMachine = new StateMachine({
      promoteValues: false,
      promoteLongs: false,
      proxyOptions: this._proxyOptions,
      tlsOptions: this._tlsOptions
    });
    return stateMachine.execute<Document>(this, context);
  }

  /**
   * Decrypt a command response
   */
  async decrypt(response: Uint8Array | Document, options: CommandOptions = {}): Promise<Document> {
    const buffer = Buffer.isBuffer(response) ? response : serialize(response, options);

    const context = this._mongocrypt.makeDecryptionContext(buffer);

    context.id = this._contextCounter++;

    const stateMachine = new StateMachine({
      ...options,
      proxyOptions: this._proxyOptions,
      tlsOptions: this._tlsOptions
    });

    const decorateResult = this[kDecorateResult];
    const result = await stateMachine.execute<Document>(this, context);
    if (decorateResult) {
      decorateDecryptionResult(result, response);
    }
    return result;
  }

  /**
   * Ask the user for KMS credentials.
   *
   * This returns anything that looks like the kmsProviders original input
   * option. It can be empty, and any provider specified here will override
   * the original ones.
   */
  async askForKMSCredentials(): Promise<KMSProviders> {
    return refreshKMSCredentials(this._kmsProviders);
  }

  /**
   * Return the current libmongocrypt's CSFLE shared library version
   * as `{ version: bigint, versionStr: string }`, or `null` if no CSFLE
   * shared library was loaded.
   */
  get cryptSharedLibVersionInfo(): { version: bigint; versionStr: string } | null {
    return this._mongocrypt.cryptSharedLibVersionInfo;
  }

  static get libmongocryptVersion(): string {
    return AutoEncrypter.getMongoCrypt().libmongocryptVersion;
  }
}

/**
 * Recurse through the (identically-shaped) `decrypted` and `original`
 * objects and attach a `decryptedKeys` property on each sub-object that
 * contained encrypted fields. Because we only call this on BSON responses,
 * we do not need to worry about circular references.
 *
 * @internal
 */
function decorateDecryptionResult(
  decrypted: Document & { [kDecoratedKeys]?: Array<string> },
  original: Document,
  isTopLevelDecorateCall = true
): void {
  if (isTopLevelDecorateCall) {
    // The original value could have been either a JS object or a BSON buffer
    if (Buffer.isBuffer(original)) {
      original = deserialize(original);
    }
    if (Buffer.isBuffer(decrypted)) {
      throw new MongoRuntimeError('Expected result of decryption to be deserialized BSON object');
    }
  }

  if (!decrypted || typeof decrypted !== 'object') return;
  for (const k of Object.keys(decrypted)) {
    const originalValue = original[k];

    // An object was decrypted by libmongocrypt if and only if it was
    // a BSON Binary object with subtype 6.
    if (originalValue && originalValue._bsontype === 'Binary' && originalValue.sub_type === 6) {
      if (!decrypted[kDecoratedKeys]) {
        Object.defineProperty(decrypted, kDecoratedKeys, {
          value: [],
          configurable: true,
          enumerable: false,
          writable: false
        });
      }
      // this is defined in the preceding if-statement
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      decrypted[kDecoratedKeys]!.push(k);
      // Do not recurse into this decrypted value. It could be a sub-document/array,
      // in which case there is no original value associated with its subfields.
      continue;
    }

    decorateDecryptionResult(decrypted[k], originalValue, false);
  }
}
