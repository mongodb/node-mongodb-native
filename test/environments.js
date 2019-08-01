'use strict';

const f = require('util').format;
const semver = require('semver');
const path = require('path');
const EnvironmentBase = require('mongodb-test-runner').EnvironmentBase;
const core = require('../lib/core');

// topology managers
const topologyManagers = require('mongodb-test-runner').topologyManagers;
const ServerManager = topologyManagers.Server;
const ReplSetManager = topologyManagers.ReplSet;
const ShardingManager = topologyManagers.Sharded;

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
  constructor(discoverResult) {
    super();

    this.host = 'localhost';
    this.port = 31000;
    this.setName = 'rs';
    this.url = 'mongodb://%slocalhost:31000/integration_tests?rs_name=rs';
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
    const version = discoverResult.version.join('.');
    if (semver.satisfies(version, '>=3.2.0')) {
      this.nodes = this.nodes.map(function(x) {
        x.options.enableMajorityReadConcern = null;
        return x;
      });
    }

    this.manager = new ReplSetManager('mongod', this.nodes, {
      replSet: 'rs'
    });
  }
}

/**
 *
 */
class SingleEnvironment extends EnvironmentBase {
  constructor() {
    super();

    this.host = 'localhost';
    this.port = 27017;
    this.manager = new ServerManager('mongod', {
      dbpath: path.join(path.resolve('db'), f('data-%d', 27017)),
      setParameter: 'enableTestCommands=1'
    });
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
  constructor(discoverResult) {
    super();

    this.host = 'localhost';
    this.port = 51000;

    // TODO: we used to only connect to a single shard here b/c of consistency issues
    // revolving around the inability for shards to keep up-to-date views of
    // changes to the world (such as dropping a database). However, b/c the unified
    // topology treats a single shard like a Single topology instead of a Sharded
    // topology, we need to use multiple shards as much as possible to ensure that
    // we get sharded test coverage (looking at you transactions tests!)
    this.url = 'mongodb://%slocalhost:51000,localhost:51001/integration_tests';

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

    const version =
      discoverResult && discoverResult.version ? discoverResult.version.join('.') : null;
    this.server37631WorkaroundNeeded = semver.satisfies(version, '3.6.x');
    this.manager = new ShardingManager({
      mongod: 'mongod',
      mongos: 'mongos'
    });
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

    Promise.all([this.manager.addShard(nodes1, { replSet: 'rs1' })])
      .then(() => this.manager.addConfigurationServers(configNodes, { replSet: 'rs3' }))
      .then(() => this.manager.addProxies(proxyNodes, { binary: 'mongos' }))
      .then(() => callback())
      .catch(err => callback(err));
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

    this.manager = new ServerManager('mongod', {
      dbpath: path.join(path.resolve('db'), f('data-%d', 27017)),
      sslOnNormalPorts: null,
      sslPEMKeyFile: __dirname + '/functional/ssl/server.pem',
      setParameter: ['enableTestCommands=1']
    });
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

    this.manager = new ServerManager('mongod', {
      dbpath: path.join(path.resolve('db'), f('data-%d', 27017)),
      auth: null
    });
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
