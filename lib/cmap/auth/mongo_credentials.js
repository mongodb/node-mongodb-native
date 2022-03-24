"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MongoCredentials = void 0;
const error_1 = require("../../error");
const utils_1 = require("../../utils");
const gssapi_1 = require("./gssapi");
const providers_1 = require("./providers");
// https://github.com/mongodb/specifications/blob/master/source/auth/auth.rst
function getDefaultAuthMechanism(hello) {
    if (hello) {
        // If hello contains saslSupportedMechs, use scram-sha-256
        // if it is available, else scram-sha-1
        if (Array.isArray(hello.saslSupportedMechs)) {
            return hello.saslSupportedMechs.includes(providers_1.AuthMechanism.MONGODB_SCRAM_SHA256)
                ? providers_1.AuthMechanism.MONGODB_SCRAM_SHA256
                : providers_1.AuthMechanism.MONGODB_SCRAM_SHA1;
        }
        // Fallback to legacy selection method. If wire version >= 3, use scram-sha-1
        if (hello.maxWireVersion >= 3) {
            return providers_1.AuthMechanism.MONGODB_SCRAM_SHA1;
        }
    }
    // Default for wireprotocol < 3
    return providers_1.AuthMechanism.MONGODB_CR;
}
/**
 * A representation of the credentials used by MongoDB
 * @public
 */
class MongoCredentials {
    constructor(options) {
        this.username = options.username;
        this.password = options.password;
        this.source = options.source;
        if (!this.source && options.db) {
            this.source = options.db;
        }
        this.mechanism = options.mechanism || providers_1.AuthMechanism.MONGODB_DEFAULT;
        this.mechanismProperties = options.mechanismProperties || {};
        if (this.mechanism.match(/MONGODB-AWS/i)) {
            if (!this.username && process.env.AWS_ACCESS_KEY_ID) {
                this.username = process.env.AWS_ACCESS_KEY_ID;
            }
            if (!this.password && process.env.AWS_SECRET_ACCESS_KEY) {
                this.password = process.env.AWS_SECRET_ACCESS_KEY;
            }
            if (this.mechanismProperties.AWS_SESSION_TOKEN == null &&
                process.env.AWS_SESSION_TOKEN != null) {
                this.mechanismProperties = {
                    ...this.mechanismProperties,
                    AWS_SESSION_TOKEN: process.env.AWS_SESSION_TOKEN
                };
            }
        }
        if ('gssapiCanonicalizeHostName' in this.mechanismProperties) {
            (0, utils_1.emitWarningOnce)('gssapiCanonicalizeHostName is deprecated. Please use CANONICALIZE_HOST_NAME instead.');
            this.mechanismProperties.CANONICALIZE_HOST_NAME =
                this.mechanismProperties.gssapiCanonicalizeHostName;
        }
        Object.freeze(this.mechanismProperties);
        Object.freeze(this);
    }
    /** Determines if two MongoCredentials objects are equivalent */
    equals(other) {
        return (this.mechanism === other.mechanism &&
            this.username === other.username &&
            this.password === other.password &&
            this.source === other.source);
    }
    /**
     * If the authentication mechanism is set to "default", resolves the authMechanism
     * based on the server version and server supported sasl mechanisms.
     *
     * @param hello - A hello response from the server
     */
    resolveAuthMechanism(hello) {
        // If the mechanism is not "default", then it does not need to be resolved
        if (this.mechanism.match(/DEFAULT/i)) {
            return new MongoCredentials({
                username: this.username,
                password: this.password,
                source: this.source,
                mechanism: getDefaultAuthMechanism(hello),
                mechanismProperties: this.mechanismProperties
            });
        }
        return this;
    }
    validate() {
        var _a;
        if ((this.mechanism === providers_1.AuthMechanism.MONGODB_GSSAPI ||
            this.mechanism === providers_1.AuthMechanism.MONGODB_CR ||
            this.mechanism === providers_1.AuthMechanism.MONGODB_PLAIN ||
            this.mechanism === providers_1.AuthMechanism.MONGODB_SCRAM_SHA1 ||
            this.mechanism === providers_1.AuthMechanism.MONGODB_SCRAM_SHA256) &&
            !this.username) {
            throw new error_1.MongoMissingCredentialsError(`Username required for mechanism '${this.mechanism}'`);
        }
        if (providers_1.AUTH_MECHS_AUTH_SRC_EXTERNAL.has(this.mechanism)) {
            if (this.source != null && this.source !== '$external') {
                // TODO(NODE-3485): Replace this with a MongoAuthValidationError
                throw new error_1.MongoAPIError(`Invalid source '${this.source}' for mechanism '${this.mechanism}' specified.`);
            }
        }
        if (this.mechanism === providers_1.AuthMechanism.MONGODB_PLAIN && this.source == null) {
            // TODO(NODE-3485): Replace this with a MongoAuthValidationError
            throw new error_1.MongoAPIError('PLAIN Authentication Mechanism needs an auth source');
        }
        if (this.mechanism === providers_1.AuthMechanism.MONGODB_X509 && this.password != null) {
            if (this.password === '') {
                Reflect.set(this, 'password', undefined);
                return;
            }
            // TODO(NODE-3485): Replace this with a MongoAuthValidationError
            throw new error_1.MongoAPIError(`Password not allowed for mechanism MONGODB-X509`);
        }
        const canonicalization = (_a = this.mechanismProperties.CANONICALIZE_HOST_NAME) !== null && _a !== void 0 ? _a : false;
        if (!Object.values(gssapi_1.GSSAPICanonicalizationValue).includes(canonicalization)) {
            throw new error_1.MongoAPIError(`Invalid CANONICALIZE_HOST_NAME value: ${canonicalization}`);
        }
    }
    static merge(creds, options) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
        return new MongoCredentials({
            username: (_b = (_a = options.username) !== null && _a !== void 0 ? _a : creds === null || creds === void 0 ? void 0 : creds.username) !== null && _b !== void 0 ? _b : '',
            password: (_d = (_c = options.password) !== null && _c !== void 0 ? _c : creds === null || creds === void 0 ? void 0 : creds.password) !== null && _d !== void 0 ? _d : '',
            mechanism: (_f = (_e = options.mechanism) !== null && _e !== void 0 ? _e : creds === null || creds === void 0 ? void 0 : creds.mechanism) !== null && _f !== void 0 ? _f : providers_1.AuthMechanism.MONGODB_DEFAULT,
            mechanismProperties: (_h = (_g = options.mechanismProperties) !== null && _g !== void 0 ? _g : creds === null || creds === void 0 ? void 0 : creds.mechanismProperties) !== null && _h !== void 0 ? _h : {},
            source: (_l = (_k = (_j = options.source) !== null && _j !== void 0 ? _j : options.db) !== null && _k !== void 0 ? _k : creds === null || creds === void 0 ? void 0 : creds.source) !== null && _l !== void 0 ? _l : 'admin'
        });
    }
}
exports.MongoCredentials = MongoCredentials;
//# sourceMappingURL=mongo_credentials.js.map