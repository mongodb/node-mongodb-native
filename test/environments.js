var f = require('util').format;
var semver = require('semver');
var path = require('path');

// topologies
var Server = require('..').Server,
  ReplSet = require('..').ReplSet,
  Mongos = require('..').Mongos;

// topology managers
var ServerManager = require('mongodb-topology-manager').Server,
  ReplSetManager = require('mongodb-topology-manager').ReplSet,
  ShardingManager = require('mongodb-topology-manager').Sharded;

// utilities
var clone = function(obj) {
  var copy = {};
  for (var name in obj) copy[name] = obj[name];
  return copy;
};

/**
 *
 * @param {*} discoverResult
 */
var replicaSetEnvironment = function(discoverResult) {
  var nodes = [
    {
      tags: { loc: 'ny' },
      options: {
        bind_ip: 'localhost',
        port: 31000,
        dbpath: f('%s/../db/31000', __dirname),
        setParameter: ['enableTestCommands=1']
      }
    },
    {
      tags: { loc: 'sf' },
      options: {
        bind_ip: 'localhost',
        port: 31001,
        dbpath: f('%s/../db/31001', __dirname),
        setParameter: ['enableTestCommands=1']
      }
    },
    {
      tags: { loc: 'sf' },
      options: {
        bind_ip: 'localhost',
        port: 31002,
        dbpath: f('%s/../db/31002', __dirname),
        setParameter: ['enableTestCommands=1']
      }
    },
    {
      tags: { loc: 'sf' },
      priority: 0,
      options: {
        bind_ip: 'localhost',
        port: 31003,
        dbpath: f('%s/../db/31003', __dirname),
        setParameter: ['enableTestCommands=1']
      }
    },
    {
      arbiter: true,
      options: {
        bind_ip: 'localhost',
        port: 31004,
        dbpath: f('%s/../db/31004', __dirname),
        setParameter: ['enableTestCommands=1']
      }
    }
  ];

  // Do we have 3.2+
  var version = discoverResult.version.join('.');
  if (semver.satisfies(version, '>=3.2.0')) {
    nodes = nodes.map(function(x) {
      x.options.enableMajorityReadConcern = null;
      return x;
    });
  }

  return {
    host: 'localhost',
    port: 31000,
    setName: 'rs',
    url: 'mongodb://%slocalhost:31000/integration_tests?rs_name=rs',
    writeConcernMax: { w: 'majority', wtimeout: 30000 },
    replicasetName: 'rs',
    topology: function(host, port, serverOptions) {
      host = host || 'localhost';
      port = port || 31000;
      serverOptions = clone(serverOptions);
      serverOptions.rs_name = 'rs';
      serverOptions.poolSize = 1;
      serverOptions.autoReconnect = false;

      return new ReplSet([new Server(host, port, serverOptions)], serverOptions);
    },
    manager: new ReplSetManager('mongod', nodes, {
      replSet: 'rs'
    })
  };
};

/**
 *
 */
var singleEnvironment = function() {
  return {
    host: 'localhost',
    port: 27017,
    manager: new ServerManager('mongod', {
      dbpath: path.join(path.resolve('db'), f('data-%d', 27017)),
      setParameter: 'enableTestCommands=1'
    })
  };
};

/**
 *
 */
