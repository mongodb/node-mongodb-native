'use strict';
const url = require('url');
const qs = require('querystring');

const MongoClient = require('../../lib/mongo_client');
const TopologyType = require('../../lib/core/sdam/topology_description').TopologyType;
const core = require('../../lib/core');

class NativeConfiguration {
  constructor(parsedURI, context) {
    this.topologyType = context.topologyType;
    this.options = Object.assign(
      {
        host: parsedURI.hosts[0] ? parsedURI.hosts[0].host : 'localhost',
        port: parsedURI.hosts[0] ? parsedURI.hosts[0].port : 27017,
        db: parsedURI.auth && parsedURI.auth.db ? parsedURI.auth.db : 'integration_tests'
      },
      parsedURI.options
    );

    // this.options = environment || {};
    // this.host = environment.host || 'localhost';
    // this.port = environment.port || 27017;
    // this.db = environment.db || 'integration_tests';
    // this.setName = environment.setName || 'rs';

    // this.topology = environment.topology || this.defaultTopology;
    // this.environment = environment;
    // if (environment.setName) {
    //   this.replicasetName = environment.setName || 'rs';
    // }

    this.mongo = this.require = require('../..');
    this.writeConcern = function() {
      return { w: 1 };
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

  usingUnifiedTopology() {
    return !!process.env.MONGODB_UNIFIED_TOPOLOGY;
  }

  newClient(dbOptions, serverOptions) {
    // console.trace('newClient');

    if (typeof dbOptions === 'string') {
      return new MongoClient(
        dbOptions,
        this.usingUnifiedTopology()
          ? Object.assign({ useUnifiedTopology: true }, serverOptions)
          : serverOptions
      );
    }

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

    // // Set up the options
    // const keys = Object.keys(this.options);
    // if (keys.indexOf('sslOnNormalPorts') !== -1) {
    //   serverOptions.ssl = true;
    // }

    // Fall back
    let dbHost = (serverOptions && serverOptions.host) || this.options.host;
    const dbPort = (serverOptions && serverOptions.port) || this.options.port;
    if (dbHost.indexOf('.sock') !== -1) {
      dbHost = qs.escape(dbHost);
    }

    if (this.options.replicaSet) {
      Object.assign(dbOptions, { replicaSet: this.options.replicaSet, auto_reconnect: false });
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

  url(username, password) {
    const urlObject = {
      protocol: 'mongodb',
      slashes: true,
      hostname: this.options.host,
      port: this.options.port,
      pathname: `/${this.options.db}`
    };

    if (username || password) {
      urlObject.auth = password == null ? username : `${username}:${password}`;
    }

    return url.format(urlObject);
  }

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
