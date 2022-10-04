import * as dns from 'dns';
import * as fs from 'fs';
import ConnectionString from 'mongodb-connection-string-url';
import { URLSearchParams } from 'url';

import type { Document } from './bson';
import { MongoCredentials } from './cmap/auth/mongo_credentials';
import { AUTH_MECHS_AUTH_SRC_EXTERNAL, AuthMechanism } from './cmap/auth/providers';
import { Compressor, CompressorName } from './cmap/wire_protocol/compression';
import { Encrypter } from './encrypter';
import {
  MongoAPIError,
  MongoInvalidArgumentError,
  MongoMissingCredentialsError,
  MongoParseError
} from './error';
import { Logger, LoggerLevel } from './logger';
import {
  DriverInfo,
  MongoClient,
  MongoClientOptions,
  MongoOptions,
  PkFactory,
  ServerApi,
  ServerApiVersion
} from './mongo_client';
import { PromiseProvider } from './promise_provider';
import { ReadConcern, ReadConcernLevel } from './read_concern';
import { ReadPreference, ReadPreferenceMode } from './read_preference';
import type { TagSet } from './sdam/server_description';
import {
  DEFAULT_PK_FACTORY,
  emitWarning,
  emitWarningOnce,
  HostAddress,
  isRecord,
  makeClientMetadata,
  setDifference
} from './utils';
import { W, WriteConcern } from './write_concern';

const VALID_TXT_RECORDS = ['authSource', 'replicaSet', 'loadBalanced'];

const LB_SINGLE_HOST_ERROR = 'loadBalanced option only supported with a single host in the URI';
const LB_REPLICA_SET_ERROR = 'loadBalanced option not supported with a replicaSet option';
const LB_DIRECT_CONNECTION_ERROR =
  'loadBalanced option not supported when directConnection is provided';

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
export async function resolveSRVRecord(options: MongoOptions): Promise<HostAddress[]> {
  if (typeof options.srvHost !== 'string') {
    throw new MongoAPIError('Option "srvHost" must not be empty');
  }

  if (options.srvHost.split('.').length < 3) {
    // TODO(NODE-3484): Replace with MongoConnectionStringError
    throw new MongoAPIError('URI must include hostname, domain name, and tld');
  }

  // Resolve the SRV record and use the result as the list of hosts to connect to.
  const lookupAddress = options.srvHost;
  const addresses = await dns.promises.resolveSrv(
    `_${options.srvServiceName}._tcp.${lookupAddress}`
  );

  if (addresses.length === 0) {
    throw new MongoAPIError('No addresses found at host');
  }

  for (const { name } of addresses) {
    if (!matchesParentDomain(name, lookupAddress)) {
      throw new MongoAPIError('Server record does not share hostname with parent URI');
    }
  }

  const hostAddresses = addresses.map(r => HostAddress.fromString(`${r.name}:${r.port ?? 27017}`));

  validateLoadBalancedOptions(hostAddresses, options, true);

  // Resolve TXT record and add options from there if they exist.
  let record;
  try {
    record = await dns.promises.resolveTxt(lookupAddress);
  } catch (error) {
    if (error.code !== 'ENODATA' && error.code !== 'ENOTFOUND') {
      throw error;
    }
    return hostAddresses;
  }

  if (record.length > 1) {
    throw new MongoParseError('Multiple text records not allowed');
  }

  const txtRecordOptions = new URLSearchParams(record[0].join(''));
  const txtRecordOptionKeys = [...txtRecordOptions.keys()];
  if (txtRecordOptionKeys.some(key => !VALID_TXT_RECORDS.includes(key))) {
    throw new MongoParseError(`Text record may only set any of: ${VALID_TXT_RECORDS.join(', ')}`);
  }

  if (VALID_TXT_RECORDS.some(option => txtRecordOptions.get(option) === '')) {
    throw new MongoParseError('Cannot have empty URI params in DNS TXT Record');
  }

  const source = txtRecordOptions.get('authSource') ?? undefined;
  const replicaSet = txtRecordOptions.get('replicaSet') ?? undefined;
  const loadBalanced = txtRecordOptions.get('loadBalanced') ?? undefined;

  if (
    !options.userSpecifiedAuthSource &&
    source &&
    options.credentials &&
    !AUTH_MECHS_AUTH_SRC_EXTERNAL.has(options.credentials.mechanism)
  ) {
    options.credentials = MongoCredentials.merge(options.credentials, { source });
  }

  if (!options.userSpecifiedReplicaSet && replicaSet) {
    options.replicaSet = replicaSet;
  }

  if (loadBalanced === 'true') {
    options.loadBalanced = true;
  }

  if (options.replicaSet && options.srvMaxHosts > 0) {
    throw new MongoParseError('Cannot combine replicaSet option with srvMaxHosts');
  }

  validateLoadBalancedOptions(hostAddresses, options, true);

  return hostAddresses;
}

