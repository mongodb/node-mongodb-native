'use strict';
const url = require('url');
const qs = require('querystring');

const MongoClient = require('../../lib/mongo_client');
const TopologyType = require('../../lib/core/sdam/topology_description').TopologyType;
const core = require('../../lib/core');

class NativeConfiguration {
  constructor(parsedURI, context) {
    this.topologyType = context.topologyType;

    // this.options = environment || {};
    // this.host = environment.host || 'localhost';
    // this.port = environment.port || 27017;
    // this.db = environment.db || 'integration_tests';
    // this.setName = environment.setName || 'rs';
    // this.writeConcern = function() {
    //   return { w: 1 };
    // };

    // this.topology = environment.topology || this.defaultTopology;
    // this.environment = environment;
    // if (environment.setName) {
    //   this.replicasetName = environment.setName || 'rs';
    // }
  }

  usingUnifiedTopology() {
    return !!process.env.MONGODB_UNIFIED_TOPOLOGY;
  }

  newClient(dbOptions, serverOptions) {
    // support MongoClient contructor form (url, options) for `newClient`
    if (typeof dbOptions === 'string') {
      return new MongoClient(
        dbOptions,
        this.usingUnifiedTopology()
          ? Object.assign({ useUnifiedTopology: true }, serverOptions)
          : serverOptions
      );
    }

    dbOptions = dbOptions || {};
    serverOptions = Object.assign({}, { haInterval: 100 }, serverOptions);
    if (this.usingUnifiedTopology()) {
      serverOptions.useUnifiedTopology = true;
    }

    // Set up the options
    const keys = Object.keys(this.options);
    if (keys.indexOf('sslOnNormalPorts') !== -1) {
      serverOptions.ssl = true;
    }

    // Fall back
    let dbHost = (serverOptions && serverOptions.host) || 'localhost';
    const dbPort = (serverOptions && serverOptions.port) || this.options.port || 27017;
    if (dbHost.indexOf('.sock') !== -1) {
      dbHost = qs.escape(dbHost);
    }

    if (this.options.setName) {
      Object.assign(dbOptions, { replicaSet: this.options.setName, auto_reconnect: false });
    }

    const connectionString = url.format({
      protocol: 'mongodb',
      slashes: true,
      hostname: dbHost,
      port: dbPort,
      query: dbOptions,
      pathname: '/'
    });

    return new MongoClient(connectionString, serverOptions);
  }

  newTopology(host, port, options) {
    options = Object.assign({}, options);
    if (this.usingUnifiedTopology()) {
      return new core.Topology([{ host, port }], options);
    }

    if (this.topologyType === TopologyType.ReplicaSetWithPrimary) {
      options.poolSize = 1;
      options.autoReconnect = false;
      return new core.ReplSet([{ host, port }], options);
    }

    if (this.topologyType === TopologyType.Sharded) {
      return new core.Mongos([{ host, port }], options);
    }

    return core.Server(host, port, options);
  }

  // url(username, password) {
  //   const url = this.options.url || 'mongodb://%slocalhost:27017/' + this.db;

  //   // Fall back
  //   const auth = username && password ? f('%s:%s@', username, password) : '';
  //   return f(url, auth);
  // }

  writeConcernMax() {
    if (this.topologyType !== TopologyType.Single) {
      return { w: 'majority', wtimeout: 30000 };
    }

    return { w: 1 };
  }

  // server37631Workaround() {
  //   console.log('[applying SERVER-37631 workaround]');
  //   const configServers = this.manager.configurationServers.managers;
  //   const proxies = this.manager.proxies;
  //   const configServersPromise = configServers.reduce((result, server) => {
  //     return result.then(() =>
  //       server.executeCommand('admin.$cmd', { refreshLogicalSessionCacheNow: 1 })
  //     );
  //   }, Promise.resolve());

  //   return configServersPromise.then(() => {
  //     return proxies.reduce((promise, proxy) => {
  //       return promise.then(() =>
  //         proxy.executeCommand('admin.$cmd', { refreshLogicalSessionCacheNow: 1 })
  //       );
  //     }, Promise.resolve());
  //   });
  // }
}

module.exports = NativeConfiguration;
