'use strict';
const ConfigurationBase = require('mongodb-test-runner').ConfigurationBase;
const f = require('util').format;
const url = require('url');
const qs = require('querystring');
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

  defaultTopology(serverHost, serverPort, serverOpts, _mongo) {
    return new _mongo.Server(serverHost, serverPort, serverOpts || {});
  }

  usingUnifiedTopology() {
    return !!process.env.MONGODB_UNIFIED_TOPOLOGY;
  }

  start(callback) {
    const self = this;
    if (this.skipStart) return callback();

    const client = this.newClient({}, { host: self.host, port: self.port });
    this.manager
      .purge()
      .then(function() {
        console.log('[purge the directories]');
        return self.manager.start();
      })
      .then(() => {
        if (this.environment.server37631WorkaroundNeeded) {
          return this.server37631Workaround();
        }
      })
      .then(function() {
        console.log('[started the topology]');
        return client.connect();
      })
      .then(function() {
        console.log('[get connection to topology]');
        return client.db(self.db).dropDatabase();
      })
      .then(function() {
        console.log('[dropped database]');
        return client.close();
      })
      .then(function() {
        callback(null);
      })
      .catch(function(err) {
        callback(err, null);
      });
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

  url(username, password) {
    const url = this.options.url || 'mongodb://%slocalhost:27017/' + this.db;

    // Fall back
    const auth = username && password ? f('%s:%s@', username, password) : '';
    return f(url, auth);
  }

  writeConcern() {
    return Object.assign({}, this.options.writeConcern || { w: 1 });
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
