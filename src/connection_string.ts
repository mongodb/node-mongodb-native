import * as dns from 'dns';
import * as fs from 'fs';
import { URL, URLSearchParams } from 'url';
import { AuthMechanism } from './cmap/auth/defaultAuthProviders';
import { ReadPreference, ReadPreferenceModeId } from './read_preference';
import { ReadConcern, ReadConcernLevelId } from './read_concern';
import { W, WriteConcern } from './write_concern';
import { MongoParseError } from './error';
import {
  AnyOptions,
  Callback,
  DEFAULT_PK_FACTORY,
  isRecord,
  makeClientMetadata,
  setDifference,
  HostAddress,
  emitWarning
} from './utils';
import type { Document } from './bson';
import {
  DriverInfo,
  MongoClient,
  MongoClientOptions,
  MongoOptions,
  PkFactory,
  ServerApi
} from './mongo_client';
import { MongoCredentials } from './cmap/auth/mongo_credentials';
import type { TagSet } from './sdam/server_description';
import { Logger, LoggerLevelId } from './logger';
import { PromiseProvider } from './promise_provider';
import { Encrypter } from './encrypter';

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
export function resolveSRVRecord(options: MongoOptions, callback: Callback<HostAddress[]>): void {
  if (typeof options.srvHost !== 'string') {
    return callback(new MongoParseError('Cannot resolve empty srv string'));
  }

  if (options.srvHost.split('.').length < 3) {
    return callback(new MongoParseError('URI does not have hostname, domain name and tld'));
  }

  // Resolve the SRV record and use the result as the list of hosts to connect to.
  const lookupAddress = options.srvHost;
  dns.resolveSrv(`_mongodb._tcp.${lookupAddress}`, (err, addresses) => {
    if (err) return callback(err);

    if (addresses.length === 0) {
      return callback(new MongoParseError('No addresses found at host'));
    }

    for (const { name } of addresses) {
      if (!matchesParentDomain(name, lookupAddress)) {
        return callback(
          new MongoParseError('Server record does not share hostname with parent URI')
        );
      }
    }

    const hostAddresses = addresses.map(r =>
      HostAddress.fromString(`${r.name}:${r.port ?? 27017}`)
    );

    // Resolve TXT record and add options from there if they exist.
    dns.resolveTxt(lookupAddress, (err, record) => {
      if (err) {
        if (err.code !== 'ENODATA' && err.code !== 'ENOTFOUND') {
          return callback(err);
        }
      } else {
        if (record.length > 1) {
          return callback(new MongoParseError('Multiple text records not allowed'));
        }

        const txtRecordOptions = new URLSearchParams(record[0].join(''));
        const txtRecordOptionKeys = [...txtRecordOptions.keys()];
        if (txtRecordOptionKeys.some(key => key !== 'authSource' && key !== 'replicaSet')) {
          return callback(
            new MongoParseError('Text record must only set `authSource` or `replicaSet`')
          );
        }

        const source = txtRecordOptions.get('authSource') ?? undefined;
        const replicaSet = txtRecordOptions.get('replicaSet') ?? undefined;

        if (source === '' || replicaSet === '') {
          return callback(new MongoParseError('Cannot have empty URI params in DNS TXT Record'));
        }

        if (!options.userSpecifiedAuthSource && source) {
          options.credentials = MongoCredentials.merge(options.credentials, { source });
        }

        if (!options.userSpecifiedReplicaSet && replicaSet) {
          options.replicaSet = replicaSet;
        }
      }

      callback(undefined, hostAddresses);
    });
  });
}

/**
 * Checks if TLS options are valid
 *
 * @param options - The options used for options parsing
 * @throws MongoParseError if TLS options are invalid
 */
