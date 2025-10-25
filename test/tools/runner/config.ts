import * as util from 'node:util';
import * as types from 'node:util/types';

import { expect } from 'chai';
import { type Context } from 'mocha';
import ConnectionString from 'mongodb-connection-string-url';
import * as qs from 'querystring';
import * as url from 'url';

import { type CompressorName } from '../../../src/cmap/wire_protocol/compression';
import {
  type AuthMechanism,
  Double,
  HostAddress,
  Long,
  MongoClient,
  type MongoClientOptions,
  ObjectId,
  type ServerApi,
  TopologyType,
  type WriteConcernSettings
} from '../../mongodb';
import { getEnvironmentalOptions } from '../utils';
import { type Filter } from './filters/filter';
import { flakyTests } from './flaky';

interface ProxyParams {
  proxyHost?: string;
  proxyPort?: number;
  proxyUsername?: string;
  proxyPassword?: string;
}

interface UrlOptions {
  /** name of the default db */
  db?: string;
  /** replSet name */
  replicaSet?: string;
  /** Username to authenticate with */
  username?: string;
  /** Password to authenticate with */
  password?: string;
  /** Name of the auth mechanism to use */
  authMechanism?: AuthMechanism;
  /** Additional properties used by the mechanism */
  authMechanismProperties?: Record<string, any>;
  /** The database to specify as the authentication source */
  authSource?: string;
  /** If set will use concatenate all known HostAddresses in URI */
  useMultipleMongoses?: boolean;
  /** Parameters for configuring a proxy connection */
  proxyURIParams?: ProxyParams;
  /** Host overwriting the one provided in the url. */
  host?: string;
  /** Port overwriting the one provided in the url. */
  port?: number;
}

function convertToConnStringMap(obj: Record<string, any>) {
  const result = [];
  Object.keys(obj).forEach(key => {
    result.push(`${key}:${obj[key]}`);
  });

  return result.join(',');
}

function getCompressor(compressor: string | undefined): CompressorName {
  if (!compressor) return null;

  switch (compressor) {
    case 'zstd':
      return 'zstd';
    case 'zlib':
      return 'zlib';
    case 'snappy':
      return 'snappy';
    default:
      throw new Error('unsupported test runner compressor, would default to no compression');
  }
}

export class TestConfiguration {
  version: string;
  clientSideEncryption: {
    enabled: boolean;
    mongodbClientEncryption: any;
    version: string;
    libmongocrypt: string | null;
  };
  cryptSharedVersion: MongoClient['autoEncrypter']['cryptSharedLibVersionInfo'] | null;
  parameters: Record<string, any>;
  singleMongosLoadBalancerUri: string;
  multiMongosLoadBalancerUri: string;
  topologyType: TopologyType;
  buildInfo: Record<string, any>;
  options: {
    hosts?: string[];
    hostAddresses: HostAddress[];
    hostAddress?: HostAddress;
    host?: string;
    port?: number;
    db?: string;
    replicaSet?: string;
    authMechanism?: string;
    authMechanismProperties?: Record<string, any>;
    auth?: { username: string; password: string; authSource?: string };
    proxyURIParams?: ProxyParams;
  };
  serverApi?: ServerApi;
  activeResources: number;
  isSrv: boolean;
  filters: Record<string, Filter>;
  compressor: CompressorName | null;

  constructor(
    private uri: string,
    private context: Record<string, any>
  ) {
    const url = new ConnectionString(uri);
    const { hosts } = url;
    const hostAddresses = hosts.map(HostAddress.fromString);
    this.version = context.version;
    this.clientSideEncryption = context.clientSideEncryption;
    this.cryptSharedVersion = context.cryptShared;
    this.parameters = { ...context.parameters };
    this.singleMongosLoadBalancerUri = context.singleMongosLoadBalancerUri;
    this.multiMongosLoadBalancerUri = context.multiMongosLoadBalancerUri;
    this.topologyType = this.isLoadBalanced ? TopologyType.LoadBalanced : context.topologyType;
    this.buildInfo = context.buildInfo;
    this.serverApi = context.serverApi;
    this.isSrv = uri.indexOf('mongodb+srv') > -1;
    this.compressor = getCompressor(process.env.COMPRESSOR);
    this.options = {
      hosts,
      hostAddresses,
      hostAddress: hostAddresses[0],
      host: hostAddresses[0].host,
      port: typeof hostAddresses[0].host === 'string' && hostAddresses[0].port,
      db: url.pathname.slice(1) ? url.pathname.slice(1) : 'integration_tests',
      replicaSet: url.searchParams.get('replicaSet'),
      proxyURIParams: url.searchParams.get('proxyHost')
        ? {
            proxyHost: url.searchParams.get('proxyHost'),
            proxyPort: Number(url.searchParams.get('proxyPort')),
            proxyUsername: url.searchParams.get('proxyUsername'),
            proxyPassword: url.searchParams.get('proxyPassword')
          }
        : undefined
    };
    if (url.username) {
      this.options.auth = {
        username: url.username,
        password: url.password
      };
    }

    this.filters = Object.fromEntries(
      context.filters.map(filter => [filter.constructor.name, filter])
    );
  }

