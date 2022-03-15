"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_OPTIONS = exports.OPTIONS = exports.parseOptions = exports.checkTLSOptions = exports.resolveSRVRecord = void 0;
const dns = require("dns");
const fs = require("fs");
const mongodb_connection_string_url_1 = require("mongodb-connection-string-url");
const url_1 = require("url");
const mongo_credentials_1 = require("./cmap/auth/mongo_credentials");
const providers_1 = require("./cmap/auth/providers");
const compression_1 = require("./cmap/wire_protocol/compression");
const encrypter_1 = require("./encrypter");
const error_1 = require("./error");
const logger_1 = require("./logger");
const mongo_client_1 = require("./mongo_client");
const promise_provider_1 = require("./promise_provider");
const read_concern_1 = require("./read_concern");
const read_preference_1 = require("./read_preference");
const utils_1 = require("./utils");
const write_concern_1 = require("./write_concern");
const VALID_TXT_RECORDS = ['authSource', 'replicaSet', 'loadBalanced'];
const LB_SINGLE_HOST_ERROR = 'loadBalanced option only supported with a single host in the URI';
const LB_REPLICA_SET_ERROR = 'loadBalanced option not supported with a replicaSet option';
const LB_DIRECT_CONNECTION_ERROR = 'loadBalanced option not supported when directConnection is provided';
/**
 * Determines whether a provided address matches the provided parent domain in order
 * to avoid certain attack vectors.
 *
 * @param srvAddress - The address to check against a domain
 * @param parentDomain - The domain to check the provided address against
 * @returns Whether the provided address matches the parent domain
 */
function matchesParentDomain(srvAddress, parentDomain) {
    const regex = /^.*?\./;
    const srv = `.${srvAddress.replace(regex, '')}`;
    const parent = `.${parentDomain.replace(regex, '')}`;
    return srv.endsWith(parent);
}
/**
 * Lookup a `mongodb+srv` connection string, combine the parts and reparse it as a normal
 * connection string.
 *
 * @param uri - The connection string to parse
 * @param options - Optional user provided connection string options
 */
function resolveSRVRecord(options, callback) {
    if (typeof options.srvHost !== 'string') {
        return callback(new error_1.MongoAPIError('Option "srvHost" must not be empty'));
    }
    if (options.srvHost.split('.').length < 3) {
        // TODO(NODE-3484): Replace with MongoConnectionStringError
        return callback(new error_1.MongoAPIError('URI must include hostname, domain name, and tld'));
    }
    // Resolve the SRV record and use the result as the list of hosts to connect to.
    const lookupAddress = options.srvHost;
    dns.resolveSrv(`_${options.srvServiceName}._tcp.${lookupAddress}`, (err, addresses) => {
        if (err)
            return callback(err);
        if (addresses.length === 0) {
            return callback(new error_1.MongoAPIError('No addresses found at host'));
        }
        for (const { name } of addresses) {
            if (!matchesParentDomain(name, lookupAddress)) {
                return callback(new error_1.MongoAPIError('Server record does not share hostname with parent URI'));
            }
        }
        const hostAddresses = addresses.map(r => { var _a; return utils_1.HostAddress.fromString(`${r.name}:${(_a = r.port) !== null && _a !== void 0 ? _a : 27017}`); });
        const lbError = validateLoadBalancedOptions(hostAddresses, options, true);
        if (lbError) {
            return callback(lbError);
        }
        // Resolve TXT record and add options from there if they exist.
        dns.resolveTxt(lookupAddress, (err, record) => {
            var _a, _b, _c;
            if (err) {
                if (err.code !== 'ENODATA' && err.code !== 'ENOTFOUND') {
                    return callback(err);
                }
            }
            else {
                if (record.length > 1) {
                    return callback(new error_1.MongoParseError('Multiple text records not allowed'));
                }
                const txtRecordOptions = new url_1.URLSearchParams(record[0].join(''));
                const txtRecordOptionKeys = [...txtRecordOptions.keys()];
                if (txtRecordOptionKeys.some(key => !VALID_TXT_RECORDS.includes(key))) {
                    return callback(new error_1.MongoParseError(`Text record may only set any of: ${VALID_TXT_RECORDS.join(', ')}`));
                }
                if (VALID_TXT_RECORDS.some(option => txtRecordOptions.get(option) === '')) {
                    return callback(new error_1.MongoParseError('Cannot have empty URI params in DNS TXT Record'));
                }
                const source = (_a = txtRecordOptions.get('authSource')) !== null && _a !== void 0 ? _a : undefined;
                const replicaSet = (_b = txtRecordOptions.get('replicaSet')) !== null && _b !== void 0 ? _b : undefined;
                const loadBalanced = (_c = txtRecordOptions.get('loadBalanced')) !== null && _c !== void 0 ? _c : undefined;
                if (!options.userSpecifiedAuthSource &&
                    source &&
                    options.credentials &&
                    !providers_1.AUTH_MECHS_AUTH_SRC_EXTERNAL.has(options.credentials.mechanism)) {
                    options.credentials = mongo_credentials_1.MongoCredentials.merge(options.credentials, { source });
                }
                if (!options.userSpecifiedReplicaSet && replicaSet) {
                    options.replicaSet = replicaSet;
                }
                if (loadBalanced === 'true') {
                    options.loadBalanced = true;
                }
                if (options.replicaSet && options.srvMaxHosts > 0) {
                    return callback(new error_1.MongoParseError('Cannot combine replicaSet option with srvMaxHosts'));
                }
                const lbError = validateLoadBalancedOptions(hostAddresses, options, true);
                if (lbError) {
                    return callback(lbError);
                }
            }
            callback(undefined, hostAddresses);
        });
    });
}
exports.resolveSRVRecord = resolveSRVRecord;
/**
 * Checks if TLS options are valid
 *
 * @param options - The options used for options parsing
 * @throws MongoParseError if TLS options are invalid
 */