export function checkTLSOptions(options: AnyOptions): void {
  if (!options) return;
  const check = (a: string, b: string) => {
    if (Reflect.has(options, a) && Reflect.has(options, b)) {
      throw new MongoParseError(`The '${a}' option cannot be used with '${b}'`);
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

const HOSTS_REGEX = new RegExp(
  String.raw`(?<protocol>mongodb(?:\+srv|)):\/\/(?:(?<username>[^:]*)(?::(?<password>[^@]*))?@)?(?<hosts>(?!:)[^\/?@]+)(?<rest>.*)`
);

/** @internal */
export function parseURI(uri: string): { isSRV: boolean; url: URL; hosts: string[] } {
  const match = uri.match(HOSTS_REGEX);
  if (!match) {
    throw new MongoParseError(`Invalid connection string ${uri}`);
  }

  const protocol = match.groups?.protocol;
  const username = match.groups?.username;
  const password = match.groups?.password;
  const hosts = match.groups?.hosts;
  const rest = match.groups?.rest;

  if (!protocol || !hosts) {
    throw new MongoParseError('Invalid connection string, protocol and host(s) required');
  }

  decodeURIComponent(username ?? '');
  decodeURIComponent(password ?? '');

  // characters not permitted in username nor password Set([':', '/', '?', '#', '[', ']', '@'])
  const illegalCharacters = new RegExp(String.raw`[:/?#\[\]@]`, 'gi');
  if (username?.match(illegalCharacters)) {
    throw new MongoParseError(`Username contains unescaped characters ${username}`);
  }
  if (!username || !password) {
    const uriWithoutProtocol = uri.replace(`${protocol}://`, '');
    if (uriWithoutProtocol.startsWith('@') || uriWithoutProtocol.startsWith(':')) {
      throw new MongoParseError('URI contained empty userinfo section');
    }
  }

  if (password?.match(illegalCharacters)) {
    throw new MongoParseError('Password contains unescaped characters');
  }

  let authString = '';
  if (typeof username === 'string') authString += username;
  if (typeof password === 'string') authString += `:${password}`;

  const isSRV = protocol.includes('srv');
  const hostList = hosts.split(',');
  const url = new URL(`${protocol.toLowerCase()}://${authString}@dummyHostname${rest}`);

  if (isSRV && hostList.length !== 1) {
    throw new MongoParseError('mongodb+srv URI cannot have multiple service names');
  }
  if (isSRV && hostList[0].includes(':')) {
    throw new MongoParseError('mongodb+srv URI cannot have port number');
  }

  return {
    isSRV,
    url,
    hosts: hosts.split(',')
  };
}

const TRUTHS = new Set(['true', 't', '1', 'y', 'yes']);
const FALSEHOODS = new Set(['false', 'f', '0', 'n', 'no', '-1']);
function getBoolean(name: string, value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  const valueString = String(value).toLowerCase();
  if (TRUTHS.has(valueString)) return true;
  if (FALSEHOODS.has(valueString)) return false;
  throw new TypeError(`For ${name} Expected stringified boolean value, got: ${value}`);
}

function getInt(name: string, value: unknown): number {
  if (typeof value === 'number') return Math.trunc(value);
  const parsedValue = Number.parseInt(String(value), 10);
  if (!Number.isNaN(parsedValue)) return parsedValue;
  throw new TypeError(`Expected ${name} to be stringified int value, got: ${value}`);
}

function getUint(name: string, value: unknown): number {
  const parsedValue = getInt(name, value);
  if (parsedValue < 0) {
    throw new TypeError(`${name} can only be a positive int value, got: ${value}`);
  }
  return parsedValue;
}

function toRecord(value: string): Record<string, any> {
  const record = Object.create(null);
  const keyValuePairs = value.split(',');
  for (const keyValue of keyValuePairs) {
    const [key, value] = keyValue.split(':');
    if (typeof value === 'undefined') {
      throw new MongoParseError('Cannot have undefined values in key value pairs');
    }
    try {
      // try to get a boolean
      record[key] = getBoolean('', value);
    } catch {
      try {
        // try to get a number
        record[key] = getInt('', value);
      } catch {
        // keep value as a string
        record[key] = value;
      }
    }
  }
  return record;
}

class CaseInsensitiveMap extends Map<string, any> {
  constructor(entries: Array<[string, any]> = []) {
    super(entries.map(([k, v]) => [k.toLowerCase(), v]));
  }
  has(k: string) {
    return super.has(k.toLowerCase());
  }
  get(k: string) {
    return super.get(k.toLowerCase());
  }
  set(k: string, v: any) {
    return super.set(k.toLowerCase(), v);
  }
  delete(k: string): boolean {
    return super.delete(k.toLowerCase());
  }
}

export function parseOptions(
  uri: string,
  mongoClient: MongoClient | MongoClientOptions | undefined = undefined,
  options: MongoClientOptions = {}
): MongoOptions {
  if (typeof mongoClient !== 'undefined' && !(mongoClient instanceof MongoClient)) {
    options = mongoClient;
    mongoClient = undefined;
  }

  const { url, hosts, isSRV } = parseURI(uri);

  const mongoOptions = Object.create(null);
  mongoOptions.hosts = isSRV ? [] : hosts.map(HostAddress.fromString);
  if (isSRV) {
    // SRV Record is resolved upon connecting
    mongoOptions.srvHost = hosts[0];
    options.tls = true;
  }

  const urlOptions = new CaseInsensitiveMap();

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
      throw new MongoParseError('URI cannot contain options with no value');
    }

    if (key.toLowerCase() === 'serverapi') {
      throw new MongoParseError(
        'URI cannot contain `serverApi`, it can only be passed to the client'
      );
    }

    if (key.toLowerCase() === 'authsource' && urlOptions.has('authSource')) {
      // If authSource is an explicit key in the urlOptions we need to remove the implicit dbName
      urlOptions.delete('authSource');
    }

    if (!urlOptions.has(key)) {
      urlOptions.set(key, values);
    }
  }

  const objectOptions = new CaseInsensitiveMap(
    Object.entries(options).filter(([, v]) => (v ?? null) !== null)
  );

  const allOptions = new CaseInsensitiveMap();

  const allKeys = new Set<string>([
    ...urlOptions.keys(),
    ...objectOptions.keys(),
    ...DEFAULT_OPTIONS.keys()
  ]);

  for (const key of allKeys) {
    const values = [];
    if (objectOptions.has(key)) {
      values.push(objectOptions.get(key));
    }
    if (urlOptions.has(key)) {
      values.push(...urlOptions.get(key));
    }
    if (DEFAULT_OPTIONS.has(key)) {
      values.push(DEFAULT_OPTIONS.get(key));
    }
    allOptions.set(key, values);
  }

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

    mongoOptions.credentials.validate();
  }

  if (!mongoOptions.dbName) {
    // dbName default is applied here because of the credential validation above
    mongoOptions.dbName = 'test';
  }

  if (allOptions.has('tls')) {
    if (new Set(allOptions.get('tls')?.map(getBoolean)).size !== 1) {
      throw new MongoParseError('All values of tls must be the same.');
    }
  }

  if (allOptions.has('ssl')) {
    if (new Set(allOptions.get('ssl')?.map(getBoolean)).size !== 1) {
      throw new MongoParseError('All values of ssl must be the same.');
    }
  }

  checkTLSOptions(mongoOptions);

  if (options.promiseLibrary) PromiseProvider.set(options.promiseLibrary);

  if (mongoOptions.directConnection && typeof mongoOptions.srvHost === 'string') {
    throw new MongoParseError('directConnection not supported with SRV URI');
  }

  // Potential SRV Overrides
  mongoOptions.userSpecifiedAuthSource =
    objectOptions.has('authSource') || urlOptions.has('authSource');
  mongoOptions.userSpecifiedReplicaSet =
    objectOptions.has('replicaSet') || urlOptions.has('replicaSet');

  if (mongoClient && mongoOptions.autoEncryption) {
    Encrypter.checkForMongoCrypt();
    mongoOptions.encrypter = new Encrypter(mongoClient, uri, options);
    mongoOptions.autoEncrypter = mongoOptions.encrypter.autoEncrypter;
  }

  return mongoOptions;
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
      if (values[0] === undefined) {
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
        mechanism === AuthMechanism.MONGODB_GSSAPI ||
        mechanism === AuthMechanism.MONGODB_AWS ||
        mechanism === AuthMechanism.MONGODB_X509
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
    transform({ options, values: [value] }): MongoCredentials {
      if (typeof value === 'string') {
        value = toRecord(value);
      }
      if (!isRecord(value)) {
        throw new MongoParseError('AuthMechanismProperties must be an object');
      }
      return MongoCredentials.merge(options.credentials, { mechanismProperties: value });
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
  serverApi: {
    target: 'serverApi',
    transform({ values: [version] }): ServerApi {
      if (typeof version === 'string') {
        return { version };
      }
      return version as ServerApi;
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
      for (const compVal of values as string[]) {
        for (const c of compVal.split(',')) {
          if (['none', 'snappy', 'zlib'].includes(String(c))) {
            compressionList.add(String(c));
          } else {
            throw new MongoParseError(`${c} is not a valid compression mechanism`);
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
    }
  },
  loggerLevel: {
    target: 'logger',
    transform({ values: [value] }) {
      return new Logger('MongoClient', { loggerLevel: value as LoggerLevelId });
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
    default: true,
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
        level: level as ReadConcernLevelId
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
          value as ReadPreferenceModeId,
          options.readPreference?.tags,
          rpOpts
        );
      }
    }
  },
  readPreferenceTags: {
    target: 'readPreference',
    transform({ values, options }) {
      const readPreferenceTags = [];
      for (const tag of values) {
        const readPreferenceTag: TagSet = Object.create(null);
        if (typeof tag === 'string') {
          for (const [k, v] of Object.entries(toRecord(tag))) {
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
  } as OptionDescriptor,
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
    .filter(([, descriptor]) => typeof descriptor.default !== 'undefined')
    .map(([k, d]) => [k, d.default])
);
