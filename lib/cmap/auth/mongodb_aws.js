"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MongoDBAWS = void 0;
const crypto = require("crypto");
const http = require("http");
const url = require("url");
const BSON = require("../../bson");
const deps_1 = require("../../deps");
const error_1 = require("../../error");
const utils_1 = require("../../utils");
const auth_provider_1 = require("./auth_provider");
const mongo_credentials_1 = require("./mongo_credentials");
const providers_1 = require("./providers");
const ASCII_N = 110;
const AWS_RELATIVE_URI = 'http://169.254.170.2';
const AWS_EC2_URI = 'http://169.254.169.254';
const AWS_EC2_PATH = '/latest/meta-data/iam/security-credentials';
const bsonOptions = {
    promoteLongs: true,
    promoteValues: true,
    promoteBuffers: false,
    bsonRegExp: false
};
class MongoDBAWS extends auth_provider_1.AuthProvider {
    auth(authContext, callback) {
        const { connection, credentials } = authContext;
        if (!credentials) {
            return callback(new error_1.MongoMissingCredentialsError('AuthContext must provide credentials.'));
        }
        if ('kModuleError' in deps_1.aws4) {
            return callback(deps_1.aws4['kModuleError']);
        }
        const { sign } = deps_1.aws4;
        if ((0, utils_1.maxWireVersion)(connection) < 9) {
            callback(new error_1.MongoCompatibilityError('MONGODB-AWS authentication requires MongoDB version 4.4 or later'));
            return;
        }
        if (!credentials.username) {
            makeTempCredentials(credentials, (err, tempCredentials) => {
                if (err || !tempCredentials)
                    return callback(err);
                authContext.credentials = tempCredentials;
                this.auth(authContext, callback);
            });
            return;
        }
        const accessKeyId = credentials.username;
        const secretAccessKey = credentials.password;
        const sessionToken = credentials.mechanismProperties.AWS_SESSION_TOKEN;
        // If all three defined, include sessionToken, else include username and pass, else no credentials
        const awsCredentials = accessKeyId && secretAccessKey && sessionToken
            ? { accessKeyId, secretAccessKey, sessionToken }
            : accessKeyId && secretAccessKey
                ? { accessKeyId, secretAccessKey }
                : undefined;
        const db = credentials.source;
        crypto.randomBytes(32, (err, nonce) => {
            if (err) {
                callback(err);
                return;
            }
            const saslStart = {
                saslStart: 1,
                mechanism: 'MONGODB-AWS',
                payload: BSON.serialize({ r: nonce, p: ASCII_N }, bsonOptions)
            };
            connection.command((0, utils_1.ns)(`${db}.$cmd`), saslStart, undefined, (err, res) => {
                if (err)
                    return callback(err);
                const serverResponse = BSON.deserialize(res.payload.buffer, bsonOptions);
                const host = serverResponse.h;
                const serverNonce = serverResponse.s.buffer;
                if (serverNonce.length !== 64) {
                    callback(
                    // TODO(NODE-3483)
                    new error_1.MongoRuntimeError(`Invalid server nonce length ${serverNonce.length}, expected 64`));
                    return;
                }
                if (!utils_1.ByteUtils.equals(serverNonce.subarray(0, nonce.byteLength), nonce)) {
                    // TODO(NODE-3483)
                    callback(new error_1.MongoRuntimeError('Server nonce does not begin with client nonce'));
                    return;
                }
                if (host.length < 1 || host.length > 255 || host.indexOf('..') !== -1) {
                    // TODO(NODE-3483)
                    callback(new error_1.MongoRuntimeError(`Server returned an invalid host: "${host}"`));
                    return;
                }
                const body = 'Action=GetCallerIdentity&Version=2011-06-15';
                const options = sign({
                    method: 'POST',
                    host,
                    region: deriveRegion(serverResponse.h),
                    service: 'sts',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Content-Length': body.length,
                        'X-MongoDB-Server-Nonce': utils_1.ByteUtils.toBase64(serverNonce),
                        'X-MongoDB-GS2-CB-Flag': 'n'
                    },
                    path: '/',
                    body
                }, awsCredentials);
                const payload = {
                    a: options.headers.Authorization,
                    d: options.headers['X-Amz-Date']
                };
                if (sessionToken) {
                    payload.t = sessionToken;
                }
                const saslContinue = {
                    saslContinue: 1,
                    conversationId: 1,
                    payload: BSON.serialize(payload, bsonOptions)
                };
                connection.command((0, utils_1.ns)(`${db}.$cmd`), saslContinue, undefined, callback);
            });
        });
    }
}
exports.MongoDBAWS = MongoDBAWS;
function makeTempCredentials(credentials, callback) {
    function done(creds) {
        if (!creds.AccessKeyId || !creds.SecretAccessKey || !creds.Token) {
            callback(new error_1.MongoMissingCredentialsError('Could not obtain temporary MONGODB-AWS credentials'));
            return;
        }
        callback(undefined, new mongo_credentials_1.MongoCredentials({
            username: creds.AccessKeyId,
            password: creds.SecretAccessKey,
            source: credentials.source,
            mechanism: providers_1.AuthMechanism.MONGODB_AWS,
            mechanismProperties: {
                AWS_SESSION_TOKEN: creds.Token
            }
        }));
    }
    const credentialProvider = (0, deps_1.getAwsCredentialProvider)();
    // Check if the AWS credential provider from the SDK is present. If not,
    // use the old method.
    if ('kModuleError' in credentialProvider) {
        // If the environment variable AWS_CONTAINER_CREDENTIALS_RELATIVE_URI
        // is set then drivers MUST assume that it was set by an AWS ECS agent
        if (process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI) {
            request(`${AWS_RELATIVE_URI}${process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI}`, undefined, (err, res) => {
                if (err)
                    return callback(err);
                done(res);
            });
            return;
        }
        // Otherwise assume we are on an EC2 instance
        // get a token
        request(`${AWS_EC2_URI}/latest/api/token`, { method: 'PUT', json: false, headers: { 'X-aws-ec2-metadata-token-ttl-seconds': 30 } }, (err, token) => {
            if (err)
                return callback(err);
            // get role name
            request(`${AWS_EC2_URI}/${AWS_EC2_PATH}`, { json: false, headers: { 'X-aws-ec2-metadata-token': token } }, (err, roleName) => {
                if (err)
                    return callback(err);
                // get temp credentials
                request(`${AWS_EC2_URI}/${AWS_EC2_PATH}/${roleName}`, { headers: { 'X-aws-ec2-metadata-token': token } }, (err, creds) => {
                    if (err)
                        return callback(err);
                    done(creds);
                });
            });
        });
    }
    else {
        /*
         * Creates a credential provider that will attempt to find credentials from the
         * following sources (listed in order of precedence):
         *
         * - Environment variables exposed via process.env
         * - SSO credentials from token cache
         * - Web identity token credentials
         * - Shared credentials and config ini files
         * - The EC2/ECS Instance Metadata Service
         */
        const { fromNodeProviderChain } = credentialProvider;
        const provider = fromNodeProviderChain();
        provider()
            .then((creds) => {
            done({
                AccessKeyId: creds.accessKeyId,
                SecretAccessKey: creds.secretAccessKey,
                Token: creds.sessionToken,
                Expiration: creds.expiration
            });
        })
            .catch((error) => {
            callback(new error_1.MongoAWSError(error.message));
        });
    }
}
function deriveRegion(host) {
    const parts = host.split('.');
    if (parts.length === 1 || parts[1] === 'amazonaws') {
        return 'us-east-1';
    }
    return parts[1];
}
function request(uri, _options, callback) {
    const options = Object.assign({
        method: 'GET',
        timeout: 10000,
        json: true
    }, url.parse(uri), _options);
    const req = http.request(options, res => {
        res.setEncoding('utf8');
        let data = '';
        res.on('data', d => (data += d));
        res.on('end', () => {
            if (options.json === false) {
                callback(undefined, data);
                return;
            }
            try {
                const parsed = JSON.parse(data);
                callback(undefined, parsed);
            }
            catch (err) {
                // TODO(NODE-3483)
                callback(new error_1.MongoRuntimeError(`Invalid JSON response: "${data}"`));
            }
        });
    });
    req.on('timeout', () => {
        req.destroy(new error_1.MongoAWSError(`AWS request to ${uri} timed out after ${options.timeout} ms`));
    });
    req.on('error', err => callback(err));
    req.end();
}
//# sourceMappingURL=mongodb_aws.js.map