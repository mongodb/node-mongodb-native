"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScramSHA256 = exports.ScramSHA1 = void 0;
const crypto = require("crypto");
const bson_1 = require("../../bson");
const deps_1 = require("../../deps");
const error_1 = require("../../error");
const utils_1 = require("../../utils");
const auth_provider_1 = require("./auth_provider");
const providers_1 = require("./providers");
class ScramSHA extends auth_provider_1.AuthProvider {
    constructor(cryptoMethod) {
        super();
        this.cryptoMethod = cryptoMethod || 'sha1';
    }
    prepare(handshakeDoc, authContext, callback) {
        const cryptoMethod = this.cryptoMethod;
        const credentials = authContext.credentials;
        if (!credentials) {
            return callback(new error_1.MongoMissingCredentialsError('AuthContext must provide credentials.'));
        }
        if (cryptoMethod === 'sha256' && deps_1.saslprep == null) {
            (0, utils_1.emitWarning)('Warning: no saslprep library specified. Passwords will not be sanitized');
        }
        crypto.randomBytes(24, (err, nonce) => {
            if (err) {
                return callback(err);
            }
            // store the nonce for later use
            Object.assign(authContext, { nonce });
            const request = Object.assign({}, handshakeDoc, {
                speculativeAuthenticate: Object.assign(makeFirstMessage(cryptoMethod, credentials, nonce), {
                    db: credentials.source
                })
            });
            callback(undefined, request);
        });
    }
    auth(authContext, callback) {
        const response = authContext.response;
        if (response && response.speculativeAuthenticate) {
            continueScramConversation(this.cryptoMethod, response.speculativeAuthenticate, authContext, callback);
            return;
        }
        executeScram(this.cryptoMethod, authContext, callback);
    }
}
function cleanUsername(username) {
    return username.replace('=', '=3D').replace(',', '=2C');
}
function clientFirstMessageBare(username, nonce) {
    // NOTE: This is done b/c Javascript uses UTF-16, but the server is hashing in UTF-8.
    // Since the username is not sasl-prep-d, we need to do this here.
    return Buffer.concat([
        Buffer.from('n=', 'utf8'),
        Buffer.from(username, 'utf8'),
        Buffer.from(',r=', 'utf8'),
        Buffer.from(nonce.toString('base64'), 'utf8')
    ]);
}
function makeFirstMessage(cryptoMethod, credentials, nonce) {
    const username = cleanUsername(credentials.username);
    const mechanism = cryptoMethod === 'sha1' ? providers_1.AuthMechanism.MONGODB_SCRAM_SHA1 : providers_1.AuthMechanism.MONGODB_SCRAM_SHA256;
    // NOTE: This is done b/c Javascript uses UTF-16, but the server is hashing in UTF-8.
    // Since the username is not sasl-prep-d, we need to do this here.
    return {
        saslStart: 1,
        mechanism,
        payload: new bson_1.Binary(Buffer.concat([Buffer.from('n,,', 'utf8'), clientFirstMessageBare(username, nonce)])),
        autoAuthorize: 1,
        options: { skipEmptyExchange: true }
    };
}
function executeScram(cryptoMethod, authContext, callback) {
    const { connection, credentials } = authContext;
    if (!credentials) {
        return callback(new error_1.MongoMissingCredentialsError('AuthContext must provide credentials.'));
    }
    if (!authContext.nonce) {
        return callback(new error_1.MongoInvalidArgumentError('AuthContext must contain a valid nonce property'));
    }
    const nonce = authContext.nonce;
    const db = credentials.source;
    const saslStartCmd = makeFirstMessage(cryptoMethod, credentials, nonce);
    connection.command((0, utils_1.ns)(`${db}.$cmd`), saslStartCmd, undefined, (_err, result) => {
        const err = resolveError(_err, result);
        if (err) {
            return callback(err);
        }
        continueScramConversation(cryptoMethod, result, authContext, callback);
    });
}
function continueScramConversation(cryptoMethod, response, authContext, callback) {
    const connection = authContext.connection;
    const credentials = authContext.credentials;
    if (!credentials) {
        return callback(new error_1.MongoMissingCredentialsError('AuthContext must provide credentials.'));
    }
    if (!authContext.nonce) {
        return callback(new error_1.MongoInvalidArgumentError('Unable to continue SCRAM without valid nonce'));
    }
    const nonce = authContext.nonce;
    const db = credentials.source;
    const username = cleanUsername(credentials.username);
    const password = credentials.password;
    let processedPassword;
    if (cryptoMethod === 'sha256') {
        processedPassword = 'kModuleError' in deps_1.saslprep ? password : (0, deps_1.saslprep)(password);
    }
    else {
        try {
            processedPassword = passwordDigest(username, password);
        }
        catch (e) {
            return callback(e);
        }
    }
    const payload = Buffer.isBuffer(response.payload)
        ? new bson_1.Binary(response.payload)
        : response.payload;
    const dict = parsePayload(payload.value());
    const iterations = parseInt(dict.i, 10);
    if (iterations && iterations < 4096) {
        callback(
        // TODO(NODE-3483)
        new error_1.MongoRuntimeError(`Server returned an invalid iteration count ${iterations}`), false);
        return;
    }
    const salt = dict.s;
    const rnonce = dict.r;
    if (rnonce.startsWith('nonce')) {
        // TODO(NODE-3483)
        callback(new error_1.MongoRuntimeError(`Server returned an invalid nonce: ${rnonce}`), false);
        return;
    }
    // Set up start of proof
    const withoutProof = `c=biws,r=${rnonce}`;
    const saltedPassword = HI(processedPassword, Buffer.from(salt, 'base64'), iterations, cryptoMethod);
    const clientKey = HMAC(cryptoMethod, saltedPassword, 'Client Key');
    const serverKey = HMAC(cryptoMethod, saltedPassword, 'Server Key');
    const storedKey = H(cryptoMethod, clientKey);
    const authMessage = [clientFirstMessageBare(username, nonce), payload.value(), withoutProof].join(',');
    const clientSignature = HMAC(cryptoMethod, storedKey, authMessage);
    const clientProof = `p=${xor(clientKey, clientSignature)}`;
    const clientFinal = [withoutProof, clientProof].join(',');
    const serverSignature = HMAC(cryptoMethod, serverKey, authMessage);
    const saslContinueCmd = {
        saslContinue: 1,
        conversationId: response.conversationId,
        payload: new bson_1.Binary(Buffer.from(clientFinal))
    };
    connection.command((0, utils_1.ns)(`${db}.$cmd`), saslContinueCmd, undefined, (_err, r) => {
        const err = resolveError(_err, r);
        if (err) {
            return callback(err);
        }
        const parsedResponse = parsePayload(r.payload.value());
        if (!compareDigest(Buffer.from(parsedResponse.v, 'base64'), serverSignature)) {
            callback(new error_1.MongoRuntimeError('Server returned an invalid signature'));
            return;
        }
        if (!r || r.done !== false) {
            return callback(err, r);
        }
        const retrySaslContinueCmd = {
            saslContinue: 1,
            conversationId: r.conversationId,
            payload: Buffer.alloc(0)
        };
        connection.command((0, utils_1.ns)(`${db}.$cmd`), retrySaslContinueCmd, undefined, callback);
    });
}
function parsePayload(payload) {
    const dict = {};
    const parts = payload.split(',');
    for (let i = 0; i < parts.length; i++) {
        const valueParts = parts[i].split('=');
        dict[valueParts[0]] = valueParts[1];
    }
    return dict;
}
function passwordDigest(username, password) {
    if (typeof username !== 'string') {
        throw new error_1.MongoInvalidArgumentError('Username must be a string');
    }
    if (typeof password !== 'string') {
        throw new error_1.MongoInvalidArgumentError('Password must be a string');
    }
    if (password.length === 0) {
        throw new error_1.MongoInvalidArgumentError('Password cannot be empty');
    }
    let md5;
    try {
        md5 = crypto.createHash('md5');
    }
    catch (err) {
        if (crypto.getFips()) {
            // This error is (slightly) more helpful than what comes from OpenSSL directly, e.g.
            // 'Error: error:060800C8:digital envelope routines:EVP_DigestInit_ex:disabled for FIPS'
            throw new Error('Auth mechanism SCRAM-SHA-1 is not supported in FIPS mode');
        }
        throw err;
    }
    md5.update(`${username}:mongo:${password}`, 'utf8');
    return md5.digest('hex');
}
// XOR two buffers
function xor(a, b) {
    if (!Buffer.isBuffer(a)) {
        a = Buffer.from(a);
    }
    if (!Buffer.isBuffer(b)) {
        b = Buffer.from(b);
    }
    const length = Math.max(a.length, b.length);
    const res = [];
    for (let i = 0; i < length; i += 1) {
        res.push(a[i] ^ b[i]);
    }
    return Buffer.from(res).toString('base64');
}
function H(method, text) {
    return crypto.createHash(method).update(text).digest();
}
function HMAC(method, key, text) {
    return crypto.createHmac(method, key).update(text).digest();
}
let _hiCache = {};
let _hiCacheCount = 0;
function _hiCachePurge() {
    _hiCache = {};
    _hiCacheCount = 0;
}
const hiLengthMap = {
    sha256: 32,
    sha1: 20
};
function HI(data, salt, iterations, cryptoMethod) {
    // omit the work if already generated
    const key = [data, salt.toString('base64'), iterations].join('_');
    if (_hiCache[key] != null) {
        return _hiCache[key];
    }
    // generate the salt
    const saltedData = crypto.pbkdf2Sync(data, salt, iterations, hiLengthMap[cryptoMethod], cryptoMethod);
    // cache a copy to speed up the next lookup, but prevent unbounded cache growth
    if (_hiCacheCount >= 200) {
        _hiCachePurge();
    }
    _hiCache[key] = saltedData;
    _hiCacheCount += 1;
    return saltedData;
}
function compareDigest(lhs, rhs) {
    if (lhs.length !== rhs.length) {
        return false;
    }
    if (typeof crypto.timingSafeEqual === 'function') {
        return crypto.timingSafeEqual(lhs, rhs);
    }
    let result = 0;
    for (let i = 0; i < lhs.length; i++) {
        result |= lhs[i] ^ rhs[i];
    }
    return result === 0;
}
function resolveError(err, result) {
    if (err)
        return err;
    if (result) {
        if (result.$err || result.errmsg)
            return new error_1.MongoServerError(result);
    }
    return;
}
class ScramSHA1 extends ScramSHA {
    constructor() {
        super('sha1');
    }
}
exports.ScramSHA1 = ScramSHA1;
class ScramSHA256 extends ScramSHA {
    constructor() {
        super('sha256');
    }
}
exports.ScramSHA256 = ScramSHA256;
//# sourceMappingURL=scram.js.map