  get isLoadBalanced() {
    return !!this.singleMongosLoadBalancerUri && !!this.multiMongosLoadBalancerUri;
  }

  writeConcern() {
    return { writeConcern: { w: 1 } };
  }

  get host() {
    return this.options.host;
  }

  get port() {
    return this.options.port;
  }

  set db(_db) {
    this.options.db = _db;
  }

  get db() {
    return this.options.db;
  }

  // legacy accessors, consider for removal
  get replicasetName() {
    return this.options.replicaSet;
  }

  get setName() {
    return this.options.replicaSet;
  }

  /**
   * Returns a `hello`, executed against `uri`.
   */
  async hello(uri = this.uri) {
    const client = this.newClient(uri);
    try {
      await client.connect();
      const { maxBsonObjectSize, maxMessageSizeBytes, maxWriteBatchSize, ...rest } = await client
        .db('admin')
        .command({ hello: 1 });
      return {
        maxBsonObjectSize,
        maxMessageSizeBytes,
        maxWriteBatchSize,
        ...rest
      };
    } finally {
      await client.close();
    }
  }

  isOIDC(uri: string, env: string): boolean {
    if (!uri) return false;
    return uri.indexOf('MONGODB-OIDC') > -1 && uri.indexOf(`ENVIRONMENT:${env}`) > -1;
  }

  newClient(urlOrQueryOptions?: string | Record<string, any>, serverOptions?: MongoClientOptions) {
    const baseOptions: MongoClientOptions = this.compressor
      ? {
          compressors: this.compressor
        }
      : {};

    serverOptions = Object.assign(baseOptions, getEnvironmentalOptions(), serverOptions);

    if (this.loggingEnabled && !Object.hasOwn(serverOptions, 'mongodbLogPath')) {
      serverOptions = this.setupLogging(serverOptions);
    }

    // Support MongoClient constructor form (url, options) for `newClient`.
    if (typeof urlOrQueryOptions === 'string') {
      if (Reflect.has(serverOptions, 'host') || Reflect.has(serverOptions, 'port')) {
        throw new Error(`Cannot use options to specify host/port, must be in ${urlOrQueryOptions}`);
      }

      return new MongoClient(urlOrQueryOptions, serverOptions);
    }

    const queryOptions = urlOrQueryOptions || {};

    // Fall back.
    let dbHost = queryOptions.host || this.options.host;
    if (dbHost.indexOf('.sock') !== -1) {
      dbHost = qs.escape(dbHost);
    }
    delete queryOptions.host;
    const dbPort = queryOptions.port || this.options.port;
    delete queryOptions.port;

    if (this.options.authMechanism && !serverOptions.authMechanism) {
      Object.assign(queryOptions, {
        authMechanism: this.options.authMechanism
      });
    }

    if (this.options.authMechanismProperties && !serverOptions.authMechanismProperties) {
      Object.assign(queryOptions, {
        authMechanismProperties: convertToConnStringMap(this.options.authMechanismProperties)
      });
    }

    if (this.options.replicaSet && !serverOptions.replicaSet) {
      Object.assign(queryOptions, { replicaSet: this.options.replicaSet });
    }

    if (this.options.proxyURIParams) {
      for (const [name, value] of Object.entries(this.options.proxyURIParams)) {
        if (value) {
          queryOptions[name] = value;
        }
      }
    }

    // Flatten any options nested under `writeConcern` before we make the connection string.
    if (queryOptions.writeConcern && !serverOptions.writeConcern) {
      Object.assign(queryOptions, queryOptions.writeConcern);
      delete queryOptions.writeConcern;
    }

    if (this.topologyType === TopologyType.LoadBalanced) {
      queryOptions.loadBalanced = true;
    }

    const urlOptions: url.UrlObject = {
      protocol: 'mongodb',
      slashes: true,
      hostname: dbHost,
      port: dbPort,
      query: queryOptions,
      pathname: '/'
    };

    if (this.options.auth && !serverOptions.auth) {
      const { username, password } = this.options.auth;
      if (username) {
        urlOptions.auth = `${encodeURIComponent(username)}:${encodeURIComponent(password)}`;
      }
    }

    if (queryOptions.auth) {
      const { username, password } = queryOptions.auth;
      if (username) {
        urlOptions.auth = `${encodeURIComponent(username)}:${encodeURIComponent(password)}`;
      }
    }

    if (typeof urlOptions.query === 'object') {
      // Auth goes at the top of the uri, not in the searchParams.
      delete urlOptions.query?.auth;
    }

    const connectionString = url.format(urlOptions);

    return new MongoClient(connectionString, serverOptions);
  }

