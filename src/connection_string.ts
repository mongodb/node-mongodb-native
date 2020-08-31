import * as url from 'url';
import * as qs from 'querystring';
import * as dns from 'dns';
import { ReadPreference } from './read_preference';
import { MongoParseError } from './error';
import type { AnyOptions, Callback } from './utils';
import type { ConnectionOptions } from './cmap/connection';
import type { Document } from './bson';
import type { CompressorName } from './cmap/wire_protocol/compression';

/**
 * The following regular expression validates a connection string and breaks the
 * provide string into the following capture groups: [protocol, username, password, hosts]
 */
const HOSTS_RX = /(mongodb(?:\+srv|)):\/\/(?: (?:[^:]*) (?: : ([^@]*) )? @ )?([^/?]*)(?:\/|)(.*)/;

/**
 * Determines whether a provided address matches the provided parent domain in order
 * to avoid certain attack vectors.
 *
 * @param srvAddress - The address to check against a domain
 * @param parentDomain - The domain to check the provided address against
 * @returns Whether the provided address matches the parent domain
 */
function matchesParentDomain(srvAddress: string, parentDomain: string): boolean {
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
function parseSrvConnectionString(uri: string, options: any, callback: Callback) {
  const result: AnyOptions = url.parse(uri, true);

  if (options.directConnection) {
    return callback(new MongoParseError('directConnection not supported with SRV URI'));
  }

  if (result.hostname.split('.').length < 3) {
    return callback(new MongoParseError('URI does not have hostname, domain name and tld'));
  }

  result.domainLength = result.hostname.split('.').length;
  if (result.pathname && result.pathname.match(',')) {
    return callback(new MongoParseError('Invalid URI, cannot contain multiple hostnames'));
  }

  if (result.port) {
    return callback(new MongoParseError(`Ports not accepted with '${PROTOCOL_MONGODB_SRV}' URIs`));
  }

  // Resolve the SRV record and use the result as the list of hosts to connect to.
  const lookupAddress = result.host;
  dns.resolveSrv(`_mongodb._tcp.${lookupAddress}`, (err, addresses) => {
    if (err) return callback(err);

    if (addresses.length === 0) {
      return callback(new MongoParseError('No addresses found at host'));
    }

    for (let i = 0; i < addresses.length; i++) {
      if (!matchesParentDomain(addresses[i].name, result.hostname)) {
        return callback(
          new MongoParseError('Server record does not share hostname with parent URI')
        );
      }
    }

    // Convert the original URL to a non-SRV URL.
    result.protocol = 'mongodb';
    result.host = addresses.map((address: any) => `${address.name}:${address.port}`).join(',');

    // Default to SSL true if it's not specified.
    if (
      !('ssl' in options) &&
      (!result.search || !('ssl' in result.query) || result.query.ssl === null)
    ) {
      result.query.ssl = true;
    }

    // Resolve TXT record and add options from there if they exist.
    dns.resolveTxt(lookupAddress, (err?: any, record?: any) => {
      if (err) {
        if (err.code !== 'ENODATA') {
          return callback(err);
        }
        record = null;
      }

      if (record) {
        if (record.length > 1) {
          return callback(new MongoParseError('Multiple text records not allowed'));
        }

        record = qs.parse(record[0].join(''));
        if (Object.keys(record).some((key: any) => key !== 'authSource' && key !== 'replicaSet')) {
          return callback(
            new MongoParseError('Text record must only set `authSource` or `replicaSet`')
          );
        }

        result.query = Object.assign({}, record, result.query);
      }

      // Set completed options back into the URL object.
      result.search = qs.stringify(result.query);

      const finalString = url.format(result);
      parseConnectionString(finalString, options, (err?: any, ret?: any) => {
        if (err) {
          callback(err);
          return;
        }

        callback(undefined, Object.assign({}, ret, { srvHost: lookupAddress }));
      });
    });
  });
}

/**
 * Parses a query string item according to the connection string spec
 *
 * @param key - The key for the parsed value
 * @param value - The value to parse
 */
function parseQueryStringItemValue(key: string, value: any) {
  if (Array.isArray(value)) {
    // deduplicate and simplify arrays
    value = value.filter((v: any, idx: any) => value.indexOf(v) === idx);
    if (value.length === 1) value = value[0];
  } else if (value.indexOf(':') > 0) {
    value = value.split(',').reduce((result: any, pair: any) => {
      const parts = pair.split(':');
      result[parts[0]] = parseQueryStringItemValue(key, parts[1]);
      return result;
    }, {});
  } else if (value.indexOf(',') > 0) {
    value = value.split(',').map((v: any) => {
      return parseQueryStringItemValue(key, v);
    });
  } else if (value.toLowerCase() === 'true' || value.toLowerCase() === 'false') {
    value = value.toLowerCase() === 'true';
  } else if (!Number.isNaN(value) && !STRING_OPTIONS.has(key)) {
    const numericValue = parseFloat(value);
    if (!Number.isNaN(numericValue)) {
      value = parseFloat(value);
    }
  }

  return value;
}

// Options that are known boolean types
const BOOLEAN_OPTIONS = new Set([
  'slaveok',
  'slave_ok',
  'sslvalidate',
  'fsync',
  'safe',
  'retrywrites',
  'j'
]);

// Known string options, only used to bypass Number coercion in `parseQueryStringItemValue`
const STRING_OPTIONS = new Set(['authsource', 'replicaset']);

// Supported text representations of auth mechanisms
// NOTE: this list exists in native already, if it is merged here we should deduplicate
const AUTH_MECHANISMS = new Set([
  'GSSAPI',
  'MONGODB-AWS',
  'MONGODB-X509',
  'MONGODB-CR',
  'DEFAULT',
  'SCRAM-SHA-1',
  'SCRAM-SHA-256',
  'PLAIN'
]);

// Lookup table used to translate normalized (lower-cased) forms of connection string
// options to their expected camelCase version
const CASE_TRANSLATION: any = {
  replicaset: 'replicaSet',
  connecttimeoutms: 'connectTimeoutMS',
  sockettimeoutms: 'socketTimeoutMS',
  maxpoolsize: 'maxPoolSize',
  minpoolsize: 'minPoolSize',
  maxidletimems: 'maxIdleTimeMS',
  waitqueuemultiple: 'waitQueueMultiple',
  waitqueuetimeoutms: 'waitQueueTimeoutMS',
  wtimeoutms: 'wtimeoutMS',
  readconcern: 'readConcern',
  readconcernlevel: 'readConcernLevel',
  readpreference: 'readPreference',
  maxstalenessseconds: 'maxStalenessSeconds',
  readpreferencetags: 'readPreferenceTags',
  authsource: 'authSource',
  authmechanism: 'authMechanism',
  authmechanismproperties: 'authMechanismProperties',
  gssapiservicename: 'gssapiServiceName',
  localthresholdms: 'localThresholdMS',
  serverselectiontimeoutms: 'serverSelectionTimeoutMS',
  serverselectiontryonce: 'serverSelectionTryOnce',
  heartbeatfrequencyms: 'heartbeatFrequencyMS',
  retrywrites: 'retryWrites',
  uuidrepresentation: 'uuidRepresentation',
  zlibcompressionlevel: 'zlibCompressionLevel',
  tlsallowinvalidcertificates: 'tlsAllowInvalidCertificates',
  tlsallowinvalidhostnames: 'tlsAllowInvalidHostnames',
  tlsinsecure: 'tlsInsecure',
  tlsdisablecertificaterevocationcheck: 'tlsDisableCertificateRevocationCheck',
  tlsdisableocspendpointcheck: 'tlsDisableOCSPEndpointCheck',
  tlscafile: 'tlsCAFile',
  tlscertificatekeyfile: 'tlsCertificateKeyFile',
  tlscertificatekeyfilepassword: 'tlsCertificateKeyFilePassword',
  wtimeout: 'wTimeoutMS',
  j: 'journal',
  directconnection: 'directConnection'
};

/**
 * Sets the value for `key`, allowing for any required translation
 *
 * @param obj - The object to set the key on
 * @param key - The key to set the value for
 * @param value - The value to set
 * @param options - The options used for option parsing
 */
function applyConnectionStringOption(obj: any, key: string, value: any, options: any) {
  // simple key translation
  if (key === 'journal') {
    key = 'j';
  } else if (key === 'wtimeoutms') {
    key = 'wtimeout';
  }

  // more complicated translation
  if (BOOLEAN_OPTIONS.has(key)) {
    value = value === 'true' || value === true;
  } else if (key === 'appname') {
    value = decodeURIComponent(value);
  } else if (key === 'readconcernlevel') {
    obj['readConcernLevel'] = value;
    key = 'readconcern';
    value = { level: value };
  }

  // simple validation
  if (key === 'compressors') {
    value = Array.isArray(value) ? value : [value];

    if (!value.every((c: CompressorName) => c === 'snappy' || c === 'zlib')) {
      throw new MongoParseError(
        'Value for `compressors` must be at least one of: `snappy`, `zlib`'
      );
    }
  }

  if (key === 'authmechanism' && !AUTH_MECHANISMS.has(value)) {
    throw new MongoParseError(
      `Value for authMechanism must be one of: ${Array.from(AUTH_MECHANISMS).join(
        ', '
      )}, found: ${value}`
    );
  }

  if (key === 'readpreference' && !ReadPreference.isValid(value)) {
    throw new MongoParseError(
      'Value for `readPreference` must be one of: `primary`, `primaryPreferred`, `secondary`, `secondaryPreferred`, `nearest`'
    );
  }

  if (key === 'zlibcompressionlevel' && (value < -1 || value > 9)) {
    throw new MongoParseError('zlibCompressionLevel must be an integer between -1 and 9');
  }

  // special cases
  if (key === 'compressors' || key === 'zlibcompressionlevel') {
    obj.compression = obj.compression || {};
    obj = obj.compression;
  }

  if (key === 'authmechanismproperties') {
    if (typeof value.SERVICE_NAME === 'string') obj.gssapiServiceName = value.SERVICE_NAME;
    if (typeof value.SERVICE_REALM === 'string') obj.gssapiServiceRealm = value.SERVICE_REALM;
    if (typeof value.CANONICALIZE_HOST_NAME !== 'undefined') {
      obj.gssapiCanonicalizeHostName = value.CANONICALIZE_HOST_NAME;
    }
  }

  if (key === 'readpreferencetags') {
    value = Array.isArray(value) ? splitArrayOfMultipleReadPreferenceTags(value) : [value];
  }

  // set the actual value
  if (options.caseTranslate && CASE_TRANSLATION[key]) {
    obj[CASE_TRANSLATION[key]] = value;
    return;
  }

  obj[key] = value;
}

const USERNAME_REQUIRED_MECHANISMS = new Set([
  'GSSAPI',
  'MONGODB-CR',
  'PLAIN',
  'SCRAM-SHA-1',
  'SCRAM-SHA-256'
]);

function splitArrayOfMultipleReadPreferenceTags(value: any) {
  const parsedTags: any = [];

  for (let i = 0; i < value.length; i++) {
    parsedTags[i] = {};
    value[i].split(',').forEach((individualTag: any) => {
      const splitTag = individualTag.split(':');
      parsedTags[i][splitTag[0]] = splitTag[1];
    });
  }

  return parsedTags;
}

/**
 * Modifies the parsed connection string object taking into account expectations we
 * have for authentication-related options.
 *
 * @param parsed - The parsed connection string result
 * @returns The parsed connection string result possibly modified for auth expectations
 */
function applyAuthExpectations(parsed: any) {
  if (parsed.options == null) {
    return;
  }

  const options = parsed.options;
  const authSource = options.authsource || options.authSource;
  if (authSource != null) {
    parsed.auth = Object.assign({}, parsed.auth, { db: authSource });
  }

  const authMechanism = options.authmechanism || options.authMechanism;
  if (authMechanism != null) {
    if (
      USERNAME_REQUIRED_MECHANISMS.has(authMechanism) &&
      (!parsed.auth || parsed.auth.username == null)
    ) {
      throw new MongoParseError(`Username required for mechanism \`${authMechanism}\``);
    }

    if (authMechanism === 'GSSAPI') {
      if (authSource != null && authSource !== '$external') {
        throw new MongoParseError(
          `Invalid source \`${authSource}\` for mechanism \`${authMechanism}\` specified.`
        );
      }

      parsed.auth = Object.assign({}, parsed.auth, { db: '$external' });
    }

    if (authMechanism === 'MONGODB-AWS') {
      if (authSource != null && authSource !== '$external') {
        throw new MongoParseError(
          `Invalid source \`${authSource}\` for mechanism \`${authMechanism}\` specified.`
        );
      }

      parsed.auth = Object.assign({}, parsed.auth, { db: '$external' });
    }

    if (authMechanism === 'MONGODB-X509') {
      if (parsed.auth && parsed.auth.password != null) {
        throw new MongoParseError(`Password not allowed for mechanism \`${authMechanism}\``);
      }

      if (authSource != null && authSource !== '$external') {
        throw new MongoParseError(
          `Invalid source \`${authSource}\` for mechanism \`${authMechanism}\` specified.`
        );
      }

      parsed.auth = Object.assign({}, parsed.auth, { db: '$external' });
    }

    if (authMechanism === 'PLAIN') {
      if (parsed.auth && parsed.auth.db == null) {
        parsed.auth = Object.assign({}, parsed.auth, { db: '$external' });
      }
    }
  }

  // default to `admin` if nothing else was resolved
  if (parsed.auth && parsed.auth.db == null) {
    parsed.auth = Object.assign({}, parsed.auth, { db: 'admin' });
  }

  return parsed;
}

/**
 * Parses a query string according the connection string spec.
 *
 * @param query - The query string to parse
 * @param options - The options used for options parsing
 * @returns The parsed query string as an object
 */
function parseQueryString(query: string, options?: AnyOptions): Document {
  const result = {} as any;
  const parsedQueryString = qs.parse(query);

  checkTLSQueryString(parsedQueryString);

  for (const key in parsedQueryString) {
    const value = parsedQueryString[key];
    if (value === '' || value == null) {
      throw new MongoParseError('Incomplete key value pair for option');
    }

    const normalizedKey = key.toLowerCase();
    const parsedValue = parseQueryStringItemValue(normalizedKey, value);
    applyConnectionStringOption(result, normalizedKey, parsedValue, options);
  }

  // special cases for known deprecated options
  if (result.wtimeout && result.wtimeoutms) {
    delete result.wtimeout;
    console.warn('Unsupported option `wtimeout` specified');
  }

  return Object.keys(result).length ? result : null;
}

/// Adds support for modern `tls` variants of out `ssl` options
function translateTLSOptions(queryString: any) {
  if (queryString.tls) {
    queryString.ssl = queryString.tls;
  }

  if (queryString.tlsInsecure) {
    queryString.checkServerIdentity = false;
    queryString.sslValidate = false;
  } else {
    Object.assign(queryString, {
      checkServerIdentity: queryString.tlsAllowInvalidHostnames ? false : true,
      sslValidate: queryString.tlsAllowInvalidCertificates ? false : true
    });
  }

  if (queryString.tlsCAFile) {
    queryString.ssl = true;
    queryString.sslCA = queryString.tlsCAFile;
  }

  if (queryString.tlsCertificateKeyFile) {
    queryString.ssl = true;
    if (queryString.tlsCertificateFile) {
      queryString.sslCert = queryString.tlsCertificateFile;
      queryString.sslKey = queryString.tlsCertificateKeyFile;
    } else {
      queryString.sslKey = queryString.tlsCertificateKeyFile;
      queryString.sslCert = queryString.tlsCertificateKeyFile;
    }
  }

  if (queryString.tlsCertificateKeyFilePassword) {
    queryString.ssl = true;
    queryString.sslPass = queryString.tlsCertificateKeyFilePassword;
  }

  return queryString;
}

/**
 * Checks a query string for invalid tls options according to the URI options spec.
 *
 * @param queryString - The parsed query string
 * @throws MongoParseError if tls and ssl options contain conflicts
 */
function checkTLSQueryString(queryString: any) {
  const queryStringKeys = Object.keys(queryString);

  const tlsValue = assertTlsOptionsAreEqual('tls', queryString, queryStringKeys);
  const sslValue = assertTlsOptionsAreEqual('ssl', queryString, queryStringKeys);

  if (tlsValue != null && sslValue != null) {
    if (tlsValue !== sslValue) {
      throw new MongoParseError('All values of `tls` and `ssl` must be the same.');
    }
  }
}

/**
 * Checks options object if both options are present (any value) will throw an error.
 *
 * @param options - The options used for options parsing
 * @param optionKeyA - A options key
 * @param optionKeyB - B options key
 * @throws MongoParseError if two provided options are mutually exclusive.
 */
function assertRepelOptions(options: AnyOptions, optionKeyA: string, optionKeyB: string) {
  if (
    Object.prototype.hasOwnProperty.call(options, optionKeyA) &&
    Object.prototype.hasOwnProperty.call(options, optionKeyB)
  ) {
    throw new MongoParseError(`The \`${optionKeyA}\` option cannot be used with \`${optionKeyB}\``);
  }
}

/**
 * Checks if TLS options are valid
 *
 * @param options - The options used for options parsing
 * @throws MongoParseError if TLS options are invalid
 */
function checkTLSOptions(options: AnyOptions) {
  if (!options) return null;
  const check = (a: any, b: any) => assertRepelOptions(options, a, b);
  check('tlsInsecure', 'tlsAllowInvalidCertificates');
  check('tlsInsecure', 'tlsAllowInvalidHostnames');
  check('tlsInsecure', 'tlsDisableCertificateRevocationCheck');
  check('tlsInsecure', 'tlsDisableOCSPEndpointCheck');
  check('tlsAllowInvalidCertificates', 'tlsDisableCertificateRevocationCheck');
  check('tlsAllowInvalidCertificates', 'tlsDisableOCSPEndpointCheck');
  check('tlsDisableCertificateRevocationCheck', 'tlsDisableOCSPEndpointCheck');
}

/**
 * Checks a query string to ensure all tls/ssl options are the same.
 *
 * @param optionName - The key (tls or ssl) to check
 * @param queryString - The parsed query string
 * @param queryStringKeys - list of keys in the query string
 * @throws MongoParseError
 * @returns The value of the tls/ssl option
 */
function assertTlsOptionsAreEqual(optionName: string, queryString: any, queryStringKeys: any) {
  const queryStringHasTLSOption = queryStringKeys.indexOf(optionName) !== -1;

  let optionValue;
  if (Array.isArray(queryString[optionName])) {
    optionValue = queryString[optionName][0];
  } else {
    optionValue = queryString[optionName];
  }

  if (queryStringHasTLSOption) {
    if (Array.isArray(queryString[optionName])) {
      const firstValue = queryString[optionName][0];
      queryString[optionName].forEach((tlsValue: any) => {
        if (tlsValue !== firstValue) {
          throw new MongoParseError(`All values of ${optionName} must be the same.`);
        }
      });
    }
  }

  return optionValue;
}

const PROTOCOL_MONGODB = 'mongodb';
const PROTOCOL_MONGODB_SRV = 'mongodb+srv';
const SUPPORTED_PROTOCOLS = [PROTOCOL_MONGODB, PROTOCOL_MONGODB_SRV];

interface ParseConnectionStringOptions extends Partial<ConnectionOptions> {
  /** Whether the parser should translate options back into camelCase after normalization */
  caseTranslate?: boolean;
}

/** Parses a MongoDB connection string */
export function parseConnectionString(uri: string, callback: Callback): void;
export function parseConnectionString(
  uri: string,
  options: ParseConnectionStringOptions,
  callback: Callback
): void;
export function parseConnectionString(
  uri: string,
  options?: ParseConnectionStringOptions | Callback,
  _callback?: Callback
): void {
  let callback = _callback as Callback;
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  options = { caseTranslate: true, ...options };

  // Check for bad uris before we parse
  try {
    url.parse(uri);
  } catch (e) {
    return callback(new MongoParseError('URI malformed, cannot be parsed'));
  }

  const cap = uri.match(HOSTS_RX);
  if (!cap) {
    return callback(new MongoParseError('Invalid connection string'));
  }

  const protocol = cap[1];
  if (SUPPORTED_PROTOCOLS.indexOf(protocol) === -1) {
    return callback(new MongoParseError('Invalid protocol provided'));
  }

  const dbAndQuery = cap[4].split('?');
  const db = dbAndQuery.length > 0 ? dbAndQuery[0] : null;
  const query = dbAndQuery.length > 1 ? dbAndQuery[1] : '';

  let parsedOptions;
  try {
    // this just parses the query string NOT the connection options object
    parsedOptions = parseQueryString(query, options);
    // this merges the options object with the query string object above
    parsedOptions = Object.assign({}, parsedOptions, options);
    checkTLSOptions(parsedOptions);
  } catch (parseError) {
    return callback(parseError);
  }

  parsedOptions = Object.assign({}, parsedOptions, options);

  if (protocol === PROTOCOL_MONGODB_SRV) {
    return parseSrvConnectionString(uri, parsedOptions, callback);
  }

  const auth: any = {
    username: null,
    password: null,
    db: db && db !== '' ? qs.unescape(db) : null
  };
  if (parsedOptions.auth) {
    // maintain support for legacy options passed into `MongoClient`
    if (parsedOptions.auth.username) auth.username = parsedOptions.auth.username;
    if (parsedOptions.auth.user) auth.username = parsedOptions.auth.user;
    if (parsedOptions.auth.password) auth.password = parsedOptions.auth.password;
  } else {
    if (parsedOptions.username) auth.username = parsedOptions.username;
    if (parsedOptions.user) auth.username = parsedOptions.user;
    if (parsedOptions.password) auth.password = parsedOptions.password;
  }

  if (cap[4].split('?')[0].indexOf('@') !== -1) {
    return callback(new MongoParseError('Unescaped slash in userinfo section'));
  }

  const authorityParts: any = cap[3].split('@');
  if (authorityParts.length > 2) {
    return callback(new MongoParseError('Unescaped at-sign in authority section'));
  }

  if (authorityParts[0] == null || authorityParts[0] === '') {
    return callback(new MongoParseError('No username provided in authority section'));
  }

  if (authorityParts.length > 1) {
    const authParts = authorityParts.shift().split(':');
    if (authParts.length > 2) {
      return callback(new MongoParseError('Unescaped colon in authority section'));
    }

    if (authParts[0] === '') {
      return callback(new MongoParseError('Invalid empty username provided'));
    }

    if (!auth.username) auth.username = qs.unescape(authParts[0]);
    if (!auth.password) auth.password = authParts[1] ? qs.unescape(authParts[1]) : null;
  }

  let hostParsingError = null;
  const hosts = authorityParts
    .shift()
    .split(',')
    .map((host: any) => {
      const parsedHost: any = url.parse(`mongodb://${host}`);
      if (parsedHost.path === '/:') {
        hostParsingError = new MongoParseError('Double colon in host identifier');
        return null;
      }

      // heuristically determine if we're working with a domain socket
      if (host.match(/\.sock/)) {
        parsedHost.hostname = qs.unescape(host);
        parsedHost.port = null;
      }

      if (Number.isNaN(parsedHost.port)) {
        hostParsingError = new MongoParseError('Invalid port (non-numeric string)');
        return;
      }

      const result = {
        host: parsedHost.hostname,
        port: parsedHost.port ? parseInt(parsedHost.port) : 27017
      };

      if (result.port === 0) {
        hostParsingError = new MongoParseError('Invalid port (zero) with hostname');
        return;
      }

      if (result.port > 65535) {
        hostParsingError = new MongoParseError('Invalid port (larger than 65535) with hostname');
        return;
      }

      if (result.port < 0) {
        hostParsingError = new MongoParseError('Invalid port (negative number)');
        return;
      }

      return result;
    })
    .filter((host: any) => !!host);

  if (hostParsingError) {
    return callback(hostParsingError);
  }

  if (hosts.length === 0 || hosts[0].host === '' || hosts[0].host === null) {
    return callback(new MongoParseError('No hostname or hostnames provided in connection string'));
  }

  const directConnection = !!parsedOptions.directConnection;
  if (directConnection && hosts.length !== 1) {
    // If the option is set to true, the driver MUST validate that there is exactly one host given
    // in the host list in the URI, and fail client creation otherwise.
    return callback(new MongoParseError('directConnection option requires exactly one host'));
  }

  const result = {
    hosts: hosts,
    auth: auth.db || auth.username ? auth : null,
    options: Object.keys(parsedOptions).length ? parsedOptions : {}
  } as any;

  if (result.auth && result.auth.db) {
    result.defaultDatabase = result.auth.db;
  } else {
    result.defaultDatabase = 'test';
  }

  // support modern `tls` variants to SSL options
  result.options = translateTLSOptions(result.options);

  try {
    applyAuthExpectations(result);
  } catch (authError) {
    return callback(authError);
  }

  callback(undefined, result);
}
