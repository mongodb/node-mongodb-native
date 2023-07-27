import * as fs from 'fs';
import { type MongoCryptContext, type MongoCryptKMSRequest } from 'mongodb-client-encryption';
import * as net from 'net';
import { SocksClient } from 'socks';
import * as tls from 'tls';
import { promisify } from 'util';

import {
  type BSONSerializeOptions,
  deserialize,
  type Document,
  pluckBSONSerializeOptions,
  serialize
} from '../bson';
import { type CommandOptions, type ProxyOptions } from '../cmap/connection';
import { MongoNetworkTimeoutError } from '../error';
import { type MongoClient, type MongoClientOptions } from '../mongo_client';
import { BufferPool, type Callback, MongoDBCollectionNamespace } from '../utils';
import { type DataKey } from './clientEncryption';
import { MongoCryptError } from './errors';
import { type MongocryptdManager } from './mongocryptdManager';
import { type KMSProvider, type KMSProviders } from './providers';

// libmongocrypt states
const MONGOCRYPT_CTX_ERROR = 0;
const MONGOCRYPT_CTX_NEED_MONGO_COLLINFO = 1;
const MONGOCRYPT_CTX_NEED_MONGO_MARKINGS = 2;
const MONGOCRYPT_CTX_NEED_MONGO_KEYS = 3;
const MONGOCRYPT_CTX_NEED_KMS_CREDENTIALS = 7;
const MONGOCRYPT_CTX_NEED_KMS = 4;
const MONGOCRYPT_CTX_READY = 5;
const MONGOCRYPT_CTX_DONE = 6;

const HTTPS_PORT = 443;

const stateToString = new Map([
  [MONGOCRYPT_CTX_ERROR, 'MONGOCRYPT_CTX_ERROR'],
  [MONGOCRYPT_CTX_NEED_MONGO_COLLINFO, 'MONGOCRYPT_CTX_NEED_MONGO_COLLINFO'],
  [MONGOCRYPT_CTX_NEED_MONGO_MARKINGS, 'MONGOCRYPT_CTX_NEED_MONGO_MARKINGS'],
  [MONGOCRYPT_CTX_NEED_MONGO_KEYS, 'MONGOCRYPT_CTX_NEED_MONGO_KEYS'],
  [MONGOCRYPT_CTX_NEED_KMS_CREDENTIALS, 'MONGOCRYPT_CTX_NEED_KMS_CREDENTIALS'],
  [MONGOCRYPT_CTX_NEED_KMS, 'MONGOCRYPT_CTX_NEED_KMS'],
  [MONGOCRYPT_CTX_READY, 'MONGOCRYPT_CTX_READY'],
  [MONGOCRYPT_CTX_DONE, 'MONGOCRYPT_CTX_DONE']
]);

const INSECURE_TLS_OPTIONS = [
  'tlsInsecure',
  'tlsAllowInvalidCertificates',
  'tlsAllowInvalidHostnames',
  'tlsDisableOCSPEndpointCheck',
  'tlsDisableCertificateRevocationCheck'
];

/**
 * Helper function for logging. Enabled by setting the environment flag MONGODB_CRYPT_DEBUG.
 * @param msg - Anything you want to be logged.
 */
export function debug(msg: unknown) {
  if (process.env.MONGODB_CRYPT_DEBUG) {
    // eslint-disable-next-line no-console
    console.error(msg);
  }
}

declare module 'mongodb-client-encryption' {
  // the properties added to `MongoCryptContext` here are only used for the `StateMachine`'s
  // execute method and are not part of the C++ bindings.
  interface MongoCryptContext {
    id: number;
    document: Document;
    ns: string;
  }
}

/**
 * TLS options to use when connecting. The spec specifically calls out which insecure
 * tls options are not allowed:
 *
 *  - tlsAllowInvalidCertificates
 *  - tlsAllowInvalidHostnames
 *  - tlsInsecure
 *  - tlsDisableOCSPEndpointCheck
 *  - tlsDisableCertificateRevocationCheck
 */
export type CSFLETlsOptions = Pick<
  MongoClientOptions,
  'tlsCAFile' | 'tlsCertificateKeyFile' | 'tlsCertificateKeyFilePassword'
>;

export type CSFLEKMSTlsOptions = {
  aws?: CSFLETlsOptions;
  gcp?: CSFLETlsOptions;
  kmip?: CSFLETlsOptions;
  local?: CSFLETlsOptions;
  azure?: CSFLETlsOptions;
};

/**
 * An interface representing an object that can be passed to the `StateMachine.execute` method.
 *
 * Not all properties are required for all operations.
 */