var shardedEnvironment = function() {
  var shardingManager = new ShardingManager({
    mongod: 'mongod',
    mongos: 'mongos'
  });

  // First set of nodes
  var nodes1 = [
    {
      tags: { loc: 'ny' },
      options: {
        bind_ip: 'localhost',
        port: 31010,
        dbpath: f('%s/../db/31000', __dirname),
        shardsvr: null
      }
    },
    {
      tags: { loc: 'sf' },
      options: {
        bind_ip: 'localhost',
        port: 31011,
        dbpath: f('%s/../db/31001', __dirname),
        shardsvr: null
      }
    },
    {
      // Type of node
      arbiter: true,
      // mongod process options
      options: {
        bind_ip: 'localhost',
        port: 31012,
        dbpath: f('%s/../db/31002', __dirname),
        shardsvr: null
      }
    }
  ];

  // second set of nodes
  var nodes2 = [
    {
      tags: { loc: 'ny' },
      options: {
        bind_ip: 'localhost',
        port: 31020,
        dbpath: f('%s/../db/31010', __dirname),
        shardsvr: null
      }
    },
    {
      tags: { loc: 'sf' },
      options: {
        bind_ip: 'localhost',
        port: 31021,
        dbpath: f('%s/../db/31011', __dirname),
        shardsvr: null
      }
    },
    {
      // Type of node
      arbiter: true,
      // mongod process options
      options: {
        bind_ip: 'localhost',
        port: 31022,
        dbpath: f('%s/../db/31012', __dirname),
        shardsvr: null
      }
    }
  ];

  var configNodes = [
    {
      options: {
        bind_ip: 'localhost',
        port: 35000,
        dbpath: f('%s/../db/35000', __dirname)
      }
    },
    {
      options: {
        bind_ip: 'localhost',
        port: 35001,
        dbpath: f('%s/../db/35001', __dirname)
      }
    },
    {
      options: {
        bind_ip: 'localhost',
        port: 35002,
        dbpath: f('%s/../db/35002', __dirname)
      }
    }
  ];

  var proxyNodes = [
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
  var self = this;
  nodes1 = nodes1.map(function(x) {
    if (self.options && self.options.shard) {
      for (var name in self.options.shard) {
        x.options[name] = self.options.shard[name];
      }
    }

    return x;
  });

  nodes2 = nodes2.map(function(x) {
    if (self.options && self.options.shard) {
      for (var name in self.options.shard) {
        x.options[name] = self.options.shard[name];
      }
    }

    return x;
  });

  configNodes = configNodes.map(function(x) {
    if (self.options && self.options.config) {
      for (var name in self.options.config) {
        x.options[name] = self.options.config[name];
      }
    }

    return x;
  });

  proxyNodes = proxyNodes.map(function(x) {
    if (self.options && self.options.proxy) {
      for (var name in self.options.proxy) {
        x[name] = self.options.proxy[name];
      }
    }

    return x;
  });

  shardingManager.addShard(nodes1, { replSet: 'rs1' });
  shardingManager.addShard(nodes2, { replSet: 'rs2' });
  shardingManager.addConfigurationServers(configNodes, { replSet: 'rs3' });
  shardingManager.addProxies(proxyNodes, { binary: 'mongos' });

  return {
    host: 'localhost',
    port: 51000,
    url: 'mongodb://%slocalhost:51000/integration_tests',
    writeConcernMax: { w: 'majority', wtimeout: 30000 },
    topology: function(host, port, options) {
      options = options || {};
      options.autoReconnect = false;

      return new Mongos([new Server(host, port, options)], options);
    },
    manager: shardingManager
  };
};

/**
 *
 */
var sslEnvironment = function() {
  return {
    sslOnNormalPorts: null,
    fork: null,
    sslPEMKeyFile: __dirname + '/functional/ssl/server.pem',
    url: 'mongodb://%slocalhost:27017/integration_tests?ssl=true&sslValidate=false',
    topology: function(host, port, serverOptions) {
      host = host || 'localhost';
      port = port || 27017;
      serverOptions = clone(serverOptions);
      serverOptions.poolSize = 1;
      serverOptions.ssl = true;
      serverOptions.sslValidate = false;
      return new Server(host, port, serverOptions);
    },
    manager: new ServerManager('mongod', {
      dbpath: path.join(path.resolve('db'), f('data-%d', 27017)),
      sslOnNormalPorts: null,
      sslPEMKeyFile: __dirname + '/functional/ssl/server.pem',
      setParameter: ['enableTestCommands=1']
    })
  };
};

/**
 *
 */
var authEnvironment = function() {
  return {
    url: 'mongodb://%slocalhost:27017/integration_tests',
    topology: function(host, port, serverOptions) {
      host = host || 'localhost';
      port = port || 27017;
      serverOptions = clone(serverOptions);
      serverOptions.poolSize = 1;
      return new Server(host, port, serverOptions);
    },
    manager: new ServerManager('mongod', {
      dbpath: path.join(path.resolve('db'), f('data-%d', 27017)),
      auth: null
    })
  };
};

module.exports = {
  single: singleEnvironment,
  replicaset: replicaSetEnvironment,
  sharded: shardedEnvironment,
  ssl: sslEnvironment,
  auth: authEnvironment,

  // informational aliases
  kerberos: singleEnvironment,
  ldap: singleEnvironment,
  sni: singleEnvironment
};
