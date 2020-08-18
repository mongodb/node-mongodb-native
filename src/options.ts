import type { MongoClientOptions } from './mongo_client';
import * as URL from 'url';
import * as QS from 'querystring';
import { ReadPreference } from './read_preference';

enum URIType {
  boolean,
  number,
  string,
  stringArray
}

const DEFAULT_CLIENT_OPTIONS: MongoClientOptions = {
  tls: false,
  ssl: false,
  tlsAllowInvalidCertificates: false,
  tlsAllowInvalidHostnames: false,
  tlsInsecure: false,
  connectTimeoutMS: 10000,
  socketTimeoutMS: 360000,
  compressors: [],
  zlibCompressionLevel: 0,
  maxPoolSize: 5,
  minPoolSize: 0,
  w: 1,
  readConcernLevel: 'local',
  readPreference: ReadPreference.primary,
  authMechanism: 'DEFAULT',
  retryWrites: true,
  directConnection: true,
  poolSize: 5,
  sslValidate: false,
  autoReconnect: true,
  auto_reconnect: true,
  noDelay: true,
  keepAlive: true,
  keepAliveInitialDelay: 30000,
  family: null,
  reconnectTries: 30,
  reconnectInterval: 1000,
  ha: true,
  haInterval: 10000,
  secondaryAcceptableLatencyMS: 15,
  acceptableLatencyMS: 15,
  connectWithNoPrimary: false,
  forceServerObjectId: false,
  serializeFunctions: false,
  ignoreUndefined: false,
  raw: false,
  bufferMaxEntries: -1,
  pkFactory: undefined,
  promiseLibrary: undefined,
  loggerLevel: 'error',
  logger: undefined,
  promoteValues: true,
  promoteBuffers: false,
  promoteLongs: true,
  domainsEnabled: false,
  validateOptions: false,
  fsync: false,
  numberOfRetries: 5,
  monitorCommands: false,
  useNewUrlParser: true,
  useUnifiedTopology: false,
  autoEncryption: undefined,
  readConcern: { level: 'local' },
  writeConcern: { w: 1 }
};

const MongoURIOptions = {
  replicaSet: URIType.string,
  tls: URIType.boolean,
  ssl: URIType.boolean,
  tlsCertificateKeyFile: URIType.string,
  tlsCertificateKeyFilePassword: URIType.string,
  tlsCAFile: URIType.string,
  tlsAllowInvalidCertificates: URIType.boolean,
  tlsAllowInvalidHostnames: URIType.boolean,
  tlsInsecure: URIType.boolean,
  connectTimeoutMS: URIType.number,
  socketTimeoutMS: URIType.number,
  compressors: URIType.stringArray,
  zlibCompressionLevel: URIType.number,
  maxPoolSize: URIType.number,
  minPoolSize: URIType.number,
  maxIdleTimeMS: URIType.number,
  waitQueueMultiple: URIType.number,
  waitQueueTimeoutMS: URIType.number,
  readConcernLevel: URIType.string,
  readPreference: URIType.string,
  maxStalenessSeconds: URIType.number,
  readPreferenceTags: URIType.stringArray,
  authSource: URIType.string,
  authMechanism: URIType.string,
  authMechanismProperties: {
    SERVICE_NAME: URIType.string,
    CANONICALIZE_HOST_NAME: URIType.boolean,
    SERVICE_REALM: URIType.string,
    AWS_SESSION_TOKEN: URIType.string
  },
  gssapiServiceName: URIType.string,
  localThresholdMS: URIType.number,
  serverSelectionTimeoutMS: URIType.number,
  serverSelectionTryOnce: URIType.boolean,
  heartbeatFrequencyMS: URIType.number,
  appName: URIType.string,
  retryReads: URIType.boolean,
  retryWrites: URIType.boolean,
  directConnection: URIType.boolean,
  // write concern options
  w: URIType.boolean,
  wtimeoutMS: URIType.number,
  j: URIType.boolean,
  fsync: URIType.boolean
} as const;

type URIObject = { [key: string]: URIType | URIObject };

type StringObject = { [key: string]: any };
type URIValue<T> = T extends URIType.string
  ? string
  : T extends URIType.number
  ? number
  : T extends URIType.boolean
  ? boolean
  : T extends URIType.stringArray
  ? string[]
  : T extends object
  ? Partial<{ [K in keyof T]: URIValue<T[K]> }>
  : never;

type Lookup = { [key: string]: { normalized: string; type: URIType | Lookup } };

type ObjectKeys<T> = T extends object
  ? (keyof T)[]
  : T extends number
  ? []
  : T extends Array<any> | string
  ? string[]
  : never;

function ObjectKeys<T>(o: T): ObjectKeys<T> {
  return Object.keys(o) as ObjectKeys<T>;
}

/**
 * Transforms query string object types from MongoURIOptions lookup, this does not validate the options.
 */