export interface StateMachineExecutable {
  _keyVaultNamespace: string;
  _keyVaultClient: MongoClient;

  /** only used for auto encryption */
  _metaDataClient?: MongoClient;
  /** only used for auto encryption */
  _mongocryptdClient?: MongoClient;
  /** only used for auto encryption */
  _mongocryptdManager?: MongocryptdManager;
  askForKMSCredentials: () => Promise<KMSProviders>;
}

export type StateMachineOptions = {
  /** socks5 proxy options, if set. */
  proxyOptions: ProxyOptions;

  /** TLS options for KMS requests, if set. */
  tlsOptions: CSFLEKMSTlsOptions;
} & Pick<BSONSerializeOptions, 'promoteLongs' | 'promoteValues'> &
  CommandOptions;

/**
 * @internal
 * An internal class that executes across a MongoCryptContext until either
 * a finishing state or an error is reached. Do not instantiate directly.
 */
export class StateMachine {
  constructor(
    private options: StateMachineOptions,
    private bsonOptions = pluckBSONSerializeOptions(options)
  ) {}

  executeAsync(executor: StateMachineExecutable, context: MongoCryptContext): Promise<Document> {
    // @ts-expect-error The callback version allows undefined for the result, but we'll never actually have an undefined result without an error.
    return promisify(this.execute.bind(this))(executor, context);
  }

  /**
   * Executes the state machine according to the specification
   */
  execute(
    executor: StateMachineExecutable,
    context: MongoCryptContext,
    callback: Callback<Document>
  ) {
    const keyVaultNamespace = executor._keyVaultNamespace;
    const keyVaultClient = executor._keyVaultClient;
    const metaDataClient = executor._metaDataClient;
    const mongocryptdClient = executor._mongocryptdClient;
    const mongocryptdManager = executor._mongocryptdManager;

    debug(`[context#${context.id}] ${stateToString.get(context.state) || context.state}`);
    switch (context.state) {
      case MONGOCRYPT_CTX_NEED_MONGO_COLLINFO: {
        const filter = deserialize(context.nextMongoOperation());
        if (!metaDataClient) {
          return callback(
            new MongoCryptError(
              'unreachable state machine state: entered MONGOCRYPT_CTX_NEED_MONGO_COLLINFO but metadata client is undefined'
            )
          );
        }
        this.fetchCollectionInfo(metaDataClient, context.ns, filter, (err, collInfo) => {
          if (err) {
            return callback(err);
          }

          if (collInfo) {
            context.addMongoOperationResponse(collInfo);
          }

          context.finishMongoOperation();
          this.execute(executor, context, callback);
        });

        return;
      }

      case MONGOCRYPT_CTX_NEED_MONGO_MARKINGS: {
        const command = context.nextMongoOperation();
        if (!mongocryptdClient) {
          return callback(
            new MongoCryptError(
              'unreachable state machine state: entered MONGOCRYPT_CTX_NEED_MONGO_MARKINGS but mongocryptdClient is undefined'
            )
          );
        }
        this.markCommand(mongocryptdClient, context.ns, command, (err, markedCommand) => {
          if (err || !markedCommand) {
            // If we are not bypassing spawning, then we should retry once on a MongoTimeoutError (server selection error)
            if (
              err instanceof MongoNetworkTimeoutError &&
              mongocryptdManager &&
              !mongocryptdManager.bypassSpawn
            ) {
              mongocryptdManager.spawn(() => {
                // TODO: should we be shadowing the variables here?
                this.markCommand(mongocryptdClient, context.ns, command, (err, markedCommand) => {
                  if (err || !markedCommand) return callback(err);

                  context.addMongoOperationResponse(markedCommand);
                  context.finishMongoOperation();

                  this.execute(executor, context, callback);
                });
              });
              return;
            }
            return callback(err);
          }
          context.addMongoOperationResponse(markedCommand);
          context.finishMongoOperation();

          this.execute(executor, context, callback);
        });

        return;
      }

      case MONGOCRYPT_CTX_NEED_MONGO_KEYS: {
        const filter = context.nextMongoOperation();
        this.fetchKeys(keyVaultClient, keyVaultNamespace, filter, (err, keys) => {
          if (err || !keys) return callback(err);
          keys.forEach(key => {
            context.addMongoOperationResponse(serialize(key));
          });

          context.finishMongoOperation();
          this.execute(executor, context, callback);
        });

        return;
      }

      case MONGOCRYPT_CTX_NEED_KMS_CREDENTIALS: {
        executor
          .askForKMSCredentials()
          .then(kmsProviders => {
            context.provideKMSProviders(serialize(kmsProviders));
            this.execute(executor, context, callback);
          })
          .catch(err => {
            callback(err);
          });

        return;
      }

      case MONGOCRYPT_CTX_NEED_KMS: {
        const promises = [];

        let request;
        while ((request = context.nextKMSRequest())) {
          promises.push(this.kmsRequest(request));
        }

        Promise.all(promises)
          .then(() => {
            context.finishKMSRequests();
            this.execute(executor, context, callback);
          })
          .catch(err => {
            callback(err);
          });

        return;
      }

      // terminal states
      case MONGOCRYPT_CTX_READY: {
        const finalizedContext = context.finalize();
        // TODO: Maybe rework the logic here so that instead of doing
        // the callback here, finalize stores the result, and then
        // we wait to MONGOCRYPT_CTX_DONE to do the callback
        // @ts-expect-error finalize can change the state, check for error
        if (context.state === MONGOCRYPT_CTX_ERROR) {
          const message = context.status.message || 'Finalization error';
          callback(new MongoCryptError(message));
          return;
        }
        callback(undefined, deserialize(finalizedContext, this.options));
        return;
      }
      case MONGOCRYPT_CTX_ERROR: {
        const message = context.status.message;
        callback(
          new MongoCryptError(
            message ??
              'unidentifiable error in MongoCrypt - received an error status from `libmongocrypt` but received no error message.'
          )
        );
        return;
      }

      case MONGOCRYPT_CTX_DONE:
        callback();
        return;

      default:
        callback(new MongoCryptError(`Unknown state: ${context.state}`));
        return;
    }
  }

