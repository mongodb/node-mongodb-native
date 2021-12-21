'use strict';
const ConnectionString = require('mongodb-connection-string-url').default;
const url = require('url');
const qs = require('querystring');
const { expect } = require('chai');

const { MongoClient } = require('../../../src/mongo_client');
const { Topology } = require('../../../src/sdam/topology');
const { TopologyType } = require('../../../src/sdam/common');
const { HostAddress } = require('../../../src/utils');
const { getEnvironmentalOptions } = require('../utils');

/**
 * @typedef {Object} UrlOptions
 * @property {string} [db] - dbName to put in the path section override
 * @property {string} [replicaSet] - replicaSet name override
 * @property {string} [username] - Username for auth section
 * @property {string} [password] - Password for auth section
 * @property {string} [authMechanism] - Authmechanism name
 * @property {Record<string, any>} [authMechanismProperties] - additional options for auth mechanism
 * @property {string} [authSource] - authSource override in searchParams of URI
 * @property {boolean} [useMultipleMongoses] - if set will use concatenate all known HostAddresses in URI
 */

/**
 * @param {Record<string, any>} obj
 */
function convertToConnStringMap(obj) {
  let result = [];
  Object.keys(obj).forEach(key => {
    result.push(`${key}:${obj[key]}`);
  });

  return result.join(',');
}

class TestConfiguration {
  constructor(uri, context) {
    const url = new ConnectionString(uri);
    const { hosts } = url;
    const hostAddresses = hosts.map(HostAddress.fromString);
    this.version = context.version;
    this.clientSideEncryption = context.clientSideEncryption;
    this.parameters = undefined;
    this.singleMongosLoadBalancerUri = context.singleMongosLoadBalancerUri;
    this.multiMongosLoadBalancerUri = context.multiMongosLoadBalancerUri;
    this.isServerless = !!process.env.SERVERLESS;
    this.topologyType = this.isLoadBalanced ? TopologyType.LoadBalanced : context.topologyType;
    this.options = {
      hosts,
      hostAddresses,
      hostAddress: hostAddresses[0],
      host: hostAddresses[0].host,
      port: typeof hostAddresses[0].host === 'string' ? hostAddresses[0].port : undefined,
      db: url.pathname.slice(1) ? url.pathname.slice(1) : 'integration_tests',
      replicaSet: url.searchParams.get('replicaSet'),
      proxyURIParams: url.searchParams.get('proxyHost')
        ? {
            proxyHost: url.searchParams.get('proxyHost'),
            proxyPort: url.searchParams.get('proxyPort'),
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
    if (context.serverlessCredentials) {
      const { username, password } = context.serverlessCredentials;
      this.options.auth = { username, password, authSource: 'admin' };
    }
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

  get mongo() {
    throw new TypeError('fix this!');
  }

  get require() {
    throw new TypeError('fix this!');
  }

  newClient(dbOptions, serverOptions) {
    serverOptions = Object.assign(
      { minHeartbeatFrequencyMS: 100 },
      getEnvironmentalOptions(),
      serverOptions
    );

    // support MongoClient constructor form (url, options) for `newClient`
    if (typeof dbOptions === 'string') {
      return new MongoClient(dbOptions, serverOptions);
    }

    dbOptions = dbOptions || {};
    // Fall back
    let dbHost = (serverOptions && serverOptions.host) || this.options.host;
    const dbPort = (serverOptions && serverOptions.port) || this.options.port;
    if (dbHost.indexOf('.sock') !== -1) {
      dbHost = qs.escape(dbHost);
    }

    if (this.options.authMechanism) {
      Object.assign(dbOptions, {
        authMechanism: this.options.authMechanism
      });
    }

    if (this.options.authMechanismProperties) {
      Object.assign(dbOptions, {
        authMechanismProperties: convertToConnStringMap(this.options.authMechanismProperties)
      });
    }

    if (this.options.replicaSet) {
      Object.assign(dbOptions, { replicaSet: this.options.replicaSet });
    }

    if (this.options.proxyURIParams) {
      for (const [name, value] of Object.entries(this.options.proxyURIParams)) {
        if (value) {
          dbOptions[name] = value;
        }
      }
    }

    // Flatten any options nested under `writeConcern` before we make the connection string
    if (dbOptions.writeConcern) {
      Object.assign(dbOptions, dbOptions.writeConcern);
      delete dbOptions.writeConcern;
    }

    if (this.topologyType === TopologyType.LoadBalanced) {
      dbOptions.loadBalanced = true;
    }

    const urlOptions = {
      protocol: 'mongodb',
      slashes: true,
      hostname: dbHost,
      port: dbPort,
      query: dbOptions,
      pathname: '/'
    };

    if (this.options.auth) {
      const { username, password } = this.options.auth;
      if (username) {
        urlOptions.auth = `${encodeURIComponent(username)}:${encodeURIComponent(password)}`;
      }
    }

    if (dbOptions.auth) {
      const { username, password } = dbOptions.auth;
      if (username) {
        urlOptions.auth = `${encodeURIComponent(username)}:${encodeURIComponent(password)}`;
      }
      delete urlOptions.query.auth;
    }

    const connectionString = url.format(urlOptions);
    if (Reflect.has(serverOptions, 'host') || Reflect.has(serverOptions, 'port')) {
      throw new Error(`Cannot use options to specify host/port, must be in ${connectionString}`);
    }

    return new MongoClient(connectionString, serverOptions);
  }

  newTopology(host, port, options) {
    if (typeof host === 'object') {
      options = host;
      host = null;
      port = null;
    }

    options = Object.assign({}, options);
    const hosts =
      host == null ? [].concat(this.options.hostAddresses) : [new HostAddress(`${host}:${port}`)];
    return new Topology(hosts, options);
  }

  /**
   * Construct a connection URL using nodejs's whatwg URL similar to how connection_string.ts
   * works
   *
   * @param {UrlOptions} [options] - overrides and settings for URI generation
   */
  url(options) {
    options = {
      db: this.options.db,
      replicaSet: this.options.replicaSet,
      proxyURIParams: this.options.proxyURIParams,
      ...options
    };

    const FILLER_HOST = 'fillerHost';

    const url = new URL(`mongodb://${FILLER_HOST}`);

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

    if (options.username) url.username = options.username;
    if (options.password) url.password = options.password;

    if (this.isLoadBalanced) {
      url.searchParams.append('loadBalanced', true);
    }

    if (options.username || options.password) {
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
    } else if (this.isServerless) {
      url.searchParams.append('ssl', true);
      url.searchParams.append('authSource', 'admin');
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

    const connectionString = url.toString().replace(FILLER_HOST, actualHostsString);

    return connectionString;
  }

  writeConcernMax() {
    if (this.topologyType !== TopologyType.Single) {
      return { writeConcern: { w: 'majority', wtimeoutMS: 30000 } };
    }

    return { writeConcern: { w: 1 } };
  }

  // Accessors and methods Client-Side Encryption
  get mongodbClientEncryption() {
    return this.clientSideEncryption && this.clientSideEncryption.mongodbClientEncryption;
  }

  kmsProviders(type, localKey) {
    const kmsProviders = {};
    if (typeof type !== 'string' || type === 'aws') {
      kmsProviders.aws = {
        accessKeyId: this.clientSideEncryption.AWS_ACCESS_KEY_ID,
        secretAccessKey: this.clientSideEncryption.AWS_SECRET_ACCESS_KEY
      };
    }
    if (typeof type !== 'string' || type === 'local') {
      kmsProviders.local = {
        key: localKey
      };
    }
    return kmsProviders;
  }
}

module.exports = { TestConfiguration };