function typeURIOptions(input: QS.ParsedUrlQuery): URIValue<typeof MongoURIOptions> {
  function lookupRecursive(obj: URIObject): Lookup {
    const keys = ObjectKeys(obj);
    return keys.reduce((types, normalized) => {
      let type: URIType | URIObject | Lookup = obj[normalized];
      const keyLower = normalized.toString().toLowerCase();
      if (typeof type === 'object') {
        type = lookupRecursive(type);
      }
      return { ...types, [keyLower]: { normalized, type } };
    }, {});
  }

  const lookup = lookupRecursive(MongoURIOptions);

  const options = Object.keys(input).reduce((options, key) => {
    const keyLower = key.toLowerCase();
    let value = input[key];
    const ref = lookup[keyLower];
    if (!ref) {
      console.warn(`unknown property ${key}`);
      return options;
    }
    const { type, normalized } = ref;
    let currentValue = options[normalized as keyof typeof MongoURIOptions];
    let results;

    function recursive(
      normalized: string,
      value: string | string[] | undefined,
      type: URIType | Lookup
    ): URIValue<typeof MongoURIOptions> {
      const match = (t: URIType) => type === t;
      if (!value) return options;
      if (match(URIType.string)) {
        if (Array.isArray(value)) value = value[value.length - 1];
        return { ...options, [normalized]: value };
      } else if (match(URIType.boolean)) {
        if (Array.isArray(value)) value = value[value.length - 1];
        if (value === 'true') return { ...options, [normalized]: true };
        if (value === 'false') return { ...options, [normalized]: false };
        console.warn(`${key} is not a valid boolean`);
        return options;
      } else if (match(URIType.number)) {
        if (Array.isArray(value)) value = value[value.length - 1];
        const result = parseInt(value, 10);
        if (typeof result === 'number' && !Number.isNaN(result)) {
          return { ...options, [normalized]: result };
        }
        return options;
      } else if (match(URIType.stringArray)) {
        if (!Array.isArray(value)) value = [value];
        value = value.reduce((total: string[], item) => {
          return [...total, ...item.split(',')];
        }, []);
        const arrayValue = Array.isArray(currentValue) ? currentValue : [];
        results = [...arrayValue, ...value];
        if (results.length) return { ...options, [normalized]: results };
        return options;
      } else {
        if (typeof type !== 'object') return options;
        const objectType = type;
        if (Array.isArray(value)) value = value[value.length - 1];
        const items = value.split(',');
        results = items.reduce((obj: StringObject, item: string) => {
          const split = item.split(':');
          if (split.length === 2) {
            const [key, value] = split;
            const lookupKey = key.toLowerCase();
            if (!objectType[lookupKey]) return obj;
            const { type } = objectType[lookupKey];
            return { ...obj, ...recursive(key, value, type) };
          }
          console.warn(`${key} is malformed`);
          return obj;
        }, {});
        return { ...options, [normalized]: results };
      }
    }

    return recursive(normalized, value, type);
  }, {} as URIValue<typeof MongoURIOptions>);

  return options;
}

function mergeOptions(
  uriOptions: URIValue<typeof MongoURIOptions>,
  clientOptions?: MongoClientOptions
) {
  const base = {
    ...DEFAULT_CLIENT_OPTIONS,
    ...uriOptions,
    ...clientOptions
  };
  return {
    ...base,
    ssl: base.ssl ?? base?.ssl,
    tls: base.tls ?? base?.tls,
    j: base.journal ?? base?.j,
    journal: base.journal ?? base?.j,
    auto_reconnect: base.auto_reconnect ?? base?.autoReconnect,
    autoReconnect: base.auto_reconnect ?? base?.autoReconnect,
    appname: base.appname ?? base.appName,
    appName: base.appname ?? base.appName,
    poolSize: base.poolSize ?? base.maxPoolSize,
    maxPoolSize: base.poolSize ?? base.maxPoolSize,
    authMechanismProperties: {
      ...uriOptions.authMechanismProperties,
      ...clientOptions?.authMechanismProperties
    },
    readPreferenceTags: [
      ...(uriOptions.readPreferenceTags || []),
      ...(clientOptions?.readPreferenceTags || [])
    ],
    compressors: [...(uriOptions.compressors || []), ...(clientOptions?.compressors || [])]
  };
}

function typeURI(uri: string, clientOptions?: MongoClientOptions) {
  const options = URL.parse(uri);
  const query = options.query ? QS.parse(options.query) : {};
  const uriOptions = typeURIOptions(query);
  return mergeOptions(uriOptions, clientOptions);
}

console.log(typeURI('localhost/?rEpLiCaSeT=helloWorld')); // { replicaSet: 'helloWorld' }
console.log(typeURI('localhost/?j=helloWorld').journal); // undefined
console.log(typeURI('localhost/?j=true').journal); // true
console.log(typeURI('localhost/?j=true', { journal: false }).j); // false
console.log(typeURI('localhost/?authMechanismProperties=SERVICE_NAME:name'));
