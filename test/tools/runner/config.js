'use strict';
const url = require('url');
const qs = require('querystring');
const util = require('util');

const { MongoClient } = require('../../../src/mongo_client');
const { Topology } = require('../../../src/sdam/topology');
const { TopologyType } = require('../../../src/sdam/common');
const { parseURI } = require('../../../src/connection_string');
const { HostAddress } = require('../../../src/utils');

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
    const { url, hosts } = parseURI(uri);
    const hostAddresses = hosts.map(HostAddress.fromString);
    this.topologyType = context.topologyType;
    this.version = context.version;
    this.clientSideEncryption = context.clientSideEncryption;
    this.options = {
      hosts,
      hostAddresses,
      hostAddress: hostAddresses[0],
      host: hostAddresses[0].host,
      port: typeof hostAddresses[0].host === 'string' ? hostAddresses[0].port : undefined,
      db: url.pathname.slice(1) ? url.pathname.slice(1) : 'integration_tests',
      replicaSet: url.searchParams.get('replicaSet')
    };
    if (url.username) {
      this.options.auth = {
        username: url.username,
        password: url.password
      };
    }
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
    // support MongoClient constructor form (url, options) for `newClient`
    if (typeof dbOptions === 'string') {
      return new MongoClient(
        dbOptions,
        Object.assign({ minHeartbeatFrequencyMS: 100 }, serverOptions)
      );
    }

    dbOptions = dbOptions || {};
    serverOptions = Object.assign({}, { minHeartbeatFrequencyMS: 100 }, serverOptions);

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

    // Flatten any options nested under `writeConcern` before we make the connection string
    if (dbOptions.writeConcern) {
      Object.assign(dbOptions, dbOptions.writeConcern);
      delete dbOptions.writeConcern;
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

  url(username, password, options) {
    options = options || {};

    const query = {};
    if (this.options.replicaSet) {
      Object.assign(query, { replicaSet: this.options.replicaSet });
    }

    let multipleHosts;
    if (this.options.hosts.length > 1) {
      // NOTE: The only way to force a sharded topology with the driver is to duplicate
      //       the host entry. This will eventually be solved by autodetection.
      if (this.topologyType === TopologyType.Sharded) {
        const firstHost = this.options.hostAddresses[0];
        multipleHosts = `${firstHost.host}:${firstHost.port}`;
      } else {
        multipleHosts = this.options.hostAddresses
          .reduce((built, host) => {
            built.push(typeof host.port === 'number' ? `${host.host}:${host.port}` : host.host);
            return built;
          }, [])
          .join(',');
      }
    }

    /** @type {Record<string, any>} */
    const urlObject = {
      protocol: 'mongodb',
      slashes: true,
      pathname: `/${this.options.db}`,
      query
    };

    if (multipleHosts) {
      Object.assign(urlObject, { hostname: '%s' });
    } else {
      Object.assign(urlObject, {
        hostname: this.options.host,
        port: this.options.port
      });
    }

    if (username || password) {
      urlObject.auth = password == null ? username : `${username}:${password}`;

      if (options.authMechanism || this.options.authMechanism) {
        Object.assign(query, {
          authMechanism: options.authMechanism || this.options.authMechanism
        });
      }

      if (options.authMechanismProperties || this.options.authMechanismProperties) {
        Object.assign(query, {
          authMechanismProperties: convertToConnStringMap(
            options.authMechanismProperties || this.options.authMechanismProperties
          )
        });
      }

      if (options.authSource) {
        query.authSource = options.authSource;
      }
    }

    if (multipleHosts) {
      return util.format(url.format(urlObject), multipleHosts);
    }

    return url.format(urlObject);
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
