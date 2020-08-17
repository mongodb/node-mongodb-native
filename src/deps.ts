import { MongoError } from './error';
import type { MongoClient } from './mongo_client';
import type { Document } from './bson';
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

export let Kerberos: typeof import('kerberos') = makeErrorModule(
  new MongoError(
    'Optional module `kerberos` not found. Please install it to enable kerberos authentication'
  )
);

try {
  Kerberos = require('kerberos');
} catch {} // eslint-disable-line

export let Snappy: typeof import('snappy') = makeErrorModule(
  new MongoError(
    'Optional module `snappy` not found. Please install it to enable snappy compression'
  )
);

try {
  Snappy = require('snappy');
} catch {} // eslint-disable-line

export let saslprep: typeof import('saslprep') = makeErrorModule(
  new MongoError(
    'Optional module `saslprep` not found.' +
      ' Please install it to enable Stringprep Profile for User Names and Passwords'
  )
);

try {
  saslprep = require('saslprep');
} catch {} // eslint-disable-line

export let aws4: typeof import('aws4') = makeErrorModule(
  new MongoError('Optional module `aws4` not found. Please install it to enable AWS authentication')
);

try {
  aws4 = require('aws4');
} catch {} // eslint-disable-line

export const enum AutoEncryptionLoggerLevels {
  FatalError = 0,
  Error = 1,
  Warning = 2,
  Info = 3,
  Trace = 4
}

export interface AutoEncryptionOptions {
  /** A `MongoClient` used to fetch keys from a key vault */
  keyVaultClient?: MongoClient;
  /** The namespace where keys are stored in the key vault */
  keyVaultNamespace?: string;
  /** Configuration options that are used by specific KMS providers during key generation, encryption, and decryption. */
  kmsProviders?: {
    /** Configuration options for using 'aws' as your KMS provider */
    aws?: {
      /** The access key used for the AWS KMS provider */
      accessKeyId?: string;
      /** The secret access key used for the AWS KMS provider */
      secretAccessKey?: string;
    };
    /** Configuration options for using 'local' as your KMS provider */
    local?: {
      /** The master key used to encrypt/decrypt data keys. A 96-byte long Buffer. */
      key?: Buffer;
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
    logger?: (level: AutoEncryptionLoggerLevels, message: string) => void;
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

export interface AutoEncrypter {
  init(cb: Callback): void;
  teardown(force: boolean, callback: Callback): void;
  encrypt(ns: string, cmd: Document, options: any, callback: Callback<Document>): void;
  decrypt(cmd: Document, options: any, callback: Callback<Document>): void;
}

/** Declaration Merging block for MongoDB specific functionality in Kerberos */
declare module 'kerberos' {
  export const processes: {
    MongoAuthProcess: {
      new (host: string, port: number, serviceName: string, options: unknown): {
        host: string;
        port: number;
        serviceName: string;
        canonicalizeHostName: boolean;
        retries: number;

        init: (username: string, password: string, callback: Callback) => void;
        transition: (payload: unknown, callback: Callback) => void;
      };
    };
  };
}