  /**
   * Handles the request to the KMS service. Exposed for testing purposes. Do not directly invoke.
   * @param kmsContext - A C++ KMS context returned from the bindings
   * @returns A promise that resolves when the KMS reply has be fully parsed
   */
  kmsRequest(request: MongoCryptKMSRequest): Promise<void> {
    const parsedUrl = request.endpoint.split(':');
    const port = parsedUrl[1] != null ? Number.parseInt(parsedUrl[1], 10) : HTTPS_PORT;
    const options: tls.ConnectionOptions & { host: string; port: number } = {
      host: parsedUrl[0],
      servername: parsedUrl[0],
      port
    };
    const message = request.message;

    // TODO(NODE-3959): We can adopt `for-await on(socket, 'data')` with logic to control abort
    // eslint-disable-next-line no-async-promise-executor, @typescript-eslint/no-misused-promises
    return new Promise(async (resolve, reject) => {
      const buffer = new BufferPool();

      /* eslint-disable prefer-const */
      let socket: net.Socket;
      let rawSocket: net.Socket;

      function destroySockets() {
        for (const sock of [socket, rawSocket]) {
          if (sock) {
            sock.removeAllListeners();
            sock.destroy();
          }
        }
      }

      function ontimeout() {
        destroySockets();
        reject(new MongoCryptError('KMS request timed out'));
      }

      function onerror(err: Error) {
        destroySockets();
        // TODO: make note of this
        const mcError = new MongoCryptError('KMS request failed', { cause: err });
        reject(mcError);
      }

      if (this.options.proxyOptions && this.options.proxyOptions.proxyHost) {
        rawSocket = net.connect({
          host: this.options.proxyOptions.proxyHost,
          port: this.options.proxyOptions.proxyPort || 1080
        });

        rawSocket.on('timeout', ontimeout);
        rawSocket.on('error', onerror);
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const events = require('events') as typeof import('events');
          await events.once(rawSocket, 'connect');
          options.socket = (
            await SocksClient.createConnection({
              existing_socket: rawSocket,
              command: 'connect',
              destination: { host: options.host, port: options.port },
              proxy: {
                // host and port are ignored because we pass existing_socket
                host: 'iLoveJavaScript',
                port: 0,
                type: 5,
                userId: this.options.proxyOptions.proxyUsername,
                password: this.options.proxyOptions.proxyPassword
              }
            })
          ).socket;
        } catch (err) {
          return onerror(err);
        }
      }

      const tlsOptions = this.options.tlsOptions;
      if (tlsOptions) {
        const kmsProvider = request.kmsProvider as KMSProvider;
        const providerTlsOptions = tlsOptions[kmsProvider];
        if (providerTlsOptions) {
          const error = this.validateTlsOptions(kmsProvider, providerTlsOptions);
          if (error) reject(error);
          this.setTlsOptions(providerTlsOptions, options);
        }
      }
      socket = tls.connect(options, () => {
        socket.write(message);
      });

      socket.once('timeout', ontimeout);
      socket.once('error', onerror);

      socket.on('data', data => {
        buffer.append(data);
        while (request.bytesNeeded > 0 && buffer.length) {
          const bytesNeeded = Math.min(request.bytesNeeded, buffer.length);
          request.addResponse(buffer.read(bytesNeeded));
        }

        if (request.bytesNeeded <= 0) {
          // There's no need for any more activity on this socket at this point.
          destroySockets();
          resolve();
        }
      });
    });
  }

  /**
   * Validates the provided TLS options are secure.
   *
   * @param kmsProvider - The KMS provider name.
   * @param tlsOptions - The client TLS options for the provider.
   *
   * @returns An error if any option is invalid.
   */
  validateTlsOptions(kmsProvider: string, tlsOptions: CSFLETlsOptions): MongoCryptError | void {
    const tlsOptionNames = Object.keys(tlsOptions);
    for (const option of INSECURE_TLS_OPTIONS) {
      if (tlsOptionNames.includes(option)) {
        return new MongoCryptError(`Insecure TLS options prohibited for ${kmsProvider}: ${option}`);
      }
    }
  }

  /**
   * Sets only the valid secure TLS options.
   *
   * @param tlsOptions - The client TLS options for the provider.
   * @param options - The existing connection options.
   */
  setTlsOptions(tlsOptions: CSFLETlsOptions, options: tls.ConnectionOptions) {
    if (tlsOptions.tlsCertificateKeyFile) {
      const cert = fs.readFileSync(tlsOptions.tlsCertificateKeyFile);
      options.cert = options.key = cert;
    }
    if (tlsOptions.tlsCAFile) {
      options.ca = fs.readFileSync(tlsOptions.tlsCAFile);
    }
    if (tlsOptions.tlsCertificateKeyFilePassword) {
      options.passphrase = tlsOptions.tlsCertificateKeyFilePassword;
    }
  }

  /**
   * Fetches collection info for a provided namespace, when libmongocrypt
   * enters the `MONGOCRYPT_CTX_NEED_MONGO_COLLINFO` state. The result is
   * used to inform libmongocrypt of the schema associated with this
   * namespace. Exposed for testing purposes. Do not directly invoke.
   *
   * @param client - A MongoClient connected to the topology
   * @param ns - The namespace to list collections from
   * @param filter - A filter for the listCollections command
   * @param callback - Invoked with the info of the requested collection, or with an error
   */
  fetchCollectionInfo(
    client: MongoClient,
    ns: string,
    filter: Document,
    callback: Callback<Uint8Array | null>
  ) {
    const { db } = MongoDBCollectionNamespace.fromString(ns);

    client
      .db(db)
      .listCollections(filter, {
        promoteLongs: false,
        promoteValues: false
      })
      .toArray()
      .then(
        collections => {
          const info = collections.length > 0 ? serialize(collections[0]) : null;
          return callback(undefined, info);
        },
        err => {
          callback(err);
        }
      );
  }

  /**
   * Calls to the mongocryptd to provide markings for a command.
   * Exposed for testing purposes. Do not directly invoke.
   * @param client - A MongoClient connected to a mongocryptd
   * @param ns - The namespace (database.collection) the command is being executed on
   * @param command - The command to execute.
   * @param callback - Invoked with the serialized and marked bson command, or with an error
   */
  markCommand(
    client: MongoClient,
    ns: string,
    command: Uint8Array,
    callback: Callback<Uint8Array>
  ) {
    const options = { promoteLongs: false, promoteValues: false };
    const { db } = MongoDBCollectionNamespace.fromString(ns);
    const rawCommand = deserialize(command, options);

    client
      .db(db)
      .command(rawCommand, options)
      .then(
        response => {
          return callback(undefined, serialize(response, this.bsonOptions));
        },
        err => {
          callback(err);
        }
      );
  }

  /**
   * Requests keys from the keyVault collection on the topology.
   * Exposed for testing purposes. Do not directly invoke.
   * @param client - A MongoClient connected to the topology
   * @param keyVaultNamespace - The namespace (database.collection) of the keyVault Collection
   * @param filter - The filter for the find query against the keyVault Collection
   * @param callback - Invoked with the found keys, or with an error
   */
  fetchKeys(
    client: MongoClient,
    keyVaultNamespace: string,
    filter: Uint8Array,
    callback: Callback<Array<DataKey>>
  ) {
    const { db: dbName, collection: collectionName } =
      MongoDBCollectionNamespace.fromString(keyVaultNamespace);

    client
      .db(dbName)
      .collection<DataKey>(collectionName, { readConcern: { level: 'majority' } })
      .find(deserialize(filter))
      .toArray()
      .then(
        keys => {
          return callback(undefined, keys);
        },
        err => {
          callback(err);
        }
      );
  }
}