  /**
   * Construct a connection URL using nodejs's whatwg URL similar to how connection_string.ts
   * works
   *
   * @param options - overrides and settings for URI generation
   */
  url(
    options?: UrlOptions & {
      useMultipleMongoses?: boolean;
      db?: string;
      replicaSet?: string;
      proxyURIParams?: ProxyParams;
      username?: string;
      password?: string;
      auth?: {
        username?: string;
        password?: string;
      };
      authSource?: string;
      authMechanism?: string;
      authMechanismProperties?: Record<string, any>;
    }
  ) {
    options = {
      db: this.options.db,
      replicaSet: this.options.replicaSet,
      proxyURIParams: this.options.proxyURIParams,
      ...options
    };

    const FILLER_HOST = 'fillerHost';

    const protocol = 'mongodb';
    const url = new URL(`${protocol}://${FILLER_HOST}`);

    if (options.replicaSet) {
      url.searchParams.append('replicaSet', options.replicaSet);
    }

    if (options.proxyURIParams) {
      for (const [name, value] of Object.entries(options.proxyURIParams)) {
        if (value) {
          url.searchParams.append(name, value);
        }
      }
    }

    url.pathname = `/${options.db}`;

    const username = options.username || this.options.auth?.username;
    const password = options.password || this.options.auth?.password;

    if (username) {
      url.username = username;
    }

    if (password) {
      url.password = password;
    }

    if (this.isLoadBalanced) {
      url.searchParams.append('loadBalanced', 'true');
    }

    if (username || password) {
      if (options.authMechanism) {
        url.searchParams.append('authMechanism', options.authMechanism);
      }

      if (options.authMechanismProperties) {
        url.searchParams.append(
          'authMechanismProperties',
          convertToConnStringMap(options.authMechanismProperties)
        );
      }

      if (options.authSource) {
        url.searchParams.append('authSource', options.authSource);
      }
    }

    let actualHostsString;
    if (options.useMultipleMongoses) {
      if (this.isLoadBalanced) {
        const multiUri = new ConnectionString(this.multiMongosLoadBalancerUri);
        if (multiUri.isSRV) {
          throw new Error('You cannot pass an SRV connection string to multiMongosLoadBalancerUri');
        }
        actualHostsString = multiUri.hosts[0].toString();
      } else {
        expect(this.options.hostAddresses).to.have.length.greaterThan(1);
        actualHostsString = this.options.hostAddresses.map(ha => ha.toString()).join(',');
      }
    } else {
      if (this.isLoadBalanced) {
        const singleUri = new ConnectionString(this.singleMongosLoadBalancerUri);
        actualHostsString = singleUri.hosts[0].toString();
      } else {
        actualHostsString = this.options.hostAddresses[0].toString();
      }
    }

    if (!options.authSource) {
      url.searchParams.append('authSource', 'admin');
    }

    this.compressor && url.searchParams.append('compressors', this.compressor);

    // Secrets setup for OIDC always sets the workload URI as MONGODB_URI_SINGLE.
    if (process.env.MONGODB_URI_SINGLE?.includes('MONGODB-OIDC')) {
      return process.env.MONGODB_URI_SINGLE;
    }

    const connectionString = url.toString().replace(FILLER_HOST, actualHostsString);

    return connectionString;
  }

