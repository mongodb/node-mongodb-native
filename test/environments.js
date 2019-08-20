'use strict';

const semver = require('semver');
// const path = require('path');
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
  constructor(status) {
    if (status.primary) {
      this.port = parseInt(status.primary.split(':')[1]);
      this.host = status.primary.split(':')[0];
    }
  }
}
// const genReplsetConfig = (port, options) => {
//   return Object.assign(
//     {
//       options: {
//         bind_ip: 'localhost',
//         port: port,
//         dbpath: `${__dirname}/../db/${port}`,
//         setParameter: ['enableTestCommands=1']
//       }
//     },
//     options
//   );
// };
function usingUnifiedTopology() {
  return !!process.env.MONGODB_UNIFIED_TOPOLOGY;
}

class ReplicaSetEnvironment extends EnvironmentBase {
  constructor(parsedURI) {
    super(parsedURI);
    this.setName = 'rs';
    this.url = `mongodb://${this.host}:${this.port}/integration_tests?rs_name=rs`;
    this.writeConcernMax = { w: 'majority', wtimeout: 30000 };
    this.replicasetName = this.setName;
    this.topology = function(topologyHost, topologyPort, options) {
      topologyHost = topologyHost || this.host;
      topologyPort = topologyPort || this.port;
      options = Object.assign({}, options);
      options.poolSize = 1;
      options.autoReconnect = false;
      if (usingUnifiedTopology()) {
        return new core.Topology([{ topologyHost, topologyPort }], options);
      }
      return new core.ReplSet([{ topologyHost, topologyPort }], options);
    };

    // Add back once this.nodes is added back.
    // Do we have 3.2+
    // if (semver.satisfies(version, '>=3.2.0')) {
    //   this.nodes = this.nodes.map(function(x) {
    //     x.options.enableMajorityReadConcern = null;
    //     return x;
    //   });
    // }
  }
}

// function generateNodesArray(hosts, configFunc) {
//   let nodesArray = [];
//   for (let i = 0; i < hosts.length; i++) {
//     nodesArray[i] = configFunc(hosts[i].port || hosts[0].port + i);
//   }
//   return nodesArray;
// }
/**
 *
 */
class SingleEnvironment extends EnvironmentBase {
  constructor(parsedURI) {
    super(parsedURI);
  }
}
// const genShardedConfig = (port, options, shardOptions) => {
//   return Object.assign(
//     {
//       options: {
//         bind_ip: 'localhost',
//         port: port,
//         dbpath: `${__dirname}/../db/${port}`,
//         shardsvr: null
//       }
//     },
//     options,
//     shardOptions
//   );
// };
// const genConfigNode = (port, options) => {
//   return Object.assign(
//     {
//       options: {
//         bind_ip: 'localhost',
//         port: port,
//         dbpath: `${__dirname}/../db/${port}`,
//         setParameter: ['enableTestCommands=1']
//       }
//     },
//     options
//   );
// };
/**
 *
 */
class ShardedEnvironment extends EnvironmentBase {
  constructor(parsedURI, version) {
    super(parsedURI);
    // NOTE: only connect to a single shard because there can be consistency issues using
    //       more, revolving around the inability for shards to keep up-to-date views of
    //       changes to the world (such as dropping a database).
    this.url = `mongodb://${this.host}:${this.port}/integration_tests`;
    this.writeConcernMax = { w: 'majority', wtimeout: 30000 };
    this.topology = (topologyHost, topologyPort, options) => {
      topologyHost = topologyHost || this.host;
      topologyPort = topologyPort || this.port;
      options = options || {};
      if (usingUnifiedTopology()) {
        return new core.Topology([{ topologyHost, topologyPort }], options);
      }
      return new core.Mongos([{ topologyHost, topologyPort }], options);
    };
    this.server37631WorkaroundNeeded = semver.satisfies(version, '3.6.x');
  }
  setup() {
    //const shardOptions = this.options && this.options.shard ? this.options.shard : {};
    // First set of nodes
    //const nodes1 = generateNodesArray(parsedURI.hosts, genShardedConfig);

    //const configOptions = this.options && this.options.config ? this.options.config : {};
    //const configNodes = [genConfigNode(35000, configOptions)];
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
  constructor(parsedURI) {
    super(parsedURI);
    this.sslOnNormalPorts = null;
    this.fork = null;
    this.sslPEMKeyFile = __dirname + '/functional/ssl/server.pem';
    this.url = `mongodb://%s${this.host}:${this.port}/integration_tests?ssl=true&sslValidate=false`;
    this.topology = function(topologyHost, topologyPort, serverOptions) {
      topologyHost = topologyHost || this.host;
      topologyPort = topologyPort || this.port;
      serverOptions = Object.assign({}, serverOptions);
      serverOptions.poolSize = 1;
      serverOptions.ssl = true;
      serverOptions.sslValidate = false;
      return new core.Server(topologyHost, topologyPort, serverOptions);
    };
  }
}
/**
 *
 */
class AuthEnvironment extends EnvironmentBase {
  constructor(parsedURI) {
    super(parsedURI);
    this.url = `mongodb://%s${this.host}:${this.port}/integration_tests`;
    this.topology = function(topologyHost, topologyPort, serverOptions) {
      topologyHost = topologyHost || this.host;
      topologyPort = topologyPort || this.port;
      serverOptions = Object.assign({}, serverOptions);
      serverOptions.poolSize = 1;
      return new core.Server(topologyHost, topologyPort, serverOptions);
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
