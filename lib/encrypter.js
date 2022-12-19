"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Encrypter = void 0;
/* eslint-disable @typescript-eslint/no-var-requires */
const bson_1 = require("./bson");
const constants_1 = require("./constants");
const error_1 = require("./error");
const mongo_client_1 = require("./mongo_client");
const utils_1 = require("./utils");
let AutoEncrypterClass;
/** @internal */
const kInternalClient = Symbol('internalClient');
/** @internal */
class Encrypter {
    constructor(client, uri, options) {
        if (typeof options.autoEncryption !== 'object') {
            throw new error_1.MongoInvalidArgumentError('Option "autoEncryption" must be specified');
        }
        // initialize to null, if we call getInternalClient, we may set this it is important to not overwrite those function calls.
        this[kInternalClient] = null;
        this.bypassAutoEncryption = !!options.autoEncryption.bypassAutoEncryption;
        this.needsConnecting = false;
        if (options.maxPoolSize === 0 && options.autoEncryption.keyVaultClient == null) {
            options.autoEncryption.keyVaultClient = client;
        }
        else if (options.autoEncryption.keyVaultClient == null) {
            options.autoEncryption.keyVaultClient = this.getInternalClient(client, uri, options);
        }
        if (this.bypassAutoEncryption) {
            options.autoEncryption.metadataClient = undefined;
        }
        else if (options.maxPoolSize === 0) {
            options.autoEncryption.metadataClient = client;
        }
        else {
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
        options.autoEncryption.bson.serialize = bson_1.serialize;
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        options.autoEncryption.bson.deserialize = bson_1.deserialize;
        this.autoEncrypter = new AutoEncrypterClass(client, options.autoEncryption);
    }
    getInternalClient(client, uri, options) {
        // TODO(NODE-4144): Remove new variable for type narrowing
        let internalClient = this[kInternalClient];
        if (internalClient == null) {
            const clonedOptions = {};
            for (const key of [
                ...Object.getOwnPropertyNames(options),
                ...Object.getOwnPropertySymbols(options)
            ]) {
                if (['autoEncryption', 'minPoolSize', 'servers', 'caseTranslate', 'dbName'].includes(key))
                    continue;
                Reflect.set(clonedOptions, key, Reflect.get(options, key));
            }
            clonedOptions.minPoolSize = 0;
            internalClient = new mongo_client_1.MongoClient(uri, clonedOptions);
            this[kInternalClient] = internalClient;
            for (const eventName of constants_1.MONGO_CLIENT_EVENTS) {
                for (const listener of client.listeners(eventName)) {
                    internalClient.on(eventName, listener);
                }
            }
            client.on('newListener', (eventName, listener) => {
                internalClient === null || internalClient === void 0 ? void 0 : internalClient.on(eventName, listener);
            });
            this.needsConnecting = true;
        }
        return internalClient;
    }
    async connectInternalClient() {
        // TODO(NODE-4144): Remove new variable for type narrowing
        const internalClient = this[kInternalClient];
        if (this.needsConnecting && internalClient != null) {
            this.needsConnecting = false;
            await internalClient.connect();
        }
    }
    close(client, force, callback) {
        this.autoEncrypter.teardown(!!force, e => {
            const internalClient = this[kInternalClient];
            if (internalClient != null && client !== internalClient) {
                return internalClient.close(force, callback);
            }
            callback(e);
        });
    }
    static checkForMongoCrypt() {
        const mongodbClientEncryption = (0, utils_1.getMongoDBClientEncryption)();
        if (mongodbClientEncryption == null) {
            throw new error_1.MongoMissingDependencyError('Auto-encryption requested, but the module is not installed. ' +
                'Please add `mongodb-client-encryption` as a dependency of your project');
        }
        AutoEncrypterClass = mongodbClientEncryption.extension(require('../lib/index')).AutoEncrypter;
    }
}
exports.Encrypter = Encrypter;
//# sourceMappingURL=encrypter.js.map