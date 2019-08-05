'use strict';
const f = require('util').format;
const url = require('url');
const qs = require('querystring');
const core = require('../lib/core');

class ConfigurationBase {
  constructor(options) {
    this.options = options || {};
    this.host = options.host || 'localhost';
    this.port = options.port || 27017;
    this.db = options.db || 'integration_tests';
    this.mongo = options.mongo;
    this.setName = options.setName || 'rs';
    this.require = this.mongo;
    this.writeConcern = function() {
      return { w: 1 };
    };
  }

}

class NativeConfiguration extends ConfigurationBase {
  constructor(environment) {
    super(environment);

    this.type = 'native';
    this.topology = environment.topology || this.defaultTopology;
    this.environment = environment;

    if (environment.setName) {
      this.replicasetName = environment.setName || 'rs';
    }
  }

  usingUnifiedTopology() {
    return !!process.env.MONGODB_UNIFIED_TOPOLOGY;
  }

  newClient(dbOptions, serverOptions) {
    // support MongoClient contructor form (url, options) for `newClient`
    if (typeof dbOptions === 'string') {
      return new this.mongo.MongoClient(
        dbOptions,
        this.usingUnifiedTopology()
          ? Object.assign({ useUnifiedTopology: true }, serverOptions)
          : serverOptions
      );
    }

    dbOptions = dbOptions || {};
    serverOptions = Object.assign({}, { haInterval: 100 }, serverOptions);
    if (this.usingUnifiedTopology()) serverOptions.useUnifiedTopology = true;

    // Override implementation
    if (this.options.newDbInstance) {
      return this.options.newDbInstance(dbOptions, serverOptions);
    }

    // Set up the options
    const keys = Object.keys(this.options);
    if (keys.indexOf('sslOnNormalPorts') !== -1) serverOptions.ssl = true;

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

    return new this.mongo.MongoClient(connectionString, serverOptions);
  }

  newTopology(host, port, options) {
    options = options || {};
    return this.topology(host, port, options);
  }

  newConnection(host, port, options, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }

    var server = this.topology(host, port, options);
    var errorHandler = function(err) {
      callback(err);
    };

    // Set up connect
    server.once('connect', function() {
      server.removeListener('error', errorHandler);
      callback(null, server);
    });

    server.once('error', errorHandler);

    // Connect
    try {
      server.connect();
    } catch (err) {
      server.removeListener('error', errorHandler);
      callback(err);
    }
  }

  url(username, password) {
    const url = this.options.url || 'mongodb://%slocalhost:27017/' + this.db;

    // Fall back
    const auth = username && password ? f('%s:%s@', username, password) : '';
    return f(url, auth);
  }

  writeConcernMax() {
    return Object.assign({}, this.options.writeConcernMax || { w: 1 });
  }

  server37631Workaround() {
    console.log('[applying SERVER-37631 workaround]');
    const configServers = this.manager.configurationServers.managers;
    const proxies = this.manager.proxies;

    const configServersPromise = configServers.reduce((result, server) => {
      return result.then(() =>
        server.executeCommand('admin.$cmd', { refreshLogicalSessionCacheNow: 1 })
      );
    }, Promise.resolve());

    return configServersPromise.then(() => {
      return proxies.reduce((promise, proxy) => {
        return promise.then(() =>
          proxy.executeCommand('admin.$cmd', { refreshLogicalSessionCacheNow: 1 })
        );
      }, Promise.resolve());
    });
  }
}

module.exports = NativeConfiguration;
