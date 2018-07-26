'use strict';

const f = require('util').format;
const semver = require('semver');
const path = require('path');
const EnvironmentBase = require('mongodb-test-runner').EnvironmentBase;

// topologies
const Server = require('..').Server;
const ReplSet = require('..').ReplSet;
const Mongos = require('..').Mongos;

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
    this.topology = function(host, port, serverOptions) {
      host = host || 'localhost';
      port = port || 31000;
      serverOptions = Object.assign({}, serverOptions);
      serverOptions.rs_name = 'rs';
      serverOptions.poolSize = 1;
      serverOptions.autoReconnect = false;

      return new ReplSet([new Server(host, port, serverOptions)], serverOptions);
    };

    this.nodes = [
      genReplsetConfig(31000, { tags: { loc: 'ny' } }),
      genReplsetConfig(31001, { tags: { loc: 'sf' } }),
      genReplsetConfig(31002, { tags: { loc: 'sf' } }),
      genReplsetConfig(31003, { tags: { loc: 'sf' } }),
      genReplsetConfig(31004, { arbiter: true })
    ];

    this.manager = new ReplSetManager('mongod', this.nodes, {
      replSet: 'rs'
    });

    // Do we have 3.2+
    const version = discoverResult.version.join('.');
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
        dbpath: `${__dirname}/../db/${port}`
      }
    },
    options
  );
};

/**
 *
 */
class ShardedEnvironment extends EnvironmentBase {
  constructor() {
    super();

    this.host = 'localhost';
    this.port = 51000;
    this.url = 'mongodb://%slocalhost:51000/integration_tests';
    this.writeConcernMax = { w: 'majority', wtimeout: 30000 };
    this.topology = function(host, port, options) {
      options = options || {};
      options.autoReconnect = false;

      return new Mongos([new Server(host, port, options)], options);
    };

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

    // second set of nodes
    const nodes2 = [
      genShardedConfig(31020, { tags: { loc: 'ny' } }, shardOptions),
      genShardedConfig(31021, { tags: { loc: 'sf' } }, shardOptions),
      genShardedConfig(31022, { arbiter: true }, shardOptions)
    ];

    const configOptions = this.options && this.options.config ? this.options.config : {};
    const configNodes = [
      genConfigNode(35000, configOptions),
      genConfigNode(35001, configOptions),
      genConfigNode(35002, configOptions)
    ];

    let proxyNodes = [
      {
        bind_ip: 'localhost',
        port: 51000,
        configdb: 'localhost:35000,localhost:35001,localhost:35002'
      },
      {
        bind_ip: 'localhost',
        port: 51001,
        configdb: 'localhost:35000,localhost:35001,localhost:35002'
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

    Promise.all([
      this.manager.addShard(nodes1, { replSet: 'rs1' }),
      this.manager.addShard(nodes2, { replSet: 'rs2' })
    ])
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
      return new Server(host, port, serverOptions);
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
      return new Server(host, port, serverOptions);
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
