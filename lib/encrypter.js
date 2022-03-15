"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Encrypter = void 0;
/* eslint-disable @typescript-eslint/no-var-requires */
const bson_1 = require("./bson");
const constants_1 = require("./constants");
const error_1 = require("./error");
const mongo_client_1 = require("./mongo_client");
let AutoEncrypterClass;
/** @internal */
const kInternalClient = Symbol('internalClient');
/** @internal */
class Encrypter {
    constructor(client, uri, options) {
        if (typeof options.autoEncryption !== 'object') {
            throw new error_1.MongoInvalidArgumentError('Option "autoEncryption" must be specified');
        }
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
        if (!this[kInternalClient]) {
            const clonedOptions = {};
            for (const key of Object.keys(options)) {
                if (['autoEncryption', 'minPoolSize', 'servers', 'caseTranslate', 'dbName'].includes(key))
                    continue;
                Reflect.set(clonedOptions, key, Reflect.get(options, key));
            }
            clonedOptions.minPoolSize = 0;
            this[kInternalClient] = new mongo_client_1.MongoClient(uri, clonedOptions);
            for (const eventName of constants_1.MONGO_CLIENT_EVENTS) {
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
        this.autoEncrypter.teardown(!!force, e => {
            if (this[kInternalClient] && client !== this[kInternalClient]) {
                return this[kInternalClient].close(force, callback);
            }
            callback(e);
        });
    }
    static checkForMongoCrypt() {
        let mongodbClientEncryption = undefined;
        try {
            // Ensure you always wrap an optional require in the try block NODE-3199
            mongodbClientEncryption = require('mongodb-client-encryption');
        }
        catch (err) {
            throw new error_1.MongoMissingDependencyError('Auto-encryption requested, but the module is not installed. ' +
                'Please add `mongodb-client-encryption` as a dependency of your project');
        }
        AutoEncrypterClass = mongodbClientEncryption.extension(require('../lib/index')).AutoEncrypter;
    }
}
exports.Encrypter = Encrypter;
//# sourceMappingURL=encrypter.js.map