/**
 * Checks if TLS options are valid
 *
 * @param allOptions - All options provided by user or included in default options map
 * @throws MongoAPIError if TLS options are invalid
 */
function checkTLSOptions(allOptions: CaseInsensitiveMap): void {
  if (!allOptions) return;
  const check = (a: string, b: string) => {
    if (allOptions.has(a) && allOptions.has(b)) {
      throw new MongoAPIError(`The '${a}' option cannot be used with the '${b}' option`);
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

const TRUTHS = new Set(['true', 't', '1', 'y', 'yes']);
const FALSEHOODS = new Set(['false', 'f', '0', 'n', 'no', '-1']);
function getBoolean(name: string, value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  const valueString = String(value).toLowerCase();
  if (TRUTHS.has(valueString)) {
    if (valueString !== 'true') {
      emitWarningOnce(
        `deprecated value for ${name} : ${valueString} - please update to ${name} : true instead`
      );
    }
    return true;
  }
  if (FALSEHOODS.has(valueString)) {
    if (valueString !== 'false') {
      emitWarningOnce(
        `deprecated value for ${name} : ${valueString} - please update to ${name} : false instead`
      );
    }
    return false;
  }
  throw new MongoParseError(`Expected ${name} to be stringified boolean value, got: ${value}`);
}

function getInt(name: string, value: unknown): number {
  if (typeof value === 'number') return Math.trunc(value);
  const parsedValue = Number.parseInt(String(value), 10);
  if (!Number.isNaN(parsedValue)) return parsedValue;
  throw new MongoParseError(`Expected ${name} to be stringified int value, got: ${value}`);
}

function getUint(name: string, value: unknown): number {
  const parsedValue = getInt(name, value);
  if (parsedValue < 0) {
    throw new MongoParseError(`${name} can only be a positive int value, got: ${value}`);
  }
  return parsedValue;
}

function* entriesFromString(value: string): Generator<[string, string]> {
  const keyValuePairs = value.split(',');
  for (const keyValue of keyValuePairs) {
    const [key, value] = keyValue.split(':');
    if (value == null) {
      throw new MongoParseError('Cannot have undefined values in key value pairs');
    }

    yield [key, value];
  }
}

class CaseInsensitiveMap<Value = any> extends Map<string, Value> {
  constructor(entries: Array<[string, any]> = []) {
    super(entries.map(([k, v]) => [k.toLowerCase(), v]));
  }
  override has(k: string) {
    return super.has(k.toLowerCase());
  }
  override get(k: string) {
    return super.get(k.toLowerCase());
  }
  override set(k: string, v: any) {
    return super.set(k.toLowerCase(), v);
  }
  override delete(k: string): boolean {
    return super.delete(k.toLowerCase());
  }
}

export function parseOptions(
  uri: string,
  mongoClient: MongoClient | MongoClientOptions | undefined = undefined,
  options: MongoClientOptions = {}
): MongoOptions {
  if (mongoClient != null && !(mongoClient instanceof MongoClient)) {
    options = mongoClient;
    mongoClient = undefined;
  }

  const url = new ConnectionString(uri);
  const { hosts, isSRV } = url;

  const mongoOptions = Object.create(null);

  // Feature flags
  for (const flag of Object.getOwnPropertySymbols(options)) {
    if (FEATURE_FLAGS.has(flag)) {
      mongoOptions[flag] = options[flag];
    }
  }

  mongoOptions.hosts = isSRV ? [] : hosts.map(HostAddress.fromString);

  const urlOptions = new CaseInsensitiveMap<any[]>();

  if (url.pathname !== '/' && url.pathname !== '') {
    const dbName = decodeURIComponent(
      url.pathname[0] === '/' ? url.pathname.slice(1) : url.pathname
    );
    if (dbName) {
      urlOptions.set('dbName', [dbName]);
    }
  }

  if (url.username !== '') {
    const auth: Document = {
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
      throw new MongoAPIError('URI cannot contain options with no value');
    }

    if (!urlOptions.has(key)) {
      urlOptions.set(key, values);
    }
  }

  const objectOptions = new CaseInsensitiveMap(
    Object.entries(options).filter(([, v]) => v != null)
  );

  // Validate options that can only be provided by one of uri or object

  if (urlOptions.has('serverApi')) {
    throw new MongoParseError(
      'URI cannot contain `serverApi`, it can only be passed to the client'
    );
  }

  if (objectOptions.has('loadBalanced')) {
    throw new MongoParseError('loadBalanced is only a valid option in the URI');
  }

  // All option collection

  const allOptions = new CaseInsensitiveMap();

  const allKeys = new Set<string>([
    ...urlOptions.keys(),
    ...objectOptions.keys(),
    ...DEFAULT_OPTIONS.keys()
  ]);

  for (const key of allKeys) {
    const values = [];
    const objectOptionValue = objectOptions.get(key);
    if (objectOptionValue != null) {
      values.push(objectOptionValue);
    }
    const urlValue = urlOptions.get(key);
    if (urlValue != null) {
      values.push(...urlValue);
    }
    const defaultOptionsValue = DEFAULT_OPTIONS.get(key);
    if (defaultOptionsValue != null) {
      values.push(defaultOptionsValue);
    }
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
      throw new MongoParseError('All values of tls/ssl must be the same.');
    }
  }

  checkTLSOptions(allOptions);

  const unsupportedOptions = setDifference(
    allKeys,
    Array.from(Object.keys(OPTIONS)).map(s => s.toLowerCase())
  );
  if (unsupportedOptions.size !== 0) {
    const optionWord = unsupportedOptions.size > 1 ? 'options' : 'option';
    const isOrAre = unsupportedOptions.size > 1 ? 'are' : 'is';
    throw new MongoParseError(
      `${optionWord} ${Array.from(unsupportedOptions).join(', ')} ${isOrAre} not supported`
    );
  }

  // Option parsing and setting

  for (const [key, descriptor] of Object.entries(OPTIONS)) {
    const values = allOptions.get(key);
    if (!values || values.length === 0) continue;
    setOption(mongoOptions, key, descriptor, values);
  }

  if (mongoOptions.credentials) {
    const isGssapi = mongoOptions.credentials.mechanism === AuthMechanism.MONGODB_GSSAPI;
    const isX509 = mongoOptions.credentials.mechanism === AuthMechanism.MONGODB_X509;
    const isAws = mongoOptions.credentials.mechanism === AuthMechanism.MONGODB_AWS;
    if (
      (isGssapi || isX509) &&
      allOptions.has('authSource') &&
      mongoOptions.credentials.source !== '$external'
    ) {
      // If authSource was explicitly given and its incorrect, we error
      throw new MongoParseError(
        `${mongoOptions.credentials} can only have authSource set to '$external'`
      );
    }

    if (!(isGssapi || isX509 || isAws) && mongoOptions.dbName && !allOptions.has('authSource')) {
      // inherit the dbName unless GSSAPI or X509, then silently ignore dbName
      // and there was no specific authSource given
      mongoOptions.credentials = MongoCredentials.merge(mongoOptions.credentials, {
        source: mongoOptions.dbName
      });
    }

    if (isAws && mongoOptions.credentials.username && !mongoOptions.credentials.password) {
      throw new MongoMissingCredentialsError(
        `When using ${mongoOptions.credentials.mechanism} password must be set when a username is specified`
      );
    }

    mongoOptions.credentials.validate();

    // Check if the only auth related option provided was authSource, if so we can remove credentials
    if (
      mongoOptions.credentials.password === '' &&
      mongoOptions.credentials.username === '' &&
      mongoOptions.credentials.mechanism === AuthMechanism.MONGODB_DEFAULT &&
      Object.keys(mongoOptions.credentials.mechanismProperties).length === 0
    ) {
      delete mongoOptions.credentials;
    }
  }

  if (!mongoOptions.dbName) {
    // dbName default is applied here because of the credential validation above
    mongoOptions.dbName = 'test';
  }

  if (options.promiseLibrary) {
    PromiseProvider.set(options.promiseLibrary);
  }

  validateLoadBalancedOptions(hosts, mongoOptions, isSRV);

  if (mongoClient && mongoOptions.autoEncryption) {
    Encrypter.checkForMongoCrypt();
    mongoOptions.encrypter = new Encrypter(mongoClient, uri, options);
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
      throw new MongoAPIError('SRV URI does not support directConnection');
    }

    if (mongoOptions.srvMaxHosts > 0 && typeof mongoOptions.replicaSet === 'string') {
      throw new MongoParseError('Cannot use srvMaxHosts option with replicaSet');
    }

    // SRV turns on TLS by default, but users can override and turn it off
    const noUserSpecifiedTLS = !objectOptions.has('tls') && !urlOptions.has('tls');
    const noUserSpecifiedSSL = !objectOptions.has('ssl') && !urlOptions.has('ssl');
    if (noUserSpecifiedTLS && noUserSpecifiedSSL) {
      mongoOptions.tls = true;
    }
  } else {
    const userSpecifiedSrvOptions =
      urlOptions.has('srvMaxHosts') ||
      objectOptions.has('srvMaxHosts') ||
      urlOptions.has('srvServiceName') ||
      objectOptions.has('srvServiceName');

    if (userSpecifiedSrvOptions) {
      throw new MongoParseError(
        'Cannot use srvMaxHosts or srvServiceName with a non-srv connection string'
      );
    }
  }

  if (mongoOptions.directConnection && mongoOptions.hosts.length !== 1) {
    throw new MongoParseError('directConnection option requires exactly one host');
  }

  if (
    !mongoOptions.proxyHost &&
    (mongoOptions.proxyPort || mongoOptions.proxyUsername || mongoOptions.proxyPassword)
  ) {
    throw new MongoParseError('Must specify proxyHost if other proxy options are passed');
  }

  if (
    (mongoOptions.proxyUsername && !mongoOptions.proxyPassword) ||
    (!mongoOptions.proxyUsername && mongoOptions.proxyPassword)
  ) {
    throw new MongoParseError('Can only specify both of proxy username/password or neither');
  }

  const proxyOptions = ['proxyHost', 'proxyPort', 'proxyUsername', 'proxyPassword'].map(
    key => urlOptions.get(key) ?? []
  );

  if (proxyOptions.some(options => options.length > 1)) {
    throw new MongoParseError(
      'Proxy options cannot be specified multiple times in the connection string'
    );
  }

  return mongoOptions;
}

/**
 * #### Throws if LB mode is true:
 * - hosts contains more than one host
 * - there is a replicaSet name set
 * - directConnection is set
 * - if srvMaxHosts is used when an srv connection string is passed in
 *
 * @throws MongoParseError
 */
function validateLoadBalancedOptions(
  hosts: HostAddress[] | string[],
  mongoOptions: MongoOptions,
  isSrv: boolean
): void {
  if (mongoOptions.loadBalanced) {
    if (hosts.length > 1) {
      throw new MongoParseError(LB_SINGLE_HOST_ERROR);
    }
    if (mongoOptions.replicaSet) {
      throw new MongoParseError(LB_REPLICA_SET_ERROR);
    }
    if (mongoOptions.directConnection) {
      throw new MongoParseError(LB_DIRECT_CONNECTION_ERROR);
    }

    if (isSrv && mongoOptions.srvMaxHosts > 0) {
      throw new MongoParseError('Cannot limit srv hosts with loadBalanced enabled');
    }
  }
  return;
}

function setOption(
  mongoOptions: any,
  key: string,
  descriptor: OptionDescriptor,
  values: unknown[]
) {
  const { target, type, transform, deprecated } = descriptor;
  const name = target ?? key;

  if (deprecated) {
    const deprecatedMsg = typeof deprecated === 'string' ? `: ${deprecated}` : '';
    emitWarning(`${key} is a deprecated option${deprecatedMsg}`);
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
      if (!isRecord(values[0])) {
        throw new MongoParseError(`${name} must be an object`);
      }
      mongoOptions[name] = values[0];
      break;
    case 'any':
      mongoOptions[name] = values[0];
      break;
    default: {
      if (!transform) {
        throw new MongoParseError('Descriptors missing a type must define a transform');
      }
      const transformValue = transform({ name, options: mongoOptions, values });
      mongoOptions[name] = transformValue;
      break;
    }
  }
}

interface OptionDescriptor {
  target?: string;
  type?: 'boolean' | 'int' | 'uint' | 'record' | 'string' | 'any';
  default?: any;

  deprecated?: boolean | string;
  /**
   * @param name - the original option name
   * @param options - the options so far for resolution
   * @param values - the possible values in precedence order
   */
  transform?: (args: { name: string; options: MongoOptions; values: unknown[] }) => unknown;
}

export const OPTIONS = {
  appName: {
    target: 'metadata',
    transform({ options, values: [value] }): DriverInfo {
      return makeClientMetadata({ ...options.driverInfo, appName: String(value) });
    }
  },
  auth: {
    target: 'credentials',
    transform({ name, options, values: [value] }): MongoCredentials {
      if (!isRecord(value, ['username', 'password'] as const)) {
        throw new MongoParseError(
          `${name} must be an object with 'username' and 'password' properties`
        );
      }
      return MongoCredentials.merge(options.credentials, {
        username: value.username,
        password: value.password
      });
    }
  },
  authMechanism: {
    target: 'credentials',
    transform({ options, values: [value] }): MongoCredentials {
      const mechanisms = Object.values(AuthMechanism);
      const [mechanism] = mechanisms.filter(m => m.match(RegExp(String.raw`\b${value}\b`, 'i')));
      if (!mechanism) {
        throw new MongoParseError(`authMechanism one of ${mechanisms}, got ${value}`);
      }
      let source = options.credentials?.source;
      if (
        mechanism === AuthMechanism.MONGODB_PLAIN ||
        AUTH_MECHS_AUTH_SRC_EXTERNAL.has(mechanism)
      ) {
        // some mechanisms have '$external' as the Auth Source
        source = '$external';
      }

      let password = options.credentials?.password;
      if (mechanism === AuthMechanism.MONGODB_X509 && password === '') {
        password = undefined;
      }
      return MongoCredentials.merge(options.credentials, {
        mechanism,
        source,
        password
      });
    }
  },
  authMechanismProperties: {
    target: 'credentials',
    transform({ options, values: [optionValue] }): MongoCredentials {
      if (typeof optionValue === 'string') {
        const mechanismProperties = Object.create(null);

        for (const [key, value] of entriesFromString(optionValue)) {
          try {
            mechanismProperties[key] = getBoolean(key, value);
          } catch {
            mechanismProperties[key] = value;
          }
        }

        return MongoCredentials.merge(options.credentials, {
          mechanismProperties
        });
      }
      if (!isRecord(optionValue)) {
        throw new MongoParseError('AuthMechanismProperties must be an object');
      }
      return MongoCredentials.merge(options.credentials, { mechanismProperties: optionValue });
    }
  },
  authSource: {
    target: 'credentials',
    transform({ options, values: [value] }): MongoCredentials {
      const source = String(value);
      return MongoCredentials.merge(options.credentials, { source });
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
    transform({ values: [version] }): ServerApi {
      const serverApiToValidate =
        typeof version === 'string' ? ({ version } as ServerApi) : (version as ServerApi);
      const versionToValidate = serverApiToValidate && serverApiToValidate.version;
      if (!versionToValidate) {
        throw new MongoParseError(
          `Invalid \`serverApi\` property; must specify a version from the following enum: ["${Object.values(
            ServerApiVersion
          ).join('", "')}"]`
        );
      }
      if (!Object.values(ServerApiVersion).some(v => v === versionToValidate)) {
        throw new MongoParseError(
          `Invalid server API version=${versionToValidate}; must be in the following enum: ["${Object.values(
            ServerApiVersion
          ).join('", "')}"]`
        );
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
      for (const compVal of values as (CompressorName[] | string)[]) {
        const compValArray = typeof compVal === 'string' ? compVal.split(',') : compVal;
        if (!Array.isArray(compValArray)) {
          throw new MongoInvalidArgumentError(
            'compressors must be an array or a comma-delimited list of strings'
          );
        }
        for (const c of compValArray) {
          if (Object.keys(Compressor).includes(String(c))) {
            compressionList.add(String(c));
          } else {
            throw new MongoInvalidArgumentError(
              `${c} is not a valid compression mechanism. Must be one of: ${Object.keys(
                Compressor
              )}.`
            );
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
    default: makeClientMetadata(),
    transform({ options, values: [value] }) {
      if (!isRecord(value)) throw new MongoParseError('DriverInfo must be an object');
      return makeClientMetadata({
        driverInfo: value,
        appName: options.metadata?.application?.name
      });
    }
  },
  enableUtf8Validation: { type: 'boolean', default: true },
  family: {
    transform({ name, values: [value] }): 4 | 6 {
      const transformValue = getInt(name, value);
      if (transformValue === 4 || transformValue === 6) {
        return transformValue;
      }
      throw new MongoParseError(`Option 'family' must be 4 or 6 got ${transformValue}.`);
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
    transform({ name, options, values: [value] }): WriteConcern {
      const wc = WriteConcern.fromOptions({
        writeConcern: {
          ...options.writeConcern,
          fsync: getBoolean(name, value)
        }
      });
      if (!wc) throw new MongoParseError(`Unable to make a writeConcern from fsync=${value}`);
      return wc;
    }
  } as OptionDescriptor,
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
    transform({ name, options, values: [value] }): WriteConcern {
      const wc = WriteConcern.fromOptions({
        writeConcern: {
          ...options.writeConcern,
          journal: getBoolean(name, value)
        }
      });
      if (!wc) throw new MongoParseError(`Unable to make a writeConcern from journal=${value}`);
      return wc;
    }
  } as OptionDescriptor,
  journal: {
    target: 'writeConcern',
    transform({ name, options, values: [value] }): WriteConcern {
      const wc = WriteConcern.fromOptions({
        writeConcern: {
          ...options.writeConcern,
          journal: getBoolean(name, value)
        }
      });
      if (!wc) throw new MongoParseError(`Unable to make a writeConcern from journal=${value}`);
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
    default: new Logger('MongoClient'),
    transform({ values: [value] }) {
      if (value instanceof Logger) {
        return value;
      }
      emitWarning('Alternative loggers might not be supported');
      // TODO: make Logger an interface that others can implement, make usage consistent in driver
      // DRIVERS-1204
      return;
    }
  },
  loggerLevel: {
    target: 'logger',
    transform({ values: [value] }) {
      return new Logger('MongoClient', { loggerLevel: value as LoggerLevel });
    }
  },
  maxConnecting: {
    default: 2,
    transform({ name, values: [value] }): number {
      const maxConnecting = getUint(name, value);
      if (maxConnecting === 0) {
        throw new MongoInvalidArgumentError('maxConnecting must be > 0 if specified');
      }
      return maxConnecting;
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
        return ReadPreference.fromOptions({
          readPreference: { ...options.readPreference, maxStalenessSeconds }
        });
      } else {
        return new ReadPreference('secondary', undefined, { maxStalenessSeconds });
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
  } as OptionDescriptor,
  noDelay: {
    default: true,
    type: 'boolean'
  },
  pkFactory: {
    default: DEFAULT_PK_FACTORY,
    transform({ values: [value] }): PkFactory {
      if (isRecord(value, ['createPk'] as const) && typeof value.createPk === 'function') {
        return value as PkFactory;
      }
      throw new MongoParseError(
        `Option pkFactory must be an object with a createPk function, got ${value}`
      );
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
      if (value instanceof ReadConcern || isRecord(value, ['level'] as const)) {
        return ReadConcern.fromOptions({ ...options.readConcern, ...value } as any);
      }
      throw new MongoParseError(`ReadConcern must be an object, got ${JSON.stringify(value)}`);
    }
  },
  readConcernLevel: {
    target: 'readConcern',
    transform({ values: [level], options }) {
      return ReadConcern.fromOptions({
        ...options.readConcern,
        level: level as ReadConcernLevel
      });
    }
  },
  readPreference: {
    default: ReadPreference.primary,
    transform({ values: [value], options }) {
      if (value instanceof ReadPreference) {
        return ReadPreference.fromOptions({
          readPreference: { ...options.readPreference, ...value },
          ...value
        } as any);
      }
      if (isRecord(value, ['mode'] as const)) {
        const rp = ReadPreference.fromOptions({
          readPreference: { ...options.readPreference, ...value },
          ...value
        } as any);
        if (rp) return rp;
        else throw new MongoParseError(`Cannot make read preference from ${JSON.stringify(value)}`);
      }
      if (typeof value === 'string') {
        const rpOpts = {
          hedge: options.readPreference?.hedge,
          maxStalenessSeconds: options.readPreference?.maxStalenessSeconds
        };
        return new ReadPreference(
          value as ReadPreferenceMode,
          options.readPreference?.tags,
          rpOpts
        );
      }
      throw new MongoParseError(`Unknown ReadPreference value: ${value}`);
    }
  },
  readPreferenceTags: {
    target: 'readPreference',
    transform({
      values,
      options
    }: {
      values: Array<string | Record<string, string>[]>;
      options: MongoClientOptions;
    }) {
      const tags: Array<string | Record<string, string>> = Array.isArray(values[0])
        ? values[0]
        : (values as Array<string>);
      const readPreferenceTags = [];
      for (const tag of tags) {
        const readPreferenceTag: TagSet = Object.create(null);
        if (typeof tag === 'string') {
          for (const [k, v] of entriesFromString(tag)) {
            readPreferenceTag[k] = v;
          }
        }
        if (isRecord(tag)) {
          for (const [k, v] of Object.entries(tag)) {
            readPreferenceTag[k] = v;
          }
        }
        readPreferenceTags.push(readPreferenceTag);
      }
      return ReadPreference.fromOptions({
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
      } else {
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
      return WriteConcern.fromOptions({ writeConcern: { ...options.writeConcern, w: value as W } });
    }
  },
  waitQueueTimeoutMS: {
    default: 0,
    type: 'uint'
  },
  writeConcern: {
    target: 'writeConcern',
    transform({ values: [value], options }) {
      if (isRecord(value) || value instanceof WriteConcern) {
        return WriteConcern.fromOptions({
          writeConcern: {
            ...options.writeConcern,
            ...value
          }
        });
      } else if (value === 'majority' || typeof value === 'number') {
        return WriteConcern.fromOptions({
          writeConcern: {
            ...options.writeConcern,
            w: value
          }
        });
      }

      throw new MongoParseError(`Invalid WriteConcern cannot parse: ${JSON.stringify(value)}`);
    }
  },
  wtimeout: {
    deprecated: 'Please use wtimeoutMS instead',
    target: 'writeConcern',
    transform({ values: [value], options }) {
      const wc = WriteConcern.fromOptions({
        writeConcern: {
          ...options.writeConcern,
          wtimeout: getUint('wtimeout', value)
        }
      });
      if (wc) return wc;
      throw new MongoParseError(`Cannot make WriteConcern from wtimeout`);
    }
  } as OptionDescriptor,
  wtimeoutMS: {
    target: 'writeConcern',
    transform({ values: [value], options }) {
      const wc = WriteConcern.fromOptions({
        writeConcern: {
          ...options.writeConcern,
          wtimeoutMS: getUint('wtimeoutMS', value)
        }
      });
      if (wc) return wc;
      throw new MongoParseError(`Cannot make WriteConcern from wtimeout`);
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
  useNewUrlParser: { type: 'boolean' } as OptionDescriptor,
  useUnifiedTopology: { type: 'boolean' } as OptionDescriptor
} as Record<keyof MongoClientOptions, OptionDescriptor>;

export const DEFAULT_OPTIONS = new CaseInsensitiveMap(
  Object.entries(OPTIONS)
    .filter(([, descriptor]) => descriptor.default != null)
    .map(([k, d]) => [k, d.default])
);

/**
 * Set of permitted feature flags
 * @internal
 */
export const FEATURE_FLAGS = new Set([Symbol.for('@@mdb.skipPingOnConnect')]);
