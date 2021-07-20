import { MongoDriverError } from './error';
import type { MongoClient } from './mongo_client';
import type { deserialize, Document, serialize } from './bson';
import type { Callback } from './utils';

function makeErrorModule(error: any) {
  const props = error ? { kModuleError: error } : {};
  return new Proxy(props, {
    get: (_: any, key: any) => {
      if (key === 'kModuleError') {
        return error;
      }
      throw error;
    },
    set: () => {
      throw error;
    }
  });
}

export let Kerberos:
  | typeof import('kerberos')
  | { kModuleError: MongoDriverError } = makeErrorModule(
  new MongoDriverError(
    'Optional module `kerberos` not found. Please install it to enable kerberos authentication'
  )
);

try {
  // Ensure you always wrap an optional require in the try block NODE-3199
  Kerberos = require('kerberos');
} catch {} // eslint-disable-line

export interface KerberosClient {
  step: (challenge: string, callback?: Callback<string>) => Promise<string> | void;
  wrap: (
    challenge: string,
    options?: { user: string },
    callback?: Callback<string>
  ) => Promise<string> | void;
  unwrap: (challenge: string, callback?: Callback<string>) => Promise<string> | void;
}

export let Snappy: typeof import('snappy') | { kModuleError: MongoDriverError } = makeErrorModule(
  new MongoDriverError(
    'Optional module `snappy` not found. Please install it to enable snappy compression'
  )
);

try {
  // Ensure you always wrap an optional require in the try block NODE-3199
  Snappy = require('snappy');
} catch {} // eslint-disable-line

export let saslprep:
  | typeof import('saslprep')
  | { kModuleError: MongoDriverError } = makeErrorModule(
  new MongoDriverError(
    'Optional module `saslprep` not found.' +
      ' Please install it to enable Stringprep Profile for User Names and Passwords'
  )
);

try {
  // Ensure you always wrap an optional require in the try block NODE-3199
  saslprep = require('saslprep');
} catch {} // eslint-disable-line

export let aws4: typeof import('aws4') | { kModuleError: MongoDriverError } = makeErrorModule(
  new MongoDriverError(
    'Optional module `aws4` not found. Please install it to enable AWS authentication'
  )
);

try {
  // Ensure you always wrap an optional require in the try block NODE-3199
  aws4 = require('aws4');
} catch {} // eslint-disable-line

/** @public */
export const AutoEncryptionLoggerLevel = Object.freeze({
  FatalError: 0,
  Error: 1,
  Warning: 2,
  Info: 3,
  Trace: 4
} as const);

/** @public */
export type AutoEncryptionLoggerLevel = typeof AutoEncryptionLoggerLevel[keyof typeof AutoEncryptionLoggerLevel];

/** @public */
export interface AutoEncryptionOptions {
  /** @internal */
  bson?: { serialize: typeof serialize; deserialize: typeof deserialize };
  /** @internal client for metadata lookups */
  metadataClient?: MongoClient;
  /** A `MongoClient` used to fetch keys from a key vault */
  keyVaultClient?: MongoClient;
  /** The namespace where keys are stored in the key vault */
  keyVaultNamespace?: string;
  /** Configuration options that are used by specific KMS providers during key generation, encryption, and decryption. */
  kmsProviders?: {
    /** Configuration options for using 'aws' as your KMS provider */
    aws?: {
      /** The access key used for the AWS KMS provider */
      accessKeyId: string;
      /** The secret access key used for the AWS KMS provider */
      secretAccessKey: string;
      /**
       * An optional AWS session token that will be used as the
       * X-Amz-Security-Token header for AWS requests.
       */
      sessionToken?: string;
    };
    /** Configuration options for using 'local' as your KMS provider */
    local?: {
      /**
       * The master key used to encrypt/decrypt data keys.
       * A 96-byte long Buffer or base64 encoded string.
       */
      key: Buffer | string;
    };
    /** Configuration options for using 'azure' as your KMS provider */
    azure?: {
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
    };
    /** Configuration options for using 'gcp' as your KMS provider */
    gcp?: {
      /** The service account email to authenticate */
      email: string;
      /** A PKCS#8 encrypted key. This can either be a base64 string or a binary representation */
      privateKey: string | Buffer;
      /**
       * If present, a host with optional port. E.g. "example.com" or "example.com:443".
       * Defaults to "oauth2.googleapis.com"
       */
      endpoint?: string | undefined;
    };
  };
  /**
   * A map of namespaces to a local JSON schema for encryption
   *
   * **NOTE**: Supplying options.schemaMap provides more security than relying on JSON Schemas obtained from the server.
   * It protects against a malicious server advertising a false JSON Schema, which could trick the client into sending decrypted data that should be encrypted.
   * Schemas supplied in the schemaMap only apply to configuring automatic encryption for client side encryption.
   * Other validation rules in the JSON schema will not be enforced by the driver and will result in an error.
   */
  schemaMap?: Document;
  /** Allows the user to bypass auto encryption, maintaining implicit decryption */
  bypassAutoEncryption?: boolean;
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
  };
}

/** @public */
export interface AutoEncrypter {
  // eslint-disable-next-line @typescript-eslint/no-misused-new
  new (client: MongoClient, options: AutoEncryptionOptions): AutoEncrypter;
  init(cb: Callback): void;
  teardown(force: boolean, callback: Callback): void;
  encrypt(ns: string, cmd: Document, options: any, callback: Callback<Document>): void;
  decrypt(cmd: Document, options: any, callback: Callback<Document>): void;
}
