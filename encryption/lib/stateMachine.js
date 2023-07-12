'use strict';

const { promisify } = require('util');

module.exports = function (modules) {
  const tls = require('tls');
  const net = require('net');
  const fs = require('fs');
  const { once } = require('events');
  const { SocksClient } = require('socks');

  // Try first to import 4.x name, fallback to 3.x name
  const MongoNetworkTimeoutError =
    modules.mongodb.MongoNetworkTimeoutError || modules.mongodb.MongoTimeoutError;

  const common = require('./common');
  const debug = common.debug;
  const databaseNamespace = common.databaseNamespace;
  const collectionNamespace = common.collectionNamespace;
  const { MongoCryptError } = require('./errors');
  const { BufferPool } = require('./buffer_pool');

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
   * @ignore
   * @callback StateMachine~executeCallback
   * @param {Error} [err] If present, indicates that the execute call failed with the given error
   * @param {object} [result] If present, is the result of executing the state machine.
   * @returns {void}
   */

  /**
   * @ignore
   * @callback StateMachine~fetchCollectionInfoCallback
   * @param {Error} [err] If present, indicates that fetching the collection info failed with the given error
   * @param {object} [result] If present, is the fetched collection info for the first collection to match the given filter
   * @returns {void}
   */

  /**
   * @ignore
   * @callback StateMachine~markCommandCallback
   * @param {Error} [err] If present, indicates that marking the command failed with the given error
   * @param {Buffer} [result] If present, is the marked command serialized into bson
   * @returns {void}
   */

  /**
   * @ignore
   * @callback StateMachine~fetchKeysCallback
   * @param {Error} [err] If present, indicates that fetching the keys failed with the given error
   * @param {object[]} [result] If present, is all the keys from the keyVault collection that matched the given filter
   */

  /**
   * @ignore
   * An internal class that executes across a MongoCryptContext until either
   * a finishing state or an error is reached. Do not instantiate directly.
   * @class StateMachine
   */
  class StateMachine {
    constructor(options) {
      this.options = options || {};
      this.bson = options.bson;

      this.executeAsync = promisify((autoEncrypter, context, callback) =>
        this.execute(autoEncrypter, context, callback)
      );
    }

    /**
     * @ignore
     * Executes the state machine according to the specification
     * @param {AutoEncrypter|ClientEncryption} autoEncrypter The JS encryption object
     * @param {object} context The C++ context object returned from the bindings
     * @param {StateMachine~executeCallback} callback Invoked with the result/error of executing the state machine
     * @returns {void}
     */
    execute(autoEncrypter, context, callback) {
      const bson = this.bson;
      const keyVaultNamespace = autoEncrypter._keyVaultNamespace;
      const keyVaultClient = autoEncrypter._keyVaultClient;
      const metaDataClient = autoEncrypter._metaDataClient;
      const mongocryptdClient = autoEncrypter._mongocryptdClient;
      const mongocryptdManager = autoEncrypter._mongocryptdManager;

      debug(`[context#${context.id}] ${stateToString.get(context.state) || context.state}`);
      switch (context.state) {
        case MONGOCRYPT_CTX_NEED_MONGO_COLLINFO: {
          const filter = bson.deserialize(context.nextMongoOperation());
          this.fetchCollectionInfo(metaDataClient, context.ns, filter, (err, collInfo) => {
            if (err) {
              return callback(err, null);
            }

            if (collInfo) {
              context.addMongoOperationResponse(collInfo);
            }

            context.finishMongoOperation();
            this.execute(autoEncrypter, context, callback);
          });

          return;
        }

        case MONGOCRYPT_CTX_NEED_MONGO_MARKINGS: {
          const command = context.nextMongoOperation();
          this.markCommand(mongocryptdClient, context.ns, command, (err, markedCommand) => {
            if (err) {
              // If we are not bypassing spawning, then we should retry once on a MongoTimeoutError (server selection error)
              if (
                err instanceof MongoNetworkTimeoutError &&
                mongocryptdManager &&
                !mongocryptdManager.bypassSpawn
              ) {
                mongocryptdManager.spawn(() => {
                  // TODO: should we be shadowing the variables here?
                  this.markCommand(mongocryptdClient, context.ns, command, (err, markedCommand) => {
                    if (err) return callback(err, null);

                    context.addMongoOperationResponse(markedCommand);
                    context.finishMongoOperation();

                    this.execute(autoEncrypter, context, callback);
                  });
                });
                return;
              }
              return callback(err, null);
            }
            context.addMongoOperationResponse(markedCommand);
            context.finishMongoOperation();

            this.execute(autoEncrypter, context, callback);
          });

          return;
        }

        case MONGOCRYPT_CTX_NEED_MONGO_KEYS: {
          const filter = context.nextMongoOperation();
          this.fetchKeys(keyVaultClient, keyVaultNamespace, filter, (err, keys) => {
            if (err) return callback(err, null);
            keys.forEach(key => {
              context.addMongoOperationResponse(bson.serialize(key));
            });

            context.finishMongoOperation();
            this.execute(autoEncrypter, context, callback);
          });

          return;
        }

        case MONGOCRYPT_CTX_NEED_KMS_CREDENTIALS: {
          autoEncrypter
            .askForKMSCredentials()
            .then(kmsProviders => {
              context.provideKMSProviders(
                !Buffer.isBuffer(kmsProviders) ? bson.serialize(kmsProviders) : kmsProviders
              );
              this.execute(autoEncrypter, context, callback);
            })
            .catch(err => {
              callback(err, null);
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
              this.execute(autoEncrypter, context, callback);
            })
            .catch(err => {
              callback(err, null);
            });

          return;
        }

        // terminal states
        case MONGOCRYPT_CTX_READY: {
          const finalizedContext = context.finalize();
          // TODO: Maybe rework the logic here so that instead of doing
          // the callback here, finalize stores the result, and then
          // we wait to MONGOCRYPT_CTX_DONE to do the callback
          if (context.state === MONGOCRYPT_CTX_ERROR) {
            const message = context.status.message || 'Finalization error';
            callback(new MongoCryptError(message));
            return;
          }
          callback(null, bson.deserialize(finalizedContext, this.options));
          return;
        }
        case MONGOCRYPT_CTX_ERROR: {
          const message = context.status.message;
          callback(new MongoCryptError(message));
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
     * @ignore
     * Handles the request to the KMS service. Exposed for testing purposes. Do not directly invoke.
     * @param {*} kmsContext A C++ KMS context returned from the bindings
     * @returns {Promise<void>} A promise that resolves when the KMS reply has be fully parsed
     */
    kmsRequest(request) {
      const parsedUrl = request.endpoint.split(':');
      const port = parsedUrl[1] != null ? Number.parseInt(parsedUrl[1], 10) : HTTPS_PORT;
      const options = { host: parsedUrl[0], servername: parsedUrl[0], port };
      const message = request.message;

      // TODO(NODE-3959): We can adopt `for-await on(socket, 'data')` with logic to control abort
      // eslint-disable-next-line no-async-promise-executor
      return new Promise(async (resolve, reject) => {
        const buffer = new BufferPool();

        let socket;
        let rawSocket;

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

        function onerror(err) {
          destroySockets();
          const mcError = new MongoCryptError('KMS request failed');
          mcError.originalError = err;
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
            await once(rawSocket, 'connect');
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
          const kmsProvider = request.kmsProvider;
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
     * @ignore
     * Validates the provided TLS options are secure.
     *
     * @param {string} kmsProvider The KMS provider name.
     * @param {ClientEncryptionTLSOptions} tlsOptions The client TLS options for the provider.
     *
     * @returns {Error} If any option is invalid.
     */
    validateTlsOptions(kmsProvider, tlsOptions) {
      const tlsOptionNames = Object.keys(tlsOptions);
      for (const option of INSECURE_TLS_OPTIONS) {
        if (tlsOptionNames.includes(option)) {
          return new MongoCryptError(
            `Insecure TLS options prohibited for ${kmsProvider}: ${option}`
          );
        }
      }
    }

    /**
     * @ignore
     * Sets only the valid secure TLS options.
     *
     * @param {ClientEncryptionTLSOptions} tlsOptions The client TLS options for the provider.
     * @param {Object} options The existing connection options.
     */
    setTlsOptions(tlsOptions, options) {
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
     * @ignore
     * Fetches collection info for a provided namespace, when libmongocrypt
     * enters the `MONGOCRYPT_CTX_NEED_MONGO_COLLINFO` state. The result is
     * used to inform libmongocrypt of the schema associated with this
     * namespace. Exposed for testing purposes. Do not directly invoke.
     *
     * @param {MongoClient} client A MongoClient connected to the topology
     * @param {string} ns The namespace to list collections from
     * @param {object} filter A filter for the listCollections command
     * @param {StateMachine~fetchCollectionInfoCallback} callback Invoked with the info of the requested collection, or with an error
     */
    fetchCollectionInfo(client, ns, filter, callback) {
      const bson = this.bson;
      const dbName = databaseNamespace(ns);

      client
        .db(dbName)
        .listCollections(filter, {
          promoteLongs: false,
          promoteValues: false
        })
        .toArray()
        .then(
          collections => {
            const info = collections.length > 0 ? bson.serialize(collections[0]) : null;
            return callback(null, info);
          },
          err => {
            callback(err, null);
          }
        );
    }

    /**
     * @ignore
     * Calls to the mongocryptd to provide markings for a command.
     * Exposed for testing purposes. Do not directly invoke.
     * @param {MongoClient} client A MongoClient connected to a mongocryptd
     * @param {string} ns The namespace (database.collection) the command is being executed on
     * @param {object} command The command to execute.
     * @param {StateMachine~markCommandCallback} callback Invoked with the serialized and marked bson command, or with an error
     * @returns {void}
     */
    markCommand(client, ns, command, callback) {
      const bson = this.bson;
      const options = { promoteLongs: false, promoteValues: false };
      const dbName = databaseNamespace(ns);
      const rawCommand = bson.deserialize(command, options);

      client
        .db(dbName)
        .command(rawCommand, options)
        .then(
          response => {
            return callback(null, bson.serialize(response, this.options));
          },
          err => {
            callback(err, null);
          }
        );
    }

    /**
     * @ignore
     * Requests keys from the keyVault collection on the topology.
     * Exposed for testing purposes. Do not directly invoke.
     * @param {MongoClient} client A MongoClient connected to the topology
     * @param {string} keyVaultNamespace The namespace (database.collection) of the keyVault Collection
     * @param {object} filter The filter for the find query against the keyVault Collection
     * @param {StateMachine~fetchKeysCallback} callback Invoked with the found keys, or with an error
     * @returns {void}
     */
    fetchKeys(client, keyVaultNamespace, filter, callback) {
      const bson = this.bson;
      const dbName = databaseNamespace(keyVaultNamespace);
      const collectionName = collectionNamespace(keyVaultNamespace);
      filter = bson.deserialize(filter);

      client
        .db(dbName)
        .collection(collectionName, { readConcern: { level: 'majority' } })
        .find(filter)
        .toArray()
        .then(
          keys => {
            return callback(null, keys);
          },
          err => {
            callback(err, null);
          }
        );
    }
  }

  return { StateMachine };
};