  writeConcernMax(): { writeConcern: WriteConcernSettings } {
    if (this.topologyType !== TopologyType.Single) {
      return { writeConcern: { w: 'majority', wtimeoutMS: 30000 } };
    }

    return { writeConcern: { w: 1 } };
  }

  kmsProviders(localKey): Record<string, any> {
    return { local: { key: localKey } };
  }

  makeAtlasTestConfiguration(): AtlasTestConfiguration {
    return new AtlasTestConfiguration(this.uri, this.context);
  }

  loggingEnabled = false;
  logs = [];
  /**
   * Known flaky tests that we want to turn on logging for
   * so that we can get a better idea of what is failing when it fails
   */
  testsToEnableLogging = flakyTests;

  setupLogging(options: MongoClientOptions, id?: string) {
    id ??= new ObjectId().toString();
    this.logs = [];
    const write = log => this.logs.push({ t: log.t, id, ...log });
    options.mongodbLogPath = { write };
    options.mongodbLogComponentSeverities = { default: 'trace' };
    options.mongodbLogMaxDocumentLength = 300;
    return options;
  }

  beforeEachLogging(ctx: Context) {
    this.loggingEnabled = this.testsToEnableLogging.includes(ctx.currentTest.fullTitle());
  }

  afterEachLogging(ctx: Context) {
    if (this.loggingEnabled && ctx.currentTest.state === 'failed') {
      for (const log of this.logs) {
        console.error(
          JSON.stringify(
            log,
            function (_, value) {
              if (types.isMap(value)) return { Map: Array.from(value.entries()) };
              if (types.isSet(value)) return { Set: Array.from(value.values()) };
              if (types.isNativeError(value)) return { [value.name]: util.inspect(value) };
              if (typeof value === 'bigint') return { bigint: new Long(value).toExtendedJSON() };
              if (typeof value === 'symbol') return `Symbol(${value.description})`;
              if (typeof value === 'number') {
                if (Number.isNaN(value) || !Number.isFinite(value) || Object.is(value, -0))
                  // @ts-expect-error: toExtendedJSON internal on double but not on long
                  return { number: new Double(value).toExtendedJSON() };
              }
              if (Buffer.isBuffer(value))
                return { [value.constructor.name]: Buffer.prototype.base64Slice.call(value) };
              if (value === undefined) return { undefined: 'key was set but equal to undefined' };
              return value;
            },
            0
          )
        );
      }
    }
    this.loggingEnabled = false;
    this.logs = [];
  }
}

/**
 * A specialized configuration used to connect to Atlas for testing.
 *
 * This class requires that the Atlas srv URI is set as the `MONGODB_URI` in the environment.
 */
export class AtlasTestConfiguration extends TestConfiguration {
  override newClient(): MongoClient {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return new MongoClient(process.env.MONGODB_URI!);
  }

  override url(): string {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return process.env.MONGODB_URI!;
  }
}

/**
 * Test configuration specific to Astrolabe testing.
 */
export class AstrolabeTestConfiguration extends TestConfiguration {
  override newClient(): MongoClient {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return new MongoClient(process.env.DRIVERS_ATLAS_TESTING_URI!);
  }

  override url(): string {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return process.env.DRIVERS_ATLAS_TESTING_URI!;
  }
}

export class AlpineTestConfiguration extends TestConfiguration {
  get encryptDefaultExtraOptions(): MongoClientOptions['autoEncryption']['extraOptions'] {
    return {
      mongocryptdBypassSpawn: true,
      mongocryptdURI: process.env.MONGOCRYPTD_URI
    };
  }
  override newClient(
    urlOrQueryOptions?: string | Record<string, any>,
    serverOptions?: MongoClientOptions
  ): MongoClient {
    const options = serverOptions ?? {};

    if (options.autoEncryption) {
      const extraOptions: MongoClientOptions['autoEncryption']['extraOptions'] = {
        ...options.autoEncryption.extraOptions,
        ...this.encryptDefaultExtraOptions
      };
      options.autoEncryption.extraOptions = extraOptions;
    }

    return super.newClient(urlOrQueryOptions, options);
  }
}
