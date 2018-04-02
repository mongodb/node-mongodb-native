'use strict';
const ConfigurationBase = require('mongodb-test-runner').ConfigurationBase;
const f = require('util').format;

class NativeConfiguration extends ConfigurationBase {
  constructor(options) {
    super(options);

    this.type = 'native';
    this.topology = options.topology || this.defaultTopology;
    this.replicasetName = options.replicasetName || 'rs';
  }

  defaultTopology(serverHost, serverPort, serverOpts, _mongo) {
    return new _mongo.Server(serverHost, serverPort, serverOpts || {});
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
    serverOptions = serverOptions || {};
    // Override implementation
    if (this.options.newDbInstance) {
      return this.options.newDbInstance(dbOptions, serverOptions);
    }

    // Set up the options
    const keys = Object.keys(this.options);
    if (keys.indexOf('sslOnNormalPorts') !== -1) serverOptions.ssl = true;

    // Fall back
    // const dbHost = (serverOptions && serverOptions.host) || 'localhost';
    // const dbPort = (serverOptions && serverOptions.port) || this.options.port || 27017;

    // // Default topology
    // const DbTopology = this.options.topology ? this.options.topology : this.mongo.Server;
    // const topology =
    //   DbTopology === this.mongo.Server
    //     ? new DbTopology(dbHost, dbPort, serverOptions, this.mongo)
    //     : new DbTopology([new this.mongo.Server(dbHost, dbPort, serverOptions)], serverOptions);

    // Return a new MongoClient instance
    return new this.mongo.MongoClient(this.url(), Object.assign({}, dbOptions, serverOptions));
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
}

module.exports = NativeConfiguration;