function checkTLSOptions(options) {
    if (!options)
        return;
    const check = (a, b) => {
        if (Reflect.has(options, a) && Reflect.has(options, b)) {
            throw new error_1.MongoParseError(`The '${a}' option cannot be used with '${b}'`);
        }
    };
    check('tlsInsecure', 'tlsAllowInvalidCertificates');
    check('tlsInsecure', 'tlsAllowInvalidHostnames');
    check('tlsInsecure', 'tlsDisableCertificateRevocationCheck');
    check('tlsInsecure', 'tlsDisableOCSPEndpointCheck');
    check('tlsAllowInvalidCertificates', 'tlsDisableCertificateRevocationCheck');
    check('tlsAllowInvalidCertificates', 'tlsDisableOCSPEndpointCheck');
    check('tlsDisableCertificateRevocationCheck', 'tlsDisableOCSPEndpointCheck');
}
exports.checkTLSOptions = checkTLSOptions;
const TRUTHS = new Set(['true', 't', '1', 'y', 'yes']);
const FALSEHOODS = new Set(['false', 'f', '0', 'n', 'no', '-1']);
function getBoolean(name, value) {
    if (typeof value === 'boolean')
        return value;
    const valueString = String(value).toLowerCase();
    if (TRUTHS.has(valueString)) {
        if (valueString !== 'true') {
            (0, utils_1.emitWarningOnce)(`deprecated value for ${name} : ${valueString} - please update to ${name} : true instead`);
        }
        return true;
    }
    if (FALSEHOODS.has(valueString)) {
        if (valueString !== 'false') {
            (0, utils_1.emitWarningOnce)(`deprecated value for ${name} : ${valueString} - please update to ${name} : false instead`);
        }
        return false;
    }
    throw new error_1.MongoParseError(`Expected ${name} to be stringified boolean value, got: ${value}`);
}
function getInt(name, value) {
    if (typeof value === 'number')
        return Math.trunc(value);
    const parsedValue = Number.parseInt(String(value), 10);
    if (!Number.isNaN(parsedValue))
        return parsedValue;
    throw new error_1.MongoParseError(`Expected ${name} to be stringified int value, got: ${value}`);
}
function getUint(name, value) {
    const parsedValue = getInt(name, value);
    if (parsedValue < 0) {
        throw new error_1.MongoParseError(`${name} can only be a positive int value, got: ${value}`);
    }
    return parsedValue;
}
/** Wrap a single value in an array if the value is not an array */
function toArray(value) {
    return Array.isArray(value) ? value : [value];
}
function* entriesFromString(value) {
    const keyValuePairs = value.split(',');
    for (const keyValue of keyValuePairs) {
        const [key, value] = keyValue.split(':');
        if (value == null) {
            throw new error_1.MongoParseError('Cannot have undefined values in key value pairs');
        }
        yield [key, value];
    }
}
class CaseInsensitiveMap extends Map {
    constructor(entries = []) {
        super(entries.map(([k, v]) => [k.toLowerCase(), v]));
    }
    has(k) {
        return super.has(k.toLowerCase());
    }
    get(k) {
        return super.get(k.toLowerCase());
    }
    set(k, v) {
        return super.set(k.toLowerCase(), v);
    }
    delete(k) {
        return super.delete(k.toLowerCase());
    }
}
function parseOptions(uri, mongoClient = undefined, options = {}) {
    if (mongoClient != null && !(mongoClient instanceof mongo_client_1.MongoClient)) {
        options = mongoClient;
        mongoClient = undefined;
    }
    const url = new mongodb_connection_string_url_1.default(uri);
    const { hosts, isSRV } = url;
    const mongoOptions = Object.create(null);
    mongoOptions.hosts = isSRV ? [] : hosts.map(utils_1.HostAddress.fromString);
    const urlOptions = new CaseInsensitiveMap();
    if (url.pathname !== '/' && url.pathname !== '') {
        const dbName = decodeURIComponent(url.pathname[0] === '/' ? url.pathname.slice(1) : url.pathname);
        if (dbName) {
            urlOptions.set('dbName', [dbName]);
        }
    }
    if (url.username !== '') {
        const auth = {
            username: decodeURIComponent(url.username)
        };
        if (typeof url.password === 'string') {
            auth.password = decodeURIComponent(url.password);
        }
        urlOptions.set('auth', [auth]);
    }
    for (const key of url.searchParams.keys()) {
        const values = [...url.searchParams.getAll(key)];
        if (values.includes('')) {
            throw new error_1.MongoAPIError('URI cannot contain options with no value');
        }
        if (!urlOptions.has(key)) {
            urlOptions.set(key, values);
        }
    }
    const objectOptions = new CaseInsensitiveMap(Object.entries(options).filter(([, v]) => v != null));
    // Validate options that can only be provided by one of uri or object
    if (urlOptions.has('serverApi')) {
        throw new error_1.MongoParseError('URI cannot contain `serverApi`, it can only be passed to the client');
    }
    if (objectOptions.has('loadBalanced')) {
        throw new error_1.MongoParseError('loadBalanced is only a valid option in the URI');
    }
    // All option collection
    const allOptions = new CaseInsensitiveMap();
    const allKeys = new Set([
        ...urlOptions.keys(),
        ...objectOptions.keys(),
        ...exports.DEFAULT_OPTIONS.keys()
    ]);
    for (const key of allKeys) {
        const values = [objectOptions, urlOptions, exports.DEFAULT_OPTIONS].flatMap(optionsObject => {
            var _a;
            const options = (_a = optionsObject.get(key)) !== null && _a !== void 0 ? _a : [];
            return toArray(options);
        });
        allOptions.set(key, values);
    }
    if (allOptions.has('tlsCertificateKeyFile') && !allOptions.has('tlsCertificateFile')) {
        allOptions.set('tlsCertificateFile', allOptions.get('tlsCertificateKeyFile'));
    }
    if (allOptions.has('tls') || allOptions.has('ssl')) {
        const tlsAndSslOpts = (allOptions.get('tls') || [])
            .concat(allOptions.get('ssl') || [])
            .map(getBoolean.bind(null, 'tls/ssl'));
        if (new Set(tlsAndSslOpts).size !== 1) {
            throw new error_1.MongoParseError('All values of tls/ssl must be the same.');
        }
    }
    const unsupportedOptions = (0, utils_1.setDifference)(allKeys, Array.from(Object.keys(exports.OPTIONS)).map(s => s.toLowerCase()));
    if (unsupportedOptions.size !== 0) {
        const optionWord = unsupportedOptions.size > 1 ? 'options' : 'option';
        const isOrAre = unsupportedOptions.size > 1 ? 'are' : 'is';
        throw new error_1.MongoParseError(`${optionWord} ${Array.from(unsupportedOptions).join(', ')} ${isOrAre} not supported`);
    }
    // Option parsing and setting
    for (const [key, descriptor] of Object.entries(exports.OPTIONS)) {
        const values = allOptions.get(key);
        if (!values || values.length === 0)
            continue;
        setOption(mongoOptions, key, descriptor, values);
    }
    if (mongoOptions.credentials) {
        const isGssapi = mongoOptions.credentials.mechanism === providers_1.AuthMechanism.MONGODB_GSSAPI;
        const isX509 = mongoOptions.credentials.mechanism === providers_1.AuthMechanism.MONGODB_X509;
        const isAws = mongoOptions.credentials.mechanism === providers_1.AuthMechanism.MONGODB_AWS;
        if ((isGssapi || isX509) &&
            allOptions.has('authSource') &&
            mongoOptions.credentials.source !== '$external') {
            // If authSource was explicitly given and its incorrect, we error
            throw new error_1.MongoParseError(`${mongoOptions.credentials} can only have authSource set to '$external'`);
        }
        if (!(isGssapi || isX509 || isAws) && mongoOptions.dbName && !allOptions.has('authSource')) {
            // inherit the dbName unless GSSAPI or X509, then silently ignore dbName
            // and there was no specific authSource given
            mongoOptions.credentials = mongo_credentials_1.MongoCredentials.merge(mongoOptions.credentials, {
                source: mongoOptions.dbName
            });
        }
        mongoOptions.credentials.validate();
        // Check if the only auth related option provided was authSource, if so we can remove credentials
        if (mongoOptions.credentials.password === '' &&
            mongoOptions.credentials.username === '' &&
            mongoOptions.credentials.mechanism === providers_1.AuthMechanism.MONGODB_DEFAULT &&
            Object.keys(mongoOptions.credentials.mechanismProperties).length === 0) {
            delete mongoOptions.credentials;
        }
    }
    if (!mongoOptions.dbName) {
        // dbName default is applied here because of the credential validation above
        mongoOptions.dbName = 'test';
    }
    checkTLSOptions(mongoOptions);
    if (options.promiseLibrary)
        promise_provider_1.PromiseProvider.set(options.promiseLibrary);
    const lbError = validateLoadBalancedOptions(hosts, mongoOptions, isSRV);
    if (lbError) {
        throw lbError;
    }
    if (mongoClient && mongoOptions.autoEncryption) {
        encrypter_1.Encrypter.checkForMongoCrypt();
        mongoOptions.encrypter = new encrypter_1.Encrypter(mongoClient, uri, options);
        mongoOptions.autoEncrypter = mongoOptions.encrypter.autoEncrypter;
    }
    // Potential SRV Overrides and SRV connection string validations
    mongoOptions.userSpecifiedAuthSource =
        objectOptions.has('authSource') || urlOptions.has('authSource');
    mongoOptions.userSpecifiedReplicaSet =
        objectOptions.has('replicaSet') || urlOptions.has('replicaSet');
    if (isSRV) {
        // SRV Record is resolved upon connecting
        mongoOptions.srvHost = hosts[0];
        if (mongoOptions.directConnection) {
            throw new error_1.MongoAPIError('SRV URI does not support directConnection');
        }
        if (mongoOptions.srvMaxHosts > 0 && typeof mongoOptions.replicaSet === 'string') {
            throw new error_1.MongoParseError('Cannot use srvMaxHosts option with replicaSet');
        }
        // SRV turns on TLS by default, but users can override and turn it off
        const noUserSpecifiedTLS = !objectOptions.has('tls') && !urlOptions.has('tls');
        const noUserSpecifiedSSL = !objectOptions.has('ssl') && !urlOptions.has('ssl');
        if (noUserSpecifiedTLS && noUserSpecifiedSSL) {
            mongoOptions.tls = true;
        }
    }
    else {
        const userSpecifiedSrvOptions = urlOptions.has('srvMaxHosts') ||
            objectOptions.has('srvMaxHosts') ||
            urlOptions.has('srvServiceName') ||
            objectOptions.has('srvServiceName');
        if (userSpecifiedSrvOptions) {
            throw new error_1.MongoParseError('Cannot use srvMaxHosts or srvServiceName with a non-srv connection string');
        }
    }
    if (mongoOptions.directConnection && mongoOptions.hosts.length !== 1) {
        throw new error_1.MongoParseError('directConnection option requires exactly one host');
    }
    if (!mongoOptions.proxyHost &&
        (mongoOptions.proxyPort || mongoOptions.proxyUsername || mongoOptions.proxyPassword)) {
        throw new error_1.MongoParseError('Must specify proxyHost if other proxy options are passed');
    }
    if ((mongoOptions.proxyUsername && !mongoOptions.proxyPassword) ||
        (!mongoOptions.proxyUsername && mongoOptions.proxyPassword)) {
        throw new error_1.MongoParseError('Can only specify both of proxy username/password or neither');
    }
    const proxyOptions = ['proxyHost', 'proxyPort', 'proxyUsername', 'proxyPassword'].map(key => { var _a; return (_a = urlOptions.get(key)) !== null && _a !== void 0 ? _a : []; });
    if (proxyOptions.some(options => options.length > 1)) {
        throw new error_1.MongoParseError('Proxy options cannot be specified multiple times in the connection string');
    }
    return mongoOptions;
}
exports.parseOptions = parseOptions;
function validateLoadBalancedOptions(hosts, mongoOptions, isSrv) {
    if (mongoOptions.loadBalanced) {
        if (hosts.length > 1) {
            return new error_1.MongoParseError(LB_SINGLE_HOST_ERROR);
        }
        if (mongoOptions.replicaSet) {
            return new error_1.MongoParseError(LB_REPLICA_SET_ERROR);
        }
        if (mongoOptions.directConnection) {
            return new error_1.MongoParseError(LB_DIRECT_CONNECTION_ERROR);
        }
        if (isSrv && mongoOptions.srvMaxHosts > 0) {
            return new error_1.MongoParseError('Cannot limit srv hosts with loadBalanced enabled');
        }
    }
    return;
}
function setOption(mongoOptions, key, descriptor, values) {
    const { target, type, transform, deprecated } = descriptor;
    const name = target !== null && target !== void 0 ? target : key;
    if (deprecated) {
        const deprecatedMsg = typeof deprecated === 'string' ? `: ${deprecated}` : '';
        (0, utils_1.emitWarning)(`${key} is a deprecated option${deprecatedMsg}`);
    }
    switch (type) {
        case 'boolean':
            mongoOptions[name] = getBoolean(name, values[0]);
            break;
        case 'int':
            mongoOptions[name] = getInt(name, values[0]);
            break;
        case 'uint':
            mongoOptions[name] = getUint(name, values[0]);
            break;
        case 'string':
            if (values[0] == null) {
                break;
            }
            mongoOptions[name] = String(values[0]);
            break;
        case 'record':
            if (!(0, utils_1.isRecord)(values[0])) {
                throw new error_1.MongoParseError(`${name} must be an object`);
            }
            mongoOptions[name] = values[0];
            break;
        case 'any':
            mongoOptions[name] = values[0];
            break;
        default: {
            if (!transform) {
                throw new error_1.MongoParseError('Descriptors missing a type must define a transform');
            }
            const transformValue = transform({ name, options: mongoOptions, values });
            mongoOptions[name] = transformValue;
            break;
        }
    }
}
exports.OPTIONS = {
    appName: {
        target: 'metadata',
        transform({ options, values: [value] }) {
            return (0, utils_1.makeClientMetadata)({ ...options.driverInfo, appName: String(value) });
        }
    },
    auth: {
        target: 'credentials',
        transform({ name, options, values: [value] }) {
            if (!(0, utils_1.isRecord)(value, ['username', 'password'])) {
                throw new error_1.MongoParseError(`${name} must be an object with 'username' and 'password' properties`);
            }
            return mongo_credentials_1.MongoCredentials.merge(options.credentials, {
                username: value.username,
                password: value.password
            });
        }
    },
    authMechanism: {
        target: 'credentials',
        transform({ options, values: [value] }) {
            var _a, _b;
            const mechanisms = Object.values(providers_1.AuthMechanism);
            const [mechanism] = mechanisms.filter(m => m.match(RegExp(String.raw `\b${value}\b`, 'i')));
            if (!mechanism) {
                throw new error_1.MongoParseError(`authMechanism one of ${mechanisms}, got ${value}`);
            }
            let source = (_a = options.credentials) === null || _a === void 0 ? void 0 : _a.source;
            if (mechanism === providers_1.AuthMechanism.MONGODB_PLAIN ||
                providers_1.AUTH_MECHS_AUTH_SRC_EXTERNAL.has(mechanism)) {
                // some mechanisms have '$external' as the Auth Source
                source = '$external';
            }
            let password = (_b = options.credentials) === null || _b === void 0 ? void 0 : _b.password;
            if (mechanism === providers_1.AuthMechanism.MONGODB_X509 && password === '') {
                password = undefined;
            }
            return mongo_credentials_1.MongoCredentials.merge(options.credentials, {
                mechanism,
                source,
                password
            });
        }
    },
    authMechanismProperties: {
        target: 'credentials',
        transform({ options, values: [optionValue] }) {
            if (typeof optionValue === 'string') {
                const mechanismProperties = Object.create(null);
                for (const [key, value] of entriesFromString(optionValue)) {
                    try {
                        mechanismProperties[key] = getBoolean(key, value);
                    }
                    catch {
                        mechanismProperties[key] = value;
                    }
                }
                return mongo_credentials_1.MongoCredentials.merge(options.credentials, {
                    mechanismProperties
                });
            }
            if (!(0, utils_1.isRecord)(optionValue)) {
                throw new error_1.MongoParseError('AuthMechanismProperties must be an object');
            }
            return mongo_credentials_1.MongoCredentials.merge(options.credentials, { mechanismProperties: optionValue });
        }
    },
    authSource: {
        target: 'credentials',
        transform({ options, values: [value] }) {
            const source = String(value);
            return mongo_credentials_1.MongoCredentials.merge(options.credentials, { source });
        }
    },
    autoEncryption: {
        type: 'record'
    },
    bsonRegExp: {
        type: 'boolean'
    },
    serverApi: {
        target: 'serverApi',
        transform({ values: [version] }) {
            const serverApiToValidate = typeof version === 'string' ? { version } : version;
            const versionToValidate = serverApiToValidate && serverApiToValidate.version;
            if (!versionToValidate) {
                throw new error_1.MongoParseError(`Invalid \`serverApi\` property; must specify a version from the following enum: ["${Object.values(mongo_client_1.ServerApiVersion).join('", "')}"]`);
            }
            if (!Object.values(mongo_client_1.ServerApiVersion).some(v => v === versionToValidate)) {
                throw new error_1.MongoParseError(`Invalid server API version=${versionToValidate}; must be in the following enum: ["${Object.values(mongo_client_1.ServerApiVersion).join('", "')}"]`);
            }
            return serverApiToValidate;
        }
    },
    checkKeys: {
        type: 'boolean'
    },
    compressors: {
        default: 'none',
        target: 'compressors',
        transform({ values }) {
            const compressionList = new Set();
            for (const compVal of values) {
                const compValArray = typeof compVal === 'string' ? compVal.split(',') : compVal;
                if (!Array.isArray(compValArray)) {
                    throw new error_1.MongoInvalidArgumentError('compressors must be an array or a comma-delimited list of strings');
                }
                for (const c of compValArray) {
                    if (Object.keys(compression_1.Compressor).includes(String(c))) {
                        compressionList.add(String(c));
                    }
                    else {
                        throw new error_1.MongoInvalidArgumentError(`${c} is not a valid compression mechanism. Must be one of: ${Object.keys(compression_1.Compressor)}.`);
                    }
                }
            }
            return [...compressionList];
        }
    },
    connectTimeoutMS: {
        default: 30000,
        type: 'uint'
    },
    dbName: {
        type: 'string'
    },
    directConnection: {
        default: false,
        type: 'boolean'
    },
    driverInfo: {
        target: 'metadata',
        default: (0, utils_1.makeClientMetadata)(),
        transform({ options, values: [value] }) {
            var _a, _b;
            if (!(0, utils_1.isRecord)(value))
                throw new error_1.MongoParseError('DriverInfo must be an object');
            return (0, utils_1.makeClientMetadata)({
                driverInfo: value,
                appName: (_b = (_a = options.metadata) === null || _a === void 0 ? void 0 : _a.application) === null || _b === void 0 ? void 0 : _b.name
            });
        }
    },
    enableUtf8Validation: { type: 'boolean', default: true },
    family: {
        transform({ name, values: [value] }) {
            const transformValue = getInt(name, value);
            if (transformValue === 4 || transformValue === 6) {
                return transformValue;
            }
            throw new error_1.MongoParseError(`Option 'family' must be 4 or 6 got ${transformValue}.`);
        }
    },
    fieldsAsRaw: {
        type: 'record'
    },
    forceServerObjectId: {
        default: false,
        type: 'boolean'
    },
    fsync: {
        deprecated: 'Please use journal instead',
        target: 'writeConcern',
        transform({ name, options, values: [value] }) {
            const wc = write_concern_1.WriteConcern.fromOptions({
                writeConcern: {
                    ...options.writeConcern,
                    fsync: getBoolean(name, value)
                }
            });
            if (!wc)
                throw new error_1.MongoParseError(`Unable to make a writeConcern from fsync=${value}`);
            return wc;
        }
    },
    heartbeatFrequencyMS: {
        default: 10000,
        type: 'uint'
    },
    ignoreUndefined: {
        type: 'boolean'
    },
    j: {
        deprecated: 'Please use journal instead',
        target: 'writeConcern',
        transform({ name, options, values: [value] }) {
            const wc = write_concern_1.WriteConcern.fromOptions({
                writeConcern: {
                    ...options.writeConcern,
                    journal: getBoolean(name, value)
                }
            });
            if (!wc)
                throw new error_1.MongoParseError(`Unable to make a writeConcern from journal=${value}`);
            return wc;
        }
    },
    journal: {
        target: 'writeConcern',
        transform({ name, options, values: [value] }) {
            const wc = write_concern_1.WriteConcern.fromOptions({
                writeConcern: {
                    ...options.writeConcern,
                    journal: getBoolean(name, value)
                }
            });
            if (!wc)
                throw new error_1.MongoParseError(`Unable to make a writeConcern from journal=${value}`);
            return wc;
        }
    },
    keepAlive: {
        default: true,
        type: 'boolean'
    },
    keepAliveInitialDelay: {
        default: 120000,
        type: 'uint'
    },
    loadBalanced: {
        default: false,
        type: 'boolean'
    },
    localThresholdMS: {
        default: 15,
        type: 'uint'
    },
    logger: {
        default: new logger_1.Logger('MongoClient'),
        transform({ values: [value] }) {
            if (value instanceof logger_1.Logger) {
                return value;
            }
            (0, utils_1.emitWarning)('Alternative loggers might not be supported');
            // TODO: make Logger an interface that others can implement, make usage consistent in driver
            // DRIVERS-1204
            return;
        }
    },
    loggerLevel: {
        target: 'logger',
        transform({ values: [value] }) {
            return new logger_1.Logger('MongoClient', { loggerLevel: value });
        }
    },
    maxIdleTimeMS: {
        default: 0,
        type: 'uint'
    },
    maxPoolSize: {
        default: 100,
        type: 'uint'
    },
    maxStalenessSeconds: {
        target: 'readPreference',
        transform({ name, options, values: [value] }) {
            const maxStalenessSeconds = getUint(name, value);
            if (options.readPreference) {
                return read_preference_1.ReadPreference.fromOptions({
                    readPreference: { ...options.readPreference, maxStalenessSeconds }
                });
            }
            else {
                return new read_preference_1.ReadPreference('secondary', undefined, { maxStalenessSeconds });
            }
        }
    },
    minInternalBufferSize: {
        type: 'uint'
    },
    minPoolSize: {
        default: 0,
        type: 'uint'
    },
    minHeartbeatFrequencyMS: {
        default: 500,
        type: 'uint'
    },
    monitorCommands: {
        default: false,
        type: 'boolean'
    },
    name: {
        target: 'driverInfo',
        transform({ values: [value], options }) {
            return { ...options.driverInfo, name: String(value) };
        }
    },
    noDelay: {
        default: true,
        type: 'boolean'
    },
    pkFactory: {
        default: utils_1.DEFAULT_PK_FACTORY,
        transform({ values: [value] }) {
            if ((0, utils_1.isRecord)(value, ['createPk']) && typeof value.createPk === 'function') {
                return value;
            }
            throw new error_1.MongoParseError(`Option pkFactory must be an object with a createPk function, got ${value}`);
        }
    },
    promiseLibrary: {
        deprecated: true,
        type: 'any'
    },
    promoteBuffers: {
        type: 'boolean'
    },
    promoteLongs: {
        type: 'boolean'
    },
    promoteValues: {
        type: 'boolean'
    },
    proxyHost: {
        type: 'string'
    },
    proxyPassword: {
        type: 'string'
    },
    proxyPort: {
        type: 'uint'
    },
    proxyUsername: {
        type: 'string'
    },
    raw: {
        default: false,
        type: 'boolean'
    },
    readConcern: {
        transform({ values: [value], options }) {
            if (value instanceof read_concern_1.ReadConcern || (0, utils_1.isRecord)(value, ['level'])) {
                return read_concern_1.ReadConcern.fromOptions({ ...options.readConcern, ...value });
            }
            throw new error_1.MongoParseError(`ReadConcern must be an object, got ${JSON.stringify(value)}`);
        }
    },
    readConcernLevel: {
        target: 'readConcern',
        transform({ values: [level], options }) {
            return read_concern_1.ReadConcern.fromOptions({
                ...options.readConcern,
                level: level
            });
        }
    },
    readPreference: {
        default: read_preference_1.ReadPreference.primary,
        transform({ values: [value], options }) {
            var _a, _b, _c;
            if (value instanceof read_preference_1.ReadPreference) {
                return read_preference_1.ReadPreference.fromOptions({
                    readPreference: { ...options.readPreference, ...value },
                    ...value
                });
            }
            if ((0, utils_1.isRecord)(value, ['mode'])) {
                const rp = read_preference_1.ReadPreference.fromOptions({
                    readPreference: { ...options.readPreference, ...value },
                    ...value
                });
                if (rp)
                    return rp;
                else
                    throw new error_1.MongoParseError(`Cannot make read preference from ${JSON.stringify(value)}`);
            }
            if (typeof value === 'string') {
                const rpOpts = {
                    hedge: (_a = options.readPreference) === null || _a === void 0 ? void 0 : _a.hedge,
                    maxStalenessSeconds: (_b = options.readPreference) === null || _b === void 0 ? void 0 : _b.maxStalenessSeconds
                };
                return new read_preference_1.ReadPreference(value, (_c = options.readPreference) === null || _c === void 0 ? void 0 : _c.tags, rpOpts);
            }
            throw new error_1.MongoParseError(`Unknown ReadPreference value: ${value}`);
        }
    },
    readPreferenceTags: {
        target: 'readPreference',
        transform({ values, options }) {
            const readPreferenceTags = [];
            for (const tag of values) {
                const readPreferenceTag = Object.create(null);
                if (typeof tag === 'string') {
                    for (const [k, v] of entriesFromString(tag)) {
                        readPreferenceTag[k] = v;
                    }
                }
                if ((0, utils_1.isRecord)(tag)) {
                    for (const [k, v] of Object.entries(tag)) {
                        readPreferenceTag[k] = v;
                    }
                }
                readPreferenceTags.push(readPreferenceTag);
            }
            return read_preference_1.ReadPreference.fromOptions({
                readPreference: options.readPreference,
                readPreferenceTags
            });
        }
    },
    replicaSet: {
        type: 'string'
    },
    retryReads: {
        default: true,
        type: 'boolean'
    },
    retryWrites: {
        default: true,
        type: 'boolean'
    },
    serializeFunctions: {
        type: 'boolean'
    },
    serverSelectionTimeoutMS: {
        default: 30000,
        type: 'uint'
    },
    servername: {
        type: 'string'
    },
    socketTimeoutMS: {
        default: 0,
        type: 'uint'
    },
    srvMaxHosts: {
        type: 'uint',
        default: 0
    },
    srvServiceName: {
        type: 'string',
        default: 'mongodb'
    },
    ssl: {
        target: 'tls',
        type: 'boolean'
    },
    sslCA: {
        target: 'ca',
        transform({ values: [value] }) {
            return fs.readFileSync(String(value), { encoding: 'ascii' });
        }
    },
    sslCRL: {
        target: 'crl',
        transform({ values: [value] }) {
            return fs.readFileSync(String(value), { encoding: 'ascii' });
        }
    },
    sslCert: {
        target: 'cert',
        transform({ values: [value] }) {
            return fs.readFileSync(String(value), { encoding: 'ascii' });
        }
    },
    sslKey: {
        target: 'key',
        transform({ values: [value] }) {
            return fs.readFileSync(String(value), { encoding: 'ascii' });
        }
    },
    sslPass: {
        deprecated: true,
        target: 'passphrase',
        type: 'string'
    },
    sslValidate: {
        target: 'rejectUnauthorized',
        type: 'boolean'
    },
    tls: {
        type: 'boolean'
    },
    tlsAllowInvalidCertificates: {
        target: 'rejectUnauthorized',
        transform({ name, values: [value] }) {
            // allowInvalidCertificates is the inverse of rejectUnauthorized
            return !getBoolean(name, value);
        }
    },
    tlsAllowInvalidHostnames: {
        target: 'checkServerIdentity',
        transform({ name, values: [value] }) {
            // tlsAllowInvalidHostnames means setting the checkServerIdentity function to a noop
            return getBoolean(name, value) ? () => undefined : undefined;
        }
    },
    tlsCAFile: {
        target: 'ca',
        transform({ values: [value] }) {
            return fs.readFileSync(String(value), { encoding: 'ascii' });
        }
    },
    tlsCertificateFile: {
        target: 'cert',
        transform({ values: [value] }) {
            return fs.readFileSync(String(value), { encoding: 'ascii' });
        }
    },
    tlsCertificateKeyFile: {
        target: 'key',
        transform({ values: [value] }) {
            return fs.readFileSync(String(value), { encoding: 'ascii' });
        }
    },
    tlsCertificateKeyFilePassword: {
        target: 'passphrase',
        type: 'any'
    },
    tlsInsecure: {
        transform({ name, options, values: [value] }) {
            const tlsInsecure = getBoolean(name, value);
            if (tlsInsecure) {
                options.checkServerIdentity = () => undefined;
                options.rejectUnauthorized = false;
            }
            else {
                options.checkServerIdentity = options.tlsAllowInvalidHostnames
                    ? () => undefined
                    : undefined;
                options.rejectUnauthorized = options.tlsAllowInvalidCertificates ? false : true;
            }
            return tlsInsecure;
        }
    },
    w: {
        target: 'writeConcern',
        transform({ values: [value], options }) {
            return write_concern_1.WriteConcern.fromOptions({ writeConcern: { ...options.writeConcern, w: value } });
        }
    },
    waitQueueTimeoutMS: {
        default: 0,
        type: 'uint'
    },
    writeConcern: {
        target: 'writeConcern',
        transform({ values: [value], options }) {
            if ((0, utils_1.isRecord)(value) || value instanceof write_concern_1.WriteConcern) {
                return write_concern_1.WriteConcern.fromOptions({
                    writeConcern: {
                        ...options.writeConcern,
                        ...value
                    }
                });
            }
            else if (value === 'majority' || typeof value === 'number') {
                return write_concern_1.WriteConcern.fromOptions({
                    writeConcern: {
                        ...options.writeConcern,
                        w: value
                    }
                });
            }
            throw new error_1.MongoParseError(`Invalid WriteConcern cannot parse: ${JSON.stringify(value)}`);
        }
    },
    wtimeout: {
        deprecated: 'Please use wtimeoutMS instead',
        target: 'writeConcern',
        transform({ values: [value], options }) {
            const wc = write_concern_1.WriteConcern.fromOptions({
                writeConcern: {
                    ...options.writeConcern,
                    wtimeout: getUint('wtimeout', value)
                }
            });
            if (wc)
                return wc;
            throw new error_1.MongoParseError(`Cannot make WriteConcern from wtimeout`);
        }
    },
    wtimeoutMS: {
        target: 'writeConcern',
        transform({ values: [value], options }) {
            const wc = write_concern_1.WriteConcern.fromOptions({
                writeConcern: {
                    ...options.writeConcern,
                    wtimeoutMS: getUint('wtimeoutMS', value)
                }
            });
            if (wc)
                return wc;
            throw new error_1.MongoParseError(`Cannot make WriteConcern from wtimeout`);
        }
    },
    zlibCompressionLevel: {
        default: 0,
        type: 'int'
    },
    // Custom types for modifying core behavior
    connectionType: { type: 'any' },
    srvPoller: { type: 'any' },
    // Accepted NodeJS Options
    minDHSize: { type: 'any' },
    pskCallback: { type: 'any' },
    secureContext: { type: 'any' },
    enableTrace: { type: 'any' },
    requestCert: { type: 'any' },
    rejectUnauthorized: { type: 'any' },
    checkServerIdentity: { type: 'any' },
    ALPNProtocols: { type: 'any' },
    SNICallback: { type: 'any' },
    session: { type: 'any' },
    requestOCSP: { type: 'any' },
    localAddress: { type: 'any' },
    localPort: { type: 'any' },
    hints: { type: 'any' },
    lookup: { type: 'any' },
    ca: { type: 'any' },
    cert: { type: 'any' },
    ciphers: { type: 'any' },
    crl: { type: 'any' },
    ecdhCurve: { type: 'any' },
    key: { type: 'any' },
    passphrase: { type: 'any' },
    pfx: { type: 'any' },
    secureProtocol: { type: 'any' },
    index: { type: 'any' },
    // Legacy Options, these are unused but left here to avoid errors with CSFLE lib
    useNewUrlParser: { type: 'boolean' },
    useUnifiedTopology: { type: 'boolean' }
};
exports.DEFAULT_OPTIONS = new CaseInsensitiveMap(Object.entries(exports.OPTIONS)
    .filter(([, descriptor]) => descriptor.default != null)
    .map(([k, d]) => [k, d.default]));
//# sourceMappingURL=connection_string.js.map