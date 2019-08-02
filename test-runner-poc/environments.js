'use strict';

const f = require('util').format;
const semver = require('semver');
const path = require('path');
const core = require('../lib/core');

/**
 * Base class for environments in projects that use the test
 * runner
 */
class EnvironmentBase {
  /**
   * The default implementation of the environment setup
   *
   * @param {*} callback
   */
  setup(callback) {
    callback();
  }
}

const genReplsetConfig = (port, options) => {
  return Object.assign(
    {
      options: {
        bind_ip: 'localhost',
        port: port,
        dbpath: `${__dirname}/../db/${port}`,
        setParameter: ['enableTestCommands=1']
      }
    },
    options
  );
};

function usingUnifiedTopology() {
  return !!process.env.MONGODB_UNIFIED_TOPOLOGY;
}

/**
 *
 * @param {*} discoverResult
 */
class ReplicaSetEnvironment extends EnvironmentBase {
  constructor(version) {
    super();

    this.setName = 'replset';
    this.writeConcernMax = { w: 'majority', wtimeout: 30000 };
    this.replicasetName = 'rs';
    this.topology = function(host, port, options) {
      host = host || 'localhost';
      port = port || 31000;
      options = Object.assign({}, options);
      options.replicaSet = 'rs';
      options.poolSize = 1;
      options.autoReconnect = false;

      if (usingUnifiedTopology()) {
        return new core.Topology([{ host, port }], options);
      }

      return new core.ReplSet([{ host, port }], options);
    };

    this.nodes = [
      genReplsetConfig(31000, { tags: { loc: 'ny' } }),
      genReplsetConfig(31001, { tags: { loc: 'sf' } }),
      genReplsetConfig(31002, { tags: { loc: 'sf' } }),
      genReplsetConfig(31003, { tags: { loc: 'sf' } }),
      genReplsetConfig(31004, { arbiter: true })
    ];

    // Do we have 3.2+
    if (semver.satisfies(version, '>=3.2.0')) {
      this.nodes = this.nodes.map(function(x) {
        x.options.enableMajorityReadConcern = null;
        return x;
      });
    }

  }
}

/**
 *
 */
class SingleEnvironment extends EnvironmentBase {
  constructor() {
    super();
  }
}

const genShardedConfig = (port, options, shardOptions) => {
  return Object.assign(
    {
      options: {
        bind_ip: 'localhost',
        port: port,
        dbpath: `${__dirname}/../db/${port}`,
        shardsvr: null
      }
    },
    options,
    shardOptions
  );
};

const genConfigNode = (port, options) => {
  return Object.assign(
    {
      options: {
        bind_ip: 'localhost',
        port: port,
        dbpath: `${__dirname}/../db/${port}`,
        setParameter: ['enableTestCommands=1']
      }
    },
    options
  );
};

/**
 *
 */
class ShardedEnvironment extends EnvironmentBase {
  constructor(version) {
    super();

    this.writeConcernMax = { w: 'majority', wtimeout: 30000 };
    this.topology = (host, port, options) => {
      host = host || 'localhost';
      port = port || 51000;
      options = options || {};

      if (usingUnifiedTopology()) {
        return new core.Topology([{ host, port }], options);
      }

      return new core.Mongos([{ host, port }], options);
    };

    this.server37631WorkaroundNeeded = semver.satisfies(version, '3.6.x');

  }

  setup(callback) {
    const shardOptions = this.options && this.options.shard ? this.options.shard : {};

    // First set of nodes
    const nodes1 = [
      genShardedConfig(31010, { tags: { loc: 'ny' } }, shardOptions),
      genShardedConfig(31011, { tags: { loc: 'sf' } }, shardOptions),
      genShardedConfig(31012, { arbiter: true }, shardOptions)
    ];

    const configOptions = this.options && this.options.config ? this.options.config : {};
    const configNodes = [genConfigNode(35000, configOptions)];

    let proxyNodes = [
      {
        bind_ip: 'localhost',
        port: 51000,
        configdb: 'localhost:35000,localhost:35001,localhost:35002',
        setParameter: ['enableTestCommands=1']
      },
      {
        bind_ip: 'localhost',
        port: 51001,
        configdb: 'localhost:35000,localhost:35001,localhost:35002',
        setParameter: ['enableTestCommands=1']
      }
    ];

    // Additional mapping
    const self = this;
    proxyNodes = proxyNodes.map(function(x) {
      if (self.options && self.options.proxy) {
        for (let name in self.options.proxy) {
          x[name] = self.options.proxy[name];
        }
      }

      return x;
    });

    this.proxies = proxyNodes.map(proxy => {
      return { host: proxy.bind_ip, port: proxy.port };
    });

  }
}

/**
 *
 */
class SslEnvironment extends EnvironmentBase {
  constructor() {
    super();

    this.sslOnNormalPorts = null;
    this.fork = null;
    this.sslPEMKeyFile = __dirname + '/functional/ssl/server.pem';
    this.url = 'mongodb://%slocalhost:27017/integration_tests?ssl=true&sslValidate=false';
    this.topology = function(host, port, serverOptions) {
      host = host || 'localhost';
      port = port || 27017;
      serverOptions = Object.assign({}, serverOptions);
      serverOptions.poolSize = 1;
      serverOptions.ssl = true;
      serverOptions.sslValidate = false;
      return new core.Server(host, port, serverOptions);
    };

  }
}

/**
 *
 */
class AuthEnvironment extends EnvironmentBase {
  constructor() {
    super();

    this.url = 'mongodb://%slocalhost:27017/integration_tests';
    this.topology = function(host, port, serverOptions) {
      host = host || 'localhost';
      port = port || 27017;
      serverOptions = Object.assign({}, serverOptions);
      serverOptions.poolSize = 1;
      return new core.Server(host, port, serverOptions);
    };

  }
}

module.exports = {
  single: SingleEnvironment,
  replicaset: ReplicaSetEnvironment,
  sharded: ShardedEnvironment,
  ssl: SslEnvironment,
  auth: AuthEnvironment,

  // informational aliases
  kerberos: SingleEnvironment,
  ldap: SingleEnvironment,
  sni: SingleEnvironment,

  // for compatability with evergreen template
  server: SingleEnvironment,
  replica_set: ReplicaSetEnvironment,
  sharded_cluster: ShardedEnvironment
};
