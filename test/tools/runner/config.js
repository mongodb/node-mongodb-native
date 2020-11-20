'use strict';
const url = require('url');
const qs = require('querystring');
const util = require('util');

const { MongoClient } = require('../../../src/mongo_client');
const { Topology } = require('../../../src/sdam/topology');
const { TopologyType } = require('../../../src/sdam/common');

function convertToConnStringMap(obj) {
  let result = [];
  Object.keys(obj).forEach(key => {
    result.push(`${key}:${obj[key]}`);
  });

  return result.join(',');
}

class NativeConfiguration {
  constructor(parsedURI, context) {
    this.topologyType = context.topologyType;
    this.version = context.version;
    this.clientSideEncryption = context.clientSideEncryption;
    this.options = Object.assign(
      {
        auth: parsedURI.auth,
        hosts: parsedURI.hosts,
        host: parsedURI.hosts[0] ? parsedURI.hosts[0].host : 'localhost',
        port: parsedURI.hosts[0] ? parsedURI.hosts[0].port : 27017,
        db: parsedURI.auth && parsedURI.auth.db ? parsedURI.auth.db : 'integration_tests'
      },
      parsedURI.options
    );

    this.writeConcern = function () {
      return { writeConcern: { w: 1 } };
    };
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
      let auth = this.options.auth.username;
      if (this.options.auth.password) {
        auth = `${auth}:${this.options.auth.password}`;
      }

      urlOptions.auth = auth;
    }

    // TODO(NODE-2704): Uncomment this, unix socket related issues
    // Reflect.deleteProperty(serverOptions, 'host');
    // Reflect.deleteProperty(serverOptions, 'port');
    const connectionString = url.format(urlOptions);
    return new MongoClient(connectionString, serverOptions);
  }

  newTopology(host, port, options) {
    if (typeof host === 'object') {
      options = host;
      host = null;
      port = null;
    }

    options = Object.assign({}, options);
    const hosts = host == null ? [].concat(this.options.hosts) : [{ host, port }];
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
        const firstHost = this.options.hosts[0];
        multipleHosts = `${firstHost.host}:${firstHost.port},${firstHost.host}:${firstHost.port}`;
      } else {
        multipleHosts = this.options.hosts
          .reduce((built, host) => {
            built.push(`${host.host}:${host.port}`);
            return built;
          }, [])
          .join(',');
      }
    }

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
    }

    if (multipleHosts) {
      return util.format(url.format(urlObject), multipleHosts);
    }

    return url.format(urlObject);
  }

  writeConcernMax() {
    if (this.topologyType !== TopologyType.Single) {
      return { writeConcern: { w: 'majority', wtimeout: 30000 } };
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

module.exports = NativeConfiguration;
